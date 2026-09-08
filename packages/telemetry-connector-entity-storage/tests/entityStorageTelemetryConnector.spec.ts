// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	BackgroundTaskService,
	initSchema as initBackgroundTaskSchema,
	type BackgroundTask
} from "@twin.org/background-task-service";
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { ComponentFactory } from "@twin.org/core";
import { FileEntityStorageConnector } from "@twin.org/entity-storage-connector-file";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetric } from "../src/entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "../src/entities/telemetryMetricValue.js";
import { EntityStorageTelemetryConnector } from "../src/entityStorageTelemetryConnector.js";
import { initSchema } from "../src/schema.js";

const TEST_TASK_HANDLER = new URL("./testTelemetryMetricValueTask.js", import.meta.url).href;
const TEST_VALUE_DIRECTORY = fileURLToPath(new URL("./.tmp/metric-values/", import.meta.url));
const TEST_TIMEOUT = 30000;

let telemetryMetricsEntityStorage: MemoryEntityStorageConnector<TelemetryMetric>;
let telemetryMetricsValueEntityStorage: FileEntityStorageConnector<TelemetryMetricValue>;
let backgroundTaskEntityStorage: MemoryEntityStorageConnector<BackgroundTask>;
let backgroundTaskService: BackgroundTaskService;
let connectors: EntityStorageTelemetryConnector[];

/**
 * Register the metric value storage on both sides of the worker boundary.
 * The worker thread has no engine to clone from, so the test handler module builds the same
 * file backed connector from the environment; sharing the directory is what lets the test read
 * what the background thread wrote.
 * @param partitionContextIds The context id keys to partition the storage by.
 */
function registerValueStorage(partitionContextIds?: string[]): void {
	process.env.TEST_TELEMETRY_VALUE_DIRECTORY = TEST_VALUE_DIRECTORY;
	process.env.TEST_TELEMETRY_VALUE_PARTITIONS = partitionContextIds?.join(",") ?? "";

	telemetryMetricsValueEntityStorage = new FileEntityStorageConnector<TelemetryMetricValue>({
		entitySchema: nameof<TelemetryMetricValue>(),
		partitionContextIds,
		config: { directory: TEST_VALUE_DIRECTORY }
	});
	EntityStorageConnectorFactory.register(
		"telemetry-metric-value",
		() => telemetryMetricsValueEntityStorage
	);
}

/**
 * Register the metric definition storage.
 * @param partitionContextIds The context id keys to partition the storage by.
 */
function registerMetricStorage(partitionContextIds?: string[]): void {
	telemetryMetricsEntityStorage = new MemoryEntityStorageConnector<TelemetryMetric>({
		entitySchema: nameof<TelemetryMetric>(),
		partitionContextIds,
		config: { storageKey: "telemetry-metric" }
	});
	EntityStorageConnectorFactory.register("telemetry-metric", () => telemetryMetricsEntityStorage);
}

/**
 * Create a started connector, tracked so it is stopped when the test ends.
 * @param options The connector options.
 * @returns The started connector.
 */
async function createConnector(
	options?: ConstructorParameters<typeof EntityStorageTelemetryConnector>[0]
): Promise<EntityStorageTelemetryConnector> {
	const telemetry = new EntityStorageTelemetryConnector({
		...options,
		config: {
			overrideMetricValueTaskHandler: TEST_TASK_HANDLER,
			// Most tests assert on the task a value creates, so the coalesce window is off unless
			// the test is about it.
			taskCoalesceMs: 0,
			...options?.config
		}
	});
	connectors.push(telemetry);
	await telemetry.start();
	return telemetry;
}

/**
 * Read the metric values a partition holds, newest first.
 * @param contextIds The context to read under.
 * @returns The values.
 */
async function readValues(contextIds?: { [key: string]: string }): Promise<TelemetryMetricValue[]> {
	const result = await ContextIdStore.run(contextIds ?? {}, async () =>
		telemetryMetricsValueEntityStorage.query(undefined, undefined, undefined, undefined, 1000)
	);
	return result.entities as TelemetryMetricValue[];
}

