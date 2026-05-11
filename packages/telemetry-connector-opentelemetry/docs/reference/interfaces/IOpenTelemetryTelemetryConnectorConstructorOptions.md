# Interface: IOpenTelemetryTelemetryConnectorConstructorOptions

The options for the OpenTelemetry telemetry connector constructor.

## Properties

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

***

### config? {#config}

> `optional` **config?**: [`IOpenTelemetryTelemetryConnectorConfig`](IOpenTelemetryTelemetryConnectorConfig.md)

The config for the telemetry connector.
