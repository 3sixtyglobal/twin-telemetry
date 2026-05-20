// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { AlreadyExistsError, BaseError, Is } from "@twin.org/core";
import type { ITelemetryComponent } from "../models/ITelemetryComponent.js";
import type { ITelemetryMetric } from "../models/ITelemetryMetric.js";
import { MetricCounterOperation } from "../models/metricCounterOperation.js";

/**
 * Helper class for performing common metric operations, swallowing any errors from the telemetry component.
 */
export class MetricHelper {
	/**
	 * Create multiple metrics if they don't already exist, swallowing any already exists errors.
	 * @param telemetryComponent The telemetry component to use for creating the metrics.
	 * @param metrics The telemetry metrics to create.
	 */
	public static async createMetrics(
		telemetryComponent: ITelemetryComponent | undefined,
		metrics: ITelemetryMetric[]
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			for (const metric of metrics) {
				await MetricHelper.createMetric(telemetryComponent, metric);
			}
		}
	}

	/**
	 * Create a metric if it doesn't already exist, swallowing any already exists errors.
	 * @param telemetryComponent The telemetry component to use for creating the metric.
	 * @param metric The telemetry metric to create.
	 */
	public static async createMetric(
		telemetryComponent: ITelemetryComponent | undefined,
		metric: ITelemetryMetric
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.createMetric(metric);
			} catch (err) {
				// If the metric already exists, we can ignore the error. Otherwise, rethrow it.
				if (!BaseError.isErrorName(err, AlreadyExistsError.CLASS_NAME)) {
					throw err;
				}
			}
		}
	}

	/**
	 * Increment a metric counter, swallowing any telemetry errors.
	 * @param telemetryComponent The telemetry component to use for incrementing the metric.
	 * @param id The metric ID.
	 * @param customData Optional custom data for the increment.
	 */
	public static async metricIncrement(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		customData?: { [key: string]: unknown }
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, MetricCounterOperation.Increment, customData);
			} catch {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
			}
		}
	}

	/**
	 * Decrement a metric counter, swallowing any telemetry errors.
	 * @param telemetryComponent The telemetry component to use for decrementing the metric.
	 * @param id The metric ID.
	 * @param customData Optional custom data for the decrement.
	 */
	public static async metricDecrement(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		customData?: { [key: string]: unknown }
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, MetricCounterOperation.Decrement, customData);
			} catch {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
			}
		}
	}

	/**
	 * Set a metric value, swallowing any telemetry errors.
	 * @param telemetryComponent The telemetry component to use for setting the metric value.
	 * @param id The metric ID.
	 * @param value The metric value to set.
	 * @param customData Optional custom data for setting the value.
	 */
	public static async metricValue(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		value: number,
		customData?: { [key: string]: unknown }
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, value, customData);
			} catch {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
			}
		}
	}
}
