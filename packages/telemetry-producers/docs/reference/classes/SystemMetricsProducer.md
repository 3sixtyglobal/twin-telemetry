# Class: SystemMetricsProducer

Metrics producer that emits host-level OS metrics on every poll cycle.

## Implements

- `IMetricsProducer`

## Constructors

### Constructor

> **new SystemMetricsProducer**(`options?`): `SystemMetricsProducer`

Create a new instance of SystemMetricsProducer.

#### Parameters

##### options?

[`ISystemMetricsProducerConstructorOptions`](../interfaces/ISystemMetricsProducerConstructorOptions.md)

The options for the producer.

#### Returns

`SystemMetricsProducer`

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

Register all system metrics with the telemetry component.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all system metrics have been registered.

#### Implementation of

`IMetricsProducer.register`

***

### collect() {#collect}

> **collect**(): `Promise`\<`void`\>

Collect and push current system metric values.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all system metric values have been recorded.

#### Implementation of

`IMetricsProducer.collect`
