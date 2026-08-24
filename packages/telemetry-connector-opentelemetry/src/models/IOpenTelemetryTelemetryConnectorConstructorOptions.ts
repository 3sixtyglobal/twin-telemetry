// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryTelemetryConnectorConfig } from "./IOpenTelemetryTelemetryConnectorConfig.js";

/**
 * The options for the OpenTelemetry telemetry connector constructor.
 */
export interface IOpenTelemetryTelemetryConnectorConstructorOptions {
	/**
	 * The config for the telemetry connector.
	 */
	config?: IOpenTelemetryTelemetryConnectorConfig;
}
