// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	AlreadyExistsError,
	Coerce,
	ComponentFactory,
	Converter,
	GeneralError,
	Guards,
	Is,
	Mutex,
	NotFoundError,
	RandomHelper
} from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import type { ILoggingComponent } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type ITelemetryConnector,
	type ITelemetryMetric,
	type ITelemetryMetricValue,
	MetricCounterOperation,
	MetricType
} from "@twin.org/telemetry-models";
import type { TelemetryMetric } from "./entities/telemetryMetric.js";
import type { TelemetryMetricValue } from "./entities/telemetryMetricValue.js";
import type { IEntityStorageTelemetryConnectorConstructorOptions } from "./models/IEntityStorageTelemetryConnectorConstructorOptions.js";

/**
 * Class for performing telemetry operations in entity storage.
 */
export class EntityStorageTelemetryConnector implements ITelemetryConnector {
	/**
	 * The namespace supported by the telemetry connector.
	 */
	public static readonly NAMESPACE: string = "entity-storage";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<EntityStorageTelemetryConnector>();

	/**
	 * Page size used when scanning for values to trim.
	 * Large enough to cover most histories in one or two pages without overwhelming storage.
	 * @internal
	 */
	private static readonly _TRIM_PAGE_SIZE = 1000;

	/**
	 * The entity storage for the telemetry metrics.
	 * @internal
	 */
	private readonly _metricStorage: IEntityStorageConnector<TelemetryMetric>;

	/**
	 * The entity storage for the telemetry metric values.
	 * @internal
	 */
	private readonly _metricValueStorage: IEntityStorageConnector<TelemetryMetricValue>;

	/**
	 * The component for logging.
	 * @internal
	 */
	private readonly _logging?: ILoggingComponent;

	/**
	 * The timeout in milliseconds when acquiring a metric write mutex lock.
	 * @internal
	 */
	private readonly _mutexTimeoutMs?: number;

	/**
	 * Create a new instance of EntityStorageTelemetryConnector.
	 * @param options The options for the connector.
	 */
	constructor(options?: IEntityStorageTelemetryConnectorConstructorOptions) {
		this._metricStorage = EntityStorageConnectorFactory.get(
			options?.telemetryMetricStorageConnectorType ?? "telemetry-metric"
		);
		this._metricValueStorage = EntityStorageConnectorFactory.get(
			options?.telemetryMetricValueStorageConnectorType ?? "telemetry-metric-value"
		);

		this._logging = ComponentFactory.getIfExists(options?.loggingComponentType);
		this._mutexTimeoutMs = Coerce.integer(options?.config?.mutexTimeoutMs);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return EntityStorageTelemetryConnector.CLASS_NAME;
	}

