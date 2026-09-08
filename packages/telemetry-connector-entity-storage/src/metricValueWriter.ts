// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import { BaseError, Coerce, ComponentFactory, Is, Mutex, RandomHelper } from "@twin.org/core";
import { ComparisonOperator, SortDirection } from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import type { ITelemetryMetricValuePayload } from "./models/ITelemetryMetricValuePayload.js";
import type { ITelemetryMetricValueWriterConfig } from "./models/ITelemetryMetricValueWriterConfig.js";

/**
 * Accumulates metric values and persists them to entity storage.
 * Runs on the background thread started by the telemetry connector, so nothing here is
 * cached between flushes; the previous value for a metric is always read from storage,
 * which keeps the counter chain correct when several load balanced nodes write to the
 * same storage.
 */
export class MetricValueWriter {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MetricValueWriter>();

	/**
	 * Default number of entries to accumulate before writing.
	 */
	public static readonly DEFAULT_BATCH_SIZE: number = 10;

	/**
	 * Default interval in milliseconds between automatic writes.
	 */
	public static readonly DEFAULT_BATCH_INTERVAL_MS: number = 5000;

	/**
	 * Default maximum number of entries to hold when a write fails and the entries are re-queued.
	 */
	public static readonly DEFAULT_MAX_CACHE_SIZE: number = 1000;

	/**
	 * Page size used when scanning for values to trim.
	 * Large enough to cover most histories in one or two pages without overwhelming storage.
	 * @internal
	 */
	private static readonly _TRIM_PAGE_SIZE = 1000;

	/**
	 * Unique key used to serialise concurrent flush calls via Mutex.
	 * @internal
	 */
	private readonly _mutexKey: string;

	/**
	 * Entries waiting to be written to storage.
	 * @internal
	 */
	private readonly _pending: ITelemetryMetricValuePayload[];

	/**
	 * The entity storage for the telemetry metric values, resolved when the writer is started.
	 * @internal
	 */
	private _metricValueStorage?: IEntityStorageConnector<TelemetryMetricValue>;

	/**
	 * The component for logging.
	 * @internal
	 */
	private _logging?: ILoggingComponent;

	/**
	 * Write when the pending entries reach this size; undefined or &lt;= 1 disables size based writing.
	 * @internal
	 */
	private _batchSize?: number;

	/**
	 * Write every this many milliseconds; undefined or &lt;= 0 disables timer based writing.
	 * @internal
	 */
	private _batchIntervalMs?: number;

	/**
	 * Maximum entries to keep after a failed write re-queue; 0 means unlimited.
	 * @internal
	 */
	private _maxCacheSize: number;

	/**
	 * The timeout in milliseconds when acquiring the write mutex lock.
	 * @internal
	 */
	private _mutexTimeoutMs?: number;

	/**
	 * Handle for the interval timer, present only while the writer is running.
	 * @internal
	 */
	private _batchTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Is the writer running.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Serialises the writes issued by this instance. The mutex is not re-entrant, so overlapping
	 * writes from the same thread have to queue here rather than contend for the lock.
	 * @internal
	 */
	private _writeChain: Promise<void>;

	/**
	 * Create a new instance of MetricValueWriter.
	 */
	constructor() {
		this._mutexKey = RandomHelper.generateUuidV7("compact");
		this._pending = [];
		this._maxCacheSize = MetricValueWriter.DEFAULT_MAX_CACHE_SIZE;
		this._started = false;
		this._writeChain = Promise.resolve();
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MetricValueWriter.CLASS_NAME;
	}

