// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@3sixty/context";
import { ComponentFactory } from "@3sixty/core";
import {
	MetricCounterOperation,
	TelemetryConnectorFactory,
	type ITelemetryConnector
} from "@3sixty/telemetry-models";
import { TelemetryService } from "../src/telemetryService.js";

const TENANT_IDS = ["tenant-a", "tenant-b"];

describe("TelemetryService", () => {
	afterEach(() => {
		ComponentFactory.unregister("platform");
		TelemetryConnectorFactory.unregister("telemetry");
	});

	describe("single-tenant platform", () => {
		beforeEach(() => {
			ComponentFactory.register("platform", () => ({
				className: () => "mock-platform",
				isMultiTenant: () => false,
				execute: async (fn: () => Promise<void>) => fn(),
				getLocalOriginContext: async () => undefined
			}));
		});

		test("Can create an instance", async () => {
			TelemetryConnectorFactory.register("telemetry", () => ({}) as unknown as ITelemetryConnector);
			const service = new TelemetryService();
			expect(service).toBeDefined();
		});

		test("addMetricValue makes a single connector call with no tenant fan-out", async () => {
			const calls: { contextIds: IContextIds | undefined }[] = [];
			TelemetryConnectorFactory.register(
				"telemetry",
				() =>
					({
						addMetricValue: async () => {
							calls.push({ contextIds: await ContextIdStore.getContextIds() });
							return "value-id";
						}
					}) as unknown as ITelemetryConnector
			);
			const service = new TelemetryService();

			await service.addMetricValue("rest_requests", MetricCounterOperation.Increment);

			expect(calls).toHaveLength(1);
		});
	});

	describe("multi-tenant platform", () => {
		beforeEach(() => {
			ComponentFactory.register("platform", () => ({
				className: () => "mock-platform",
				isMultiTenant: () => true,
				execute: async (fn: () => Promise<void>) => {
					for (const tenantId of TENANT_IDS) {
						await ContextIdStore.run({ [ContextIdKeys.Tenant]: tenantId }, fn);
					}
				},
				getLocalOriginContext: async () => undefined
			}));
		});

		test("addMetricValue fans out to every tenant when the context has no tenant", async () => {
			const calls: { contextIds: IContextIds | undefined }[] = [];
			TelemetryConnectorFactory.register(
				"telemetry",
				() =>
					({
						addMetricValue: async () => {
							calls.push({ contextIds: await ContextIdStore.getContextIds() });
							return "value-id";
						}
					}) as unknown as ITelemetryConnector
			);
			const service = new TelemetryService();

			await service.addMetricValue("rest_requests", MetricCounterOperation.Increment);

			expect(calls).toHaveLength(TENANT_IDS.length);
			expect(calls.map(c => c.contextIds?.[ContextIdKeys.Tenant])).toEqual(TENANT_IDS);
		});

		test("addMetricValue makes a single connector call when the context already has a tenant", async () => {
			const calls: { contextIds: IContextIds | undefined }[] = [];
			TelemetryConnectorFactory.register(
				"telemetry",
				() =>
					({
						addMetricValue: async () => {
							calls.push({ contextIds: await ContextIdStore.getContextIds() });
							return "value-id";
						}
					}) as unknown as ITelemetryConnector
			);
			const service = new TelemetryService();

			await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
				service.addMetricValue("rest_requests", MetricCounterOperation.Increment)
			);

			expect(calls).toHaveLength(1);
			expect(calls[0].contextIds?.[ContextIdKeys.Tenant]).toBe("tenant-a");
		});
	});
});
