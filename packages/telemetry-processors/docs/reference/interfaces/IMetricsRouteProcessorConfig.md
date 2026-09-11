# Interface: IMetricsRouteProcessorConfig

Configuration for the MetricsRouteProcessor.

## Properties

### excludePaths? {#excludepaths}

> `optional` **excludePaths?**: `string`[]

URL path prefixes that should not be recorded as metrics, with the root path "/" matched in
full so the routes below it are still recorded.
Useful for suppressing noise from health-check or metrics-scrape endpoints. Supplying this
replaces the defaults rather than adding to them, so include the probe paths to keep them
excluded, or an empty array to record every route.

#### Default

```ts
["/", "/favicon.ico", "/spec", "/livez", "/readyz", "/info", "/health"].
```

***

### maxHistory? {#maxhistory}

> `optional` **maxHistory?**: `number`

Maximum number of request values to retain. A value is recorded for every request that
is not excluded, so without a cap the history grows for as long as the node serves
traffic; values &lt;= 0 retain everything.

#### Default

```ts
10000.
```

***

### maxPendingRecordings? {#maxpendingrecordings}

> `optional` **maxPendingRecordings?**: `number`

Maximum number of recordings queued off the response path before new ones are dropped.
Recording never blocks the response, so without a cap a telemetry component slower than the
request rate would queue values without bound; values &lt;= 0 queue everything.

#### Default

```ts
1000.
```

***

### drainIntervalMs? {#drainintervalms}

> `optional` **drainIntervalMs?**: `number`

Interval in milliseconds between drains of the queued recordings; values &lt;= 0 use the
default.

#### Default

```ts
1000.
```
