# Interface: IMetricsCollectorServiceConstructorOptions

The options for the metrics collector service constructor.

## Properties

### loggingComponentType? {#loggingcomponenttype}

> `optional` **loggingComponentType?**: `string`

The type of the logging component to use, can be undefined for no logging.

***

### platformComponentType? {#platformcomponenttype}

> `optional` **platformComponentType?**: `string`

The type of the platform component to use for partitioned producers.

#### Default

```ts
platform
```

***

### telemetryComponentType? {#telemetrycomponenttype}

> `optional` **telemetryComponentType?**: `string`

The type of the telemetry component the collected values are recorded with.

#### Default

```ts
telemetry
```

***

### config? {#config}

> `optional` **config?**: [`IMetricsCollectorServiceConfig`](IMetricsCollectorServiceConfig.md)

The configuration options for the metrics collector service.
