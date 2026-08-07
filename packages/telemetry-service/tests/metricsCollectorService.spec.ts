// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import { ComponentFactory } from "@twin.org/core";
import { MetricsProducerFactory, type IMetricsProducer } from "@twin.org/telemetry-models";
import { MetricsCollectorService } from "../src/metricsCollectorService.js";

const DEFAULT_PLATFORM_TYPE = "platform";
const CUSTOM_PLATFORM_TYPE = "test-platform-component";

function makeProducer(overrides: Partial<IMetricsProducer> = {}): IMetricsProducer {
	return {
		className: () => "mock",
		register: async () => {},
		collect: async () => {},
		...overrides
	};
}

function makePlatformComponent(
	isMultiTenant: boolean,
	execute: (fn: () => Promise<void>) => Promise<void>
): IPlatformComponent {
	return {
		className: () => "mock-platform-component",
		isMultiTenant: () => isMultiTenant,
		execute,
		getLocalOriginContext: async () => undefined
	};
}

function makeSingleTenantPassthrough(): IPlatformComponent {
	return makePlatformComponent(false, async fn => fn());
}

describe("MetricsCollectorService", () => {
	beforeEach(() => {
		for (const name of MetricsProducerFactory.names()) {
			MetricsProducerFactory.unregister(name);
		}
		// Always provide a default platform component so the service can be constructed.
		ComponentFactory.register(DEFAULT_PLATFORM_TYPE, makeSingleTenantPassthrough);
	});

	afterEach(() => {
		try {
			ComponentFactory.unregister(DEFAULT_PLATFORM_TYPE);
		} catch {}
		try {
			ComponentFactory.unregister(CUSTOM_PLATFORM_TYPE);
		} catch {}
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
		test("registers all discovered producers", async () => {
			const registered: string[] = [];
			MetricsProducerFactory.register("p1", () =>
				makeProducer({
					register: async () => {
						registered.push("p1");
					}
				})
			);
			MetricsProducerFactory.register("p2", () =>
				makeProducer({
					register: async () => {
						registered.push("p2");
					}
				})
			);

			const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
			await service.start();
			await service.stop();

			expect(registered).toEqual(["p1", "p2"]);
		});

		test("is idempotent - second call is a no-op", async () => {
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

		test("uses same producer instance for register and collect", async () => {
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
			await service.tick();
			await service.stop();

			const registerInstance = instanceIds.find(e => e.startsWith("register:"))?.split(":")[1];
			const collectInstance = instanceIds.find(e => e.startsWith("collect:"))?.split(":")[1];
			expect(registerInstance).toBe(collectInstance);
		});

		test("registers producers via run() for each tenant in multi-tenant mode", async () => {
			const registered: string[] = [];

			ComponentFactory.register(CUSTOM_PLATFORM_TYPE, () =>
				makePlatformComponent(true, async fn => {
					await fn(); // tenant A
					await fn(); // tenant B
				})
			);

			MetricsProducerFactory.register("p1", () =>
				makeProducer({
					register: async () => {
						registered.push("p1");
					}
				})
			);

			const service = new MetricsCollectorService({
				config: { intervalMs: 60_000 },
				platformComponentType: CUSTOM_PLATFORM_TYPE
			});
			await service.start();
			await service.stop();

			expect(registered).toHaveLength(2);
		});

		test("skips register when multi-tenant and no active tenant", async () => {
			const registered: string[] = [];

			ComponentFactory.register(CUSTOM_PLATFORM_TYPE, () =>
				makePlatformComponent(true, async () => {
					// no tenants active - fn is never called
				})
			);

			MetricsProducerFactory.register("p1", () =>
				makeProducer({
					register: async () => {
						registered.push("p1");
					}
				})
			);

			const service = new MetricsCollectorService({
				config: { intervalMs: 60_000 },
				platformComponentType: CUSTOM_PLATFORM_TYPE
			});
			await service.start();
			await service.stop();

			expect(registered).toHaveLength(0);
		});
	});

	describe("stop()", () => {
		test("cancels the pending timer", async () => {
			const service = new MetricsCollectorService({ config: { intervalMs: 100 } });
			await service.start();
			await service.stop();
			await expect(service.tick()).resolves.toBeUndefined();
		});
	});

	describe("tick()", () => {
		describe("single-tenant mode", () => {
			test("calls collect via run() once per producer", async () => {
				const collected: string[] = [];
				MetricsProducerFactory.register("p1", () =>
					makeProducer({
						collect: async () => {
							collected.push("p1");
						}
					})
				);
				MetricsProducerFactory.register("p2", () =>
					makeProducer({
						collect: async () => {
							collected.push("p2");
						}
					})
				);

				const service = new MetricsCollectorService({ config: { intervalMs: 60_000 } });
				await service.tick();

				expect(collected).toContain("p1");
				expect(collected).toContain("p2");
			});

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
				await service.tick();

				expect(collected).toContain("good");
			});
		});

		describe("multi-tenant mode", () => {
			test("calls collect once per active tenant for each producer", async () => {
				const collectCalls: string[] = [];

				ComponentFactory.register(CUSTOM_PLATFORM_TYPE, () =>
					makePlatformComponent(true, async fn => {
						await fn(); // tenant A
						await fn(); // tenant B
					})
				);

				MetricsProducerFactory.register("p1", () =>
					makeProducer({
						collect: async () => {
							collectCalls.push("p1");
						}
					})
				);

				const service = new MetricsCollectorService({
					config: { intervalMs: 60_000 },
					platformComponentType: CUSTOM_PLATFORM_TYPE
				});
				await service.tick();

				expect(collectCalls.filter(c => c === "p1")).toHaveLength(2);
			});

			test("skips collection when no active tenant", async () => {
				const collectCalls: string[] = [];

				ComponentFactory.register(CUSTOM_PLATFORM_TYPE, () =>
					makePlatformComponent(true, async () => {
						// no active tenants - fn is never invoked
					})
				);

				MetricsProducerFactory.register("p1", () =>
					makeProducer({
						collect: async () => {
							collectCalls.push("p1");
						}
					})
				);

				const service = new MetricsCollectorService({
					config: { intervalMs: 60_000 },
					platformComponentType: CUSTOM_PLATFORM_TYPE
				});
				await service.tick();

				expect(collectCalls).toHaveLength(0);
			});

			test("continues collecting remaining producers when one throws", async () => {
				const collected: string[] = [];

				ComponentFactory.register(CUSTOM_PLATFORM_TYPE, () =>
					makePlatformComponent(true, async fn => {
						await fn();
					})
				);

				MetricsProducerFactory.register("bad", () =>
					makeProducer({
						collect: async () => {
							throw new Error("tenant error");
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

				const service = new MetricsCollectorService({
					config: { intervalMs: 60_000 },
					platformComponentType: CUSTOM_PLATFORM_TYPE
				});
				await service.tick();

				expect(collected).toContain("good");
			});
		});
	});
});
