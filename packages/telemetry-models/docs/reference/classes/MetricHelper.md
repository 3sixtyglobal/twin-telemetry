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

A promise that resolves when all metrics have been created or confirmed to exist.

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

A promise that resolves when the metric has been created or confirmed to exist.

***

### metricIncrement() {#metricincrement}

> `static` **metricIncrement**(`telemetryComponent`, `id`, `customData?`, `onError?`): `Promise`\<`void`\>

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

##### onError?

(`err`) => `void` \| `Promise`\<`void`\>

Optional callback invoked with the swallowed error, for callers that want visibility.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the increment has been recorded or the error swallowed.

***

### metricDecrement() {#metricdecrement}

> `static` **metricDecrement**(`telemetryComponent`, `id`, `customData?`, `onError?`): `Promise`\<`void`\>

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

##### onError?

(`err`) => `void` \| `Promise`\<`void`\>

Optional callback invoked with the swallowed error, for callers that want visibility.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the decrement has been recorded or the error swallowed.

***

### metricValue() {#metricvalue}

> `static` **metricValue**(`telemetryComponent`, `id`, `value`, `customData?`, `onError?`): `Promise`\<`void`\>

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

##### onError?

(`err`) => `void` \| `Promise`\<`void`\>

Optional callback invoked with the swallowed error, for callers that want visibility.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the value has been recorded or the error swallowed.