describe("EntityStorageTelemetryConnector", () => {
	beforeEach(async () => {
		connectors = [];
		initSchema();
		initBackgroundTaskSchema();

		await rm(TEST_VALUE_DIRECTORY, { recursive: true, force: true });
		await mkdir(TEST_VALUE_DIRECTORY, { recursive: true });

		registerMetricStorage();
		registerValueStorage();

		backgroundTaskEntityStorage = new MemoryEntityStorageConnector<BackgroundTask>({
			entitySchema: nameof<BackgroundTask>(),
			config: { storageKey: "background-task" }
		});
		EntityStorageConnectorFactory.register("background-task", () => backgroundTaskEntityStorage);

		backgroundTaskService = new BackgroundTaskService({ config: { taskInterval: 5 } });
		ComponentFactory.register("background-task", () => backgroundTaskService);
		await backgroundTaskService.start();
	});

	afterEach(async () => {
		for (const telemetry of connectors) {
			await telemetry.stop();
		}
		await backgroundTaskService.stop();
		ComponentFactory.unregister("background-task");
		await telemetryMetricsEntityStorage.teardown();
		await backgroundTaskEntityStorage.teardown();
		await rm(TEST_VALUE_DIRECTORY, { recursive: true, force: true });
	});

	test("can construct", async () => {
		const telemetry = new EntityStorageTelemetryConnector();
		expect(telemetry).toBeDefined();
	});

	test("registers a single long running worker for the metric value writes", async () => {
		const registerSpy = vi.spyOn(backgroundTaskService, "registerHandler");
		const unregisterSpy = vi.spyOn(backgroundTaskService, "unregisterHandler");

		const telemetry = await createConnector();

		expect(registerSpy).toHaveBeenCalledWith(
			"telemetry-metric-value-write",
			TEST_TASK_HANDLER,
			"telemetryMetricValueTask",
			expect.any(Function),
			{
				maxWorkerCount: 1,
				idleShutdownTimeout: -1,
				initialiseMethod: "telemetryMetricValueTaskStart",
				initialiseMethodParams: expect.any(Function),
				shutdownMethod: "telemetryMetricValueTaskEnd"
			}
		);

		await telemetry.stop();
		expect(unregisterSpy).toHaveBeenCalledWith("telemetry-metric-value-write");
	});

	test(
		"holds values for the coalesce window by default",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = new EntityStorageTelemetryConnector({
				config: { overrideMetricValueTaskHandler: TEST_TASK_HANDLER }
			});
			connectors.push(telemetry);
			await telemetry.start();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			// The default window keeps the task write off the caller's path.
			expect(createSpy).not.toHaveBeenCalled();

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
			expect((createSpy.mock.calls[0][1] as { values: unknown[] }).values).toHaveLength(2);
		},
		TEST_TIMEOUT
	);

	test("uses the packaged task handler module by default", async () => {
		const registerSpy = vi.spyOn(backgroundTaskService, "registerHandler");

		const telemetry = new EntityStorageTelemetryConnector();
		connectors.push(telemetry);
		await telemetry.start();

		expect(registerSpy.mock.calls[0][1].endsWith("telemetryMetricValueTask.js")).toEqual(true);
	});

	test("sends the writer config to the thread once when it starts", async () => {
		const registerSpy = vi.spyOn(backgroundTaskService, "registerHandler");

		await createConnector({
			config: { batchSize: 4, batchIntervalMs: 0, maxCacheSize: 7, mutexTimeoutMs: 1234 }
		});

		const handlerOptions = registerSpy.mock.calls[0][4] as {
			initialiseMethodParams: () => Promise<unknown[]>;
		};
		await expect(handlerOptions.initialiseMethodParams()).resolves.toEqual([
			{
				telemetryMetricValueStorageConnectorType: undefined,
				loggingComponentType: undefined,
				batchSize: 4,
				batchIntervalMs: 0,
				maxCacheSize: 7,
				mutexTimeoutMs: 1234
			}
		]);
	});

	test("passes only the metric value details with each task", async () => {
		const createSpy = vi.spyOn(backgroundTaskService, "create");

		const telemetry = await createConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Test",
			type: MetricType.Counter,
			maxHistory: 3
		});

		const valueId = await telemetry.addMetricValue("test", 5, { some: "data" });

		expect(createSpy).toHaveBeenCalledTimes(1);
		expect(createSpy.mock.calls[0][0]).toEqual("telemetry-metric-value-write");
		expect(createSpy.mock.calls[0][1]).toEqual({
			values: [
				{
					valueId,
					metricId: "test",
					metricType: MetricType.Counter,
					operation: 5,
					ts: expect.any(Number),
					maxHistory: 3,
					customData: { some: "data" },
					contextIds: { [ContextIdKeys.Node]: "", [ContextIdKeys.Tenant]: "" }
				}
			]
		});
	});

	test("can create a metric", async () => {
		const telemetry = await createConnector();
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

	test("creates several metrics with a single read and a single write", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "existing", label: "Existing", type: MetricType.Counter });

		const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
		const querySpy = vi.spyOn(telemetryMetricsEntityStorage, "query");
		const setBatchSpy = vi.spyOn(telemetryMetricsEntityStorage, "setBatch");

		await telemetry.createMetric([
			{ id: "existing", label: "Existing", type: MetricType.Counter },
			{ id: "a", label: "A", type: MetricType.Counter, maxHistory: 5 },
			{ id: "b", label: "B", type: MetricType.Gauge }
		]);

		// One query resolves what already exists, one batch writes the rest.
		expect(getSpy).not.toHaveBeenCalled();
		expect(querySpy).toHaveBeenCalledTimes(1);
		expect(setBatchSpy).toHaveBeenCalledTimes(1);
		expect(setBatchSpy.mock.calls[0][0].map(metric => metric.id)).toEqual(["a", "b"]);
		getSpy.mockRestore();
		querySpy.mockRestore();
		setBatchSpy.mockRestore();

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.map(metric => metric.id).sort()).toEqual(["a", "b", "existing"]);
		expect(store?.find(metric => metric.id === "a")?.maxHistory).toEqual(5);
	});

	test("an array of metrics leaves an existing metric untouched", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({
			id: "test",
			label: "Original",
			type: MetricType.Counter,
			maxHistory: 3
		});

		await telemetry.createMetric([
			{ id: "test", label: "Replacement", type: MetricType.Gauge, maxHistory: 99 }
		]);

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store).toHaveLength(1);
		expect(store?.[0].label).toEqual("Original");
		expect(store?.[0].maxHistory).toEqual(3);
	});

	test("an array of metrics is validated before any of them are written", async () => {
		const telemetry = await createConnector();
		const setBatchSpy = vi.spyOn(telemetryMetricsEntityStorage, "setBatch");

		await expect(
			telemetry.createMetric([
				{ id: "a", label: "A", type: MetricType.Counter },
				{ id: "b", label: "B", type: MetricType.Counter, maxHistory: 0 }
			])
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.maxHistoryMustBePositiveInteger"
		});

		expect(setBatchSpy).not.toHaveBeenCalled();
		setBatchSpy.mockRestore();
	});

	test("an array of metrics pre-warms the definition cache", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric([{ id: "test", label: "Test", type: MetricType.Counter }]);

		const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
		await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
		expect(getSpy).not.toHaveBeenCalled();
		getSpy.mockRestore();
	});

	test("can update a metric details", async () => {
		const telemetry = await createConnector();
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
		expect(store?.[0].label).toEqual("Test2");
		expect(store?.[0].description).toEqual("Test metric2");
		expect(store?.[0].unit).toEqual("kgs2");
		expect(store?.[0].type).toEqual(0);
	});

	test("can create a inc dec counter metric", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.IncDecCounter });

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.[0].type).toEqual(1);
	});

	test("can create a gauge metric", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Gauge });

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.[0].type).toEqual(2);
	});

	test(
		"can increment a counter metric",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", 5);

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([6, 1]);
			expect(result.entities[0].id.length).toEqual(32);
			expect(result.entities[0].ts).toBeGreaterThan(0);
		},
		TEST_TIMEOUT
	);

	test(
		"keeps counter increments accurate during same-tick bursts",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			for (let i = 0; i < 20; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 25);
			expect(result.entities.map(entity => entity.value)).toEqual([
				20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
			]);
		},
		TEST_TIMEOUT
	);

	test(
		"returns the value id before the background thread has written it",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const valueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			expect(await readValues()).toHaveLength(0);

			const value = await telemetry.getMetricValue("test", valueId);
			expect(value.id).toEqual(valueId);
			expect(value.value).toEqual(1);
		},
		TEST_TIMEOUT
	);

	test("can fail to decrement a counter metric", async () => {
		const createSpy = vi.spyOn(backgroundTaskService, "create");

		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.counterIncOnly"
		});

		// The invalid operation is rejected before it reaches the background thread.
		expect(createSpy).not.toHaveBeenCalled();
	});

	test(
		"can increment an inc/dec counter metric",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.IncDecCounter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment, undefined);
			await telemetry.addMetricValue("test", 5);

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([6, 1]);
		},
		TEST_TIMEOUT
	);

	test(
		"can decrement an inc/dec counter metric",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.IncDecCounter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Decrement);
			await telemetry.addMetricValue("test", -5);

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([-6, -1]);
		},
		TEST_TIMEOUT
	);

	test("can fail to set a value to a non integer inc/dec counter metric", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.IncDecCounter });

		await expect(telemetry.addMetricValue("test", 5.5)).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.upDownCounterIncOrDecOnly"
		});
	});

	test(
		"can set a gauge metric",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Gauge });

			await telemetry.addMetricValue("test", 11);
			await telemetry.addMetricValue("test", 12);

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([12, 11]);
		},
		TEST_TIMEOUT
	);

	test("can fail to inc a gauge metric", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Gauge });

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Increment)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
		});
	});

	test("can fail to dec a gauge metric", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Gauge });

		await expect(
			telemetry.addMetricValue("test", MetricCounterOperation.Decrement)
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.gaugeNoIncDec"
		});
	});

	test(
		"can remove a metric and its values",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			for (let i = 0; i < 5; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			await telemetry.removeMetric("test");

			expect(await telemetryMetricsEntityStorage.getStore()).toHaveLength(0);
			expect(await readValues()).toHaveLength(0);
		},
		TEST_TIMEOUT
	);

	test(
		"can get a metric value by id",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const firstValueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			const value = await telemetry.getMetricValue("test", firstValueId);
			expect(value.id).toBe(firstValueId);
			expect(value.value).toBe(1);
		},
		TEST_TIMEOUT
	);

	test(
		"can fail to get a metric value with wrong metric id",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const valueId = await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			await expect(telemetry.getMetricValue("wrong-id", valueId)).rejects.toMatchObject({
				name: "NotFoundError",
				message: "entityStorageTelemetryConnector.metricValueNotFound"
			});
		},
		TEST_TIMEOUT
	);

	test("can fail to get a metric value that does not exist", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await expect(telemetry.getMetricValue("test", "nonexistent")).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricValueNotFound"
		});
	});

	test("can query metrics", async () => {
		const telemetry = await createConnector();

		for (let i = 0; i < 11; i++) {
			await telemetry.createMetric({ id: `test${i}`, label: "Test", type: MetricType.Counter });
		}

		const query1 = await telemetry.query(undefined, undefined, 10);
		expect(query1.entities.length).toEqual(10);
	});

	test("can query metrics for specific type", async () => {
		const telemetry = await createConnector();

		for (let i = 0; i < 5; i++) {
			await telemetry.createMetric({ id: `test-${i}`, label: "Test", type: MetricType.Counter });
		}
		for (let i = 0; i < 3; i++) {
			await telemetry.createMetric({
				id: `test2-${i}`,
				label: "Test",
				type: MetricType.IncDecCounter
			});
		}

		const query1 = await telemetry.query(MetricType.IncDecCounter, undefined, 10);
		expect(query1.entities.length).toEqual(3);
	});

	test("can create a metric with maxHistory", async () => {
		const telemetry = await createConnector();
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
		const telemetry = await createConnector();

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
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.updateMetric({ id: "test", label: "Test", maxHistory: 5 });

		const store = await telemetryMetricsEntityStorage.getStore();
		expect(store?.[0].maxHistory).toEqual(5);
	});

	test(
		"prunes oldest values when maxHistory is exceeded",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({
				id: "test",
				label: "Test",
				type: MetricType.Counter,
				maxHistory: 3
			});

			for (let i = 0; i < 5; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([5, 4, 3]);
		},
		TEST_TIMEOUT
	);

	test(
		"does not prune when maxHistory is not set",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			for (let i = 0; i < 5; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.length).toEqual(5);
		},
		TEST_TIMEOUT
	);

	test(
		"prunes all excess entries when maxHistory is reduced after accumulation",
		async () => {
			const telemetry = await createConnector();
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

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([6, 5, 4]);
		},
		TEST_TIMEOUT
	);

	test(
		"can query a metric and its values",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({
				id: "test",
				label: "Test",
				description: "Test metric",
				unit: "kgs",
				type: MetricType.Counter
			});

			for (let i = 0; i < 25; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			const query1 = await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			expect(query1.metric.id).toEqual("test");
			expect(query1.metric.label).toEqual("Test");
			expect(query1.metric.description).toEqual("Test metric");
			expect(query1.metric.unit).toEqual("kgs");
			expect(query1.metric.type).toEqual(MetricType.Counter);
			expect(query1.entities.length).toEqual(10);

			const query2 = await telemetry.queryValues("test", undefined, undefined, query1.cursor, 10);
			expect(query2.entities.length).toEqual(10);

			const query3 = await telemetry.queryValues("test", undefined, undefined, query2.cursor, 10);
			expect(query3.entities.length).toEqual(5);
		},
		TEST_TIMEOUT
	);

	test("sorts counter values by value when timestamps match", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		const ts = Date.now();
		await telemetryMetricsValueEntityStorage.set({ id: "a", metricId: "test", ts, value: 2 });
		await telemetryMetricsValueEntityStorage.set({ id: "b", metricId: "test", ts, value: 1 });
		await telemetryMetricsValueEntityStorage.set({ id: "c", metricId: "test", ts, value: 3 });

		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities.map(entity => entity.value)).toEqual([3, 2, 1]);
	});

	test("sorts counter values by value before timestamp", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

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

	test(
		"queryValues asks the background thread to write its pending values",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			expect(await readValues()).toHaveLength(0);

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		},
		TEST_TIMEOUT
	);

	test("does not ask the background thread to write when this node has added nothing", async () => {
		const createSpy = vi.spyOn(backgroundTaskService, "create");

		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

		await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		await telemetry.getMetricValue("test", "nonexistent").catch(() => {});

		// A read only needs the thread to write when this node has given it something.
		expect(createSpy).not.toHaveBeenCalled();
	});

	test(
		"asks the background thread to write only once per set of added values",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			const createSpy = vi.spyOn(backgroundTaskService, "create");
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(createSpy).toHaveBeenCalledTimes(1);

			// Nothing has been added since, so the second read needs no write.
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(createSpy).toHaveBeenCalledTimes(1);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(createSpy).toHaveBeenCalledTimes(3);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		},
		TEST_TIMEOUT
	);

	test(
		"hands several values to the thread as one task when coalescing is configured",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = await createConnector({
				config: { batchSize: 100, batchIntervalMs: 0, taskCoalesceMs: 50 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			for (let i = 0; i < 4; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			// Still inside the window, so nothing has been handed over yet.
			expect(createSpy).not.toHaveBeenCalled();

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			// One task for the four values, and one to ask the thread to write them.
			expect(createSpy).toHaveBeenCalledTimes(2);
			expect(createSpy.mock.calls[0][1]).toMatchObject({ values: expect.any(Array) });
			expect((createSpy.mock.calls[0][1] as { values: unknown[] }).values).toHaveLength(4);
			expect(result.entities.map(entity => entity.value)).toEqual([4, 3, 2, 1]);
		},
		TEST_TIMEOUT
	);

	test(
		"hands the coalesced values over when the window elapses",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = await createConnector({
				config: { batchSize: 0, batchIntervalMs: 0, taskCoalesceMs: 20 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			for (let i = 0; i < 40 && (await readValues()).length === 0; i++) {
				await new Promise<void>(resolve => setTimeout(resolve, 100));
			}

			expect((await readValues()).map(entry => entry.value)).toEqual([1]);
			expect(createSpy).toHaveBeenCalledTimes(1);
		},
		TEST_TIMEOUT
	);

	test(
		"asks the thread to write again when a write does not complete",
		async () => {
			const telemetry = await createConnector({
				config: { batchSize: 100, batchIntervalMs: 0, flushTimeoutMs: 500 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			// Warm the worker first, so the short flush timeout below is only measuring the
			// task that never completes and not the one-off thread startup.
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			// A task that never reaches Success must not be taken as the values being written.
			const createSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockResolvedValueOnce("never-completes");
			const stale = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(stale.entities.map(entity => entity.value)).toEqual([1]);
			createSpy.mockRestore();

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		},
		TEST_TIMEOUT
	);

	test(
		"adds several metric values as a single task",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "counter", label: "Counter", type: MetricType.Counter });
			await telemetry.createMetric({ id: "gauge", label: "Gauge", type: MetricType.Gauge });

			const valueIds = await telemetry.addMetricValues([
				{ id: "counter", value: MetricCounterOperation.Increment },
				{ id: "gauge", value: 42, customData: { some: "data" } },
				{ id: "counter", value: 5 }
			]);

			// One task for the whole set rather than one per value.
			expect(createSpy).toHaveBeenCalledTimes(1);
			expect((createSpy.mock.calls[0][1] as { values: unknown[] }).values).toHaveLength(3);
			expect(valueIds).toHaveLength(3);
			expect(new Set(valueIds).size).toEqual(3);

			const counter = await telemetry.queryValues("counter", undefined, undefined, undefined, 10);
			expect(counter.entities.map(entity => entity.value)).toEqual([6, 1]);

			const gauge = await telemetry.queryValues("gauge", undefined, undefined, undefined, 10);
			expect(gauge.entities.map(entity => entity.value)).toEqual([42]);
			expect(gauge.entities[0].customData).toEqual({ some: "data" });
		},
		TEST_TIMEOUT
	);

	test("rejects a batch containing an unknown metric before anything is queued", async () => {
		const createSpy = vi.spyOn(backgroundTaskService, "create");

		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "counter", label: "Counter", type: MetricType.Counter });

		await expect(
			telemetry.addMetricValues([
				{ id: "counter", value: MetricCounterOperation.Increment },
				{ id: "missing", value: 1 }
			])
		).rejects.toMatchObject({
			name: "NotFoundError",
			message: "entityStorageTelemetryConnector.metricNotFound"
		});

		expect(createSpy).not.toHaveBeenCalled();
	});

	test("rejects a batch containing an operation the metric type does not allow", async () => {
		const telemetry = await createConnector();
		await telemetry.createMetric({ id: "counter", label: "Counter", type: MetricType.Counter });

		await expect(
			telemetry.addMetricValues([{ id: "counter", value: MetricCounterOperation.Decrement }])
		).rejects.toMatchObject({
			name: "GeneralError",
			message: "entityStorageTelemetryConnector.counterIncOnly"
		});
	});

	test(
		"removeMetric asks the background thread to write its pending values",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			await telemetry.removeMetric("test");

			expect(await readValues()).toHaveLength(0);
		},
		TEST_TIMEOUT
	);

	test(
		"stop writes the values the background thread still has pending",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			expect(await readValues()).toHaveLength(0);

			await telemetry.stop();

			expect(await readValues()).toHaveLength(2);
		},
		TEST_TIMEOUT
	);

	test(
		"writes the values on the interval without a read to trigger it",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 50 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			for (let i = 0; i < 40 && (await readValues()).length === 0; i++) {
				await new Promise<void>(resolve => setTimeout(resolve, 100));
			}

			expect((await readValues()).map(entry => entry.value)).toEqual([1]);
		},
		TEST_TIMEOUT
	);

	test(
		"does not read metric definition from storage after createMetric pre-warms the cache",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			expect(getSpy).not.toHaveBeenCalled();
			getSpy.mockRestore();
		},
		TEST_TIMEOUT
	);

	test(
		"invalidates cached metric definition when metric is removed",
		async () => {
			const telemetry = await createConnector();
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.removeMetric("test");

			await expect(
				telemetry.addMetricValue("test", MetricCounterOperation.Increment)
			).rejects.toMatchObject({
				name: "NotFoundError",
				message: "entityStorageTelemetryConnector.metricNotFound"
			});
		},
		TEST_TIMEOUT
	);

	test(
		"refreshes cached metric definition when metric is updated",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = await createConnector();
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
			expect(getSpy).not.toHaveBeenCalled();
			getSpy.mockRestore();

			// The updated cap travels with the payload, so the thread trims to the new value.
			expect(createSpy.mock.lastCall?.[1]).toMatchObject({ values: [{ maxHistory: 2 }] });

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.length).toEqual(2);
		},
		TEST_TIMEOUT
	);

	test(
		"reads metric definition from storage on cache miss when capacity is exceeded",
		async () => {
			const telemetry = await createConnector({
				config: { metricDefinitionCacheCapacity: 1 }
			});

			await telemetry.createMetric({ id: "metric1", label: "Metric 1", type: MetricType.Counter });
			await telemetry.createMetric({ id: "metric2", label: "Metric 2", type: MetricType.Counter });
			// With capacity 1, only metric2 remains in cache after both creates.

			const getSpy = vi.spyOn(telemetryMetricsEntityStorage, "get");
			await telemetry.addMetricValue("metric1", MetricCounterOperation.Increment);
			expect(getSpy).toHaveBeenCalledTimes(1);
			getSpy.mockRestore();
		},
		TEST_TIMEOUT
	);

	describe("tenant-partitioned storage", () => {
		beforeEach(() => {
			initSchema();
			registerMetricStorage([ContextIdKeys.Tenant]);
			registerValueStorage([ContextIdKeys.Tenant]);
		});

		test(
			"counter chaining is scoped per tenant",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
					await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				});

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
					await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				});

				await telemetry.stop();

				// Each tenant chains its own independent sequence in its own partition.
				expect(
					(await readValues({ [ContextIdKeys.Tenant]: "tenant-a" })).map(entry => entry.value)
				).toEqual([2, 1]);
				expect(
					(await readValues({ [ContextIdKeys.Tenant]: "tenant-b" })).map(entry => entry.value)
				).toEqual([1]);
			},
			TEST_TIMEOUT
		);

		test("metric definitions are only visible within the tenant that created them", async () => {
			const telemetry = await createConnector();

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

		test(
			"a batch spanning tenants is written to the partition each value came from",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
					await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
					await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				});
				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
					await telemetry.createMetric({ id: "m", label: "M", type: MetricType.Counter });
					await telemetry.addMetricValue("m", MetricCounterOperation.Increment);
				});

				// The flush runs under a third tenant, the values still land where they came from.
				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-c" }, async () =>
					telemetry.stop()
				);

				expect(await readValues({ [ContextIdKeys.Tenant]: "tenant-a" })).toHaveLength(1);
				expect(await readValues({ [ContextIdKeys.Tenant]: "tenant-b" })).toHaveLength(1);
				expect(await readValues({ [ContextIdKeys.Tenant]: "tenant-c" })).toHaveLength(0);
			},
			TEST_TIMEOUT
		);

		test(
			"trimming runs per partition, not across the whole flushed batch",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });

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

				await telemetry.stop();

				expect(
					(await readValues({ [ContextIdKeys.Tenant]: "tenant-a" })).map(entry => entry.value)
				).toEqual([2]);
				expect(
					(await readValues({ [ContextIdKeys.Tenant]: "tenant-b" })).map(entry => entry.value)
				).toEqual([1]);
			},
			TEST_TIMEOUT
		);

		test(
			"per-request context keys do not fragment the definition cache or batch groups",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });

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

				const result = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
					telemetry.queryValues("m", undefined, undefined, undefined, 10)
				);
				expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
			},
			TEST_TIMEOUT
		);

		test(
			"counter chaining spans contexts that share a partition",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });

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

				const result = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
					telemetry.queryValues("m", undefined, undefined, undefined, 10)
				);
				expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
			},
			TEST_TIMEOUT
		);

		test(
			"removing a metric in one tenant leaves the other tenant untouched",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
					await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				});
				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
					await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				});

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
					await telemetry.removeMetric("c");
				});

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () => {
					await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
				});

				const resultB = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
					telemetry.queryValues("c", undefined, undefined, undefined, 10)
				);
				expect(resultB.entities.map(entity => entity.value)).toEqual([3, 2, 1]);

				await expect(
					ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
						telemetry.queryValues("c", undefined, undefined, undefined, 10)
					)
				).rejects.toMatchObject({
					name: "NotFoundError",
					message: "entityStorageTelemetryConnector.metricNotFound"
				});
			},
			TEST_TIMEOUT
		);
	});

	describe("node and tenant partitioned storage", () => {
		beforeEach(() => {
			initSchema();
			registerMetricStorage([ContextIdKeys.Node, ContextIdKeys.Tenant]);
			registerValueStorage([ContextIdKeys.Node, ContextIdKeys.Tenant]);
		});

		test(
			"counter chaining is scoped per node for the same tenant",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });

				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => {
						await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					}
				);

				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-b", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => {
						await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					}
				);

				const resultA = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => telemetry.queryValues("c", undefined, undefined, undefined, 10)
				);
				const resultB = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-b", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => telemetry.queryValues("c", undefined, undefined, undefined, 10)
				);

				expect(resultA.entities.map(entity => entity.value)).toEqual([2, 1]);
				expect(resultB.entities.map(entity => entity.value)).toEqual([1]);
			},
			TEST_TIMEOUT
		);

		test(
			"counter chaining is scoped per tenant for the same node",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });

				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => {
						await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					}
				);

				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-b" },
					async () => {
						await telemetry.createMetric({ id: "c", label: "C", type: MetricType.Counter });
						await telemetry.addMetricValue("c", MetricCounterOperation.Increment);
					}
				);

				const resultA = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-a" },
					async () => telemetry.queryValues("c", undefined, undefined, undefined, 10)
				);
				const resultB = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "node-a", [ContextIdKeys.Tenant]: "tenant-b" },
					async () => telemetry.queryValues("c", undefined, undefined, undefined, 10)
				);

				expect(resultA.entities.map(entity => entity.value)).toEqual([2, 1]);
				expect(resultB.entities.map(entity => entity.value)).toEqual([1]);
			},
			TEST_TIMEOUT
		);

		test(
			"ids that concatenate to the same string keep separate chains",
			async () => {
				const telemetry = await createConnector({ config: { batchSize: 0, batchIntervalMs: 0 } });

				// Without a separator both contexts would key as "abc"; the "|" between the node and
				// tenant slots keeps them as "ab|c|d" and "a|bc|d".
				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "ab", [ContextIdKeys.Tenant]: "c" },
					async () => {
						await telemetry.createMetric({ id: "d", label: "D", type: MetricType.Counter });
						await telemetry.addMetricValue("d", MetricCounterOperation.Increment);
						await telemetry.addMetricValue("d", MetricCounterOperation.Increment);
					}
				);

				await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "a", [ContextIdKeys.Tenant]: "bc" },
					async () => {
						await telemetry.createMetric({ id: "d", label: "D", type: MetricType.Counter });
						await telemetry.addMetricValue("d", MetricCounterOperation.Increment);
					}
				);

				const resultFirst = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "ab", [ContextIdKeys.Tenant]: "c" },
					async () => telemetry.queryValues("d", undefined, undefined, undefined, 10)
				);
				const resultSecond = await ContextIdStore.run(
					{ [ContextIdKeys.Node]: "a", [ContextIdKeys.Tenant]: "bc" },
					async () => telemetry.queryValues("d", undefined, undefined, undefined, 10)
				);

				expect(resultFirst.entities.map(entity => entity.value)).toEqual([2, 1]);
				expect(resultSecond.entities.map(entity => entity.value)).toEqual([1]);
			},
			TEST_TIMEOUT
		);
	});
});
