# Telemetry Processors Examples

These examples show how to register the request counter and record route metrics after an HTTP request completes.

## MetricsRouteProcessor

```typescript
import { ComponentFactory } from '@3sixty/core';
import { SilentTelemetryConnector } from '@3sixty/telemetry-models';
import { MetricsRouteProcessor } from '@3sixty/telemetry-processors';

ComponentFactory.register('telemetry', () => new SilentTelemetryConnector());

// The probe and info routes are excluded by default; supplying excludePaths replaces that
// list, so include them to keep them excluded.
const processor = new MetricsRouteProcessor({
  telemetryComponentType: 'telemetry',
  config: { excludePaths: ['/livez', '/readyz', '/info', '/metrics'] }
});

console.log(processor.className()); // metricsRouteProcessor

// start also starts the timer which drains the queued recordings.
await processor.start();

// post only queues the recording, so the response is not charged with storage latency.
await processor.post(
  { method: 'GET', url: '/api/v1/items/abc123' },
  { statusCode: 200 },
  { operationId: 'getItem', path: '/api/v1/items/:id' },
  {},
  {}
);

// stop clears the timer and hands over anything still queued.
await processor.stop();
```
