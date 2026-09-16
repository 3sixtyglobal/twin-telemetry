// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdStore } from "@twin.org/context";
import { Guards, Is } from "@twin.org/core";
import { ModuleHelper } from "@twin.org/modules";
import { nameof } from "@twin.org/nameof";
import type { TelemetryMetric } from "./entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import { MetricValueWriter } from "./metricValueWriter.js";
import type { ITelemetryMetricValueTaskPayload } from "./models/ITelemetryMetricValueTaskPayload.js";
import type { ITelemetryMetricValueWriterConfig } from "./models/ITelemetryMetricValueWriterConfig.js";

const TELEMETRY_METRIC_VALUE_TASK_SOURCE = "telemetryMetricValueTask";

let engine:
	| {
			start: () => Promise<void>;
			stop: () => Promise<void>;
	  }
	| undefined;

let writer: MetricValueWriter | undefined;

// Serialises concurrent startup+task dispatch: Node.js EventEmitter doesn't await async
// listeners, so telemetryMetricValueTaskStart and telemetryMetricValueTask can run
// concurrently in the worker thread.
let startupPromise: Promise<void> | undefined;

// Kept so a startup retried from a task uses the settings the connector sent when the worker
// started, rather than silently falling back to the writer defaults.
let writerConfig: ITelemetryMetricValueWriterConfig | undefined;

/**
 * Telemetry Metric Value Task Startup Method.
 * @param engineCloneData Engine clone data used to initialise a worker-thread engine instance.
 * @param config The writer configuration, supplied once by the connector when the worker starts.
 * @returns A promise that resolves when the engine has started and is ready to process tasks.
 */
export async function telemetryMetricValueTaskStart(
	engineCloneData: unknown,
	config?: ITelemetryMetricValueWriterConfig
): Promise<void> {
	// A startup retried from a task has no config of its own, so the last one supplied is kept.
	if (!Is.empty(config)) {
		writerConfig = config;
	}

	startupPromise = (async () => {
		if (!Is.empty(engineCloneData)) {
			engine = await ModuleHelper.execModuleMethod<{
				start: () => Promise<void>;
				stop: () => Promise<void>;
			}>("@twin.org/engine-core", "EngineCoreBuilder.fromClone", [
				"engine",
				engineCloneData,
				await ContextIdStore.getContextIds(),
				{
					logLevel: "error",
					// The thread only writes metric values and logs, so the clone is limited to the
					// storage those need rather than rebuilding the whole engine per worker.
					// The telemetry connector is included because its initialiser is what registers the
					// metric and metric value entity storage connectors. The background task component is
					// deliberately left out: the cloned connector must not register a task handler of its
					// own, which would let the worker spawn further workers.
					types: [
						"loggingComponent",
						"loggingConnector",
						"entityStorageConnector",
						"telemetryConnector",
						"platformComponent"
					],
					entityTypes: [
						nameof<TelemetryMetric>(),
						nameof<TelemetryMetricValue>(),
						"LogEntry",
						"LogEntryError"
					]
				}
			]);
			await engine.start();
		}

		// The storage connectors are only available once the engine clone has started, so the
		// writer is created here rather than when the module is loaded. It is only published
		// once it has started: a writer with no storage resolved accepts values and drops them.
		const metricValueWriter = new MetricValueWriter();
		await metricValueWriter.start(writerConfig);
		writer = metricValueWriter;
	})();

	try {
		await startupPromise;
	} catch (err) {
		// A rejected promise must not be left behind: every task awaits it, so a failed startup
		// would fail every task for the life of the worker instead of being retried by one.
		startupPromise = undefined;
		throw err;
	}
}

/**
 * Telemetry Metric Value Task End.
 * @returns A promise that resolves when the pending values have been written and the engine has stopped.
 */
export async function telemetryMetricValueTaskEnd(): Promise<void> {
	if (!Is.empty(writer)) {
		await writer.stop();
		writer = undefined;
	}
	if (!Is.empty(engine)) {
		await engine.stop();
		engine = undefined;
	}
	startupPromise = undefined;
}

/**
 * Telemetry Metric Value Task.
 * @param engineCloneData Engine clone data used to initialise a worker-thread engine instance.
 * @param payload The metric values to queue, and whether the pending values should be written.
 * @returns A promise that resolves when the value has been queued and any requested write is complete.
 */
export async function telemetryMetricValueTask(
	engineCloneData: unknown,
	payload: ITelemetryMetricValueTaskPayload
): Promise<void> {
	// startupPromise is assigned as the first synchronous statement of
	// telemetryMetricValueTaskStart (before any await) and MessagePort dispatch is FIFO, so it
	// is always set by the time this runs when both messages are dispatched from the same
	// worker initialisation sequence.
	if (startupPromise) {
		try {
			await startupPromise;
		} catch {
			// The startup left no writer behind, which is what the retry below handles; failing
			// here instead would fail this task and every task after it. The error surfaces from
			// the retry when it cannot be recovered.
			startupPromise = undefined;
		}
	}

	Guards.objectValue<ITelemetryMetricValueTaskPayload>(
		TELEMETRY_METRIC_VALUE_TASK_SOURCE,
		nameof(payload),
		payload
	);

	// The startup method always creates the writer, so this covers a task arriving on a worker
	// whose initialisation was skipped, and one whose initialisation failed.
	if (Is.empty(writer)) {
		await telemetryMetricValueTaskStart(engineCloneData, writerConfig);
	}

	// The startup either leaves the writer set or throws, so it is always present from here.
	const metricValueWriter = writer as MetricValueWriter;

	if (Is.arrayValue(payload.values)) {
		for (const value of payload.values) {
			Guards.stringValue(TELEMETRY_METRIC_VALUE_TASK_SOURCE, nameof(value.valueId), value.valueId);
			Guards.stringValue(
				TELEMETRY_METRIC_VALUE_TASK_SOURCE,
				nameof(value.metricId),
				value.metricId
			);
		}
		await metricValueWriter.add(payload.values);
	}

	if (payload.flush ?? false) {
		await metricValueWriter.flush();
	}
}
