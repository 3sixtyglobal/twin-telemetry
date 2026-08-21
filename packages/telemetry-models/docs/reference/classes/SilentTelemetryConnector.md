# Class: SilentTelemetryConnector

Class for performing telemetry operations to nowhere.

## Implements

- [`ITelemetryConnector`](../interfaces/ITelemetryConnector.md)

## Constructors

### Constructor

> **new SilentTelemetryConnector**(): `SilentTelemetryConnector`

#### Returns

`SilentTelemetryConnector`

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"silent"`

The namespace for the class.

***

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

`ITelemetryConnector.className`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create a new metric.

#### Parameters

##### metric

[`ITelemetryMetric`](../interfaces/ITelemetryMetric.md)

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been created.

#### Implementation of

[`ITelemetryConnector`](../interfaces/ITelemetryConnector.md).[`createMetric`](../interfaces/ITelemetryConnector.md#createmetric)

***

### updateMetric() {#updatemetric}

> **updateMetric**(`metric`): `Promise`\<`void`\>

Update metric.

#### Parameters

##### metric

`Omit`\<[`ITelemetryMetric`](../interfaces/ITelemetryMetric.md), `"type"`\>

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been updated.

#### Implementation of

[`ITelemetryConnector`](../interfaces/ITelemetryConnector.md).[`updateMetric`](../interfaces/ITelemetryConnector.md#updatemetric)

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

#### Implementation of

[`ITelemetryConnector`](../interfaces/ITelemetryConnector.md).[`addMetricValue`](../interfaces/ITelemetryConnector.md#addmetricvalue)

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

[`ITelemetryConnector`](../interfaces/ITelemetryConnector.md).[`removeMetric`](../interfaces/ITelemetryConnector.md#removemetric)
