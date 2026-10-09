// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

// A handler whose task never completes, so the worker stays busy for good. This is the state
// the scheduler cannot recover from on its own: it goes on waiting for the one worker it
// believes is working, so nothing is dispatched for the task type again.
export { telemetryMetricValueTaskEnd } from '@3sixty/telemetry-connector-entity-storage';

/**
 * Start the task, doing nothing at all.
 * @returns A promise that resolves immediately.
 */
export async function telemetryMetricValueTaskStart() {}

/**
 * Take the task and never complete it.
 * @returns A promise that never resolves.
 */
export async function telemetryMetricValueTask() {
	return new Promise(() => {});
}
