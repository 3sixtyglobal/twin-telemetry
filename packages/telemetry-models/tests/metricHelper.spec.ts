// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { AlreadyExistsError } from "@twin.org/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MetricHelper } from "../src/helpers/metricHelper.js";
import type { ITelemetryComponent } from "../src/models/ITelemetryComponent.js";
import type { ITelemetryMetric } from "../src/models/ITelemetryMetric.js";
import { MetricCounterOperation } from "../src/models/metricCounterOperation.js";
import { MetricType } from "../src/models/metricType.js";

const TEST_METRIC: ITelemetryMetric = {
	id: "test-metric",
	label: "Test Metric",
	type: MetricType.Counter
};

describe("MetricHelper", () => {
	let createMetricMock: ReturnType<typeof vi.fn>;
	let addMetricValueMock: ReturnType<typeof vi.fn>;
	let addMetricValuesMock: ReturnType<typeof vi.fn>;
	let mockComponent: ITelemetryComponent;

	beforeEach(() => {
		createMetricMock = vi.fn().mockResolvedValue(undefined);
		addMetricValueMock = vi.fn().mockResolvedValue("value-id");
		addMetricValuesMock = vi.fn().mockResolvedValue(["value-id"]);
		mockComponent = {
			CLASS_NAME: "MockTelemetryComponent",
			createMetric: createMetricMock,
			addMetricValue: addMetricValueMock,
			addMetricValues: addMetricValuesMock,
			getMetricValue: vi.fn(),
			getMetric: vi.fn(),
			updateMetric: vi.fn(),
			removeMetric: vi.fn(),
			query: vi.fn(),
			queryValues: vi.fn()
		} as unknown as ITelemetryComponent;
	});

	describe("createMetrics", () => {
		test("hands the whole set to the component in one call", async () => {
			await MetricHelper.createMetrics(mockComponent, [TEST_METRIC, TEST_METRIC]);

			expect(createMetricMock).toHaveBeenCalledOnce();
			expect(createMetricMock).toHaveBeenCalledWith([TEST_METRIC, TEST_METRIC]);
		});

		test("does nothing when there are no metrics", async () => {
			await MetricHelper.createMetrics(mockComponent, []);
			expect(createMetricMock).not.toHaveBeenCalled();
		});

		test("swallows an already exists error from the component", async () => {
			createMetricMock.mockRejectedValueOnce(
				new AlreadyExistsError("test", "metricAlreadyExists", TEST_METRIC.id)
			);

			await expect(
				MetricHelper.createMetrics(mockComponent, [TEST_METRIC])
			).resolves.toBeUndefined();
		});
	});

	describe("metricValues", () => {
		test("does nothing when telemetryComponent is undefined", async () => {
			await expect(
				MetricHelper.metricValues(undefined, [{ id: "a", value: 1 }])
			).resolves.toBeUndefined();
		});

		test("does nothing when there are no values", async () => {
			await MetricHelper.metricValues(mockComponent, []);
			expect(addMetricValuesMock).not.toHaveBeenCalled();
		});

		test("hands the whole set to the component in one call", async () => {
			const values = [
				{ id: "a", value: 1 },
				{ id: "b", value: MetricCounterOperation.Increment }
			];
			await MetricHelper.metricValues(mockComponent, values);

			expect(addMetricValuesMock).toHaveBeenCalledOnce();
			expect(addMetricValuesMock).toHaveBeenCalledWith(values);
			expect(addMetricValueMock).not.toHaveBeenCalled();
		});

		test("swallows errors and reports them to onError", async () => {
			addMetricValuesMock.mockRejectedValueOnce(new Error("telemetry down"));
			const onError = vi.fn();

			await expect(
				MetricHelper.metricValues(mockComponent, [{ id: "a", value: 1 }], onError)
			).resolves.toBeUndefined();
			expect(onError).toHaveBeenCalledOnce();
		});
	});

	describe("createMetric", () => {
		test("does nothing when telemetryComponent is undefined", async () => {
			await expect(MetricHelper.createMetric(undefined, TEST_METRIC)).resolves.toBeUndefined();
		});

		test("calls createMetric on the component with the metric", async () => {
			await MetricHelper.createMetric(mockComponent, TEST_METRIC);
			expect(createMetricMock).toHaveBeenCalledOnce();
			expect(createMetricMock).toHaveBeenCalledWith(TEST_METRIC);
		});

		test("swallows AlreadyExistsError", async () => {
			createMetricMock.mockRejectedValueOnce(
				new AlreadyExistsError("MetricHelper", "metric", "test-metric")
			);
			await expect(MetricHelper.createMetric(mockComponent, TEST_METRIC)).resolves.toBeUndefined();
		});

		test("rethrows non-AlreadyExistsError errors", async () => {
			const error = new Error("unexpected error");
			createMetricMock.mockRejectedValueOnce(error);
			await expect(MetricHelper.createMetric(mockComponent, TEST_METRIC)).rejects.toThrow(
				"unexpected error"
			);
		});
	});

	describe("metricIncrement", () => {
		test("does nothing when telemetryComponent is undefined", async () => {
			await expect(MetricHelper.metricIncrement(undefined, "test-id")).resolves.toBeUndefined();
		});

		test("calls addMetricValue with Increment operation", async () => {
			await MetricHelper.metricIncrement(mockComponent, "test-id");
			expect(addMetricValueMock).toHaveBeenCalledWith(
				"test-id",
				MetricCounterOperation.Increment,
				undefined
			);
		});

		test("passes customData to addMetricValue", async () => {
			const customData = { key: "value" };
			await MetricHelper.metricIncrement(mockComponent, "test-id", customData);
			expect(addMetricValueMock).toHaveBeenCalledWith(
				"test-id",
				MetricCounterOperation.Increment,
				customData
			);
		});

		test("swallows errors from addMetricValue", async () => {
			addMetricValueMock.mockRejectedValueOnce(new Error("telemetry error"));
			await expect(MetricHelper.metricIncrement(mockComponent, "test-id")).resolves.toBeUndefined();
		});

		test("invokes onError with the swallowed error", async () => {
			const error = new Error("telemetry error");
			addMetricValueMock.mockRejectedValueOnce(error);
			const onError = vi.fn();
			await MetricHelper.metricIncrement(mockComponent, "test-id", undefined, onError);
			expect(onError).toHaveBeenCalledWith(error);
		});

		test("does not invoke onError when addMetricValue succeeds", async () => {
			const onError = vi.fn();
			await MetricHelper.metricIncrement(mockComponent, "test-id", undefined, onError);
			expect(onError).not.toHaveBeenCalled();
		});

		test("swallows errors thrown by onError itself", async () => {
			addMetricValueMock.mockRejectedValueOnce(new Error("telemetry error"));
			const onError = vi.fn().mockRejectedValueOnce(new Error("onError blew up"));
			await expect(
				MetricHelper.metricIncrement(mockComponent, "test-id", undefined, onError)
			).resolves.toBeUndefined();
		});
	});

	describe("metricDecrement", () => {
		test("does nothing when telemetryComponent is undefined", async () => {
			await expect(MetricHelper.metricDecrement(undefined, "test-id")).resolves.toBeUndefined();
		});

		test("calls addMetricValue with Decrement operation", async () => {
			await MetricHelper.metricDecrement(mockComponent, "test-id");
			expect(addMetricValueMock).toHaveBeenCalledWith(
				"test-id",
				MetricCounterOperation.Decrement,
				undefined
			);
		});

		test("passes customData to addMetricValue", async () => {
			const customData = { key: "value" };
			await MetricHelper.metricDecrement(mockComponent, "test-id", customData);
			expect(addMetricValueMock).toHaveBeenCalledWith(
				"test-id",
				MetricCounterOperation.Decrement,
				customData
			);
		});

		test("swallows errors from addMetricValue", async () => {
			addMetricValueMock.mockRejectedValueOnce(new Error("telemetry error"));
			await expect(MetricHelper.metricDecrement(mockComponent, "test-id")).resolves.toBeUndefined();
		});

		test("invokes onError with the swallowed error", async () => {
			const error = new Error("telemetry error");
			addMetricValueMock.mockRejectedValueOnce(error);
			const onError = vi.fn();
			await MetricHelper.metricDecrement(mockComponent, "test-id", undefined, onError);
			expect(onError).toHaveBeenCalledWith(error);
		});
	});

	describe("metricValue", () => {
		test("does nothing when telemetryComponent is undefined", async () => {
			await expect(MetricHelper.metricValue(undefined, "test-id", 42)).resolves.toBeUndefined();
		});

		test("calls addMetricValue with the numeric value", async () => {
			await MetricHelper.metricValue(mockComponent, "test-id", 42);
			expect(addMetricValueMock).toHaveBeenCalledWith("test-id", 42, undefined);
		});

		test("passes customData to addMetricValue", async () => {
			const customData = { key: "value" };
			await MetricHelper.metricValue(mockComponent, "test-id", 42, customData);
			expect(addMetricValueMock).toHaveBeenCalledWith("test-id", 42, customData);
		});

		test("swallows errors from addMetricValue", async () => {
			addMetricValueMock.mockRejectedValueOnce(new Error("telemetry error"));
			await expect(MetricHelper.metricValue(mockComponent, "test-id", 42)).resolves.toBeUndefined();
		});

		test("invokes onError with the swallowed error", async () => {
			const error = new Error("telemetry error");
			addMetricValueMock.mockRejectedValueOnce(error);
			const onError = vi.fn();
			await MetricHelper.metricValue(mockComponent, "test-id", 42, undefined, onError);
			expect(onError).toHaveBeenCalledWith(error);
		});
	});
});
