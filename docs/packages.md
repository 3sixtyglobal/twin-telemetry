# Telemetry Packages

## telemetry-models

The package serves as a foundational component within the repository. Its primary purpose is to provide shared telemetry models for connectors and services. By doing so, it enables other packages to build upon a consistent and reliable base. This package is integral to ensuring that common functionality is centralised and reusable across the ecosystem.

- [README](../packages/telemetry-models/README.md)
- [Examples](../packages/telemetry-models/docs/examples.md)
- [Reference](../packages/telemetry-models/docs/reference/index.md)
- [Changelog](../packages/telemetry-models/docs/changelog.md)

## telemetry-connector-entity-storage

This package is designed to persist telemetry metrics through an entity storage connector. It plays a crucial role in ensuring that telemetry data can be stored and retrieved in a consistent way, thereby reducing integration errors and improving maintainability. Its implementation reflects a focus on semantic clarity and interoperability.

- [README](../packages/telemetry-connector-entity-storage/README.md)
- [Examples](../packages/telemetry-connector-entity-storage/docs/examples.md)
- [Reference](../packages/telemetry-connector-entity-storage/docs/reference/index.md)
- [Changelog](../packages/telemetry-connector-entity-storage/docs/changelog.md)

## telemetry-connector-opentelemetry

This package pushes telemetry metrics to OpenTelemetry-compatible backends such as Prometheus and Grafana. It extends the repository's telemetry pipeline with a standard integration point for observability tooling, making it easier to expose collected metrics to external monitoring systems.

- [README](../packages/telemetry-connector-opentelemetry/README.md)
- [Examples](../packages/telemetry-connector-opentelemetry/docs/examples.md)
- [Reference](../packages/telemetry-connector-opentelemetry/docs/reference/index.md)
- [Changelog](../packages/telemetry-connector-opentelemetry/docs/changelog.md)

## telemetry-service

The package addresses telemetry service operations and REST entry points. It is intended to streamline workflows and provide developers with a consistent set of resources that align with the repository's overall objectives. By encapsulating this functionality, the package contributes to both productivity and long-term sustainability of the codebase.

- [README](../packages/telemetry-service/README.md)
- [Examples](../packages/telemetry-service/docs/examples.md)
- [Reference](../packages/telemetry-service/docs/reference/index.md)
- [Changelog](../packages/telemetry-service/docs/changelog.md)

## telemetry-rest-client

This package focuses on integration with telemetry service endpoints over REST. Its role is to ensure that telemetry workflows can be consumed reliably across different environments. The package embodies best practices for interoperability and reproducible client access patterns, making it a cornerstone of operational stability.

- [README](../packages/telemetry-rest-client/README.md)
- [Examples](../packages/telemetry-rest-client/docs/examples.md)
- [Reference](../packages/telemetry-rest-client/docs/reference/index.md)
- [Changelog](../packages/telemetry-rest-client/docs/changelog.md)

## telemetry-producers

This package provides metrics producers that collect Node.js process and host-level system metrics on each poll cycle and publish them through the shared telemetry component. It gives services a ready-made way to emit runtime and operating system telemetry without reimplementing metric registration and collection logic.

- [README](../packages/telemetry-producers/README.md)
- [Examples](../packages/telemetry-producers/docs/examples.md)
- [Reference](../packages/telemetry-producers/docs/reference/index.md)
- [Changelog](../packages/telemetry-producers/docs/changelog.md)

## telemetry-processors

Route processors for recording telemetry metrics from the web server.

- [README](../packages/telemetry-processors/README.md)
- [Examples](../packages/telemetry-processors/docs/examples.md)
- [Reference](../packages/telemetry-processors/docs/reference/index.md)
- [Changelog](../packages/telemetry-processors/docs/changelog.md)
