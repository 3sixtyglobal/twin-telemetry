# Class: MetricsCollectorService

Collects metrics from registered producers at a fixed interval.

## Implements

- `IMetricsCollectorComponent`

## Constructors

### Constructor

> **new MetricsCollectorService**(`options?`): `MetricsCollectorService`

Create a new instance of MetricsCollectorService.

#### Parameters

##### options?

[`IMetricsCollectorServiceConstructorOptions`](../interfaces/IMetricsCollectorServiceConstructorOptions.md)

The options for the service.

#### Returns

`MetricsCollectorService`

#### Throws

If intervalMs is not a finite positive number.

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

`IMetricsCollectorComponent.className`

***

### start() {#start}

> **start**(): `Promise`\<`void`\>

Start the service: register all producers and begin the polling cycle.

#### Returns

`Promise`\<`void`\>

A promise that resolves after the first collection tick has completed.

#### Implementation of

`IMetricsCollectorComponent.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the service and cancel the pending timer.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the service has stopped.

#### Implementation of

`IMetricsCollectorComponent.stop`

***

### tick() {#tick}

> **tick**(): `Promise`\<`void`\>

One collection cycle across all registered producers.
Public so tests can drive it deterministically.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all producers have been polled and the next tick scheduled.
