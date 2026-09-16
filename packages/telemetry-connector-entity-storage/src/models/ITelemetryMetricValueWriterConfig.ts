// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The configuration for the writer which persists the metric values on the background thread.
 */
export interface ITelemetryMetricValueWriterConfig {
	/**
	 * The type of the entity storage connector the values are written to.
	 * @default telemetry-metric-value
	 */
	telemetryMetricValueStorageConnectorType?: string;

	/**
	 * The type of the logging component to use, can be undefined for no logging.
	 */
	loggingComponentType?: string;

	/**
	 * Write the pending values when this many have accumulated; values &lt;= 1 disable size based writing.
	 * @default 10.
	 */
	batchSize?: number;

	/**
	 * Write the pending values every this many milliseconds; values &lt;= 0 disable timer based writing.
	 * @default 5000.
	 */
	batchIntervalMs?: number;

	/**
	 * Maximum entries to retain if a write fails and the entries are re-queued.
	 * 0 means unlimited.
	 * @default 1000.
	 */
	maxCacheSize?: number;

	/**
	 * Apply the retention caps of the metrics written since the last pass every this many
	 * milliseconds; values &lt;= 0 disable trimming. The cap is applied here rather than on the
	 * write path, so a metric can sit over its cap by however many values arrive within one
	 * interval.
	 * @default 60000.
	 */
	trimIntervalMs?: number;

	/**
	 * Maximum values a single trim pass removes from one metric, so a history far beyond its
	 * cap is brought back over several passes rather than in one long write.
	 * @default 10000.
	 */
	trimRemoveLimit?: number;
}
