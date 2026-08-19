// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { TelemetryMetricValue } from "../entities/telemetryMetricValue.js";

/**
 * An entry held in the in-memory batch cache, waiting to be written to storage.
 */
export interface IBatchMetricValueEntry {
	/**
	 * The metric value entity to write.
	 */
	entity: TelemetryMetricValue;

	/**
	 * Maximum history retained for the metric; undefined when the metric has no cap.
	 */
	maxHistory?: number;
}
