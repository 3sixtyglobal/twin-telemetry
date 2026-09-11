# Class: MetricsRouteProcessor

Route processor that records HTTP request counts after each request completes.
Emits a single counter labelled with the HTTP method, route template, and status class.
Raw request URLs are never used as labels to keep cardinality bounded.
Recording is queued off the response path, so the reply never waits for telemetry storage.

## Implements

- `IBaseRouteProcessor`

## Constructors

### Constructor

> **new MetricsRouteProcessor**(`options?`): `MetricsRouteProcessor`

Create a new instance of MetricsRouteProcessor.

#### Parameters

##### options?

[`IMetricsRouteProcessorConstructorOptions`](../interfaces/IMetricsRouteProcessorConstructorOptions.md)

The options for the processor.

#### Returns

`MetricsRouteProcessor`

## Properties

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_MAX\_HISTORY {#default_max_history}

> `readonly` `static` **DEFAULT\_MAX\_HISTORY**: `number` = `10000`

Default number of request values to retain.

***

### DEFAULT\_EXCLUDE\_PATHS {#default_exclude_paths}

> `readonly` `static` **DEFAULT\_EXCLUDE\_PATHS**: `string`[]

Default path prefixes excluded from metrics recording, the probe and info routes.
The root entry is matched in full, so the routes below it are still recorded.

***

### DEFAULT\_MAX\_PENDING\_RECORDINGS {#default_max_pending_recordings}

> `readonly` `static` **DEFAULT\_MAX\_PENDING\_RECORDINGS**: `number` = `1000`

Default number of recordings queued before new ones are dropped.

***

### DEFAULT\_DRAIN\_INTERVAL\_MS {#default_drain_interval_ms}

> `readonly` `static` **DEFAULT\_DRAIN\_INTERVAL\_MS**: `number` = `1000`

Default interval in milliseconds between drains of the queue.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

#### Implementation of

`IBaseRouteProcessor.className`

***

### start() {#start}

> **start**(): `Promise`\<`void`\>

Register all REST request metrics and start the timer which drains the queued recordings.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all metrics have been registered.

#### Implementation of

`IBaseRouteProcessor.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Clear the drain timer and hand over the recordings which are still queued.
When a drain is already running it finishes the batch it took, and anything queued after
that is left unwritten rather than holding the shutdown open.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the queued recordings have been handed over.

#### Implementation of

`IBaseRouteProcessor.stop`

***

### post() {#post}

> **post**(`request`, `response`, `route`, `contextIds`, `processorState`): `Promise`\<`void`\>

Queue a counter increment after the request completes.

#### Parameters

##### request

`IHttpServerRequest`

The HTTP request.

##### response

`IHttpResponse`

The HTTP response.

##### route

`IBaseRoute` \| `undefined`

The matched route definition, if any.

##### contextIds

`IContextIds`

The context IDs for the request.

##### processorState

Shared state for the current request processor chain.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IBaseRouteProcessor.post`
