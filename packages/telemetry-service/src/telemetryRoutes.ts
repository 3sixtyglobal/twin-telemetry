// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	HttpContextIdKeys,
	HttpHeaderHelper,
	HttpUrlHelper,
	type ICreatedResponse,
	type IHttpRequestContext,
	type INoContentResponse,
	type IRestRoute,
	type ITag
} from "@twin.org/api-models";
import { ContextIdStore } from "@twin.org/context";
import { Coerce, ComponentFactory, Guards } from "@twin.org/core";
import { nameof } from "@twin.org/nameof";
import {
	MetricType,
	type ITelemetryAddMetricValueRequest,
	type ITelemetryComponent,
	type ITelemetryCreateMetricRequest,
	type ITelemetryGetMetricRequest,
	type ITelemetryGetMetricResponse,
	type ITelemetryGetMetricValueRequest,
	type ITelemetryGetMetricValueResponse,
	type ITelemetryListRequest,
	type ITelemetryListResponse,
	type ITelemetryRemoveMetricRequest,
	type ITelemetryUpdateMetricRequest,
	type ITelemetryValuesListRequest,
	type ITelemetryValuesListResponse
} from "@twin.org/telemetry-models";
import { HeaderTypes, HttpStatusCode, type IHttpHeaders } from "@twin.org/web";

/**
 * The source used when communicating about these routes.
 */
const ROUTES_SOURCE = "telemetryRoutes";

/**
 * The tag to associate with the routes.
 */
export const tagsTelemetry: ITag[] = [
	{
		name: "Telemetry",
		description: "Endpoints which are modelled to access a telemetry contract."
	}
];

/**
 * The REST routes for telemetry.
 * @param baseRouteName Prefix to prepend to the paths.
 * @param componentName The name of the component to use in the routes stored in the ComponentFactory.
 * @returns The generated routes.
 */
