# Telemetry Connector OpenTelemetry Examples

These examples show how to wire the connector to an OpenTelemetry SDK provider, record metrics, and connect to a Grafana/Prometheus stack.

## Prometheus Metric Naming

When using the Prometheus exporter, the OTEL SDK appends the `unit` field to the metric
name following the OpenMetrics convention. If you set `unit: "requests"` on a counter
named `api_requests`, Prometheus will expose it as `api_requests_requests_total` — which
may not be what you want. Omit the `unit` field (or leave it empty) to get clean names:

- `api_requests` (Counter, no unit) → `api_requests_total`
- `active_connections` (UpDownCounter, no unit) → `active_connections`
- `cpu_temperature` (Gauge, no unit) → `cpu_temperature`

> This only applies to the Prometheus exporter. OTLP exporters (e.g. Grafana Agent,
> Tempo, OTEL Collector) preserve the unit as metadata and are not affected.

## Basic Setup with Prometheus Exporter

Install the optional Prometheus exporter peer dependency alongside the connector:

```shell
npm install @opentelemetry/exporter-prometheus
```

Pass a `readers` config map to the connector constructor. The connector instantiates the
exporter internally when `start()` is called — no manual `MeterProvider` wiring is needed.

```typescript
import { EntityStorageConnectorFactory } from '@3sixty/entity-storage-models';
import { MemoryEntityStorageConnector } from '@3sixty/entity-storage-connector-memory';
import { TelemetryConnectorFactory } from '@3sixty/telemetry-models';
import {
  OpenTelemetryTelemetryConnector,
  initSchema,
  type TelemetryMetric,
  type TelemetryMetricValue
} from '@3sixty/telemetry-connector-opentelemetry';

// Register entity storage so the connector can persist metric definitions and history.
initSchema();
EntityStorageConnectorFactory.register(
  'telemetry-metric',
  () => new MemoryEntityStorageConnector<TelemetryMetric>({ entitySchema: 'TelemetryMetric' })
);
EntityStorageConnectorFactory.register(
  'telemetry-metric-value',
  () =>
    new MemoryEntityStorageConnector<TelemetryMetricValue>({ entitySchema: 'TelemetryMetricValue' })
);

const connector = new OpenTelemetryTelemetryConnector({
  config: {
    meterName: 'my-service',
    meterVersion: '1.0.0',
    readers: {
      prometheus: { type: 'prometheus', port: 9464 }
    }
  }
});

await connector.start();

TelemetryConnectorFactory.register('telemetry', () => connector);
```

## Creating and Recording Metrics

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { OpenTelemetryTelemetryConnector } from '@3sixty/telemetry-connector-opentelemetry';

const connector = new OpenTelemetryTelemetryConnector();

console.log(connector.className()); // OpenTelemetryTelemetryConnector

await connector.createMetric({
  id: 'api-requests',
  label: 'API Requests',
  description: 'Total number of API requests received',
  unit: 'requests',
  type: MetricType.Counter
});

await connector.createMetric({
  id: 'active-connections',
  label: 'Active Connections',
  description: 'Number of currently active WebSocket connections',
  unit: 'connections',
  type: MetricType.IncDecCounter
});

await connector.createMetric({
  id: 'cpu-temperature',
  label: 'CPU Temperature',
  description: 'Current CPU temperature reading',
  unit: 'celsius',
  type: MetricType.Gauge
});

// Counter: increment only
await connector.addMetricValue('api-requests', 'inc');
await connector.addMetricValue('api-requests', 10, { route: '/api/health', statusCode: 200 });

// IncDecCounter: increment and decrement
await connector.addMetricValue('active-connections', 'inc');
await connector.addMetricValue('active-connections', 'dec');

// Gauge: absolute value
await connector.addMetricValue('cpu-temperature', 72.4);
await connector.addMetricValue('cpu-temperature', 68.1, { node: 'edge-1' });

const latest = await connector.getMetric('cpu-temperature');
console.log(latest.value.value); // 68.1
```

## Querying the Local Registry

The connector keeps an in-memory mirror of all recorded values so you can read back metrics without a separate query backend.

```typescript
import { MetricType } from '@3sixty/telemetry-models';
import { OpenTelemetryTelemetryConnector } from '@3sixty/telemetry-connector-opentelemetry';

const connector = new OpenTelemetryTelemetryConnector();

// List all metrics of a given type
const counters = await connector.query(MetricType.Counter, undefined, 25);
console.log(counters.entities.length);

// Paginate through value history
const page1 = await connector.queryValues(
  'api-requests',
  Date.now() - 3_600_000,
  Date.now(),
  undefined,
  20
);
console.log(page1.entities.length);

if (page1.cursor) {
  const page2 = await connector.queryValues('api-requests', undefined, undefined, page1.cursor, 20);
  console.log(page2.entities.length);
}
```

## Updating and Removing Metrics

```typescript
import { OpenTelemetryTelemetryConnector } from '@3sixty/telemetry-connector-opentelemetry';

const connector = new OpenTelemetryTelemetryConnector();

await connector.updateMetric({
  id: 'api-requests',
  label: 'API Requests Total',
  description: 'Cumulative count of all API requests',
  unit: 'requests'
});

await connector.removeMetric('api-requests');

const result = await connector.query(undefined, undefined, 10);
console.log(result.entities.length); // 0
```

## Connecting to Grafana via OTLP

> OTLP exporter support is planned for a future release. The `readers` config map currently
> supports `type: "prometheus"` only. Additional reader types (OTLP HTTP, OTLP gRPC, etc.)
> will be added as further discriminated-union members of `IOpenTelemetryReaderConfig`.
