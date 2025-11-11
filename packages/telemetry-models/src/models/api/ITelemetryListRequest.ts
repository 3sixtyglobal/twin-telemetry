// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { MetricType } from "../metricType.js";

/**
 * Get the a list of the telemetry metrics.
 */
export interface ITelemetryListRequest {
	/**
	 * The query parameters.
	 */
	query?: {
		/**
		 * The type of the metric.
		 */
		type?: MetricType;

		/**
		 * The optional cursor to get next chunk.
		 */
		cursor?: string;

		/**
		 * Limit the number of entities to return.
		 */
		limit?: string;
	};
}
