// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import {
	AlreadyExistsError,
	Coerce,
	ComponentFactory,
	Converter,
	GeneralError,
	Guards,
	Is,
	LfuCache,
	Mutex,
	NotFoundError,
	RandomHelper
} from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type ITelemetryConnector,
	type ITelemetryMetric,
	type ITelemetryMetricValue,
	MetricCounterOperation,
	MetricType
} from "@twin.org/telemetry-models";
import type { TelemetryMetric } from "./entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import type { IBatchMetricValueEntry } from "./models/IBatchMetricValueEntry.js";
import type { IEntityStorageTelemetryConnectorConstructorOptions } from "./models/IEntityStorageTelemetryConnectorConstructorOptions.js";
import type { ILastMetricValue } from "./models/ILastMetricValue.js";
import type { IPendingTrim } from "./models/IPendingTrim.js";

/**
 * Class for performing telemetry operations in entity storage.
 */
export class EntityStorageTelemetryConnector implements ITelemetryConnector {
	/**
	 * The namespace supported by the telemetry connector.
	 */
	public static readonly NAMESPACE: string = "entity-storage";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<EntityStorageTelemetryConnector>();

	/**
	 * Default number of entries to accumulate before flushing.
	 */
	public static readonly DEFAULT_BATCH_SIZE: number = 10;

	/**
	 * Default interval in milliseconds between automatic flushes.
	 */
	public static readonly DEFAULT_BATCH_INTERVAL_MS: number = 5000;

	/**
	 * Default maximum number of entries to hold in the in-memory cache.
	 */
	public static readonly DEFAULT_MAX_CACHE_SIZE: number = 1000;

	/**
	 * Maximum number of metric definitions to hold in the in-memory definition cache.
	 * Matches the last value cache capacity, as both are keyed by partition and metric id.
	 */
	public static readonly DEFAULT_METRIC_DEFINITION_CACHE_CAPACITY: number = 1000;

	/**
	 * Time-to-idle in milliseconds for cached metric definitions.
	 * Metric definitions are immutable once registered; a long TTI keeps active
	 * metrics cached without permanent references.
	 */
	public static readonly DEFAULT_METRIC_DEFINITION_CACHE_TTI_MS: number = 3_600_000;

	/**
	 * Default maximum number of metrics whose last value is held in memory.
	 */
	public static readonly DEFAULT_LAST_VALUE_CACHE_CAPACITY: number = 1000;

	/**
	 * Default largest maxHistory for which the retained value ids are tracked in memory.
	 * Above this the trim falls back to scanning storage rather than holding a long id list.
	 */
	public static readonly DEFAULT_MAX_TRACKED_HISTORY: number = 1000;

	/**
	 * Default time-to-idle in milliseconds for cached last values.
	 * Matches the metric definition cache, as both are keyed by partition and metric id.
	 */
	public static readonly DEFAULT_LAST_VALUE_CACHE_TTI_MS: number = 3_600_000;

	/**
	 * Default total number of retained value ids held across all metrics.
	 * Caps history tracking by the memory it actually uses rather than by metric count.
	 */
	public static readonly DEFAULT_TRACKED_HISTORY_BUDGET: number = 50_000;

	/**
	 * Longest gap between sweeps for idle last values, clamped down to the configured
	 * time-to-idle. Keeps the sweep off the hot path without letting expiry drift.
	 * @internal
	 */
	private static readonly _LAST_VALUE_SWEEP_INTERVAL_MS = 60_000;

	/**
	 * Page size used when scanning for values to trim.
	 * Large enough to cover most histories in one or two pages without overwhelming storage.
	 * @internal
	 */
	private static readonly _TRIM_PAGE_SIZE = 1000;

	/**
	 * The entity storage for the telemetry metrics.
	 * @internal
	 */
	private readonly _metricStorage: IEntityStorageConnector<TelemetryMetric>;

	/**
	 * The entity storage for the telemetry metric values.
	 * @internal
	 */
	private readonly _metricValueStorage: IEntityStorageConnector<TelemetryMetricValue>;

	/**
	 * The component for logging.
	 * @internal
	 */
	private readonly _logging?: ILoggingComponent;

	/**
	 * The timeout in milliseconds when acquiring a mutex lock.
	 * @internal
	 */
	private readonly _mutexTimeoutMs?: number;

