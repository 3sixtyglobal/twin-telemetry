// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The configuration for the entity storage telemetry connector.
 */
export interface IEntityStorageTelemetryConnectorConfig {
	/**
	 * The timeout in milliseconds for acquiring the metric value write lock on the background thread.
	 */
	mutexTimeoutMs?: number;

	/**
	 * The background thread writes the pending values when it has this many entries;
	 * values &lt;= 1 disable size based writing.
	 * @default 10.
	 */
	batchSize?: number;

	/**
	 * The background thread writes the pending values every this many milliseconds;
	 * values &lt;= 0 disable timer based writing.
	 * @default 5000.
	 */
	batchIntervalMs?: number;

	/**
	 * Maximum entries the background thread retains if a write fails and entries are re-queued.
	 * 0 means unlimited.
	 * @default 1000.
	 */
	maxCacheSize?: number;

	/**
	 * How long in milliseconds to wait for the background thread to confirm a flush before
	 * continuing without it.
	 * @default 30000.
	 */
	flushTimeoutMs?: number;

	/**
	 * Hold values for this many milliseconds so several share a single background task; values
	 * &lt;= 0 create a task per value. Adds up to this much latency before a value reaches the
	 * thread, in exchange for far fewer task queue writes and no task write on the caller's path.
	 * One task carries a whole window however many values it holds, so this is also what limits
	 * the task rate; a window short enough to produce more tasks than the scheduler can drain
	 * leaves the queue growing without bound and every read waiting flushTimeoutMs.
	 * @default 1000.
	 */
	taskCoalesceMs?: number;

	/**
	 * How long in milliseconds to allow with tasks outstanding and none of them completing
	 * before the oldest is checked. A task not yet given to a worker is reported rather than
	 * replaced; only a task a worker took and never completed is treated as a stalled thread
	 * and replaced. Without this a single task which never completes ends metric collection for
	 * the life of the process, as the scheduler goes on waiting for the one worker it believes
	 * is still busy.
	 * Values &lt;= 0 disable the check.
	 * @default 60000.
	 */
	taskStallTimeoutMs?: number;

	/**
	 * Maximum number of metric definitions held in the in-memory definition cache.
	 * Definitions are immutable once registered, so they are safe to cache across nodes.
	 * @default 1000.
	 */
	metricDefinitionCacheCapacity?: number;

	/**
	 * Time-to-idle in milliseconds for cached metric definitions.
	 * @default 3600000.
	 */
	metricDefinitionCacheTtiMs?: number;

	/**
	 * The URL of the module to use for the metric value background task.
	 * If not provided, the default telemetryMetricValueTask module will be used.
	 */
	overrideMetricValueTaskHandler?: string;
}
