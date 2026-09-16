// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import {
	BaseError,
	ComponentFactory,
	Guards,
	type IValidationFailure,
	Validation
} from "@twin.org/core";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	MetricHelper,
	MetricsProducerFactory,
	type IMetricsCollectorComponent,
	type ITelemetryComponent,
	type ITelemetryMetricValueEntry
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
	 * Telemetry component the collected values are recorded with.
	 * @internal
	 */
	private readonly _telemetryComponent?: ITelemetryComponent;

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
	 * @throws ValidationError If intervalMs is not a positive integer.
	 */
	constructor(options?: IMetricsCollectorServiceConstructorOptions) {
		this._loggingComponent = ComponentFactory.getIfExists<ILoggingComponent>(
			options?.loggingComponentType
		);
		this._platformComponent = ComponentFactory.get<IPlatformComponent>(
			options?.platformComponentType ?? "platform"
		);
		this._telemetryComponent = ComponentFactory.getIfExists<ITelemetryComponent>(
			options?.telemetryComponentType ?? "telemetry"
		);

		const intervalMs = options?.config?.intervalMs ?? 60_000;
		Guards.integer(MetricsCollectorService.CLASS_NAME, nameof(intervalMs), intervalMs);
		const failures: IValidationFailure[] = [];
		Validation.integer(nameof(intervalMs), intervalMs, failures, undefined, { minValue: 1 });
		Validation.asValidationError(
			MetricsCollectorService.CLASS_NAME,
			nameof<MetricsCollectorService>(),
			failures
		);
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
	 * The first collection tick fires immediately but does not block start() from returning.
	 * @returns A promise that resolves once producers are registered and the first tick is in flight.
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

		// Defer the first tick to the next event-loop turn so start() returns before any
		// collection work begins, keeping engine boot unblocked.
		this._timer = globalThis.setTimeout(async () => {
			await this.tick();
		}, 0);
	}

	/**
	 * Stop the service and cancel the pending timer.
	 * @returns A promise that resolves when the service has stopped.
	 */
	public async stop(): Promise<void> {
		if (this._running) {
			this._running = false;
			this.stopTimer();
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

		try {
			await this._platformComponent.execute(async () => {
				const values: ITelemetryMetricValueEntry[] = [];

				for (const producer of producers) {
					try {
						values.push(...(await producer.collect()));
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

				// The whole cycle is recorded in one call, so a connector which persists the values
				// writes them together instead of once per producer.
				await MetricHelper.metricValues(this._telemetryComponent, values, async err =>
					this._loggingComponent?.log({
						source: MetricsCollectorService.CLASS_NAME,
						level: "error",
						message: "metricRecordFailed",
						error: BaseError.fromError(err)
					})
				);
			});
		} catch (err) {
			await this._loggingComponent?.log({
				source: MetricsCollectorService.CLASS_NAME,
				level: "error",
				message: "collectionCycleFailed",
				error: BaseError.fromError(err)
			});
		}

		this.startTimer();
	}

	/**
	 * Schedule the next tick after the configured interval.
	 * @internal
	 */
	private startTimer(): void {
		if (this._running) {
			this.stopTimer();

			this._timer = globalThis.setTimeout(async () => {
				await this.tick();
			}, this._intervalMs);
		}
	}

	/**
	 * Stop the timer.
	 * @internal
	 */
	private stopTimer(): void {
		if (this._timer !== undefined) {
			globalThis.clearTimeout(this._timer);
			this._timer = undefined;
		}
	}
}
