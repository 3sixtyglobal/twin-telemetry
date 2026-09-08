// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetric } from "../ITelemetryMetric.js";

/**
 * Create one or more telemetry metrics.
 */
export interface ITelemetryCreateMetricRequest {
	/**
	 * The data to be used in the create. A single metric fails if it already exists; an array
	 * declares the set that should exist, creating the ones that are missing.
	 */
	body: ITelemetryMetric | ITelemetryMetric[];
}
