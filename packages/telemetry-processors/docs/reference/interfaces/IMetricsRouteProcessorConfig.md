# Interface: IMetricsRouteProcessorConfig

Configuration for the MetricsRouteProcessor.

## Properties

### excludePaths? {#excludepaths}

> `optional` **excludePaths?**: `string`[]

URL path prefixes that should not be recorded as metrics.
Useful for suppressing noise from health-check or metrics-scrape endpoints.

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
