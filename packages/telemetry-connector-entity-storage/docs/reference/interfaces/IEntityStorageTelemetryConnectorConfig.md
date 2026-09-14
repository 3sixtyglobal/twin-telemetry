# Interface: IEntityStorageTelemetryConnectorConfig

The configuration for the entity storage telemetry connector.

## Properties

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

### trimIntervalMs? {#trimintervalms}

> `optional` **trimIntervalMs?**: `number`

The background thread applies the retention caps of the metrics it has written every this
many milliseconds; values &lt;= 0 disable trimming. The cap is applied here rather than on
the write path, so a metric can sit over its cap by however many values arrive within one
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
One task carries a whole window however many values it holds, so this is also what limits
the task rate; a window short enough to produce more tasks than the scheduler can drain
leaves the queue growing without bound and every read waiting flushTimeoutMs.

#### Default

```ts
1000.
```

***

### taskStallTimeoutMs? {#taskstalltimeoutms}

> `optional` **taskStallTimeoutMs?**: `number`

How long in milliseconds to allow with tasks outstanding and none of them completing
before the oldest is checked. A task not yet given to a worker is reported rather than
replaced; only a task a worker took and never completed is treated as a stalled thread
and replaced. Without this a single task which never completes ends metric collection for
the life of the process, as the scheduler goes on waiting for the one worker it believes
is still busy.
Values &lt;= 0 disable the check.

#### Default

```ts
60000.
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
