# Telemetry Connector Entity Storage Examples

These examples show how to initialise in-memory entity stores, write telemetry data, and query values for reporting workflows.

## EntityStorageTelemetryConnector

```typescript
import { MemoryEntityStorageConnector } from '@3sixty/entity-storage-connector-memory';
import { EntityStorageConnectorFactory } from '@3sixty/entity-storage-models';
import { nameof } from '@3sixty/nameof';
import { MetricType } from '@3sixty/telemetry-models';
import {
  EntityStorageTelemetryConnector,
  type TelemetryMetric,
  type TelemetryMetricValue,
  initSchema
} from '@3sixty/telemetry-connector-entity-storage';

initSchema();

EntityStorageConnectorFactory.register(
  'telemetry-metric',
  () =>
    new MemoryEntityStorageConnector<TelemetryMetric>({
      entitySchema: nameof<TelemetryMetric>()
    })
);

EntityStorageConnectorFactory.register(
  'telemetry-metric-value',
  () =>
    new MemoryEntityStorageConnector<TelemetryMetricValue>({
      entitySchema: nameof<TelemetryMetricValue>()
    })
);

const connector = new EntityStorageTelemetryConnector();

console.log(connector.className()); // entityStorageTelemetryConnector

await connector.createMetric({
  id: 'api-requests',
  label: 'API Requests',
  description: 'Number of successful API requests',
  unit: 'requests',
  type: MetricType.Counter
});

await connector.addMetricValue('api-requests', 'inc');
await connector.addMetricValue('api-requests', 4, { route: '/metrics', statusCode: 200 });

const latest = await connector.getMetric('api-requests');
console.log(latest.value.value); // 5
```

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { EntityStorageTelemetryConnector } from '@3sixty/telemetry-connector-entity-storage';

const connector = new EntityStorageTelemetryConnector();

await connector.updateMetric({
  id: 'api-requests',
  label: 'API Requests Total',
  description: 'All successful API requests',
  unit: 'requests'
});

const metricsPage = await connector.query(MetricType.Counter, undefined, 25);
console.log(metricsPage.entities.length); // 1

const valuesPage = await connector.queryValues(
  'api-requests',
  Date.now() - 3_600_000,
  Date.now(),
  undefined,
  10
);
console.log(valuesPage.entities.length); // 2
```

```typescript
import { EntityStorageTelemetryConnector } from '@3sixty/telemetry-connector-entity-storage';

const connector = new EntityStorageTelemetryConnector();

await connector.removeMetric('api-requests');

const metricsAfterRemoval = await connector.query(undefined, undefined, 10);
console.log(metricsAfterRemoval.entities.length); // 0
```

## TelemetryMetric

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { TelemetryMetric } from '@3sixty/telemetry-connector-entity-storage';

const metric: TelemetryMetric = {
  id: 'processor-temperature',
  label: 'Processor Temperature',
  type: MetricType.Gauge,
  unit: 'celsius',
  description: 'Current processor temperature'
};

console.log(metric.label); // Processor Temperature
```

## TelemetryMetricValue

```typescript
import { TelemetryMetricValue } from '@3sixty/telemetry-connector-entity-storage';

const metricValue: TelemetryMetricValue = {
  id: 'f1f2f3f4f5f6f7f8f9f0a1a2a3a4a5a6',
  metricId: 'processor-temperature',
  ts: Date.now(),
  value: 64.5,
  customData: {
    node: 'edge-1',
    rack: 'B2'
  }
};

console.log(metricValue.value); // 64.5
```
