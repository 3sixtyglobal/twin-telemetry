// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseRestClient } from "@3sixty/api-core";
import {
	HttpHeaderHelper,
	type IBaseRestClientConfig,
	type ICreatedResponse,
	type INoContentResponse
} from "@3sixty/api-models";
import { Coerce, Guards } from "@3sixty/core";
import { nameof } from "@3sixty/nameof";
import type {
	ITelemetryAddMetricValueRequest,
	ITelemetryComponent,
	ITelemetryCreateMetricRequest,
	ITelemetryGetMetricRequest,
	ITelemetryGetMetricResponse,
	ITelemetryGetMetricValueRequest,
	ITelemetryGetMetricValueResponse,
	ITelemetryListRequest,
	ITelemetryMetricValueEntry,
	ITelemetryListResponse,
	ITelemetryMetric,
	ITelemetryMetricValue,
	ITelemetryRemoveMetricRequest,
	ITelemetryUpdateMetricRequest,
	ITelemetryValuesListRequest,
	ITelemetryValuesListResponse,
	MetricCounterOperation,
	MetricType
} from "@3sixty/telemetry-models";
import { HttpMethod } from "@3sixty/web";

/**
 * Client for performing telemetry through to REST endpoints.
 */
export class TelemetryRestClient extends BaseRestClient implements ITelemetryComponent {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<TelemetryRestClient>();

	/**
	 * Create a new instance of TelemetryRestClient.
	 * @param config The configuration for the client.
	 */
	constructor(config: IBaseRestClientConfig) {
		super(TelemetryRestClient.CLASS_NAME, config, "telemetry");
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return TelemetryRestClient.CLASS_NAME;
	}

	/**
	 * Create one or more metrics.
	 * @param metric The metric details, or the details of several metrics.
	 * @returns A promise that resolves when the metrics have been created.
	 */
	public async createMetric(metric: ITelemetryMetric | ITelemetryMetric[]): Promise<void> {
		Guards.defined(TelemetryRestClient.CLASS_NAME, nameof(metric), metric);

		await this.fetch<ITelemetryCreateMetricRequest, ICreatedResponse>("/metric", HttpMethod.POST, {
			body: metric
		});
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
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(id), id);

		const response = await this.fetch<ITelemetryGetMetricRequest, ITelemetryGetMetricResponse>(
			"/metric/:id",
			HttpMethod.GET,
			{
				pathParams: {
					id
				}
			}
		);

		return response.body;
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(id), id);
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(valueId), valueId);

		const response = await this.fetch<
			ITelemetryGetMetricValueRequest,
			ITelemetryGetMetricValueResponse
		>("/metric/:id/value/:valueId", HttpMethod.GET, {
			pathParams: { id, valueId }
		});

		return response.body;
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(TelemetryRestClient.CLASS_NAME, nameof(metric), metric);
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(metric.id), metric.id);

		await this.fetch<ITelemetryUpdateMetricRequest, INoContentResponse>(
			"/metric/:id",
			HttpMethod.PUT,
			{
				pathParams: {
					id: metric.id
				},
				body: {
					label: metric.label,
					description: metric.description,
					unit: metric.unit
				}
			}
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
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(id), id);
		Guards.defined(TelemetryRestClient.CLASS_NAME, nameof(value), value);

		const response = await this.fetch<ITelemetryAddMetricValueRequest, ICreatedResponse>(
			"/metric/:id/value",
			HttpMethod.POST,
			{
				pathParams: {
					id
				},
				body: {
					value,
					customData
				}
			}
		);

		return HttpHeaderHelper.extractId(
			response.headers,
			`${this.getPathPrefix()}/metric/:metricId/value/:id`
		);
	}

	/**
	 * Add multiple metric values.
	 * @param values The metric values to add.
	 * @returns The created metric value ids, in the order the values were supplied.
	 */
	public async addMetricValues(values: ITelemetryMetricValueEntry[]): Promise<string[]> {
		Guards.array<ITelemetryMetricValueEntry>(
			TelemetryRestClient.CLASS_NAME,
			nameof(values),
			values
		);

		// The REST surface records one value per request, so each value becomes a request.
		const valueIds: string[] = [];
		for (const entry of values) {
			valueIds.push(await this.addMetricValue(entry.id, entry.value, entry.customData));
		}
		return valueIds;
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and all its values have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(id), id);

		await this.fetch<ITelemetryRemoveMetricRequest, INoContentResponse>(
			"/metric/:id",
			HttpMethod.DELETE,
			{
				pathParams: {
					id
				}
			}
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
		const result = await this.fetch<ITelemetryListRequest, ITelemetryListResponse>(
			"/metric",
			HttpMethod.GET,
			{
				query: {
					type: Coerce.string(type),
					cursor,
					limit: Coerce.string(limit)
				}
			}
		);

		return result.body;
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
		Guards.stringValue(TelemetryRestClient.CLASS_NAME, nameof(id), id);

		const result = await this.fetch<ITelemetryValuesListRequest, ITelemetryValuesListResponse>(
			"/metric/:id/value",
			HttpMethod.GET,
			{
				pathParams: {
					id
				},
				query: {
					timeStart: Coerce.string(timeStart),
					timeEnd: Coerce.string(timeEnd),
					cursor,
					limit: Coerce.string(limit)
				}
			}
		);

		return result.body;
	}
}