	/**
	 * Flush when the cache reaches this size; undefined or <= 1 disables size-based flushing.
	 * @internal
	 */
	private readonly _batchSize?: number;

	/**
	 * Flush every this many milliseconds; undefined or <= 0 disables timer-based flushing.
	 * @internal
	 */
	private readonly _batchIntervalMs?: number;

	/**
	 * Maximum entries to keep after a failed flush re-queue; 0 means unlimited.
	 * @internal
	 */
	private readonly _maxCacheSize: number;

	/**
	 * Unique key used to serialise concurrent flush calls via Mutex.
	 * @internal
	 */
	private readonly _mutexKey: string;

	/**
	 * Entries waiting to be written to storage.
	 * @internal
	 */
	private readonly _batchCache: IBatchMetricValueEntry[];

	/**
	 * Last computed value per partition context + metric id, used to chain increments without a
	 * storage read. Populated by both the batched and unbatched write paths. When the metric has a
	 * trackable maxHistory the retained value ids are held alongside it so trimming needs no read.
	 * @internal
	 */
	private readonly _lastValue: Map<string, ILastMetricValue>;

	/**
	 * Maximum entries to retain in the last value cache; 0 means unlimited.
	 * @internal
	 */
	private readonly _lastValueCacheCapacity: number;

	/**
	 * Time-to-idle in milliseconds for cached last values; 0 disables expiry.
	 * @internal
	 */
	private readonly _lastValueCacheTtiMs: number;

	/**
	 * Time the idle last values were last swept.
	 * @internal
	 */
	private _lastValueSweepMs: number;

	/**
	 * Largest maxHistory for which retained value ids are tracked in memory.
	 * @internal
	 */
	private readonly _maxTrackedHistory: number;

	/**
	 * Total retained value ids allowed across all metrics; 0 means unlimited.
	 * @internal
	 */
	private readonly _trackedHistoryBudget: number;

	/**
	 * Total retained value ids currently held across all metrics.
	 * @internal
	 */
	private _trackedHistoryCount: number;

	/**
	 * Handle for the interval timer, present only while the connector is running.
	 * @internal
	 */
	private _batchTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Is the service running.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Capacity used when constructing the metric definition cache.
	 * @internal
	 */
	private readonly _metricDefinitionCacheCapacity: number;

	/**
	 * Time-to-idle in milliseconds used when constructing the metric definition cache.
	 * @internal
	 */
	private readonly _metricDefinitionCacheTtiMs: number;

	/**
	 * In-memory cache of metric definitions, keyed by partition context + metric id.
	 * Avoids a storage read on every addMetricValue call.
	 * @internal
	 */
	private _metricDefinitionCache: LfuCache<TelemetryMetric>;

