// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import { TEST_OTLP_ENDPOINT_METRICS } from "./setupTestEnv.js";
import { OpenTelemetryReaderTypes } from "../src/models/openTelemetryReaderTypes.js";
import { OpenTelemetryTelemetryConnector } from "../src/openTelemetryTelemetryConnector.js";

/**
 * Create and start a connector configured with real OTLP HTTP and Prometheus exporters.
 * @returns A started connector instance.
 */
async function makeConnector(): Promise<OpenTelemetryTelemetryConnector> {
	const connector = new OpenTelemetryTelemetryConnector({
		config: {
			readers: {
				metrics: {
					type: OpenTelemetryReaderTypes.OtlpHttp,
					url: TEST_OTLP_ENDPOINT_METRICS
				},
				prometheus: {
					type: OpenTelemetryReaderTypes.Prometheus
				}
			}
		}
	});
	await connector.start();
	return connector;
}

describe("OpenTelemetryTelemetryConnector", () => {
	test("can construct", async () => {
		const connector = new OpenTelemetryTelemetryConnector();
		expect(connector).toBeDefined();
		expect(connector.className()).toEqual("OpenTelemetryTelemetryConnector");
	});

	test("can start and stop", async () => {
		const connector = new OpenTelemetryTelemetryConnector({ config: { readers: {} } });
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("start is idempotent", async () => {
		const connector = await makeConnector();
		await expect(connector.start()).resolves.toBeUndefined();
		await connector.stop();
	});

	test("creates provider with tenant and node resource attributes from context", async () => {
		const spy = vi
			.spyOn(ContextIdStore, "getContextIds")
			.mockResolvedValue({ [ContextIdKeys.Tenant]: "tenant-abc", [ContextIdKeys.Node]: "node-1" });

		const connector = await makeConnector();
		await connector.createMetric({ id: "test", label: "Test", type: MetricType.Counter });
		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Increment)
		).resolves.toHaveLength(32);

		spy.mockRestore();
		await connector.stop();
	});

	test("creates separate providers for different tenant/node contexts", async () => {
		const connector = await makeConnector();
		await connector.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		const spy = vi.spyOn(ContextIdStore, "getContextIds");

		spy.mockResolvedValue({ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Node]: "node-1" });
		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Increment)
		).resolves.toBeDefined();

		spy.mockResolvedValue({ [ContextIdKeys.Tenant]: "tenant-b", [ContextIdKeys.Node]: "node-1" });
		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Increment)
		).resolves.toBeDefined();

		spy.mockRestore();
		await connector.stop();
	});

	test("reuses cached provider for repeated calls with the same context", async () => {
		const spy = vi
			.spyOn(ContextIdStore, "getContextIds")
			.mockResolvedValue({ [ContextIdKeys.Tenant]: "tenant-x", [ContextIdKeys.Node]: "node-2" });

		const connector = await makeConnector();
		await connector.createMetric({ id: "hits", label: "Hits", type: MetricType.Counter });

		for (let i = 0; i < 5; i++) {
			await expect(
				connector.addMetricValue("hits", MetricCounterOperation.Increment)
			).resolves.toBeDefined();
		}

		spy.mockRestore();
		await connector.stop();
	});

	test("works without a tenant or node context", async () => {
		const spy = vi.spyOn(ContextIdStore, "getContextIds").mockResolvedValue(undefined);

		const connector = await makeConnector();
		await connector.createMetric({ id: "test", label: "Test", type: MetricType.Counter });
		await expect(connector.addMetricValue("test", 3)).resolves.toBeDefined();

		spy.mockRestore();
		await connector.stop();
	});

	test("can fail to decrement a counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "openTelemetryTelemetryConnector.counterIncOnly"
		});
		await connector.stop();
	});

	test("can fail to add a non-positive value to a counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await expect(connector.addMetricValue("test", -3)).rejects.toMatchObject({
			name: "GeneralError",
			message: "openTelemetryTelemetryConnector.counterIncOnly"
		});
		await connector.stop();
	});

	test("can fail to inc a gauge metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Gauge
		});

		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Increment)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "openTelemetryTelemetryConnector.gaugeNoIncDec"
		});
		await connector.stop();
	});

	test("can fail to dec a gauge metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Gauge
		});

		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "openTelemetryTelemetryConnector.gaugeNoIncDec"
		});
		await connector.stop();
	});

	test("can remove a metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		for (let i = 0; i < 5; i++) {
			await connector.addMetricValue("test", MetricCounterOperation.Increment);
		}

		await connector.removeMetric("test");

		await expect(
			connector.addMetricValue("test", MetricCounterOperation.Increment)
		).rejects.toMatchObject({ name: "NotFoundError" });
		await connector.stop();
	});

	test("can fail to remove a non-existent metric", async () => {
		const connector = await makeConnector();

		await expect(connector.removeMetric("missing")).rejects.toMatchObject({
			name: "NotFoundError",
			message: "openTelemetryTelemetryConnector.metricNotFound"
		});
		await connector.stop();
	});

	test("can get metric value id length", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await connector.addMetricValue("test", MetricCounterOperation.Increment);
		expect(valueId.length).toEqual(32);
		await connector.stop();
	});

	test("can pass custom data as OTEL attributes", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await connector.addMetricValue("test", MetricCounterOperation.Increment, {
			route: "/api/health",
			statusCode: 200,
			success: true
		});

		expect(valueId).toBeDefined();
		expect(valueId.length).toEqual(32);
		await connector.stop();
	});

	test("passes array values as OTEL attributes", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await connector.addMetricValue("test", MetricCounterOperation.Increment, {
			tags: ["a", "b", "c"],
			codes: [200, 404],
			flags: [true, false]
		});

		expect(valueId).toBeDefined();
		await connector.stop();
	});
});
