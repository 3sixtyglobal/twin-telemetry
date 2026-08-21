// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, Is, NotImplementedError, NotSupportedError } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import { TelemetryConnectorFactory } from "../factories/telemetryConnectorFactory.js";
import type { IMultiTelemetryConnectorConstructorOptions } from "../models/IMultiTelemetryConnectorConstructorOptions.js";
import type { ITelemetryConnector } from "../models/ITelemetryConnector.js";
import type { ITelemetryMetric } from "../models/ITelemetryMetric.js";
import type { ITelemetryMetricValue } from "../models/ITelemetryMetricValue.js";
import type { MetricCounterOperation } from "../models/metricCounterOperation.js";
import { MetricType } from "../models/metricType.js";

/**
 * Class for performing telemetry operations on multiple connectors.
 */
export class MultiTelemetryConnector implements ITelemetryConnector {
	/**
	 * The namespace for the class.
	 */
	public static readonly NAMESPACE: string = "multi";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MultiTelemetryConnector>();

	/**
	 * The connectors to send the telemetry entries to.
	 * @internal
	 */
	private readonly _telemetryConnectors: ITelemetryConnector[];

	/**
	 * Create a new instance of MultiTelemetryConnector.
	 * @param options The options for the connector.
	 */
	constructor(options: IMultiTelemetryConnectorConstructorOptions) {
		Guards.object(MultiTelemetryConnector.CLASS_NAME, nameof(options), options);
		Guards.arrayValue(
			MultiTelemetryConnector.CLASS_NAME,
			nameof(options.telemetryConnectorTypes),
			options.telemetryConnectorTypes
		);
		this._telemetryConnectors = options.telemetryConnectorTypes.map(t =>
			TelemetryConnectorFactory.get(t)
		);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MultiTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been created on all connectors.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {
		Guards.object<ITelemetryMetric>(MultiTelemetryConnector.CLASS_NAME, nameof(metric), metric);
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(metric.label), metric.label);
		Guards.arrayOneOf(
			MultiTelemetryConnector.CLASS_NAME,
			nameof(metric.type),
			metric.type,
			Object.values(MetricType)
		);

		await Promise.allSettled(
			this._telemetryConnectors.map(async telemetryConnector =>
				telemetryConnector.createMetric(metric)
			)
		);
	}

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	public async getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value?: ITelemetryMetricValue;
	}> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);

		for (const telemetryConnector of this._telemetryConnectors) {
			const getMetricResult = telemetryConnector.getMetric?.(id);
			if (!Is.empty(getMetricResult)) {
				return getMetricResult;
			}
		}
		throw new NotSupportedError(MultiTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "getMetric"
		});
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(valueId), valueId);

		for (const telemetryConnector of this._telemetryConnectors) {
			const getMetricValueResult = telemetryConnector.getMetricValue?.(id, valueId);
			if (!Is.empty(getMetricValueResult)) {
				return getMetricValueResult;
			}
		}
		throw new NotSupportedError(MultiTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "getMetricValue"
		});
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated on all connectors.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(MultiTelemetryConnector.CLASS_NAME, nameof(metric), metric);
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(metric.label), metric.label);

		await Promise.allSettled(
			this._telemetryConnectors.map(async telemetryConnector =>
				telemetryConnector.updateMetric(metric)
			)
		);
	}

	/**
	 * Add a metric value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the add operation.
	 * @returns The created metric value id.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);

		const results = await Promise.allSettled(
			this._telemetryConnectors.map(async telemetryConnector =>
				telemetryConnector.addMetricValue(id, value, customData)
			)
		);

		if (results[0].status === "fulfilled") {
			return results[0].value;
		}
		throw new NotSupportedError(MultiTelemetryConnector.CLASS_NAME, "notSupported", {
			methodName: "addMetricValue"
		});
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric has been removed from all connectors.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);

		await Promise.allSettled(
			this._telemetryConnectors.map(async telemetryConnector => telemetryConnector.removeMetric(id))
		);
	}

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
		// See if we can find a connector that supports querying.
		for (const telemetryConnector of this._telemetryConnectors) {
			const queryBound = telemetryConnector.query?.bind(telemetryConnector);
			if (Is.function(queryBound)) {
				return queryBound(type, cursor, limit);
			}
		}

		throw new NotImplementedError(MultiTelemetryConnector.CLASS_NAME, "query");
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
		// See if we can find a connector that supports querying.
		// If it throws anything other than not implemented, we should throw it.
		for (const telemetryConnector of this._telemetryConnectors) {
			const queryValuesBound = telemetryConnector.queryValues?.bind(telemetryConnector);
			if (Is.function(queryValuesBound)) {
				return queryValuesBound(id, timeStart, timeEnd, cursor, limit);
			}
		}

		throw new NotImplementedError(MultiTelemetryConnector.CLASS_NAME, "queryValues");
	}
}
