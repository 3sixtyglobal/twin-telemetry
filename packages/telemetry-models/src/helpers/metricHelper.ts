// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { AlreadyExistsError, BaseError, Is } from "@twin.org/core";
import type { ITelemetryComponent } from "../models/ITelemetryComponent.js";
import type { ITelemetryMetric } from "../models/ITelemetryMetric.js";
import type { ITelemetryMetricValueEntry } from "../models/ITelemetryMetricValueEntry.js";
import { MetricCounterOperation } from "../models/metricCounterOperation.js";

/**
 * Helper class for performing common metric operations, swallowing any errors from the telemetry component.
 */
export class MetricHelper {
	/**
	 * Create multiple metrics if they don't already exist, swallowing any already exists errors.
	 * A convenience wrapper over createMetric for callers that always have a list.
	 * @param telemetryComponent The telemetry component to use for creating the metrics.
	 * @param metrics The telemetry metrics to create.
	 * @returns A promise that resolves when all metrics have been created or confirmed to exist.
	 */
	public static async createMetrics(
		telemetryComponent: ITelemetryComponent | undefined,
		metrics: ITelemetryMetric[]
	): Promise<void> {
		if (Is.arrayValue(metrics)) {
			await MetricHelper.createMetric(telemetryComponent, metrics);
		}
	}

	/**
	 * Create one or more metrics if they don't already exist, swallowing any already exists errors.
	 * @param telemetryComponent The telemetry component to use for creating the metrics.
	 * @param metric The telemetry metric to create, or the metrics to create.
	 * @returns A promise that resolves when the metrics have been created or confirmed to exist.
	 */
	public static async createMetric(
		telemetryComponent: ITelemetryComponent | undefined,
		metric: ITelemetryMetric | ITelemetryMetric[]
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
	 * @param onError Optional callback invoked with the swallowed error, for callers that want visibility.
	 * @returns A promise that resolves when the increment has been recorded or the error swallowed.
	 */
	public static async metricIncrement(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		customData?: { [key: string]: unknown },
		onError?: (err: unknown) => Promise<void> | void
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, MetricCounterOperation.Increment, customData);
			} catch (err) {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
				await MetricHelper.notifyError(onError, err);
			}
		}
	}

	/**
	 * Decrement a metric counter, swallowing any telemetry errors.
	 * @param telemetryComponent The telemetry component to use for decrementing the metric.
	 * @param id The metric ID.
	 * @param customData Optional custom data for the decrement.
	 * @param onError Optional callback invoked with the swallowed error, for callers that want visibility.
	 * @returns A promise that resolves when the decrement has been recorded or the error swallowed.
	 */
	public static async metricDecrement(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		customData?: { [key: string]: unknown },
		onError?: (err: unknown) => Promise<void> | void
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, MetricCounterOperation.Decrement, customData);
			} catch (err) {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
				await MetricHelper.notifyError(onError, err);
			}
		}
	}

	/**
	 * Set a metric value, swallowing any telemetry errors.
	 * @param telemetryComponent The telemetry component to use for setting the metric value.
	 * @param id The metric ID.
	 * @param value The metric value to set.
	 * @param customData Optional custom data for setting the value.
	 * @param onError Optional callback invoked with the swallowed error, for callers that want visibility.
	 * @returns A promise that resolves when the value has been recorded or the error swallowed.
	 */
	public static async metricValue(
		telemetryComponent: ITelemetryComponent | undefined,
		id: string,
		value: number,
		customData?: { [key: string]: unknown },
		onError?: (err: unknown) => Promise<void> | void
	): Promise<void> {
		if (!Is.undefined(telemetryComponent)) {
			try {
				await telemetryComponent.addMetricValue(id, value, customData);
			} catch (err) {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
				await MetricHelper.notifyError(onError, err);
			}
		}
	}

	/**
	 * Set several metric values at once, swallowing any telemetry errors.
	 * Components which support it record the whole set in one operation, which for a persisted
	 * connector is a single write rather than one per value.
	 * @param telemetryComponent The telemetry component to use for setting the metric values.
	 * @param values The metric values to set.
	 * @param onError Optional callback invoked with the swallowed error, for callers that want visibility.
	 * @returns A promise that resolves when the values have been recorded or the error swallowed.
	 */
	public static async metricValues(
		telemetryComponent: ITelemetryComponent | undefined,
		values: ITelemetryMetricValueEntry[],
		onError?: (err: unknown) => Promise<void> | void
	): Promise<void> {
		if (!Is.undefined(telemetryComponent) && Is.arrayValue(values)) {
			try {
				await telemetryComponent.addMetricValues(values);
			} catch (err) {
				// This method is designed to swallow any errors from the telemetry component
				// So it can safely be called without interrupting any external flows.
				await MetricHelper.notifyError(onError, err);
			}
		}
	}

	/**
	 * Invoke the caller's error callback, swallowing anything it throws so a broken callback can
	 * never break the never-interrupt contract of the calling method.
	 * @param onError The optional callback to invoke.
	 * @param err The error to pass to the callback.
	 * @returns A promise that resolves once the callback has run or failed.
	 * @internal
	 */
	private static async notifyError(
		onError: ((err: unknown) => Promise<void> | void) | undefined,
		err: unknown
	): Promise<void> {
		try {
			await onError?.(err);
		} catch {
			// The onError callback must never be able to break the swallow contract above.
		}
	}
}
