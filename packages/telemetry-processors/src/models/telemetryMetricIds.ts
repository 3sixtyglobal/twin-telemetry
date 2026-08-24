// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Metric IDs emitted by telemetry-processors.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const TelemetryMetricIds = {
	/**
	 * Total number of REST requests received.
	 */
	RestRequests: "rest_requests"
} as const;

/**
 * Metric IDs emitted by telemetry-processors.
 */
export type TelemetryMetricIds = (typeof TelemetryMetricIds)[keyof typeof TelemetryMetricIds];
