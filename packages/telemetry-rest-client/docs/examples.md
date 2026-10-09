# Telemetry Rest Client Examples

These snippets show how to call telemetry endpoints from application code and process the returned metric data.

## TelemetryRestClient

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { TelemetryRestClient } from '@3sixty/telemetry-rest-client';

const client = new TelemetryRestClient({
  endpoint: 'http://localhost:8080'
});

console.log(client.className()); // telemetryRestClient

await client.createMetric({
  id: 'cpu-usage',
  label: 'CPU Usage',
  description: 'Current process CPU usage',
  unit: 'percent',
  type: MetricType.Gauge
});

const addedValueId = await client.addMetricValue('cpu-usage', 42.3, {
  process: 'worker-a'
});

console.log(addedValueId.length > 0); // true
```

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { TelemetryRestClient } from '@3sixty/telemetry-rest-client';

const client = new TelemetryRestClient({ endpoint: 'http://localhost:8080' });

await client.updateMetric({
  id: 'cpu-usage',
  label: 'CPU Utilisation',
  description: 'Current CPU utilisation',
  unit: '%'
});

const latestMetric = await client.getMetric('cpu-usage');
console.log(latestMetric.metric.label); // CPU Utilisation

const metrics = await client.query(MetricType.Gauge, undefined, 20);
console.log(metrics.entities.length); // 1

const values = await client.queryValues(
  'cpu-usage',
  Date.now() - 900_000,
  Date.now(),
  undefined,
  10
);
console.log(values.entities.length); // 1
```

```typescript
import { TelemetryRestClient } from '@3sixty/telemetry-rest-client';

const client = new TelemetryRestClient({ endpoint: 'http://localhost:8080' });

await client.removeMetric('cpu-usage');

const remaining = await client.query(undefined, undefined, 20);
console.log(remaining.entities.length); // 0
```
