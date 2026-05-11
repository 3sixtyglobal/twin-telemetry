// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryTelemetryConnectorConfig } from "./IOpenTelemetryTelemetryConnectorConfig.js";

/**
 * The options for the OpenTelemetry telemetry connector constructor.
 */
export interface IOpenTelemetryTelemetryConnectorConstructorOptions {
	/**
	 * The component type to use for logging inside the connector and the inner
	 * entity-storage connector. When omitted logging is disabled.
	 */
	loggingComponentType?: string;

	/**
	 * The entity storage connector type to use for storing metric definitions.
	 * Must be registered in `EntityStorageConnectorFactory` before calling `start()`.
	 * @default telemetry-metric
	 */
	telemetryMetricStorageConnectorType?: string;

	/**
	 * The entity storage connector type to use for storing metric values.
	 * Must be registered in `EntityStorageConnectorFactory` before calling `start()`.
	 * @default telemetry-metric-value
	 */
	telemetryMetricValueStorageConnectorType?: string;

	/**
	 * The config for the telemetry connector.
	 */
	config?: IOpenTelemetryTelemetryConnectorConfig;
}
