// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Factory } from "@twin.org/core";
import type { IMetricsProducer } from "../models/IMetricsProducer.js";

/**
 * Factory for `IMetricsProducer` implementations.
 *
 * The engine registers producers with `MetricsProducerFactory` during
 * initialisation. Third-party apps can also register their own producers
 * before `engine.start()` is called.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MetricsProducerFactory = Factory.createFactory<IMetricsProducer>("metrics-producer");
