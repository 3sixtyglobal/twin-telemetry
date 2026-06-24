# Telemetry Service Examples

These examples show how to wire a service to a registered connector and expose telemetry operations in your application layer.

## TelemetryService

```typescript
import {
  MetricType,
  SilentTelemetryConnector,
  TelemetryConnectorFactory
} from '@twin.org/telemetry-models';
import { TelemetryService } from '@twin.org/telemetry-service';

TelemetryConnectorFactory.register('silent', () => new SilentTelemetryConnector());

const service = new TelemetryService({
  telemetryConnectorType: 'silent'
});

console.log(service.className()); // telemetryService

await service.createMetric({
  id: 'requests-per-minute',
  label: 'Requests Per Minute',
  description: 'Request throughput sampled once per minute',
  unit: 'rpm',
  type: MetricType.Gauge
});

await service.updateMetric({
  id: 'requests-per-minute',
  label: 'RPM',
  description: 'Request throughput',
  unit: 'rpm'
});

const valueId = await service.addMetricValue('requests-per-minute', 118.7, {
  region: 'eu-west-1'
});
console.log(valueId.length === 0); // true
```

```typescript
import {
  MetricType,
  SilentTelemetryConnector,
  TelemetryConnectorFactory
} from '@twin.org/telemetry-models';
import { TelemetryService } from '@twin.org/telemetry-service';

TelemetryConnectorFactory.register('silent', () => new SilentTelemetryConnector());

const service = new TelemetryService({ telemetryConnectorType: 'silent' });

const metric = await service.getMetric('requests-per-minute');
console.log(metric.metric.id); // requests-per-minute

const metricPage = await service.query(MetricType.Gauge, undefined, 100);
console.log(metricPage.entities.length); // 1

const valuePage = await service.queryValues(
  'requests-per-minute',
  Date.now() - 3_600_000,
  Date.now(),
  undefined,
  60
);
console.log(valuePage.entities.length); // 60

await service.removeMetric('requests-per-minute');
```

## generateRestRoutesTelemetry

```typescript
import { generateRestRoutesTelemetry } from '@twin.org/telemetry-service';

const routes = generateRestRoutesTelemetry('/api', 'telemetry');

console.log(routes.length); // 7
console.log(routes[0].operationId); // telemetryCreateMetric
```
