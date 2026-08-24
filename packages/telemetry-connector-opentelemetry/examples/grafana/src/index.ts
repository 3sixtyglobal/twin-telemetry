// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import {
	type TelemetryMetric,
	type TelemetryMetricValue,
	initSchema
} from "@twin.org/telemetry-connector-entity-storage";
import { OpenTelemetryTelemetryConnector } from "@twin.org/telemetry-connector-opentelemetry";
import { MetricType } from "@twin.org/telemetry-models";

const PROMETHEUS_PORT = 9464;
const EMIT_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// 1. Register in-memory entity storage so the connector can persist metric
//    definitions and value history. Any other storage adapter could be used
//    here (file, MongoDB, etc.) without changing the connector code.
// ---------------------------------------------------------------------------
initSchema();
EntityStorageConnectorFactory.register(
	"telemetry-metric",
	() =>
		new MemoryEntityStorageConnector<TelemetryMetric>({
			entitySchema: "TelemetryMetric",
			config: { storageKey: "telemetry-metric" }
		})
);
EntityStorageConnectorFactory.register(
	"telemetry-metric-value",
	() =>
		new MemoryEntityStorageConnector<TelemetryMetricValue>({
			entitySchema: "TelemetryMetricValue",
			config: { storageKey: "telemetry-metric-value" }
		})
);

// ---------------------------------------------------------------------------
// 2. Create the connector, wiring a Prometheus scrape exporter as a reader.
//    start() initialises the MeterProvider and the exporter's HTTP endpoint.
// ---------------------------------------------------------------------------
const connector = new OpenTelemetryTelemetryConnector({
	config: {
		meterName: "twin-telemetry-demo",
		meterVersion: "0.0.1",
		readers: {
			prometheus: { type: "prometheus", port: PROMETHEUS_PORT }
		}
	}
});

await connector.start();

// ---------------------------------------------------------------------------
// 3. Register the three metrics that the pre-built Grafana dashboard expects.
//
//    Prometheus naming (applied automatically by the OTEL exporter):
//      api_requests        → api_requests_total   (Counter → _total suffix)
//      active_connections  → active_connections    (UpDownCounter → gauge)
//      cpu_temperature     → cpu_temperature       (Gauge → gauge)
//
//    Units are intentionally omitted: the OTEL Prometheus exporter appends the
//    unit to the metric name (e.g. "api_requests_requests_total"), which would
//    break the dashboard PromQL queries.
// ---------------------------------------------------------------------------
await connector.createMetric({
	id: "api_requests",
	label: "API Requests",
	description: "Total number of API requests received",
	type: MetricType.Counter
});

await connector.createMetric({
	id: "active_connections",
	label: "Active Connections",
	description: "Number of currently active client connections",
	type: MetricType.IncDecCounter
});

await connector.createMetric({
	id: "cpu_temperature",
	label: "CPU Temperature",
	description: "Current CPU temperature reading",
	type: MetricType.Gauge
});

process.stdout.write(
	`\nTWIN Telemetry → Prometheus exporter listening on http://localhost:${PROMETHEUS_PORT}/metrics\n` +
		"Open Grafana at http://localhost:3000  (admin / admin)\n" +
		"The 'TWIN Telemetry' dashboard is pre-provisioned - data appears within ~10 s.\n\n"
);

// ---------------------------------------------------------------------------
// 4. Simulate realistic traffic in a continuous loop.
// ---------------------------------------------------------------------------
let tick = 0;

/**
 * Emit one round of metric updates across all three registered metrics.
 * @returns A promise that resolves once all updates have been recorded.
 */
async function emit(): Promise<void> {
	tick++;

	// Counter: burst of requests every tick, tagged by route and status code.
	const routes = ["/api/metrics", "/api/health", "/api/telemetry"];
	const route = routes[tick % routes.length];
	const burst = Math.floor(Math.random() * 15) + 1;
	await connector.addMetricValue("api_requests", burst, {
		route,
		statusCode: tick % 10 === 0 ? 500 : 200
	});

	// IncDecCounter: connections fluctuate - random connect/disconnect each tick.
	// Clamp so the total never goes below 0.
	const { value: currentConnectionsValue } = await connector.getMetric("active_connections");
	const rawDelta = Math.floor(Math.random() * 5) - 2; // -2 … +2
	const delta = Math.max(rawDelta, -currentConnectionsValue.value);
	if (delta !== 0) {
		await connector.addMetricValue("active_connections", delta);
	}

	// Gauge: CPU temperature drifts slowly around a base value.
	const base = 62;
	const sinComponent = Math.sin(tick / 10) * 8;
	const noiseComponentBase = Math.random() * 4;
	const noiseComponent = noiseComponentBase - 2;
	const drift = sinComponent + noiseComponent;
	await connector.addMetricValue("cpu_temperature", Number((base + drift).toFixed(1)));

	const { value: reqValue } = await connector.getMetric("api_requests");
	const { value: connectionsValue } = await connector.getMetric("active_connections");
	const { value: tempValue } = await connector.getMetric("cpu_temperature");

	process.stdout.write(
		`[tick ${String(tick).padStart(4, "0")}]  ` +
			`api_requests_total=${reqValue.value}  ` +
			`active_connections=${connectionsValue.value}  ` +
			`cpu_temperature=${tempValue.value}°C\n`
	);
}

setInterval(async () => {
	await emit();
}, EMIT_INTERVAL_MS);

// Emit immediately so there is data on the first Prometheus scrape.
await emit();

// Graceful shutdown on Ctrl-C.
process.on("SIGINT", async () => {
	process.stdout.write("\nShutting down…\n");
	await connector.stop();
	process.exit(0);
});
