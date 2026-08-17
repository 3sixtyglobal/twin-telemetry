// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MetricType, type ITelemetryMetric } from "@twin.org/telemetry-models";
import { TelemetryMetricIds } from "./telemetryMetricIds.js";

/**
 * Metrics registered by the metrics route processor.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const RestRequestsMetrics: ITelemetryMetric[] = [
	{ id: TelemetryMetricIds.RestRequests, label: "REST requests", type: MetricType.Counter }
];
