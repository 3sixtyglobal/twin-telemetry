// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { GuardError } from "@twin.org/core";
import type { ITelemetryMetric, ITelemetryMetricValue } from "@twin.org/telemetry-models";
import { MetricCounterOperation, MetricType } from "@twin.org/telemetry-models";
import { HttpMethod } from "@twin.org/web";
import { TelemetryRestClient } from "../src/telemetryRestClient.js";
import {
	createdResponse,
	jsonResponse,
	noContentResponse,
	setupFetchMock,
	teardownFetchMock
} from "./helpers/restClientTestHelpers.js";

// OpenAPI spec: ../../telemetry-service/docs/open-api/spec.json
const ENDPOINT = "http://localhost:8080";
const PREFIX = "telemetry";

const TEST_METRIC: ITelemetryMetric = {
	id: "metric-001",
	label: "CPU Usage",
	type: MetricType.Gauge,
	description: "CPU usage percentage",
	unit: "percent"
};

const TEST_METRIC_VALUE: ITelemetryMetricValue = {
	id: "value-001",
	ts: 1700000000000,
	value: 42.5
};

const TEST_METRIC_2: ITelemetryMetric = {
	id: "metric-002",
	label: "Request Count",
	type: MetricType.Counter
};

const fetchMock = vi.fn();

