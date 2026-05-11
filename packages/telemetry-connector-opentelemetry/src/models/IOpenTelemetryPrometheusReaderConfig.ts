// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { OpenTelemetryReaderTypes } from "./openTelemetryReaderTypes.js";

/**
 * Configuration for a Prometheus scrape-endpoint reader.
 * The connector instantiates a PrometheusExporter from these options in start().
 */
export interface IOpenTelemetryPrometheusReaderConfig {
	/**
	 * Type.
	 */
	type: typeof OpenTelemetryReaderTypes.Prometheus;

	/**
	 * TCP port the Prometheus HTTP server listens on.
	 * @default 9464
	 */
	port?: number;

	/**
	 * HTTP path that Prometheus scrapes.
	 * @default /metrics
	 */
	endpoint?: string;

	/**
	 * Whether to start the built-in HTTP server automatically.
	 * Set to false if you manage the server externally.
	 * @default true
	 */
	startServer?: boolean;

	/**
	 * Optional string prepended to every exported metric name.
	 */
	prefix?: string;
}
