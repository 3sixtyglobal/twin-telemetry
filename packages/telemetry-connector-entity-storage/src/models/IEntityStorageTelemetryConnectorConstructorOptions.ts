// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IEntityStorageTelemetryConnectorConfig } from "./IEntityStorageTelemetryConnectorConfig.js";

/**
 * The options for the entity storage telemetry connector constructor.
 */
export interface IEntityStorageTelemetryConnectorConstructorOptions {
	/**
	 * The type of the entity storage connector to use.
	 * @default telemetry-metric
	 */
	telemetryMetricStorageConnectorType?: string;

	/**
	 * The type of the entity storage connector to use.
	 * @default telemetry-metric-value
	 */
	telemetryMetricValueStorageConnectorType?: string;

	/**
	 * The type of the logging component to use, can be undefined for no logging.
	 */
	loggingComponentType?: string;

	/**
	 * The type of the background task component which runs the metric value writes on a
	 * background thread.
	 * @default background-task
	 */
	backgroundTaskComponentType?: string;

	/**
	 * The configuration for the connector.
	 */
	config?: IEntityStorageTelemetryConnectorConfig;
}
