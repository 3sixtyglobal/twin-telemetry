# 3Sixty Telemetry

This repository provides a set of telemetry building blocks that make it easier to collect, produce, persist, expose, and consume operational metrics across distributed systems. The packages are designed to work together so service-side and client-side integrations can share a consistent model for telemetry data.

Together, these packages reduce integration friction by aligning connector contracts, service endpoints, and client access patterns. The result is a coherent telemetry stack that supports maintainable implementations from storage through to API consumption.

## Packages

- [telemetry-models](packages/telemetry-models/README.md) - Shared telemetry models for connectors and services.
- [telemetry-connector-entity-storage](packages/telemetry-connector-entity-storage/README.md) - Entity storage connector for persisting telemetry metrics.
- [telemetry-connector-opentelemetry](packages/telemetry-connector-opentelemetry/README.md) - OpenTelemetry connector for pushing telemetry metrics to OTEL-compatible backends.
- [telemetry-service](packages/telemetry-service/README.md) - Telemetry service implementation with REST entry points.
- [telemetry-rest-client](packages/telemetry-rest-client/README.md) - REST client for interacting with telemetry service endpoints.
- [telemetry-producers](packages/telemetry-producers/README.md) - Metrics producers for collecting Node.js process and system telemetry.
- [telemetry-processors](packages/telemetry-processors/README.md) - Route processors for recording telemetry metrics from the web server.

## Contributing

To contribute to this package see the guidelines for building and publishing in [CONTRIBUTING](./CONTRIBUTING.md)

## Origin

This repository is derived from the original [iotaledger/twin-telemetry](https://github.com/iotaledger/twin-telemetry) repository.
