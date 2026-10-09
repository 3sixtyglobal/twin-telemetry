# Telemetry Models Examples

These examples demonstrate how to compose telemetry connectors and use the shared telemetry contracts when building integrations.

## MultiTelemetryConnector

```typescript
import {
  MetricType,
  MultiTelemetryConnector,
  SilentTelemetryConnector,
  TelemetryConnectorFactory
} from '@3sixty/telemetry-models';

TelemetryConnectorFactory.register('silent-a', () => new SilentTelemetryConnector());
TelemetryConnectorFactory.register('silent-b', () => new SilentTelemetryConnector());

const multi = new MultiTelemetryConnector({
  telemetryConnectorTypes: ['silent-a', 'silent-b']
});

console.log(multi.className()); // multiTelemetryConnector

await multi.createMetric({
  id: 'heartbeat-total',
  label: 'Heartbeat Total',
  description: 'Number of heartbeats sent',
  unit: 'events',
  type: MetricType.Counter
});

await multi.updateMetric({
  id: 'heartbeat-total',
  label: 'Heartbeat Events',
  description: 'Total heartbeats sent by all nodes',
  unit: 'events'
});

const metricValueId = await multi.addMetricValue('heartbeat-total', 'inc', {
  nodeId: 'node-7'
});

console.log(metricValueId.length === 0); // true
```

```typescript
import {
  MetricType,
  MultiTelemetryConnector,
  SilentTelemetryConnector,
  TelemetryConnectorFactory
} from '@3sixty/telemetry-models';

TelemetryConnectorFactory.register('silent-a', () => new SilentTelemetryConnector());
TelemetryConnectorFactory.register('silent-b', () => new SilentTelemetryConnector());

const multi = new MultiTelemetryConnector({
  telemetryConnectorTypes: ['silent-a', 'silent-b']
});

await multi.removeMetric('heartbeat-total');

const counters = await multi.query(MetricType.Counter, undefined, 50);
console.log(counters.entities.length); // 0

const values = await multi.queryValues(
  'heartbeat-total',
  Date.now() - 86_400_000,
  Date.now(),
  undefined,
  100
);
console.log(values.entities.length); // 0

const metric = await multi.getMetric('heartbeat-total');
console.log(metric.metric.id); // heartbeat-total
```

## SilentTelemetryConnector

```typescript
import { MetricType, SilentTelemetryConnector } from '@3sixty/telemetry-models';

const silent = new SilentTelemetryConnector();

console.log(silent.className()); // silentTelemetryConnector

await silent.createMetric({
  id: 'dropped-messages',
  label: 'Dropped Messages',
  type: MetricType.Counter
});

await silent.updateMetric({
  id: 'dropped-messages',
  label: 'Dropped Messages Total'
});

await silent.addMetricValue('dropped-messages', 1);
await silent.removeMetric('dropped-messages');
```

```typescript
import { SilentTelemetryConnector } from '@3sixty/telemetry-models';

const silent = new SilentTelemetryConnector();

try {
  await silent.getMetric('dropped-messages');
} catch (error) {
  if (error instanceof Error) {
    console.log(error.name); // NotSupportedError
  }
}

try {
  await silent.query();
} catch (error) {
  if (error instanceof Error) {
    console.log(error.name); // NotSupportedError
  }
}

try {
  await silent.queryValues('dropped-messages');
} catch (error) {
  if (error instanceof Error) {
    console.log(error.name); // NotSupportedError
  }
}
```

## TelemetryConnectorFactory

```typescript
import { SilentTelemetryConnector, TelemetryConnectorFactory } from '@3sixty/telemetry-models';

TelemetryConnectorFactory.register('silent-default', () => new SilentTelemetryConnector());

const connector = TelemetryConnectorFactory.get('silent-default');
console.log(connector.className()); // silentTelemetryConnector
```
