// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { OpenTelemetryReaderTypes } from "./openTelemetryReaderTypes.js";

/**
 * Configuration for an OTLP HTTP push exporter reader.
 * The connector instantiates an OTLPMetricExporter wrapped in a PeriodicExportingMetricReader.
 */
export interface IOpenTelemetryOtlpHttpReaderConfig {
	/**
	 * Type.
	 */
	type: typeof OpenTelemetryReaderTypes.OtlpHttp;

	/**
	 * The OTLP HTTP endpoint URL to push metrics to.
	 * @default http://localhost:4318/v1/metrics
	 */
	url?: string;

	/**
	 * How often metrics are exported, in milliseconds.
	 * @default 60000
	 */
	exportIntervalMs?: number;

	/**
	 * Optional HTTP headers included in every export request.
	 */
	headers?: { [key: string]: string };
}
