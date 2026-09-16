# Interface: ITelemetryCreateMetricRequest

Create one or more telemetry metrics.

## Properties

### body {#body}

> **body**: [`ITelemetryMetric`](ITelemetryMetric.md) \| [`ITelemetryMetric`](ITelemetryMetric.md)[]

The data to be used in the create. A single metric fails if it already exists; an array
declares the set that should exist, creating the ones that are missing.
