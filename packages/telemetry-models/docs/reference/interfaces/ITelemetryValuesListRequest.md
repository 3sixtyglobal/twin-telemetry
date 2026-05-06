# Interface: ITelemetryValuesListRequest

Get the a list of the telemetry values.

## Properties

### pathParams {#pathparams}

> **pathParams**: `object`

The path parameters.

#### id

> **id**: `string`

The id of the metric.

***

### query? {#query}

> `optional` **query?**: `object`

The query parameters.

#### timeStart?

> `optional` **timeStart?**: `string`

The start time of the metrics to retrieve as a timestamp in ms.

#### timeEnd?

> `optional` **timeEnd?**: `string`

The end time of the metrics to retrieve as a timestamp in ms.

#### cursor?

> `optional` **cursor?**: `string`

The optional cursor to get next chunk.

#### limit?

> `optional` **limit?**: `string`

Limit the number of entities to return.
