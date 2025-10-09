// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { TelemetryRestClient } from "../src/telemetryRestClient";

describe("TelemetryRestClient", () => {
	test("Can create an instance", async () => {
		const client = new TelemetryRestClient({ endpoint: "http://localhost:8080" });
		expect(client).toBeDefined();
	});
});
