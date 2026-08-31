// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { Mutex } from "@twin.org/core";
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

	test("passes configured mutex timeout to lock acquisition", async () => {
		const lockSpy = vi.spyOn(Mutex, "lock");

		const telemetry = new EntityStorageTelemetryConnector({
			config: {
				mutexTimeoutMs: 1234
			}
		});

		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		expect(lockSpy).toHaveBeenCalledWith(`${EntityStorageTelemetryConnector.CLASS_NAME}:{}::test`, {
			throwOnTimeout: true,
			timeoutMs: 1234
		});

		lockSpy.mockRestore();
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
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();

		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeGreaterThan(0);
		expect(valueStore?.[0].value).toEqual(1);

		await telemetry.addMetricValue("test", 5);
		await telemetry.flush();

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.length).toEqual(2);
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeGreaterThan(0);
		expect(valueStore2?.[1].value).toEqual(6);
	});

	test("keeps counter increments accurate during same-tick bursts", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		for (let i = 0; i < 20; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 25);
		expect(result.entities.length).toEqual(20);
		expect(result.entities.map(entity => entity.value)).toEqual([
			20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
		]);
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
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeGreaterThan(0);
		expect(valueStore?.[0].value).toEqual(1);

		await telemetry.addMetricValue("test", 5);
		await telemetry.flush();

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeGreaterThan(0);
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
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeGreaterThan(0);
		expect(valueStore?.[0].value).toEqual(-1);

		await telemetry.addMetricValue("test", -5);
		await telemetry.flush();

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeGreaterThan(0);
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
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);
		expect(valueStore?.[0].id.length).toEqual(32);
		expect(valueStore?.[0].metricId).toEqual("test");
		expect(valueStore?.[0].ts).toBeGreaterThan(0);
		expect(valueStore?.[0].value).toEqual(11);

		await telemetry.addMetricValue("test", 12);
		await telemetry.flush();

		const valueStore2 = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore2?.[1].id.length).toEqual(32);
		expect(valueStore2?.[1].metricId).toEqual("test");
		expect(valueStore2?.[1].ts).toBeGreaterThan(0);
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

		const firstValueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const value = await telemetry.getMetricValue("test", firstValueId);
		expect(value.id).toBe(firstValueId);
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

	test("can fail to get a metric value id when the metric has values", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

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
		}
		await telemetry.flush();

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
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(5);
	});

	test("trim makes a single value-storage query in steady state", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 0, batchIntervalMs: 0 }
		});
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
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 0, batchIntervalMs: 0 }
		});
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
		}

		await telemetry.updateMetric({ id: "test", label: "Test", maxHistory: 3 });
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.flush();

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

	test("sorts counter values by value when timestamps match", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const ts = Date.now();
		await telemetryMetricsValueEntityStorage.set({ id: "a", metricId: "test", ts, value: 2 });
		await telemetryMetricsValueEntityStorage.set({ id: "b", metricId: "test", ts, value: 1 });
		await telemetryMetricsValueEntityStorage.set({ id: "c", metricId: "test", ts, value: 3 });

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities.map(entity => entity.value)).toEqual([3, 2, 1]);
	});

	test("sorts counter values by value before timestamp", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter
		});

		const ts = Date.now();
		await telemetryMetricsValueEntityStorage.set({
			id: "a",
			metricId: "test",
			ts: ts + 10,
			value: 1
		});
		await telemetryMetricsValueEntityStorage.set({ id: "b", metricId: "test", ts, value: 3 });
		await telemetryMetricsValueEntityStorage.set({
			id: "c",
			metricId: "test",
			ts: ts + 20,
			value: 2
		});

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities.map(entity => entity.value)).toEqual([3, 2, 1]);
	});

	test("holds values in cache until flush is called", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await telemetry.flush();

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.length).toEqual(3);
		expect(storeAfter?.[2].value).toEqual(3);
	});

	test("flushes automatically when batch size threshold is reached", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 3, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.length).toEqual(3);
		expect(storeAfter?.[2].value).toEqual(3);
	});

	test("queryValues flushes pending entries before querying", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities.length).toEqual(2);
		expect(result.entities[0].value).toEqual(2);
		expect(result.entities[1].value).toEqual(1);
	});

	test("getMetricValue flushes pending entries before querying", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		const valueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const value = await telemetry.getMetricValue("test", valueId);
		expect(value.id).toEqual(valueId);
		expect(value.value).toEqual(1);
	});

	test("removeMetric flushes pending entries before removing", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		await telemetry.removeMetric("test");

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(0);
	});

	test("stop flushes remaining cached entries", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await telemetry.stop();

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.length).toEqual(2);
	});

	test("does not read metric definition from storage after createMetric pre-warms the cache", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");

		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

		expect(getSpy).not.toHaveBeenCalled();
		getSpy.mockRestore();
	});

	test("invalidates cached metric definition when metric is removed", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.removeMetric("test");

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Increment)
		).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricNotFound"
		});
	});

	test("refreshes cached metric definition when metric is updated", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 5
		});

		for (let i = 0; i < 5; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}

		await telemetry.updateMetric({ id: "test", label: "Test", maxHistory: 2 });

		const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		await telemetry.flush();

		expect(getSpy).not.toHaveBeenCalled();
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(2);
		getSpy.mockRestore();
	});

	test("reads metric definition from storage on cache miss when capacity is exceeded", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { metricDefinitionCacheCapacity: 1 }
		});

		await telemetry.createMetric({ id: "metric1", label: "Metric 1", type: MetricType.Counter });
		await telemetry.createMetric({ id: "metric2", label: "Metric 2", type: MetricType.Counter });
		// With capacity 1, only metric2 remains in cache after both creates.

		const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
		await telemetry.addMetricValue("metric1", MetricCounterOperation.Increment);
		expect(getSpy).toHaveBeenCalledTimes(1);
		getSpy.mockRestore();
	});

	test("prunes oldest values during batch flush when maxHistory is set", async () => {
		const telemetry = new EntityStorageTelemetryConnector({
			config: { batchSize: 100, batchIntervalMs: 0 }
		});
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 3
		});

		for (let i = 0; i < 5; i++) {
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		}
		await telemetry.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(3);

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities[0].value).toEqual(5);
		expect(result.entities[1].value).toEqual(4);
		expect(result.entities[2].value).toEqual(3);
	});

	describe("tenant-partitioned storage", () => {
		beforeEach(() => {
			initSchema();
			telemetryMetricsEntityStorage = new MemoryEntityStorageConnector<TelemetryMetric>({
				entitySchema: nameof<TelemetryMetric>(),
				partitionContextIds: [ContextIdKeys.Tenant],
				config: { storageKey: "telemetry-metric" }
			});
			telemetryMetricsValueEntityStorage = new MemoryEntityStorageConnector<TelemetryMetricValue>({
				entitySchema: nameof<TelemetryMetricValue>(),
				partitionContextIds: [ContextIdKeys.Tenant],
				config: { storageKey: "telemetry-metric-value" }
			});
			EntityStorageConnectorFactory.register(
				"telemetry-metric",
				() => telemetryMetricsEntityStorage
			);
			EntityStorageConnectorFactory.register(
				"telemetry-metric-value",
				() => telemetryMetricsValueEntityStorage
			);
		});

		test("batch flush writes under the producer's context regardless of who flushes", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
				await telemetry.flush();
			});

			// The entry was captured under tenant-a's context at enqueue, so it lands in
			// tenant-a's partition regardless of who triggered the flush.
			const resultForProducer = await ContextIdStore.run(
				{ [ContextIdKeys.Tenant]: "tenant-a" },
				async () => telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(resultForProducer.entities.length).toEqual(1);

			const rawStore = await telemetryMetricsValueEntityStorage.getStore();
			expect(rawStore?.length).toEqual(1);
		});

		test("counter chaining is scoped per tenant", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
				await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
				await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
				await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				await telemetry.flush();
			});

			// Each tenant starts its own independent sequence at 1.
			const rawStore = await telemetryMetricsValueEntityStorage.getStore();
			expect(rawStore?.length).toEqual(2);
			expect(rawStore?.map(entity => entity.value)).toEqual([1, 1]);
		});

		test("metric definitions are only visible within the tenant that created them", async () => {
			const telemetry = new EntityStorageTelemetryConnector();

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
			});

			// tenant-b has no definition row for "m", so the write is rejected even though
			// tenant-a has a cached definition for the same metric id.
			await expect(
				ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
					telemetry.addMetricValue("m", MetricCounterOperation.Increment)
				)
			).rejects.toMatchObject({
				name: "NotFoundError",
				message: "entityStorageTelemetryConnector.metricNotFound"
			});
		});

		test("mixed-context batch distributes correctly regardless of flush context", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});
			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-c" }, async () => {
				await telemetry.flush();
			});

			const resultA = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			const resultB = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(resultA.entities.length).toEqual(1);
			expect(resultB.entities.length).toEqual(1);
		});

		test("trimming runs per partition, not across the whole flushed batch", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({
					id: "m",
					label: "M",
					type: MetricType.Counter,
					maxHistory: 1
				});
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});
			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
				await telemetry.createMetric({
					id: "m",
					label: "M",
					type: MetricType.Counter,
					maxHistory: 1
				});
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});

			await telemetry.flush();

			const resultA = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			const resultB = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(resultA.entities.length).toEqual(1);
			expect(resultA.entities[0].value).toEqual(2);
			expect(resultB.entities.length).toEqual(1);
			expect(resultB.entities[0].value).toEqual(1);
		});

		test("per-request context keys do not fragment caches or batch groups", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run(
				{ [ContextIdKeys.Tenant]: "tenant-a", remoteRequest: "req-1" },
				async () => {
					await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
					await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				}
			);

			// A second request from the same tenant differs only in per-request context keys:
			// the definition cache must hit and the counter must chain across the two requests.
			const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
			await ContextIdStore.run(
				{ [ContextIdKeys.Tenant]: "tenant-a", remoteRequest: "req-2" },
				async () => {
					await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				}
			);
			expect(getSpy).not.toHaveBeenCalled();
			getSpy.mockRestore();

			const setBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "setBatch");
			await telemetry.flush();
			expect(setBatchSpy).toHaveBeenCalledTimes(1);
			setBatchSpy.mockRestore();

			const result = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		});

		test("counter chaining spans contexts that share a partition", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});

			// Same tenant but with an organization in context (the API-key request shape):
			// storage partitions on tenant only, so the chain must continue, not restart.
			await ContextIdStore.run(
				{ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Organization]: "org-a" },
				async () => {
					await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				}
			);

			const setBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "setBatch");
			await telemetry.flush();
			expect(setBatchSpy).toHaveBeenCalledTimes(1);
			setBatchSpy.mockRestore();

			const result = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
				telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		});

		test("a failed group re-queues with its own context and lands correctly on retry", async () => {
			const telemetry = new EntityStorageTelemetryConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
				await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
				await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
			});

			const setBatchSpy = vi
				.spyOn(telemetryMetricsValueEntityStorage, "setBatch")
				.mockRejectedValueOnce(new Error("storage unavailable"));

			await telemetry.flush();

			const rawStoreAfterFailure = await telemetryMetricsValueEntityStorage.getStore();
			expect(rawStoreAfterFailure?.length).toEqual(0);

			setBatchSpy.mockRestore();
			await telemetry.flush();

			const resultForProducer = await ContextIdStore.run(
				{ [ContextIdKeys.Tenant]: "tenant-a" },
				async () => telemetry.queryValues("m", undefined, undefined, undefined, 10)
			);
			expect(resultForProducer.entities.length).toEqual(1);
		});
	});
});
