// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IContextIds } from "@twin.org/context";
import type { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";

/**
 * The details of a metric value handed to the background thread to be written.
 */
export interface ITelemetryMetricValuePayload {
	/**
	 * The id the metric value will be stored under, allocated by the connector so it can be
	 * returned to the caller before the value reaches storage.
	 */
	valueId: string;

	/**
	 * The id of the metric the value belongs to.
	 */
	metricId: string;

	/**
	 * The type of the metric, used to apply the operation to the previous value.
	 */
	metricType: MetricType;

	/**
	 * The operation to apply to the previous value.
	 */
	operation: MetricCounterOperation | number;

	/**
	 * The time the value was captured.
	 */
	ts: number;

	/**
	 * The maximum number of values retained for the metric; undefined when the metric has no cap.
	 */
	maxHistory?: number;

	/**
	 * The custom data for the metric value.
	 */
	customData?: { [key: string]: unknown };

	/**
	 * The partition context ids captured when the value was added; the write is performed
	 * under this context.
	 */
	contextIds?: IContextIds;
}
