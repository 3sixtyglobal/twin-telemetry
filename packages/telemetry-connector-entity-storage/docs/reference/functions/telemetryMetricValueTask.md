# Function: telemetryMetricValueTask()

> **telemetryMetricValueTask**(`engineCloneData`, `payload`): `Promise`\<`void`\>

Telemetry Metric Value Task.

## Parameters

### engineCloneData

`unknown`

Engine clone data used to initialise a worker-thread engine instance.

### payload

[`ITelemetryMetricValueTaskPayload`](../interfaces/ITelemetryMetricValueTaskPayload.md)

The metric values to queue, and whether the pending values should be written.

## Returns

`Promise`\<`void`\>

A promise that resolves when the value has been queued and any requested write is complete.
