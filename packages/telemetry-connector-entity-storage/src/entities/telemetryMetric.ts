// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { entity, property } from "@twin.org/entity";

/**
 * Class defining a telemetry metric.
 */
@entity()
export class TelemetryMetric {
	/**
	 * The id.
	 */
	@property({ type: "string", isPrimary: true })
	public id!: string;

	/**
	 * The label.
	 */
	@property({ type: "string", isSecondary: true })
	public label!: string;

	/**
	 * The type of the metric.
	 */
	@property({ type: "integer" })
	public type!: number;

	/**
	 * The unit.
	 */
	@property({ type: "string", optional: true })
	public unit?: string;

	/**
	 * The description.
	 */
	@property({ type: "string", optional: true })
	public description?: string;

	/**
	 * The maximum number of values to retain.
	 */
	@property({ type: "integer", optional: true })
	public maxHistory?: number;
}
