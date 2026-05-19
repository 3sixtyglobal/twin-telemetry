// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MetricsProducerFactory, type IMetricsProducer } from "@twin.org/telemetry-models";
import { MetricsCollectorService } from "../src/metricsCollectorService.js";

function makeProducer(overrides: Partial<IMetricsProducer> = {}): IMetricsProducer {
	return {
		className: () => "mock",
		register: async () => {},
		collect: async () => {},
		...overrides
	};
}

describe("MetricsCollectorService", () => {
	beforeEach(() => {
		// Clear factory state between tests
		for (const name of MetricsProducerFactory.names()) {
			MetricsProducerFactory.unregister(name);
		}
	});

	describe("constructor", () => {
		test("accepts default interval", () => {
			expect(() => new MetricsCollectorService()).not.toThrow();
		});

		test("accepts positive interval", () => {
			expect(() => new MetricsCollectorService({ config: { intervalMs: 5000 } })).not.toThrow();
		});

		test("throws for zero interval", () => {
			expect(() => new MetricsCollectorService({ config: { intervalMs: 0 } })).toThrow(RangeError);
		});

		test("throws for negative interval", () => {
			expect(() => new MetricsCollectorService({ config: { intervalMs: -1 } })).toThrow(RangeError);
		});

		test("throws for NaN interval", () => {
			expect(() => new MetricsCollectorService({ config: { intervalMs: Number.NaN } })).toThrow(
				RangeError
			);
		});

		test("throws for Infinity interval", () => {
			expect(() => new MetricsCollectorService({ config: { intervalMs: Infinity } })).toThrow(
				RangeError
			);
		});
	});

	describe("start()", () => {
		test("registers and collects all discovered producers", async () => {
			const registered: string[] = [];
			const collected: string[] = [];
			MetricsProducerFactory.register("p1", () =>
				makeProducer({
					register: async () => {
						registered.push("p1");
					},
					collect: async () => {
						collected.push("p1");
					}
				})
			);
			MetricsProducerFactory.register("p2", () =>
				makeProducer({
					register: async () => {
						registered.push("p2");
					},
					collect: async () => {
						collected.push("p2");
					}
				})
			);

			const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
			await service.start();
			await service.stop();

			expect(registered).toEqual(["p1", "p2"]);
			expect(collected).toContain("p1");
			expect(collected).toContain("p2");
		});

		test("is idempotent — second call is a no-op", async () => {
			let registerCount = 0;
			MetricsProducerFactory.register("p1", () =>
				makeProducer({
					register: async () => {
						registerCount++;
					}
				})
			);

			const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
			await service.start();
			await service.start();
			await service.stop();

			expect(registerCount).toBe(1);
		});

		test("uses same instance for register and collect", async () => {
			const instanceIds: string[] = [];
			let idCounter = 0;
			MetricsProducerFactory.register("p1", () => {
				const id = String(++idCounter);
				return makeProducer({
					register: async () => {
						instanceIds.push(`register:${id}`);
					},
					collect: async () => {
						instanceIds.push(`collect:${id}`);
					}
				});
			});

			const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
			await service.start();
			await service.stop();

			// Both register and collect must use instance with the same id
			const registerInstance = instanceIds.find(e => e.startsWith("register:"))?.split(":")[1];
			const collectInstance = instanceIds.find(e => e.startsWith("collect:"))?.split(":")[1];
			expect(registerInstance).toBe(collectInstance);
		});
	});

	describe("stop()", () => {
		test("cancels the pending timer", async () => {
			const service = new MetricsCollectorService({ config: { intervalMs: 100 } });
			await service.start();
			await service.stop();
			// After stop, ticking manually should not throw
			await expect(service.tick()).resolves.toBeUndefined();
		});
	});

	describe("tick()", () => {
		test("continues collecting even when one producer throws", async () => {
			const collected: string[] = [];
			MetricsProducerFactory.register("bad", () =>
				makeProducer({
					collect: async () => {
						throw new Error("boom");
					}
				})
			);
			MetricsProducerFactory.register("good", () =>
				makeProducer({
					collect: async () => {
						collected.push("good");
					}
				})
			);

			const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
			await service.start();
			await service.stop();

			expect(collected).toContain("good");
		});
	});
});
