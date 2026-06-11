// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The options for the telemetry service constructor.
 */
export interface ITelemetryServiceConstructorOptions {
	/**
	 * The type of the telemetry connector to use.
	 * @default telemetry
	 */
	telemetryConnectorType?: string;

	/**
	 * The type of the platform component to use for partition iteration.
	 * @default platform
	 */
	platformComponentType?: string;
}
