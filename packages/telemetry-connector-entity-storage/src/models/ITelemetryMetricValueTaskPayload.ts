// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITelemetryMetricValuePayload } from "./ITelemetryMetricValuePayload.js";

/**
 * The payload passed to the background thread which writes the metric values.
 */
export interface ITelemetryMetricValueTaskPayload {
	/**
	 * The metric values to write, omitted when the task only requests a flush.
	 */
	values?: ITelemetryMetricValuePayload[];

	/**
	 * Write any pending values to storage before the task completes.
	 */
	flush?: boolean;
}
