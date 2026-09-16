# Function: telemetryMetricValueTaskStart()

> **telemetryMetricValueTaskStart**(`engineCloneData`, `config?`): `Promise`\<`void`\>

Telemetry Metric Value Task Startup Method.

## Parameters

### engineCloneData

`unknown`

Engine clone data used to initialise a worker-thread engine instance.

### config?

[`ITelemetryMetricValueWriterConfig`](../interfaces/ITelemetryMetricValueWriterConfig.md)

The writer configuration, supplied once by the connector when the worker starts.

## Returns

`Promise`\<`void`\>

A promise that resolves when the engine has started and is ready to process tasks.
