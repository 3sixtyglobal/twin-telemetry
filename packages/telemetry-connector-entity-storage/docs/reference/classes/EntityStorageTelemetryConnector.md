# Class: EntityStorageTelemetryConnector

Class for performing telemetry operations in entity storage.
The metric values are written by a long running background thread, so nothing about a value
is held in memory here; only the metric definitions, which are immutable once registered,
are cached.

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

### DEFAULT\_FLUSH\_TIMEOUT\_MS {#default_flush_timeout_ms}

> `readonly` `static` **DEFAULT\_FLUSH\_TIMEOUT\_MS**: `number` = `30_000`

Default time in milliseconds to wait for the background thread to confirm a flush.

***

### DEFAULT\_METRIC\_DEFINITION\_CACHE\_CAPACITY {#default_metric_definition_cache_capacity}

> `readonly` `static` **DEFAULT\_METRIC\_DEFINITION\_CACHE\_CAPACITY**: `number` = `1000`

Maximum number of metric definitions to hold in the in-memory definition cache.

***

### DEFAULT\_METRIC\_DEFINITION\_CACHE\_TTI\_MS {#default_metric_definition_cache_tti_ms}

> `readonly` `static` **DEFAULT\_METRIC\_DEFINITION\_CACHE\_TTI\_MS**: `number` = `3_600_000`

Time-to-idle in milliseconds for cached metric definitions.
Metric definitions are immutable once registered; a long TTI keeps active
metrics cached without permanent references.

***

### DEFAULT\_TASK\_COALESCE\_MS {#default_task_coalesce_ms}

> `readonly` `static` **DEFAULT\_TASK\_COALESCE\_MS**: `number` = `100`

Default time in milliseconds values are held so several share a single background task.
Keeps the task write off the caller's path, which matters most for the metrics recorded
on every REST request.

***

### DEFAULT\_COALESCE\_SIZE {#default_coalesce_size}

> `readonly` `static` **DEFAULT\_COALESCE\_SIZE**: `number` = `100`

Maximum number of values held while coalescing before a task is created regardless of
how much of the window is left.

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

Start the connector; registers the long running background thread which writes the
metric values.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connector is ready to accept metric values.

#### Implementation of

`ITelemetryConnector.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the connector; writes any values still pending and releases the background thread.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the final write completes and the thread is released.

#### Implementation of

`ITelemetryConnector.stop`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create one or more metrics.
A single metric fails if it already exists; an array declares the set that should exist,
creating the ones that are missing and leaving the rest untouched. The array form resolves
what already exists with one query and writes the rest in one batch.

#### Parameters

##### metric

`ITelemetryMetric` \| `ITelemetryMetric`[]

The metric details, or the details of several metrics.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metrics have been created.

#### Throws

AlreadyExistsError if a single metric already exists.

#### Implementation of

`ITelemetryConnector.createMetric`

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
The value is handed to the background thread which computes it from the value currently
in storage and performs the write, so it is not visible until the thread has flushed.

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

### addMetricValues() {#addmetricvalues}

> **addMetricValues**(`values`): `Promise`\<`string`[]\>

Add multiple metric values, handing the whole set to the background thread as a single
task rather than one per value.

#### Parameters

##### values

`ITelemetryMetricValueEntry`[]

The metric values to add.

#### Returns

`Promise`\<`string`[]\>

The ids of the newly created metric value entries, in the order supplied.

#### Implementation of

`ITelemetryConnector.addMetricValues`

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
