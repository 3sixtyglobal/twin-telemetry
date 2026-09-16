// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import { BaseError, Coerce, ComponentFactory, Is } from "@twin.org/core";
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
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import type { ITelemetryMetricValuePayload } from "./models/ITelemetryMetricValuePayload.js";
import type { ITelemetryMetricValueWriterConfig } from "./models/ITelemetryMetricValueWriterConfig.js";

/**
 * Accumulates metric values and persists them to entity storage.
 * Runs on the background thread started by the telemetry connector. The value a counter
 * builds on is always read from storage rather than cached, which keeps the chain correct
 * when several load balanced nodes write to the same storage, and that read is of the newest
 * value alone, so the cost of a write does not grow with the history it is appending to. A
 * gauge replaces the stored value rather than building on it, so it is written without any
 * read at all. The retention cap is applied by the trim pass on its own interval.
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
	 * Default interval in milliseconds between trim passes.
	 */
	public static readonly DEFAULT_TRIM_INTERVAL_MS: number = 60000;

	/**
	 * Default maximum number of values a single trim pass removes from one metric.
	 */
	public static readonly DEFAULT_TRIM_REMOVE_LIMIT: number = 10000;

	/**
	 * Page size used when removing the values which fall outside the retention cap.
	 * Large enough to clear most overflows in one or two pages without overwhelming storage.
	 * @internal
	 */
	private static readonly _TRIM_PAGE_SIZE = 1000;

	/**
	 * Entries waiting to be written to storage.
	 * @internal
	 */
	private readonly _pending: ITelemetryMetricValuePayload[];

	/**
	 * The capped metrics written since the last trim pass, keyed by partition and metric id.
	 * A metric is only removed once its history is back inside the cap, so an overflow larger
	 * than a single pass can remove is finished by the passes which follow it.
	 * @internal
	 */
	private readonly _toTrim: Map<
		string,
		{ metricId: string; maxHistory: number; contextIds: IContextIds }
	>;

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
	 * Run a trim pass every this many milliseconds; undefined disables trimming.
	 * @internal
	 */
	private _trimIntervalMs?: number;

	/**
	 * Maximum values a single trim pass removes from one metric.
	 * @internal
	 */
	private _trimRemoveLimit: number;

	/**
	 * Handle for the interval timer, present only while the writer is running.
	 * @internal
	 */
	private _batchTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Handle for the trim timer, present only while the writer is running.
	 * @internal
	 */
	private _trimTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Is a trim pass in progress, so the timer does not start a second one over it.
	 * @internal
	 */
	private _trimRunning: boolean;

	/**
	 * Is the writer running.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Serialises the writes issued by this instance, as writePending is only ever entered from
	 * flush and an entry added after a write has taken its snapshot would otherwise be skipped
	 * by a caller which simply joined it.
	 * @internal
	 */
	private _writeChain: Promise<void>;

	/**
	 * Create a new instance of MetricValueWriter.
	 */
	constructor() {
		this._pending = [];
		this._toTrim = new Map();
		this._maxCacheSize = MetricValueWriter.DEFAULT_MAX_CACHE_SIZE;
		this._trimRemoveLimit = MetricValueWriter.DEFAULT_TRIM_REMOVE_LIMIT;
		this._started = false;
		this._trimRunning = false;
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

		const cfgTrimIntervalMs =
			Coerce.integer(config?.trimIntervalMs) ?? MetricValueWriter.DEFAULT_TRIM_INTERVAL_MS;
		this._trimIntervalMs = cfgTrimIntervalMs > 0 ? cfgTrimIntervalMs : undefined;

		const cfgTrimRemoveLimit =
			Coerce.integer(config?.trimRemoveLimit) ?? MetricValueWriter.DEFAULT_TRIM_REMOVE_LIMIT;
		this._trimRemoveLimit =
			cfgTrimRemoveLimit > 0 ? cfgTrimRemoveLimit : MetricValueWriter.DEFAULT_TRIM_REMOVE_LIMIT;

		this._started = true;
		this.startTimer();
		this.startTrimTimer();
	}

	/**
	 * Write any remaining entries to storage and clear the timer.
	 * @returns A promise that resolves when the final write completes and the timer is cleared.
	 */
	public async stop(): Promise<void> {
		if (this._started) {
			this._started = false;
			this.stopTimer();
			this.stopTrimTimer();
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
	 * Apply the retention cap to every capped metric written since the last pass.
	 * Runs on its own interval rather than on the write path, and removes at most
	 * trimRemoveLimit values per metric, so a history far beyond its cap is brought back over
	 * several passes instead of stalling one write.
	 * @returns A promise that resolves when the pass is complete.
	 */
	public async trim(): Promise<void> {
		if (this._trimRunning) {
			return;
		}
		this._trimRunning = true;

		try {
			// Snapshotted because a write landing during the pass adds to the map, and those
			// metrics are picked up by the next pass rather than extending this one.
			for (const [key, target] of [...this._toTrim]) {
				try {
					const isComplete = await ContextIdStore.run(target.contextIds, async () =>
						this.trimMetric(target.metricId, target.maxHistory)
					);

					// An incomplete pass leaves the metric registered so the next one continues it.
					if (isComplete) {
						this._toTrim.delete(key);
					}
				} catch (err) {
					await this._logging?.log({
						source: MetricValueWriter.CLASS_NAME,
						message: "trimFailed",
						level: "error",
						data: { id: target.metricId },
						error: BaseError.fromError(err)
					});
				}
			}
		} finally {
			this._trimRunning = false;
		}
	}

	/**
	 * Write the entries currently pending to storage.
	 * On a storage write failure the entries are returned to the head of the queue for the next attempt.
	 * @returns A promise that resolves when the pending entries have been written to storage.
	 * @internal
	 */
	private async writePending(): Promise<void> {
		this.stopTimer();

		if (this._pending.length === 0) {
			this.startTimer();
			return;
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
				// Re-queued before the failure is reported, as the reporting writes to storage
				// too: a failure in it would otherwise take the entries with it.
				this._pending.unshift(...failedEntries);
				if (this._maxCacheSize > 0 && this._pending.length > this._maxCacheSize) {
					this._pending.splice(0, this._pending.length - this._maxCacheSize);
				}

				await this._logging?.log({
					source: MetricValueWriter.CLASS_NAME,
					message: "flushFailed",
					level: "error",
					data: { error: errors.length === 1 ? errors[0] : errors }
				});
			}
		} finally {
			// Re-armed here rather than after the block, so a failure inside it cannot leave the
			// writer without its interval for the life of the thread.
			this.startTimer();
		}
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
	 * @returns A promise that resolves when the entries have been written.
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

		for (const [metricId, metricEntries] of byMetric) {
			// A metric updated mid batch is capped at the value in force at its last write.
			let cap: number | undefined;
			for (const entry of metricEntries) {
				if (Is.integer(entry.maxHistory) && entry.maxHistory > 0) {
					cap = entry.maxHistory;
				}
			}

			const metricKey = `${this.contextKey(metricEntries[0].contextIds ?? {})}|${metricId}`;

			// Only the counter types build on the value already stored; a gauge replaces it, so
			// it has nothing to read.
			const isChained = metricEntries.some(
				entry =>
					entry.metricType === MetricType.Counter || entry.metricType === MetricType.IncDecCounter
			);

			let lastTs: number | undefined;
			let lastValue: number | undefined;

			if (isChained) {
				// Only the newest row is read: it seeds the chain and keeps the timestamps
				// increasing, which is everything a chained write needs. The chain always restarts
				// from storage, as other nodes write to the same partition and any value held in
				// memory here would already be out of date. The retention cap is applied by the
				// trim pass instead, so the cost of a write does not grow with the history behind
				// it.
				const existingMetricValues = await metricValueStorage.query(
					{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
					[{ property: "ts", sortDirection: SortDirection.Descending }],
					["ts", "value"],
					undefined,
					1
				);
				const newest = existingMetricValues.entities[0] as TelemetryMetricValue | undefined;

				lastTs = newest?.ts;
				lastValue = newest?.value;
			}

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
					// A chained metric keeps its timestamps strictly increasing, so the order its
					// values were written in is never ambiguous. A gauge builds on nothing, so it
					// is stored with the timestamp it arrived with.
					const ts = isChained && Is.notEmpty(lastTs) ? Math.max(entry.ts, lastTs + 1) : entry.ts;

					entities.push({
						id: entry.valueId,
						metricId,
						ts,
						value: newValue,
						customData: entry.customData
					});

					lastTs = ts;
					lastValue = newValue;
				}
			}

			if (Is.integer(cap)) {
				this._toTrim.set(metricKey, {
					metricId,
					maxHistory: cap,
					contextIds: metricEntries[0].contextIds ?? {}
				});
			}
		}

		if (entities.length > 0) {
			await metricValueStorage.setBatch(entities);
		}
	}

	/**
	 * Remove the values of a metric which fall outside its retention cap.
	 * @param metricId The metric id.
	 * @param maxHistory The maximum number of values to retain.
	 * @returns True when the history is back inside the cap, false when the removal limit was
	 * reached first and there is more to remove.
	 * @internal
	 */
	private async trimMetric(metricId: string, maxHistory: number): Promise<boolean> {
		const metricValueStorage = this._metricValueStorage;
		if (Is.empty(metricValueStorage)) {
			return true;
		}

		// The newest maxHistory values are the ones to keep, so finding the boundary costs the
		// cap rather than the length of the history however far past the cap it has grown.
		// Ordering on the value as well as the timestamp gives the boundary a discriminator for
		// the values which share a timestamp, which a gauge produces whenever two are set in the
		// same millisecond. Both columns are indexed.
		const retained = await metricValueStorage.query(
			{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
			[
				{ property: "ts", sortDirection: SortDirection.Descending },
				{ property: "value", sortDirection: SortDirection.Descending }
			],
			["ts", "value"],
			undefined,
			maxHistory
		);

		if (retained.entities.length < maxHistory) {
			return true;
		}

		const boundary = retained.entities[maxHistory - 1] as TelemetryMetricValue;

		// Everything the boundary read did not reach, expressed the same way it was ordered, so
		// the pages below are a range rather than a scan the retained values have to be sifted
		// out of. Values matching the boundary on both columns are kept, which leaves the history
		// over the cap by however many of those there are until a later write moves the boundary.
		const beyondCap: EntityCondition<TelemetryMetricValue> = {
			conditions: [
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: metricId },
				{
					conditions: [
						{ property: "ts", comparison: ComparisonOperator.LessThan, value: boundary.ts },
						{
							conditions: [
								{ property: "ts", comparison: ComparisonOperator.Equals, value: boundary.ts },
								{
									property: "value",
									comparison: ComparisonOperator.LessThan,
									value: boundary.value
								}
							],
							logicalOperator: LogicalOperator.And
						}
					],
					logicalOperator: LogicalOperator.Or
				}
			],
			logicalOperator: LogicalOperator.And
		};

		let removed = 0;
		while (removed < this._trimRemoveLimit) {
			const pageSize = Math.min(MetricValueWriter._TRIM_PAGE_SIZE, this._trimRemoveLimit - removed);

			// No cursor is needed, as each page is removed before the next is read.
			const page = await metricValueStorage.query(
				beyondCap,
				[{ property: "ts", sortDirection: SortDirection.Ascending }],
				["id"],
				undefined,
				pageSize
			);

			if (page.entities.length === 0) {
				return true;
			}

			await metricValueStorage.removeBatch(page.entities.map(entity => entity.id as string));
			removed += page.entities.length;

			if (page.entities.length < pageSize) {
				return true;
			}
		}

		return false;
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
	 * Start the interval timer if batchIntervalMs is configured and the writer is running.
	 * @internal
	 */
	private startTimer(): void {
		if (!Is.empty(this._batchIntervalMs) && Is.empty(this._batchTimer) && this._started) {
			this._batchTimer = globalThis.setTimeout(async () => {
				// Nothing is waiting on the interval write, so a failure has to be reported and
				// dropped here. An unhandled rejection in a timer takes down the worker thread,
				// and a thread which has gone is indistinguishable to the scheduler from one
				// still busy with a task, so it would never dispatch for this task type again.
				try {
					await this.flush();
				} catch (err) {
					try {
						await this._logging?.log({
							source: MetricValueWriter.CLASS_NAME,
							message: "intervalWriteFailed",
							level: "error",
							error: BaseError.fromError(err)
						});
					} catch {
						// need to make sure a logging exception doesn't kill the timer
					}
				}
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

	/**
	 * Start the trim timer if trimIntervalMs is configured and the writer is running.
	 * @internal
	 */
	private startTrimTimer(): void {
		if (!Is.empty(this._trimIntervalMs) && Is.empty(this._trimTimer) && this._started) {
			this._trimTimer = globalThis.setTimeout(async () => {
				this._trimTimer = undefined;
				try {
					// Deliberately not serialised with the writes: a trim only removes values
					// older than the cap and a write only reads the newest one and appends, so
					// the two cannot contend, and chaining them would put the trim back on the
					// path of the reads waiting for a flush.
					await this.trim();
				} catch (err) {
					try {
						await this._logging?.log({
							source: MetricValueWriter.CLASS_NAME,
							message: "trimPassFailed",
							level: "error",
							error: BaseError.fromError(err)
						});
					} catch {
						// need to make sure a logging exception doesn't kill the timer
					}
				}
				this.startTrimTimer();
			}, this._trimIntervalMs);
		}
	}

	/**
	 * Stop the trim timer if it is running.
	 * @internal
	 */
	private stopTrimTimer(): void {
		if (!Is.empty(this._trimTimer)) {
			globalThis.clearTimeout(this._trimTimer);
			this._trimTimer = undefined;
		}
	}
}
