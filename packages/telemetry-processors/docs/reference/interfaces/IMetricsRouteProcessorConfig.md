# Interface: IMetricsRouteProcessorConfig

Configuration for the MetricsRouteProcessor.

## Properties

### excludePaths? {#excludepaths}

> `optional` **excludePaths?**: `string`[]

URL path prefixes that should not be recorded as metrics.
Useful for suppressing noise from health-check or metrics-scrape endpoints.
