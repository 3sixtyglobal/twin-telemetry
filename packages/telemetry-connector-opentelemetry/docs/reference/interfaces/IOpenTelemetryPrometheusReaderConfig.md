# Interface: IOpenTelemetryPrometheusReaderConfig

Configuration for a Prometheus scrape-endpoint reader.
The connector instantiates a PrometheusExporter from these options in start().

## Properties

### type {#type}

> **type**: `"prometheus"`

Type.

***

### port? {#port}

> `optional` **port?**: `number`

TCP port the Prometheus HTTP server listens on.

#### Default

```ts
9464
```

***

### endpoint? {#endpoint}

> `optional` **endpoint?**: `string`

HTTP path that Prometheus scrapes.

#### Default

```ts
/metrics
```

***

### startServer? {#startserver}

> `optional` **startServer?**: `boolean`

Whether to start the built-in HTTP server automatically.
Set to false if you manage the server externally.

#### Default

```ts
true
```

***

### prefix? {#prefix}

> `optional` **prefix?**: `string`

Optional string prepended to every exported metric name.
