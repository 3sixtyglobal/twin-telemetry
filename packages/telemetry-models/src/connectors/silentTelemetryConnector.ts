// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { NotSupportedError } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import type { ITelemetryConnector } from "../models/ITelemetryConnector.js";
import type { ITelemetryMetric } from "../models/ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "../models/ITelemetryMetricValue.js";
import type { MetricType } from "../models/metricType.js";

/**
 * Class for performing telemetry operations to nowhere.
 */
export class SilentTelemetryConnector implements ITelemetryConnector {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<SilentTelemetryConnector>();

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return SilentTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns Nothing.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {}

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	public async getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value: ITelemetryMetricValue;
	}> {
		throw new NotSupportedError(SilentTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "getMetric"
		});
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns Nothing.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {}

	/**
	 * Update metric value.
	 * @param id The id of the metric.
	 * @param value The value for the update operation.
	 * @param customData The custom data for the update operation.
	 * @returns The created metric value id..
	 */
	public async addMetricValue(
		id: string,
		value: "inc" | "dec" | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		return "";
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns Nothing.
	 */
	public async removeMetric(id: string): Promise<void> {}

	/**
	 * Query the metrics.
	 * @param type The type of the metric.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async query(
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
	}> {
		throw new NotSupportedError(SilentTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "query"
		});
	}

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
	public async queryValues(
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
	}> {
		throw new NotSupportedError(SilentTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "queryValues"
		});
	}
}
