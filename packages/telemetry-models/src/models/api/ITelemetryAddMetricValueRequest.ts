// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { MetricCounterOperation } from "../metricCounterOperation.js";

/**
 * Add a telemetry metric value.
 */
export interface ITelemetryAddMetricValueRequest {
	/**
	 * The path parameters.
	 */
	pathParams: {
		/**
		 * The id of the metric.
		 */
		id: string;
	};

	/**
	 * The data to be used in the update.
	 */
	body: {
		/**
		 * The value for the update operation.
		 */
		value: MetricCounterOperation | number;

		/**
		 * The custom data for the update operation.
		 */
		customData?: { [key: string]: unknown };
	};
}
