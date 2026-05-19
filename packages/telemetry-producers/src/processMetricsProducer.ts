// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import {
	MetricType,
	type IMetricsProducer,
	type ITelemetryComponent
} from "@twin.org/telemetry-models";
import type { IProcessMetricsProducerConstructorOptions } from "./models/IProcessMetricsProducerConstructorOptions.js";

/**
 * Metrics producer that emits Node.js process metrics on every poll cycle.
 */
export class ProcessMetricsProducer implements IMetricsProducer {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<ProcessMetricsProducer>();

	/**
	 * Resolved telemetry component.
	 * @internal
	 */
	private readonly _telemetry: ITelemetryComponent;

	/**
	 * Per-metric history cap.
	 * @internal
	 */
	private readonly _maxHistory: number;

	/**
	 * Create a new instance of ProcessMetricsProducer.
	 * @param options The options for the producer.
	 */
	constructor(options?: IProcessMetricsProducerConstructorOptions) {
		this._telemetry = ComponentFactory.get<ITelemetryComponent>(
			options?.telemetryComponentType ?? "telemetry"
		);
		this._maxHistory = options?.maxHistory ?? 1440;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return ProcessMetricsProducer.CLASS_NAME;
	}

	/**
	 * Register all process metrics with the telemetry component.
	 */
	public async register(): Promise<void> {
		await this._telemetry.createMetric({
			id: "process_memory_rss_bytes",
			label: "RSS memory",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await this._telemetry.createMetric({
			id: "process_memory_heap_used_bytes",
			label: "Heap used",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await this._telemetry.createMetric({
			id: "process_memory_heap_total_bytes",
			label: "Heap total",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await this._telemetry.createMetric({
			id: "process_uptime_seconds",
			label: "Process uptime",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
	}

	/**
	 * Collect and push current process metric values.
	 */
	public async collect(): Promise<void> {
		const mem = process.memoryUsage();
		await this._telemetry.addMetricValue("process_memory_rss_bytes", mem.rss);
		await this._telemetry.addMetricValue("process_memory_heap_used_bytes", mem.heapUsed);
		await this._telemetry.addMetricValue("process_memory_heap_total_bytes", mem.heapTotal);
		await this._telemetry.addMetricValue(
			"process_uptime_seconds",
			Number(process.uptime().toFixed(1))
		);
	}
}
