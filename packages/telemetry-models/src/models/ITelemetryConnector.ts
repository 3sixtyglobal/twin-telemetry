// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";
import type { ITelemetryMetric } from "./ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "./ITelemetryMetricValue.js";
import type { ITelemetryMetricValueEntry } from "./ITelemetryMetricValueEntry.js";
import type { MetricCounterOperation } from "./metricCounterOperation.js";
import type { MetricType } from "./metricType.js";

/**
 * Interface describing a telemetry connector.
 */
export interface ITelemetryConnector extends IComponent {
	/**
	 * Create one or more metrics.
	 * A single metric fails if it already exists; an array declares the set that should exist,
	 * creating the ones that are missing and leaving the rest untouched, so implementations
	 * which persist the definitions can resolve the whole set in one operation.
	 * @param metric The metric details, or the details of several metrics.
	 * @returns A promise that resolves when the metrics have been created.
	 */
	createMetric(metric: ITelemetryMetric | ITelemetryMetric[]): Promise<void>;

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	getMetric?(id: string): Promise<{
		metric: ITelemetryMetric;
		value?: ITelemetryMetricValue;
	}>;

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	getMetricValue?(id: string, valueId: string): Promise<ITelemetryMetricValue>;

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void>;

	/**
	 * Update metric value.
	 * @param id The id of the metric.
	 * @param value The value for the update operation.
	 * @param customData The custom data for the update operation.
	 * @returns The created metric value id.
	 */
	addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string>;

	/**
	 * Add multiple metric values, so implementations which persist them can do so in one
	 * operation instead of one per value.
	 * @param values The metric values to add.
	 * @returns The created metric value ids, in the order the values were supplied.
	 */
	addMetricValues(values: ITelemetryMetricValueEntry[]): Promise<string[]>;

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and all its values have been removed.
	 */
	removeMetric(id: string): Promise<void>;

	/**
	 * Query the metrics.
	 * @param type The type of the metric.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	query?(
		type?: MetricType,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metrics.
		 */
		entities: ITelemetryMetric[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}>;

	/**
	 * Query the metric values.
	 * @param id The id of the metric.
	 * @param timeStart The inclusive time as the start of the metric entries.
	 * @param timeEnd The inclusive time as the end of the metric entries.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	queryValues?(
		id: string,
		timeStart?: number,
		timeEnd?: number,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metric details.
		 */
		metric: ITelemetryMetric;

		/**
		 * The values for the metric.
		 */
		entities: ITelemetryMetricValue[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}>;
}