export function generateRestRoutesTelemetry(
	baseRouteName: string,
	componentName: string
): IRestRoute[] {
	const createMetricRoute: IRestRoute<ITelemetryCreateMetricRequest, ICreatedResponse> = {
		operationId: "telemetryCreateMetric",
		summary: "Create a telemetry metric",
		tag: tagsTelemetry[0].name,
		method: "POST",
		path: `${baseRouteName}/metric`,
		handler: async (httpRequestContext, request) =>
			telemetryCreateMetric(httpRequestContext, componentName, request, baseRouteName),
		requestType: {
			type: nameof<ITelemetryCreateMetricRequest>(),
			examples: [
				{
					id: "telemetryCreateMetricRequestExample",
					request: {
						body: {
							id: "my-counter",
							label: "My Counter",
							description: "This is my counter",
							type: MetricType.Counter,
							unit: "KG"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ICreatedResponse>(),
				examples: [
					{
						id: "telemetryCreateMetricResponseExample",
						response: {
							statusCode: HttpStatusCode.created,
							headers: {
								[HeaderTypes.Location]: "my-counter"
							}
						}
					}
				]
			}
		]
	};

	const getMetricRoute: IRestRoute<ITelemetryGetMetricRequest, ITelemetryGetMetricResponse> = {
		operationId: "telemetryGetMetric",
		summary: "Get a telemetry metric and it's most recent value",
		tag: tagsTelemetry[0].name,
		method: "GET",
		path: `${baseRouteName}/metric/:id`,
		handler: async (httpRequestContext, request) =>
			telemetryGetMetric(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryGetMetricRequest>(),
			examples: [
				{
					id: "telemetryGetMetricRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ITelemetryGetMetricResponse>(),
				examples: [
					{
						id: "telemetryGetMetricResponseExample",
						response: {
							body: {
								metric: {
									id: "my-counter",
									label: "My Counter",
									description: "This is my counter",
									type: MetricType.Counter,
									unit: "KG"
								},
								value: {
									id: "aabbccdd11223445566",
									ts: 1715252922273,
									value: 10
								}
							}
						}
					}
				]
			}
		]
	};

	const updateMetricRoute: IRestRoute<ITelemetryUpdateMetricRequest, INoContentResponse> = {
		operationId: "telemetryUpdateMetric",
		summary: "Update a telemetry metric",
		tag: tagsTelemetry[0].name,
		method: "PUT",
		path: `${baseRouteName}/metric/:id`,
		handler: async (httpRequestContext, request) =>
			telemetryUpdateMetric(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryUpdateMetricRequest>(),
			examples: [
				{
					id: "telemetryUpdateMetricRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						},
						body: {
							label: "My New Label"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<INoContentResponse>()
			}
		]
	};

	const addMetricValueRoute: IRestRoute<ITelemetryAddMetricValueRequest, ICreatedResponse> = {
		operationId: "telemetryAddMetricValue",
		summary: "Add a telemetry metric value",
		tag: tagsTelemetry[0].name,
		method: "POST",
		path: `${baseRouteName}/metric/:id/value`,
		handler: async (httpRequestContext, request) =>
			telemetryAddMetricValue(httpRequestContext, componentName, request, baseRouteName),
		requestType: {
			type: nameof<ITelemetryAddMetricValueRequest>(),
			examples: [
				{
					id: "telemetryAddMetricValueRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						},
						body: {
							value: 10
						}
					}
				},
				{
					id: "telemetryAddMetricValueIncRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						},
						body: {
							value: "inc"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ICreatedResponse>(),
				examples: [
					{
						id: "telemetryAddMetricValueResponseExample",
						response: {
							statusCode: HttpStatusCode.created,
							headers: {
								[HeaderTypes.Location]: "aabbccdd11223445566"
							}
						}
					}
				]
			}
		]
	};

	const removeMetricRoute: IRestRoute<ITelemetryRemoveMetricRequest, INoContentResponse> = {
		operationId: "telemetryRemoveMetric",
		summary: "Remove a telemetry metric and it's values.",
		tag: tagsTelemetry[0].name,
		method: "DELETE",
		path: `${baseRouteName}/metric/:id`,
		handler: async (httpRequestContext, request) =>
			telemetryRemoveMetric(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryRemoveMetricRequest>(),
			examples: [
				{
					id: "telemetryRemoveMetricRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<INoContentResponse>()
			}
		]
	};

	const listMetricsRoute: IRestRoute<ITelemetryListRequest, ITelemetryListResponse> = {
		operationId: "telemetryListEntries",
		summary: "Get a list of the telemetry metrics",
		tag: tagsTelemetry[0].name,
		method: "GET",
		path: `${baseRouteName}/metric`,
		handler: async (httpRequestContext, request) =>
			telemetryMetricList(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryListRequest>(),
			examples: [
				{
					id: "telemetryListRequestExample",
					request: {
						query: {
							type: MetricType.Counter.toString()
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ITelemetryListResponse>(),
				examples: [
					{
						id: "telemetryListResponseExample",
						response: {
							body: {
								entities: [
									{
										id: "my-counter",
										label: "My Counter",
										type: MetricType.Counter,
										unit: "KG"
									},
									{
										id: "my-counter-2",
										label: "My Counter 2",
										type: MetricType.IncDecCounter,
										unit: "M"
									}
								],
								cursor: "1"
							}
						}
					}
				]
			}
		]
	};

	const getMetricValueRoute: IRestRoute<
		ITelemetryGetMetricValueRequest,
		ITelemetryGetMetricValueResponse
	> = {
		operationId: "telemetryGetMetricValue",
		summary: "Get a specific telemetry metric value",
		tag: tagsTelemetry[0].name,
		method: "GET",
		path: `${baseRouteName}/metric/:id/value/:valueId`,
		handler: async (httpRequestContext, request) =>
			telemetryGetMetricValue(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryGetMetricValueRequest>(),
			examples: [
				{
					id: "telemetryGetMetricValueRequestExample",
					request: {
						pathParams: {
							id: "my-counter",
							valueId: "aabbccdd11223445566"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ITelemetryGetMetricValueResponse>(),
				examples: [
					{
						id: "telemetryGetMetricValueResponseExample",
						response: {
							body: {
								id: "aabbccdd11223445566",
								ts: 1715252922273,
								value: 10
							}
						}
					}
				]
			}
		]
	};

	const listMetricsValuesRoute: IRestRoute<
		ITelemetryValuesListRequest,
		ITelemetryValuesListResponse
	> = {
		operationId: "telemetryValuesListEntries",
		summary: "Get a list of the values for a telemetry metric",
		tag: tagsTelemetry[0].name,
		method: "GET",
		path: `${baseRouteName}/metric/:id/value`,
		handler: async (httpRequestContext, request) =>
			telemetryMetricValueList(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ITelemetryValuesListRequest>(),
			examples: [
				{
					id: "telemetryValuesListRequestExample",
					request: {
						pathParams: {
							id: "my-counter"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ITelemetryValuesListResponse>(),
				examples: [
					{
						id: "telemetryValuesListResponseExample",
						response: {
							body: {
								metric: {
									id: "my-counter",
									label: "My Counter",
									type: MetricType.Counter,
									unit: "KG"
								},
								entities: [
									{
										id: "aabbccdd11223445566",
										ts: 1715252922273,
										value: 10
									},
									{
										id: "aabbccdd11223445566",
										ts: 1715252922274,
										value: 11
									}
								],
								cursor: "1"
							}
						}
					}
				]
			}
		]
	};

	return [
		createMetricRoute,
		getMetricRoute,
		updateMetricRoute,
		addMetricValueRoute,
		removeMetricRoute,
		listMetricsRoute,
		getMetricValueRoute,
		listMetricsValuesRoute
	];
}

/**
 * Create a new telemetry metric.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @param baseRouteName The base route name for the API.
 * @returns The response object with additional http response properties.
 */
export async function telemetryCreateMetric(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryCreateMetricRequest,
	baseRouteName: string
): Promise<ICreatedResponse> {
	Guards.object<ITelemetryCreateMetricRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryCreateMetricRequest["body"]>(
		ROUTES_SOURCE,
		nameof(request.body),
		request.body
	);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	await component.createMetric({
		id: request.body.id,
		label: request.body.label,
		description: request.body.description,
		type: request.body.type,
		unit: request.body.unit
	});

	const contextIds = await ContextIdStore.getContextIds();
	const publicOrigin = contextIds?.[HttpContextIdKeys.PublicOrigin];

	const headers: IHttpHeaders = {};
	HttpHeaderHelper.buildId(
		headers,
		request.body.id,
		HttpUrlHelper.combineOriginPath(publicOrigin, `${baseRouteName}/:id`)
	);

	return {
		statusCode: HttpStatusCode.created,
		headers
	};
}

/**
 * Gets a telemetry metric.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryGetMetric(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryGetMetricRequest
): Promise<ITelemetryGetMetricResponse> {
	Guards.object<ITelemetryGetMetricRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryGetMetricRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.pathParams),
		request.pathParams
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	const result = await component.getMetric(request.pathParams.id);
	return { body: result };
}

/**
 * Updates a telemetry metric.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryUpdateMetric(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryUpdateMetricRequest
): Promise<INoContentResponse> {
	Guards.object<ITelemetryUpdateMetricRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryUpdateMetricRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.pathParams),
		request.pathParams
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);
	Guards.object<ITelemetryUpdateMetricRequest["body"]>(
		ROUTES_SOURCE,
		nameof(request.body),
		request.body
	);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	await component.updateMetric({
		id: request.pathParams.id,
		label: request.body.label,
		description: request.body.description,
		unit: request.body.unit
	});

	return { statusCode: HttpStatusCode.noContent };
}

/**
 * Add a telemetry metric value.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @param baseRouteName The base route name for the API.
 * @returns The response object with additional http response properties.
 */
export async function telemetryAddMetricValue(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryAddMetricValueRequest,
	baseRouteName: string
): Promise<ICreatedResponse> {
	Guards.object<ITelemetryAddMetricValueRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryAddMetricValueRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.pathParams),
		request.pathParams
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);
	Guards.object<ITelemetryAddMetricValueRequest["body"]>(
		ROUTES_SOURCE,
		nameof(request.body),
		request.body
	);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	const id = await component.addMetricValue(
		request.pathParams.id,
		request.body.value,
		request.body.customData
	);

	const contextIds = await ContextIdStore.getContextIds();
	const publicOrigin = contextIds?.[HttpContextIdKeys.PublicOrigin];

	const headers: IHttpHeaders = {};
	HttpHeaderHelper.buildId(
		headers,
		id,
		HttpUrlHelper.combineOriginPath(publicOrigin, `${baseRouteName}/:id`)
	);

	return { statusCode: HttpStatusCode.created, headers };
}

/**
 * Removes a telemetry metric.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryRemoveMetric(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryRemoveMetricRequest
): Promise<INoContentResponse> {
	Guards.object<ITelemetryRemoveMetricRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryRemoveMetricRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.pathParams),
		request.pathParams
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	await component.removeMetric(request.pathParams.id);
	return {
		statusCode: HttpStatusCode.noContent
	};
}

/**
 * Get a list of the telemetry metrics.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryMetricList(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryListRequest
): Promise<ITelemetryListResponse> {
	Guards.object<ITelemetryListRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryListRequest["query"]>(
		ROUTES_SOURCE,
		nameof(request.query),
		request.query
	);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);

	const itemsAndCursor = await component.query(
		Coerce.number(request?.query?.type) as MetricType,
		request?.query?.cursor,
		Coerce.number(request?.query?.limit)
	);

	return {
		body: itemsAndCursor
	};
}

/**
 * Gets a specific telemetry metric value.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryGetMetricValue(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryGetMetricValueRequest
): Promise<ITelemetryGetMetricValueResponse> {
	Guards.object<ITelemetryGetMetricValueRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryGetMetricValueRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.pathParams),
		request.pathParams
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.valueId), request.pathParams.valueId);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);
	const result = await component.getMetricValue(request.pathParams.id, request.pathParams.valueId);
	return { body: result };
}

/**
 * Get a list of the telemetry metric values.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns The response object with additional http response properties.
 */
export async function telemetryMetricValueList(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ITelemetryValuesListRequest
): Promise<ITelemetryValuesListResponse> {
	Guards.object<ITelemetryValuesListRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ITelemetryValuesListRequest["pathParams"]>(
		ROUTES_SOURCE,
		nameof(request.query),
		request.query
	);
	Guards.stringValue(ROUTES_SOURCE, nameof(request.pathParams.id), request.pathParams.id);

	const component = ComponentFactory.get<ITelemetryComponent>(componentName);

	const itemsAndCursor = await component.queryValues(
		request?.pathParams.id,
		Coerce.number(request?.query?.timeStart),
		Coerce.number(request?.query?.timeEnd),
		request?.query?.cursor,
		Coerce.number(request?.query?.limit)
	);

	return {
		body: itemsAndCursor
	};
}
