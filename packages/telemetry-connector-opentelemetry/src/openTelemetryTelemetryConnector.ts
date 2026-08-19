// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { Attributes, Counter, Gauge, Meter, UpDownCounter } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
	type MetricReader
} from "@opentelemetry/sdk-metrics";
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import { AlreadyExistsError, BaseError, ComponentFactory, Guards, Is } from "@twin.org/core";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { EntityStorageTelemetryConnector } from "@twin.org/telemetry-connector-entity-storage";
import {
	type ITelemetryConnector,
	type ITelemetryMetric,
	type ITelemetryMetricValue,
	MetricCounterOperation,
	MetricType
} from "@twin.org/telemetry-models";
import type { IOpenTelemetryTelemetryConnectorConfig } from "./models/IOpenTelemetryTelemetryConnectorConfig.js";
import type { IOpenTelemetryTelemetryConnectorConstructorOptions } from "./models/IOpenTelemetryTelemetryConnectorConstructorOptions.js";
import { OpenTelemetryReaderTypes } from "./models/openTelemetryReaderTypes.js";

/**
 * Class for performing telemetry operations using OpenTelemetry instruments.
 * Metric definitions and value history are persisted via an internal
 * EntityStorageTelemetryConnector instance created at construction time.
 */
export class OpenTelemetryTelemetryConnector implements ITelemetryConnector {
	/**
	 * The namespace supported by the telemetry connector.
	 */
	public static readonly NAMESPACE: string = "open-telemetry";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<OpenTelemetryTelemetryConnector>();

	/**
	 * Config options stored so provider creation can initialise readers and meter identity.
	 * @internal
	 */
	private readonly _config: IOpenTelemetryTelemetryConnectorConfig;

	/**
	 * Internal entity-storage connector that owns all metric metadata and value history.
	 * @internal
	 */
	private readonly _inner: EntityStorageTelemetryConnector;

	/**
	 * Whether start() has been called. Drives OTEL forwarding on/off.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Cache of MeterProvider+Meter+instruments keyed by "nodeId/tenantId".
	 * Providers are created on demand when the first metric measurement arrives
	 * for a given tenant/node pair.
	 * @internal
	 */
	private readonly _providers: {
		[key: string]: {
			meterProvider: MeterProvider;
			meter: Meter;
			instruments: {
				[id: string]: { metricType: MetricType; instrument: Counter | UpDownCounter | Gauge };
			};
		};
	};

	/**
	 * Metric definition cache keyed by metric id, populated in createMetric and on first
	 * addMetricValue after a process restart. Used to register instruments on new providers
	 * without re-querying entity storage on every call.
	 * @internal
	 */
	private readonly _metricDefs: {
		[id: string]: { type: MetricType; description?: string; unit?: string };
	};

	/**
	 * Create a new instance of OpenTelemetryTelemetryConnector.
	 * @param options The options for the connector.
	 * @throws GuardError When a reader config specifies an unsupported type.
	 */
	constructor(options?: IOpenTelemetryTelemetryConnectorConstructorOptions) {
		this._config = options?.config ?? {};

		for (const [, readerConfig] of Object.entries(this._config.readers ?? {})) {
			Guards.arrayOneOf(
				OpenTelemetryTelemetryConnector.CLASS_NAME,
				nameof(readerConfig.type),
				readerConfig.type,
				Object.values(OpenTelemetryReaderTypes)
			);
		}

		this._inner = new EntityStorageTelemetryConnector({
			loggingComponentType: options?.loggingComponentType,
			telemetryMetricStorageConnectorType: options?.telemetryMetricStorageConnectorType,
			telemetryMetricValueStorageConnectorType: options?.telemetryMetricValueStorageConnectorType,
			config: {
				mutexTimeoutMs: this._config.mutexTimeoutMs
			}
		});
		this._started = false;
		this._providers = {};
		this._metricDefs = {};
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return OpenTelemetryTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Enable OTEL forwarding. Subsequent calls to createMetric and addMetricValue will
	 * create per-tenant/node MeterProviders on demand.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when OTEL forwarding is enabled.
	 */
	public async start(nodeLoggingComponentType?: string): Promise<void> {
		if (this._started) {
			return;
		}
		this._started = true;

		const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
		await nodeLogging?.log({
			source: OpenTelemetryTelemetryConnector.CLASS_NAME,
			message: "connectorStarted",
			level: "info",
			data: { readerCount: Object.keys(this._config.readers ?? {}).length }
		});
	}

	/**
	 * Shut down all cached MeterProviders and disable OTEL forwarding.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when all MeterProviders have shut down.
	 */
	public async stop(nodeLoggingComponentType?: string): Promise<void> {
		if (this._started) {
			for (const { meterProvider } of Object.values(this._providers)) {
				await meterProvider.shutdown();
			}
			for (const key of Object.keys(this._providers)) {
				delete this._providers[key];
			}
			this._started = false;

			const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
			await nodeLogging?.log({
				source: OpenTelemetryTelemetryConnector.CLASS_NAME,
				message: "connectorStopped",
				level: "info",
				data: {}
			});
		}
	}

	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been persisted.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {
		try {
			await this._inner.createMetric(metric);
		} catch (err) {
			// Entity storage performs all validation and throws AlreadyExistsError on duplicates.
			// OTP doesn't care about duplicates and will create a new instrument instance on each call
			// so we catch this error and ignore it to allow the OTEL instruments to be registered.
			if (!BaseError.isErrorName(err, AlreadyExistsError.CLASS_NAME)) {
				throw err;
			}
		}

		this._metricDefs[metric.id] = {
			type: metric.type,
			description: metric.description,
			unit: metric.unit
		};

		if (this._started) {
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			const { meter, instruments } = this.getOrCreateProvider(contextIds);
			this.registerInstrument(
				metric.id,
				metric.type,
				metric.description,
				metric.unit,
				meter,
				instruments
			);
		}
	}

	/**
	 * Get the metric details and its most recent value.
	 * @param id The metric id.
	 * @returns The metric details and its most recent value.
	 */
	public async getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value: ITelemetryMetricValue;
	}> {
		const result = await this._inner.getMetric(id);
		const value = result.value ?? { id: "", ts: 0, value: 0 };
		return { metric: result.metric, value };
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		return this._inner.getMetricValue(id, valueId);
	}

