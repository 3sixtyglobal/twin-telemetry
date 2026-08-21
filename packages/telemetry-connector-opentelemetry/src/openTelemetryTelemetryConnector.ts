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
import {
	ComponentFactory,
	Converter,
	GeneralError,
	Guards,
	Is,
	NotFoundError,
	RandomHelper
} from "@twin.org/core";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type ITelemetryConnector,
	type ITelemetryMetric,
	MetricCounterOperation,
	MetricType
} from "@twin.org/telemetry-models";
import type { IOpenTelemetryTelemetryConnectorConfig } from "./models/IOpenTelemetryTelemetryConnectorConfig.js";
import type { IOpenTelemetryTelemetryConnectorConstructorOptions } from "./models/IOpenTelemetryTelemetryConnectorConstructorOptions.js";
import { OpenTelemetryReaderTypes } from "./models/openTelemetryReaderTypes.js";

/**
 * Class for performing telemetry operations using OpenTelemetry instruments.
 * Metric definitions are held in memory. Persistence and querying are not supported;
 * use a multi-connector with an EntityStorageTelemetryConnector for those capabilities.
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
	 * In-memory metric definition registry keyed by metric id.
	 * @internal
	 */
	private readonly _metricDefs: {
		[id: string]: { type: MetricType; label: string; description?: string; unit?: string };
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
	 * Enable OTEL forwarding. Subsequent calls to addMetricValue will create
	 * per-tenant/node MeterProviders on demand.
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
	 * Register a new metric definition. If the connector is already started,
	 * the OTEL instrument is registered immediately for the current context.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been registered.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {
		Guards.object<ITelemetryMetric>(
			OpenTelemetryTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(OpenTelemetryTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(
			OpenTelemetryTelemetryConnector.CLASS_NAME,
			nameof(metric.label),
			metric.label
		);

		this._metricDefs[metric.id] = {
			type: metric.type,
			label: metric.label,
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
	 * Update the in-memory metadata for a registered metric.
	 * OpenTelemetry instrument descriptors are immutable once created; only the
	 * cached label, description and unit are updated.
	 * @param metric The metric details (type cannot be changed).
	 * @returns A promise that resolves when the metadata has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(
			OpenTelemetryTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(OpenTelemetryTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);

		const def = this._metricDefs[metric.id];
		if (Is.undefined(def)) {
			throw new NotFoundError(
				OpenTelemetryTelemetryConnector.CLASS_NAME,
				"metricNotFound",
				metric.id
			);
		}

		this._metricDefs[metric.id] = {
			type: def.type,
			label: metric.label,
			description: metric.description,
			unit: metric.unit
		};
	}

	/**
	 * Record a metric value and forward it to the appropriate OTEL instrument.
	 * The current tenant and node IDs are read from `ContextIdStore` and used to
	 * select (or create) the matching per-tenant/node `MeterProvider`.
	 * @param id The id of the metric.
	 * @param value The value for the operation.
	 * @param customData Optional custom data forwarded as OTEL attributes.
	 * @returns A generated 32-character hex id for the recorded value.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(OpenTelemetryTelemetryConnector.CLASS_NAME, nameof(id), id);
		Guards.defined(OpenTelemetryTelemetryConnector.CLASS_NAME, nameof(value), value);

		const def = this._metricDefs[id];
		if (Is.undefined(def)) {
			throw new NotFoundError(OpenTelemetryTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		if (def.type === MetricType.Counter) {
			if (value !== MetricCounterOperation.Increment && (!Is.integer(value) || value <= 0)) {
				throw new GeneralError(OpenTelemetryTelemetryConnector.CLASS_NAME, "counterIncOnly");
			}
		} else if (def.type === MetricType.Gauge) {
			if (!Is.number(value)) {
				throw new GeneralError(OpenTelemetryTelemetryConnector.CLASS_NAME, "gaugeNoIncDec");
			}
		}

		const valueId = Converter.bytesToHex(RandomHelper.generate(16));

		if (this._started) {
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			const { meter, instruments } = this.getOrCreateProvider(contextIds);

			if (!(id in instruments)) {
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
	 * Remove a metric from the in-memory registry and from all cached provider instrument maps.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric has been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(OpenTelemetryTelemetryConnector.CLASS_NAME, nameof(id), id);

		if (Is.undefined(this._metricDefs[id])) {
			throw new NotFoundError(OpenTelemetryTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		for (const { instruments } of Object.values(this._providers)) {
			delete instruments[id];
		}
		delete this._metricDefs[id];
	}

	/**
	 * Return or create the MeterProvider for the given tenant/node pair.
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
