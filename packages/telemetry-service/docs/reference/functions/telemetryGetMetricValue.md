# Function: telemetryGetMetricValue()

> **telemetryGetMetricValue**(`httpRequestContext`, `componentName`, `request`): `Promise`\<`ITelemetryGetMetricValueResponse`\>

Gets a specific telemetry metric value.

## Parameters

### httpRequestContext

`IHttpRequestContext`

The request context for the API.

### componentName

`string`

The name of the component to use in the routes.

### request

`ITelemetryGetMetricValueRequest`

The request.

## Returns

`Promise`\<`ITelemetryGetMetricValueResponse`\>

The response object with additional http response properties.
