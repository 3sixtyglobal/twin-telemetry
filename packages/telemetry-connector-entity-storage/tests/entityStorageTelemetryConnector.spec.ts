// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetric } from "../src/entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "../src/entities/telemetryMetricValue.js";
import { EntityStorageTelemetryConnector } from "../src/entityStorageTelemetryConnector.js";
import { initSchema } from "../src/schema.js";

let telemetryMetricsEntityStorage: MemoryEntityStorageConnector<TelemetryMetric>;
let telemetryMetricsValueEntityStorage: MemoryEntityStorageConnector<TelemetryMetricValue>;

describe("EntityStorageTelemetryConnector", () => {
	beforeEach(() => {
		initSchema();
		telemetryMetricsEntityStorage = new MemoryEntityStorageConnector<TelemetryMetric>({
			entitySchema: nameof<TelemetryMetric>(),
			config: { storageKey: "telemetry-metric" }
		});
		telemetryMetricsValueEntityStorage = new MemoryEntityStorageConnector<TelemetryMetricValue>({
			entitySchema: nameof<TelemetryMetricValue>(),
			config: { storageKey: "telemetry-metric-value" }
		});
		EntityStorageConnectorFactory.register("telemetry-metric", () => telemetryMetricsEntityStorage);
		EntityStorageConnectorFactory.register(
			"telemetry-metric-value",
			() => telemetryMetricsValueEntityStorage
		);
	});

	afterEach(async () => {
		await telemetryMetricsEntityStorage.teardown();
		await telemetryMetricsValueEntityStorage.teardown();
	});

	test("can construct", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		expect(telemetry).toBeDefined();
	});

	test("can create a metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);
		expect(store?.[0].id).toEqual("test");
		expect(store?.[0].label).toEqual("Test");
		expect(store?.[0].description).toEqual("Test metric");
		expect(store?.[0].unit).toEqual("kgs");
		expect(store?.[0].type).toEqual(0);
	});

	test("can update a metric details", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		await telemetry.updateMetric({
			id: "test",
			label: "Test2",
			description: "Test metric2",
			unit: "kgs2"
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);
		expect(store?.[0].id).toEqual("test");
		expect(store?.[0].label).toEqual("Test2");
		expect(store?.[0].description).toEqual("Test metric2");
		expect(store?.[0].unit).toEqual("kgs2");
		expect(store?.[0].type).toEqual(0);
	});

	test("can create a counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);
		expect(store?.[0].id).toEqual("test");
		expect(store?.[0].label).toEqual("Test");
		expect(store?.[0].description).toEqual("Test metric");
		expect(store?.[0].unit).toEqual("kgs");
		expect(store?.[0].type).toEqual(0);
	});

	test("can create a inc dec counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.IncDecCounter
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);
		expect(store?.[0].id).toEqual("test");
		expect(store?.[0].label).toEqual("Test");
		expect(store?.[0].description).toEqual("Test metric");
		expect(store?.[0].unit).toEqual("kgs");
		expect(store?.[0].type).toEqual(1);
	});

	test("can create a gauge metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Gauge
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);
		expect(store?.[0].id).toEqual("test");
		expect(store?.[0].label).toEqual("Test");
		expect(store?.[0].description).toEqual("Test metric");
		expect(store?.[0].unit).toEqual("kgs");
		expect(store?.[0].type).toEqual(2);
	});

	test("can increment a counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();

		console.log(valueStore);
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore?.[0].value).toEqual(1);

		await telemetry.addMetricValue("test", 5);

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.length).toEqual(2);
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore2?.[1].value).toEqual(6);
	});

	test("can fail to decrement a counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.counterIncOnly"
		});
	});

	test("can increment an inc/dec counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.IncDecCounter
		});

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment, undefined);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore?.[0].value).toEqual(1);

		await telemetry.addMetricValue("test", 5);

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore2?.[1].value).toEqual(6);
	});

	test("can decrement an inc/dec counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.IncDecCounter
		});

		await telemetry.addMetricValue("test", MetricCounterOperation.Decrement);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore?.[0].value).toEqual(-1);

		await telemetry.addMetricValue("test", -5);

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore2?.[1].value).toEqual(-6);
	});

	test("can fail to set a value to a non integer inc/dec counter metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.IncDecCounter
		});

		await expect(telemetry.addMetricValue("test", 5.5)).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.upDownCounterIncOrDecOnly"
		});
	});

	test("can set a gauge metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Gauge
		});

		await telemetry.addMetricValue("test", 11);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore?.[0].value).toEqual(11);

		await telemetry.addMetricValue("test", 12);

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeLessThanOrEqual(Date.now());
		expect(valueStore2?.[1].value).toEqual(12);
	});

	test("can fail to inc a gauge metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Gauge
		});

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Increment)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
		});
	});

	test("can fail to dec a gauge metric", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Gauge
		});

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
		});
	});

	test("can remove a metric and its values", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		for (let i = 0; i < 10; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(10);

		await telemetry.removeMetric("test");
		const storeAfter = await telemetryMetricsEntityStorage.getStore();
		const valueStoreAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.length).toEqual(0);
		expect(valueStoreAfter?.length).toEqual(0);
	});

	test("can get a metric value by id", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const value = await telemetry.getMetricValue("test", valueId);
		expect(value.id).toBe(valueId);
		expect(value.value).toBe(1);
	});

	test("can fail to get a metric value with wrong metric id", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const valueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		await expect(telemetry.getMetricValue("wrong-id", valueId)).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricValueNotFound"
		});
	});

	test("can fail to get a metric value that does not exist", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await expect(telemetry.getMetricValue("test", "nonexistent")).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricValueNotFound"
		});
	});

	test("can query metrics", async () => {
		const telemetry = new EntityStorageTelemetryConnector();

		for (let i = 0; i < 11; i++) {
			await telemetry.createMetric({
				id: `test${i}`,
				label: "Test",
				description: "Test metric",
				unit: "kgs",
				type: MetricType.Counter
			});
		}

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(11);

		const query1 = await telemetry.query(undefined, undefined, 10);

		expect(query1.entities.length).toEqual(10);
	});

	test("can query metrics for specific type", async () => {
		const telemetry = new EntityStorageTelemetryConnector();

		for (let i = 0; i < 5; i++) {
			await telemetry.createMetric({
				id: `test-${i}`,
				label: "Test",
				description: "Test metric",
				unit: "kgs",
				type: MetricType.Counter
			});
		}

		for (let i = 0; i < 3; i++) {
			await telemetry.createMetric({
				id: `test2-${i}`,
				label: "Test",
				description: "Test metric",
				unit: "kgs",
				type: MetricType.IncDecCounter
			});
		}

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(8);

		console.log(JSON.stringify(store, null, 2));

		const query1 = await telemetry.query(MetricType.IncDecCounter, undefined, 10);

		expect(query1.entities.length).toEqual(3);
	});

	test("can create a metric with maxHistory", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 3
		});

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.[0].maxHistory).toEqual(3);
	});

	test("can fail to create a metric with non-positive maxHistory", async () => {
		const telemetry = new EntityStorageTelemetryConnector();

		await expect(
			telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter, maxHistory: 0 })
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.maxHistoryMustBePositiveInteger"
		});

		await expect(
			telemetry.createMetric({
				id: "test",
				label: "Test",
				type: MetricType.Counter,
				maxHistory: 1.5
			})
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.maxHistoryMustBePositiveInteger"
		});
	});

	test("can update a metric maxHistory", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.updateMetric({ id: "test", label: "Test", maxHistory: 5 });

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.[0].maxHistory).toEqual(5);
	});

	test("prunes oldest values when maxHistory is exceeded", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 3
		});

		for (let i = 0; i < 5; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			// Small delay so each value gets a unique Date.now() timestamp; without this,
			// same-millisecond entries sort by insertion order under ts DESC, causing the
			// accumulation query to read the oldest entry instead of the newest.
			await new Promise<void>(resolve => setTimeout(resolve, 2));
		}

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(3);

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities[0].value).toEqual(5);
		expect(result.entities[1].value).toEqual(4);
		expect(result.entities[2].value).toEqual(3);
	});

	test("does not prune when maxHistory is not set", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		for (let i = 0; i < 5; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(5);
	});

	test("trim makes a single value-storage query in steady state", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 3
		});

		for (let i = 0; i < 3; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await new Promise<void>(resolve => setTimeout(resolve, 2));
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		// Exactly two value-storage queries per write: one last-value lookup and one trim sweep.
		expect(querySpy).toHaveBeenCalledTimes(2);
		querySpy.mockRestore();
	});

	test("trim query uses a fixed chunk size rather than maxHistory + 1", async () => {
		const maxHistory = 3;
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory
		});

		for (let i = 0; i < maxHistory; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await new Promise<void>(resolve => setTimeout(resolve, 2));
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		// The second query is the trim sweep; verify it uses a fixed chunk size (1000),
		// not maxHistory + 1 which would be unbounded for large histories.
		const trimLimit = querySpy.mock.calls[1][4] as number;
		expect(trimLimit).toEqual(1000);
		expect(trimLimit).not.toEqual(maxHistory + 1);
		querySpy.mockRestore();
	});

	test("prunes all excess entries when maxHistory is reduced after accumulation", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 5
		});

		for (let i = 0; i < 5; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await new Promise<void>(resolve => setTimeout(resolve, 2));
		}

		await telemetry.updateMetric({ id: "test", label: "Test", maxHistory: 3 });
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(3);

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities[0].value).toEqual(6);
		expect(result.entities[1].value).toEqual(5);
		expect(result.entities[2].value).toEqual(4);
	});

	test("can query a metric and its values", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			description: "Test metric",
			unit: "kgs",
			type: MetricType.Counter
		});

		for (let i = 0; i < 50; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.length).toEqual(1);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(50);

		const query1 = await telemetry.queryValues("test", undefined, undefined, undefined, 20);

		expect(query1.metric.id).toEqual("test");
		expect(query1.metric.label).toEqual("Test");
		expect(query1.metric.description).toEqual("Test metric");
		expect(query1.metric.unit).toEqual("kgs");
		expect(query1.metric.type).toEqual(MetricType.Counter);

		expect(query1.entities.length).toEqual(20);

		const query2 = await telemetry.queryValues("test", undefined, undefined, query1.cursor, 20);
		expect(query2.entities.length).toEqual(20);

		const query3 = await telemetry.queryValues("test", undefined, undefined, query2.cursor, 20);
		expect(query3.entities.length).toEqual(10);
	});
});
