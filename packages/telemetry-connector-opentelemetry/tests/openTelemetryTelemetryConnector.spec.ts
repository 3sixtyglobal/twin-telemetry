// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import {
	type TelemetryMetric,
	type TelemetryMetricValue,
	initSchema
} from "@twin.org/telemetry-connector-entity-storage";
import { MetricType } from "@twin.org/telemetry-models";
import { OpenTelemetryTelemetryConnector } from "../src/openTelemetryTelemetryConnector.js";

/**
 * Create and start a connector configured with no exporter (suitable for unit tests).
 * @returns A started connector instance.
 */
async function makeConnector(): Promise<OpenTelemetryTelemetryConnector> {
	const connector = new OpenTelemetryTelemetryConnector({ readers: {} });
	await connector.start();
	return connector;
}

describe("OpenTelemetryTelemetryConnector", () => {
	beforeEach(() => {
		initSchema();
		const metricStorage = new MemoryEntityStorageConnector<TelemetryMetric>({
			entitySchema: nameof<TelemetryMetric>()
		});
		const metricValueStorage = new MemoryEntityStorageConnector<TelemetryMetricValue>({
			entitySchema: nameof<TelemetryMetricValue>()
		});
		EntityStorageConnectorFactory.register("telemetry-metric", () => metricStorage);
		EntityStorageConnectorFactory.register("telemetry-metric-value", () => metricValueStorage);
	});

	test("can construct", async () => {
		const connector = new OpenTelemetryTelemetryConnector();
		expect(connector).toBeDefined();
		expect(connector.className()).toEqual("OpenTelemetryTelemetryConnector");
	});

	test("can start and stop", async () => {
		const connector = new OpenTelemetryTelemetryConnector({ readers: {} });
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("start is idempotent", async () => {
		const connector = await makeConnector();
		await expect(connector.start()).resolves.toBeUndefined();
		await connector.stop();
	});

	test("can create and query metrics before start", async () => {
		// _inner is constructed eagerly so entity-storage operations work without calling start().
		// OTEL instruments are simply not registered until start() is called.
		const connector = new OpenTelemetryTelemetryConnector({ readers: {} });
		await connector.createMetric({ id: "test", label: "Test", type: MetricType.Counter });
		const result = await connector.query();
		expect(result.entities.length).toEqual(1);
		expect(result.entities[0].id).toEqual("test");
	});

	test("can create a counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		const result = await connector.query();
		expect(result.entities.length).toEqual(1);
		expect(result.entities[0].id).toEqual("test");
		expect(result.entities[0].label).toEqual("Test");
		expect(result.entities[0].type).toEqual(MetricType.Counter);
		await connector.stop();
	});

	test("can create an inc/dec counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.IncDecCounter
		});

		const result = await connector.query();
		expect(result.entities.length).toEqual(1);
		expect(result.entities[0].type).toEqual(MetricType.IncDecCounter);
		await connector.stop();
	});

	test("can create a gauge metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "celsius",
			type: MetricType.Gauge
		});

		const result = await connector.query();
		expect(result.entities.length).toEqual(1);
		expect(result.entities[0].type).toEqual(MetricType.Gauge);
		await connector.stop();
	});

	test("can fail to create a duplicate metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await expect(
			connector.createMetric({ id: "test", label: "Test", type: MetricType.Counter })
		).rejects.toMatchObject({
			name: "AlreadyExistsError",
			message: "entityStorageTelemetryConnector.metricAlreadyExists"
		});
		await connector.stop();
	});

	test("can update metric details", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		await connector.updateMetric({
			id: "test",
			label: "Test Updated",
			description: "Updated description",
			unit: "lbs"
		});

		const { metric } = await connector.getMetric("test");
		expect(metric.label).toEqual("Test Updated");
		expect(metric.description).toEqual("Updated description");
		expect(metric.unit).toEqual("lbs");
		expect(metric.type).toEqual(MetricType.Counter);
		await connector.stop();
	});

	test("can increment a counter metric with inc shorthand", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "api-requests",
			label: "API Requests",
			unit: "requests",
			type: MetricType.Counter
		});

		await connector.addMetricValue("api-requests", "inc");

		const { value } = await connector.getMetric("api-requests");
		expect(value.value).toEqual(1);
		await connector.stop();
	});

	test("can add a positive integer to a counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await connector.addMetricValue("test", 5);

		const { value } = await connector.getMetric("test");
		expect(value.value).toEqual(5);
		await connector.stop();
	});

	test("can fail to decrement a counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await expect(connector.addMetricValue("test", "dec")).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.counterIncOnly"
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
			message: "entityStorageTelemetryConnector.counterIncOnly"
		});
		await connector.stop();
	});

	test("can increment an inc/dec counter metric with inc shorthand", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.IncDecCounter
		});

		await connector.addMetricValue("test", "inc");

		const { value } = await connector.getMetric("test");
		expect(value.value).toEqual(1);
		await connector.stop();
	});

	test("can add a positive integer to an inc/dec counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.IncDecCounter
		});

		await connector.addMetricValue("test", 5);

		const { value } = await connector.getMetric("test");
		expect(value.value).toEqual(5);
		await connector.stop();
	});

	test("can decrement an inc/dec counter metric with dec shorthand", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.IncDecCounter
		});

		await connector.addMetricValue("test", "dec");

		const { value } = await connector.getMetric("test");
		expect(value.value).toEqual(-1);
		await connector.stop();
	});

	test("can add a negative integer to an inc/dec counter metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.IncDecCounter
		});

		await connector.addMetricValue("test", -5);

		const { value } = await connector.getMetric("test");
		expect(value.value).toEqual(-5);
		await connector.stop();
	});

	test("can set a gauge metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "temperature",
			label: "Temperature",
			unit: "celsius",
			type: MetricType.Gauge
		});

		await connector.addMetricValue("temperature", 65.2);

		const { value } = await connector.getMetric("temperature");
		expect(value.value).toEqual(65.2);
		await connector.stop();
	});

	test("can fail to inc a gauge metric", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Gauge
		});

		await expect(connector.addMetricValue("test", "inc")).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
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

		await expect(connector.addMetricValue("test", "dec")).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
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
			await connector.addMetricValue("test", "inc");
		}

		let result = await connector.query();
		expect(result.entities.length).toEqual(1);

		await connector.removeMetric("test");

		result = await connector.query();
		expect(result.entities.length).toEqual(0);
		await connector.stop();
	});

	test("can fail to remove a non-existent metric", async () => {
		const connector = await makeConnector();

		await expect(connector.removeMetric("missing")).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricNotFound"
		});
		await connector.stop();
	});

	test("can query metrics", async () => {
		const connector = await makeConnector();

		for (let i = 0; i < 11; i++) {
			await connector.createMetric({
				id: `metric-${i}`,
				label: `Metric ${i}`,
				type: MetricType.Counter
			});
		}

		const result = await connector.query(undefined, undefined, 10);
		expect(result.entities.length).toEqual(10);
		expect(result.cursor).toBeDefined();
		await connector.stop();
	});

	test("can query metrics for a specific type", async () => {
		const connector = await makeConnector();

		for (let i = 0; i < 5; i++) {
			await connector.createMetric({
				id: `counter-${i}`,
				label: `Counter ${i}`,
				type: MetricType.Counter
			});
		}
		for (let i = 0; i < 3; i++) {
			await connector.createMetric({
				id: `gauge-${i}`,
				label: `Gauge ${i}`,
				type: MetricType.Gauge
			});
		}

		const counters = await connector.query(MetricType.Counter);
		expect(counters.entities.length).toEqual(5);

		const gauges = await connector.query(MetricType.Gauge);
		expect(gauges.entities.length).toEqual(3);
		await connector.stop();
	});

	test("can query values for a metric with pagination", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		for (let i = 0; i < 50; i++) {
			await connector.addMetricValue("test", "inc");
		}

		const page1 = await connector.queryValues("test", undefined, undefined, undefined, 20);
		expect(page1.metric.id).toEqual("test");
		expect(page1.entities.length).toEqual(20);
		expect(page1.cursor).toBeDefined();

		const page2 = await connector.queryValues("test", undefined, undefined, page1.cursor, 20);
		expect(page2.entities.length).toEqual(20);

		const page3 = await connector.queryValues("test", undefined, undefined, page2.cursor, 20);
		expect(page3.entities.length).toEqual(10);
		expect(page3.cursor).toBeUndefined();
		await connector.stop();
	});

	test("can pass custom data as OTEL attributes", async () => {
		const connector = await makeConnector();
		await connector.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await connector.addMetricValue("test", "inc", {
			route: "/api/health",
			statusCode: 200,
			success: true
		});

		expect(valueId).toBeDefined();
		expect(valueId.length).toEqual(32);

		const page = await connector.queryValues("test");
		expect(page.entities[0].customData).toEqual({
			route: "/api/health",
			statusCode: 200,
			success: true
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

		const valueId = await connector.addMetricValue("test", "inc");
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

		await connector.addMetricValue("test", "inc", {
			tags: ["a", "b", "c"],
			codes: [200, 404],
			flags: [true, false]
		});

		const { entities } = await connector.queryValues("test");
		expect(entities[0].customData).toEqual({
			tags: ["a", "b", "c"],
			codes: [200, 404],
			flags: [true, false]
		});
		await connector.stop();
	});
});
