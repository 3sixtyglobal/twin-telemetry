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
}
