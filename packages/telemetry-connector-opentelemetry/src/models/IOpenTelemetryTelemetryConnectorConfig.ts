// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryReaderConfig } from "./IOpenTelemetryReaderConfig.js";

/**
 * The options for the OpenTelemetry telemetry connector constructor.
 */
export interface IOpenTelemetryTelemetryConnectorConfig {
	/**
	 * Timeout in milliseconds for acquiring the inner entity-storage metric write mutex lock.
	 */
	mutexTimeoutMs?: number;

	/**
	 * Number of metric value entries to accumulate before flushing to entity storage.
	 * @default 10
	 */
	batchSize?: number;

	/**
	 * Interval in milliseconds between automatic batch flushes to entity storage.
	 * @default 5000
	 */
	batchIntervalMs?: number;

	/**
	 * Maximum number of entries retained in the write-ahead cache if a flush fails.
	 * @default 1000
	 */
	maxCacheSize?: number;

	/**
	 * The name of the OpenTelemetry meter used to create instruments.
	 * @default twin-telemetry
	 */
	meterName?: string;

	/**
	 * The version reported by the OpenTelemetry meter.
	 * @default 1.0.0
	 */
	meterVersion?: string;

	/**
	 * Named metric-reader configurations keyed by an arbitrary id.
	 * Each entry's `type` field determines which exporter the connector instantiates
	 * in start(). Omit or pass an empty object for a no-op provider (useful for tests).
	 */
	readers?: { [id: string]: IOpenTelemetryReaderConfig };
}
