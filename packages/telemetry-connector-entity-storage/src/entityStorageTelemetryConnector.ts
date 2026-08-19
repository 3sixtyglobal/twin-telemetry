// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	AlreadyExistsError,
	Coerce,
	ComponentFactory,
	Converter,
	GeneralError,
	Guards,
	Is,
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
	 * Last computed value per metric id, used to chain increments without a storage read.
	 * @internal
	 */
	private readonly _pendingLastValue: Map<string, { ts: number; value: number }>;

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

		this._mutexKey = RandomHelper.generateUuidV7("compact");
		this._batchCache = [];
		this._pendingLastValue = new Map();
		this._started = false;
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
		value: ITelemetryMetricValue;
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

		const lockKey = `${EntityStorageTelemetryConnector.CLASS_NAME}:${id}`;
		await Mutex.lock(lockKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});

		try {
			const existingMetric = await this._metricStorage.get(id);
			if (Is.undefined(existingMetric)) {
				throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
			}

			// Use the last in-memory computed value when available; avoids a storage round-trip
			// for chained increments within the same batch window.
			const pending = this._pendingLastValue.get(id);
			let lastTs: number | undefined;
			let lastValue: number | undefined;

			if (Is.notEmpty(pending)) {
				lastTs = pending.ts;
				lastValue = pending.value;
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

			if (Is.empty(this._batchSize) && Is.empty(this._batchIntervalMs)) {
				await this._metricValueStorage.set(telemetryMetricValue);

				if (Is.integer(existingMetric.maxHistory) && existingMetric.maxHistory > 0) {
					await this.trimMetricHistory(id, existingMetric.maxHistory);
				}
			} else {
				let shouldFlush = false;
				const flushLocked = await Mutex.lock(this._mutexKey, {
					throwOnTimeout: true,
					timeoutMs: this._mutexTimeoutMs
				});
				if (flushLocked) {
					try {
						this._batchCache.push({
							entity: telemetryMetricValue,
							maxHistory: existingMetric.maxHistory
						});
						this._pendingLastValue.set(id, { ts, value: newValue });
						shouldFlush = !Is.empty(this._batchSize) && this._batchCache.length >= this._batchSize;
					} finally {
						Mutex.unlock(this._mutexKey);
					}
				}

				if (shouldFlush) {
					await this.flush();
				}
			}

			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueCreated",
				level: "info",
				data: { id, value: newValue }
			});

			return telemetryMetricValue.id;
		} finally {
			Mutex.unlock(lockKey);
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

		this._pendingLastValue.delete(id);

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

		const result = await this._metricValueStorage.query(
			condition,
			[
				{
					property: "ts",
					sortDirection: SortDirection.Descending
				}
			],
			undefined,
			cursor,
			limit
		);

		const entities = result.entities as ITelemetryMetricValue[];
		if (existingMetric.type === MetricType.Counter) {
			entities.sort((a, b) => b.value - a.value || b.ts - a.ts);
		}

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

		let entries: IBatchMetricValueEntry[] = [];
		try {
			entries = this._batchCache.splice(0);

			const entities = entries.map(e => e.entity);
			await this._metricValueStorage.setBatch(entities);

			const toTrim = new Map<string, number>();
			for (const entry of entries) {
				if (Is.integer(entry.maxHistory) && entry.maxHistory > 0) {
					toTrim.set(entry.entity.metricId, entry.maxHistory);
				}
			}

			for (const [metricId, maxHistory] of toTrim) {
				await this.trimMetricHistory(metricId, maxHistory);
			}
		} catch {
			this._batchCache.unshift(...entries);
			if (this._maxCacheSize > 0 && this._batchCache.length > this._maxCacheSize) {
				this._batchCache.splice(0, this._batchCache.length - this._maxCacheSize);
			}
		} finally {
			Mutex.unlock(this._mutexKey);
		}

		this.startTimer();
	}

	/**
	 * Delete the oldest values for a metric that exceed its maxHistory cap.
	 * @param id The metric id.
	 * @param maxHistory The maximum number of values to retain.
	 * @internal
	 */
	private async trimMetricHistory(id: string, maxHistory: number): Promise<void> {
		let trimCursor: string | undefined;
		const idsBuffer: string[] = [];
		do {
			const page = await this._metricValueStorage.query(
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
				[{ property: "ts", sortDirection: SortDirection.Ascending }],
				["id"],
				trimCursor,
				EntityStorageTelemetryConnector._TRIM_PAGE_SIZE
			);
			idsBuffer.push(...page.entities.map(e => e.id as string));
			trimCursor = page.cursor;
		} while (Is.stringValue(trimCursor));
		const excess = idsBuffer.length - maxHistory;
		if (excess > 0) {
			await this._metricValueStorage.removeBatch(idsBuffer.slice(0, excess));
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
