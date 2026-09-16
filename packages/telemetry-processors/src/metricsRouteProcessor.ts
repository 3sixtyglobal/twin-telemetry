// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type {
	IBaseRoute,
	IBaseRouteProcessor,
	IHttpResponse,
	IHttpServerRequest
} from "@twin.org/api-models";
import { ContextIdStore, type IContextIds } from "@twin.org/context";
import { BaseError, Coerce, ComponentFactory, Is, JsonHelper, ObjectHelper } from "@twin.org/core";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	MetricCounterOperation,
	MetricHelper,
	type ITelemetryComponent,
	type ITelemetryMetricValueEntry
} from "@twin.org/telemetry-models";
import type { IMetricsRouteProcessorConstructorOptions } from "./models/IMetricsRouteProcessorConstructorOptions.js";
import type { IPendingMetricRecording } from "./models/IPendingMetricRecording.js";
import { RestRequestsMetrics } from "./models/restRequestsMetrics.js";
import { TelemetryMetricIds } from "./models/telemetryMetricIds.js";

/**
 * Route processor that records HTTP request counts after each request completes.
 * Emits a single counter labelled with the HTTP method, route template, and status class.
 * Raw request URLs are never used as labels to keep cardinality bounded.
 * Recording is queued off the response path, so the reply never waits for telemetry storage.
 */
export class MetricsRouteProcessor implements IBaseRouteProcessor {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MetricsRouteProcessor>();

	/**
	 * Default number of request values to retain.
	 */
	public static readonly DEFAULT_MAX_HISTORY: number = 10000;

	/**
	 * Default path prefixes excluded from metrics recording, the probe and info routes.
	 * The root entry is matched in full, so the routes below it are still recorded.
	 */
	public static readonly DEFAULT_EXCLUDE_PATHS: string[] = [
		"/",
		"/favicon.ico",
		"/spec",
		"/livez",
		"/readyz",
		"/info",
		"/health"
	];

	/**
	 * Default number of recordings queued before new ones are dropped.
	 */
	public static readonly DEFAULT_MAX_PENDING_RECORDINGS: number = 1000;

	/**
	 * Default interval in milliseconds between drains of the queue.
	 */
	public static readonly DEFAULT_DRAIN_INTERVAL_MS: number = 1000;

	/**
	 * Resolved telemetry component.
	 * @internal
	 */
	private readonly _telemetry?: ITelemetryComponent;

	/**
	 * The component for logging metric recording failures.
	 * @internal
	 */
	private readonly _logging?: ILoggingComponent;

	/**
	 * Paths excluded from metrics recording.
	 * @internal
	 */
	private readonly _excludePaths: string[];

	/**
	 * Maximum number of request values retained; 0 retains everything.
	 * @internal
	 */
	private readonly _maxHistory: number;

	/**
	 * Maximum number of recordings queued off the response path; 0 queues everything.
	 * @internal
	 */
	private readonly _maxPendingRecordings: number;

	/**
	 * Interval in milliseconds between drains of the queue.
	 * @internal
	 */
	private readonly _drainIntervalMs: number;

	/**
	 * Recordings queued but not yet handed to the telemetry component.
	 * @internal
	 */
	private readonly _pending: IPendingMetricRecording[];

	/**
	 * The timer which drains the queue.
	 * @internal
	 */
	private _drainTimer?: ReturnType<typeof setInterval>;

	/**
	 * Is a drain of the queue in progress.
	 * @internal
	 */
	private _isDraining: boolean;

	/**
	 * Number of recordings dropped since the last one that was recorded.
	 * @internal
	 */
	private _droppedRecordings: number;

