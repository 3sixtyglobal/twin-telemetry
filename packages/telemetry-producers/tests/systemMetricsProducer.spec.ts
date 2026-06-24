// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory } from "@twin.org/core";
import type { ITelemetryComponent } from "@twin.org/telemetry-models";
import { SystemMetricsProducer } from "../src/systemMetricsProducer.js";

const { mockCpus, mockTotalmem, mockFreemem, mockUptime } = vi.hoisted(() => ({
	mockCpus: vi.fn(),
	mockTotalmem: vi.fn(),
	mockFreemem: vi.fn(),
	mockUptime: vi.fn()
}));

vi.mock("node:os", () => ({
	cpus: mockCpus,
	totalmem: mockTotalmem,
	freemem: mockFreemem,
	uptime: mockUptime
}));

const EXPECTED_METRIC_IDS = [
	"system_cpu_usage_percent",
	"system_memory_total_bytes",
	"system_memory_used_bytes",
	"system_memory_free_bytes",
	"system_memory_usage_percent",
	"system_uptime_seconds"
];

function defaultCpu(): {
	model: string;
	speed: number;
	times: { user: number; nice: number; sys: number; idle: number; irq: number };
}[] {
	return [{ model: "", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }];
}

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
		removeMetric: async () => {},
		query: async () => ({ entities: [] }),
		queryValues: async () => ({ metric: {} as never, entities: [] })
	};
	return { telemetry, registered, emittedValues };
}

describe("SystemMetricsProducer", () => {
	beforeEach(() => {
		mockCpus.mockReturnValue(defaultCpu());
		mockTotalmem.mockReturnValue(8_000_000_000);
		mockFreemem.mockReturnValue(2_000_000_000);
		mockUptime.mockReturnValue(3600);
		ComponentFactory.register("telemetry", () => ({}) as unknown as ITelemetryComponent);
	});

	afterEach(() => {
		ComponentFactory.unregister("telemetry");
		vi.clearAllMocks();
	});

	test("register() creates all expected metric IDs", async () => {
		const { telemetry, registered } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);
		const producer = new SystemMetricsProducer();
		await producer.register();
		for (const id of EXPECTED_METRIC_IDS) {
			expect(registered).toContain(id);
		}
	});

	test("collect() emits a value for each metric", async () => {
		const { telemetry, emittedValues } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);
		const producer = new SystemMetricsProducer();
		await producer.collect();
		for (const id of EXPECTED_METRIC_IDS) {
			expect(Object.keys(emittedValues)).toContain(id);
		}
	});

	test("collect() computes CPU delta between ticks", async () => {
		const { telemetry, emittedValues } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);

		// baseline: all zeros; after interval: user 200ms + idle 800ms = 1000ms total → 20% CPU
		const baseTimes = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
		const afterTimes = { user: 200, nice: 0, sys: 0, idle: 800, irq: 0 };
		mockCpus
			.mockReturnValueOnce([{ model: "", speed: 0, times: baseTimes }]) // constructor
			.mockReturnValueOnce([{ model: "", speed: 0, times: afterTimes }]); // collect

		const producer = new SystemMetricsProducer();
		await producer.collect();

		// idle=800, total=1000 → idleFraction=0.8 → cpuUsage=(1-0.8)*100=20%
		expect(emittedValues.system_cpu_usage_percent).toBe(20);
	});

	test("collect() emits memory values from os", async () => {
		const { telemetry, emittedValues } = makeTelemetry();
		ComponentFactory.register("telemetry", () => telemetry);

		mockTotalmem.mockReturnValue(8_000_000_000);
		mockFreemem.mockReturnValue(2_000_000_000);
		mockUptime.mockReturnValue(3600);

		const producer = new SystemMetricsProducer();
		await producer.collect();

		expect(emittedValues.system_memory_total_bytes).toBe(8_000_000_000);
		expect(emittedValues.system_memory_free_bytes).toBe(2_000_000_000);
		expect(emittedValues.system_memory_used_bytes).toBe(6_000_000_000);
		expect(emittedValues.system_uptime_seconds).toBe(3600);
	});
});
