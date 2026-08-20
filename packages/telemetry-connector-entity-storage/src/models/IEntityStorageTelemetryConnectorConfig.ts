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
}
