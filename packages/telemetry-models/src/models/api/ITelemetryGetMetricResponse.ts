// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetric } from "../ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "../ITelemetryMetricValue.js";

/**
 * Get a telemetry metric response.
 */
export interface ITelemetryGetMetricResponse {
	/**
	 * The body parameters.
	 */
	body: {
		/**
		 * The metric.
		 */
		metric: ITelemetryMetric;

		/**
		 * The latest metric value.
		 */
		value?: ITelemetryMetricValue;
	};
}
