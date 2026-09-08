# Interface: ITelemetryMetricValuePayload

The details of a metric value handed to the background thread to be written.

## Properties

### valueId {#valueid}

> **valueId**: `string`

The id the metric value will be stored under, allocated by the connector so it can be
returned to the caller before the value reaches storage.

***

### metricId {#metricid}

> **metricId**: `string`

The id of the metric the value belongs to.

***

### metricType {#metrictype}

> **metricType**: `MetricType`

The type of the metric, used to apply the operation to the previous value.

***

### operation {#operation}

> **operation**: `number` \| `MetricCounterOperation`

The operation to apply to the previous value.

***

### ts {#ts}

> **ts**: `number`

The time the value was captured.

***

### maxHistory? {#maxhistory}

> `optional` **maxHistory?**: `number`

The maximum number of values retained for the metric; undefined when the metric has no cap.

***

### customData? {#customdata}

> `optional` **customData?**: `object`

The custom data for the metric value.

#### Index Signature

\[`key`: `string`\]: `unknown`

***

### contextIds? {#contextids}

> `optional` **contextIds?**: `IContextIds`

The partition context ids captured when the value was added; the write is performed
under this context.
