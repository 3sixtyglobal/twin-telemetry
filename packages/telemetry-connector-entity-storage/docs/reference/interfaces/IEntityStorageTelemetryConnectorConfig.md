# Interface: IEntityStorageTelemetryConnectorConfig

The configuration for the entity storage telemetry connector.

## Properties

### mutexTimeoutMs? {#mutextimeoutms}

> `optional` **mutexTimeoutMs?**: `number`

The timeout in milliseconds for acquiring the metric value write lock on the background thread.

***

### batchSize? {#batchsize}

> `optional` **batchSize?**: `number`

The background thread writes the pending values when it has this many entries;
values &lt;= 1 disable size based writing.

#### Default

```ts
10.
```

***

### batchIntervalMs? {#batchintervalms}

> `optional` **batchIntervalMs?**: `number`

The background thread writes the pending values every this many milliseconds;
values &lt;= 0 disable timer based writing.

#### Default

```ts
5000.
```

***

### maxCacheSize? {#maxcachesize}

> `optional` **maxCacheSize?**: `number`

Maximum entries the background thread retains if a write fails and entries are re-queued.
0 means unlimited.

#### Default

```ts
1000.
```

***

### flushTimeoutMs? {#flushtimeoutms}

> `optional` **flushTimeoutMs?**: `number`

How long in milliseconds to wait for the background thread to confirm a flush before
continuing without it.

#### Default

```ts
30000.
```

***

### taskCoalesceMs? {#taskcoalescems}

> `optional` **taskCoalesceMs?**: `number`

Hold values for this many milliseconds so several share a single background task; values
&lt;= 0 create a task per value. Adds up to this much latency before a value reaches the
thread, in exchange for far fewer task queue writes and no task write on the caller's path.

#### Default

```ts
100.
```

***

### metricDefinitionCacheCapacity? {#metricdefinitioncachecapacity}

> `optional` **metricDefinitionCacheCapacity?**: `number`

Maximum number of metric definitions held in the in-memory definition cache.
Definitions are immutable once registered, so they are safe to cache across nodes.

#### Default

```ts
1000.
```

***

### metricDefinitionCacheTtiMs? {#metricdefinitioncachettims}

> `optional` **metricDefinitionCacheTtiMs?**: `number`

Time-to-idle in milliseconds for cached metric definitions.

#### Default

```ts
3600000.
```

***

### overrideMetricValueTaskHandler? {#overridemetricvaluetaskhandler}

> `optional` **overrideMetricValueTaskHandler?**: `string`

The URL of the module to use for the metric value background task.
If not provided, the default telemetryMetricValueTask module will be used.
