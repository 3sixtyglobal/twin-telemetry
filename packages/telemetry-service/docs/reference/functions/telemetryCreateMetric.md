# Function: telemetryCreateMetric()

> **telemetryCreateMetric**(`httpRequestContext`, `componentName`, `request`, `baseRouteName`): `Promise`\<`ICreatedResponse`\>

Create one or more telemetry metrics.

## Parameters

### httpRequestContext

`IHttpRequestContext`

The request context for the API.

### componentName

`string`

The name of the component to use in the routes.

### request

`ITelemetryCreateMetricRequest`

The request.

### baseRouteName

`string`

The base route name for the API.

## Returns

`Promise`\<`ICreatedResponse`\>

The response object with additional http response properties.
