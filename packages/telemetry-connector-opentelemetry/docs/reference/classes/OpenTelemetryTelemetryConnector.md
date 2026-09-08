# Class: OpenTelemetryTelemetryConnector

Class for performing telemetry operations using OpenTelemetry instruments.
Metric definitions are held in memory. Persistence and querying are not supported;
use a multi-connector with an EntityStorageTelemetryConnector for those capabilities.

## Implements

- `ITelemetryConnector`

## Constructors

### Constructor

> **new OpenTelemetryTelemetryConnector**(`options?`): `OpenTelemetryTelemetryConnector`

Create a new instance of OpenTelemetryTelemetryConnector.

#### Parameters

##### options?

[`IOpenTelemetryTelemetryConnectorConstructorOptions`](../interfaces/IOpenTelemetryTelemetryConnectorConstructorOptions.md)

The options for the connector.

#### Returns

`OpenTelemetryTelemetryConnector`

#### Throws

GuardError When a reader config specifies an unsupported type.

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"open-telemetry"`

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

Enable OTEL forwarding. Subsequent calls to addMetricValue will create
per-tenant/node MeterProviders on demand.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when OTEL forwarding is enabled.

#### Implementation of

`ITelemetryConnector.start`

***

### stop() {#stop}

> **stop**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Shut down all cached MeterProviders and disable OTEL forwarding.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all MeterProviders have shut down.

#### Implementation of

`ITelemetryConnector.stop`

***

### createMetric() {#createmetric}

> **createMetric**(`metric`): `Promise`\<`void`\>

Register one or more metric definitions. If the connector is already started,
the OTEL instrument is registered immediately for the current context.

#### Parameters

##### metric

`ITelemetryMetric` \| `ITelemetryMetric`[]

The metric details, or the details of several metrics.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metrics have been registered.

#### Implementation of

`ITelemetryConnector.createMetric`

***

### updateMetric() {#updatemetric}

> **updateMetric**(`metric`): `Promise`\<`void`\>

Update the in-memory metadata for a registered metric.
OpenTelemetry instrument descriptors are immutable once created; only the
cached label, description and unit are updated.

#### Parameters

##### metric

`Omit`\<`ITelemetryMetric`, `"type"`\>

The metric details (type cannot be changed).

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metadata has been updated.

#### Implementation of

`ITelemetryConnector.updateMetric`

***

### addMetricValue() {#addmetricvalue}

> **addMetricValue**(`id`, `value`, `customData?`): `Promise`\<`string`\>

Record a metric value and forward it to the appropriate OTEL instrument.
The current tenant and node IDs are read from `ContextIdStore` and used to
select (or create) the matching per-tenant/node `MeterProvider`.

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

A generated 32-character hex id for the recorded value.

#### Implementation of

`ITelemetryConnector.addMetricValue`

***

### addMetricValues() {#addmetricvalues}

> **addMetricValues**(`values`): `Promise`\<`string`[]\>

Add multiple metric values.

#### Parameters

##### values

`ITelemetryMetricValueEntry`[]

The metric values to add.

#### Returns

`Promise`\<`string`[]\>

The created metric value ids, in the order the values were supplied.

#### Implementation of

`ITelemetryConnector.addMetricValues`

***

### removeMetric() {#removemetric}

> **removeMetric**(`id`): `Promise`\<`void`\>

Remove a metric from the in-memory registry and from all cached provider instrument maps.

#### Parameters

##### id

`string`

The id of the metric.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the metric has been removed.

#### Implementation of

`ITelemetryConnector.removeMetric`
