# Variable: MetricsProducerFactory

> `const` **MetricsProducerFactory**: `Factory`\<[`IMetricsProducer`](../interfaces/IMetricsProducer.md)\>

Factory for `IMetricsProducer` implementations.

The engine registers producers with `MetricsProducerFactory` during
initialisation. Third-party apps can also register their own producers
before `engine.start()` is called.
