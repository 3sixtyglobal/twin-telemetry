// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type {
	IBaseRoute,
	IBaseRouteProcessor,
	IHttpResponse,
	IHttpServerRequest
} from "@twin.org/api-models";
import type { IContextIds } from "@twin.org/context";
import { ComponentFactory, Is } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import { MetricHelper, type ITelemetryComponent } from "@twin.org/telemetry-models";
import type { IMetricsRouteProcessorConstructorOptions } from "./models/IMetricsRouteProcessorConstructorOptions.js";
import { RestRequestsMetrics } from "./models/restRequestsMetrics.js";
import { TelemetryMetricIds } from "./models/telemetryMetricIds.js";

/**
 * Route processor that records HTTP request counts after each request completes.
 * Emits a single counter labelled with the HTTP method, route template, and status class.
 * Raw request URLs are never used as labels to keep cardinality bounded.
 */
export class MetricsRouteProcessor implements IBaseRouteProcessor {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MetricsRouteProcessor>();

	/**
	 * Resolved telemetry component.
	 * @internal
	 */
	private readonly _telemetry?: ITelemetryComponent;

	/**
	 * Paths excluded from metrics recording.
	 * @internal
	 */
	private readonly _excludePaths: string[];

	/**
	 * Create a new instance of MetricsRouteProcessor.
	 * @param options The options for the processor.
	 */
	constructor(options?: IMetricsRouteProcessorConstructorOptions) {
		this._telemetry = ComponentFactory.getIfExists<ITelemetryComponent>(
			options?.telemetryComponentType
		);
		this._excludePaths = options?.config?.excludePaths ?? [];
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MetricsRouteProcessor.CLASS_NAME;
	}

	/**
	 * Register all REST request metrics with the telemetry component.
	 * @returns A promise that resolves when all metrics have been registered.
	 */
	public async start(): Promise<void> {
		if (Is.undefined(this._telemetry)) {
			return;
		}

		await MetricHelper.createMetrics(this._telemetry, RestRequestsMetrics);
	}

	/**
	 * Record a counter increment after the request completes.
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

		if (this._excludePaths.some(p => routePath.startsWith(p))) {
			return;
		}

		await MetricHelper.metricIncrement(this._telemetry, TelemetryMetricIds.RestRequests, {
			method: request.method ?? "unknown",
			route: routePath,
			statusCode: response.statusCode ?? 0,
			statusClass: this.toStatusClass(response.statusCode ?? 0)
		});
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
