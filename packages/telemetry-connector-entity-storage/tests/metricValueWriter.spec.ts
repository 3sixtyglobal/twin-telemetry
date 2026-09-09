// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { ComponentFactory, Mutex } from "@twin.org/core";
import { SortDirection } from "@twin.org/entity";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetricValue } from "../src/entities/telemetryMetricValue.js";
import { MetricValueWriter } from "../src/metricValueWriter.js";
import type { ITelemetryMetricValuePayload } from "../src/models/ITelemetryMetricValuePayload.js";
import { initSchema } from "../src/schema.js";

let telemetryMetricsValueEntityStorage: MemoryEntityStorageConnector<TelemetryMetricValue>;
let valueCounter: number;

/**
 * Build a metric value payload with the defaults used across the tests.
 * @param overrides The parts of the payload to override.
 * @returns The payload.
 */
function buildPayload(
	overrides?: Partial<ITelemetryMetricValuePayload>
): ITelemetryMetricValuePayload {
	valueCounter++;
	return {
		valueId: `value-${valueCounter}`,
		metricId: "test",
		metricType: MetricType.Counter,
		operation: MetricCounterOperation.Increment,
		ts: Date.now(),
		...overrides
	};
}

describe("MetricValueWriter", () => {
	beforeEach(() => {
		valueCounter = 0;
		initSchema();
		telemetryMetricsValueEntityStorage = new MemoryEntityStorageConnector<TelemetryMetricValue>({
			entitySchema: nameof<TelemetryMetricValue>(),
			config: { storageKey: "telemetry-metric-value" }
		});
		EntityStorageConnectorFactory.register(
			"telemetry-metric-value",
			() => telemetryMetricsValueEntityStorage
		);
	});

	afterEach(async () => {
		await telemetryMetricsValueEntityStorage.teardown();
	});

	test("can construct", async () => {
		const writer = new MetricValueWriter();
		expect(writer).toBeDefined();
		expect(writer.className()).toEqual("MetricValueWriter");
	});

	test("writes immediately when batching is disabled", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);

		await writer.stop();
	});

	test("holds entries until the batch size is reached", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 3, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);
		await writer.add([buildPayload()]);

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await writer.add([buildPayload()]);

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.map(entry => entry.value)).toEqual([1, 2, 3]);

		await writer.stop();
	});

	test("writes the pending entries when the interval elapses", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 20 });

		await writer.add([buildPayload()]);

		await new Promise<void>(resolve => setTimeout(resolve, 80));

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);

		await writer.stop();
	});

	test("stop writes the entries still pending", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);
		await writer.add([buildPayload()]);

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await writer.stop();

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.map(entry => entry.value)).toEqual([1, 2]);
	});

	test("reads the previous value from storage on every flush", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.add([buildPayload()]);
		await writer.add([buildPayload()]);

		// Nothing about the value is cached, so each flush re-reads the tail from storage.
		expect(querySpy).toHaveBeenCalledTimes(2);
		querySpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3]);

		await writer.stop();
	});

	test("picks up a value written to storage by another node", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		// Simulates a second load balanced node writing to the same storage.
		await telemetryMetricsValueEntityStorage.set({
			id: "external",
			metricId: "test",
			ts: Date.now(),
			value: 41
		});

		await writer.add([buildPayload()]);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([41, 42]);

		await writer.stop();
	});

	test("chains a batch from a single read of the previous value", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload()]);
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();
		expect(querySpy).toHaveBeenCalledTimes(1);
		querySpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3, 4, 5]);

		await writer.stop();
	});

	test("keeps the timestamps strictly increasing within a batch", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		const ts = Date.now();
		for (let i = 0; i < 3; i++) {
			await writer.add([buildPayload({ ts })]);
		}
		await writer.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.ts)).toEqual([ts, ts + 1, ts + 2]);

		await writer.stop();
	});

	test("applies inc dec counter and gauge operations", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		await writer.add([
			buildPayload({ metricId: "updown", metricType: MetricType.IncDecCounter, operation: 5 })
		]);
		await writer.add([
			buildPayload({
				metricId: "updown",
				metricType: MetricType.IncDecCounter,
				operation: MetricCounterOperation.Decrement
			})
		]);
		await writer.add([
			buildPayload({ metricId: "gauge", metricType: MetricType.Gauge, operation: 11.5 })
		]);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.filter(entry => entry.metricId === "updown").map(e => e.value)).toEqual([
			5, 4
		]);
		expect(valueStore?.filter(entry => entry.metricId === "gauge").map(e => e.value)).toEqual([
			11.5
		]);

		await writer.stop();
	});

	test("skips an operation which is not valid for the metric type", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		await writer.add([buildPayload({ operation: MetricCounterOperation.Decrement })]);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(0);

		await writer.stop();
	});

	test("trims the history to maxHistory", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}
		await writer.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("reads once for a capped metric, serving both the chain and the trim", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();

		// A single descending read of maxHistory + batch rows seeds the chain and identifies
		// everything falling outside the cap.
		expect(querySpy).toHaveBeenCalledTimes(1);
		expect(querySpy.mock.calls[0][2]).toEqual(["id", "ts", "value"]);
		expect(querySpy.mock.calls[0][4]).toEqual(3 + 5);
		querySpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("keeps gauge values ordered across writes in the same millisecond", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		const ts = Date.now();
		await writer.add([buildPayload({ metricType: MetricType.Gauge, operation: 7, ts })]);
		await writer.add([buildPayload({ metricType: MetricType.Gauge, operation: 9, ts })]);

		// A gauge replaces the previous value rather than building on it, but the previous
		// timestamp is still read so getMetric has an unambiguous most recent value.
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([7, 9]);
		expect(valueStore?.map(entry => entry.ts)).toEqual([ts, ts + 1]);

		await writer.stop();
	});

	test("still reads for a capped gauge so the history can be trimmed", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (const operation of [7, 9, 11]) {
			await writer.add([buildPayload({ metricType: MetricType.Gauge, operation, maxHistory: 2 })]);
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();
		expect(querySpy).toHaveBeenCalledTimes(1);
		querySpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([9, 11]);

		await writer.stop();
	});

	test("removes the overflow for every metric in the batch in one call", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 3; i++) {
			await writer.add([buildPayload({ metricId: "a", maxHistory: 1 })]);
			await writer.add([buildPayload({ metricId: "b", maxHistory: 1 })]);
		}

		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");
		await writer.flush();

		// The connectors chunk removeBatch internally, so the ids for both metrics go in one call.
		expect(removeBatchSpy).toHaveBeenCalledTimes(1);
		expect(removeBatchSpy.mock.calls[0][0]).toHaveLength(4);
		removeBatchSpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.filter(entry => entry.metricId === "a").map(e => e.value)).toEqual([3]);
		expect(valueStore?.filter(entry => entry.metricId === "b").map(e => e.value)).toEqual([3]);

		await writer.stop();
	});

	test("scans the history when it is longer than one read window", async () => {
		const maxHistory = 3;
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		const seeded: TelemetryMetricValue[] = [];
		for (let i = 0; i < 1200; i++) {
			seeded.push({ id: `seed-${i}`, metricId: "test", ts: i + 1, value: i + 1 });
		}
		await telemetryMetricsValueEntityStorage.setBatch(seeded);

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");
		await writer.add([buildPayload({ maxHistory })]);

		// The window comes back full, so the cap is applied by paging the history oldest first.
		const [seedRead, ...scanReads] = querySpy.mock.calls;
		expect(seedRead[1]?.[0].sortDirection).toEqual(SortDirection.Descending);
		expect(seedRead[4]).toEqual(maxHistory + 1);
		expect(scanReads).toHaveLength(2);
		expect(scanReads[0][1]?.[0].sortDirection).toEqual(SortDirection.Ascending);
		querySpy.mockRestore();

		// Everything outside the cap is still removed in a single call.
		expect(removeBatchSpy).toHaveBeenCalledTimes(1);
		expect(removeBatchSpy.mock.calls[0][0]).toHaveLength(1198);
		removeBatchSpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1199, 1200, 1201]);

		await writer.stop();
	});

	test("writes each partition under the context it was captured in", async () => {
		await telemetryMetricsValueEntityStorage.teardown();
		telemetryMetricsValueEntityStorage = new MemoryEntityStorageConnector<TelemetryMetricValue>({
			entitySchema: nameof<TelemetryMetricValue>(),
			partitionContextIds: [ContextIdKeys.Tenant],
			config: { storageKey: "telemetry-metric-value" }
		});
		EntityStorageConnectorFactory.register(
			"telemetry-metric-value",
			() => telemetryMetricsValueEntityStorage
		);

		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([buildPayload({ contextIds: { [ContextIdKeys.Tenant]: "tenant-a" } })]);
		await writer.add([buildPayload({ contextIds: { [ContextIdKeys.Tenant]: "tenant-a" } })]);
		await writer.add([buildPayload({ contextIds: { [ContextIdKeys.Tenant]: "tenant-b" } })]);

		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-c" }, async () => writer.flush());

		const valuesA = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
			telemetryMetricsValueEntityStorage.query()
		);
		const valuesB = await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
			telemetryMetricsValueEntityStorage.query()
		);

		// Each tenant chains its own sequence in its own partition, newest value first.
		expect(valuesA.entities.map(entry => entry.value)).toEqual([2, 1]);
		expect(valuesB.entities.map(entry => entry.value)).toEqual([1]);

		await writer.stop();
	});

	test("does not re-queue the entries when only the trim fails", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}

		const removeBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "removeBatch")
			.mockRejectedValueOnce(new Error("storage unavailable"));

		await writer.flush();
		removeBatchSpy.mockRestore();

		// The values are already durable, so replaying the operations would count them twice.
		await writer.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3, 4, 5]);

		// The cap is applied again by the next write for the metric.
		await writer.add([buildPayload({ maxHistory: 3 })]);
		await writer.flush();

		const trimmedStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(trimmedStore?.map(entry => entry.value)).toEqual([4, 5, 6]);

		await writer.stop();
	});

	test("serialises overlapping writes so none of the entries are skipped", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);

		// The second write is issued while the first is still running; joining it would leave the
		// entry added in between unwritten.
		const first = writer.flush();
		await writer.add([buildPayload()]);
		const second = writer.flush();
		await Promise.all([first, second]);

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2]);

		await writer.stop();
	});

	test("writes several values handed over together", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([buildPayload(), buildPayload(), buildPayload()]);
		await writer.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3]);

		await writer.stop();
	});

	test("re-queues the entries when the write fails", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([buildPayload()]);

		const setBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "setBatch")
			.mockRejectedValueOnce(new Error("storage unavailable"));

		await writer.flush();

		const storeAfterFailure = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfterFailure?.length).toEqual(0);

		setBatchSpy.mockRestore();
		await writer.flush();

		const storeAfterRetry = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfterRetry?.map(entry => entry.value)).toEqual([1]);

		await writer.stop();
	});

	test("drops the oldest re-queued entries beyond the cache size", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0, maxCacheSize: 1 });

		await writer.add([buildPayload()]);
		await writer.add([buildPayload()]);

		const setBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "setBatch")
			.mockRejectedValueOnce(new Error("storage unavailable"));

		await writer.flush();
		setBatchSpy.mockRestore();

		await writer.flush();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.length).toEqual(1);

		await writer.stop();
	});

	test("fails the write when the lock cannot be acquired", async () => {
		const lockSpy = vi.spyOn(Mutex, "lock").mockRejectedValueOnce(new Error("lock timeout"));

		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		// Reporting success while nothing was written would let a read return stale values.
		await expect(writer.add([buildPayload()])).rejects.toThrow("lock timeout");
		lockSpy.mockRestore();

		expect(await telemetryMetricsValueEntityStorage.getStore()).toHaveLength(0);

		// The entry stays queued, so the next write still persists it.
		await writer.flush();
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);

		await writer.stop();
	});

	test("passes the configured mutex timeout to lock acquisition", async () => {
		const lockSpy = vi.spyOn(Mutex, "lock");

		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0, mutexTimeoutMs: 1234 });

		await writer.add([buildPayload()]);

		expect(lockSpy).toHaveBeenCalledWith(expect.any(String), {
			throwOnTimeout: true,
			timeoutMs: 1234
		});

		lockSpy.mockRestore();
		await writer.stop();
	});
	test("keeps the interval running when a write and its own logging both fail", async () => {
		// Logging is the last thing a failed write does, and on the worker thread it writes to
		// storage as well, so it is the realistic way for writePending itself to throw.
		const failingLogging = {
			className: () => "FailingLoggingComponent",
			log: async (): Promise<void> => {
				throw new Error("logging unavailable");
			}
		} as unknown as ILoggingComponent;
		ComponentFactory.register("failing-logging", () => failingLogging);

		const setBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "setBatch")
			.mockRejectedValueOnce(new Error("storage unavailable"));

		const writer = new MetricValueWriter();
		await writer.start({
			batchSize: 100,
			batchIntervalMs: 50,
			loggingComponentType: "failing-logging"
		});

		await writer.add([buildPayload()]);

		// An unhandled rejection from the interval timer would take the whole worker thread with
		// it, and a timer left un-armed would end the interval writes for good; the value has to
		// arrive on a later interval instead.
		for (
			let i = 0;
			i < 40 && ((await telemetryMetricsValueEntityStorage.getStore()) ?? []).length === 0;
			i++
		) {
			await new Promise<void>(resolve => setTimeout(resolve, 100));
		}

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);
		expect(setBatchSpy.mock.calls.length).toBeGreaterThan(1);

		setBatchSpy.mockRestore();
		await writer.stop();
		ComponentFactory.unregister("failing-logging");
	});
});
