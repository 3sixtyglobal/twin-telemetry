// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";

/**
 * Contract for a metrics producer.
 *
 * A producer declares its metrics with `register()` once and pushes current
 * values with `collect()` on every poll cycle. Producers are discovered via
 * `MetricsProducerFactory` and orchestrated by a `MetricsCollectorService`.
 *
 * Producers are factory-only entries — they are not lifecycle components of
 * the engine. The orchestrating service owns the polling timer.
 */
export interface IMetricsProducer extends IComponent {
	/**
	 * Register every metric this producer emits with the telemetry component.
	 * Called once when the orchestrating service starts.
	 * @returns A promise that resolves when all metrics have been registered.
	 */
	register(): Promise<void>;

	/**
	 * Push the current values for every metric this producer emits.
	 * Called on every poll cycle.
	 * @returns A promise that resolves when all metric values have been recorded.
	 */
	collect(): Promise<void>;
}
