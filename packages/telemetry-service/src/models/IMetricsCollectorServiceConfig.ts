// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The options for the metrics collector service config.
 */
export interface IMetricsCollectorServiceConfig {
	/**
	 * Polling interval in milliseconds.
	 * @default 60000
	 */
	intervalMs?: number;
}
