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
}
