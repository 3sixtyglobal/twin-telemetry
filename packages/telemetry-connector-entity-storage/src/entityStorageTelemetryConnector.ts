// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	type IBackgroundTask,
	type IBackgroundTaskComponent,
	TaskStatus
} from "@twin.org/background-task-models";
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import {
	AlreadyExistsError,
	BaseError,
	Coerce,
	ComponentFactory,
	Converter,
	GeneralError,
	Guards,
	Is,
	LfuCache,
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
import type { ILogEntry, ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type ITelemetryConnector,
	type ITelemetryMetric,
	type ITelemetryMetricValue,
	type ITelemetryMetricValueEntry,
	MetricCounterOperation,
	MetricType
} from "@twin.org/telemetry-models";
import type { TelemetryMetric } from "./entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import type { IEntityStorageTelemetryConnectorConstructorOptions } from "./models/IEntityStorageTelemetryConnectorConstructorOptions.js";
import type { ITelemetryMetricValuePayload } from "./models/ITelemetryMetricValuePayload.js";
import type { ITelemetryMetricValueTaskPayload } from "./models/ITelemetryMetricValueTaskPayload.js";
import type { ITelemetryMetricValueWriterConfig } from "./models/ITelemetryMetricValueWriterConfig.js";

/**
 * Class for performing telemetry operations in entity storage.
 * The metric values are written by a long running background thread, so nothing about a value
 * is held in memory here; only the metric definitions, which are immutable once registered,
 * are cached.
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
	 * Default time in milliseconds to wait for the background thread to confirm a flush.
	 */
	public static readonly DEFAULT_FLUSH_TIMEOUT_MS: number = 30_000;

	/**
	 * Maximum number of metric definitions to hold in the in-memory definition cache.
	 */
	public static readonly DEFAULT_METRIC_DEFINITION_CACHE_CAPACITY: number = 1000;

	/**
	 * Time-to-idle in milliseconds for cached metric definitions.
	 * Metric definitions are immutable once registered; a long TTI keeps active
	 * metrics cached without permanent references.
	 */
	public static readonly DEFAULT_METRIC_DEFINITION_CACHE_TTI_MS: number = 3_600_000;

	/**
	 * Default time in milliseconds values are held so several share a single background task.
	 * Keeps the task write off the caller's path, which matters most for the metrics recorded
	 * on every REST request.
	 * The window is also what limits how many tasks the connector can produce, as one task
	 * carries a whole window regardless of how many values it holds. The scheduler moves a
	 * single task per cycle for a task type, which is of the order of a few per second once
	 * the task queue is on a database, so the window is set an order of magnitude below that:
	 * one task per second whatever the metric rate.
	 */
	public static readonly DEFAULT_TASK_COALESCE_MS: number = 1000;

	/**
	 * Maximum number of values held while coalescing before a task is created regardless of
	 * how much of the window is left.
	 * This is a bound on the values held for the window rather than a throughput control; a
	 * limit low enough to be reached by ordinary traffic would raise the task rate above what
	 * the scheduler can drain.
	 */
	public static readonly DEFAULT_COALESCE_SIZE: number = 10_000;

	/**
	 * Default time in milliseconds with tasks outstanding and none of them completing before
	 * the background thread is treated as stalled.
	 */
	public static readonly DEFAULT_TASK_STALL_TIMEOUT_MS: number = 60_000;

	/**
	 * Task type identifier for the metric value background task.
	 * @internal
	 */
	private static readonly _METRIC_VALUE_TASK_TYPE: string = "telemetry-metric-value-write";

	/**
	 * Cap on how many times the stall wait can double.
	 * @internal
	 */
	private static readonly _STALL_BACKOFF_MAX_MULTIPLIER: number = 8;

	/**
	 * The entity storage for the telemetry metrics.
	 * @internal
	 */
	private readonly _metricStorage: IEntityStorageConnector<TelemetryMetric>;

	/**
	 * The entity storage for the telemetry metric values, used for the read operations.
	 * @internal
	 */
	private readonly _metricValueStorage: IEntityStorageConnector<TelemetryMetricValue>;

	/**
	 * The component for logging.
	 * @internal
	 */
	private readonly _logging?: ILoggingComponent;

	/**
	 * The background task component used to run the metric value writes on a background thread.
	 * Absent when the connector is created inside an engine clone, which builds it only to
	 * register the metric storage and never writes values through it.
	 * @internal
	 */
	private readonly _backgroundTaskComponent?: IBackgroundTaskComponent;

	/**
	 * The URL of the module the background thread runs the metric value writes from.
	 * @internal
	 */
	private readonly _metricValueTaskHandler: string;

	/**
	 * The writer settings passed to the background thread with each task payload.
	 * @internal
	 */
	private readonly _writerConfig: ITelemetryMetricValueWriterConfig;

	/**
	 * How long in milliseconds to wait for the background thread to confirm a flush.
	 * @internal
	 */
	private readonly _flushTimeoutMs: number;

	/**
	 * Write requests waiting for their background task to complete, keyed by task id.
	 * @internal
	 */
	private readonly _pendingWrites: Map<
		string,
		{ resolve: (isWritten: boolean) => void; timer: ReturnType<typeof setTimeout> }
	>;

	/**
	 * How long in milliseconds to hold values before handing them to the background thread as a
	 * single task; 0 creates a task per value.
	 * @internal
	 */
	private readonly _taskCoalesceMs: number;

	/**
	 * Values held for the coalesce window, waiting to be handed to the background thread.
	 * @internal
	 */
	private readonly _coalesced: ITelemetryMetricValuePayload[];

	/**
	 * Handle for the coalesce window timer.
	 * @internal
	 */
	private _coalesceTimer?: ReturnType<typeof setTimeout>;

	/**
	 * How long in milliseconds with tasks outstanding and none of them completing before the
	 * background thread is treated as stalled; 0 disables the check.
	 * @internal
	 */
	private readonly _taskStallTimeoutMs: number;

	/**
	 * Ids of the tasks handed to the background thread which have not yet reported a final
	 * state, oldest first. Ids only; the values they carry belong to the thread.
	 * @internal
	 */
	private readonly _outstandingTaskIds: Set<string>;

	/**
	 * The time a task last reached a final state, the outstanding tasks were created, or a task
	 * was last reported still waiting for a worker. A thread which has stopped answering is only
	 * visible as the absence of this moving on.
	 * @internal
	 */
	private _lastTaskProgress: number;

	/**
	 * Handle for the stall check timer, present only while tasks are outstanding.
	 * @internal
	 */
	private _stallTimer?: ReturnType<typeof setTimeout>;

	/**
	 * True while a stall check, or the replacement it starts, is running.
	 * @internal
	 */
	private _stallCheckRunning: boolean;

	/**
	 * Number of consecutive replacements with no completion between them; reset once a task
	 * completes. Used to back off the stall wait.
	 * @internal
	 */
	private _stallRestartCount: number;

	/**
	 * Number of values handed to the background thread, counted once their task is queued.
	 * @internal
	 */
	private _valuesQueued: number;

	/**
	 * The value count as of the last write the background thread confirmed.
	 * @internal
	 */
	private _valuesWritten: number;

	/**
	 * Serialises the write requests. A caller cannot return on a write already in progress, as
	 * its own values may have been queued behind that write's task.
	 * @internal
	 */
	private _writeChain: Promise<void>;

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

		// The background task component is used to run metric value writes on a background thread.
		// but if this component is instantiated from the background thread it is not needed.
		this._backgroundTaskComponent = ComponentFactory.getIfExists<IBackgroundTaskComponent>(
			options?.backgroundTaskComponentType ?? "background-task"
		);

		this._metricValueTaskHandler =
			options?.config?.overrideMetricValueTaskHandler ??
			new URL("./telemetryMetricValueTask.js", import.meta.url).href;

		this._writerConfig = {
			telemetryMetricValueStorageConnectorType: options?.telemetryMetricValueStorageConnectorType,
			loggingComponentType: options?.loggingComponentType,
			batchSize: options?.config?.batchSize,
			batchIntervalMs: options?.config?.batchIntervalMs,
			maxCacheSize: options?.config?.maxCacheSize,
			mutexTimeoutMs: options?.config?.mutexTimeoutMs
		};

		const cfgFlushTimeoutMs =
			Coerce.integer(options?.config?.flushTimeoutMs) ??
			EntityStorageTelemetryConnector.DEFAULT_FLUSH_TIMEOUT_MS;
		this._flushTimeoutMs =
			cfgFlushTimeoutMs > 0
				? cfgFlushTimeoutMs
				: EntityStorageTelemetryConnector.DEFAULT_FLUSH_TIMEOUT_MS;

		const cfgCoalesceMs =
			Coerce.integer(options?.config?.taskCoalesceMs) ??
			EntityStorageTelemetryConnector.DEFAULT_TASK_COALESCE_MS;
		this._taskCoalesceMs = cfgCoalesceMs > 0 ? cfgCoalesceMs : 0;

		const cfgTaskStallTimeoutMs =
			Coerce.integer(options?.config?.taskStallTimeoutMs) ??
			EntityStorageTelemetryConnector.DEFAULT_TASK_STALL_TIMEOUT_MS;
		this._taskStallTimeoutMs = cfgTaskStallTimeoutMs > 0 ? cfgTaskStallTimeoutMs : 0;

		this._pendingWrites = new Map();
		this._coalesced = [];
		this._outstandingTaskIds = new Set();
		this._lastTaskProgress = 0;
		this._stallCheckRunning = false;
		this._stallRestartCount = 0;
		this._valuesQueued = 0;
		this._valuesWritten = 0;
		this._writeChain = Promise.resolve();
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
	 * Start the connector; registers the long running background thread which writes the
	 * metric values.
	 * @returns A promise that resolves when the connector is ready to accept metric values.
	 */
	public async start(): Promise<void> {
		if (!this._started) {
			this._started = true;
			this._metricDefinitionCache = new LfuCache({
				capacity: this._metricDefinitionCacheCapacity,
				ttiMs: this._metricDefinitionCacheTtiMs
			});

			await this.registerMetricValueHandler();
		}
	}

	/**
	 * Stop the connector; writes any values still pending and releases the background thread.
	 * @returns A promise that resolves when the final write completes and the thread is released.
	 */
	public async stop(): Promise<void> {
		this.stopCoalesceTimer();

		// Flush before clearing the started flag, as the background thread is only asked to
		// write while the connector is running. A failed final write must not abandon the rest
		// of the teardown, which is what releases the thread and the callers waiting on it.
		try {
			await this.flush();
		} catch (err) {
			await this.logWithoutThrowing({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "stopFlushFailed",
				level: "error",
				error: BaseError.fromError(err)
			});
		}

		this._started = false;
		this.stopStallTimer();
		this._outstandingTaskIds.clear();

		// unregisterHandler terminates the worker without calling its shutdown method, so the
		// flush above is what persists anything the thread still had pending.
		await this._backgroundTaskComponent?.unregisterHandler(
			EntityStorageTelemetryConnector._METRIC_VALUE_TASK_TYPE
		);

		for (const pendingWrite of this._pendingWrites.values()) {
			globalThis.clearTimeout(pendingWrite.timer);
			pendingWrite.resolve(false);
		}
		this._pendingWrites.clear();

		this._metricDefinitionCache.destroy();
	}

	/**
	 * Create one or more metrics.
	 * A single metric fails if it already exists; an array declares the set that should exist,
	 * creating the ones that are missing and leaving the rest untouched. The array form resolves
	 * what already exists with one query and writes the rest in one batch.
	 * @param metric The metric details, or the details of several metrics.
	 * @returns A promise that resolves when the metrics have been created.
	 * @throws AlreadyExistsError if a single metric already exists.
	 */
	public async createMetric(metric: ITelemetryMetric | ITelemetryMetric[]): Promise<void> {
		const isBatch = Is.array<ITelemetryMetric>(metric);
		const metrics = isBatch ? metric : [metric];

		for (const entry of metrics) {
			this.validateMetric(entry);
		}

		if (metrics.length === 0) {
			return;
		}

		const telemetryMetrics: TelemetryMetric[] = [];

		if (isBatch) {
			const existing = await this._metricStorage.query(
				{
					property: "id",
					comparison: ComparisonOperator.In,
					value: metrics.map(entry => entry.id)
				},
				undefined,
				["id"],
				undefined,
				metrics.length
			);
			const existingIds = new Set(existing.entities.map(entity => entity.id as string));

			for (const entry of metrics) {
				if (!existingIds.has(entry.id)) {
					telemetryMetrics.push(this.toTelemetryMetric(entry));
				}
			}
		} else {
			const existingMetric = await this._metricStorage.get(metrics[0].id);
			if (Is.notEmpty(existingMetric)) {
				throw new AlreadyExistsError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"metricAlreadyExists",
					metrics[0].id
				);
			}
			telemetryMetrics.push(this.toTelemetryMetric(metrics[0]));
		}

		if (telemetryMetrics.length === 0) {
			return;
		}

		if (telemetryMetrics.length === 1) {
			await this._metricStorage.set(telemetryMetrics[0]);
		} else {
			await this._metricStorage.setBatch(telemetryMetrics);
		}

		const contextIds = await this.captureContextIds();
		for (const telemetryMetric of telemetryMetrics) {
			this._metricDefinitionCache.set(
				this.contextKey(contextIds, telemetryMetric.id),
				telemetryMetric
			);
		}

		if (isBatch) {
			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricsCreated",
				level: "info",
				data: { count: telemetryMetrics.length }
			});
		} else {
			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricCreated",
				level: "info",
				data: {
					id: telemetryMetrics[0].id,
					type: telemetryMetrics[0].type,
					label: telemetryMetrics[0].label
				}
			});
		}
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
	 * The value is handed to the background thread which computes it from the value currently
	 * in storage and performs the write, so it is not visible until the thread has flushed.
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

		const metricValue = await this.buildMetricValue(id, value, customData);

		await this.queueMetricValues([metricValue]);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricValueCreated",
			level: "info",
			data: { id }
		});

		return metricValue.valueId;
	}

	/**
	 * Add multiple metric values, handing the whole set to the background thread as a single
	 * task rather than one per value.
	 * @param values The metric values to add.
	 * @returns The ids of the newly created metric value entries, in the order supplied.
	 */
	public async addMetricValues(values: ITelemetryMetricValueEntry[]): Promise<string[]> {
		Guards.array<ITelemetryMetricValueEntry>(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(values),
			values
		);

		const metricValues: ITelemetryMetricValuePayload[] = [];

		for (const entry of values) {
			Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(entry.id), entry.id);
			metricValues.push(await this.buildMetricValue(entry.id, entry.value, entry.customData));
		}

		await this.queueMetricValues(metricValues);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricValuesCreated",
			level: "info",
			data: { count: metricValues.length }
		});

		return metricValues.map(metricValue => metricValue.valueId);
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
				["id"],
				removeValuesCursor
			);
			valueIdsToRemove.push(...existingMetricValuesResult.entities.map(e => e.id as string));
			removeValuesCursor = existingMetricValuesResult.cursor;
		} while (Is.stringValue(removeValuesCursor));
		if (valueIdsToRemove.length > 0) {
			await this._metricValueStorage.removeBatch(valueIdsToRemove);
		}

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
	 * Register the handler which runs the metric value writes on the background thread.
	 * Also used to replace a thread which has stopped answering, so the registration is kept in
	 * one place.
	 * @returns A promise that resolves when the handler is registered.
	 * @internal
	 */
	private async registerMetricValueHandler(): Promise<void> {
		await this._backgroundTaskComponent?.registerHandler<
			ITelemetryMetricValueTaskPayload,
			undefined
		>(
			EntityStorageTelemetryConnector._METRIC_VALUE_TASK_TYPE,
			this._metricValueTaskHandler,
			"telemetryMetricValueTask",
			async task => this.metricValueTaskStateChanged(task),
			{
				// A single long running worker, kept alive by the negative idle shutdown timeout,
				// so the values it has batched are never split across threads.
				maxWorkerCount: 1,
				idleShutdownTimeout: -1,
				initialiseMethod: "telemetryMetricValueTaskStart",
				// The writer settings are sent once when the worker starts rather than with
				// every value.
				initialiseMethodParams: async () => [this._writerConfig],
				shutdownMethod: "telemetryMetricValueTaskEnd"
			}
		);
	}

	/**
	 * Ask the background thread to write everything it currently has pending, so a read sees
	 * the values which have been added but not yet persisted.
	 * @returns A promise that resolves when the background thread confirms the write, or when
	 * the flush timeout elapses.
	 * @internal
	 */
	private async flush(): Promise<void> {
		if (
			!this._started ||
			Is.empty(this._backgroundTaskComponent) ||
			(this._coalesced.length === 0 && this._valuesQueued === this._valuesWritten)
		) {
			return;
		}

		// A caller has to take its turn behind any write already running rather than join it: the
		// values it added may have been queued after that write's task, so joining would let it
		// read storage before its own values were written. The handed on promise is only ever
		// resolved, never rejected, so a failed write does not stop the caller behind it.
		const previous = this._writeChain;
		let release: (() => void) | undefined;
		this._writeChain = new Promise<void>(resolve => {
			release = resolve;
		});

		await previous;

		try {
			await this.requestWrite();
		} finally {
			release?.();
		}
	}

	/**
	 * Ask the background thread to write, handing over any values still inside the coalesce
	 * window with the same task so a read costs one task rather than two.
	 * @returns A promise that resolves when the background thread confirms the write, or when the
	 * write timeout elapses.
	 * @internal
	 */
	private async requestWrite(): Promise<void> {
		if (!this._started) {
			return;
		}

		this.stopCoalesceTimer();

		// splice is synchronous, so there is no yield point where a value could be handed over twice.
		const values = this._coalesced.splice(0);

		if (values.length === 0 && this._valuesQueued === this._valuesWritten) {
			return;
		}

		let taskId: string;
		try {
			taskId = await this.createMetricValueTask(
				values.length > 0 ? { values, flush: true } : { flush: true }
			);
		} catch (err) {
			// Nothing was handed over, so put them back at the head for the next attempt.
			this._coalesced.unshift(...values);
			throw err;
		}

		this._valuesQueued += values.length;

		// Read before waiting, so every value it counts belongs to a task the thread already
		// has; anything queued afterwards leaves the counts apart for the next read.
		const queued = this._valuesQueued;

		// A task which does not confirm stays in the queue rather than being sent again, as the
		// thread may already have its values; the counts stay apart so the next read asks again.
		if (await this.waitForTask(taskId)) {
			this._valuesWritten = queued;
		}
	}

	/**
	 * Resolve the metric definition, check the operation against it and build the payload the
	 * background thread needs to write the value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the metric value.
	 * @returns The payload for the background thread.
	 * @throws NotFoundError if the metric does not exist.
	 * @internal
	 */
	private async buildMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<ITelemetryMetricValuePayload> {
		const contextIds = await this.captureContextIds();
		const metricKey = this.contextKey(contextIds, id);

		const existingMetric = await this._metricDefinitionCache.getOrSet(metricKey, async () => {
			const stored = await this._metricStorage.get(id);
			if (Is.undefined(stored)) {
				throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
			}
			return stored;
		});

		const metricType = existingMetric.type as MetricType;
		this.validateOperation(metricType, value);

		return {
			valueId: Converter.bytesToHex(RandomHelper.generate(16)),
			metricId: id,
			metricType,
			operation: value,
			ts: Date.now(),
			maxHistory: existingMetric.maxHistory,
			customData,
			contextIds
		};
	}

	/**
	 * Hand values to the background thread, holding them for the coalesce window when one is
	 * configured so several share a single task.
	 * @param metricValues The values to hand over.
	 * @returns A promise that resolves when the values have been queued or buffered.
	 * @internal
	 */
	private async queueMetricValues(metricValues: ITelemetryMetricValuePayload[]): Promise<void> {
		if (metricValues.length === 0) {
			return;
		}

		if (this._taskCoalesceMs === 0) {
			await this.createMetricValueTask({ values: metricValues });
			this._valuesQueued += metricValues.length;
			return;
		}

		this._coalesced.push(...metricValues);

		if (this._coalesced.length >= EntityStorageTelemetryConnector.DEFAULT_COALESCE_SIZE) {
			await this.sendCoalesced();
		} else {
			this.armCoalesceTimer();
		}
	}

	/**
	 * Arm the timer which hands the values held for the coalesce window over.
	 * @internal
	 */
	private armCoalesceTimer(): void {
		if (!Is.empty(this._coalesceTimer)) {
			return;
		}

		this._coalesceTimer = globalThis.setTimeout(async () => {
			this._coalesceTimer = undefined;
			try {
				await this.sendCoalesced();
			} catch (err) {
				await this.logWithoutThrowing({
					source: EntityStorageTelemetryConnector.CLASS_NAME,
					message: "metricValueTaskFailed",
					level: "error",
					data: { taskId: "" },
					error: BaseError.fromError(err)
				});

				// The values are back at the head of the window, so the window has to keep
				// running: nothing else would hand them over until the next value is added.
				this.armCoalesceTimer();
			}
		}, this._taskCoalesceMs);
	}

	/**
	 * Hand any values held for the coalesce window to the background thread as a single task.
	 * @returns A promise that resolves when the values have been queued.
	 * @internal
	 */
	private async sendCoalesced(): Promise<void> {
		this.stopCoalesceTimer();

		if (this._coalesced.length === 0) {
			return;
		}

		// splice is synchronous, so there is no yield point where a value could be added twice.
		const values = this._coalesced.splice(0);

		try {
			await this.createMetricValueTask({ values });
			this._valuesQueued += values.length;
		} catch (err) {
			// Put them back at the head so the next attempt keeps them in order.
			this._coalesced.unshift(...values);
			throw err;
		}
	}

	/**
	 * Stop the coalesce window timer if it is running.
	 * @internal
	 */
	private stopCoalesceTimer(): void {
		if (!Is.empty(this._coalesceTimer)) {
			globalThis.clearTimeout(this._coalesceTimer);
			this._coalesceTimer = undefined;
		}
	}

	/**
	 * Queue a task for the background thread.
	 * @param payload The task payload.
	 * @returns The id of the created task.
	 * @throws GeneralError if no background task component is available to run the write.
	 * @internal
	 */
	private async createMetricValueTask(payload: ITelemetryMetricValueTaskPayload): Promise<string> {
		if (Is.empty(this._backgroundTaskComponent)) {
			throw new GeneralError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"backgroundTaskComponentMissing"
			);
		}

		const taskId = await this._backgroundTaskComponent.create<ITelemetryMetricValueTaskPayload>(
			EntityStorageTelemetryConnector._METRIC_VALUE_TASK_TYPE,
			payload
		);

		if (this._outstandingTaskIds.size === 0) {
			// Nothing was outstanding, so the wait for the thread to show progress starts here.
			this._lastTaskProgress = Date.now();
		}
		this._outstandingTaskIds.add(taskId);
		this.armStallTimer();

		return taskId;
	}

	/**
	 * Wait for the background thread to report a task complete.
	 * @param taskId The id of the task to wait for.
	 * @returns True when the task completed successfully.
	 * @internal
	 */
	private async waitForTask(taskId: string): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const timer = globalThis.setTimeout(async () => {
				this._pendingWrites.delete(taskId);
				await this._logging?.log({
					source: EntityStorageTelemetryConnector.CLASS_NAME,
					message: "flushTimeout",
					level: "warn",
					data: {
						taskId,
						timeoutMs: this._flushTimeoutMs,
						taskCount: this._outstandingTaskIds.size
					}
				});
				resolve(false);
			}, this._flushTimeoutMs);

			this._pendingWrites.set(taskId, { resolve, timer });
		});
	}

	/**
	 * The delay before the next stall check: the configured timeout, doubled per consecutive
	 * replacement not followed by a completion, capped at _STALL_BACKOFF_MAX_MULTIPLIER times.
	 * @returns The delay in milliseconds.
	 * @internal
	 */
	private stallWaitMs(): number {
		const multiplier = Math.min(
			2 ** this._stallRestartCount,
			EntityStorageTelemetryConnector._STALL_BACKOFF_MAX_MULTIPLIER
		);
		return this._taskStallTimeoutMs * multiplier;
	}

	/**
	 * Arm the timer which checks whether the background thread has stopped answering, for
	 * whenever the stall wait will have elapsed with no task having completed.
	 * @internal
	 */
	private armStallTimer(): void {
		if (
			this._taskStallTimeoutMs === 0 ||
			!this._started ||
			!Is.empty(this._stallTimer) ||
			this._stallCheckRunning
		) {
			return;
		}

		const delay = Math.max(this.stallWaitMs() - (Date.now() - this._lastTaskProgress), 0);

		this._stallTimer = globalThis.setTimeout(async () => {
			this._stallTimer = undefined;
			// Blocks a second check from arming while this one, and any replacement, is running.
			this._stallCheckRunning = true;
			try {
				await this.checkForStalledThread();
			} catch (err) {
				// Supervision has to survive its own failures, and an unhandled rejection from
				// a timer would take the process with it.
				await this.logWithoutThrowing({
					source: EntityStorageTelemetryConnector.CLASS_NAME,
					message: "metricValueThreadCheckFailed",
					level: "error",
					error: BaseError.fromError(err)
				});
			} finally {
				this._stallCheckRunning = false;
				if (this._outstandingTaskIds.size > 0) {
					this.armStallTimer();
				}
			}
		}, delay);
	}

	/**
	 * Stop the stall check timer if it is running.
	 * @internal
	 */
	private stopStallTimer(): void {
		if (!Is.empty(this._stallTimer)) {
			globalThis.clearTimeout(this._stallTimer);
			this._stallTimer = undefined;
		}
	}

	/**
	 * Check the oldest outstanding task once none has completed for the stall wait, and act on
	 * its status: missed, still waiting for a worker, or actually stalled.
	 * @returns A promise that resolves when the check, and any action it takes, is complete.
	 * @internal
	 */
	private async checkForStalledThread(): Promise<void> {
		if (!this._started || this._outstandingTaskIds.size === 0) {
			return;
		}

		const stalledForMs = Date.now() - this._lastTaskProgress;

		if (stalledForMs < this.stallWaitMs()) {
			// A task completed while the timer was armed; the caller re-arms for what remains.
			return;
		}

		// No task has completed since the oldest one outstanding was created, so that is the one
		// the thread would be stuck on. Replacing the thread costs whatever the writer has
		// batched, so the task is checked before it is done: a task which is no longer in the
		// queue means a state change was missed rather than the thread having stopped.
		const stalledTaskId = this._outstandingTaskIds.values().next().value as string;
		const stalledTask = await this._backgroundTaskComponent?.get(stalledTaskId);

		if (!this._outstandingTaskIds.has(stalledTaskId)) {
			// Completed, or the connector stopped, while the read above was in flight; already
			// handled by metricValueTaskStateChanged or stop(), so the stale snapshot is moot.
			return;
		}

		if (
			Is.empty(stalledTask) ||
			(stalledTask.status !== TaskStatus.Pending && stalledTask.status !== TaskStatus.Processing)
		) {
			await this.logWithoutThrowing({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueTaskStateMissed",
				level: "warn",
				data: { taskId: stalledTaskId, status: stalledTask?.status }
			});
			this._outstandingTaskIds.clear();
			this._lastTaskProgress = Date.now();
			this._stallRestartCount = 0;
			return;
		}

		if (stalledTask.status === TaskStatus.Pending) {
			// Not yet scheduled, so replacing the thread would not help; report and leave it.
			const scheduledWaitMs = Date.now() - Date.parse(stalledTask.dateCreated);
			await this.logWithoutThrowing({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueTaskNotScheduled",
				level: "warn",
				data: {
					taskId: stalledTaskId,
					stalledForMs: scheduledWaitMs,
					taskCount: this._outstandingTaskIds.size
				}
			});
			this._lastTaskProgress = Date.now();
			return;
		}

		await this.restartMetricValueThread(stalledForMs, stalledTaskId);
	}

	/**
	 * Replace the background thread after it has stopped completing the tasks handed to it.
	 * Nothing else recovers from this: the handler has no execution timeout, so the scheduler
	 * goes on waiting for the one worker it believes is busy and never dispatches for this task
	 * type again. Re-registering the handler terminates that worker, which releases the
	 * scheduler's claim on the task it was given, so the tasks in the queue are dispatched to
	 * the replacement rather than left waiting on a thread that will never answer. Counts toward
	 * the backoff in stallWaitMs() when not followed by a completion.
	 * @param stalledForMs How long the thread has had tasks outstanding without completing one.
	 * @param stalledTaskId The id of the task the thread has not completed.
	 * @returns A promise that resolves when the handler has been re-registered.
	 * @internal
	 */
	private async restartMetricValueThread(
		stalledForMs: number,
		stalledTaskId: string
	): Promise<void> {
		await this.logWithoutThrowing({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricValueThreadStalled",
			level: "error",
			data: { stalledForMs, taskId: stalledTaskId, taskCount: this._outstandingTaskIds.size }
		});

		// The tasks themselves are left in the queue, so the values already handed over are
		// written by the replacement rather than lost. Anything waiting on one of them is
		// released by its own flush timeout, or when the replacement completes it.
		this._outstandingTaskIds.clear();
		this._lastTaskProgress = Date.now();
		this._stallRestartCount += 1;

		try {
			await this._backgroundTaskComponent?.unregisterHandler(
				EntityStorageTelemetryConnector._METRIC_VALUE_TASK_TYPE
			);
			await this.registerMetricValueHandler();

			await this.logWithoutThrowing({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueThreadRestarted",
				level: "warn"
			});
		} catch (err) {
			await this.logWithoutThrowing({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueThreadRestartFailed",
				level: "error",
				error: BaseError.fromError(err)
			});
		}
	}

	/**
	 * Log on one of the paths which has no caller to report to, without the logging itself
	 * becoming the failure. An unhandled rejection from a timer callback would end the
	 * supervision it came from, and take the process with it.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been logged, or given up on.
	 * @internal
	 */
	private async logWithoutThrowing(logEntry: ILogEntry): Promise<void> {
		try {
			await this._logging?.log(logEntry);
		} catch {
			// The logging component is the only sink available, and it writes to storage which is
			// what tends to be failing when this path is reached at all.
		}
	}

	/**
	 * Handle a state change reported for a metric value task.
	 * @param task The task which changed state.
	 * @returns A promise that resolves when any waiting flush has been released.
	 * @internal
	 */
	private async metricValueTaskStateChanged(
		task: IBackgroundTask<ITelemetryMetricValueTaskPayload, undefined>
	): Promise<void> {
		if (
			task.status !== TaskStatus.Success &&
			task.status !== TaskStatus.Failed &&
			task.status !== TaskStatus.Cancelled
		) {
			return;
		}

		// A final state is the only evidence the thread is still working through what it has
		// been given. Only this connector's own tasks are tracked, so a state reported for one
		// belonging to another connector in the process is simply not found.
		this._outstandingTaskIds.delete(task.id);
		this._lastTaskProgress = Date.now();
		this._stallRestartCount = 0;

		// The reset can shorten stallWaitMs() below what the current timer expects, so it is
		// cleared and, if anything is still outstanding, re-armed.
		this.stopStallTimer();
		if (this._outstandingTaskIds.size > 0) {
			this.armStallTimer();
		}

		const pendingWrite = this._pendingWrites.get(task.id);
		if (!Is.empty(pendingWrite)) {
			this._pendingWrites.delete(task.id);
			globalThis.clearTimeout(pendingWrite.timer);
			// Only a successful task means the thread wrote what it was holding, so a failure
			// leaves the counts apart and the next read asks again.
			pendingWrite.resolve(task.status === TaskStatus.Success);
		}

		if (task.status === TaskStatus.Failed) {
			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueTaskFailed",
				level: "error",
				data: { taskId: task.id },
				error: Is.object(task.error) ? BaseError.fromError(task.error) : undefined
			});
		}
	}

	/**
	 * Build the stored entity for a metric definition.
	 * @param metric The metric details.
	 * @returns The entity to store.
	 * @internal
	 */
	private toTelemetryMetric(metric: ITelemetryMetric): TelemetryMetric {
		return {
			id: metric.id,
			label: metric.label,
			type: metric.type,
			unit: metric.unit ?? "",
			description: metric.description ?? "",
			maxHistory: metric.maxHistory
		};
	}

	/**
	 * Check the metric details are complete and consistent before it is stored.
	 * @param metric The metric details.
	 * @throws GeneralError if the maxHistory is not a positive integer.
	 * @internal
	 */
	private validateMetric(metric: ITelemetryMetric): void {
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
	}

	/**
	 * Check the operation is valid for the metric type before it is handed to the background
	 * thread, so the caller still sees an invalid operation as an error.
	 * @param metricType The type of the metric.
	 * @param value The value for the add operation.
	 * @throws GeneralError if the operation cannot be applied to the metric type.
	 * @internal
	 */
	private validateOperation(metricType: MetricType, value: MetricCounterOperation | number): void {
		if (metricType === MetricType.Counter) {
			if (value !== MetricCounterOperation.Increment && !(Is.integer(value) && value > 0)) {
				throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "counterIncOnly");
			}
		} else if (metricType === MetricType.IncDecCounter) {
			if (
				value !== MetricCounterOperation.Increment &&
				value !== MetricCounterOperation.Decrement &&
				!Is.integer(value)
			) {
				throw new GeneralError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"upDownCounterIncOrDecOnly"
				);
			}
		} else if (!Is.number(value)) {
			throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "gaugeNoIncDec");
		}
	}

	/**
	 * Build the partition key used for the metric definition cache.
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
	 * per-request ids) vary within a partition and would split the definition cache and the
	 * background thread batch groups.
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
}
