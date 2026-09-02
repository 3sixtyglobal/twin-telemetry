# Interface: IBatchMetricValueEntry

An entry held in the in-memory batch cache, waiting to be written to storage.

## Properties

### entity {#entity}

> **entity**: [`TelemetryMetricValue`](../classes/TelemetryMetricValue.md)

The metric value entity to write.

***

### maxHistory? {#maxhistory}

> `optional` **maxHistory?**: `number`

Maximum history retained for the metric; undefined when the metric has no cap.

***

### contextIds? {#contextids}

> `optional` **contextIds?**: `IContextIds`

The identity context ids captured when the entry was enqueued; the flush writes
the entry under this context.
