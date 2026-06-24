// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { MetricType } from "./metricType.js";

/**
 * Interface describing a telemetry metric.
 */
export interface ITelemetryMetric {
	/**
	 * The id of the metric.
	 */
	id: string;

	/**
	 * The label of the metric.
	 */
	label: string;

	/**
	 * The type of the metric.
	 */
	type: MetricType;

	/**
	 * Description.
	 */
	description?: string;

	/**
	 * The unit the metric describes.
	 */
	unit?: string;

	/**
	 * The maximum number of values to retain; oldest are trimmed on each addMetricValue call.
	 * Unlimited when absent.
	 */
	maxHistory?: number;
}