	/**
	 * Create a new instance of EntityStorageTelemetryConnector.
	 * @param options The options for the connector.
	 */
	constructor(options?: IEntityStorageTelemetryConnectorConstructorOptions) {
		this._metricStorage = EntityStorageConnectorFactory.get(
			options?.telemetryMetricStorageConnectorType ?? "telemetry-metric"
		);
		this._metricValueStorage = EntityStorageConnectorFactory.get(
			options?.telemetryMetricValueStorageConnectorType ?? "telemetry-metric-value"
		);

		this._logging = ComponentFactory.getIfExists(options?.loggingComponentType);
		this._mutexTimeoutMs = Coerce.integer(options?.config?.mutexTimeoutMs);

		const cfgBatchSize =
			Coerce.integer(options?.config?.batchSize) ??
			EntityStorageTelemetryConnector.DEFAULT_BATCH_SIZE;
		this._batchSize = cfgBatchSize > 1 ? cfgBatchSize : undefined;

		const cfgIntervalMs =
			Coerce.integer(options?.config?.batchIntervalMs) ??
			EntityStorageTelemetryConnector.DEFAULT_BATCH_INTERVAL_MS;
		this._batchIntervalMs = cfgIntervalMs > 0 ? cfgIntervalMs : undefined;

		const cfgMaxCacheSize =
			Coerce.integer(options?.config?.maxCacheSize) ??
			EntityStorageTelemetryConnector.DEFAULT_MAX_CACHE_SIZE;
		this._maxCacheSize = cfgMaxCacheSize > 0 ? cfgMaxCacheSize : 0;

		const cfgLastValueCacheCapacity =
			Coerce.integer(options?.config?.lastValueCacheCapacity) ??
			EntityStorageTelemetryConnector.DEFAULT_LAST_VALUE_CACHE_CAPACITY;
		this._lastValueCacheCapacity = cfgLastValueCacheCapacity > 0 ? cfgLastValueCacheCapacity : 0;

		const cfgLastValueCacheTtiMs =
			Coerce.integer(options?.config?.lastValueCacheTtiMs) ??
			EntityStorageTelemetryConnector.DEFAULT_LAST_VALUE_CACHE_TTI_MS;
		this._lastValueCacheTtiMs = cfgLastValueCacheTtiMs > 0 ? cfgLastValueCacheTtiMs : 0;
		this._lastValueSweepMs = Date.now();

		const cfgMaxTrackedHistory =
			Coerce.integer(options?.config?.maxTrackedHistory) ??
			EntityStorageTelemetryConnector.DEFAULT_MAX_TRACKED_HISTORY;
		this._maxTrackedHistory = cfgMaxTrackedHistory > 0 ? cfgMaxTrackedHistory : 0;

		const cfgTrackedHistoryBudget =
			Coerce.integer(options?.config?.trackedHistoryBudget) ??
			EntityStorageTelemetryConnector.DEFAULT_TRACKED_HISTORY_BUDGET;
		this._trackedHistoryBudget = cfgTrackedHistoryBudget > 0 ? cfgTrackedHistoryBudget : 0;
		this._trackedHistoryCount = 0;

		this._mutexKey = RandomHelper.generateUuidV7("compact");
		this._batchCache = [];
		this._lastValue = new Map();
		this._started = false;
		this._metricDefinitionCacheCapacity =
			Coerce.integer(options?.config?.metricDefinitionCacheCapacity) ??
			EntityStorageTelemetryConnector.DEFAULT_METRIC_DEFINITION_CACHE_CAPACITY;
		this._metricDefinitionCacheTtiMs =
			Coerce.integer(options?.config?.metricDefinitionCacheTtiMs) ??
			EntityStorageTelemetryConnector.DEFAULT_METRIC_DEFINITION_CACHE_TTI_MS;
		this._metricDefinitionCache = new LfuCache({
			capacity: this._metricDefinitionCacheCapacity,
			ttiMs: this._metricDefinitionCacheTtiMs
		});
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return EntityStorageTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Start the connector; sets up the interval timer when batchIntervalMs is configured.
	 * @returns A promise that resolves when the connector is ready to accept metric values.
	 */
	public async start(): Promise<void> {
		if (!this._started) {
			this._started = true;
			this._metricDefinitionCache = new LfuCache({
				capacity: this._metricDefinitionCacheCapacity,
				ttiMs: this._metricDefinitionCacheTtiMs
			});
			this.startTimer();
		}
	}

	/**
	 * Stop the connector; flushes any remaining cached entries and clears the timer.
	 * @returns A promise that resolves when the final flush completes and the timer is cleared.
	 */
	public async stop(): Promise<void> {
		if (this._started) {
			this._started = false;
			this.stopTimer();
		}
		await this.flush();
		this._metricDefinitionCache.destroy();
		this._lastValue.clear();
		this._trackedHistoryCount = 0;
		this._lastValueSweepMs = Date.now();
	}

	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been created.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {
		Guards.object<ITelemetryMetric>(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.label),
			metric.label
		);
		Guards.arrayOneOf(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.type),
			metric.type,
			Object.values(MetricType)
		);

