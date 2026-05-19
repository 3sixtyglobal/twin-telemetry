// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The options for the system metrics producer constructor.
 */
export interface ISystemMetricsProducerConstructorOptions {
	/**
	 * Type name of the telemetry component in `ComponentFactory`.
	 * @default "telemetry"
	 */
	telemetryComponentType?: string;

	/**
	 * Per-metric history cap.
	 * @default 1440
	 */
	maxHistory?: number;
}
