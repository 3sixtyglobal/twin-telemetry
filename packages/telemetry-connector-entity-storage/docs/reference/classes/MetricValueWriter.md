# Class: MetricValueWriter

Accumulates metric values and persists them to entity storage.
Runs on the background thread started by the telemetry connector, so nothing here is
cached between flushes; the previous value for a metric is always read from storage,
which keeps the counter chain correct when several load balanced nodes write to the
same storage.

## Constructors

### Constructor

> **new MetricValueWriter**(): `MetricValueWriter`

Create a new instance of MetricValueWriter.

#### Returns

`MetricValueWriter`

## Properties

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_BATCH\_SIZE {#default_batch_size}

> `readonly` `static` **DEFAULT\_BATCH\_SIZE**: `number` = `10`

Default number of entries to accumulate before writing.

***

### DEFAULT\_BATCH\_INTERVAL\_MS {#default_batch_interval_ms}

> `readonly` `static` **DEFAULT\_BATCH\_INTERVAL\_MS**: `number` = `5000`

Default interval in milliseconds between automatic writes.

***

### DEFAULT\_MAX\_CACHE\_SIZE {#default_max_cache_size}

> `readonly` `static` **DEFAULT\_MAX\_CACHE\_SIZE**: `number` = `1000`

Default maximum number of entries to hold when a write fails and the entries are re-queued.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

***

### start() {#start}

> **start**(`config?`): `Promise`\<`void`\>

Resolve the storage connector and start the interval timer.

#### Parameters

##### config?

[`ITelemetryMetricValueWriterConfig`](../interfaces/ITelemetryMetricValueWriterConfig.md)

The configuration for the writer.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the writer is ready to accept metric values.

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Write any remaining entries to storage and clear the timer.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the final write completes and the timer is cleared.

***

### add() {#add}

> **add**(`values`): `Promise`\<`void`\>

Queue metric values to be written to storage.

#### Parameters

##### values

[`ITelemetryMetricValuePayload`](../interfaces/ITelemetryMetricValuePayload.md)[]

The metric value details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the values have been queued, or written when batching is disabled.

***

### flush() {#flush}

> **flush**(): `Promise`\<`void`\>

Write all pending entries to storage and clear them.
Overlapping calls queue behind each other, as entries added after a write has taken its
snapshot would otherwise be skipped by a caller that simply joined it.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all pending entries have been written to storage.

#### Throws

GeneralError if the write lock could not be acquired within the timeout.
