// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { MetricCounterOperation } from "./metricCounterOperation.js";

/**
 * A single metric value in a batch add operation.
 */
export interface ITelemetryMetricValueEntry {
	/**
	 * The id of the metric.
	 */
	id: string;

	/**
	 * The value for the add operation.
	 */
	value: MetricCounterOperation | number;

	/**
	 * The custom data for the metric value.
	 */
	customData?: { [key: string]: unknown };
}
