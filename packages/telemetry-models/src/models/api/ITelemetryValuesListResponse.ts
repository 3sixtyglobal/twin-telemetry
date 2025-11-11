// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetric } from "../ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "../ITelemetryMetricValue.js";

/**
 * Response for telemetry list request.
 */
export interface ITelemetryValuesListResponse {
	/**
	 * The response payload.
	 */
	body: {
		/**
		 * The main metric details.
		 */
		metric: ITelemetryMetric;

		/**
		 * The metric values.
		 */
		entities: ITelemetryMetricValue[];

		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	};
}
