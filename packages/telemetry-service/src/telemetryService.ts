// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@3sixty/api-models";
import { ContextIdKeys, ContextIdStore } from "@3sixty/context";
import { ComponentFactory, Guards, Is, NotImplementedError } from "@3sixty/core";
import { nameof } from "@3sixty/nameof";
import {
	TelemetryConnectorFactory,
	type ITelemetryComponent,
	type ITelemetryConnector,
	type ITelemetryMetric,
	type ITelemetryMetricValueEntry,
	type ITelemetryMetricValue,
	type MetricCounterOperation,
	type MetricType
} from "@3sixty/telemetry-models";
import type { ITelemetryServiceConstructorOptions } from "./models/ITelemetryServiceConstructorOptions.js";

/**
 * Service for performing telemetry operations to a connector.
 */
export class TelemetryService implements ITelemetryComponent {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<TelemetryService>();

	/**
	 * Telemetry connector used by the service.
	 * @internal
	 */
	private readonly _telemetryConnector: ITelemetryConnector;

	/**
	 * Platform component.
	 * @internal
	 */
	private readonly _platformComponent: IPlatformComponent;

	/**
	 * Create a new instance of TelemetryService.
	 * @param options The options for the connector.
	 */
	constructor(options?: ITelemetryServiceConstructorOptions) {
		this._telemetryConnector = TelemetryConnectorFactory.get(
			options?.telemetryConnectorType ?? "telemetry"
		);
		this._platformComponent = ComponentFactory.get<IPlatformComponent>(
			options?.platformComponentType ?? "platform"
		);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return TelemetryService.CLASS_NAME;
	}

	/**
	 * Create one or more metrics.
	 * @param metric The metric details, or the details of several metrics.
	 * @returns A promise that resolves when the metrics have been created.
	 */
	public async createMetric(metric: ITelemetryMetric | ITelemetryMetric[]): Promise<void> {
		Guards.defined(TelemetryService.CLASS_NAME, nameof(metric), metric);

		// If we don't have a tenant context ID and the tenant component is multi-tenant,
		// we consider the entry as per-tenant and run it in all the tenant context to ensure
		// the metric is created for each tenant.
		const contextIds = (await ContextIdStore.getContextIds()) ?? {};
		const perTenant =
			!Is.stringValue(contextIds[ContextIdKeys.Tenant]) && this._platformComponent.isMultiTenant();

		if (perTenant) {
			await this._platformComponent.execute(async () =>
				this._telemetryConnector.createMetric(metric)
			);
		} else {
			await this._telemetryConnector.createMetric(metric);
		}
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
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(id), id);

		const boundGetMetric = this._telemetryConnector.getMetric?.bind(this._telemetryConnector);
		if (Is.undefined(boundGetMetric)) {
			throw new NotImplementedError(TelemetryService.CLASS_NAME, "getMetric");
		}
		return boundGetMetric(id);
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(id), id);
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(valueId), valueId);

		const boundGetMetricValue = this._telemetryConnector.getMetricValue?.bind(
			this._telemetryConnector
		);
		if (Is.undefined(boundGetMetricValue)) {
			throw new NotImplementedError(TelemetryService.CLASS_NAME, "getMetricValue");
		}
		return boundGetMetricValue(id, valueId);
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(TelemetryService.CLASS_NAME, nameof(metric), metric);
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(metric.id), metric.id);
		return this._telemetryConnector.updateMetric(metric);
	}

	/**
	 * Add a metric value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the add operation.
	 * @returns The created metric value id. When fanned out per-tenant, this is the id from the last tenant written.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(id), id);
		Guards.defined(TelemetryService.CLASS_NAME, nameof(value), value);

		// If we don't have a tenant context ID and the tenant component is multi-tenant,
		// we consider the entry as per-tenant and run it in all the tenant context to ensure
		// the value is recorded for each tenant.
		const contextIds = (await ContextIdStore.getContextIds()) ?? {};
		const perTenant =
			!Is.stringValue(contextIds[ContextIdKeys.Tenant]) && this._platformComponent.isMultiTenant();

		if (perTenant) {
			let valueId = "";
			await this._platformComponent.execute(async () => {
				valueId = await this._telemetryConnector.addMetricValue(id, value, customData);
			});
			return valueId;
		}

		return this._telemetryConnector.addMetricValue(id, value, customData);
	}

	/**
	 * Add multiple metric values.
	 * @param values The metric values to add.
	 * @returns The created metric value ids. When fanned out per-tenant, these are the ids from the last tenant written.
	 */
	public async addMetricValues(values: ITelemetryMetricValueEntry[]): Promise<string[]> {
		Guards.arrayValue<ITelemetryMetricValueEntry>(
			TelemetryService.CLASS_NAME,
			nameof(values),
			values
		);

		// If we don't have a tenant context ID and the tenant component is multi-tenant,
		// we consider the entries as per-tenant and run them in all the tenant context to ensure
		// the values are recorded for each tenant.
		const contextIds = (await ContextIdStore.getContextIds()) ?? {};
		const perTenant =
			!Is.stringValue(contextIds[ContextIdKeys.Tenant]) && this._platformComponent.isMultiTenant();

		if (perTenant) {
			let valueIds: string[] = [];
			await this._platformComponent.execute(async () => {
				valueIds = await this._telemetryConnector.addMetricValues(values);
			});
			return valueIds;
		}

		return this._telemetryConnector.addMetricValues(values);
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and all its values have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(id), id);
		return this._telemetryConnector.removeMetric(id);
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
		const boundQuery = this._telemetryConnector.query?.bind(this._telemetryConnector);
		if (Is.undefined(boundQuery)) {
			throw new NotImplementedError(TelemetryService.CLASS_NAME, "query");
		}
		return boundQuery(type, cursor, limit);
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
		Guards.stringValue(TelemetryService.CLASS_NAME, nameof(id), id);

		const boundQueryValues = this._telemetryConnector.queryValues?.bind(this._telemetryConnector);
		if (Is.undefined(boundQueryValues)) {
			throw new NotImplementedError(TelemetryService.CLASS_NAME, "queryValues");
		}
		return boundQueryValues(id, timeStart, timeEnd, cursor, limit);
	}
}
