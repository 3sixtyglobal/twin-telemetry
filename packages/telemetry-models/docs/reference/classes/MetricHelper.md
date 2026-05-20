# Class: MetricHelper

Helper class for performing common metric operations, swallowing any errors from the telemetry component.

## Constructors

### Constructor

> **new MetricHelper**(): `MetricHelper`

#### Returns

`MetricHelper`

## Methods

### createMetrics() {#createmetrics}

> `static` **createMetrics**(`telemetryComponent`, `metrics`): `Promise`\<`void`\>

Create multiple metrics if they don't already exist, swallowing any already exists errors.

#### Parameters

##### telemetryComponent

[`ITelemetryComponent`](../interfaces/ITelemetryComponent.md) \| `undefined`

The telemetry component to use for creating the metrics.

##### metrics

[`ITelemetryMetric`](../interfaces/ITelemetryMetric.md)[]

The telemetry metrics to create.

#### Returns

`Promise`\<`void`\>

***

### createMetric() {#createmetric}

> `static` **createMetric**(`telemetryComponent`, `metric`): `Promise`\<`void`\>

Create a metric if it doesn't already exist, swallowing any already exists errors.

#### Parameters

##### telemetryComponent

[`ITelemetryComponent`](../interfaces/ITelemetryComponent.md) \| `undefined`

The telemetry component to use for creating the metric.

##### metric

[`ITelemetryMetric`](../interfaces/ITelemetryMetric.md)

The telemetry metric to create.

#### Returns

`Promise`\<`void`\>

***

### metricIncrement() {#metricincrement}

> `static` **metricIncrement**(`telemetryComponent`, `id`, `customData?`): `Promise`\<`void`\>

Increment a metric counter, swallowing any telemetry errors.

#### Parameters

##### telemetryComponent

[`ITelemetryComponent`](../interfaces/ITelemetryComponent.md) \| `undefined`

The telemetry component to use for incrementing the metric.

##### id

`string`

The metric ID.

##### customData?

Optional custom data for the increment.

#### Returns

`Promise`\<`void`\>

***

### metricDecrement() {#metricdecrement}

> `static` **metricDecrement**(`telemetryComponent`, `id`, `customData?`): `Promise`\<`void`\>

Decrement a metric counter, swallowing any telemetry errors.

#### Parameters

##### telemetryComponent

[`ITelemetryComponent`](../interfaces/ITelemetryComponent.md) \| `undefined`

The telemetry component to use for decrementing the metric.

##### id

`string`

The metric ID.

##### customData?

Optional custom data for the decrement.

#### Returns

`Promise`\<`void`\>

***

### metricValue() {#metricvalue}

> `static` **metricValue**(`telemetryComponent`, `id`, `value`, `customData?`): `Promise`\<`void`\>

Set a metric value, swallowing any telemetry errors.

#### Parameters

##### telemetryComponent

[`ITelemetryComponent`](../interfaces/ITelemetryComponent.md) \| `undefined`

The telemetry component to use for setting the metric value.

##### id

`string`

The metric ID.

##### value

`number`

The metric value to set.

##### customData?

Optional custom data for setting the value.

#### Returns

`Promise`\<`void`\>
