// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IBaseRoute, IHttpServerRequest } from "@twin.org/api-models";
import { ComponentFactory } from "@twin.org/core";
import { MetricCounterOperation, type ITelemetryComponent } from "@twin.org/telemetry-models";
import { HttpMethod, HttpStatusCode } from "@twin.org/web";
import { MetricsRouteProcessor } from "../src/metricsRouteProcessor.js";
import { TelemetryMetricIds } from "../src/models/telemetryMetricIds.js";

describe("MetricsRouteProcessor", () => {
	let capturedCalls: { id: string; value: unknown; customData?: { [key: string]: unknown } }[];
	let processor: MetricsRouteProcessor;

	function makeTelemetry(): ITelemetryComponent {
		return {
			className: () => "mockTelemetry",
			createMetric: async () => {},
			addMetricValue: async (
				id: string,
				value: unknown,
				customData?: { [key: string]: unknown }
			) => {
				capturedCalls.push({ id, value, customData });
				return "valueId";
			}
		} as unknown as ITelemetryComponent;
	}

	function makeRequest(url: string, method: HttpMethod = HttpMethod.GET): IHttpServerRequest {
		return { url, method };
	}

	function makeRoute(path: string): IBaseRoute {
		return { operationId: "testOp", path };
	}

	beforeEach(async () => {
		capturedCalls = [];
		ComponentFactory.register("telemetry", () => makeTelemetry());
		processor = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
		await processor.start();
	});

	describe("counter labelling", () => {
		test("records exactly one increment per request", async () => {
			await processor.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			expect(capturedCalls).toHaveLength(1);
			expect(capturedCalls[0].id).toBe(TelemetryMetricIds.RestRequests);
			expect(capturedCalls[0].value).toBe(MetricCounterOperation.Increment);
		});

		test("carries method, route, statusCode, and statusClass labels", async () => {
			await processor.post(
				makeRequest("/api/v1/items/abc123", HttpMethod.POST),
				{ statusCode: HttpStatusCode.created },
				makeRoute("/api/v1/items/:id"),
				{},
				{}
			);
			expect(capturedCalls[0].customData).toEqual({
				method: "POST",
				route: "/api/v1/items/:id",
				statusCode: HttpStatusCode.created,
				statusClass: "2xx"
			});
		});

		test("uses the route template path not the raw request url as the route label", async () => {
			await processor.post(
				makeRequest("/api/v1/items/abc123"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items/:id"),
				{},
				{}
			);
			expect(capturedCalls[0].customData?.route).toBe("/api/v1/items/:id");
		});

		test("uses 'unknown' route when no matching route is provided", async () => {
			await processor.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.notFound },
				undefined,
				{},
				{}
			);
			expect(capturedCalls[0].customData?.route).toBe("unknown");
		});

		test("uses 'unknown' method when method is absent from the request", async () => {
			await processor.post(
				{ url: "/api/v1/items" } as IHttpServerRequest,
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			expect(capturedCalls[0].customData?.method).toBe("unknown");
		});
	});

	describe("statusClass label", () => {
		test.each([
			[100, "1xx"],
			[200, "2xx"],
			[204, "2xx"],
			[301, "3xx"],
			[400, "4xx"],
			[404, "4xx"],
			[500, "5xx"],
			[503, "5xx"]
		])("status %i maps to class '%s'", async (statusCode, expectedClass) => {
			await processor.post(
				makeRequest("/api/v1/items"),
				{ statusCode: statusCode as HttpStatusCode },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			expect(capturedCalls[0].customData?.statusClass).toBe(expectedClass);
			capturedCalls.length = 0;
		});

		test("absent status code maps to 'unknown'", async () => {
			await processor.post(makeRequest("/api/v1/items"), {}, makeRoute("/api/v1/items"), {}, {});
			expect(capturedCalls[0].customData?.statusClass).toBe("unknown");
		});
	});

	describe("path exclusion", () => {
		test("does not record when route.path matches an excluded prefix", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { excludePaths: ["/metrics"] }
			});
			await proc.start();
			await proc.post(
				makeRequest("/metrics"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/metrics"),
				{},
				{}
			);
			expect(capturedCalls).toHaveLength(0);
		});

		test("still records for non-excluded route paths", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { excludePaths: ["/metrics"] }
			});
			await proc.start();
			await proc.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			expect(capturedCalls).toHaveLength(1);
		});
	});

	describe("edge cases", () => {
		test("does not record when no telemetry component is registered", async () => {
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "unregistered-type" });
			await proc.start();
			await proc.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			expect(capturedCalls).toHaveLength(0);
		});
	});
});
