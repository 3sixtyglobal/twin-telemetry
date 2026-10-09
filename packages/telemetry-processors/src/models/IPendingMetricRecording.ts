// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IContextIds } from "@3sixty/context";

/**
 * A request metric queued by the metrics route processor, waiting to be handed to the
 * telemetry component.
 */
export interface IPendingMetricRecording {
	/**
	 * The context IDs of the request, used to record the metric in that request's context.
	 */
	contextIds: IContextIds;

	/**
	 * The HTTP method of the request.
	 */
	method: string;

	/**
	 * The route template path of the request.
	 */
	route: string;

	/**
	 * The HTTP status code of the response.
	 */
	statusCode: number;

	/**
	 * The status class of the response.
	 */
	statusClass: string;
}
