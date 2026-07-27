// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { Attributes, Counter, Gauge, Meter, UpDownCounter } from "@opentelemetry/api";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { MeterProvider, type MetricReader } from "@opentelemetry/sdk-metrics";
import { AlreadyExistsError, BaseError, ComponentFactory, GeneralError, Is } from "@twin.org/core";
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

/**
 * Class for performing telemetry operations using OpenTelemetry instruments.
 * Metric definitions and value history are persisted via an internal
 * EntityStorageTelemetryConnector instance created at construction time.
 * Call `start()` to initialise the MeterProvider and exporters; metrics can be
 * created and queried before start() — OTEL forwarding is simply skipped until
 * the MeterProvider is running.
 */
export class OpenTelemetryTelemetryConnector implements ITelemetryConnector {
	/**
	 * The namespace supported by the telemetry connector.
	 */
	public static readonly NAMESPACE: string = "opentelemetry";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<OpenTelemetryTelemetryConnector>();

	/**
	 * Config options, stored so start() can initialise the MeterProvider.
	 * @internal
	 */
	private readonly _config: IOpenTelemetryTelemetryConnectorConfig;

	/**
	 * Internal entity-storage connector that owns all metric metadata and value history.
	 * Created at construction time — fails fast if entity storage is not set up.
	 * @internal
	 */
	private readonly _inner: EntityStorageTelemetryConnector;

	/**
	 * Live OTEL instrument handles keyed by metric id, paired with the metric type
	 * so addMetricValue can dispatch without querying storage.
	 * These are runtime objects and cannot be persisted.
	 * @internal
	 */
	private readonly _instruments: Map<
		string,
		{ metricType: MetricType; instrument: Counter | UpDownCounter | Gauge }
	>;

	/**
	 * The MeterProvider that owns all instruments. Set by start(), cleared by stop().
	 * @internal
	 */
	private _meterProvider?: MeterProvider;

	/**
	 * The Meter used to create instruments. Set by start(), cleared by stop().
	 * @internal
	 */
	private _meter?: Meter;

	/**
	 * Create a new instance of OpenTelemetryTelemetryConnector.
	 * Eagerly constructs the inner EntityStorageTelemetryConnector — if the required
	 * entity storage types are not registered this constructor will throw (fail fast).
	 * @param options The options for the connector.
	 */
	constructor(options?: IOpenTelemetryTelemetryConnectorConstructorOptions) {
		this._config = options?.config ?? {};
		this._inner = new EntityStorageTelemetryConnector({
			loggingComponentType: options?.loggingComponentType,
			telemetryMetricStorageConnectorType: options?.telemetryMetricStorageConnectorType,
			telemetryMetricValueStorageConnectorType: options?.telemetryMetricValueStorageConnectorType
		});
		this._instruments = new Map();
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return OpenTelemetryTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Initialise the MeterProvider and configured exporters.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when the MeterProvider is running.
	 */
	public async start(nodeLoggingComponentType?: string): Promise<void> {
		if (!Is.undefined(this._meterProvider)) {
			return;
		}

		const readers: MetricReader[] = [];
		for (const [, config] of Object.entries(this._config.readers ?? {})) {
			if (config.type === "prometheus") {
				readers.push(
					new PrometheusExporter({
						port: config.port,
						endpoint: config.endpoint,
						// PrometheusExporter uses preventServerStart (inverted); our config
						// exposes the more intuitive startServer (defaults to true).
						preventServerStart: !(config.startServer ?? true),
						prefix: config.prefix
					})
				);
			} else {
				throw new GeneralError(OpenTelemetryTelemetryConnector.CLASS_NAME, "unknownReaderType", {
					type: config.type
				});
			}
		}

		this._meterProvider = new MeterProvider({ readers });
		this._meter = this._meterProvider.getMeter(
			this._config.meterName ?? "twin-telemetry",
			this._config.meterVersion ?? "1.0.0"
		);

		const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
		await nodeLogging?.log({
			source: OpenTelemetryTelemetryConnector.CLASS_NAME,
			message: "connectorStarted",
			level: "info",
			data: { readerCount: Object.keys(this._config.readers ?? {}).length }
		});
	}

	/**
	 * Shut down the MeterProvider and release resources.
	 * Calling stop() on a connector that has not been started is a no-op.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when the MeterProvider has shut down.
	 */
	public async stop(nodeLoggingComponentType?: string): Promise<void> {
		if (!Is.undefined(this._meterProvider)) {
			await this._meterProvider.shutdown();
			this._meterProvider = undefined;
			this._meter = undefined;
			this._instruments.clear();

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
	 * The definition is always persisted via the inner entity-storage connector.
	 * If the MeterProvider is running the corresponding OTEL instrument is also registered.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been persisted and the OTEL instrument registered.
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

		// Register an OTEL instrument when the MeterProvider is running.
		// This runs even when the metric already exists in storage so instruments
		// survive process restarts (AlreadyExistsError path).
		const meter = this._meter;
		if (meter !== undefined && !this._instruments.has(metric.id)) {
			const instrumentOptions = {
				description: metric.description,
				unit: metric.unit
			};
			let instrument: Counter | UpDownCounter | Gauge;
			if (metric.type === MetricType.Counter) {
				instrument = meter.createCounter(metric.id, instrumentOptions);
			} else if (metric.type === MetricType.IncDecCounter) {
				instrument = meter.createUpDownCounter(metric.id, instrumentOptions);
			} else {
				instrument = meter.createGauge(metric.id, instrumentOptions);
			}
			this._instruments.set(metric.id, { metricType: metric.type, instrument });
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

		// When the metric has no recorded values yet the inner connector returns
		// entities[0] = undefined via queryValues. Return a placeholder so callers
		// are not surprised by a null value field — treat id="" as "no measurements yet".
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
	 * This method updates the persisted metadata mirror; the description/unit changes
	 * are NOT propagated to the registered MeterProvider and will not appear at the
	 * OTEL backend (Prometheus, OTLP, etc.).
	 * @param metric The metric details (type cannot be changed).
	 * @returns A promise that resolves when the persisted metadata has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		return this._inner.updateMetric(metric);
	}

	/**
	 * Record a metric value.
	 * Entity storage always receives the value first and performs all validation.
	 * If the MeterProvider is running the measurement is also forwarded to the OTEL instrument.
	 * Counter accepts positive integers or "inc".
	 * UpDownCounter accepts integers (positive or negative) or "inc"/"dec".
	 * Gauge accepts any number.
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
		// Entity storage validates and persists first; throws NotFoundError if metric not found.
		const valueId = await this._inner.addMetricValue(id, value, customData);

		// Forward to the OTEL instrument only when the MeterProvider is running.
		if (this._meter !== undefined) {
			const entry = this._instruments.get(id);
			if (entry !== undefined) {
				const attributes = this.toAttributes(customData);
				const { metricType, instrument } = entry;

				// Value already validated by inner connector — dispatch unconditionally.
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
	 * of the process. Re-creating a metric with the same id but a different MetricType
	 * is therefore not safe.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and its value history have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		this._instruments.delete(id);
		// The inner connector cascades and removes all associated metric values.
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
	 * Convert customData to OTEL-compatible Attributes.
	 * Scalar values (string, number, boolean) and uniform primitive arrays
	 * (string[], number[], boolean[]) are forwarded; other values are silently dropped.
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
