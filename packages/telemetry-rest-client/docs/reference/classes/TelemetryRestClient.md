# Class: TelemetryRestClient

Client for performing telemetry through to REST endpoints.

## Extends

- `BaseRestClient`

## Implements

- `ITelemetryComponent`

## Constructors

### Constructor

> **new TelemetryRestClient**(`config`): `TelemetryRestClient`

Create a new instance of TelemetryRestClient.

#### Parameters

##### config

`IBaseRestClientConfig`

The configuration for the client.

#### Returns

`TelemetryRestClient`

#### Overrides

`BaseRestClient.constructor`

## Properties

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

#### Implementation of

`ITelemetryComponent.className`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create one or more metrics.

#### Parameters

##### metric

`ITelemetryMetric` \| `ITelemetryMetric`[]

The metric details, or the details of several metrics.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metrics have been created.

#### Implementation of

`ITelemetryComponent.createMetric`

***

### getMetric() {#getmetric}

> **getMetric**(`id`): `Promise`\<\{ `metric`: `ITelemetryMetric`; `value?`: `ITelemetryMetricValue`; \}\>

Get the metric details and it's most recent value.

#### Parameters

##### id

`string`

The metric id.

#### Returns

`Promise`\<\{ `metric`: `ITelemetryMetric`; `value?`: `ITelemetryMetricValue`; \}\>

The metric details and it's most recent value.

#### Implementation of

`ITelemetryComponent.getMetric`

***

### getMetricValue() {#getmetricvalue}

> **getMetricValue**(`id`, `valueId`): `Promise`\<`ITelemetryMetricValue`\>

Get a specific metric value by its id.

#### Parameters

##### id

`string`

The id of the metric.

##### valueId

`string`

The id of the metric value.

#### Returns

`Promise`\<`ITelemetryMetricValue`\>

The metric value.

#### Implementation of

`ITelemetryComponent.getMetricValue`

***

### updateMetric() {#updatemetric}

> **updateMetric**(`metric`): `Promise`\<`void`\>

Update metric.

#### Parameters

##### metric

`Omit`\<`ITelemetryMetric`, `"type"`\>

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been updated.

#### Implementation of

`ITelemetryComponent.updateMetric`

***

### addMetricValue() {#addmetricvalue}

> **addMetricValue**(`id`, `value`, `customData?`): `Promise`\<`string`\>

Add a metric value.

#### Parameters

##### id

`string`

The id of the metric.

##### value

`number` \| `MetricCounterOperation`

The value for the add operation.

##### customData?

The custom data for the add operation.

#### Returns

`Promise`\<`string`\>

The created metric value id.

#### Implementation of

`ITelemetryComponent.addMetricValue`

***

### addMetricValues() {#addmetricvalues}

> **addMetricValues**(`values`): `Promise`\<`string`[]\>

Add multiple metric values.

#### Parameters

##### values

`ITelemetryMetricValueEntry`[]

The metric values to add.

#### Returns

`Promise`\<`string`[]\>

The created metric value ids, in the order the values were supplied.

#### Implementation of

`ITelemetryComponent.addMetricValues`

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

#### Implementation of

`ITelemetryComponent.removeMetric`

***

### query() {#query}

> **query**(`type?`, `cursor?`, `limit?`): `Promise`\<\{ `entities`: `ITelemetryMetric`[]; `cursor?`: `string`; \}\>

Query the metrics.

#### Parameters

##### type?

`MetricType`

The type of the metric.

##### cursor?

`string`

The cursor to request the next chunk of entities.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `entities`: `ITelemetryMetric`[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Throws

NotImplementedError if the implementation does not support retrieval.

#### Implementation of

`ITelemetryComponent.query`

***

### queryValues() {#queryvalues}

> **queryValues**(`id`, `timeStart?`, `timeEnd?`, `cursor?`, `limit?`): `Promise`\<\{ `metric`: `ITelemetryMetric`; `entities`: `ITelemetryMetricValue`[]; `cursor?`: `string`; \}\>

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

`Promise`\<\{ `metric`: `ITelemetryMetric`; `entities`: `ITelemetryMetricValue`[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Throws

NotImplementedError if the implementation does not support retrieval.

#### Implementation of

`ITelemetryComponent.queryValues`
