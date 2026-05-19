# Telemetry Producers Examples

These examples show how to register runtime and host metrics with a telemetry component and emit values during a polling cycle. Each snippet uses a small in-memory component so you can see how metric registration and collection fit together.

## ProcessMetricsProducer

```typescript
import { ProcessMetricsProducer } from '@twin.org/telemetry-producers';

const producer = new ProcessMetricsProducer({
  telemetryComponentType: 'telemetry',
  maxHistory: 120
});

console.log(producer.className()); // ProcessMetricsProducer

await producer.register();

const registeredMetrics = await telemetryComponent.query(MetricType.Gauge);
console.log(registeredMetrics.entities.map(metric => metric.id)); // ["process_memory_rss_bytes", "process_memory_heap_used_bytes", "process_memory_heap_total_bytes", "process_uptime_seconds"]

await producer.collect();

const uptimeValues = await telemetryComponent.queryValues('process_uptime_seconds');
console.log(uptimeValues.entities.length); // 1
```

## SystemMetricsProducer

```typescript
import { SystemMetricsProducer } from '@twin.org/telemetry-producers';

const producer = new SystemMetricsProducer({
  telemetryComponentType: 'telemetry',
  maxHistory: 288
});

console.log(producer.className()); // SystemMetricsProducer

await producer.register();

const registeredMetrics = await telemetryComponent.query(MetricType.Gauge);
console.log(registeredMetrics.entities.map(metric => metric.id)); // ["system_cpu_usage_percent", "system_memory_total_bytes", "system_memory_used_bytes", "system_memory_free_bytes", "system_memory_usage_percent", "system_uptime_seconds"]

await producer.collect();

const cpuValues = await telemetryComponent.queryValues('system_cpu_usage_percent');
console.log(cpuValues.entities.length); // 1
```
