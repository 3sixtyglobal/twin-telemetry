// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The configuration for the entity storage telemetry connector.
 */
export interface IEntityStorageTelemetryConnectorConfig {
	/**
	 * The timeout in milliseconds for acquiring the metric write mutex lock.
	 */
	mutexTimeoutMs?: number;

	/**
	 * Flush the cache when it reaches this many entries; values &lt;= 1 disable size-based flushing.
	 * @default 10.
	 */
	batchSize?: number;

	/**
	 * Flush the cache every this many milliseconds; values &lt;= 0 disable timer-based flushing.
	 * @default 5000.
	 */
	batchIntervalMs?: number;

	/**
	 * Maximum entries to retain in the cache if a flush fails and entries are re-queued.
	 * 0 means unlimited.
	 * @default 1000.
	 */
	maxCacheSize?: number;

	/**
	 * Maximum number of metric definitions held in the in-memory definition cache.
	 * Keyed the same way as the last value cache, so it should not be set lower than
	 * lastValueCacheCapacity or writes will read definitions from storage.
	 * @default 1000.
	 */
	metricDefinitionCacheCapacity?: number;

	/**
	 * Time-to-idle in milliseconds for cached metric definitions.
	 * @default 3600000.
	 */
	metricDefinitionCacheTtiMs?: number;

	/**
	 * Maximum number of metrics whose last value is held in memory; values &lt;= 0 mean unlimited.
	 * Evicting an entry only costs a storage read on the next write for that metric.
	 * @default 1000.
	 */
	lastValueCacheCapacity?: number;

	/**
	 * Time-to-idle in milliseconds for cached last values; values &lt;= 0 disable expiry.
	 * Releases memory held for metrics that have stopped being written to.
	 * @default 3600000.
	 */
	lastValueCacheTtiMs?: number;

	/**
	 * Largest maxHistory for which the retained value ids are held in memory rather than read from
	 * storage on every trim. Metrics with a larger cap fall back to scanning.
	 * @default 1000.
	 */
	maxTrackedHistory?: number;

	/**
	 * Total number of retained value ids held across all metrics; values &lt;= 0 mean unlimited.
	 * Bounds the memory used by history tracking independently of how many metrics are cached.
	 * @default 50000.
	 */
	trackedHistoryBudget?: number;
}
