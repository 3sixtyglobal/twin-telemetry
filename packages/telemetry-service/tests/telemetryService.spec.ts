// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { TelemetryConnectorFactory, type ITelemetryConnector } from "@twin.org/telemetry-models";
import { TelemetryService } from "../src/telemetryService.js";

describe("TelemetryService", () => {
	test("Can create an instance", async () => {
		TelemetryConnectorFactory.register("telemetry", () => ({}) as unknown as ITelemetryConnector);
		const service = new TelemetryService();
		expect(service).toBeDefined();
	});
});
