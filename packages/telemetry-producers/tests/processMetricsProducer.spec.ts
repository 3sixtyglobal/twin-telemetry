// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory } from "@twin.org/core";
import type { ITelemetryComponent, ITelemetryMetricValueEntry } from "@twin.org/telemetry-models";
import { ProcessMetricsProducer } from "../src/processMetricsProducer.js";

const EXPECTED_METRIC_IDS = [
	"process_memory_rss_bytes",
	"process_memory_heap_used_bytes",
	"process_memory_heap_total_bytes",
	"process_uptime_seconds"
];

/**
 * Index the collected values by metric id.
 * @param values The values returned by the producer.
 * @returns The values keyed by metric id.
 */
function toValueMap(values: ITelemetryMetricValueEntry[]): { [key: string]: number } {
	const map: { [key: string]: number } = {};
	for (const entry of values) {
		map[entry.id] = entry.value as number;
	}
	return map;
}

function makeTelemetry(): {
	telemetry: ITelemetryComponent;
	registered: string[];
} {
	const registered: string[] = [];
	const telemetry: ITelemetryComponent = {
		className: () => "mock",
		start: async () => {},
		stop: async () => {},
		createMetric: async metric => {
			registered.push(...(Array.isArray(metric) ? metric : [metric]).map(entry => entry.id));
		},
		getMetric: async () => ({ metric: {} as never, value: {} as never }),
		updateMetric: async () => {},
		addMetricValue: async () => "v",
		addMetricValues: async values => values.map(() => "v"),
		getMetricValue: async (id, valueId) => ({
			id: valueId,
			metricId: id,
			value: 0,
			ts: Date.now()
		}),
		removeMetric: async () => {},
		query: async () => ({ entities: [] }),
		queryValues: async () => ({ metric: {} as never, entities: [] })
	};
	return { telemetry, registered };
}

describe("ProcessMetricsProducer", () => {
	beforeEach(() => {
		ComponentFactory.register("telemetry", () => ({}) as unknown as ITelemetryComponent);
	});

	afterEach(() => {
		ComponentFactory.unregister("telemetry");
		vi.restoreAllMocks();
	});

	test("register() creates all expected metric IDs", async () => {
		const { telemetry, registered } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);
		const producer = new ProcessMetricsProducer();
		await producer.register();
		for (const id of EXPECTED_METRIC_IDS) {
			expect(registered).toContain(id);
		}
	});

	test("collect() emits a value for each metric", async () => {
		const { telemetry } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);

		vi.spyOn(process, "memoryUsage").mockReturnValue({
			rss: 50_000_000,
			heapUsed: 20_000_000,
			heapTotal: 40_000_000,
			external: 0,
			arrayBuffers: 0
		});
		vi.spyOn(process, "uptime").mockReturnValue(120.5);

		const producer = new ProcessMetricsProducer();
		const emittedValues = toValueMap(await producer.collect());

		expect(emittedValues.process_memory_rss_bytes).toBe(50_000_000);
		expect(emittedValues.process_memory_heap_used_bytes).toBe(20_000_000);
		expect(emittedValues.process_memory_heap_total_bytes).toBe(40_000_000);
		expect(emittedValues.process_uptime_seconds).toBe(120.5);
	});

	test("collect() rounds uptime to 1 decimal place", async () => {
		const { telemetry } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);

		vi.spyOn(process, "memoryUsage").mockReturnValue({
			rss: 1,
			heapUsed: 1,
			heapTotal: 1,
			external: 0,
			arrayBuffers: 0
		});
		vi.spyOn(process, "uptime").mockReturnValue(99.999);

		const producer = new ProcessMetricsProducer();
		const emittedValues = toValueMap(await producer.collect());

		expect(emittedValues.process_uptime_seconds).toBe(100);
	});
});
