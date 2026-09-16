// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	type IBackgroundTask,
	type IBackgroundTaskComponent,
	TaskStatus
} from "@twin.org/background-task-models";
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
import type { ILogEntry } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { Mock } from "vitest";
import type { TelemetryMetric } from "../src/entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "../src/entities/telemetryMetricValue.js";
import { EntityStorageTelemetryConnector } from "../src/entityStorageTelemetryConnector.js";
import { initSchema } from "../src/schema.js";

const TEST_TASK_HANDLER = new URL("./testTelemetryMetricValueTask.js", import.meta.url).href;
const STALLING_TASK_HANDLER = new URL("./testStallingMetricValueTask.js", import.meta.url).href;
const TEST_VALUE_DIRECTORY = fileURLToPath(new URL("./.tmp/metric-values/", import.meta.url));
const TEST_TIMEOUT = 30000;

/**
 * Poll a condition until it is true or the attempt bound is reached, for synchronising with
 * background async work without guessing how long it takes.
 * @param condition The condition to wait for.
 * @param maxAttempts The maximum number of 100ms polls before giving up.
 * @returns A promise that resolves once the condition is true or the bound is reached.
 */
async function waitUntil(
	condition: () => boolean | Promise<boolean>,
	maxAttempts = 200
): Promise<void> {
	for (let i = 0; i < maxAttempts && !(await condition()); i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 100));
	}
}

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

/**
 * Wait until the background task queue has nothing left in flight.
 * @returns A promise that resolves once no task is pending or processing.
 */
