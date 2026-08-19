// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The types of readers.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const OpenTelemetryReaderTypes = {
	/**
	 * Prometheus.
	 */
	Prometheus: "prometheus",
	/**
	 * OTLP HTTP push exporter.
	 */
	OtlpHttp: "otlp-http"
} as const;

/**
 * The types of readers.
 */
export type OpenTelemetryReaderTypes =
	(typeof OpenTelemetryReaderTypes)[keyof typeof OpenTelemetryReaderTypes];
