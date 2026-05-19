# Interface: IMetricsProducer

Contract for a metrics producer.

A producer declares its metrics with `register()` once and pushes current
values with `collect()` on every poll cycle. Producers are discovered via
`MetricsProducerFactory` and orchestrated by a `MetricsCollectorService`.

Producers are factory-only entries — they are not lifecycle components of
the engine. The orchestrating service owns the polling timer.

## Extends

- `IComponent`

## Methods

### register() {#register}

> **register**(): `Promise`\<`void`\>

Register every metric this producer emits with the telemetry component.
Called once when the orchestrating service starts.

#### Returns

`Promise`\<`void`\>

Nothing.

***

### collect() {#collect}

> **collect**(): `Promise`\<`void`\>

Push the current values for every metric this producer emits.
Called on every poll cycle.

#### Returns

`Promise`\<`void`\>

Nothing.
