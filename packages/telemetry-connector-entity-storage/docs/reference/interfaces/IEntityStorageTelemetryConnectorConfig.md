# Interface: IEntityStorageTelemetryConnectorConfig

The configuration for the entity storage telemetry connector.

## Properties

### mutexTimeoutMs? {#mutextimeoutms}

> `optional` **mutexTimeoutMs?**: `number`

The timeout in milliseconds for acquiring the metric write mutex lock.

***

### batchSize? {#batchsize}

> `optional` **batchSize?**: `number`

Flush the cache when it reaches this many entries; values &lt;= 1 disable size-based flushing.

#### Default

```ts
10.
```

***

### batchIntervalMs? {#batchintervalms}

> `optional` **batchIntervalMs?**: `number`

Flush the cache every this many milliseconds; values &lt;= 0 disable timer-based flushing.

#### Default

```ts
5000.
```

***

### maxCacheSize? {#maxcachesize}

> `optional` **maxCacheSize?**: `number`

Maximum entries to retain in the cache if a flush fails and entries are re-queued.
0 means unlimited.

#### Default

```ts
1000.
```

***

### metricDefinitionCacheCapacity? {#metricdefinitioncachecapacity}

> `optional` **metricDefinitionCacheCapacity?**: `number`

Maximum number of metric definitions held in the in-memory definition cache.

#### Default

```ts
100.
```

***

### metricDefinitionCacheTtiMs? {#metricdefinitioncachettims}

> `optional` **metricDefinitionCacheTtiMs?**: `number`

Time-to-idle in milliseconds for cached metric definitions.

#### Default

```ts
3600000.
```