	/**
	 * Create a new instance of MetricsRouteProcessor.
	 * @param options The options for the processor.
	 */
	constructor(options?: IMetricsRouteProcessorConstructorOptions) {
		this._telemetry = ComponentFactory.getIfExists<ITelemetryComponent>(
			options?.telemetryComponentType
		);
		this._logging = ComponentFactory.getIfExists<ILoggingComponent>(options?.loggingComponentType);
		this._excludePaths =
			options?.config?.excludePaths ?? MetricsRouteProcessor.DEFAULT_EXCLUDE_PATHS;

		const cfgMaxHistory =
			Coerce.integer(options?.config?.maxHistory) ?? MetricsRouteProcessor.DEFAULT_MAX_HISTORY;
		this._maxHistory = cfgMaxHistory > 0 ? cfgMaxHistory : 0;

		const cfgMaxPending =
			Coerce.integer(options?.config?.maxPendingRecordings) ??
			MetricsRouteProcessor.DEFAULT_MAX_PENDING_RECORDINGS;
		this._maxPendingRecordings = cfgMaxPending > 0 ? cfgMaxPending : 0;

		const cfgDrainInterval =
			Coerce.integer(options?.config?.drainIntervalMs) ??
			MetricsRouteProcessor.DEFAULT_DRAIN_INTERVAL_MS;
		this._drainIntervalMs =
			cfgDrainInterval > 0 ? cfgDrainInterval : MetricsRouteProcessor.DEFAULT_DRAIN_INTERVAL_MS;

		this._pending = [];
		this._isDraining = false;
		this._droppedRecordings = 0;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MetricsRouteProcessor.CLASS_NAME;
	}

	/**
	 * Register all REST request metrics and start the timer which drains the queued recordings.
	 * @returns A promise that resolves when all metrics have been registered.
	 */
	public async start(): Promise<void> {
		// Guarded so a second start cannot leave the first interval running.
		if (Is.undefined(this._telemetry) || !Is.undefined(this._drainTimer)) {
			return;
		}

		// A value is recorded for every request, so the history is capped.
		await MetricHelper.createMetrics(
			this._telemetry,
			RestRequestsMetrics.map(metric => ({
				...metric,
				maxHistory: this._maxHistory > 0 ? this._maxHistory : undefined
			}))
		);

		this._drainTimer = globalThis.setInterval(async () => {
			try {
				await this.drainPending();
			} catch (err) {
				await this.logDrainFailed(err);
			}
		}, this._drainIntervalMs);
	}

	/**
	 * Clear the drain timer and hand over the recordings which are still queued.
	 * When a drain is already running it finishes the batch it took, and anything queued after
	 * that is left unwritten rather than holding the shutdown open.
	 * @returns A promise that resolves when the queued recordings have been handed over.
	 */
	public async stop(): Promise<void> {
		if (!Is.undefined(this._drainTimer)) {
			globalThis.clearInterval(this._drainTimer);
			this._drainTimer = undefined;
		}

		await this.drainPending();
	}

	/**
	 * Queue a counter increment after the request completes.
	 * @param request The HTTP request.
	 * @param response The HTTP response.
	 * @param route The matched route definition, if any.
	 * @param contextIds The context IDs for the request.
	 * @param processorState Shared state for the current request processor chain.
	 */
	public async post(
		request: IHttpServerRequest,
		response: IHttpResponse,
		route: IBaseRoute | undefined,
		contextIds: IContextIds,
		processorState: { [id: string]: unknown }
	): Promise<void> {
		if (Is.undefined(this._telemetry)) {
			return;
		}

		const routePath = route?.path ?? "unknown";

		// Entries are prefixes, apart from the root which is matched in full.
		if (this._excludePaths.some(p => (p === "/" ? routePath === "/" : routePath.startsWith(p)))) {
			return;
		}

		if (this._maxPendingRecordings > 0 && this._pending.length >= this._maxPendingRecordings) {
			this._droppedRecordings++;
			return;
		}

		// The reply is sent once the post hooks resolve, so the recording is left for the drain
		// timer rather than written here.
		this._pending.push({
			contextIds: ObjectHelper.clone(contextIds),
			method: request.method ?? "unknown",
			route: routePath,
			statusCode: response.statusCode ?? 0,
			statusClass: this.toStatusClass(response.statusCode ?? 0)
		});
	}

