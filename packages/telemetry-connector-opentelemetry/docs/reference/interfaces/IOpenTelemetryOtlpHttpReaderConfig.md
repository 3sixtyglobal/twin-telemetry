# Interface: IOpenTelemetryOtlpHttpReaderConfig

Configuration for an OTLP HTTP push exporter reader.
The connector instantiates an OTLPMetricExporter wrapped in a PeriodicExportingMetricReader.

## Properties

### type {#type}

> **type**: `"otlp-http"`

Type.

***

### url? {#url}

> `optional` **url?**: `string`

The OTLP HTTP endpoint URL to push metrics to.

#### Default

```ts
http://localhost:4318/v1/metrics
```

***

### exportIntervalMs? {#exportintervalms}

> `optional` **exportIntervalMs?**: `number`

How often metrics are exported, in milliseconds.

#### Default

```ts
60000
```

***

### headers? {#headers}

> `optional` **headers?**: `object`

Optional HTTP headers included in every export request.

#### Index Signature

\[`key`: `string`\]: `string`
