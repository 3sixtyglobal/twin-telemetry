// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetric } from "../ITelemetryMetric.js";

/**
 * Create a new telemetry metric.
 */
export interface ITelemetryCreateMetricRequest {
	/**
	 * The data to be used in the create.
	 */
	body: ITelemetryMetric;
}
