// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import type { TelemetryMetricValue } from "../src/entities/telemetryMetricValue.js";
import type { ITelemetryMetricValuePayload } from "../src/models/ITelemetryMetricValuePayload.js";
import { initSchema } from "../src/schema.js";
import {
	telemetryMetricValueTask,
	telemetryMetricValueTaskEnd,
	telemetryMetricValueTaskStart
} from "../src/telemetryMetricValueTask.js";

let telemetryMetricsValueEntityStorage: MemoryEntityStorageConnector<TelemetryMetricValue>;
let valueCounter: number;

/**
 * Build a metric value payload with the defaults used across the tests.
 * @param overrides The parts of the payload to override.
 * @returns The payload.
 */
function buildValue(
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

describe("telemetryMetricValueTask", () => {
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
		await telemetryMetricValueTaskEnd();
		await telemetryMetricsValueEntityStorage.teardown();
	});

	test("starts without an engine when no clone data is supplied", async () => {
		await expect(telemetryMetricValueTaskStart(undefined)).resolves.toBeUndefined();
	});

	test("can fail with no payload", async () => {
		await expect(telemetryMetricValueTask(undefined, undefined as never)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.objectUndefined"
		});
	});

	test("can fail with no value id", async () => {
		await expect(
			telemetryMetricValueTask(undefined, {
				values: [buildValue({ valueId: "" })]
			})
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.stringEmpty"
		});
	});

	test("can fail with no metric id", async () => {
		await expect(
			telemetryMetricValueTask(undefined, {
				values: [buildValue({ metricId: "" })]
			})
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.stringEmpty"
		});
	});

	test("applies the writer config supplied when the task started", async () => {
		await telemetryMetricValueTaskStart(undefined, { batchSize: 100, batchIntervalMs: 0 });

		await telemetryMetricValueTask(undefined, { values: [buildValue()] });

		const storeBefore = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeBefore?.length).toEqual(0);

		await telemetryMetricValueTask(undefined, { flush: true });

		const storeAfter = await telemetryMetricsValueEntityStorage.getStore();
		expect(storeAfter?.map(entry => entry.value)).toEqual([1]);
	});

	test("batches the values and writes them on a flush request", async () => {
		await telemetryMetricValueTaskStart(undefined, { batchSize: 100, batchIntervalMs: 0 });

		for (let i = 0; i < 3; i++) {
			await telemetryMetricValueTask(undefined, { values: [buildValue()] });
		}

		await telemetryMetricValueTask(undefined, { flush: true });

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2, 3]);
	});

	test("writes a value and flushes it in the same task", async () => {
		await telemetryMetricValueTaskStart(undefined, { batchSize: 100, batchIntervalMs: 0 });

		await telemetryMetricValueTask(undefined, { values: [buildValue()], flush: true });

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);
	});

	test("writes the pending values when the task is ended", async () => {
		await telemetryMetricValueTaskStart(undefined, { batchSize: 100, batchIntervalMs: 0 });

		await telemetryMetricValueTask(undefined, { values: [buildValue()] });

		await telemetryMetricValueTaskEnd();

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1]);
	});

	test("starts a fresh writer after the task has been ended", async () => {
		await telemetryMetricValueTaskStart(undefined, { batchSize: 100, batchIntervalMs: 0 });
		await telemetryMetricValueTask(undefined, { values: [buildValue()] });
		await telemetryMetricValueTaskEnd();

		await telemetryMetricValueTaskStart(undefined, { batchSize: 0, batchIntervalMs: 0 });
		await telemetryMetricValueTask(undefined, { values: [buildValue()] });

		const valueStore = await telemetryMetricsValueEntityStorage.getStore();
		expect(valueStore?.map(entry => entry.value)).toEqual([1, 2]);
	});
});
