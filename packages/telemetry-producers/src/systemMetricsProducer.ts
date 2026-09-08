// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import * as os from "node:os";
import { ComponentFactory } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import {
	MetricHelper,
	MetricType,
	type IMetricsProducer,
	type ITelemetryComponent,
	type ITelemetryMetricValueEntry
} from "@twin.org/telemetry-models";
import type { ISystemMetricsProducerConstructorOptions } from "./models/ISystemMetricsProducerConstructorOptions.js";

/**
 * Metrics producer that emits host-level OS metrics on every poll cycle.
 */
export class SystemMetricsProducer implements IMetricsProducer {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<SystemMetricsProducer>();

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
	 * Snapshot of CPU times from the previous tick - used to compute deltas.
	 * @internal
	 */
	private _prevCpuTimes: os.CpuInfo["times"][];

	/**
	 * Create a new instance of SystemMetricsProducer.
	 * @param options The options for the producer.
	 */
	constructor(options?: ISystemMetricsProducerConstructorOptions) {
		this._telemetry = ComponentFactory.get<ITelemetryComponent>(
			options?.telemetryComponentType ?? "telemetry"
		);
		this._maxHistory = options?.maxHistory ?? 1440;
		this._prevCpuTimes = os.cpus().map(c => c.times);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return SystemMetricsProducer.CLASS_NAME;
	}

	/**
	 * Register all system metrics with the telemetry component.
	 * @returns A promise that resolves when all system metrics have been registered.
	 */
	public async register(): Promise<void> {
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_cpu_usage_percent",
			label: "CPU usage",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_memory_total_bytes",
			label: "Memory total",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_memory_used_bytes",
			label: "Memory used",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_memory_free_bytes",
			label: "Memory free",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_memory_usage_percent",
			label: "Memory usage",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
		await MetricHelper.createMetric(this._telemetry, {
			id: "system_uptime_seconds",
			label: "System uptime",
			type: MetricType.Gauge,
			maxHistory: this._maxHistory
		});
	}

	/**
	 * Read the current system metric values.
	 * @returns The current values for the system metrics.
	 */
	public async collect(): Promise<ITelemetryMetricValueEntry[]> {
		const currCpuTimes = os.cpus().map(c => c.times);
		const usages = currCpuTimes.map((curr, i) => {
			const prev = this._prevCpuTimes[i];
			const idle = curr.idle - prev.idle;
			const total =
				curr.user -
				prev.user +
				curr.nice -
				prev.nice +
				curr.sys -
				prev.sys +
				curr.idle -
				prev.idle +
				curr.irq -
				prev.irq;
			const idleDivision = idle / total;
			const idlePercent = 1 - idleDivision;
			return total === 0 ? 0 : 100 * idlePercent;
		});
		this._prevCpuTimes = currCpuTimes;
		const avgCpu = usages.reduce((a, b) => a + b, 0) / Math.max(1, usages.length);

		const total = os.totalmem();
		const free = os.freemem();
		const used = total - free;

		return [
			{ id: "system_cpu_usage_percent", value: Number(avgCpu.toFixed(2)) },
			{ id: "system_memory_total_bytes", value: total },
			{ id: "system_memory_used_bytes", value: used },
			{ id: "system_memory_free_bytes", value: free },
			{ id: "system_memory_usage_percent", value: Number(((100 * used) / total).toFixed(2)) },
			{ id: "system_uptime_seconds", value: Number(os.uptime().toFixed(1)) }
		];
	}
}
