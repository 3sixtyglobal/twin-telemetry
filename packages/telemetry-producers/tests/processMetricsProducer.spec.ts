// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory } from "@twin.org/core";
import type { ITelemetryComponent } from "@twin.org/telemetry-models";
import { ProcessMetricsProducer } from "../src/processMetricsProducer.js";

const EXPECTED_METRIC_IDS = [
	"process_memory_rss_bytes",
	"process_memory_heap_used_bytes",
	"process_memory_heap_total_bytes",
	"process_uptime_seconds"
];

function makeTelemetry(): {
	telemetry: ITelemetryComponent;
	registered: string[];
	emittedValues: { [key: string]: number };
} {
	const registered: string[] = [];
	const emittedValues: { [key: string]: number } = {};
	const telemetry: ITelemetryComponent = {
		className: () => "mock",
		start: async () => {},
		stop: async () => {},
		createMetric: async metric => {
			registered.push(metric.id);
		},
		getMetric: async () => ({ metric: {} as never, value: {} as never }),
		updateMetric: async () => {},
		addMetricValue: async (id, value) => {
			emittedValues[id] = value as number;
			return "v";
		},
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
	return { telemetry, registered, emittedValues };
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
		const { telemetry, emittedValues } = makeTelemetry();
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
		await producer.collect();

		expect(emittedValues.process_memory_rss_bytes).toBe(50_000_000);
		expect(emittedValues.process_memory_heap_used_bytes).toBe(20_000_000);
		expect(emittedValues.process_memory_heap_total_bytes).toBe(40_000_000);
		expect(emittedValues.process_uptime_seconds).toBe(120.5);
	});

	test("collect() rounds uptime to 1 decimal place", async () => {
		const { telemetry, emittedValues } = makeTelemetry();
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
		await producer.collect();

		expect(emittedValues.process_uptime_seconds).toBe(100);
	});
});
