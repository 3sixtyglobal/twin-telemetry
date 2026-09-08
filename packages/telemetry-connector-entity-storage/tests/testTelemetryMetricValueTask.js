// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { FileEntityStorageConnector } from '@twin.org/entity-storage-connector-file';
import { EntityStorageConnectorFactory } from '@twin.org/entity-storage-models';
import {
	initSchema,
	telemetryMetricValueTaskStart as realTaskStart
} from '@twin.org/telemetry-connector-entity-storage';

// The real handler processes and ends the task; only the startup is wrapped, to register the
// value storage the engine clone provides in production. There is no engine to clone from in
// the tests, so the storage is built here instead, file backed on the directory the test also
// reads, which is what lets the test see what the worker thread wrote.
export {
	telemetryMetricValueTask,
	telemetryMetricValueTaskEnd
} from '@twin.org/telemetry-connector-entity-storage';

const directory = process.env.TEST_TELEMETRY_VALUE_DIRECTORY;
const partitionContextIds = (process.env.TEST_TELEMETRY_VALUE_PARTITIONS ?? '')
	.split(',')
	.filter(key => key.length > 0);

/**
 * Start the real task, registering the value storage it resolves first.
 * @param engineCloneData The engine clone data.
 * @param config The writer configuration.
 * @returns A promise that resolves when the task is ready.
 */
export async function telemetryMetricValueTaskStart(engineCloneData, config) {
	initSchema();
	EntityStorageConnectorFactory.register(
		'telemetry-metric-value',
		() =>
			new FileEntityStorageConnector({
				entitySchema: 'TelemetryMetricValue',
				partitionContextIds: partitionContextIds.length > 0 ? partitionContextIds : undefined,
				config: { directory }
			})
	);
	await realTaskStart(engineCloneData, config);
}