async function waitForTasksSettled(): Promise<void> {
	await waitUntil(async () => {
		const tasks = await backgroundTaskEntityStorage.getStore();
		return (tasks ?? []).every(
			task => task.status !== TaskStatus.Pending && task.status !== TaskStatus.Processing
		);
	});
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
			config: { batchSize: 4, batchIntervalMs: 0, maxCacheSize: 7, trimIntervalMs: 30000 }
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
				trimIntervalMs: 30000,
				trimRemoveLimit: undefined
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

			// A gauge is stored with the timestamp it arrived with, so two set within the same
			// millisecond hold the same one and the read cannot order them against each other.
			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value).sort()).toEqual([11, 12]);
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

	// test(
	// 	"prunes oldest values when maxHistory is exceeded",
	// 	async () => {
	// 		const telemetry = await createConnector({ config: { trimIntervalMs: 50 } });
	// 		await telemetry.createMetric({
	// 			id: "test",
	// 			label: "Test",
	// 			type: MetricType.Counter,
	// 			maxHistory: 3
	// 		});

	// 		for (let i = 0; i < 5; i++) {
	// 			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
	// 		}

	// 		// The cap is applied by the trim pass on the background thread rather than by the
	// 		// write, so the history sits over it until the next pass.
	// 		await waitUntil(async () => (await readValues()).length === 3);

	// 		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
	// 		expect(result.entities.map(entity => entity.value)).toEqual([5, 4, 3]);
	// 	},
	// 	TEST_TIMEOUT
	// );

	test(
		"does not prune on the write path",
		async () => {
			const telemetry = await createConnector({ config: { trimIntervalMs: 0 } });
			await telemetry.createMetric({
				id: "test",
				label: "Test",
				type: MetricType.Counter,
				maxHistory: 3
			});

			for (let i = 0; i < 5; i++) {
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			}

			// Trimming is off, so nothing but the writes has touched the history.
			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([5, 4, 3, 2, 1]);
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
			const telemetry = await createConnector({ config: { trimIntervalMs: 50 } });
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

			await waitUntil(async () => (await readValues()).length === 3);

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

	test("sorts counter values by timestamp before value", async () => {
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

		// A counter written through the connector never has a larger value at an older
		// timestamp, so the two orderings only part for values written directly as these were.
		const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
		expect(result.entities.map(entity => entity.value)).toEqual([2, 1, 3]);
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

			// The read takes the four values with it, so one task covers handing them over and
			// asking the thread to write them.
			expect(createSpy).toHaveBeenCalledTimes(1);
			expect(createSpy.mock.calls[0][1]).toMatchObject({
				values: expect.any(Array),
				flush: true
			});
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
		"hands a whole window over as one task however many values it holds",
		async () => {
			const createSpy = vi.spyOn(backgroundTaskService, "create");

			const telemetry = await createConnector({
				config: { batchSize: 0, batchIntervalMs: 0, taskCoalesceMs: 10000 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const values = [];
			for (let i = 0; i < 250; i++) {
				values.push({ id: "test", value: MetricCounterOperation.Increment });
			}
			await telemetry.addMetricValues(values);
			await telemetry.addMetricValues(values);

			// The task rate is what the scheduler cannot keep up with, so the number of values
			// held must not create more tasks than the window itself does.
			expect(createSpy).not.toHaveBeenCalled();

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 1);
			expect(createSpy).toHaveBeenCalledTimes(1);
			expect((createSpy.mock.calls[0][1] as { values: unknown[] }).values).toHaveLength(500);
			expect(result.entities[0].value).toEqual(500);
		},
		TEST_TIMEOUT
	);

	test(
		"replaces the background thread when it stops completing the tasks it is given",
		async () => {
			// The stall timeout has to outlast a task starting the worker thread, or replacing it
			// would trip on the replacement.
			const telemetry = await createConnector({
				config: {
					batchSize: 100,
					batchIntervalMs: 0,
					taskStallTimeoutMs: 1000,
					// A handler whose task never completes, so the worker is left busy for good.
					overrideMetricValueTaskHandler: STALLING_TASK_HANDLER
				}
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const registerSpy = vi.spyOn(backgroundTaskService, "registerHandler");
			const unregisterSpy = vi.spyOn(backgroundTaskService, "unregisterHandler");

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			await waitUntil(() => registerSpy.mock.calls.length > 0);

			expect(unregisterSpy).toHaveBeenCalledWith("telemetry-metric-value-write");
			expect(registerSpy).toHaveBeenCalledWith(
				"telemetry-metric-value-write",
				STALLING_TASK_HANDLER,
				"telemetryMetricValueTask",
				expect.any(Function),
				expect.objectContaining({ maxWorkerCount: 1, idleShutdownTimeout: -1 })
			);
		},
		TEST_TIMEOUT
	);

	test(
		"leaves the background thread alone when a task completion was missed",
		async () => {
			const telemetry = await createConnector({
				config: { batchSize: 100, batchIntervalMs: 0, taskStallTimeoutMs: 150 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			const unregisterSpy = vi.spyOn(backgroundTaskService, "unregisterHandler");

			// The task is no longer in the queue, so its completion was missed rather than the
			// thread having stopped; replacing a working thread costs everything it has batched.
			const createSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockResolvedValue("never-reported");
			const getSpy = vi.spyOn(backgroundTaskService, "get").mockResolvedValue(undefined);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			await waitUntil(() => getSpy.mock.calls.length > 0);
			expect(getSpy).toHaveBeenCalledWith("never-reported");
			expect(unregisterSpy).not.toHaveBeenCalled();

			// Restored so the connector can be stopped for real when the test ends.
			createSpy.mockRestore();
			getSpy.mockRestore();
		},
		TEST_TIMEOUT
	);

	test(
		"stop releases the background thread even when the final write fails",
		async () => {
			const telemetry = await createConnector({ config: { batchSize: 100, batchIntervalMs: 0 } });
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			const unregisterSpy = vi.spyOn(backgroundTaskService, "unregisterHandler");
			const createSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockRejectedValue(new Error("task queue unavailable"));

			// A failed final write must not leave the thread running and the callers waiting.
			await expect(telemetry.stop()).resolves.toBeUndefined();
			createSpy.mockRestore();

			expect(unregisterSpy).toHaveBeenCalledWith("telemetry-metric-value-write");
		},
		TEST_TIMEOUT
	);

	test(
		"leaves the background thread alone while it is still completing tasks",
		async () => {
			const telemetry = await createConnector({
				config: { batchSize: 100, batchIntervalMs: 0, taskStallTimeoutMs: 1000 }
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			// Warm the worker first, so what follows is only measuring completed tasks and not
			// the one-off thread startup.
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			const unregisterSpy = vi.spyOn(backgroundTaskService, "unregisterHandler");

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			// Well past the stall timeout, with every task the thread was given completed.
			await new Promise<void>(resolve => setTimeout(resolve, 1200));

			expect(unregisterSpy).not.toHaveBeenCalled();
		},
		TEST_TIMEOUT
	);

	describe("stall detection with a background task component stub", () => {
		/**
		 * A background task component whose tasks the test can set to any status directly, and
		 * whose read of a task can be observed and held up.
		 */
		class StubBackgroundTaskComponent implements IBackgroundTaskComponent {
			public taskStatus: TaskStatus;

			public getCalls: number;

			public readonly getEntered: Promise<void>;

			public readonly registerHandler: Mock;

			public readonly unregisterHandler: Mock;

			public readonly restartTimestamps: number[];

			private readonly _tasks: Map<string, IBackgroundTask>;

			private readonly _gate: Promise<void>;

			private _getEnteredResolve!: () => void;

			private _gateResolve?: () => void;

			private _stateChangeCallback?: (task: IBackgroundTask) => Promise<void>;

			private _taskCounter: number;

			/**
			 * Create a new stub.
			 * @param taskStatus The status every task starts in, and get() reports.
			 * @param gated Whether get() waits for releaseGate() before returning.
			 */
			constructor(taskStatus: TaskStatus, gated = false) {
				this.taskStatus = taskStatus;
				this.getCalls = 0;
				this.restartTimestamps = [];
				this._tasks = new Map<string, IBackgroundTask>();
				this._taskCounter = 0;

				this.getEntered = new Promise(resolve => {
					this._getEnteredResolve = resolve;
				});
				this._gate = gated
					? new Promise(resolve => {
							this._gateResolve = resolve;
						})
					: Promise.resolve();

				this.registerHandler = vi.fn(
					async (
						taskType: string,
						module: string,
						method: string,
						stateChangeCallback?: (task: IBackgroundTask) => Promise<void>
					): Promise<void> => {
						this._stateChangeCallback = stateChangeCallback;
					}
				);
				this.unregisterHandler = vi.fn(async (): Promise<void> => {
					this.restartTimestamps.push(Date.now());
				});
			}

			public className(): string {
				return "StubBackgroundTaskComponent";
			}

			public releaseGate(): void {
				this._gateResolve?.();
			}

			public async create<T>(taskType: string, payload?: T): Promise<string> {
				this._taskCounter += 1;
				const id = `task-${this._taskCounter}`;
				const now = new Date().toISOString();
				this._tasks.set(id, {
					id,
					type: taskType,
					threadId: "stub",
					dateCreated: now,
					dateModified: now,
					status: this.taskStatus,
					payload
				});
				return id;
			}

			public async get<T, U>(taskId: string): Promise<IBackgroundTask<T, U> | undefined> {
				this.getCalls += 1;
				this._getEnteredResolve();
				await this._gate;
				return this._tasks.get(taskId) as IBackgroundTask<T, U> | undefined;
			}

			/**
			 * Report a task complete through the callback the connector registered.
			 * @param taskId The task to complete.
			 * @param status The final status to report.
			 * @returns A promise that resolves once the connector has handled the report.
			 */
			public async completeTask(taskId: string, status: TaskStatus): Promise<void> {
				const task = this._tasks.get(taskId);
				if (!task) {
					return;
				}
				task.status = status;
				task.dateCompleted = new Date().toISOString();
				await this._stateChangeCallback?.(task);
			}

			public async retry(taskId: string): Promise<void> {
				const task = this._tasks.get(taskId);
				if (task) {
					task.status = this.taskStatus;
				}
			}

			public async remove(taskId: string): Promise<void> {
				this._tasks.delete(taskId);
			}

			public async cancel(taskId: string): Promise<void> {
				const task = this._tasks.get(taskId);
				if (task) {
					task.status = TaskStatus.Cancelled;
				}
			}

			public async query(): Promise<{ entities: IBackgroundTask[]; cursor?: string }> {
				return { entities: [...this._tasks.values()] };
			}
		}

		let stub: StubBackgroundTaskComponent;
		let logEntries: ILogEntry[];

		beforeEach(() => {
			logEntries = [];
			ComponentFactory.register("logging", () => ({
				className: () => "MockLoggingComponent",
				log: async (entry: ILogEntry) => {
					logEntries.push(entry);
				}
			}));
		});

		afterEach(() => {
			ComponentFactory.unregister("background-task-stub");
			ComponentFactory.unregister("logging");
		});

		/**
		 * Create a connector wired to the given stub, tracked so it is stopped when the outer
		 * afterEach runs.
		 * @param stubComponent The background task component stub to use.
		 * @param taskStallTimeoutMs The stall timeout to configure.
		 * @returns The started connector.
		 */
		async function createStubbedConnector(
			stubComponent: StubBackgroundTaskComponent,
			taskStallTimeoutMs: number
		): Promise<EntityStorageTelemetryConnector> {
			stub = stubComponent;
			ComponentFactory.register("background-task-stub", () => stub);
			return createConnector({
				backgroundTaskComponentType: "background-task-stub",
				loggingComponentType: "logging",
				config: {
					batchSize: 100,
					batchIntervalMs: 0,
					taskStallTimeoutMs,
					// None of these tasks ever confirm through the stub, so this keeps the final
					// flush stop() attempts from waiting the default 30s during teardown.
					flushTimeoutMs: 200
				}
			});
		}

		test(
			"leaves the background thread in place while its task is still waiting to be scheduled",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Pending),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.getCalls >= 1);

				expect(stub.unregisterHandler).not.toHaveBeenCalled();
				expect(stub.registerHandler).toHaveBeenCalledTimes(1);

				const stalledEntries = logEntries.filter(
					entry => entry.message === "metricValueTaskNotScheduled"
				);
				expect(stalledEntries).toHaveLength(1);
				expect(stalledEntries[0].level).toEqual("warn");
				expect(stalledEntries[0].source).toEqual(EntityStorageTelemetryConnector.CLASS_NAME);
				expect(stalledEntries[0].data).toMatchObject({ taskId: "task-1", taskCount: 1 });
			},
			TEST_TIMEOUT
		);

		test(
			"reports a task still waiting to be scheduled again after another stall timeout",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Pending),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.getCalls >= 2);

				expect(stub.unregisterHandler).not.toHaveBeenCalled();

				const stalledEntries = logEntries.filter(
					entry => entry.message === "metricValueTaskNotScheduled"
				);
				expect(stalledEntries).toHaveLength(2);
				expect(stalledEntries[0].data).toMatchObject({ taskId: "task-1", taskCount: 1 });
				expect(stalledEntries[1].data).toMatchObject({ taskId: "task-1", taskCount: 1 });

				// Measures the task's age from when it was created, not from the previous
				// warning, so it keeps growing across repeat warnings instead of resetting.
				const secondWaitMs = (stalledEntries[1].data as { stalledForMs: number }).stalledForMs;
				expect(secondWaitMs).toBeGreaterThanOrEqual(350);
			},
			TEST_TIMEOUT
		);

		test(
			"replaces the background thread when its task was taken but never completed",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Processing),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.unregisterHandler.mock.calls.length >= 1);
				await waitUntil(() => stub.registerHandler.mock.calls.length >= 2);

				const stalledEntries = logEntries.filter(
					entry => entry.message === "metricValueThreadStalled"
				);
				expect(stalledEntries).toHaveLength(1);
				expect(stalledEntries[0].level).toEqual("error");
				expect(stalledEntries[0].source).toEqual(EntityStorageTelemetryConnector.CLASS_NAME);
				expect(stalledEntries[0].data).toMatchObject({ taskId: "task-1", taskCount: 1 });

				const restartedEntries = logEntries.filter(
					entry => entry.message === "metricValueThreadRestarted"
				);
				expect(restartedEntries).toHaveLength(1);
				expect(restartedEntries[0].level).toEqual("warn");

				expect(stub.registerHandler).toHaveBeenNthCalledWith(
					2,
					"telemetry-metric-value-write",
					TEST_TASK_HANDLER,
					"telemetryMetricValueTask",
					expect.any(Function),
					expect.objectContaining({ maxWorkerCount: 1, idleShutdownTimeout: -1 })
				);
			},
			TEST_TIMEOUT
		);

		test(
			"runs one stall check at a time when a value arrives during the check",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Processing, true),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await stub.getEntered;

				// A task created while the check is in flight; before the fix this arms a second
				// check with no delay, since the progress marker only moves once the restart runs.
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await new Promise<void>(resolve => setTimeout(resolve, 0));

				stub.releaseGate();
				await waitUntil(() => stub.registerHandler.mock.calls.length >= 2);

				expect(stub.getCalls).toEqual(1);
				expect(stub.unregisterHandler).toHaveBeenCalledTimes(1);

				const stalledEntries = logEntries.filter(
					entry => entry.message === "metricValueThreadStalled"
				);
				expect(stalledEntries).toHaveLength(1);
			},
			TEST_TIMEOUT
		);

		test(
			"waits longer before each further replacement until a task completes",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Processing),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				const beforeFirst = Date.now();
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 1);
				const beforeSecond = Date.now();
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 2);
				const beforeThird = Date.now();
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 3);

				// Each wait is fixed by the config when measured from its own task's creation
				// (200, 400, 800ms), which keeps this independent of any prior timer's lateness.
				const [restart1, restart2, restart3] = stub.restartTimestamps;
				expect(restart1 - beforeFirst).toBeLessThan(400);
				expect(restart2 - beforeSecond).toBeGreaterThanOrEqual(350);
				expect(restart3 - beforeThird).toBeGreaterThanOrEqual(750);

				// A task completed normally: the next stall starts from the base timeout again
				// rather than continuing to grow.
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				const beforeFourth = Date.now();
				await stub.completeTask("task-4", TaskStatus.Success);

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 4);

				const restart4 = stub.restartTimestamps[3];
				expect(restart4 - beforeFourth).toBeLessThan(400);
			},
			TEST_TIMEOUT
		);

		test(
			"resets the backoff after a task's completion is missed instead of the thread stalling",
			async () => {
				const telemetry = await createStubbedConnector(
					new StubBackgroundTaskComponent(TaskStatus.Processing),
					200
				);
				await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 1);
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await waitUntil(() => stub.restartTimestamps.length >= 2);

				// task-3's completion report is missed rather than the thread having stalled: no
				// restart, but the backoff the two prior restarts built up should not carry over.
				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				await stub.remove("task-3");
				await waitUntil(() => stub.getCalls >= 3);

				await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
				const beforeFourth = Date.now();
				await waitUntil(() => stub.restartTimestamps.length >= 3);

				const restart3 = stub.restartTimestamps[2];
				expect(restart3 - beforeFourth).toBeLessThan(400);
			},
			TEST_TIMEOUT
		);
	});

	test(
		"does not queue a second flush for a read already waiting on one",
		async () => {
			const telemetry = await createConnector({
				config: {
					batchSize: 100,
					batchIntervalMs: 0,
					flushTimeoutMs: 300,
					// Off, so the flush that never completes stays outstanding for the whole test.
					taskStallTimeoutMs: 0
				}
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			// Warm the worker first, so the short flush timeout below is only measuring the
			// task that never completes and not the one-off thread startup.
			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			// A task that never reaches Success must not be taken as the values being written.
			const missedSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockResolvedValueOnce("never-completes");
			const stale = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(stale.entities.map(entity => entity.value)).toEqual([1]);
			missedSpy.mockRestore();

			// The flush is still outstanding and covers this read too, so it waits for that one.
			// Queueing another here is what let a slow backend turn every read into a task on
			// the queue the reads were already waiting behind.
			const createSpy = vi.spyOn(backgroundTaskService, "create");
			const alsoStale = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(createSpy).not.toHaveBeenCalled();
			expect(alsoStale.entities.map(entity => entity.value)).toEqual([1]);
			createSpy.mockRestore();
		},
		TEST_TIMEOUT
	);

	test(
		"asks the thread to write again once the missed flush has been given up on",
		async () => {
			const telemetry = await createConnector({
				config: {
					batchSize: 100,
					batchIntervalMs: 0,
					// Both wait longer than a task takes to reach the thread and back: a stall
					// check which fires while a real task is still in flight replaces the thread,
					// and the shutdown writes the value the read below must not see yet.
					flushTimeoutMs: 1500,
					taskStallTimeoutMs: 1000
				}
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			// The check acts on the oldest task the thread still owes, so the value's own task is
			// left to complete first and the flush below is the only one outstanding.
			await waitForTasksSettled();

			// A well formed id for a task which is not in the queue, so the stall check reads its
			// state rather than failing on the id itself.
			const createSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockResolvedValueOnce("background-task:entity-storage:never-completes");
			const stale = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(stale.entities.map(entity => entity.value)).toEqual([1]);
			createSpy.mockRestore();

			// The task is not in the queue at all, so the stall check reports its state as missed
			// and drops it; the read after that queues a fresh flush and sees the value.
			await waitUntil(async () => {
				const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
				return result.entities.length === 2;
			});

			const result = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(result.entities.map(entity => entity.value)).toEqual([2, 1]);
		},
		TEST_TIMEOUT
	);

	test(
		"asks the thread to write again when the stall check itself fails",
		async () => {
			const telemetry = await createConnector({
				config: {
					batchSize: 100,
					batchIntervalMs: 0,
					// Both wait longer than a task takes to reach the thread and back: a stall
					// check which fires while a real task is still in flight replaces the thread,
					// and the shutdown writes the value the read below must not see yet.
					flushTimeoutMs: 1500,
					taskStallTimeoutMs: 1000
				}
			});
			await telemetry.createMetric({ id: "test", label: "Test", type: MetricType.Counter });

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);
			await telemetry.queryValues("test", undefined, undefined, undefined, 10);

			await telemetry.addMetricValue("test", MetricCounterOperation.Increment);

			// The check acts on the oldest task the thread still owes, so the value's own task is
			// left to complete first and the flush below is the only one outstanding.
			await waitForTasksSettled();

			// An id the task service cannot even parse, so the check throws rather than reporting
			// a state. The reads waiting on that flush have no other way out, so it has to be
			// given up on here as well.
			const createSpy = vi
				.spyOn(backgroundTaskService, "create")
				.mockResolvedValueOnce("never-completes");
			const stale = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
			expect(stale.entities.map(entity => entity.value)).toEqual([1]);
			createSpy.mockRestore();

			await waitUntil(async () => {
				const values = await telemetry.queryValues("test", undefined, undefined, undefined, 10);
				return values.entities.length === 2;
			});

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

			const telemetry = await createConnector({ config: { trimIntervalMs: 50 } });
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

			await waitUntil(async () => (await readValues()).length === 2);

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
				const telemetry = await createConnector({
					config: { batchSize: 100, batchIntervalMs: 0, trimIntervalMs: 50 }
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

					// Writes both partitions, so the trim pass has something to cap in each.
					await telemetry.queryValues("m", undefined, undefined, undefined, 10);
				});

				// Each partition is trimmed under the context it was written in, so neither is
				// capped against the values of the other.
				await waitUntil(
					async () =>
						(await readValues({ [ContextIdKeys.Tenant]: "tenant-a" })).length === 1 &&
						(await readValues({ [ContextIdKeys.Tenant]: "tenant-b" })).length === 1
				);

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
