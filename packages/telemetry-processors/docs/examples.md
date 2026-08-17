# Telemetry Processors Examples

These examples show how to register the request counter and record route metrics after an HTTP request completes.

## MetricsRouteProcessor

```typescript
import { ComponentFactory } from '@twin.org/core';
import { SilentTelemetryConnector } from '@twin.org/telemetry-models';
import { MetricsRouteProcessor } from '@twin.org/telemetry-processors';

ComponentFactory.register('telemetry', () => new SilentTelemetryConnector());

const processor = new MetricsRouteProcessor({
  telemetryComponentType: 'telemetry',
  config: { excludePaths: ['/metrics'] }
});

console.log(processor.className()); // metricsRouteProcessor

await processor.start();
await processor.post(
  { method: 'GET', url: '/api/v1/items/abc123' },
  { statusCode: 200 },
  { operationId: 'getItem', path: '/api/v1/items/:id' },
  {},
  {}
);
```
