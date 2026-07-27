// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetricValue } from "../ITelemetryMetricValue.js";

/**
 * Get a telemetry metric value response.
 */
export interface ITelemetryGetMetricValueResponse {
	/**
	 * The body parameters.
	 */
	body: ITelemetryMetricValue;
}
