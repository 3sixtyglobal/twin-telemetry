// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryPrometheusReaderConfig } from "./IOpenTelemetryPrometheusReaderConfig.js";

/**
 * Discriminated union of all supported metric-reader configurations.
 * Add new members here when additional exporter types are implemented.
 */
export type IOpenTelemetryReaderConfig = IOpenTelemetryPrometheusReaderConfig;
// Future: | IOpenTelemetryOtlpReaderConfig | IOpenTelemetryConsoleReaderConfig
