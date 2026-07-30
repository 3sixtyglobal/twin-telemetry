# Interface: IEntityStorageTelemetryConnectorConstructorOptions

The options for the entity storage telemetry connector constructor.

## Properties

### telemetryMetricStorageConnectorType? {#telemetrymetricstorageconnectortype}

> `optional` **telemetryMetricStorageConnectorType?**: `string`

The type of the entity storage connector to use.

#### Default

```ts
telemetry-metric
```

***

### telemetryMetricValueStorageConnectorType? {#telemetrymetricvaluestorageconnectortype}

> `optional` **telemetryMetricValueStorageConnectorType?**: `string`

The type of the entity storage connector to use.

#### Default

```ts
telemetry-metric-value
```

***

### loggingComponentType? {#loggingcomponenttype}

> `optional` **loggingComponentType?**: `string`

The type of the logging component to use, can be undefined for no logging.

***

### config? {#config}

> `optional` **config?**: [`IEntityStorageTelemetryConnectorConfig`](IEntityStorageTelemetryConnectorConfig.md)

The configuration for the connector.