	/**
	 * Create a new metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been created.
	 */
	public async createMetric(metric: ITelemetryMetric): Promise<void> {
		Guards.object<ITelemetryMetric>(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.label),
			metric.label
		);
		Guards.arrayOneOf(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.type),
			metric.type,
			Object.values(MetricType)
		);

		if (Is.notEmpty(metric.description)) {
			Guards.string(
				EntityStorageTelemetryConnector.CLASS_NAME,
				nameof(metric.description),
				metric.description
			);
		}
		if (Is.notEmpty(metric.unit)) {
			Guards.string(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.unit), metric.unit);
		}
		if (Is.notEmpty(metric.maxHistory)) {
			if (!Is.integer(metric.maxHistory) || metric.maxHistory <= 0) {
				throw new GeneralError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"maxHistoryMustBePositiveInteger"
				);
			}
		}

		const existingMetric = await this._metricStorage.get(metric.id);
		if (Is.notEmpty(existingMetric)) {
			throw new AlreadyExistsError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricAlreadyExists",
				metric.id
			);
		}

		const telemetryMetric: TelemetryMetric = {
			id: metric.id,
			label: metric.label,
			type: metric.type,
			unit: metric.unit ?? "",
			description: metric.description ?? "",
			maxHistory: metric.maxHistory
		};

		await this._metricStorage.set(telemetryMetric);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricCreated",
			level: "info",
			data: { id: metric.id, type: metric.type, label: metric.label }
		});
	}

	/**
	 * Get the metric details and it's most recent value.
	 * @param id The metric id.
	 * @returns The metric details and it's most recent value.
	 */
	public async getMetric(id: string): Promise<{
		metric: ITelemetryMetric;
		value: ITelemetryMetricValue;
	}> {
		const metrics = await this.queryValues(id, undefined, undefined, undefined, 1);
		return {
			metric: metrics.metric,
			value: metrics.entities[0]
		};
	}

	/**
	 * Update metric.
	 * @param metric The metric details.
	 * @returns A promise that resolves when the metric has been updated.
	 */
	public async updateMetric(metric: Omit<ITelemetryMetric, "type">): Promise<void> {
		Guards.object<ITelemetryMetric>(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric),
			metric
		);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.id), metric.id);
		Guards.stringValue(
			EntityStorageTelemetryConnector.CLASS_NAME,
			nameof(metric.label),
			metric.label
		);
		if (Is.notEmpty(metric.description)) {
			Guards.string(
				EntityStorageTelemetryConnector.CLASS_NAME,
				nameof(metric.description),
				metric.description
			);
		}
		if (Is.notEmpty(metric.unit)) {
			Guards.string(EntityStorageTelemetryConnector.CLASS_NAME, nameof(metric.unit), metric.unit);
		}
		if (Is.notEmpty(metric.maxHistory)) {
			if (!Is.integer(metric.maxHistory) || metric.maxHistory <= 0) {
				throw new GeneralError(
					EntityStorageTelemetryConnector.CLASS_NAME,
					"maxHistoryMustBePositiveInteger"
				);
			}
		}

		const existingMetric = await this._metricStorage.get(metric.id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricNotFound",
				metric.id
			);
		}

		const telemetryMetric: TelemetryMetric = {
			id: metric.id,
			label: metric.label,
			type: existingMetric.type,
			unit: metric.unit ?? existingMetric.unit,
			description: metric.description ?? existingMetric.description,
			maxHistory: metric.maxHistory ?? existingMetric.maxHistory
		};

		await this._metricStorage.set(telemetryMetric);

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricUpdated",
			level: "info",
			data: { id: metric.id, type: metric.type, label: metric.label }
		});
	}

	/**
	 * Add a metric value.
	 * @param id The id of the metric.
	 * @param value The value for the add operation.
	 * @param customData The custom data for the metric value.
	 * @returns The id of the newly created metric value entry.
	 */
	public async addMetricValue(
		id: string,
		value: MetricCounterOperation | number,
		customData?: { [key: string]: unknown }
	): Promise<string> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		const lockKey = `${EntityStorageTelemetryConnector.CLASS_NAME}:${id}`;
		await Mutex.lock(lockKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});

		try {
			const existingMetric = await this._metricStorage.get(id);
			if (Is.undefined(existingMetric)) {
				throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
			}

			const existingMetricValue = await this._metricValueStorage.query(
				{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
				[
					{
						property: "ts",
						sortDirection: SortDirection.Descending
					}
				],
				undefined,
				undefined,
				1
			);

			const lastMetric = existingMetricValue.entities[0] as TelemetryMetricValue | undefined;
			let newValue = Is.notEmpty(lastMetric) ? lastMetric.value : 0;

			if (existingMetric.type === MetricType.Counter) {
				if (value === MetricCounterOperation.Increment) {
					newValue++;
				} else if (Is.integer(value) && value > 0) {
					newValue += value;
				} else {
					throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "counterIncOnly");
				}
			} else if (existingMetric.type === MetricType.IncDecCounter) {
				if (value === MetricCounterOperation.Increment) {
					newValue++;
				} else if (value === MetricCounterOperation.Decrement) {
					newValue--;
				} else if (Is.integer(value)) {
					newValue += value;
				} else {
					throw new GeneralError(
						EntityStorageTelemetryConnector.CLASS_NAME,
						"upDownCounterIncOrDecOnly"
					);
				}
			} else if (Is.number(value)) {
				newValue = value;
			} else {
				throw new GeneralError(EntityStorageTelemetryConnector.CLASS_NAME, "gaugeNoIncDec");
			}

			// Keep timestamps strictly increasing per metric to preserve deterministic ordering.
			const now = Date.now();
			const ts = Is.notEmpty(lastMetric) ? Math.max(now, lastMetric.ts + 1) : now;

			const telemetryMetricValue: TelemetryMetricValue = {
				id: Converter.bytesToHex(RandomHelper.generate(16)),
				metricId: id,
				ts,
				value: newValue,
				customData
			};

			await this._metricValueStorage.set(telemetryMetricValue);

			if (Is.integer(existingMetric.maxHistory) && existingMetric.maxHistory > 0) {
				let trimCursor: string | undefined;
				const idsBuffer: string[] = [];
				do {
					const page = await this._metricValueStorage.query(
						{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
						[{ property: "ts", sortDirection: SortDirection.Ascending }],
						["id"],
						trimCursor,
						EntityStorageTelemetryConnector._TRIM_PAGE_SIZE
					);
					idsBuffer.push(...page.entities.map(e => e.id as string));
					trimCursor = page.cursor;
				} while (Is.stringValue(trimCursor));
				const excess = idsBuffer.length - existingMetric.maxHistory;
				if (excess > 0) {
					await this._metricValueStorage.removeBatch(idsBuffer.slice(0, excess));
				}
			}

			await this._logging?.log({
				source: EntityStorageTelemetryConnector.CLASS_NAME,
				message: "metricValueCreated",
				level: "info",
				data: { id, value: newValue }
			});

			return telemetryMetricValue.id;
		} finally {
			Mutex.unlock(lockKey);
		}
	}

	/**
	 * Get a specific metric value by its id.
	 * @param id The id of the metric.
	 * @param valueId The id of the metric value.
	 * @returns The metric value.
	 */
	public async getMetricValue(id: string, valueId: string): Promise<ITelemetryMetricValue> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(valueId), valueId);

		const results = await this._metricValueStorage.query(
			{
				conditions: [
					{ property: "metricId", comparison: ComparisonOperator.Equals, value: id },
					{ property: "id", comparison: ComparisonOperator.Equals, value: valueId }
				],
				logicalOperator: LogicalOperator.And
			},
			undefined,
			undefined,
			undefined,
			1
		);

		if (results.entities.length === 0) {
			throw new NotFoundError(
				EntityStorageTelemetryConnector.CLASS_NAME,
				"metricValueNotFound",
				valueId
			);
		}

		const metricValue = results.entities[0] as TelemetryMetricValue;
		return {
			id: metricValue.id,
			ts: metricValue.ts,
			value: metricValue.value,
			customData: metricValue.customData
		};
	}

	/**
	 * Remove metric.
	 * @param id The id of the metric.
	 * @returns A promise that resolves when the metric and all its values have been removed.
	 */
	public async removeMetric(id: string): Promise<void> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		const existingMetric = await this._metricStorage.get(id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		await this._metricStorage.remove(id);

		let removeValuesCursor: string | undefined;
		const valueIdsToRemove: string[] = [];
		do {
			const existingMetricValuesResult = await this._metricValueStorage.query(
				{
					property: "metricId",
					comparison: ComparisonOperator.Equals,
					value: id
				},
				undefined,
				undefined,
				removeValuesCursor
			);
			valueIdsToRemove.push(...existingMetricValuesResult.entities.map(e => e.id as string));
			removeValuesCursor = existingMetricValuesResult.cursor;
		} while (Is.stringValue(removeValuesCursor));
		if (valueIdsToRemove.length > 0) {
			await this._metricValueStorage.removeBatch(valueIdsToRemove);
		}

		await this._logging?.log({
			source: EntityStorageTelemetryConnector.CLASS_NAME,
			message: "metricRemoved",
			level: "info",
			data: { id }
		});
	}

	/**
	 * Query the metrics.
	 * @param type The type of the metric.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async query(
		type?: MetricType,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metrics.
		 */
		entities: ITelemetryMetric[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}> {
		const condition: EntityCondition<TelemetryMetric> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (Is.arrayOneOf(type, Object.values(MetricType))) {
			condition.conditions.push({
				property: "type",
				comparison: ComparisonOperator.Equals,
				value: type
			});
		}

		const result = await this._metricStorage.query(
			condition.conditions.length > 0 ? condition : undefined,
			[
				{
					property: "label",
					sortDirection: SortDirection.Ascending
				}
			],
			undefined,
			cursor,
			limit
		);

		return {
			entities: result.entities as ITelemetryMetric[],
			cursor: result.cursor
		};
	}

	/**
	 * Query the metric values.
	 * @param id The id of the metric.
	 * @param timeStart The inclusive time as the start of the metric entries.
	 * @param timeEnd The inclusive time as the end of the metric entries.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async queryValues(
		id: string,
		timeStart?: number,
		timeEnd?: number,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The metric details.
		 */
		metric: ITelemetryMetric;

		/**
		 * The values for the metric.
		 */
		entities: ITelemetryMetricValue[];

		/**
		 * An optional cursor, when defined can be used to call find to get more values.
		 */
		cursor?: string;
	}> {
		Guards.stringValue(EntityStorageTelemetryConnector.CLASS_NAME, nameof(id), id);

		const existingMetric = await this._metricStorage.get(id);
		if (Is.undefined(existingMetric)) {
			throw new NotFoundError(EntityStorageTelemetryConnector.CLASS_NAME, "metricNotFound", id);
		}

		const condition: EntityCondition<TelemetryMetricValue> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		condition.conditions.push({
			property: "metricId",
			comparison: ComparisonOperator.Equals,
			value: id
		});

		if (Is.number(timeStart)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.GreaterThanOrEqual,
				value: timeStart
			});
		}

		if (Is.number(timeEnd)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.LessThanOrEqual,
				value: timeEnd
			});
		}

		const result = await this._metricValueStorage.query(
			condition,
			[
				{
					property: "ts",
					sortDirection: SortDirection.Descending
				}
			],
			undefined,
			cursor,
			limit
		);

		const entities = result.entities as ITelemetryMetricValue[];
		if (existingMetric.type === MetricType.Counter) {
			entities.sort((a, b) => b.value - a.value || b.ts - a.ts);
		}

		return {
			metric: existingMetric as ITelemetryMetric,
			entities,
			cursor: result.cursor
		};
	}
}
