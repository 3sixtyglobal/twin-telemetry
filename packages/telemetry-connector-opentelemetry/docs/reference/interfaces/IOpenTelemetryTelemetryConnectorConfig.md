# Interface: IOpenTelemetryTelemetryConnectorConfig

The options for the OpenTelemetry telemetry connector constructor.

## Properties

### mutexTimeoutMs? {#mutextimeoutms}

> `optional` **mutexTimeoutMs?**: `number`

Timeout in milliseconds for acquiring the inner entity-storage metric write mutex lock.

***

### batchSize? {#batchsize}

> `optional` **batchSize?**: `number`

Number of metric value entries to accumulate before flushing to entity storage.

#### Default

```ts
10
```

***

### batchIntervalMs? {#batchintervalms}

> `optional` **batchIntervalMs?**: `number`

Interval in milliseconds between automatic batch flushes to entity storage.

#### Default

```ts
5000
```

***

### maxCacheSize? {#maxcachesize}

> `optional` **maxCacheSize?**: `number`

Maximum number of entries retained in the write-ahead cache if a flush fails.

#### Default

```ts
1000
```

***

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
1.0.0
```

***

### readers? {#readers}

> `optional` **readers?**: `object`

Named metric-reader configurations keyed by an arbitrary id.
Each entry's `type` field determines which exporter the connector instantiates
in start(). Omit or pass an empty object for a no-op provider (useful for tests).

#### Index Signature

\[`id`: `string`\]: [`IOpenTelemetryReaderConfig`](../type-aliases/IOpenTelemetryReaderConfig.md)