	/**
	 * Resolve the storage connector and start the interval timer.
	 * @param config The configuration for the writer.
	 * @returns A promise that resolves when the writer is ready to accept metric values.
	 */
	public async start(config?: ITelemetryMetricValueWriterConfig): Promise<void> {
		if (this._started) {
			return;
		}

		this._metricValueStorage = EntityStorageConnectorFactory.get(
			config?.telemetryMetricValueStorageConnectorType ?? "telemetry-metric-value"
		);
		this._logging = ComponentFactory.getIfExists(config?.loggingComponentType);

		const cfgBatchSize = Coerce.integer(config?.batchSize) ?? MetricValueWriter.DEFAULT_BATCH_SIZE;
		this._batchSize = cfgBatchSize > 1 ? cfgBatchSize : undefined;

		const cfgIntervalMs =
			Coerce.integer(config?.batchIntervalMs) ?? MetricValueWriter.DEFAULT_BATCH_INTERVAL_MS;
		this._batchIntervalMs = cfgIntervalMs > 0 ? cfgIntervalMs : undefined;

		const cfgMaxCacheSize =
			Coerce.integer(config?.maxCacheSize) ?? MetricValueWriter.DEFAULT_MAX_CACHE_SIZE;
		this._maxCacheSize = cfgMaxCacheSize > 0 ? cfgMaxCacheSize : 0;

		this._mutexTimeoutMs = Coerce.integer(config?.mutexTimeoutMs);

		this._started = true;
		this.startTimer();
	}

	/**
	 * Write any remaining entries to storage and clear the timer.
	 * @returns A promise that resolves when the final write completes and the timer is cleared.
	 */
	public async stop(): Promise<void> {
		if (this._started) {
			this._started = false;
			this.stopTimer();
		}
		await this.flush();
	}

	/**
	 * Queue metric values to be written to storage.
	 * @param values The metric value details.
	 * @returns A promise that resolves when the values have been queued, or written when batching is disabled.
	 */
	public async add(values: ITelemetryMetricValuePayload[]): Promise<void> {
		// push is synchronous, so there are no yield points and no race with the flush splice.
		this._pending.push(...values);

		const isBatching = !Is.empty(this._batchSize) || !Is.empty(this._batchIntervalMs);
		const isSizeReached = !Is.empty(this._batchSize) && this._pending.length >= this._batchSize;

		if (!isBatching || isSizeReached) {
			await this.flush();
		}
	}

	/**
	 * Write all pending entries to storage and clear them.
	 * Overlapping calls queue behind each other, as entries added after a write has taken its
	 * snapshot would otherwise be skipped by a caller that simply joined it.
	 * @returns A promise that resolves when all pending entries have been written to storage.
	 * @throws GeneralError if the write lock could not be acquired within the timeout.
	 */
	public async flush(): Promise<void> {
		// Take a place in the queue before waiting, so callers run in the order they arrived.
		// The handed on promise is only ever resolved, never rejected, so a failed write does
		// not stop the caller behind it.
		const previous = this._writeChain;
		let release: (() => void) | undefined;
		this._writeChain = new Promise<void>(resolve => {
			release = resolve;
		});

		await previous;

		try {
			await this.writePending();
		} finally {
			release?.();
		}
	}

	/**
	 * Write the entries currently pending to storage.
	 * On a storage write failure the entries are returned to the head of the queue for the next attempt.
	 * @returns A promise that resolves when the pending entries have been written to storage.
	 * @throws GeneralError if the write lock could not be acquired within the timeout.
	 * @internal
	 */
	private async writePending(): Promise<void> {
		this.stopTimer();

		if (this._pending.length === 0) {
			this.startTimer();
			return;
		}

		// The lock is always bounded by a timeout so a holder that died cannot stall the writer
		// forever. Failing loudly leaves the entries queued and lets the task report the failure,
		// rather than telling the caller the write succeeded when nothing was written.
		try {
			await Mutex.lock(this._mutexKey, {
				throwOnTimeout: true,
				timeoutMs: this._mutexTimeoutMs
			});
		} catch (err) {
			this.startTimer();
			throw err;
		}

		try {
			const entries = this._pending.splice(0);

			const groups = new Map<string, ITelemetryMetricValuePayload[]>();
			for (const entry of entries) {
				const contextGroupKey = this.contextKey(entry.contextIds ?? {});
				let group = groups.get(contextGroupKey);
				if (Is.undefined(group)) {
					group = [];
					groups.set(contextGroupKey, group);
				}
				group.push(entry);
			}

			const failedEntries: ITelemetryMetricValuePayload[] = [];
			const errors: unknown[] = [];
			for (const group of groups.values()) {
				try {
					await ContextIdStore.run(group[0].contextIds ?? {}, async () => {
						await this.writeGroup(group);
					});
				} catch (err) {
					failedEntries.push(...group);
					errors.push(err);
				}
			}

			if (Is.arrayValue(errors)) {
				await this._logging?.log({
					source: MetricValueWriter.CLASS_NAME,
					message: "flushFailed",
					level: "error",
					data: { error: errors.length === 1 ? errors[0] : errors }
				});
				this._pending.unshift(...failedEntries);
				if (this._maxCacheSize > 0 && this._pending.length > this._maxCacheSize) {
					this._pending.splice(0, this._pending.length - this._maxCacheSize);
				}
			}
		} finally {
			Mutex.unlock(this._mutexKey);
		}

		this.startTimer();
	}

