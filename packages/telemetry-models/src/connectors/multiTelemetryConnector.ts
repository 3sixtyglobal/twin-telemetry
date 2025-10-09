// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, Guards, NotImplementedError } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import { TelemetryConnectorFactory } from "../factories/telemetryConnectorFactory";
import type { IMultiTelemetryConnectorConstructorOptions } from "../models/IMultiTelemetryConnectorConstructorOptions";
import type { ITelemetryConnector } from "../models/ITelemetryConnector";
import type { ITelemetryMetric } from "../models/ITelemetryMetric";
import type { ITelemetryMetricValue } from "../models/ITelemetryMetricValue";
import { MetricType } from "../models/metricType";

/**
 * Class for performing telemetry operations on multiple connectors.
 */
export class MultiTelemetryConnector implements ITelemetryConnector {
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
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns Nothing.
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
		value: ITelemetryMetricValue;
	}> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);

		// Since all the connectors should have the same data, we can just use the first one.
		return this._telemetryConnectors[0].getMetric(id);
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns Nothing.
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
		value: "inc" | "dec" | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(MultiTelemetryConnector.CLASS_NAME, nameof(id), id);

		const results = await Promise.allSettled(
			this._telemetryConnectors.map(async telemetryConnector =>
				telemetryConnector.addMetricValue(id, value, customData)
			)
		);

		return results[0].status === "fulfilled" ? results[0].value : "";
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns Nothing.
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
		// If it throws anything other than not implemented, we should throw it.
		for (const telemetryConnector of this._telemetryConnectors) {
			try {
				const result = await telemetryConnector.query(type, cursor, limit);
				return result;
			} catch (error) {
				if (!BaseError.isErrorName(error, NotImplementedError.CLASS_NAME)) {
					throw error;
				}
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
			try {
				const result = await telemetryConnector.queryValues(id, timeStart, timeEnd, cursor, limit);
				return result;
			} catch (error) {
				if (!BaseError.isErrorName(error, NotImplementedError.CLASS_NAME)) {
					throw error;
				}
			}
		}

		throw new NotImplementedError(MultiTelemetryConnector.CLASS_NAME, "queryValues");
	}
}
