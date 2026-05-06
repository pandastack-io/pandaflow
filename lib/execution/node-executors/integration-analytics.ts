/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  fetchWithTimeout,
  interpolateDeep,
  resolveNodeInput,
  safeJsonParse,
  withRetry,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type AnalyticsExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;

type RequestResult = {
  response: Response;
  body: any;
};

async function safeLog(
  deps: ExecutorDeps,
  node: WorkflowNode,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(node.id, node.data.config?.label || node.id, level, message, data, context);
  } catch {
    // Logging should never block execution.
  }
}

function createExecutor(name: string, handler: AnalyticsExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} analytics executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} analytics executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = formatErrorMessage(error, `${name} analytics request failed`);
      await safeLog(deps, node, 'error', message, context, {
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  };
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

function parseConfigValue<T = any>(value: any, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return (parsed === value ? (value as T) : parsed) as T;
  }
  return value as T;
}

function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: any, fallback: Record<string, any> = {}): Record<string, any> {
  const parsed = parseConfigValue<Record<string, any> | string>(value, fallback);
  return isRecord(parsed) ? parsed : fallback;
}

function toArray(value: any): any[] {
  const parsed = parseConfigValue<any>(value, []);
  if (parsed === undefined || parsed === null || parsed === '') return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeHeaders(headers: any): Record<string, string> {
  return Object.fromEntries(
    Object.entries(toRecord(headers)).map(([key, value]) => [key, String(value ?? '')])
  );
}

function mergeHeaders(...sets: Array<Record<string, string>>): Record<string, string> {
  return Object.assign({}, ...sets);
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

function describeBody(body: any): string {
  if (body === null || body === undefined) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 1000);
  try {
    return JSON.stringify(body).slice(0, 1000);
  } catch {
    return String(body).slice(0, 1000);
  }
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Received malformed JSON response: ${text.slice(0, 1000)}`);
    }
  }

  return safeJsonParse(text);
}

async function sendRequest(
  label: string,
  url: string,
  init: RequestInit & { timeout?: number },
  retries = DEFAULT_RETRIES
): Promise<RequestResult> {
  const { timeout = DEFAULT_TIMEOUT, ...requestInit } = init;

  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, {
        ...requestInit,
        timeout,
      });
      const body = await parseResponseBody(response);
      if (!response.ok) {
        throw new Error(
          `${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`
        );
      }
      return { response, body };
    },
    {
      maxAttempts: Math.max(1, retries),
      retryOn: (error) => !/HTTP 4\d\d/.test(error.message),
    }
  );
}

function requiredString(value: any, fieldName: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function getConfig(node: WorkflowNode, context: ExecutorContext): Record<string, any> {
  return interpolateDeep(node.data.config || {}, context) as Record<string, any>;
}

function resolvePayload(config: Record<string, any>, context: ExecutorContext, fallback: any = {}): any {
  const raw =
    config.payload ??
    config.request ??
    config.body ??
    (config.operationPayload !== undefined ? config.operationPayload : resolveNodeInput(context, config.inputVariable));

  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  return interpolateDeep(parseConfigValue(raw, raw), context);
}

function normalizeNamedList(value: any): Array<Record<string, any>> {
  return toArray(value)
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item };
      }
      return isRecord(item) ? item : null;
    })
    .filter((item): item is Record<string, any> => Boolean(item));
}

function stripEmpty<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
  ) as T;
}

function buildGoogleAnalyticsReportRequest(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  if (isRecord(explicit) && Object.keys(explicit).length > 0) {
    return explicit;
  }

  return stripEmpty({
    dimensions: normalizeNamedList(config.dimensions),
    metrics: normalizeNamedList(config.metrics),
    dateRanges: toArray(config.dateRanges),
    dimensionFilter: config.dimensionFilter ? parseConfigValue(config.dimensionFilter, config.dimensionFilter) : undefined,
    metricFilter: config.metricFilter ? parseConfigValue(config.metricFilter, config.metricFilter) : undefined,
    orderBys: config.orderBys ? toArray(config.orderBys) : undefined,
    limit: config.limit !== undefined && config.limit !== '' ? String(config.limit) : undefined,
    offset: config.offset !== undefined && config.offset !== '' ? String(config.offset) : undefined,
    keepEmptyRows: config.keepEmptyRows !== undefined ? Boolean(config.keepEmptyRows) : undefined,
    returnPropertyQuota:
      config.returnPropertyQuota !== undefined ? Boolean(config.returnPropertyQuota) : undefined,
  });
}

function buildGoogleAnalyticsEventPayload(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  const explicitEvents = Array.isArray(explicitRecord.events) ? explicitRecord.events : [];
  const configuredEvents =
    config.events !== undefined ? toArray(parseConfigValue(config.events, config.events)) : explicitEvents;
  const events = configuredEvents
    .map((event) => {
      if (typeof event === 'string') {
        return { name: event };
      }
      return isRecord(event) ? event : null;
    })
    .filter((event): event is Record<string, any> => Boolean(event));

  const payload = stripEmpty({
    ...explicitRecord,
    client_id: config.clientId || explicitRecord.client_id || explicitRecord.clientId,
    user_id: config.userId || explicitRecord.user_id || explicitRecord.userId,
    non_personalized_ads:
      config.nonPersonalizedAds !== undefined
        ? Boolean(config.nonPersonalizedAds)
        : explicitRecord.non_personalized_ads,
    timestamp_micros: config.timestampMicros || explicitRecord.timestamp_micros,
    events,
  });

  if (!payload.client_id) {
    throw new Error('Google Analytics clientId is required for event operations');
  }
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error('Google Analytics events are required for event operations');
  }

  return payload;
}

function buildMixpanelTrackEvent(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  const properties = stripEmpty({
    ...toRecord(explicitRecord.properties),
    ...toRecord(config.properties),
    token: config.token || explicitRecord.token || explicitRecord.properties?.token,
    distinct_id: config.distinctId || explicitRecord.distinct_id || explicitRecord.properties?.distinct_id,
    time: config.time || explicitRecord.time || explicitRecord.properties?.time,
  });

  if (!properties.token) {
    throw new Error('Mixpanel token is required');
  }

  return stripEmpty({
    ...explicitRecord,
    event: config.event || explicitRecord.event,
    properties,
  });
}

function buildMixpanelTrackBatch(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, []);
  const events =
    config.events !== undefined
      ? toArray(parseConfigValue(config.events, config.events))
      : Array.isArray(explicit)
        ? explicit
        : toArray((explicit as Record<string, any>)?.events);

  const token = String(config.token || '').trim();
  if (!token) {
    throw new Error('Mixpanel token is required');
  }

  if (events.length === 0) {
    throw new Error('Mixpanel events array is required for track_batch');
  }

  return events.map((event) => {
    const normalized = isRecord(event) ? event : { event };
    return {
      ...normalized,
      properties: {
        ...toRecord(normalized.properties),
        token: toRecord(normalized.properties).token || token,
      },
    };
  });
}

function buildMixpanelProfileSet(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  const token = config.token || explicitRecord.$token || explicitRecord.token;
  const distinctId =
    config.distinctId || explicitRecord.$distinct_id || explicitRecord.distinct_id || explicitRecord.distinctId;
  const profileProperties =
    config.profileProperties !== undefined
      ? parseConfigValue(config.profileProperties, {})
      : explicitRecord.$set || explicitRecord.profileProperties;

  if (!token) {
    throw new Error('Mixpanel token is required');
  }
  if (!distinctId) {
    throw new Error('Mixpanel distinctId is required for profile_set');
  }

  return stripEmpty({
    ...explicitRecord,
    $token: token,
    $distinct_id: distinctId,
    $set: toRecord(profileProperties),
    $ignore_time: config.ignoreTime !== undefined ? Boolean(config.ignoreTime) : explicitRecord.$ignore_time,
    $ip: config.ip || explicitRecord.$ip,
  });
}

function buildSegmentPayload(operation: string, config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  const common = stripEmpty({
    userId: config.userId || explicitRecord.userId,
    anonymousId: config.anonymousId || explicitRecord.anonymousId,
    context:
      config.context !== undefined ? parseConfigValue(config.context, {}) : toRecord(explicitRecord.context),
    integrations:
      config.integrations !== undefined
        ? parseConfigValue(config.integrations, {})
        : toRecord(explicitRecord.integrations),
    messageId: config.messageId || explicitRecord.messageId,
    timestamp: config.timestamp || explicitRecord.timestamp,
  });

  switch (operation) {
    case 'identify':
      return stripEmpty({
        ...explicitRecord,
        ...common,
        traits: config.traits !== undefined ? parseConfigValue(config.traits, {}) : toRecord(explicitRecord.traits),
      });
    case 'group':
      return stripEmpty({
        ...explicitRecord,
        ...common,
        groupId: config.groupId || explicitRecord.groupId,
        traits: config.traits !== undefined ? parseConfigValue(config.traits, {}) : toRecord(explicitRecord.traits),
      });
    case 'page':
    case 'screen':
      return stripEmpty({
        ...explicitRecord,
        ...common,
        name: config.name || explicitRecord.name,
        category: config.category || explicitRecord.category,
        properties:
          config.properties !== undefined
            ? parseConfigValue(config.properties, {})
            : toRecord(explicitRecord.properties),
      });
    case 'alias':
      return stripEmpty({
        ...explicitRecord,
        ...common,
        previousId: config.previousId || explicitRecord.previousId,
      });
    case 'track':
    default:
      return stripEmpty({
        ...explicitRecord,
        ...common,
        event: config.event || explicitRecord.event,
        properties:
          config.properties !== undefined
            ? parseConfigValue(config.properties, {})
            : toRecord(explicitRecord.properties),
      });
  }
}

function buildAmplitudeEvent(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  return stripEmpty({
    ...explicitRecord,
    event_type: config.eventType || explicitRecord.event_type || explicitRecord.eventType,
    user_id: config.userId || explicitRecord.user_id || explicitRecord.userId,
    device_id: config.deviceId || explicitRecord.device_id || explicitRecord.deviceId,
    event_properties:
      config.eventProperties !== undefined
        ? parseConfigValue(config.eventProperties, {})
        : toRecord(explicitRecord.event_properties || explicitRecord.eventProperties),
    user_properties:
      config.userProperties !== undefined
        ? parseConfigValue(config.userProperties, {})
        : toRecord(explicitRecord.user_properties || explicitRecord.userProperties),
    groups: config.groups !== undefined ? parseConfigValue(config.groups, {}) : toRecord(explicitRecord.groups),
    group_properties:
      config.groupProperties !== undefined
        ? parseConfigValue(config.groupProperties, {})
        : toRecord(explicitRecord.group_properties || explicitRecord.groupProperties),
    time: config.time || explicitRecord.time,
    insert_id: config.insertId || explicitRecord.insert_id || explicitRecord.insertId,
    platform: config.platform || explicitRecord.platform,
    language: config.language || explicitRecord.language,
    os_name: config.osName || explicitRecord.os_name || explicitRecord.osName,
  });
}

function buildAmplitudeIdentify(config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  return stripEmpty({
    ...explicitRecord,
    user_id: config.userId || explicitRecord.user_id || explicitRecord.userId,
    device_id: config.deviceId || explicitRecord.device_id || explicitRecord.deviceId,
    user_properties:
      config.userProperties !== undefined
        ? parseConfigValue(config.userProperties, {})
        : toRecord(explicitRecord.user_properties || explicitRecord.userProperties),
    groups: config.groups !== undefined ? parseConfigValue(config.groups, {}) : toRecord(explicitRecord.groups),
    group_properties:
      config.groupProperties !== undefined
        ? parseConfigValue(config.groupProperties, {})
        : toRecord(explicitRecord.group_properties || explicitRecord.groupProperties),
    app_version: config.appVersion || explicitRecord.app_version || explicitRecord.appVersion,
    platform: config.platform || explicitRecord.platform,
  });
}

function buildPostHogPayload(operation: string, config: Record<string, any>, context: ExecutorContext) {
  const explicit = resolvePayload(config, context, {});
  const explicitRecord = isRecord(explicit) ? explicit : {};
  const apiKey = config.apiKey || explicitRecord.api_key || explicitRecord.apiKey;

  if (!apiKey) {
    throw new Error('PostHog apiKey is required');
  }

  switch (operation) {
    case 'identify':
      return stripEmpty({
        ...explicitRecord,
        api_key: apiKey,
        distinct_id: config.distinctId || explicitRecord.distinct_id || explicitRecord.distinctId,
        properties:
          config.properties !== undefined
            ? parseConfigValue(config.properties, {})
            : toRecord(explicitRecord.properties),
        set: config.set !== undefined ? parseConfigValue(config.set, {}) : toRecord(explicitRecord.set),
      });
    case 'alias':
      return stripEmpty({
        ...explicitRecord,
        api_key: apiKey,
        alias: config.alias || explicitRecord.alias,
        distinct_id: config.distinctId || explicitRecord.distinct_id || explicitRecord.distinctId,
      });
    case 'capture':
    default:
      return stripEmpty({
        ...explicitRecord,
        api_key: apiKey,
        event: config.event || explicitRecord.event,
        distinct_id: config.distinctId || explicitRecord.distinct_id || explicitRecord.distinctId,
        properties:
          config.properties !== undefined
            ? parseConfigValue(config.properties, {})
            : toRecord(explicitRecord.properties),
        timestamp: config.timestamp || explicitRecord.timestamp,
      });
  }
}

async function executeGoogleAnalytics(
  node: WorkflowNode,
  _definition: WorkflowDefinition,
  context: ExecutorContext
) {
  const config = getConfig(node, context);
  const operation = String(config.operation || 'run_report');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);

  if (operation === 'send_event' || operation === 'debug_event') {
    const endpoint =
      config.endpoint ||
      (operation === 'debug_event'
        ? 'https://www.google-analytics.com/debug/mp/collect'
        : 'https://www.google-analytics.com/mp/collect');
    const url = new URL(endpoint);
    url.searchParams.set('measurement_id', requiredString(config.measurementId, 'Google Analytics measurementId'));
    url.searchParams.set('api_secret', requiredString(config.apiSecret, 'Google Analytics apiSecret'));

    const payload = buildGoogleAnalyticsEventPayload(config, context);
    const { response, body } = await sendRequest(
      'Google Analytics event request',
      url.toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        timeout,
      },
      retries
    );

    const output = body ?? { acknowledged: true, status: response.status };
    return {
      output,
      operation,
      status: response.status,
      headers: responseHeaders(response),
      request: payload,
    };
  }

  const propertyId = requiredString(config.propertyId, 'Google Analytics propertyId');
  const accessToken = requiredString(config.accessToken, 'Google Analytics accessToken');
  const endpoint =
    config.endpoint ||
    (operation === 'get_metadata'
      ? `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`
      : `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${
          operation === 'run_realtime_report' ? 'runRealtimeReport' : 'runReport'
        }`);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const requestPayload = buildGoogleAnalyticsReportRequest(config, context);
  const { response, body } = await sendRequest(
    `Google Analytics ${operation}`,
    endpoint,
    {
      method: operation === 'get_metadata' ? 'GET' : 'POST',
      headers,
      body: operation === 'get_metadata' ? undefined : JSON.stringify(requestPayload),
      timeout,
    },
    retries
  );

  return {
    output: body,
    operation,
    propertyId,
    status: response.status,
    headers: responseHeaders(response),
    request: operation === 'get_metadata' ? undefined : requestPayload,
  };
}

async function executeMixpanel(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const operation = String(config.operation || 'track_event');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = String(config.baseUrl || 'https://api.mixpanel.com').replace(/\/$/, '');

  let endpoint = `${baseUrl}/track?strict=1`;
  let payload: any;

  if (operation === 'profile_set') {
    endpoint = `${baseUrl}/engage?verbose=1`;
    payload = buildMixpanelProfileSet(config, context);
  } else if (operation === 'track_batch') {
    payload = buildMixpanelTrackBatch(config, context);
  } else {
    payload = buildMixpanelTrackEvent(config, context);
  }

  const { response, body } = await sendRequest(
    `Mixpanel ${operation}`,
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...normalizeHeaders(config.headers),
      },
      body: JSON.stringify(payload),
      timeout,
    },
    retries
  );

  return {
    output: body ?? { acknowledged: true, status: response.status },
    operation,
    status: response.status,
    headers: responseHeaders(response),
    request: payload,
  };
}

async function executeSegment(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const operation = String(config.operation || 'track');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = String(config.baseUrl || 'https://api.segment.io/v1').replace(/\/$/, '');
  const writeKey = requiredString(config.writeKey, 'Segment writeKey');
  const payload = buildSegmentPayload(operation, config, context);

  const { response, body } = await sendRequest(
    `Segment ${operation}`,
    `${baseUrl}/${operation}`,
    {
      method: 'POST',
      headers: mergeHeaders(
        {
          Authorization: `Basic ${Buffer.from(`${writeKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        normalizeHeaders(config.headers)
      ),
      body: JSON.stringify(payload),
      timeout,
    },
    retries
  );

  return {
    output: body ?? { acknowledged: true, status: response.status },
    operation,
    status: response.status,
    headers: responseHeaders(response),
    request: payload,
  };
}

async function executeAmplitude(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const operation = String(config.operation || 'track_event');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = String(config.baseUrl || 'https://api2.amplitude.com').replace(/\/$/, '');
  const apiKey = requiredString(config.apiKey, 'Amplitude apiKey');

  let endpoint = `${baseUrl}/2/httpapi`;
  let payload: Record<string, any>;

  if (operation === 'identify') {
    endpoint = `${baseUrl}/identify`;
    const identification =
      config.identification !== undefined
        ? toArray(parseConfigValue(config.identification, config.identification))
        : [buildAmplitudeIdentify(config, context)];

    payload = stripEmpty({
      api_key: apiKey,
      identification,
      options: config.options !== undefined ? parseConfigValue(config.options, {}) : undefined,
    });
  } else {
    const events =
      operation === 'track_batch' && config.events !== undefined
        ? toArray(parseConfigValue(config.events, config.events))
        : operation === 'track_batch'
          ? toArray(resolvePayload(config, context, []))
          : [buildAmplitudeEvent(config, context)];

    payload = stripEmpty({
      api_key: apiKey,
      events,
      options: config.options !== undefined ? parseConfigValue(config.options, {}) : undefined,
    });
  }

  const { response, body } = await sendRequest(
    `Amplitude ${operation}`,
    endpoint,
    {
      method: 'POST',
      headers: mergeHeaders(
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        normalizeHeaders(config.headers)
      ),
      body: JSON.stringify(payload),
      timeout,
    },
    retries
  );

  return {
    output: body,
    operation,
    status: response.status,
    headers: responseHeaders(response),
    request: payload,
  };
}

async function executePostHog(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const operation = String(config.operation || 'capture');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = String(config.baseUrl || 'https://us.i.posthog.com').replace(/\/$/, '');
  const payload = buildPostHogPayload(operation, config, context);

  const { response, body } = await sendRequest(
    `PostHog ${operation}`,
    `${baseUrl}/${operation}/`,
    {
      method: 'POST',
      headers: mergeHeaders(
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        normalizeHeaders(config.headers)
      ),
      body: JSON.stringify(payload),
      timeout,
    },
    retries
  );

  return {
    output: body ?? { acknowledged: true, status: response.status },
    operation,
    status: response.status,
    headers: responseHeaders(response),
    request: payload,
  };
}

export const integrationAnalyticsExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_GOOGLE_ANALYTICS]: createExecutor('Google Analytics', executeGoogleAnalytics),
  [NodeType.INTEGRATION_MIXPANEL]: createExecutor('Mixpanel', executeMixpanel),
  [NodeType.INTEGRATION_SEGMENT]: createExecutor('Segment', executeSegment),
  [NodeType.INTEGRATION_AMPLITUDE]: createExecutor('Amplitude', executeAmplitude),
  [NodeType.INTEGRATION_POSTHOG]: createExecutor('PostHog', executePostHog),
};
