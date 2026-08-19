# TWIN Telemetry Connector OpenTelemetry

OpenTelemetry connector for pushing telemetry metrics to OTEL-compatible backends such as Prometheus and Grafana.

## Installation

```shell
npm install @twin.org/telemetry-connector-opentelemetry
```

## Local Development

A local observability backend is required to receive and inspect exported spans. Start the Grafana LGTM stack in Docker:

```shell
docker run -d --name twin-opentelemetry -p 4317:4317 -p 4318:4318 -p 3123:3000 -p 3200:3200 grafana/otel-lgtm
```

Grafana is available at <http://localhost:3123> (credentials: admin/admin). Spans appear in the Tempo data source. Port 3200 exposes the Tempo HTTP query API used by the integration tests.

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)