	/**
	 * Build the partition key used to group the pending entries before writing.
	 * Only the node and tenant ids partition the storage, so the key is built from those two.
	 * @param contextIds The context ids to derive the key from.
	 * @returns The partition key.
	 * @internal
	 */
	private contextKey(contextIds: IContextIds): string {
		return `${contextIds[ContextIdKeys.Node] ?? ""}|${contextIds[ContextIdKeys.Tenant] ?? ""}`;
	}

	/**
	 * Write one partition worth of entries, chaining the counter values from the value
	 * currently held in storage.
	 * @param group The entries for a single partition, in the order they were added.
	 * @returns A promise that resolves when the entries and any history trims are complete.
	 * @internal
	 */
	private async writeGroup(group: ITelemetryMetricValuePayload[]): Promise<void> {
		const metricValueStorage = this._metricValueStorage;
		if (Is.empty(metricValueStorage)) {
			return;
		}

		const byMetric = new Map<string, ITelemetryMetricValuePayload[]>();
		for (const entry of group) {
			let metricGroup = byMetric.get(entry.metricId);
			if (Is.undefined(metricGroup)) {
				metricGroup = [];
				byMetric.set(entry.metricId, metricGroup);
			}
			metricGroup.push(entry);
		}

		const entities: TelemetryMetricValue[] = [];

		// removeBatch is chunked by the storage connectors, so the ids for every metric in the
		// partition are collected here and removed in a single call.
		const idsToRemove: string[] = [];

		// Metrics whose history is longer than one read window, so the cap has to be applied by
		// scanning instead. Keyed by metric id, holding the retention cap.
		const toScan = new Map<string, number>();

		for (const [metricId, metricEntries] of byMetric) {
			// A metric updated mid batch trims to the cap in force at its last write.
			let cap: number | undefined;
			for (const entry of metricEntries) {
				if (Is.integer(entry.maxHistory) && entry.maxHistory > 0) {
					cap = entry.maxHistory;
				}
			}
			const maxHistory = cap;

			const isCapped = Is.integer(maxHistory);

			let window: TelemetryMetricValue[] | undefined;

			// One descending read serves both purposes: the newest row seeds the chain and keeps
			// the timestamps increasing, and anything past the cap is the set to remove. The chain
			// always restarts from storage, as other nodes write to the same partition and any
			// value held in memory here would already be out of date.
			const limit = isCapped ? maxHistory + metricEntries.length : 1;
			const existingMetricValues = await metricValueStorage.query(
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
				[{ property: "ts", sortDirection: SortDirection.Descending }],
				isCapped ? ["id", "ts", "value"] : ["ts", "value"],
				undefined,
				limit
			);
			const rows = existingMetricValues.entities as TelemetryMetricValue[];

			let lastTs = rows[0]?.ts;
			let lastValue = rows[0]?.value;

			if (isCapped) {
				if (rows.length < limit) {
					window = rows;
				} else {
					// A full window means older rows follow that this read cannot see.
					toScan.set(metricId, maxHistory);
				}
			}

			const newIds: string[] = [];

			for (const entry of metricEntries) {
				const newValue = this.applyOperation(entry, lastValue ?? 0);

				if (Is.undefined(newValue)) {
					await this._logging?.log({
						source: MetricValueWriter.CLASS_NAME,
						message: "invalidMetricOperation",
						level: "error",
						data: { id: metricId, type: entry.metricType, operation: entry.operation }
					});
				} else {
					// Keep timestamps strictly increasing per metric to preserve deterministic ordering.
					const ts = Is.notEmpty(lastTs) ? Math.max(entry.ts, lastTs + 1) : entry.ts;

					entities.push({
						id: entry.valueId,
						metricId,
						ts,
						value: newValue,
						customData: entry.customData
					});
					newIds.push(entry.valueId);

					lastTs = ts;
					lastValue = newValue;
				}
			}

			if (!Is.undefined(window) && isCapped) {
				// The rows being added are newer than everything read, so the survivors are the new
				// ids plus however many of the window still fit under the cap.
				idsToRemove.push(
					...window.slice(Math.max(maxHistory - newIds.length, 0)).map(row => row.id)
				);

				// A batch larger than the cap trims its own oldest entries as well.
				const excessNew = newIds.length - maxHistory;
				if (excessNew > 0) {
					idsToRemove.push(...newIds.slice(0, excessNew));
				}
			}
		}

		if (entities.length > 0) {
			await metricValueStorage.setBatch(entities);
		}

		// The values are durable from here, so a trim failure must not put the entries back in
		// the queue: re-applying an operation on top of a value already in storage would count it
		// twice. The cap is applied again by the next write for the metric.
		try {
			for (const [metricId, maxHistory] of toScan) {
				await this.collectHistoryOverflow(metricId, maxHistory, idsToRemove);
			}

			if (idsToRemove.length > 0) {
				await metricValueStorage.removeBatch(idsToRemove);
			}
		} catch (err) {
			await this._logging?.log({
				source: MetricValueWriter.CLASS_NAME,
				message: "trimFailed",
				level: "error",
				error: BaseError.fromError(err)
			});
		}
	}

