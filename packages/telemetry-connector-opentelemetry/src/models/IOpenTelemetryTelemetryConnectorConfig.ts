// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryReaderConfig } from "./IOpenTelemetryReaderConfig.js";

/**
 * The options for the OpenTelemetry telemetry connector constructor.
 */
export interface IOpenTelemetryTelemetryConnectorConfig {
	/**
	 * The name of the OpenTelemetry meter used to create instruments.
	 * @default twin-telemetry
	 */
	meterName?: string;

	/**
	 * The version reported by the OpenTelemetry meter.
	 * @default 0.0.1
	 */
	meterVersion?: string;

	/**
	 * Named metric-reader configurations keyed by an arbitrary id.
	 * Each entry's `type` field determines which exporter the connector instantiates
	 * in start(). Omit or pass an empty object for a no-op provider (useful for tests).
	 */
	readers?: { [id: string]: IOpenTelemetryReaderConfig };
}
