# Interface: ITelemetryMetricValueTaskPayload

The payload passed to the background thread which writes the metric values.

## Properties

### values? {#values}

> `optional` **values?**: [`ITelemetryMetricValuePayload`](ITelemetryMetricValuePayload.md)[]

The metric values to write, omitted when the task only requests a flush.

***

### flush? {#flush}

> `optional` **flush?**: `boolean`

Write any pending values to storage before the task completes.
