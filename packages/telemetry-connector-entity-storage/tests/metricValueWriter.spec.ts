// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@3sixty/context";
import { ComponentFactory } from "@3sixty/core";
import { SortDirection } from "@3sixty/entity";
import { MemoryEntityStorageConnector } from "@3sixty/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@3sixty/entity-storage-models";
import type { ILoggingComponent } from "@3sixty/logging-models";
import { nameof } from "@3sixty/nameof";
import { MetricCounterOperation, MetricType } from "@3sixty/telemetry-models";
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

/**
 * Wait for a condition to hold, polling until it does or the attempts run out.
 * @param condition The condition to wait for.
 * @param maxAttempts The maximum number of polls before giving up.
 * @returns A promise that resolves when the condition holds or the attempts run out.
 */
async function waitUntil(condition: () => Promise<boolean>, maxAttempts = 100): Promise<void> {
	for (let i = 0; i < maxAttempts && !(await condition()); i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 20));
	}
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
		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("reads only the newest value when writing, whatever the cap", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();

		// One descending read of a single row seeds the chain; nothing about the write scales
		// with the cap or with the history already stored.
		expect(querySpy).toHaveBeenCalledTimes(1);
		expect(querySpy.mock.calls[0][2]).toEqual(["ts", "value"]);
		expect(querySpy.mock.calls[0][4]).toEqual(1);
		querySpy.mockRestore();

		await writer.stop();
	});

	test("does not trim on the write path", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}
		await writer.flush();

		// The history is over the cap, but applying it is the trim pass's work.
		expect(removeBatchSpy).not.toHaveBeenCalled();
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3, 4, 5]);
		removeBatchSpy.mockRestore();

		await writer.stop();
	});

	test("trims on the configured interval", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0, trimIntervalMs: 50 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}
		await writer.flush();

		await waitUntil(async () => {
			const store = await telemetryMetricsValueEntityStorage.getStore();
			return (store?.length ?? 0) === 3;
		});

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("trims the values of a write a trim pass overlapped", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}

		// The trim pass runs on its own timer, so one can land in the window between the write
		// registering the metric and its values reaching storage.
		const setBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "setBatch")
			.mockImplementationOnce(async entities => {
				await writer.trim();
				await telemetryMetricsValueEntityStorage.setBatch(entities);
			});

		await writer.flush();
		setBatchSpy.mockRestore();

		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("keeps the metric registered when a write lands during a trim pass", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 4; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}
		await writer.flush();

		// The boundary read of the pass cannot see the value written behind it, so retiring the
		// metric here would leave that value over the cap.
		const querySpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "query")
			.mockImplementationOnce(async (conditions, sortProperties, properties, cursor, pageSize) => {
				const boundary = await telemetryMetricsValueEntityStorage.query(
					conditions,
					sortProperties,
					properties,
					cursor,
					pageSize
				);
				await writer.add([buildPayload({ maxHistory: 3 })]);
				await writer.flush();
				return boundary;
			});

		await writer.trim();
		querySpy.mockRestore();

		const overlappedStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(overlappedStore?.map(entry => entry.value)).toEqual([2, 3, 4, 5]);

		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

		await writer.stop();
	});

	test("leaves a metric with no cap untrimmed", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload()]);
		}
		await writer.flush();

		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");
		await writer.trim();
		expect(removeBatchSpy).not.toHaveBeenCalled();
		removeBatchSpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3, 4, 5]);

		await writer.stop();
	});

	test("stores a gauge with the timestamp it arrived with", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0 });

		const ts = Date.now();
		await writer.add([buildPayload({ metricType: MetricType.Gauge, operation: 7, ts })]);
		await writer.add([buildPayload({ metricType: MetricType.Gauge, operation: 9, ts })]);

		// A gauge builds on nothing, so it needs neither the previous value nor the previous
		// timestamp, and two written in the same millisecond simply share it.
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([7, 9]);
		expect(valueStore?.map(entry => entry.ts)).toEqual([ts, ts]);

		await writer.stop();
	});

	test("writes a gauge without reading the previous value", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (const operation of [7, 9, 11]) {
			await writer.add([buildPayload({ metricType: MetricType.Gauge, operation })]);
		}

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();

		// A gauge replaces the stored value rather than building on it, so there is nothing to
		// read back before writing it.
		expect(querySpy).not.toHaveBeenCalled();
		querySpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([7, 9, 11]);

		await writer.stop();
	});

	test("reads the previous value for an inc dec counter but not for a gauge", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		await writer.add([
			buildPayload({
				metricId: "counter",
				metricType: MetricType.IncDecCounter,
				operation: MetricCounterOperation.Increment
			}),
			buildPayload({ metricId: "gauge", metricType: MetricType.Gauge, operation: 42 })
		]);

		const querySpy = vi.spyOn(telemetryMetricsValueEntityStorage, "query");
		await writer.flush();

		expect(querySpy).toHaveBeenCalledTimes(1);
		expect(querySpy.mock.calls[0][0]).toMatchObject({ value: "counter" });
		querySpy.mockRestore();

		await writer.stop();
	});

	test("trims a capped gauge as well as a counter", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		const ts = Date.now();
		for (const [index, operation] of [7, 9, 11].entries()) {
			await writer.add([
				buildPayload({
					metricType: MetricType.Gauge,
					operation,
					ts: ts + index,
					maxHistory: 2
				})
			]);
		}
		await writer.flush();

		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([9, 11]);

		await writer.stop();
	});

	test("applies the cap to values which all share a timestamp", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		// A gauge is stored with the timestamp it arrived with, so several written in the same
		// millisecond all hold it and the cap cannot be applied by timestamp alone.
		const ts = Date.now();
		for (const operation of [7, 9, 11, 13]) {
			await writer.add([
				buildPayload({ metricType: MetricType.Gauge, operation, ts, maxHistory: 2 })
			]);
		}
		await writer.flush();
		await writer.trim();

		// The value discriminates between them, so the cap is applied exactly and picks the same
		// survivors every pass.
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([11, 13]);

		// A second pass has nothing left to remove.
		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");
		await writer.trim();
		expect(removeBatchSpy).not.toHaveBeenCalled();
		removeBatchSpy.mockRestore();

		await writer.stop();
	});

	test("holds values identical on timestamp and value until a later write moves the boundary", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		const ts = Date.now();
		for (let i = 0; i < 3; i++) {
			await writer.add([
				buildPayload({ metricType: MetricType.Gauge, operation: 7, ts, maxHistory: 2 })
			]);
		}
		await writer.flush();
		await writer.trim();

		// Nothing separates them, so removing one would be an arbitrary choice between values the
		// cap cannot order, and the history sits one over instead.
		expect((await telemetryMetricsValueEntityStorage.getStore())?.length).toEqual(3);

		for (const [index, operation] of [9, 11].entries()) {
			await writer.add([
				buildPayload({
					metricType: MetricType.Gauge,
					operation,
					ts: ts + index + 1,
					maxHistory: 2
				})
			]);
		}
		await writer.flush();
		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([9, 11]);

		await writer.stop();
	});

	test("trims every capped metric written since the last pass", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 3; i++) {
			await writer.add([buildPayload({ metricId: "a", maxHistory: 1 })]);
			await writer.add([buildPayload({ metricId: "b", maxHistory: 1 })]);
		}
		await writer.flush();

		await writer.trim();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.filter(entry => entry.metricId === "a").map(e => e.value)).toEqual([3]);
		expect(valueStore?.filter(entry => entry.metricId === "b").map(e => e.value)).toEqual([3]);

		// A second pass has nothing left to do, as both metrics are back inside their cap.
		const removeBatchSpy = vi.spyOn(telemetryMetricsValueEntityStorage, "removeBatch");
		await writer.trim();
		expect(removeBatchSpy).not.toHaveBeenCalled();
		removeBatchSpy.mockRestore();

		await writer.stop();
	});

	test("a write costs one read however far the history is past its cap", async () => {
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

		expect(querySpy).toHaveBeenCalledTimes(1);
		expect(querySpy.mock.calls[0][1]?.[0].sortDirection).toEqual(SortDirection.Descending);
		expect(querySpy.mock.calls[0][4]).toEqual(1);
		expect(removeBatchSpy).not.toHaveBeenCalled();

		querySpy.mockClear();
		removeBatchSpy.mockClear();
		await writer.trim();

		// The boundary read costs the cap rather than the 1201 rows stored, and the removals are
		// paged behind it.
		const [boundaryRead, ...removeReads] = querySpy.mock.calls;
		expect(boundaryRead[1]?.[0].sortDirection).toEqual(SortDirection.Descending);
		expect(boundaryRead[4]).toEqual(maxHistory);
		expect(removeReads[0][1]?.[0].sortDirection).toEqual(SortDirection.Ascending);
		querySpy.mockRestore();

		expect(removeBatchSpy.mock.calls.flatMap(call => call[0])).toHaveLength(1198);
		removeBatchSpy.mockRestore();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1199, 1200, 1201]);

		await writer.stop();
	});

	test("removes no more than the limit in one trim pass", async () => {
		const maxHistory = 3;
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 0, batchIntervalMs: 0, trimRemoveLimit: 500 });

		const seeded: TelemetryMetricValue[] = [];
		for (let i = 0; i < 1200; i++) {
			seeded.push({ id: `seed-${i}`, metricId: "test", ts: i + 1, value: i + 1 });
		}
		await telemetryMetricsValueEntityStorage.setBatch(seeded);
		await writer.add([buildPayload({ maxHistory })]);

		await writer.trim();
		expect((await telemetryMetricsValueEntityStorage.getStore())?.length).toEqual(701);

		// The metric stays registered, so the passes which follow finish what this one left.
		await writer.trim();
		expect((await telemetryMetricsValueEntityStorage.getStore())?.length).toEqual(201);

		await writer.trim();
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

	test("keeps the values when a trim pass fails and retries it on the next", async () => {
		const writer = new MetricValueWriter();
		await writer.start({ batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 5; i++) {
			await writer.add([buildPayload({ maxHistory: 3 })]);
		}
		await writer.flush();

		const removeBatchSpy = vi
			.spyOn(telemetryMetricsValueEntityStorage, "removeBatch")
			.mockRejectedValueOnce(new Error("storage unavailable"));

		await writer.trim();
		removeBatchSpy.mockRestore();

		// A failed trim is reported and dropped: the values it could not remove are still there
		// and, being durable, are never replayed through the write path.
		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3, 4, 5]);

		// The metric was not cleared, so the next pass applies the cap without another write.
		await writer.trim();

		const trimmedStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(trimmedStore?.map(entry => entry.value)).toEqual([3, 4, 5]);

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
