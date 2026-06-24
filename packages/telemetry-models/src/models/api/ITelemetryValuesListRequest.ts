// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Get the a list of the telemetry values.
 */
export interface ITelemetryValuesListRequest {
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
	 * The query parameters.
	 */
	query?: {
		/**
		 * The start time of the metrics to retrieve as a timestamp in ms.
		 */
		timeStart?: string;

		/**
		 * The end time of the metrics to retrieve as a timestamp in ms.
		 */
		timeEnd?: string;

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
