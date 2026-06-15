// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";
import type { ITelemetryMetric } from "./ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "./ITelemetryMetricValue.js";
import type { MetricCounterOperation } from "./metricCounterOperation.js";
import type { MetricType } from "./metricType.js";

/**
 * Interface describing a telemetry component contract.
 */
export interface ITelemetryComponent extends IComponent {
	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been created.
	 */
	createMetric(metric: ITelemetryMetric): Promise<void>;

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value: ITelemetryMetricValue;
	}>;

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void>;

	/**
	 * Add a metric value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the add operation.
	 * @returns The created metric value id.
	 */
	addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string>;

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
	query(
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
	queryValues(
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
