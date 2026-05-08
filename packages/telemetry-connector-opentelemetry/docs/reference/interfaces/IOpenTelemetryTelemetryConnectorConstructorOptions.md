# Interface: IOpenTelemetryTelemetryConnectorConstructorOptions

The options for the OpenTelemetry telemetry connector constructor.

## Properties

### meterName? {#metername}

> `optional` **meterName?**: `string`

The name of the OpenTelemetry meter used to create instruments.

#### Default

```ts
twin-telemetry
```

***

### meterVersion? {#meterversion}

> `optional` **meterVersion?**: `string`

The version reported by the OpenTelemetry meter.

#### Default

```ts
0.0.1
```

***

### readers? {#readers}

> `optional` **readers?**: `object`

Named metric-reader configurations keyed by an arbitrary id.
Each entry's `type` field determines which exporter the connector instantiates
in start(). Omit or pass an empty object for a no-op provider (useful for tests).

#### Index Signature

\[`id`: `string`\]: [`IOpenTelemetryPrometheusReaderConfig`](IOpenTelemetryPrometheusReaderConfig.md)

***

### loggingComponentType? {#loggingcomponenttype}

> `optional` **loggingComponentType?**: `string`

The component type to use for logging inside the connector and the inner
entity-storage connector. When omitted logging is disabled.

***

### telemetryMetricStorageConnectorType? {#telemetrymetricstorageconnectortype}

> `optional` **telemetryMetricStorageConnectorType?**: `string`

The entity storage connector type to use for storing metric definitions.
Must be registered in `EntityStorageConnectorFactory` before calling `start()`.

#### Default

```ts
telemetry-metric
```

***

### telemetryMetricValueStorageConnectorType? {#telemetrymetricvaluestorageconnectortype}

> `optional` **telemetryMetricValueStorageConnectorType?**: `string`

The entity storage connector type to use for storing metric values.
Must be registered in `EntityStorageConnectorFactory` before calling `start()`.

#### Default

```ts
telemetry-metric-value
```
