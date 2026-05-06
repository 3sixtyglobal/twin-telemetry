# Interface: ITelemetryMetric

Interface describing a telemetry metric.

## Properties

### id {#id}

> **id**: `string`

The id of the metric.

***

### label {#label}

> **label**: `string`

The label of the metric.

***

### type {#type}

> **type**: [`MetricType`](../type-aliases/MetricType.md)

The type of the metric.

***

### description? {#description}

> `optional` **description?**: `string`

Description.

***

### unit? {#unit}

> `optional` **unit?**: `string`

The unit the metric describes.

***

### maxHistory? {#maxhistory}

> `optional` **maxHistory?**: `number`

The maximum number of values to retain; oldest are trimmed on each addMetricValue call.
Unlimited when absent.
