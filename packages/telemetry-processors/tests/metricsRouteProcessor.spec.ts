// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IBaseRoute, IHttpServerRequest } from "@twin.org/api-models";
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import { ComponentFactory } from "@twin.org/core";
import type { ILogEntry, ILoggingComponent } from "@twin.org/logging-models";
import {
	MetricCounterOperation,
	type ITelemetryComponent,
	type ITelemetryMetric,
	type ITelemetryMetricValueEntry
} from "@twin.org/telemetry-models";
import { HttpMethod, HttpStatusCode } from "@twin.org/web";
import { MetricsRouteProcessor } from "../src/metricsRouteProcessor.js";
import { TelemetryMetricIds } from "../src/models/telemetryMetricIds.js";

describe("MetricsRouteProcessor", () => {
	let capturedBatches: ITelemetryMetricValueEntry[][];
	let capturedValues: ITelemetryMetricValueEntry[];
	let capturedMetrics: ITelemetryMetric[];
	let capturedLogs: ILogEntry[];
	let processor: MetricsRouteProcessor;
	let gates: (() => void)[] = [];
	let inFlight = 0;
	let maxInFlight = 0;

	async function sleep(ms: number): Promise<void> {
		return new Promise<void>(resolve => {
			setTimeout(resolve, ms);
		});
	}

	function captureBatch(values: ITelemetryMetricValueEntry[]): string[] {
		capturedBatches.push(values);
		capturedValues.push(...values);
		return values.map(() => "valueId");
	}

	function makeTelemetry(): ITelemetryComponent {
		return {
			className: () => "mockTelemetry",
			createMetric: async (metric: ITelemetryMetric | ITelemetryMetric[]) => {
				capturedMetrics.push(...(Array.isArray(metric) ? metric : [metric]));
			},
			addMetricValues: async (values: ITelemetryMetricValueEntry[]) => captureBatch(values)
		} as unknown as ITelemetryComponent;
	}

	function makeSlowTelemetry(delayMs: number): ITelemetryComponent {
		return {
			className: () => "mockTelemetry",
			createMetric: async () => {},
			addMetricValues: async (values: ITelemetryMetricValueEntry[]) => {
				await sleep(delayMs);
				return captureBatch(values);
			}
		} as unknown as ITelemetryComponent;
	}

	function makeGatedTelemetry(): ITelemetryComponent {
		return {
			className: () => "mockTelemetry",
			createMetric: async () => {},
			addMetricValues: async (values: ITelemetryMetricValueEntry[]) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise<void>(resolve => {
					gates.push(resolve);
				});
				inFlight--;
				return captureBatch(values);
			}
		} as unknown as ITelemetryComponent;
	}

	function releaseGates(): void {
		for (const gate of gates.splice(0, gates.length)) {
			gate();
		}
	}

	function makeFailingTelemetry(): ITelemetryComponent {
		return {
			className: () => "mockTelemetry",
			createMetric: async () => {},
			addMetricValues: async () => {
				throw new Error("contextIdMissing");
			}
		} as unknown as ITelemetryComponent;
	}

	function makeRequest(url: string, method: HttpMethod = HttpMethod.GET): IHttpServerRequest {
		return { url, method };
	}

	function makeRoute(path: string, flags?: Partial<IBaseRoute>): IBaseRoute {
		return { operationId: "testOp", path, ...flags };
	}

	function makeLogging(): ILoggingComponent {
		return {
			className: () => "mockLogging",
			log: async (entry: ILogEntry) => {
				capturedLogs.push(entry);
			}
		} as unknown as ILoggingComponent;
	}

	async function postItems(
		proc: MetricsRouteProcessor,
		count: number,
		contextIds: IContextIds = {}
	): Promise<void> {
		for (let i = 0; i < count; i++) {
			await proc.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				contextIds,
				{}
			);
		}
	}

	beforeEach(async () => {
		capturedBatches = [];
		capturedValues = [];
		capturedMetrics = [];
		capturedLogs = [];
		gates = [];
		inFlight = 0;
		maxInFlight = 0;
		ComponentFactory.register("telemetry", () => makeTelemetry());
		ComponentFactory.register("logging", () => makeLogging());
		processor = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
		await processor.start();
	});

	afterEach(async () => {
		// Clears the drain timer started by start.
		await processor.stop();
	});

	describe("metric registration", () => {
		test("caps the request history so the table stays bounded", async () => {
			// A value is recorded per request, so an uncapped history grows without bound.
			expect(capturedMetrics).toHaveLength(1);
			expect(capturedMetrics[0].id).toEqual(TelemetryMetricIds.RestRequests);
			expect(capturedMetrics[0].maxHistory).toEqual(MetricsRouteProcessor.DEFAULT_MAX_HISTORY);
		});

		test("uses the configured history cap", async () => {
			capturedMetrics = [];
			const capped = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { maxHistory: 25 }
			});
			await capped.start();
			await capped.stop();

			expect(capturedMetrics[0].maxHistory).toEqual(25);
		});

		test("retains everything when the cap is disabled", async () => {
			capturedMetrics = [];
			const uncapped = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { maxHistory: 0 }
			});
			await uncapped.start();
			await uncapped.stop();

			expect(capturedMetrics[0].maxHistory).toBeUndefined();
		});
	});

	describe("counter labelling", () => {
		test("records exactly one increment per request", async () => {
			await postItems(processor, 1);
			await processor.stop();

			expect(capturedValues).toHaveLength(1);
			expect(capturedValues[0].id).toBe(TelemetryMetricIds.RestRequests);
			expect(capturedValues[0].value).toBe(MetricCounterOperation.Increment);
		});

		test("carries method, route, statusCode, and statusClass labels", async () => {
			await processor.post(
				makeRequest("/api/v1/items/abc123", HttpMethod.POST),
				{ statusCode: HttpStatusCode.created },
				makeRoute("/api/v1/items/:id"),
				{},
				{}
			);
			await processor.stop();

			expect(capturedValues[0].customData).toEqual({
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
			await processor.stop();

			expect(capturedValues[0].customData?.route).toBe("/api/v1/items/:id");
		});

		test("uses 'unknown' route when no matching route is provided", async () => {
			await processor.post(
				makeRequest("/api/v1/items"),
				{ statusCode: HttpStatusCode.notFound },
				undefined,
				{},
				{}
			);
			await processor.stop();

			expect(capturedValues[0].customData?.route).toBe("unknown");
		});

		test("uses 'unknown' method when method is absent from the request", async () => {
			await processor.post(
				{ url: "/api/v1/items" } as IHttpServerRequest,
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/api/v1/items"),
				{},
				{}
			);
			await processor.stop();

			expect(capturedValues[0].customData?.method).toBe("unknown");
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
			await processor.stop();

			expect(capturedValues[0].customData?.statusClass).toBe(expectedClass);
			capturedValues.length = 0;
		});

		test("absent status code maps to 'unknown'", async () => {
			await processor.post(makeRequest("/api/v1/items"), {}, makeRoute("/api/v1/items"), {}, {});
			await processor.stop();

			expect(capturedValues[0].customData?.statusClass).toBe("unknown");
		});
	});

	describe("response path (issue #127)", () => {
		test("post resolves without waiting for the telemetry write", async () => {
			// The web server sends the reply once the post hooks resolve, so awaiting the write
			// would floor every response with telemetry storage latency.
			ComponentFactory.register("telemetry", () => makeSlowTelemetry(50));
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 1);

			expect(capturedValues).toHaveLength(0);

			await proc.stop();

			expect(capturedValues).toHaveLength(1);
		});

		test("hands the queue over on the drain interval, without waiting for stop", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { drainIntervalMs: 20 }
			});
			await proc.start();

			await postItems(proc, 1);
			expect(capturedValues).toHaveLength(0);

			await sleep(100);

			expect(capturedValues).toHaveLength(1);
			await proc.stop();
		});

		test("stop hands over every recording queued by the requests before it", async () => {
			await postItems(processor, 5);
			await processor.stop();

			expect(capturedValues).toHaveLength(5);
		});

		test("records each queued request in the context of that request", async () => {
			// One loop drains recordings from many requests, so each carries its own context ids
			// rather than inheriting those of whichever request started the drain.
			const seen: (IContextIds | undefined)[] = [];
			ComponentFactory.register(
				"telemetry",
				() =>
					({
						className: () => "mockTelemetry",
						createMetric: async () => {},
						addMetricValues: async (values: ITelemetryMetricValueEntry[]) => {
							seen.push(await ContextIdStore.getContextIds());
							return captureBatch(values);
						}
					}) as unknown as ITelemetryComponent
			);
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 1, { [ContextIdKeys.Tenant]: "tenant-1" });
			await postItems(proc, 1, { [ContextIdKeys.Tenant]: "tenant-2" });
			await proc.stop();

			expect(seen).toEqual([
				{ [ContextIdKeys.Tenant]: "tenant-1" },
				{ [ContextIdKeys.Tenant]: "tenant-2" }
			]);
		});

		test("writes only the recordings queued when the drain started", async () => {
			// A drain that kept taking new arrivals would never finish on a busy node.
			ComponentFactory.register("telemetry", () => makeSlowTelemetry(50));
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 1);
			const draining = proc.stop();
			await postItems(proc, 1);
			await draining;

			expect(capturedBatches).toHaveLength(1);
			expect(capturedBatches[0]).toHaveLength(1);

			await proc.stop();

			expect(capturedBatches).toHaveLength(2);
			expect(capturedBatches[1]).toHaveLength(1);
		});
	});

	describe("batching", () => {
		test("hands the whole queue over in a single call", async () => {
			await postItems(processor, 5);
			await processor.stop();

			expect(capturedBatches).toHaveLength(1);
			expect(capturedBatches[0]).toHaveLength(5);
		});

		test("uses one call per set of context ids", async () => {
			await postItems(processor, 2, { [ContextIdKeys.Tenant]: "tenant-1" });
			await postItems(processor, 3, { [ContextIdKeys.Tenant]: "tenant-2" });
			await postItems(processor, 1, { [ContextIdKeys.Tenant]: "tenant-1" });
			await processor.stop();

			expect(capturedBatches).toHaveLength(2);
			expect(capturedBatches[0]).toHaveLength(3);
			expect(capturedBatches[1]).toHaveLength(3);
		});

		test("groups the same context ids whatever order their keys are in", async () => {
			await postItems(processor, 1, {
				[ContextIdKeys.Node]: "node-1",
				[ContextIdKeys.Tenant]: "tenant-1"
			});
			await postItems(processor, 1, {
				[ContextIdKeys.Tenant]: "tenant-1",
				[ContextIdKeys.Node]: "node-1"
			});
			await processor.stop();

			expect(capturedBatches).toHaveLength(1);
			expect(capturedBatches[0]).toHaveLength(2);
		});

		test("does not call the telemetry component when nothing is queued", async () => {
			await processor.stop();

			expect(capturedBatches).toHaveLength(0);
		});
	});

	describe("overloaded telemetry component", () => {
		test("keeps the queue at the cap while a write is in flight", async () => {
			ComponentFactory.register("telemetry", () => makeGatedTelemetry());
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging",
				config: { maxPendingRecordings: 10, drainIntervalMs: 10 }
			});
			await proc.start();

			await postItems(proc, 1);
			await sleep(40);

			// The drain is now blocked inside the component, so the queue takes 10 and no more.
			await postItems(proc, 50);

			releaseGates();
			await sleep(40);
			releaseGates();
			await proc.stop();

			expect(capturedValues).toHaveLength(11);
			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].message).toBe("metricRecordsDropped");
			expect(capturedLogs[0].data).toEqual({ count: 40 });
		});

		test("accounts for every request as either recorded or dropped", async () => {
			ComponentFactory.register("telemetry", () => makeGatedTelemetry());
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging",
				config: { maxPendingRecordings: 5, drainIntervalMs: 10 }
			});
			await proc.start();

			const posted = 60;
			for (let round = 0; round < 6; round++) {
				await postItems(proc, 10);
				await sleep(20);
				releaseGates();
			}
			await sleep(20);
			releaseGates();
			await proc.stop();
			releaseGates();

			const dropped = capturedLogs
				.filter(entry => entry.message === "metricRecordsDropped")
				.reduce((total, entry) => total + Number(entry.data?.count ?? 0), 0);

			expect(capturedValues.length + dropped).toEqual(posted);
		});

		test("does not call the component again while a write is in flight", async () => {
			ComponentFactory.register("telemetry", () => makeGatedTelemetry());
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { drainIntervalMs: 10 }
			});
			await proc.start();

			await postItems(proc, 1);
			await sleep(60);
			await postItems(proc, 5);
			await sleep(60);

			// Every tick in that window found a drain in progress and did nothing.
			expect(maxInFlight).toBe(1);
			expect(inFlight).toBe(1);

			releaseGates();
			await sleep(40);
			releaseGates();
			await proc.stop();
			releaseGates();
		});

		test("keeps draining after a batch fails, without retrying it", async () => {
			// Re-queueing a failed batch would grow the queue for as long as the component is down.
			let failNext = true;
			ComponentFactory.register(
				"telemetry",
				() =>
					({
						className: () => "mockTelemetry",
						createMetric: async () => {},
						addMetricValues: async (values: ITelemetryMetricValueEntry[]) => {
							if (failNext) {
								failNext = false;
								throw new Error("storageUnavailable");
							}
							return captureBatch(values);
						}
					}) as unknown as ITelemetryComponent
			);
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging"
			});
			await proc.start();

			await postItems(proc, 3);
			await proc.stop();

			expect(capturedValues).toHaveLength(0);
			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].level).toBe("warn");
			expect(capturedLogs[0].message).toBe("metricRecordsFailed");
			expect(capturedLogs[0].data).toEqual({ count: 3 });

			await postItems(proc, 2);
			await proc.stop();

			// The failed values are gone rather than retried, so only the new ones arrive.
			expect(capturedValues).toHaveLength(2);
		});

		test("logs one warning per failing batch rather than per request", async () => {
			ComponentFactory.register("telemetry", () => makeFailingTelemetry());
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging"
			});
			await proc.start();

			await postItems(proc, 50);
			await proc.stop();

			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].data).toEqual({ count: 50 });
		});

		test("reports each drop count once", async () => {
			ComponentFactory.register("telemetry", () => makeSlowTelemetry(5));
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging",
				config: { maxPendingRecordings: 2 }
			});
			await proc.start();

			await postItems(proc, 5);
			await proc.stop();
			await proc.stop();

			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].data).toEqual({ count: 3 });
		});

		test("hands a large queue over in a single call", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { maxPendingRecordings: 5000 }
			});
			await proc.start();

			await postItems(proc, 2000);
			await proc.stop();

			expect(capturedBatches).toHaveLength(1);
			expect(capturedBatches[0]).toHaveLength(2000);
		});

		test("keeps the batch count at one per context under a mixed tenant load", async () => {
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			for (let i = 0; i < 100; i++) {
				await postItems(proc, 1, { [ContextIdKeys.Tenant]: `tenant-${i % 4}` });
			}
			await proc.stop();

			expect(capturedBatches).toHaveLength(4);
			expect(capturedValues).toHaveLength(100);
			for (const batch of capturedBatches) {
				expect(batch).toHaveLength(25);
			}
		});

		test("overlapping stops do not write a recording twice", async () => {
			ComponentFactory.register("telemetry", () => makeSlowTelemetry(30));
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 4);
			await Promise.all([proc.stop(), proc.stop(), proc.stop()]);

			expect(capturedBatches).toHaveLength(1);
			expect(capturedValues).toHaveLength(4);
		});
	});

	describe("queue cap", () => {
		test("drops recordings once the queue is full instead of growing without bound", async () => {
			ComponentFactory.register("telemetry", () => makeSlowTelemetry(20));
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging",
				config: { maxPendingRecordings: 1 }
			});
			await proc.start();

			await postItems(proc, 4);
			await proc.stop();

			// Only the queued recording is handed over, and the drop count is reported by the
			// drain rather than on the response path.
			expect(capturedValues).toHaveLength(1);
			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].level).toBe("warn");
			expect(capturedLogs[0].message).toBe("metricRecordsDropped");
			expect(capturedLogs[0].data).toEqual({ count: 3 });
		});

		test("queues everything when the cap is disabled", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { maxPendingRecordings: 0 }
			});
			await proc.start();

			await postItems(proc, 10);
			await proc.stop();

			expect(capturedValues).toHaveLength(10);
		});
	});

	describe("path exclusion", () => {
		test.each(MetricsRouteProcessor.DEFAULT_EXCLUDE_PATHS)(
			"does not record '%s' by default",
			async path => {
				await processor.post(
					makeRequest(path),
					{ statusCode: HttpStatusCode.ok },
					makeRoute(path),
					{},
					{}
				);
				await processor.stop();

				expect(capturedValues).toHaveLength(0);
			}
		);

		test("records the routes which are not excluded by default", async () => {
			await postItems(processor, 1);
			await processor.stop();

			expect(capturedValues).toHaveLength(1);
		});

		test.each(["/api/v1/items", "/authentication/login", "/logging/entries"])(
			"matches the excluded root in full so '%s' is still recorded",
			async path => {
				// The root is in the default list; treating it as a prefix would exclude every
				// route the node serves and silence the counter completely.
				await processor.post(
					makeRequest(path),
					{ statusCode: HttpStatusCode.ok },
					makeRoute(path),
					{},
					{}
				);
				await processor.stop();

				expect(capturedValues).toHaveLength(1);
			}
		);

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
			await proc.stop();

			expect(capturedValues).toHaveLength(0);
		});

		test("still records for non-excluded route paths", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { excludePaths: ["/metrics"] }
			});
			await proc.start();
			await postItems(proc, 1);
			await proc.stop();

			expect(capturedValues).toHaveLength(1);
		});

		test("configured paths replace the defaults", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { excludePaths: ["/metrics"] }
			});
			await proc.start();
			await proc.post(
				makeRequest("/livez"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/livez"),
				{},
				{}
			);
			await proc.stop();

			expect(capturedValues).toHaveLength(1);
		});

		test("an empty list records every route", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { excludePaths: [] }
			});
			await proc.start();
			await proc.post(
				makeRequest("/readyz"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/readyz"),
				{},
				{}
			);
			await proc.stop();

			expect(capturedValues).toHaveLength(1);
		});
	});

	describe("edge cases", () => {
		test("does not record when no telemetry component is registered", async () => {
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "unregistered-type" });
			await proc.start();
			await postItems(proc, 1);
			await proc.stop();

			expect(capturedValues).toHaveLength(0);
		});

		test("does not throw when the telemetry component rejects the batch", async () => {
			ComponentFactory.register("telemetry", () => makeFailingTelemetry());
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 1);

			await expect(proc.stop()).resolves.toBeUndefined();
		});

		test("does not throw when the logging component rejects the failure entry", async () => {
			ComponentFactory.register("telemetry", () => makeFailingTelemetry());
			ComponentFactory.register(
				"logging",
				() =>
					({
						className: () => "mockLogging",
						log: async () => {
							throw new Error("loggingUnavailable");
						}
					}) as unknown as ILoggingComponent
			);
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging"
			});
			await proc.start();

			await postItems(proc, 1);

			await expect(proc.stop()).resolves.toBeUndefined();
		});

		test("stop resolves when no request has been recorded", async () => {
			await expect(processor.stop()).resolves.toBeUndefined();
		});

		test("a second start does not leave a second drain timer running", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				config: { drainIntervalMs: 10 }
			});
			await proc.start();
			await proc.start();
			await proc.stop();

			// A leaked interval would keep draining after stop had cleared the one it knows about.
			await postItems(proc, 1);
			await sleep(60);

			expect(capturedValues).toHaveLength(0);
		});
	});

	describe("recording failure visibility", () => {
		test("logs a warning when the batch fails and a logging component is registered", async () => {
			ComponentFactory.register("telemetry", () => makeFailingTelemetry());
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging"
			});
			await proc.start();

			await postItems(proc, 3);
			await proc.stop();

			expect(capturedLogs).toHaveLength(1);
			expect(capturedLogs[0].level).toBe("warn");
			expect(capturedLogs[0].message).toBe("metricRecordsFailed");
			expect(capturedLogs[0].data).toEqual({ count: 3 });
		});

		test("does not log when the batch succeeds", async () => {
			const proc = new MetricsRouteProcessor({
				telemetryComponentType: "telemetry",
				loggingComponentType: "logging"
			});
			await proc.start();

			await postItems(proc, 1);
			await proc.stop();

			expect(capturedLogs).toHaveLength(0);
		});

		test("does not throw when the batch fails and no logging component is registered", async () => {
			ComponentFactory.register("telemetry", () => makeFailingTelemetry());
			const proc = new MetricsRouteProcessor({ telemetryComponentType: "telemetry" });
			await proc.start();

			await postItems(proc, 1);

			await expect(proc.stop()).resolves.toBeUndefined();
		});
	});

	describe("tenant-less routes (issue #109)", () => {
		test("still attempts to record for a route marked skipTenant", async () => {
			// skipTenant routes include real business traffic whose tenant is resolved inside the
			// service layer (e.g. federated-catalogue's dataset routes), not just probes - so the
			// processor must not special-case the flag. Fan-out for the tenant-less case is
			// TelemetryService's responsibility (see telemetryService.spec.ts), not this processor's.
			await processor.post(
				makeRequest("/federated-catalogue/data-resource-entry"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/federated-catalogue/data-resource-entry", {
					skipTenant: true,
					skipAuth: true
				}),
				{},
				{}
			);
			await processor.stop();

			expect(capturedValues).toHaveLength(1);
		});

		test("still records for a skipAuth route that is not skipTenant (DSP-style route)", async () => {
			await processor.post(
				makeRequest("/dataspace/transfers/request"),
				{ statusCode: HttpStatusCode.ok },
				makeRoute("/dataspace/transfers/request", { skipAuth: true }),
				{},
				{}
			);
			await processor.stop();

			expect(capturedValues).toHaveLength(1);
		});
	});
});
