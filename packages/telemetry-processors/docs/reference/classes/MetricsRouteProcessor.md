# Class: MetricsRouteProcessor

Route processor that records HTTP request counts after each request completes.
Emits a single counter labelled with the HTTP method, route template, and status class.
Raw request URLs are never used as labels to keep cardinality bounded.

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

Register all REST request metrics with the telemetry component.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all metrics have been registered.

#### Implementation of

`IBaseRouteProcessor.start`

***

### post() {#post}

> **post**(`request`, `response`, `route`, `contextIds`, `processorState`): `Promise`\<`void`\>

Record a counter increment after the request completes.

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
