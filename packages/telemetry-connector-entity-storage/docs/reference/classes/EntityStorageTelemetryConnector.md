# Class: EntityStorageTelemetryConnector

Class for performing telemetry operations in entity storage.

## Implements

- `ITelemetryConnector`

## Constructors

### Constructor

> **new EntityStorageTelemetryConnector**(`options?`): `EntityStorageTelemetryConnector`

Create a new instance of EntityStorageTelemetryConnector.

#### Parameters

##### options?

[`IEntityStorageTelemetryConnectorConstructorOptions`](../interfaces/IEntityStorageTelemetryConnectorConstructorOptions.md)

The options for the connector.

#### Returns

`EntityStorageTelemetryConnector`

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"entity-storage"`

The namespace supported by the telemetry connector.

***

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_BATCH\_SIZE {#default_batch_size}

> `readonly` `static` **DEFAULT\_BATCH\_SIZE**: `number` = `10`

Default number of entries to accumulate before flushing.

***

### DEFAULT\_BATCH\_INTERVAL\_MS {#default_batch_interval_ms}

> `readonly` `static` **DEFAULT\_BATCH\_INTERVAL\_MS**: `number` = `5000`

Default interval in milliseconds between automatic flushes.

***

### DEFAULT\_MAX\_CACHE\_SIZE {#default_max_cache_size}

> `readonly` `static` **DEFAULT\_MAX\_CACHE\_SIZE**: `number` = `1000`

Default maximum number of entries to hold in the in-memory cache.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

#### Implementation of

`ITelemetryConnector.className`

***

### start() {#start}

> **start**(): `Promise`\<`void`\>

Start the connector; sets up the interval timer when batchIntervalMs is configured.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connector is ready to accept metric values.

#### Implementation of

`ITelemetryConnector.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the connector; flushes any remaining cached entries and clears the timer.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the final flush completes and the timer is cleared.

#### Implementation of

`ITelemetryConnector.stop`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create a new metric.

#### Parameters

##### metric

`ITelemetryMetric`

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been created.

#### Implementation of

`ITelemetryConnector.createMetric`

***

### getMetric() {#getmetric}

> **getMetric**(`id`): `Promise`\<\{ `metric`: `ITelemetryMetric`; `value`: `ITelemetryMetricValue`; \}\>

Get the metric details and it's most recent value.

#### Parameters

##### id

`string`

The metric id.

#### Returns

`Promise`\<\{ `metric`: `ITelemetryMetric`; `value`: `ITelemetryMetricValue`; \}\>

The metric details and it's most recent value.

#### Implementation of

`ITelemetryConnector.getMetric`

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

`ITelemetryConnector.updateMetric`

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

The custom data for the metric value.

#### Returns

`Promise`\<`string`\>

The id of the newly created metric value entry.

#### Implementation of

`ITelemetryConnector.addMetricValue`

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

`ITelemetryConnector.getMetricValue`

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

`ITelemetryConnector.removeMetric`

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

`ITelemetryConnector.query`

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

#### Implementation of

`ITelemetryConnector.queryValues`

***

### flush() {#flush}

> **flush**(): `Promise`\<`void`\>

Write all cached entries to storage and clear the cache.
If the mutex cannot be acquired the call returns without writing.
On a storage write failure the entries are returned to the head of the cache for the next attempt.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all cached entries have been written to storage.
