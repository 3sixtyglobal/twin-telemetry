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

### backgroundTaskComponentType? {#backgroundtaskcomponenttype}

> `optional` **backgroundTaskComponentType?**: `string`

The type of the background task component which runs the metric value writes on a
background thread.

#### Default

```ts
background-task
```

***

### config? {#config}

> `optional` **config?**: [`IEntityStorageTelemetryConnectorConfig`](IEntityStorageTelemetryConnectorConfig.md)

The configuration for the connector.
