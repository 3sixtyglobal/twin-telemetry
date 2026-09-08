# Interface: ITelemetryMetricValueEntry

A single metric value in a batch add operation.

## Properties

### id {#id}

> **id**: `string`

The id of the metric.

***

### value {#value}

> **value**: `number` \| [`MetricCounterOperation`](../type-aliases/MetricCounterOperation.md)

The value for the add operation.

***

### customData? {#customdata}

> `optional` **customData?**: `object`

The custom data for the metric value.

#### Index Signature

\[`key`: `string`\]: `unknown`
