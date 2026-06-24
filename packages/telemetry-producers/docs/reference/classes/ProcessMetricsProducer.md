# Class: ProcessMetricsProducer

Metrics producer that emits Node.js process metrics on every poll cycle.

## Implements

- `IMetricsProducer`

## Constructors

### Constructor

> **new ProcessMetricsProducer**(`options?`): `ProcessMetricsProducer`

Create a new instance of ProcessMetricsProducer.

#### Parameters

##### options?

[`IProcessMetricsProducerConstructorOptions`](../interfaces/IProcessMetricsProducerConstructorOptions.md)

The options for the producer.

#### Returns

`ProcessMetricsProducer`

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

`IMetricsProducer.className`

***

### register() {#register}

> **register**(): `Promise`\<`void`\>

Register all process metrics with the telemetry component.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all process metrics have been registered.

#### Implementation of

`IMetricsProducer.register`

***

### collect() {#collect}

> **collect**(): `Promise`\<`void`\>

Collect and push current process metric values.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all process metric values have been recorded.

#### Implementation of

`IMetricsProducer.collect`