	/**
	 * Update the metric metadata.
	 * Note: OpenTelemetry instrument descriptors are immutable once created.
	 * This method updates the persisted metadata mirror only.
	 * @param metric The metric details (type cannot be changed).
	 * @returns A promise that resolves when the persisted metadata has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		return this._inner.updateMetric(metric);
	}

	/**
	 * Record a metric value.
	 * The current tenant and node IDs are read from `ContextIdStore` and used to
	 * select (or create) the matching per-tenant/node `MeterProvider`.
	 * @param id The id of the metric.
	 * @param value The value for the operation.
	 * @param customData Optional custom data forwarded as OTEL attributes.
	 * @returns The id of the new metric value entry.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		const valueId = await this._inner.addMetricValue(id, value, customData);

		if (this._started) {
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			const { meter, instruments } = this.getOrCreateProvider(contextIds);

			if (!(id in instruments)) {
				let def = this._metricDefs[id];
				if (def === undefined) {
					// Process restart path: definition not yet cached, fetch from storage.
					const { metric } = await this._inner.getMetric(id);
					def = { type: metric.type, description: metric.description, unit: metric.unit };
					this._metricDefs[id] = def;
				}
				this.registerInstrument(id, def.type, def.description, def.unit, meter, instruments);
			}

			const entry = instruments[id];
			if (entry !== undefined) {
				const attributes = this.toAttributes(customData);
				const { metricType, instrument } = entry;

				if (metricType === MetricType.Counter) {
					(instrument as Counter).add(
						value === MetricCounterOperation.Increment ? 1 : (value as number),
						attributes
					);
				} else if (metricType === MetricType.IncDecCounter) {
					let delta: number;
					if (value === MetricCounterOperation.Increment) {
						delta = 1;
					} else if (value === MetricCounterOperation.Decrement) {
						delta = -1;
					} else {
						delta = value;
					}
					(instrument as UpDownCounter).add(delta, attributes);
				} else {
					(instrument as Gauge).record(value as number, attributes);
				}
			}
		}

		return valueId;
	}

	/**
	 * Remove a metric and its persisted value history.
	 * Note: OpenTelemetry exposes no API to deregister an instrument from a Meter,
	 * so the underlying Counter/UpDownCounter/Gauge remains resident for the lifetime
	 * of the MeterProvider. Re-creating a metric with the same id but a different
	 * MetricType is therefore not safe.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and its value history have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		for (const { instruments } of Object.values(this._providers)) {
			delete instruments[id];
		}
		delete this._metricDefs[id];
		return this._inner.removeMetric(id);
	}

	/**
	 * Query the registered metrics, optionally filtered by type.
	 * @param type The type of the metric.
	 * @param cursor The cursor to request the next page.
	 * @param limit Limit the number of entities to return.
	 * @returns The matching metrics and an optional cursor for the next page.
	 */
	public async query(
		type?: MetricType,
		cursor?: string,
		limit?: number
	): Promise<{
		entities: ITelemetryMetric[];
		cursor?: string;
	}> {
		return this._inner.query(type, cursor, limit);
	}

	/**
	 * Query the recorded values for a metric, ordered by most recent first.
	 * @param id The id of the metric.
	 * @param timeStart The inclusive start time (epoch ms).
	 * @param timeEnd The inclusive end time (epoch ms).
	 * @param cursor The cursor returned by the previous call.
	 * @param limit Limit the number of values to return.
	 * @returns The metric details, matching values, and an optional cursor for the next page.
	 */
	public async queryValues(
		id: string,
		timeStart?: number,
		timeEnd?: number,
		cursor?: string,
		limit?: number
	): Promise<{
		metric: ITelemetryMetric;
		entities: ITelemetryMetricValue[];
		cursor?: string;
	}> {
		return this._inner.queryValues(id, timeStart, timeEnd, cursor, limit);
	}