describe("TelemetryRestClient", () => {
	let client: TelemetryRestClient;

	beforeEach(() => {
		setupFetchMock(fetchMock);
		client = new TelemetryRestClient({ endpoint: ENDPOINT });
	});

	afterEach(() => {
		teardownFetchMock(fetchMock);
	});

	describe("createMetric", () => {
		test("throws when metric is undefined", async () => {
			await expect(
				client.createMetric(undefined as unknown as ITelemetryMetric)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.undefined"
			});
		});

		test("sends several metrics in a single request", async () => {
			fetchMock.mockResolvedValueOnce(createdResponse("metric-001"));

			await client.createMetric([TEST_METRIC, { ...TEST_METRIC, id: "metric-002" }]);

			// The route accepts an array, so a batch is one request rather than one per metric.
			expect(fetchMock).toHaveBeenCalledOnce();
			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric`);
			expect(options.method).toBe(HttpMethod.POST);
			const body = JSON.parse(options.body);
			expect(body.map((entry: { id: string }) => entry.id)).toEqual(["metric-001", "metric-002"]);
		});

		test("sends POST to /telemetry/metric", async () => {
			fetchMock.mockResolvedValueOnce(createdResponse("metric-001"));

			await client.createMetric(TEST_METRIC);

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric`);
			expect(options.method).toBe(HttpMethod.POST);
		});

		test("sends metric fields in the request body", async () => {
			fetchMock.mockResolvedValueOnce(createdResponse("metric-001"));

			await client.createMetric(TEST_METRIC);

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.id).toBe("metric-001");
			expect(body.label).toBe("CPU Usage");
			expect(body.type).toBe(MetricType.Gauge);
			expect(body.description).toBe("CPU usage percentage");
			expect(body.unit).toBe("percent");
		});

		test("resolves without a return value", async () => {
			fetchMock.mockResolvedValueOnce(createdResponse("metric-001"));

			await expect(client.createMetric(TEST_METRIC)).resolves.toBeUndefined();
		});
	});

	describe("getMetric", () => {
		test("throws when id is empty", async () => {
			await expect(client.getMetric("")).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends GET to /telemetry/metric/:id", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ metric: TEST_METRIC, value: TEST_METRIC_VALUE })
			);

			await client.getMetric("metric-001");

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric/metric-001`);
			expect(options.method).toBe(HttpMethod.GET);
		});

		test("returns the metric and value from the response body", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ metric: TEST_METRIC, value: TEST_METRIC_VALUE })
			);

			const result = await client.getMetric("metric-001");

			expect(result.metric).toEqual(TEST_METRIC);
			expect(result.value).toEqual(TEST_METRIC_VALUE);
		});
	});

	describe("getMetricValue", () => {
		test("throws when id is empty", async () => {
			await expect(client.getMetricValue("", "value-001")).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("throws when valueId is empty", async () => {
			await expect(client.getMetricValue("metric-001", "")).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends GET to /telemetry/metric/:id/value/:valueId", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_METRIC_VALUE));

			await client.getMetricValue("metric-001", "value-001");

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric/metric-001/value/value-001`);
			expect(options.method).toBe(HttpMethod.GET);
		});

		test("returns the metric value from the response body", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_METRIC_VALUE));

			const result = await client.getMetricValue("metric-001", "value-001");

			expect(result).toEqual(TEST_METRIC_VALUE);
		});
	});

	describe("updateMetric", () => {
		test("throws when metric is undefined", async () => {
			await expect(
				client.updateMetric(undefined as unknown as Omit<ITelemetryMetric, "type">)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.objectUndefined"
			});
		});

		test("throws when metric.id is empty", async () => {
			await expect(client.updateMetric({ id: "", label: "CPU Usage" })).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends PUT to /telemetry/metric/:id", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await client.updateMetric({
				id: "metric-001",
				label: "Updated CPU",
				description: "Updated",
				unit: "%"
			});

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric/metric-001`);
			expect(options.method).toBe(HttpMethod.PUT);
		});

		test("sends label, description, and unit in the request body", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await client.updateMetric({
				id: "metric-001",
				label: "Updated CPU",
				description: "Updated description",
				unit: "%"
			});

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.label).toBe("Updated CPU");
			expect(body.description).toBe("Updated description");
			expect(body.unit).toBe("%");
		});

		test("resolves without a return value", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await expect(
				client.updateMetric({ id: "metric-001", label: "Updated CPU" })
			).resolves.toBeUndefined();
		});
	});

	describe("addMetricValue", () => {
		test("throws when id is empty", async () => {
			await expect(client.addMetricValue("", 42)).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends POST to /telemetry/metric/:id/value", async () => {
			fetchMock.mockResolvedValueOnce(
				createdResponse(`${PREFIX}/metric/metric-001/value/value-001`)
			);

			await client.addMetricValue("metric-001", 42);

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric/metric-001/value`);
			expect(options.method).toBe(HttpMethod.POST);
		});

		test("sends numeric value in the request body", async () => {
			fetchMock.mockResolvedValueOnce(
				createdResponse(`${PREFIX}/metric/metric-001/value/value-001`)
			);

			await client.addMetricValue("metric-001", 42);

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.value).toBe(42);
		});

		test("sends MetricCounterOperation value in the request body", async () => {
			fetchMock.mockResolvedValueOnce(
				createdResponse(`${PREFIX}/metric/metric-001/value/value-001`)
			);

			await client.addMetricValue("metric-001", MetricCounterOperation.Increment);

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.value).toBe(MetricCounterOperation.Increment);
		});

		test("sends customData in the request body when provided", async () => {
			fetchMock.mockResolvedValueOnce(
				createdResponse(`${PREFIX}/metric/metric-001/value/value-001`)
			);

			await client.addMetricValue("metric-001", 42, { source: "test-host" });

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.customData).toEqual({ source: "test-host" });
		});

		test("returns the location header value", async () => {
			fetchMock.mockResolvedValueOnce(
				createdResponse(`${PREFIX}/metric/metric-001/value/value-001`)
			);

			const result = await client.addMetricValue("metric-001", 42);

			expect(result).toBe("value-001");
		});
	});

	describe("removeMetric", () => {
		test("throws when id is empty", async () => {
			await expect(client.removeMetric("")).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends DELETE to /telemetry/metric/:id", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await client.removeMetric("metric-001");

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric/metric-001`);
			expect(options.method).toBe(HttpMethod.DELETE);
		});

		test("resolves without a return value", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await expect(client.removeMetric("metric-001")).resolves.toBeUndefined();
		});
	});

	describe("query", () => {
		test("sends GET to /telemetry/metric", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [TEST_METRIC, TEST_METRIC_2] }));

			await client.query();

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}/metric`);
			expect(options.method).toBe(HttpMethod.GET);
		});

		test("sends type as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [TEST_METRIC] }));

			await client.query(MetricType.Gauge);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain(`type=${MetricType.Gauge}`);
		});

		test("sends cursor as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [] }));

			await client.query(undefined, "page2");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("cursor=page2");
		});

		test("sends limit as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [] }));

			await client.query(undefined, undefined, 10);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("limit=10");
		});

		test("returns entities from the response body", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [TEST_METRIC, TEST_METRIC_2] }));

			const result = await client.query();

			expect(result.entities).toEqual([TEST_METRIC, TEST_METRIC_2]);
		});

		test("returns undefined cursor when no cursor in response", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ entities: [TEST_METRIC] }));

			const result = await client.query();

			expect(result.cursor).toBeUndefined();
		});

		test("returns cursor from the response body when present", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ entities: [TEST_METRIC], cursor: "next-page" })
			);

			const result = await client.query();

			expect(result.cursor).toBe("next-page");
		});
	});

	describe("queryValues", () => {
		test("throws when id is empty", async () => {
			await expect(client.queryValues("")).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.stringEmpty"
			});
		});

		test("sends GET to /telemetry/metric/:id/value", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ metric: TEST_METRIC, entities: [TEST_METRIC_VALUE] })
			);

			await client.queryValues("metric-001");

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toContain(`${ENDPOINT}/${PREFIX}/metric/metric-001/value`);
			expect(options.method).toBe(HttpMethod.GET);
		});

		test("sends timeStart as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ metric: TEST_METRIC, entities: [] }));

			await client.queryValues("metric-001", 1700000000000);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("timeStart=1700000000000");
		});

		test("sends timeEnd as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ metric: TEST_METRIC, entities: [] }));

			await client.queryValues("metric-001", undefined, 1700001000000);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("timeEnd=1700001000000");
		});

		test("sends cursor as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ metric: TEST_METRIC, entities: [] }));

			await client.queryValues("metric-001", undefined, undefined, "page2");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("cursor=page2");
		});

		test("sends limit as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ metric: TEST_METRIC, entities: [] }));

			await client.queryValues("metric-001", undefined, undefined, undefined, 20);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("limit=20");
		});

		test("returns metric and entities from the response body", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ metric: TEST_METRIC, entities: [TEST_METRIC_VALUE] })
			);

			const result = await client.queryValues("metric-001");

			expect(result.metric).toEqual(TEST_METRIC);
			expect(result.entities).toEqual([TEST_METRIC_VALUE]);
		});

		test("returns undefined cursor when no cursor in response", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ metric: TEST_METRIC, entities: [] }));

			const result = await client.queryValues("metric-001");

			expect(result.cursor).toBeUndefined();
		});

		test("returns cursor from the response body when present", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ metric: TEST_METRIC, entities: [TEST_METRIC_VALUE], cursor: "next-page" })
			);

			const result = await client.queryValues("metric-001");

			expect(result.cursor).toBe("next-page");
		});
	});
});