	/**
	 * Hand the recordings queued so far to the telemetry component, batched by context.
	 * @returns A promise that resolves when those recordings have been handed over.
	 * @internal
	 */
	private async drainPending(): Promise<void> {
		// One drain at a time, so a telemetry component slower than the request rate is not
		// called concurrently by every tick of the timer.
		if (this._isDraining) {
			return;
		}
		this._isDraining = true;

		try {
			// Only the recordings queued so far are written, so requests arriving during the
			// drain extend the next one rather than this one.
			const recordings = this._pending.splice(0, this._pending.length);

			const dropped = this._droppedRecordings;
			this._droppedRecordings = 0;
			if (dropped > 0) {
				await this.logRecordsDropped(dropped);
			}

			const batches = new Map<
				string,
				{ contextIds: IContextIds; values: ITelemetryMetricValueEntry[] }
			>();
			for (const recording of recordings) {
				// Canonical key, so the same context ids group whatever order their keys are in.
				const key = JsonHelper.canonicalize(recording.contextIds);
				let batch = batches.get(key);
				if (Is.undefined(batch)) {
					batch = { contextIds: recording.contextIds, values: [] };
					batches.set(key, batch);
				}
				batch.values.push({
					id: TelemetryMetricIds.RestRequests,
					value: MetricCounterOperation.Increment,
					customData: {
						method: recording.method,
						route: recording.route,
						statusCode: recording.statusCode,
						statusClass: recording.statusClass
					}
				});
			}

			for (const batch of batches.values()) {
				// One call per context, so a tenant-less batch costs a single tenant query and
				// fan-out instead of one per request. Recorded in the requests' own context, and
				// a batch which fails is logged rather than re-queued, so nothing accumulates
				// while the component is unavailable.
				await ContextIdStore.run(batch.contextIds, async () =>
					MetricHelper.metricValues(this._telemetry, batch.values, async err =>
						this.logRecordsFailed(err, batch.values.length)
					)
				);
			}
		} finally {
			this._isDraining = false;
		}
	}

	/**
	 * Log that a batch of request metrics could not be recorded.
	 * @param err The error the telemetry component raised.
	 * @param count The number of metrics in the batch.
	 * @returns A promise that resolves when the entry has been logged.
	 * @internal
	 */
	private async logRecordsFailed(err: unknown, count: number): Promise<void> {
		await this._logging?.log({
			level: "warn",
			source: MetricsRouteProcessor.CLASS_NAME,
			ts: Date.now(),
			message: "metricRecordsFailed",
			error: BaseError.fromError(err),
			data: { count }
		});
	}

	/**
	 * Log that the queue could not be drained.
	 * @param err The error the drain raised.
	 * @returns A promise that resolves when the entry has been logged.
	 * @internal
	 */
	private async logDrainFailed(err: unknown): Promise<void> {
		await this._logging?.log({
			level: "warn",
			source: MetricsRouteProcessor.CLASS_NAME,
			ts: Date.now(),
			message: "metricDrainFailed",
			error: BaseError.fromError(err)
		});
	}

	/**
	 * Log the recordings dropped because the queue was full.
	 * @param count The number of recordings dropped.
	 * @returns A promise that resolves when the entry has been logged.
	 * @internal
	 */
	private async logRecordsDropped(count: number): Promise<void> {
		try {
			await this._logging?.log({
				level: "warn",
				source: MetricsRouteProcessor.CLASS_NAME,
				ts: Date.now(),
				message: "metricRecordsDropped",
				data: { count }
			});
		} catch {
			// Carried into the next recording rather than lost, and absorbed so a broken logging
			// component cannot reject the drain.
			this._droppedRecordings += count;
		}
	}

	/**
	 * Derive the status class label from a numeric HTTP status code.
	 * @param statusCode The HTTP status code.
	 * @returns The status class label (1xx, 2xx, 3xx, 4xx, 5xx, or unknown).
	 * @internal
	 */
	private toStatusClass(statusCode: number): string {
		if (statusCode >= 500) {
			return "5xx";
		}
		if (statusCode >= 400) {
			return "4xx";
		}
		if (statusCode >= 300) {
			return "3xx";
		}
		if (statusCode >= 200) {
			return "2xx";
		}
		if (statusCode >= 100) {
			return "1xx";
		}
		return "unknown";
	}
}
