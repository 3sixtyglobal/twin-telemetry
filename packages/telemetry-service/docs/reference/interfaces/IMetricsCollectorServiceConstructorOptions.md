# Interface: IMetricsCollectorServiceConstructorOptions

The options for the metrics collector service constructor.

## Properties

### loggingComponentType? {#loggingcomponenttype}

> `optional` **loggingComponentType?**: `string`

The type of the logging component to use.

#### Default

```ts
logging
```

***

### tenantComponentType? {#tenantcomponenttype}

> `optional` **tenantComponentType?**: `string`

The type of the tenant component to use for partitioned producers.

#### Default

```ts
tenant
```

***

### config? {#config}

> `optional` **config?**: [`IMetricsCollectorServiceConfig`](IMetricsCollectorServiceConfig.md)

The configuration options for the metrics collector service.
