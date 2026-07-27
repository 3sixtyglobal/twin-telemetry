// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Get a telemetry metric value.
 */
export interface ITelemetryGetMetricValueRequest {
	/**
	 * The path parameters.
	 */
	pathParams: {
		/**
		 * The id of the metric.
		 */
		id: string;

		/**
		 * The id of the metric value.
		 */
		valueId: string;
	};
}
