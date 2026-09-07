// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The in-memory state held for a metric so writes avoid reading storage.
 */
export interface ILastMetricValue {
	/**
	 * The timestamp of the last computed value.
	 */
	ts: number;

	/**
	 * The last computed value.
	 */
	value: number;

	/**
	 * The time the value was last written, used to expire metrics that have gone idle.
	 */
	accessed: number;

	/**
	 * The retained value ids in ascending timestamp order, present once the history has been
	 * tracked for a metric with a maxHistory cap small enough to hold in memory.
	 */
	historyIds?: string[];
}
