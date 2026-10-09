// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Factory } from "@3sixty/core";
import type { ITelemetryConnector } from "../models/ITelemetryConnector.js";

/**
 * Factory for creating telemetry connectors.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const TelemetryConnectorFactory = Factory.createFactory<ITelemetryConnector>("telemetry");
