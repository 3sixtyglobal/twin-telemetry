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
Keyed the same way as the last value cache, so it should not be set lower than
lastValueCacheCapacity or writes will read definitions from storage.

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

### lastValueCacheCapacity? {#lastvaluecachecapacity}

> `optional` **lastValueCacheCapacity?**: `number`

Maximum number of metrics whose last value is held in memory; values &lt;= 0 mean unlimited.
Evicting an entry only costs a storage read on the next write for that metric.

#### Default

```ts
1000.
```

***

### lastValueCacheTtiMs? {#lastvaluecachettims}

> `optional` **lastValueCacheTtiMs?**: `number`

Time-to-idle in milliseconds for cached last values; values &lt;= 0 disable expiry.
Releases memory held for metrics that have stopped being written to.

#### Default

```ts
3600000.
```

***

### maxTrackedHistory? {#maxtrackedhistory}

> `optional` **maxTrackedHistory?**: `number`

Largest maxHistory for which the retained value ids are held in memory rather than read from
storage on every trim. Metrics with a larger cap fall back to scanning.

#### Default

```ts
1000.
```

***

### trackedHistoryBudget? {#trackedhistorybudget}

> `optional` **trackedHistoryBudget?**: `number`

Total number of retained value ids held across all metrics; values &lt;= 0 mean unlimited.
Bounds the memory used by history tracking independently of how many metrics are cached.

#### Default

```ts
50000.
```
