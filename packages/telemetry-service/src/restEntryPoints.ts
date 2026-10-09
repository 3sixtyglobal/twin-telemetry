// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IRestRouteEntryPoint } from "@3sixty/api-models";
import { generateRestRoutesTelemetry, tagsTelemetry } from "./telemetryRoutes.js";

export const restEntryPoints: IRestRouteEntryPoint[] = [
	{
		name: "telemetry",
		defaultBaseRoute: "telemetry",
		tags: tagsTelemetry,
		generateRoutes: generateRestRoutesTelemetry
	}
];