	/**
	 * Apply a metric operation to the previous value.
	 * The connector validates the operation against the metric type before queueing it, so an
	 * unsupported combination only reaches here if the payload was built elsewhere.
	 * @param entry The entry being written.
	 * @param lastValue The previous value for the metric.
	 * @returns The new value, or undefined when the operation is not valid for the metric type.
	 * @internal
	 */
	private applyOperation(
		entry: ITelemetryMetricValuePayload,
		lastValue: number
	): number | undefined {
		if (entry.metricType === MetricType.Counter) {
			if (entry.operation === MetricCounterOperation.Increment) {
				return lastValue + 1;
			}
			if (Is.integer(entry.operation) && entry.operation > 0) {
				return lastValue + entry.operation;
			}
		} else if (entry.metricType === MetricType.IncDecCounter) {
			if (entry.operation === MetricCounterOperation.Increment) {
				return lastValue + 1;
			}
			if (entry.operation === MetricCounterOperation.Decrement) {
				return lastValue - 1;
			}
			if (Is.integer(entry.operation)) {
				return lastValue + entry.operation;
			}
		} else if (Is.number(entry.operation)) {
			return entry.operation;
		}
	}

	/**
	 * Collect the ids of the values for a metric that exceed its maxHistory cap.
	 * Only used when the history is longer than a single write window, which after the first
	 * trim of a metric means another node has written a great deal in between.
	 * @param metricId The metric id.
	 * @param maxHistory The maximum number of values to retain.
	 * @param idsToRemove The list the overflowing ids are appended to.
	 * @returns A promise that resolves when the overflowing ids have been collected.
	 * @internal
	 */
	private async collectHistoryOverflow(
		metricId: string,
		maxHistory: number,
		idsToRemove: string[]
	): Promise<void> {
		const metricValueStorage = this._metricValueStorage;
		if (Is.empty(metricValueStorage)) {
			return;
		}

		// Walk the history oldest first, holding only the newest maxHistory ids seen so far.
		// Anything that falls out of that window is beyond the cap, so the memory used is bounded
		// by the retention cap rather than by how large the table has grown.
		const retained: string[] = [];
		let cursor: string | undefined;

		do {
			const page = await metricValueStorage.query(
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
				[{ property: "ts", sortDirection: SortDirection.Ascending }],
				["id"],
				cursor,
				MetricValueWriter._TRIM_PAGE_SIZE
			);

			for (const entity of page.entities) {
				retained.push(entity.id as string);
				if (retained.length > maxHistory) {
					idsToRemove.push(retained.shift() as string);
				}
			}

			cursor = page.cursor;
		} while (Is.stringValue(cursor));
	}

	/**
	 * Start the interval timer if batchIntervalMs is configured and the writer is running.
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
