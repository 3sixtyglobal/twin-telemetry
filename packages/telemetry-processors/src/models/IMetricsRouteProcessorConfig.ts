// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the MetricsRouteProcessor.
 */
export interface IMetricsRouteProcessorConfig {
	/**
	 * URL path prefixes that should not be recorded as metrics.
	 * Useful for suppressing noise from health-check or metrics-scrape endpoints.
	 */
	excludePaths?: string[];

	/**
	 * Maximum number of request values to retain. A value is recorded for every request that
	 * is not excluded, so without a cap the history grows for as long as the node serves
	 * traffic; values &lt;= 0 retain everything.
	 * @default 10000.
	 */
	maxHistory?: number;
}
