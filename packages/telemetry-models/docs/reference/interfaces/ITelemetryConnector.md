# Interface: ITelemetryConnector

Interface describing a telemetry connector.

## Extends

- `IComponent`

## Methods

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create a new metric.

#### Parameters

##### metric

[`ITelemetryMetric`](ITelemetryMetric.md)

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been created.

***

### getMetric()? {#getmetric}

> `optional` **getMetric**(`id`): `Promise`\<\{ `metric`: [`ITelemetryMetric`](ITelemetryMetric.md); `value?`: [`ITelemetryMetricValue`](ITelemetryMetricValue.md); \}\>

Get the metric details and it's most recent value.

#### Parameters

##### id

`string`

The metric id.

#### Returns

`Promise`\<\{ `metric`: [`ITelemetryMetric`](ITelemetryMetric.md); `value?`: [`ITelemetryMetricValue`](ITelemetryMetricValue.md); \}\>

The metric details and it's most recent value.

***

### getMetricValue()? {#getmetricvalue}

> `optional` **getMetricValue**(`id`, `valueId`): `Promise`\<[`ITelemetryMetricValue`](ITelemetryMetricValue.md)\>

Get a specific metric value by its id.

#### Parameters

##### id

`string`

The id of the metric.

##### valueId

`string`

The id of the metric value.

#### Returns

`Promise`\<[`ITelemetryMetricValue`](ITelemetryMetricValue.md)\>

The metric value.

***

### updateMetric() {#updatemetric}

> **updateMetric**(`metric`): `Promise`\<`void`\>

Update metric.

#### Parameters

##### metric

`Omit`\<[`ITelemetryMetric`](ITelemetryMetric.md), `"type"`\>

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been updated.

***

### addMetricValue() {#addmetricvalue}

> **addMetricValue**(`id`, `value`, `customData?`): `Promise`\<`string`\>

Update metric value.

#### Parameters

##### id

`string`

The id of the metric.

##### value

`number` \| [`MetricCounterOperation`](../type-aliases/MetricCounterOperation.md)

The value for the update operation.

##### customData?

The custom data for the update operation.

#### Returns

`Promise`\<`string`\>

The created metric value id.

***

### removeMetric() {#removemetric}

> **removeMetric**(`id`): `Promise`\<`void`\>

Remove metric.

#### Parameters

##### id

`string`

The id of the metric.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric and all its values have been removed.

***

### query()? {#query}

> `optional` **query**(`type?`, `cursor?`, `limit?`): `Promise`\<\{ `entities`: [`ITelemetryMetric`](ITelemetryMetric.md)[]; `cursor?`: `string`; \}\>

Query the metrics.

#### Parameters

##### type?

[`MetricType`](../type-aliases/MetricType.md)

The type of the metric.

##### cursor?

`string`

The cursor to request the next chunk of entities.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `entities`: [`ITelemetryMetric`](ITelemetryMetric.md)[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Throws

NotImplementedError if the implementation does not support retrieval.

***

### queryValues()? {#queryvalues}

> `optional` **queryValues**(`id`, `timeStart?`, `timeEnd?`, `cursor?`, `limit?`): `Promise`\<\{ `metric`: [`ITelemetryMetric`](ITelemetryMetric.md); `entities`: [`ITelemetryMetricValue`](ITelemetryMetricValue.md)[]; `cursor?`: `string`; \}\>

Query the metric values.

#### Parameters

##### id

`string`

The id of the metric.

##### timeStart?

`number`

The inclusive time as the start of the metric entries.

##### timeEnd?

`number`

The inclusive time as the end of the metric entries.

##### cursor?

`string`

The cursor to request the next chunk of entities.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `metric`: [`ITelemetryMetric`](ITelemetryMetric.md); `entities`: [`ITelemetryMetricValue`](ITelemetryMetricValue.md)[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Throws

NotImplementedError if the implementation does not support retrieval.
