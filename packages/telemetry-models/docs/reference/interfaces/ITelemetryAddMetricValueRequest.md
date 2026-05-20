# Interface: ITelemetryAddMetricValueRequest

Add a telemetry metric value.

## Properties

### pathParams {#pathparams}

> **pathParams**: `object`

The path parameters.

#### id

> **id**: `string`

The id of the metric.

***

### body {#body}

> **body**: `object`

The data to be used in the update.

#### value

> **value**: `number` \| [`MetricCounterOperation`](../type-aliases/MetricCounterOperation.md)

The value for the update operation.

#### customData?

> `optional` **customData?**: `object`

The custom data for the update operation.

##### Index Signature

\[`key`: `string`\]: `unknown`
