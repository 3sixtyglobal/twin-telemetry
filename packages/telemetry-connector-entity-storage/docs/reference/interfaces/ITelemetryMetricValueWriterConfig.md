# Interface: ITelemetryMetricValueWriterConfig

The configuration for the writer which persists the metric values on the background thread.

## Properties

### telemetryMetricValueStorageConnectorType? {#telemetrymetricvaluestorageconnectortype}

> `optional` **telemetryMetricValueStorageConnectorType?**: `string`

The type of the entity storage connector the values are written to.

#### Default

```ts
telemetry-metric-value
```

***

### loggingComponentType? {#loggingcomponenttype}

> `optional` **loggingComponentType?**: `string`

The type of the logging component to use, can be undefined for no logging.

***

### batchSize? {#batchsize}

> `optional` **batchSize?**: `number`

Write the pending values when this many have accumulated; values &lt;= 1 disable size based writing.

#### Default

```ts
10.
```

***

### batchIntervalMs? {#batchintervalms}

> `optional` **batchIntervalMs?**: `number`

Write the pending values every this many milliseconds; values &lt;= 0 disable timer based writing.

#### Default

```ts
5000.
```

***

### maxCacheSize? {#maxcachesize}

> `optional` **maxCacheSize?**: `number`

Maximum entries to retain if a write fails and the entries are re-queued.
0 means unlimited.

#### Default

```ts
1000.
```

***

### trimIntervalMs? {#trimintervalms}

> `optional` **trimIntervalMs?**: `number`

Apply the retention caps of the metrics written since the last pass every this many
milliseconds; values &lt;= 0 disable trimming. The cap is applied here rather than on the
write path, so a metric can sit over its cap by however many values arrive within one
interval.

#### Default

```ts
60000.
```

***

### trimRemoveLimit? {#trimremovelimit}

> `optional` **trimRemoveLimit?**: `number`

Maximum values a single trim pass removes from one metric, so a history far beyond its
cap is brought back over several passes rather than in one long write.

#### Default

```ts
10000.
```