		if (Is.notEmpty(metric.description)) {
			Guards.string(
				EntityStorageTelemetryConnector.CLASS_NAME,
				nameof(metric.description),
				metric.description
			);
		}
		if (Is.notEmpty(metric.unit)) {
			Guards.string(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.unit), metric.unit);
		}
		if (Is.notEmpty(metric.maxHistory)) {
			if (!Is.integer(metric.maxHistory) || metric.maxHistory <= 0) {
				throw new GeneralError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"maxHistoryMustBePositiveInteger"
				);
			}
		}

		const existingMetric = await this._metricStorage.get(metric.id);
		if (Is.notEmpty(existingMetric)) {
			throw new AlreadyExistsError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricAlreadyExists",
				metric.id
			);
		}

		const telemetryMetric: TelemetryMetric = {
			id: metric.id,
			label: metric.label,
			type: metric.type,
			unit: metric.unit ?? "",
			description: metric.description ?? "",
			maxHistory: metric.maxHistory
		};

		await this._metricStorage.set(telemetryMetric);
		const metricKey = this.contextKey(await this.captureContextIds(), metric.id);
		this._metricDefinitionCache.set(metricKey, telemetryMetric);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricCreated",
			level: "info",
			data: { id: metric.id, type: metric.type, label: metric.label }
		});
	}

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	public async getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value?: ITelemetryMetricValue;
	}> {
		const metrics = await this.queryValues(id, undefined, undefined, undefined, 1);
		return {
			metric: metrics.metric,
			value: metrics.entities[0]
		};
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.label),
			metric.label
		);
		if (Is.notEmpty(metric.description)) {
			Guards.string(
				EntityStorageTelemetryConnector.CLASS_NAME,
				nameof(metric.description),
				metric.description
			);
		}
		if (Is.notEmpty(metric.unit)) {
			Guards.string(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.unit), metric.unit);
		}
		if (Is.notEmpty(metric.maxHistory)) {
			if (!Is.integer(metric.maxHistory) || metric.maxHistory <= 0) {
				throw new GeneralError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"maxHistoryMustBePositiveInteger"
				);
			}
		}

		const existingMetric = await this._metricStorage.get(metric.id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricNotFound",
				metric.id
			);
		}

		const telemetryMetric: TelemetryMetric = {
			id: metric.id,
			label: metric.label,
			type: existingMetric.type,
			unit: metric.unit ?? existingMetric.unit,
			description: metric.description ?? existingMetric.description,
			maxHistory: metric.maxHistory ?? existingMetric.maxHistory
		};

		await this._metricStorage.set(telemetryMetric);
		const metricKey = this.contextKey(await this.captureContextIds(), metric.id);
		this._metricDefinitionCache.set(metricKey, telemetryMetric);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricUpdated",
			level: "info",
			data: { id: metric.id, type: metric.type, label: metric.label }
		});
	}

	/**
	 * Add a metric value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the metric value.
	 * @returns The id of the newly created metric value entry.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		const contextIds = await this.captureContextIds();
		const metricKey = this.contextKey(contextIds, id);

		const existingMetric = await this._metricDefinitionCache.getOrSet(metricKey, async () => {
			const stored = await this._metricStorage.get(id);
			if (Is.undefined(stored)) {
				throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
			}
			return stored;
		});

		const lockKey = `${EntityStorageTelemetryConnector.CLASS_NAME}|${metricKey}`;
		await Mutex.lock(lockKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});

		let lockReleased = false;
		try {
			// Use the last in-memory computed value when available; avoids a storage round-trip
			// for chained increments. The lookup it replaces has no index to serve it, so it
			// scans the whole partition and sorts the result on every write.
			const last = this._lastValue.get(metricKey);
			let lastTs: number | undefined;
			let lastValue: number | undefined;

			if (Is.notEmpty(last)) {
				lastTs = last.ts;
				lastValue = last.value;
			} else {
				const existingMetricValue = await this._metricValueStorage.query(
					{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
					[
						{
							property: "ts",
							sortDirection: SortDirection.Descending
						}
					],
					undefined,
					undefined,
					1
				);

				const lastMetric = existingMetricValue.entities[0] as TelemetryMetricValue | undefined;
				if (Is.notEmpty(lastMetric)) {
					lastTs = lastMetric.ts;
					lastValue = lastMetric.value;
				}
			}

			let newValue = lastValue ?? 0;

			if (existingMetric.type === MetricType.Counter) {
				if (value === MetricCounterOperation.Increment) {
					newValue++;
				} else if (Is.integer(value) && value > 0) {
					newValue += value;
				} else {
					throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "counterIncOnly");
				}
			} else if (existingMetric.type === MetricType.IncDecCounter) {
				if (value === MetricCounterOperation.Increment) {
					newValue++;
				} else if (value === MetricCounterOperation.Decrement) {
					newValue--;
				} else if (Is.integer(value)) {
					newValue += value;
				} else {
					throw new GeneralError(
						EntityStorageTelemetryConnector.CLASS_NAME,
						"upDownCounterIncOrDecOnly"
					);
				}
			} else if (Is.number(value)) {
				newValue = value;
			} else {
				throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "gaugeNoIncDec");
			}

			// Keep timestamps strictly increasing per metric to preserve deterministic ordering.
			const now = Date.now();
			const ts = Is.notEmpty(lastTs) ? Math.max(now, lastTs + 1) : now;

			const telemetryMetricValue: TelemetryMetricValue = {
				id: Converter.bytesToHex(RandomHelper.generate(16)),
				metricId: id,
				ts,
				value: newValue,
				customData
			};

			let shouldFlush = false;
			if (Is.empty(this._batchSize) && Is.empty(this._batchIntervalMs)) {
				await this._metricValueStorage.set(telemetryMetricValue);
				this.recordLastValue(metricKey, ts, newValue);

				if (Is.integer(existingMetric.maxHistory) && existingMetric.maxHistory > 0) {
					await this.trimMetricHistory(metricKey, id, existingMetric.maxHistory, [
						telemetryMetricValue.id
					]);
				}
			} else {
				// push and set are synchronous — no yield points, no race with flush's splice.
				this._batchCache.push({
					entity: telemetryMetricValue,
					maxHistory: existingMetric.maxHistory,
					contextIds
				});
				this.recordLastValue(metricKey, ts, newValue);
				shouldFlush = !Is.empty(this._batchSize) && this._batchCache.length >= this._batchSize;
			}

			Mutex.unlock(lockKey);
			lockReleased = true;

			if (shouldFlush) {
				await this.flush();
			}

			this.pruneLastValues();

			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueCreated",
				level: "info",
				data: { id, value: newValue }
			});

			return telemetryMetricValue.id;
		} finally {
			if (!lockReleased) {
				Mutex.unlock(lockKey);
			}
		}
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(valueId), valueId);

		await this.flush();

		const results = await this._metricValueStorage.query(
			{
				conditions: [
					{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
					{ property: "id", comparison: ComparisonOperator.Equals, value: valueId }
				],
				logicalOperator: LogicalOperator.And
			},
			undefined,
			undefined,
			undefined,
			1
		);

		if (results.entities.length === 0) {
			throw new NotFoundError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricValueNotFound",
				valueId
			);
		}

		const metricValue = results.entities[0] as TelemetryMetricValue;
		return {
			id: metricValue.id,
			ts: metricValue.ts,
			value: metricValue.value,
			customData: metricValue.customData
		};
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and all its values have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		const existingMetric = await this._metricStorage.get(id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		await this.flush();

		await this._metricStorage.remove(id);
		const metricKey = this.contextKey(await this.captureContextIds(), id);
		this._metricDefinitionCache.delete(metricKey);

		let removeValuesCursor: string | undefined;
		const valueIdsToRemove: string[] = [];
		do {
			const existingMetricValuesResult = await this._metricValueStorage.query(
				{
					property: "metricId",
					comparison: ComparisonOperator.Equals,
					value: id
				},
				undefined,
				undefined,
				removeValuesCursor
			);
			valueIdsToRemove.push(...existingMetricValuesResult.entities.map(e => e.id as string));
			removeValuesCursor = existingMetricValuesResult.cursor;
		} while (Is.stringValue(removeValuesCursor));
		if (valueIdsToRemove.length > 0) {
			await this._metricValueStorage.removeBatch(valueIdsToRemove);
		}

		this.deleteLastValue(metricKey);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricRemoved",
			level: "info",
			data: { id }
		});
	}

	/**
	 * Query the metrics.
	 * @param type The type of the metric.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async query(
		type?: MetricType,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metrics.
		 */
		entities: ITelemetryMetric[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}> {
		const condition: EntityCondition<TelemetryMetric> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (Is.arrayOneOf(type, Object.values(MetricType))) {
			condition.conditions.push({
				property: "type",
				comparison: ComparisonOperator.Equals,
				value: type
			});
		}

		const result = await this._metricStorage.query(
			condition.conditions.length > 0 ? condition : undefined,
			[
				{
					property: "label",
					sortDirection: SortDirection.Ascending
				}
			],
			undefined,
			cursor,
			limit
		);

		return {
			entities: result.entities as ITelemetryMetric[],
			cursor: result.cursor
		};
	}

	/**
	 * Query the metric values.
	 * @param id The id of the metric.
	 * @param timeStart The inclusive time as the start of the metric entries.
	 * @param timeEnd The inclusive time as the end of the metric entries.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async queryValues(
		id: string,
		timeStart?: number,
		timeEnd?: number,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metric details.
		 */
		metric: ITelemetryMetric;

		/**
		 * The values for the metric.
		 */
		entities: ITelemetryMetricValue[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		await this.flush();

		const existingMetric = await this._metricStorage.get(id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		const condition: EntityCondition<TelemetryMetricValue> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		condition.conditions.push({
			property: "metricId",
			comparison: ComparisonOperator.Equals,
			value: id
		});

		if (Is.number(timeStart)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.GreaterThanOrEqual,
				value: timeStart
			});
		}

		if (Is.number(timeEnd)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.LessThanOrEqual,
				value: timeEnd
			});
		}

		const sortBy: { property: keyof TelemetryMetricValue; sortDirection: SortDirection }[] =
			existingMetric.type === MetricType.Counter
				? [
						{ property: "value", sortDirection: SortDirection.Descending },
						{ property: "ts", sortDirection: SortDirection.Descending }
					]
				: [{ property: "ts", sortDirection: SortDirection.Descending }];

		const result = await this._metricValueStorage.query(
			condition,
			sortBy,
			undefined,
			cursor,
			limit
		);

		const entities = result.entities as ITelemetryMetricValue[];

		return {
			metric: existingMetric as ITelemetryMetric,
			entities,
			cursor: result.cursor
		};
	}

	/**
	 * Write all cached entries to storage and clear the cache.
	 * If the mutex cannot be acquired the call returns without writing.
	 * On a storage write failure the entries are returned to the head of the cache for the next attempt.
	 * @returns A promise that resolves when all cached entries have been written to storage.
	 */
	public async flush(): Promise<void> {
		this.stopTimer();

		if (this._batchCache.length === 0) {
			this.startTimer();
			return;
		}

		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: false,
			timeoutMs: this._mutexTimeoutMs
		});
		if (!locked) {
			this.startTimer();
			return;
		}

		try {
			const entries = this._batchCache.splice(0);

			const groups = new Map<string, IBatchMetricValueEntry[]>();
			for (const entry of entries) {
				const contextGroupKey = this.contextKey(entry.contextIds ?? {});
				let group = groups.get(contextGroupKey);
				if (Is.undefined(group)) {
					group = [];
					groups.set(contextGroupKey, group);
				}
				group.push(entry);
			}

			const failedEntries: IBatchMetricValueEntry[] = [];
			const errors: unknown[] = [];
			for (const group of groups.values()) {
				try {
					await ContextIdStore.run(group[0].contextIds ?? {}, async () => {
						const entities = group.map(e => e.entity);
						await this._metricValueStorage.setBatch(entities);

						const toTrim = new Map<string, IPendingTrim>();
						for (const entry of group) {
							if (Is.integer(entry.maxHistory) && entry.maxHistory > 0) {
								const trimKey = this.contextKey(entry.contextIds ?? {}, entry.entity.metricId);
								let pendingTrim = toTrim.get(trimKey);
								if (Is.undefined(pendingTrim)) {
									pendingTrim = {
										metricId: entry.entity.metricId,
										maxHistory: entry.maxHistory,
										addedIds: []
									};
									toTrim.set(trimKey, pendingTrim);
								} else {
									// A metric updated mid-batch trims to the cap in force at the last write.
									pendingTrim.maxHistory = entry.maxHistory;
								}
								pendingTrim.addedIds.push(entry.entity.id);
							}
						}

						for (const [trimKey, pendingTrim] of toTrim) {
							await this.trimMetricHistory(
								trimKey,
								pendingTrim.metricId,
								pendingTrim.maxHistory,
								pendingTrim.addedIds
							);
						}
					});
				} catch (err) {
					failedEntries.push(...group);
					errors.push(err);
				}
			}

			if (Is.arrayValue(errors)) {
				await this._logging?.log({
					source: EntityStorageTelemetryConnector.CLASS_NAME,
					message: "flushFailed",
					level: "error",
					data: { error: errors.length === 1 ? errors[0] : errors }
				});
				this._batchCache.unshift(...failedEntries);
				if (this._maxCacheSize > 0 && this._batchCache.length > this._maxCacheSize) {
					this._batchCache.splice(0, this._batchCache.length - this._maxCacheSize);
				}
			}
		} finally {
			Mutex.unlock(this._mutexKey);
		}

		this.startTimer();
	}

	/**
	 * Build the partition key used for the caches, counter chaining and batch grouping.
	 * Only the node and tenant ids partition the storage, so the key is built from those two
	 * directly rather than canonicalising the whole context object on every metric write.
	 * @param contextIds The context ids to derive the key from.
	 * @param metricId The metric id to include in the partition key.
	 * @returns The partition key.
	 * @internal
	 */
	private contextKey(contextIds: IContextIds, metricId?: string): string {
		const key = `${contextIds[ContextIdKeys.Node] ?? ""}|${contextIds[ContextIdKeys.Tenant] ?? ""}`;
		if (metricId) {
			return `${key}|${metricId}`;
		}
		return key;
	}

	/**
	 * Capture the partition keys of the ambient context ids. Other keys (organization, user,
	 * per-request ids) vary within a partition and would split counter chaining and the caches.
	 * @returns The partition context ids from the ambient context.
	 * @internal
	 */
	private async captureContextIds(): Promise<IContextIds> {
		const contextIds = await ContextIdStore.getContextIds();
		return {
			[ContextIdKeys.Node]: contextIds?.[ContextIdKeys.Node] ?? "",
			[ContextIdKeys.Tenant]: contextIds?.[ContextIdKeys.Tenant] ?? ""
		};
	}

	/**
	 * Store the last computed value for a metric, preserving any tracked history ids and moving
	 * the key to the most recently written position for pruning.
	 * @param metricKey The partition and metric key.
	 * @param ts The timestamp of the value.
	 * @param value The computed value.
	 * @internal
	 */
	private recordLastValue(metricKey: string, ts: number, value: number): void {
		const accessed = Date.now();
		const tracked = this._lastValue.get(metricKey);
		if (Is.empty(tracked)) {
			this._lastValue.set(metricKey, { ts, value, accessed });
		} else {
			tracked.ts = ts;
			tracked.value = value;
			tracked.accessed = accessed;
			this._lastValue.delete(metricKey);
			this._lastValue.set(metricKey, tracked);
		}
	}

	/**
	 * Evict the least recently written entries once the last value cache exceeds its capacity.
	 * Keys with entries still waiting in the batch cache are never evicted, as re-reading them from
	 * storage would miss the rows still waiting to be written and restart the counter chain.
	 * @internal
	 */
	private pruneLastValues(): void {
		const now = Date.now();
		const sweepIntervalMs = Math.min(
			EntityStorageTelemetryConnector._LAST_VALUE_SWEEP_INTERVAL_MS,
			this._lastValueCacheTtiMs
		);
		const isExpiring =
			this._lastValueCacheTtiMs > 0 && now - this._lastValueSweepMs >= sweepIntervalMs;

		let excess =
			this._lastValueCacheCapacity > 0 ? this._lastValue.size - this._lastValueCacheCapacity : 0;

		if (!isExpiring && excess <= 0) {
			return;
		}

		if (isExpiring) {
			this._lastValueSweepMs = now;
		}

		const pendingKeys = new Set<string>();
		for (const entry of this._batchCache) {
			pendingKeys.add(this.contextKey(entry.contextIds ?? {}, entry.entity.metricId));
		}

		for (const [key, tracked] of this._lastValue) {
			const isIdle = isExpiring && now - tracked.accessed >= this._lastValueCacheTtiMs;
			if (!pendingKeys.has(key) && (isIdle || excess > 0)) {
				this.deleteLastValue(key);
				excess--;
			}
		}
	}

	/**
	 * Drop a metric from the last value cache, releasing any tracked ids from the budget.
	 * @param metricKey The partition and metric key.
	 * @internal
	 */
	private deleteLastValue(metricKey: string): void {
		const tracked = this._lastValue.get(metricKey);
		if (Is.notEmpty(tracked)) {
			this._trackedHistoryCount -= tracked.historyIds?.length ?? 0;
			this._lastValue.delete(metricKey);
		}
	}

	/**
	 * Is there room in the tracked history budget for more value ids.
	 * @param additional The number of ids about to be tracked.
	 * @returns True when the ids fit within the budget.
	 * @internal
	 */
	private canTrackHistory(additional: number): boolean {
		return (
			this._trackedHistoryBudget <= 0 ||
			this._trackedHistoryCount + additional <= this._trackedHistoryBudget
		);
	}

	/**
	 * Replace the tracked value ids for a metric, keeping the global tracked id count in step.
	 * @param tracked The cached metric state to update.
	 * @param historyIds The ids to track, or undefined to stop tracking the metric.
	 * @internal
	 */
	private setTrackedHistory(tracked: ILastMetricValue, historyIds?: string[]): void {
		this._trackedHistoryCount -= tracked.historyIds?.length ?? 0;
		tracked.historyIds = historyIds;
		this._trackedHistoryCount += historyIds?.length ?? 0;
	}

	/**
	 * Delete the oldest values for a metric that exceed its maxHistory cap.
	 * The retained ids are tracked in memory, so after the first trim for a metric no storage read
	 * is needed; caps above the tracking limit always scan.
	 * @param metricKey The partition and metric key the tracked ids are held against.
	 * @param metricId The metric id.
	 * @param maxHistory The maximum number of values to retain.
	 * @param addedIds The ids written since the previous trim, in ascending timestamp order.
	 * @internal
	 */
	private async trimMetricHistory(
		metricKey: string,
		metricId: string,
		maxHistory: number,
		addedIds: string[]
	): Promise<void> {
		const tracked = this._lastValue.get(metricKey);
		const isTrackable = this._maxTrackedHistory > 0 && maxHistory <= this._maxTrackedHistory;

		if (isTrackable && Is.notEmpty(tracked) && Is.array<string>(tracked.historyIds)) {
			const trackedIds = tracked.historyIds;
			trackedIds.push(...addedIds);
			this._trackedHistoryCount += addedIds.length;

			const trackedExcess = trackedIds.length - maxHistory;
			if (trackedExcess > 0) {
				const removedIds = trackedIds.splice(0, trackedExcess);
				this._trackedHistoryCount -= removedIds.length;
				await this._metricValueStorage.removeBatch(removedIds);
			}

			// A metric whose cap was raised can outgrow the budget; drop it back to scanning.
			if (!this.canTrackHistory(0)) {
				this.setTrackedHistory(tracked, undefined);
			}
			return;
		}

		// Read the oldest rows a window at a time rather than buffering the whole history, so the
		// memory used is bounded by the retention cap and not by how large the table has grown.
		const windowSize = maxHistory + EntityStorageTelemetryConnector._TRIM_PAGE_SIZE;
		let retainedIds: string[] = [];
		let isTrimmed = false;
		while (!isTrimmed) {
			const page = await this._metricValueStorage.query(
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
				[{ property: "ts", sortDirection: SortDirection.Ascending }],
				["id"],
				undefined,
				windowSize
			);
			const windowIds = page.entities.map(e => e.id as string);

			if (windowIds.length < windowSize) {
				const excess = windowIds.length - maxHistory;
				if (excess > 0) {
					await this._metricValueStorage.removeBatch(windowIds.splice(0, excess));
				}
				retainedIds = windowIds;
				isTrimmed = true;
			} else {
				// A full window means more rows follow, so its oldest page is outside the cap.
				await this._metricValueStorage.removeBatch(
					windowIds.slice(0, EntityStorageTelemetryConnector._TRIM_PAGE_SIZE)
				);
			}
		}

		if (isTrackable && Is.notEmpty(tracked) && this.canTrackHistory(retainedIds.length)) {
			this.setTrackedHistory(tracked, retainedIds);
		}
	}

	/**
	 * Start the interval timer if batchIntervalMs is configured and the connector is running.
	 * @internal
	 */
	private startTimer(): void {
		if (!Is.empty(this._batchIntervalMs) && Is.empty(this._batchTimer) && this._started) {
			this._batchTimer = globalThis.setTimeout(async () => {
				await this.flush();
			}, this._batchIntervalMs);
		}
	}

	/**
	 * Stop the interval timer if it is running.
	 * @internal
	 */
	private stopTimer(): void {
		if (!Is.empty(this._batchTimer)) {
			globalThis.clearTimeout(this._batchTimer);
			this._batchTimer = undefined;
		}
	}
}
