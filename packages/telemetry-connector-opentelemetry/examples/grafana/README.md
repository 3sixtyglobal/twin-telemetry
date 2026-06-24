# TWIN Telemetry — Grafana Integration Demo

End-to-end proof that `OpenTelemetryTelemetryConnector` emits real metrics that Grafana
can visualise. The demo uses the following stack:

```text
Node.js script (OpenTelemetryTelemetryConnector)
    │  Prometheus scrape endpoint  :9464/metrics
    ▼
Prometheus  :9090   ──scrapes every 5 s──▶  stores time-series
    ▼
Grafana  :3000   ──queries──▶  pre-built "TWIN Telemetry" dashboard
```

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Docker](https://docs.docker.com/get-docker/) with Compose V2

> **Note:** this demo pulls `@opentelemetry/sdk-metrics@2.x` (required transitively by
> `@opentelemetry/exporter-prometheus@0.216.0`), while the connector's own unit tests run
> against `1.30.1`. The connector talks only to `@opentelemetry/api@1.9.x`, which both SDK
> majors implement, so they are compatible — but the `2.x` path is not covered by automated
> tests at the moment.

## Quick Start

### 1 — Install dependencies

```shell
cd examples/grafana
npm install
```

### 2 — Start the metric emitter

```shell
npm start
```

You should see output like:

```text
TWIN Telemetry → Prometheus exporter listening on http://localhost:9464/metrics
Open Grafana at http://localhost:3000  (admin / admin)

[tick 0001]  api_requests_total=7  active_connections=1  cpu_temperature=62.3°C
[tick 0002]  api_requests_total=14  active_connections=3  cpu_temperature=63.1°C
…
```

### 3 — Start Prometheus and Grafana

Open a second terminal in the same folder:

```shell
docker compose up
```

### 4 — Open Grafana

Navigate to [http://localhost:3000](http://localhost:3000) and log in with **admin / admin**.

The **TWIN Telemetry** dashboard is pre-provisioned and opens automatically.
Data appears within 10 seconds (one Prometheus scrape cycle).

## Dashboard Panels

| Panel                   | Metric               | Type          | PromQL                         |
| ----------------------- | -------------------- | ------------- | ------------------------------ |
| API Request Rate        | `api_requests`       | Counter       | `rate(api_requests_total[1m])` |
| Active Connections      | `active_connections` | UpDownCounter | `active_connections`           |
| CPU Temperature (gauge) | `cpu_temperature`    | Gauge         | `cpu_temperature`              |
| API Requests Total      | `api_requests`       | Counter       | `api_requests_total`           |
| Current Connections     | `active_connections` | UpDownCounter | `active_connections`           |
| Current CPU Temperature | `cpu_temperature`    | Gauge         | `cpu_temperature`              |

## How It Works

```text
src/index.ts
 └─ OpenTelemetryTelemetryConnector({ readers: { prometheus: { type: "prometheus", port: 9464 } } })
      │  start() ──► MeterProvider  ←  @opentelemetry/sdk-metrics
      │               └─ PrometheusExporter (port 9464)  ← @opentelemetry/exporter-prometheus
      ├─ createMetric("api_requests",      MetricType.Counter)      → OTEL Counter
      ├─ createMetric("active_connections", MetricType.IncDecCounter) → OTEL UpDownCounter
      └─ createMetric("cpu_temperature",   MetricType.Gauge)        → OTEL Gauge
```

Every 2 seconds the script calls `addMetricValue` on each metric.
The OTEL SDK accumulates values and the `PrometheusExporter` serves them on
`/metrics` in the Prometheus text exposition format.
Prometheus scrapes that endpoint every 5 seconds and stores the time-series.
Grafana queries Prometheus and renders the dashboard with a 5-second auto-refresh.

## Prometheus Metric Names

The OTEL Prometheus exporter applies standard naming conventions automatically:

| TWIN metric id       | OTEL type     | Prometheus name      |
| -------------------- | ------------- | -------------------- |
| `api_requests`       | Counter       | `api_requests_total` |
| `active_connections` | UpDownCounter | `active_connections` |
| `cpu_temperature`    | Gauge         | `cpu_temperature`    |

## Stopping

Press `Ctrl-C` in the emitter terminal to shut down the Node.js process gracefully,
then run `docker compose down` in the Docker terminal.

## Restarting from Scratch

If you restart the stack after a previous run, Grafana's persisted volume may hold
a stale datasource with the wrong UID. Always stop with the `-v` flag to remove the
volume so Grafana re-reads the provisioning files on the next startup:

```shell
docker compose down -v
docker compose up
```

## Troubleshooting

### All panels show "No data"

1. Check that the emitter is running (`npm start`) and the scrape endpoint is reachable:

   ```shell
   curl http://localhost:9464/metrics
   ```

2. Open `http://localhost:9090/targets` — the `twin-telemetry` target should show
   **State: UP**. If it shows **DOWN** or **connection refused**, Prometheus cannot
   reach the emitter. On Linux you may need to verify that `host.docker.internal`
   resolves (the `extra_hosts` entry in `docker-compose.yml` handles this, but
   confirm with `docker compose logs prometheus`).

### Metric names look wrong in Prometheus

The OTEL Prometheus exporter appends the `unit` field to the metric name following
the OpenMetrics convention:

| Metric id         | Unit set     | Prometheus name                  |
| ----------------- | ------------ | -------------------------------- |
| `api_requests`    | `"requests"` | `api_requests_requests_total` ❌ |
| `api_requests`    | _(none)_     | `api_requests_total` ✅          |
| `cpu_temperature` | `"celsius"`  | `cpu_temperature_celsius` ❌     |
| `cpu_temperature` | _(none)_     | `cpu_temperature` ✅             |

The emitter in this demo intentionally omits units so the names stay clean and
match the pre-built dashboard queries. If you add units in your own code, update
your PromQL expressions accordingly.
