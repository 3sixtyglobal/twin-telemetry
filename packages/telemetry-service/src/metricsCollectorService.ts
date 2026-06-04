// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITenantComponent } from "@twin.org/api-models";
import { BaseError, ComponentFactory, Is } from "@twin.org/core";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type IMetricsCollectorComponent,
	MetricsProducerFactory
} from "@twin.org/telemetry-models";
import type { IMetricsCollectorServiceConstructorOptions } from "./models/IMetricsCollectorServiceConstructorOptions.js";

/**
 * Collects metrics from registered producers at a fixed interval.
 */
export class MetricsCollectorService implements IMetricsCollectorComponent {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MetricsCollectorService>();

	/**
	 * Resolved logging component for internal use.
	 * @internal
	 */
	private readonly _loggingComponent?: ILoggingComponent;

	/**
	 * Tenant component if configured.
	 * @internal
	 */
	private readonly _tenantComponent?: ITenantComponent;

	/**
	 * Polling interval in milliseconds.
	 * @internal
	 */
	private readonly _intervalMs: number;

	/**
	 * Pending scheduled tick handle.
	 * @internal
	 */
	private _timer: ReturnType<typeof globalThis.setTimeout> | undefined;

	/**
	 * Whether the service is currently running.
	 * @internal
	 */
	private _running: boolean;

	/**
	 * Create a new instance of MetricsCollectorService.
	 * @param options The options for the service.
	 */
	constructor(options?: IMetricsCollectorServiceConstructorOptions) {
		this._loggingComponent = ComponentFactory.getIfExists<ILoggingComponent>(
			options?.loggingComponentType ?? "logging"
		);
		this._tenantComponent = ComponentFactory.getIfExists<ITenantComponent>(
			options?.tenantComponentType ?? "tenant"
		);

		const intervalMs = options?.config?.intervalMs ?? 60_000;
		if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
			throw new RangeError(`intervalMs must be a finite positive number, got ${intervalMs}`);
		}
		this._intervalMs = intervalMs;
		this._running = false;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MetricsCollectorService.CLASS_NAME;
	}

	/**
	 * Start the service: register all producers and begin the polling cycle.
	 */
	public async start(): Promise<void> {
		if (this._running) {
			return;
		}
		this._running = true;

		const names = MetricsProducerFactory.names();
		const producers = names.map(name => MetricsProducerFactory.get(name));

		for (const producer of producers) {
			if (!Is.empty(this._tenantComponent)) {
				await this._tenantComponent.runPerTenant(async () => producer.register());
			} else {
				await producer.register();
			}
		}

		await this.tick();
	}

	/**
	 * Stop the service and cancel the pending timer.
	 */
	public async stop(): Promise<void> {
		this._running = false;
		if (this._timer !== undefined) {
			globalThis.clearTimeout(this._timer);
			this._timer = undefined;
		}
	}

	/**
	 * One collection cycle across all registered producers.
	 * Public so tests can drive it deterministically.
	 */
	public async tick(): Promise<void> {
		const names = MetricsProducerFactory.names();
		const producers = names.map(name => MetricsProducerFactory.get(name));

		for (const producer of producers) {
			try {
				if (!Is.empty(this._tenantComponent)) {
					await this._tenantComponent.runPerTenant(async () => producer.collect());
				} else {
					await producer.collect();
				}
			} catch (err) {
				await this._loggingComponent?.log({
					source: MetricsCollectorService.CLASS_NAME,
					level: "error",
					message: "producerCollectionFailed",
					data: {
						producer: producer.className()
					},
					error: BaseError.fromError(err)
				});
			}
		}

		this.scheduleNext();
	}

	/**
	 * Schedule the next tick. Re-schedules itself after each tick completes.
	 * @internal
	 */
	private scheduleNext(): void {
		if (this._running) {
			this._timer = globalThis.setTimeout(async () => {
				await this.tick();
			}, this._intervalMs);
		}
	}
}
