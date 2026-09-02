// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IMetricsRouteProcessorConfig } from "./IMetricsRouteProcessorConfig.js";

/**
 * Constructor options for the MetricsRouteProcessor.
 */
export interface IMetricsRouteProcessorConstructorOptions {
	/**
	 * The component type to use for the telemetry component.
	 */
	telemetryComponentType?: string;

	/**
	 * The component type to use for logging metric recording failures.
	 */
	loggingComponentType?: string;

	/**
	 * Optional processor configuration.
	 */
	config?: IMetricsRouteProcessorConfig;
}
