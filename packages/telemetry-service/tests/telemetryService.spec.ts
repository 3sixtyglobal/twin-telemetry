// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory } from "@twin.org/core";
import { TelemetryConnectorFactory, type ITelemetryConnector } from "@twin.org/telemetry-models";
import { TelemetryService } from "../src/telemetryService.js";

describe("TelemetryService", () => {
	beforeEach(() => {
		ComponentFactory.register("platform", () => ({
			className: () => "mock-platform",
			isMultiTenant: () => false,
			execute: async (fn: () => Promise<void>) => fn(),
			getLocalOriginContext: async () => undefined
		}));
	});

	afterEach(() => {
		ComponentFactory.unregister("platform");
		TelemetryConnectorFactory.unregister("telemetry");
	});

	test("Can create an instance", async () => {
		TelemetryConnectorFactory.register("telemetry", () => ({}) as unknown as ITelemetryConnector);
		const service = new TelemetryService();
		expect(service).toBeDefined();
	});
});
