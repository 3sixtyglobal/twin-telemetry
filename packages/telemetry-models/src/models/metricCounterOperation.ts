// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The types of metric value operations for increment decrement counter metrics.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MetricCounterOperation = {
	/**
	 * Increment Counter.
	 */
	Increment: "inc",

	/**
	 * Decrement Counter.
	 */
	Decrement: "dec"
} as const;

/**
 * The types of metric counter operations.
 */
export type MetricCounterOperation =
	(typeof MetricCounterOperation)[keyof typeof MetricCounterOperation];
