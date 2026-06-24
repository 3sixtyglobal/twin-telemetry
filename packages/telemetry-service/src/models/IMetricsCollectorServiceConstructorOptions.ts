// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IMetricsCollectorServiceConfig } from "./IMetricsCollectorServiceConfig.js";

/**
 * The options for the metrics collector service constructor.
 */
export interface IMetricsCollectorServiceConstructorOptions {
	/**
	 * The type of the logging component to use, can be undefined for no logging.
	 */
	loggingComponentType?: string;

	/**
	 * The type of the platform component to use for partitioned producers.
	 * @default platform
	 */
	platformComponentType?: string;

	/**
	 * The configuration options for the metrics collector service.
	 */
	config?: IMetricsCollectorServiceConfig;
}
