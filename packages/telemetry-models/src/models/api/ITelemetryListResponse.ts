// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetric } from "../ITelemetryMetric.js";

/**
 * Response for telemetry list request.
 */
export interface ITelemetryListResponse {
	/**
	 * The response payload.
	 */
	body: {
		/**
		 * The metrics.
		 */
		entities: ITelemetryMetric[];

		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	};
}
