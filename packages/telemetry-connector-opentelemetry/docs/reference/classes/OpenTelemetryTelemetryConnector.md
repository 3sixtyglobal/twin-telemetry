# Class: OpenTelemetryTelemetryConnector

Class for performing telemetry operations using OpenTelemetry instruments.
Metric definitions and value history are persisted via an internal
EntityStorageTelemetryConnector instance created at construction time.
Call `start()` to initialise the MeterProvider and exporters; metrics can be
created and queried before start() — OTEL forwarding is simply skipped until
the MeterProvider is running.

## Implements

- `ITelemetryConnector`

## Constructors

### Constructor

> **new OpenTelemetryTelemetryConnector**(`options?`): `OpenTelemetryTelemetryConnector`

Create a new instance of OpenTelemetryTelemetryConnector.
Eagerly constructs the inner EntityStorageTelemetryConnector — if the required
entity storage types are not registered this constructor will throw (fail fast).

#### Parameters

##### options?

[`IOpenTelemetryTelemetryConnectorConstructorOptions`](../interfaces/IOpenTelemetryTelemetryConnectorConstructorOptions.md)

The options for the connector.

#### Returns

`OpenTelemetryTelemetryConnector`

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"opentelemetry"`

The namespace supported by the telemetry connector.

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

### start() {#start}

> **start**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Initialise the MeterProvider and configured exporters.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the MeterProvider is running.

#### Implementation of

`ITelemetryConnector.start`

***

### stop() {#stop}

> **stop**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Shut down the MeterProvider and release resources.
Calling stop() on a connector that has not been started is a no-op.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the MeterProvider has shut down.

#### Implementation of

`ITelemetryConnector.stop`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Create a new metric.
The definition is always persisted via the inner entity-storage connector.
If the MeterProvider is running the corresponding OTEL instrument is also registered.

#### Parameters

##### metric

`ITelemetryMetric`

The metric details.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been persisted and the OTEL instrument registered.

#### Implementation of

`ITelemetryConnector.createMetric`

***

### getMetric() {#getmetric}

> **getMetric**(`id`): `Promise`\<\{ `metric`: `ITelemetryMetric`; `value`: `ITelemetryMetricValue`; \}\>

Get the metric details and its most recent value.

#### Parameters

##### id

`string`

The metric id.

#### Returns

`Promise`\<\{ `metric`: `ITelemetryMetric`; `value`: `ITelemetryMetricValue`; \}\>

The metric details and its most recent value.

#### Implementation of

`ITelemetryConnector.getMetric`

***

### updateMetric() {#updatemetric}

> **updateMetric**(`metric`): `Promise`\<`void`\>

Update the metric metadata.
Note: OpenTelemetry instrument descriptors are immutable once created.
This method updates the persisted metadata mirror; the description/unit changes
are NOT propagated to the registered MeterProvider and will not appear at the
OTEL backend (Prometheus, OTLP, etc.).

#### Parameters

##### metric

`Omit`\<`ITelemetryMetric`, `"type"`\>

The metric details (type cannot be changed).

#### Returns

`Promise`\<`void`\>

A promise that resolves when the persisted metadata has been updated.

#### Implementation of

`ITelemetryConnector.updateMetric`

***

### addMetricValue() {#addmetricvalue}

> **addMetricValue**(`id`, `value`, `customData?`): `Promise`\<`string`\>

Record a metric value.
Entity storage always receives the value first and performs all validation.
If the MeterProvider is running the measurement is also forwarded to the OTEL instrument.
Counter accepts positive integers or "inc".
UpDownCounter accepts integers (positive or negative) or "inc"/"dec".
Gauge accepts any number.

#### Parameters

##### id

`string`

The id of the metric.

##### value

`number` \| `MetricCounterOperation`

The value for the operation.

##### customData?

Optional custom data forwarded as OTEL attributes.

#### Returns

`Promise`\<`string`\>

The id of the new metric value entry.

#### Implementation of

`ITelemetryConnector.addMetricValue`

***

### removeMetric() {#removemetric}

> **removeMetric**(`id`): `Promise`\<`void`\>

Remove a metric and its persisted value history.
Note: OpenTelemetry exposes no API to deregister an instrument from a Meter,
so the underlying Counter/UpDownCounter/Gauge remains resident for the lifetime
of the process. Re-creating a metric with the same id but a different MetricType
is therefore not safe.

#### Parameters

##### id

`string`

The id of the metric.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric and its value history have been removed.

#### Implementation of

`ITelemetryConnector.removeMetric`

***

### query() {#query}

> **query**(`type?`, `cursor?`, `limit?`): `Promise`\<\{ `entities`: `ITelemetryMetric`[]; `cursor?`: `string`; \}\>

Query the registered metrics, optionally filtered by type.

#### Parameters

##### type?

`MetricType`

The type of the metric.

##### cursor?

`string`

The cursor to request the next page.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `entities`: `ITelemetryMetric`[]; `cursor?`: `string`; \}\>

The matching metrics and an optional cursor for the next page.

#### Implementation of

`ITelemetryConnector.query`

***

### queryValues() {#queryvalues}

> **queryValues**(`id`, `timeStart?`, `timeEnd?`, `cursor?`, `limit?`): `Promise`\<\{ `metric`: `ITelemetryMetric`; `entities`: `ITelemetryMetricValue`[]; `cursor?`: `string`; \}\>

Query the recorded values for a metric, ordered by most recent first.

#### Parameters

##### id

`string`

The id of the metric.

##### timeStart?

`number`

The inclusive start time (epoch ms).

##### timeEnd?

`number`

The inclusive end time (epoch ms).

##### cursor?

`string`

The cursor returned by the previous call.

##### limit?

`number`

Limit the number of values to return.

#### Returns

`Promise`\<\{ `metric`: `ITelemetryMetric`; `entities`: `ITelemetryMetricValue`[]; `cursor?`: `string`; \}\>

The metric details, matching values, and an optional cursor for the next page.

#### Implementation of

`ITelemetryConnector.queryValues`
