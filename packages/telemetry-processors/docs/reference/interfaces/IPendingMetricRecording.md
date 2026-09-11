# Interface: IPendingMetricRecording

A request metric queued by the metrics route processor, waiting to be handed to the
telemetry component.

## Properties

### contextIds {#contextids}

> **contextIds**: `IContextIds`

The context IDs of the request, used to record the metric in that request's context.

***

### method {#method}

> **method**: `string`

The HTTP method of the request.

***

### route {#route}

> **route**: `string`

The route template path of the request.

***

### statusCode {#statuscode}

> **statusCode**: `number`

The HTTP status code of the response.

***

### statusClass {#statusclass}

> **statusClass**: `string`

The status class of the response.
