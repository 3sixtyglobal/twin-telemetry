// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The trim work accumulated for one metric while flushing a batch.
 */
export interface IPendingTrim {
	/**
	 * The metric id whose history is being trimmed.
	 */
	metricId: string;

	/**
	 * The maximum number of values to retain.
	 */
	maxHistory: number;

	/**
	 * The ids written by this flush, in ascending timestamp order.
	 */
	addedIds: string[];
}