	/**
	 * Return or create the MeterProvider for the given tenant/node pair.
	 * Providers are keyed by "nodeId/tenantId" and carry OTEL resource attributes
	 * service.namespace=tenantId and service.instance.id=nodeId when those values
	 * are present.
	 * @param contextIds The current execution context IDs.
	 * @returns The cached or newly created provider entry.
	 * @internal
	 */
	private getOrCreateProvider(contextIds: IContextIds): {
		meterProvider: MeterProvider;
		meter: Meter;
		instruments: {
			[id: string]: { metricType: MetricType; instrument: Counter | UpDownCounter | Gauge };
		};
	} {
		const node = contextIds[ContextIdKeys.Node];
		const tenantId = contextIds[ContextIdKeys.Tenant];

		const key = `${node ?? ""}/${tenantId ?? ""}`;

		let cached = this._providers[key];
		if (!Is.undefined(cached)) {
			return cached;
		}

		const readers = this.createReaders();
		const resourcePrefix = "service";
		const resourceAttrs: { [id: string]: string } = {};
		if (Is.stringValue(node)) {
			resourceAttrs[`${resourcePrefix}.instance.id`] = node;
		}
		if (Is.stringValue(tenantId)) {
			resourceAttrs[`${resourcePrefix}.namespace`] = tenantId;
		}
		const resource =
			Object.keys(resourceAttrs).length > 0 ? resourceFromAttributes(resourceAttrs) : undefined;
		const meterProvider = new MeterProvider({ readers, resource });
		const meter = meterProvider.getMeter(
			this._config.meterName ?? "twin-telemetry",
			this._config.meterVersion ?? "1.0.0"
		);
		cached = { meterProvider, meter, instruments: {} };
		this._providers[key] = cached;

		return cached;
	}

	/**
	 * Instantiate fresh MetricReader instances from the connector config.
	 * Called each time a new MeterProvider is created for a tenant/node pair.
	 * @returns The list of reader instances.
	 * @internal
	 */
	private createReaders(): MetricReader[] {
		const readers: MetricReader[] = [];
		for (const [, config] of Object.entries(this._config.readers ?? {})) {
			if (config.type === OpenTelemetryReaderTypes.Prometheus) {
				readers.push(
					new PrometheusExporter({
						port: config.port,
						endpoint: config.endpoint,
						preventServerStart: !(config.startServer ?? true),
						prefix: config.prefix
					})
				);
			} else if (config.type === OpenTelemetryReaderTypes.OtlpHttp) {
				readers.push(
					new PeriodicExportingMetricReader({
						exporter: new OTLPMetricExporter({
							url: config.url,
							headers: config.headers
						}),
						exportIntervalMillis: config.exportIntervalMs
					})
				);
			}
		}
		return readers;
	}

	/**
	 * Register an OTEL instrument on a provider's instruments map if not already present.
	 * @param id The metric id.
	 * @param type The metric type.
	 * @param description The metric description.
	 * @param unit The metric unit.
	 * @param meter The meter to create instruments on.
	 * @param instruments The per-provider instruments map to update.
	 * @internal
	 */
	private registerInstrument(
		id: string,
		type: MetricType,
		description: string | undefined,
		unit: string | undefined,
		meter: Meter,
		instruments: {
			[id: string]: { metricType: MetricType; instrument: Counter | UpDownCounter | Gauge };
		}
	): void {
		if (id in instruments) {
			return;
		}
		const instrumentOptions = { description, unit };
		let instrument: Counter | UpDownCounter | Gauge;
		if (type === MetricType.Counter) {
			instrument = meter.createCounter(id, instrumentOptions);
		} else if (type === MetricType.IncDecCounter) {
			instrument = meter.createUpDownCounter(id, instrumentOptions);
		} else {
			instrument = meter.createGauge(id, instrumentOptions);
		}
		instruments[id] = { metricType: type, instrument };
	}

	/**
	 * Convert customData to OTEL-compatible Attributes.
	 * @param customData The raw custom data map.
	 * @returns An OTEL Attributes object.
	 * @internal
	 */
	private toAttributes(customData?: { [key: string]: unknown }): Attributes {
		if (Is.empty(customData)) {
			return {};
		}
		const attrs: Attributes = {};
		for (const [key, val] of Object.entries(customData)) {
			if (Is.string(val) || Is.number(val) || Is.boolean(val)) {
				attrs[key] = val;
			} else if (Is.arrayValue(val)) {
				if (
					(Is.string(val[0]) || Is.number(val[0]) || Is.boolean(val[0])) &&
					val.every(el => typeof el === typeof val[0])
				) {
					attrs[key] = val as string[] | number[] | boolean[];
				}
			}
		}
		return attrs;
	}
}
