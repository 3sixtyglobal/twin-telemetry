// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import { BaseError, ComponentFactory } from "@twin.org/core";
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
	 * Platform component.
	 * @internal
	 */
	private readonly _platformComponent: IPlatformComponent;

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
	 * @throws {RangeError} If intervalMs is not a finite positive number.
	 */
	constructor(options?: IMetricsCollectorServiceConstructorOptions) {
		this._loggingComponent = ComponentFactory.getIfExists<ILoggingComponent>(
			options?.loggingComponentType
		);
		this._platformComponent = ComponentFactory.get<IPlatformComponent>(
			options?.platformComponentType ?? "platform"
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
	 * @returns A promise that resolves after the first collection tick has completed.
	 */
	public async start(): Promise<void> {
		if (this._running) {
			return;
		}
		this._running = true;

		const names = MetricsProducerFactory.names();
		const producers = names.map(name => MetricsProducerFactory.get(name));

		for (const producer of producers) {
			await this._platformComponent.execute(async () => producer.register());
		}

		await this.tick();
	}

	/**
	 * Stop the service and cancel the pending timer.
	 * @returns A promise that resolves when the service has stopped.
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
	 * @returns A promise that resolves when all producers have been polled and the next tick scheduled.
	 */
	public async tick(): Promise<void> {
		const names = MetricsProducerFactory.names();
		const producers = names.map(name => MetricsProducerFactory.get(name));

		for (const producer of producers) {
			try {
				await this._platformComponent.execute(async () => producer.collect());
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
	 * Schedule the next tick after the configured interval.
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
