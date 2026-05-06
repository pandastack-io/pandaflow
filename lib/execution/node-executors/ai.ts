/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeType, PRISM_PROVIDERS } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
  buildAuthHeaders,
} from './utils';
import { getFallbackModels, withModelFallback } from '@/lib/execution/model-fallback';

type RetryableError = Error & {
  status?: number;
  retryAfterMs?: number;
  details?: any;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProviderResult = {
  text: string;
  raw: any;
  usage?: any;
  finishReason?: string;
  model: string;
  provider: string;
  cost?: number;
};

type ExecutorHandlerArgs = {
  config: Record<string, any>;
  context: ExecutorContext;
  deps: ExecutorDeps;
  input: any;
  nodeId: string;
  nodeName: string;
};

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_CHAT_MODEL = 'gpt-4o';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-7-20250514';
const DEFAULT_GOOGLE_MODEL = 'gemini-2.5-pro';
const DEFAULT_COHERE_MODEL = 'command-r-plus';
const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';

const OPENAI_COMPATIBLE_PRISM_PROVIDERS = new Set([
  'openai',
  'groq',
  'deepseek',
  'perplexity',
  'together',
  'fireworks',
  'openrouter',
  'ollama',
  'lmstudio',
  'azure',
  'xai',
  'sambanova',
]);

const PRISM_PROVIDER_ENV_KEYS: Record<string, string[]> = {
  openai: [PRISM_PROVIDERS.openai.envKey],
  anthropic: [PRISM_PROVIDERS.anthropic.envKey],
  google: ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  gemini: ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: [PRISM_PROVIDERS.groq.envKey],
  deepseek: [PRISM_PROVIDERS.deepseek.envKey],
  perplexity: [PRISM_PROVIDERS.perplexity.envKey],
  together: [PRISM_PROVIDERS.together.envKey],
  fireworks: [PRISM_PROVIDERS.fireworks.envKey],
  openrouter: [PRISM_PROVIDERS.openrouter.envKey],
  ollama: [PRISM_PROVIDERS.ollama.envKey],
  lmstudio: [PRISM_PROVIDERS.lmstudio.envKey],
  azure: [PRISM_PROVIDERS.azure.envKey],
  mistral: [PRISM_PROVIDERS.mistral.envKey],
  cohere: [PRISM_PROVIDERS.cohere.envKey],
  xai: [PRISM_PROVIDERS.xai.envKey],
  sambanova: [PRISM_PROVIDERS.sambanova.envKey],
};

const PRICE_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'o1': { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.003, output: 0.012 },
  'o3-mini': { input: 0.0011, output: 0.0044 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'gemini-2.5-pro': { input: 0.0035, output: 0.0105 },
  'gemini-2.5-flash': { input: 0.00035, output: 0.00105 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
  'mixtral-8x7b-32768': { input: 0.00024, output: 0.00024 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'deepseek-chat': { input: 0.00027, output: 0.0011 },
  'deepseek-reasoner': { input: 0.00055, output: 0.00219 },
  'llama-3.1-sonar-large-128k-online': { input: 0.001, output: 0.001 },
  'llama-3.1-sonar-small-128k-online': { input: 0.0002, output: 0.0002 },
  'llama-3.1-sonar-huge-128k-online': { input: 0.005, output: 0.005 },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.00088, output: 0.00088 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.0006, output: 0.0006 },
  'google/gemma-2-27b-it': { input: 0.0008, output: 0.0008 },
  'accounts/fireworks/models/llama-v3p1-70b-instruct': { input: 0.0009, output: 0.0009 },
  'accounts/fireworks/models/mixtral-8x7b-instruct': { input: 0.0005, output: 0.0005 },
  'openai/gpt-4o': { input: 0.0025, output: 0.01 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },
  'meta-llama/llama-3.1-405b-instruct': { input: 0.0035, output: 0.0035 },
  'mistral-large-latest': { input: 0.004, output: 0.012 },
  'mistral-small-latest': { input: 0.001, output: 0.003 },
  'open-mixtral-8x7b': { input: 0.0007, output: 0.0007 },
  'command-r-plus': { input: 0.003, output: 0.015 },
  'command-r': { input: 0.0005, output: 0.0015 },
  'grok-beta': { input: 0.005, output: 0.015 },
  'grok-2': { input: 0.005, output: 0.015 },
  'Meta-Llama-3.1-405B-Instruct': { input: 0.005, output: 0.005 },
  'Meta-Llama-3.3-70B-Instruct': { input: 0.0012, output: 0.0012 },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getConfig(node: Parameters<NodeExecutorFn>[0], context: ExecutorContext): Record<string, any> {
  return interpolateDeep(node.data?.config ?? {}, context) ?? {};
}

function stringifyValue(value: any): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function coerceArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function coerceStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMessage(message: any): ChatMessage | null {
  if (!message) return null;
  if (typeof message === 'string') return { role: 'user', content: message };
  const role = message.role === 'assistant' || message.role === 'system' ? message.role : 'user';
  const content = stringifyValue(message.content ?? message.text ?? message.message ?? '');
  return content ? { role, content } : null;
}

function coerceMessages(value: any): ChatMessage[] {
  return coerceArray(value)
    .map((item) => normalizeMessage(item))
    .filter((item): item is ChatMessage => Boolean(item));
}

function composePrompt(prompt: string | undefined, input: any, inputLabel = 'Input'): string {
  const promptText = typeof prompt === 'string' ? prompt.trim() : '';
  const inputText = stringifyValue(input).trim();
  if (promptText && inputText) {
    return `${promptText}\n\n${inputLabel}:\n${inputText}`;
  }
  return promptText || inputText;
}

function resolveApiKey(
  config: Record<string, any>,
  context: ExecutorContext | undefined,
  envKeys: string[],
  label: string
): string {
  const configApiKey = normalizeOptionalString(config.apiKey);
  const apiKey =
    configApiKey ||
    envKeys
      .map((key) => normalizeOptionalString(context?.secrets?.[key]) || normalizeOptionalString(context?.envVars?.[key]) || normalizeOptionalString(process.env[key]))
      .find(Boolean);
  if (!apiKey) {
    throw new Error(`${label} API key is required`);
  }
  return String(apiKey);
}

function parseStatusFromError(error: Error): number | undefined {
  const retryableError = error as RetryableError;
  if (retryableError.status) return retryableError.status;
  const match = error.message.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : undefined;
}

function shouldRetryError(error: Error): boolean {
  const status = parseStatusFromError(error);
  return status === undefined || status === 429 || status >= 500;
}

async function readErrorPayload(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({ error: { message: response.statusText } }));
  }
  const text = await response.text().catch(() => response.statusText);
  return { error: { message: text || response.statusText } };
}

function parseRetryAfterMs(response: Response): number | undefined {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const timestamp = Date.parse(retryAfter);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
  return undefined;
}

function createApiError(prefix: string, response: Response, payload: any): RetryableError {
  const message =
    payload?.error?.message ||
    payload?.message ||
    payload?.detail ||
    payload?.details ||
    response.statusText ||
    'Unknown error';
  const error = new Error(`${prefix} failed: ${response.status} ${message}`) as RetryableError;
  error.status = response.status;
  error.retryAfterMs = parseRetryAfterMs(response);
  error.details = payload;
  return error;
}

async function externalRequest(
  label: string,
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, options);
      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const error = createApiError(label, response, payload);
        if (error.status === 429 && error.retryAfterMs) {
          await sleep(error.retryAfterMs);
        }
        throw error;
      }
      return response;
    },
    {
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      retryOn: shouldRetryError,
    }
  );
}

async function requestJson<T>(
  label: string,
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<T> {
  const response = await externalRequest(label, url, options);
  return response.json() as Promise<T>;
}

function getTimeout(config: Record<string, any>): number {
  return Number(config.timeout) || DEFAULT_TIMEOUT;
}

function parseJsonIfNeeded(text: string, outputFormat?: string): any {
  return outputFormat === 'json' ? safeJsonParse(text) : text;
}

async function logExecution(
  deps: ExecutorDeps,
  nodeId: string,
  nodeName: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
): Promise<void> {
  try {
    await deps.logNodeExecution(nodeId, nodeName, level, message, data, context);
  } catch {
    // Ignore logging failures to avoid masking executor errors.
  }
}

function createAiExecutor(
  label: string,
  handler: (args: ExecutorHandlerArgs) => Promise<Record<string, any>>
): NodeExecutorFn {
  return async (node, _definition, context, deps) => {
    const config = getConfig(node, context);
    const input = resolveNodeInput(context, config.inputVariable);
    const nodeName = node.data?.config?.label || node.data?.type || label;
    const startedAt = Date.now();

    await logExecution(deps, node.id, nodeName, 'info', `${label} started`, context, {
      provider: config.provider,
      model: config.model,
    });

    try {
      const result = await handler({ config, context, deps, input, nodeId: node.id, nodeName });
      const duration = Date.now() - startedAt;
      const finalResult = {
        ...result,
        duration,
      };
      await logExecution(deps, node.id, nodeName, 'info', `${label} completed`, context, {
        duration,
        provider: (finalResult as any).provider,
        model: (finalResult as any).model,
      });
      return finalResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logExecution(deps, node.id, nodeName, 'error', `${label} failed`, context, { message });
      throw error;
    }
  };
}

function buildOpenAICompatibleUrl(baseUrl?: string): string {
  const normalized = (baseUrl || 'https://api.openai.com').replace(/\/$/, '');
  if (/\/chat\/completions(\?|$)/.test(normalized)) {
    return normalized;
  }
  return normalized.endsWith('/v1') ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

async function openAIChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout: number;
  outputFormat?: 'text' | 'json';
  label: string;
  baseUrl?: string;
  authHeaders?: Record<string, string>;
  provider?: string;
}): Promise<ProviderResult> {
  const url = buildOpenAICompatibleUrl(params.baseUrl);
  const messages = params.systemPrompt
    ? [{ role: 'system', content: params.systemPrompt } as ChatMessage, ...params.messages]
    : params.messages;
  const data = await requestJson<any>(
    params.label,
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.authHeaders || { Authorization: `Bearer ${params.apiKey}` }),
      },
      body: JSON.stringify({
        model: params.model || DEFAULT_CHAT_MODEL,
        messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2000,
        ...(params.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
      timeout: params.timeout,
    }
  );

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    raw: data,
    usage: data.usage,
    finishReason: data.choices?.[0]?.finish_reason,
    model: data.model || params.model || DEFAULT_CHAT_MODEL,
    provider: params.provider || 'openai',
  };
}

async function anthropicChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeout: number;
  label: string;
}): Promise<ProviderResult> {
  const data = await requestJson<any>('Anthropic ' + params.label, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: params.maxTokens ?? 2000,
      temperature: params.temperature ?? 0.7,
      messages: params.messages,
      ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
    }),
    timeout: params.timeout,
  });

  return {
    text: (data.content || []).map((item: any) => item?.text || '').join(''),
    raw: data,
    usage: data.usage,
    finishReason: data.stop_reason,
    model: data.model || params.model || DEFAULT_ANTHROPIC_MODEL,
    provider: 'anthropic',
  };
}

function toGoogleContents(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

async function googleChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout: number;
  label: string;
}): Promise<ProviderResult> {
  const model = params.model || DEFAULT_GOOGLE_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const data = await requestJson<any>('Google ' + params.label, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: toGoogleContents(params.messages),
      ...(params.systemPrompt
        ? {
            systemInstruction: {
              role: 'system',
              parts: [{ text: params.systemPrompt }],
            },
          }
        : {}),
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 2000,
      },
    }),
    timeout: params.timeout,
  });

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || '')
      .join('') || '';

  return {
    text,
    raw: data,
    usage: data.usageMetadata,
    finishReason: data.candidates?.[0]?.finishReason,
    model,
    provider: 'google',
  };
}

async function cohereChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout: number;
  label: string;
}): Promise<ProviderResult> {
  const messagePayload = params.messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    content: message.content,
  }));
  const data = await requestJson<any>('Cohere ' + params.label, 'https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_COHERE_MODEL,
      messages: params.systemPrompt
        ? [{ role: 'system', content: params.systemPrompt }, ...messagePayload]
        : messagePayload,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2000,
    }),
    timeout: params.timeout,
  });

  const text =
    data.message?.content?.map((item: any) => item?.text || '').join('') ||
    data.text ||
    '';

  return {
    text,
    raw: data,
    usage: data.usage,
    finishReason: data.finish_reason,
    model: data.model || params.model || DEFAULT_COHERE_MODEL,
    provider: 'cohere',
  };
}

async function mistralChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout: number;
  label: string;
}): Promise<ProviderResult> {
  const data = await requestJson<any>('Mistral ' + params.label, 'https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_MISTRAL_MODEL,
      messages: params.systemPrompt
        ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
        : params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2000,
    }),
    timeout: params.timeout,
  });

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    raw: data,
    usage: data.usage,
    finishReason: data.choices?.[0]?.finish_reason,
    model: data.model || params.model || DEFAULT_MISTRAL_MODEL,
    provider: 'mistral',
  };
}

async function customChat(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout: number;
  label: string;
  baseUrl?: string;
  auth?: Record<string, any>;
}): Promise<ProviderResult> {
  if (!params.baseUrl) {
    throw new Error('Custom LLM calls require config.baseUrl');
  }
  const authHeaders = buildAuthHeaders({
    type: params.auth?.type || 'bearer',
    token: params.auth?.token || params.apiKey,
    apiKey: params.auth?.apiKey || params.apiKey,
    apiKeyHeader: params.auth?.apiKeyHeader,
    username: params.auth?.username,
    password: params.auth?.password,
  });
  return openAIChat({
    apiKey: params.apiKey,
    model: params.model,
    messages: params.messages,
    systemPrompt: params.systemPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    timeout: params.timeout,
    outputFormat: 'text',
    label: params.label,
    baseUrl: params.baseUrl,
    authHeaders,
  });
}

function getProviderPricing(model: string): { input: number; output: number } | undefined {
  if (PRICE_PER_1K_TOKENS[model]) return PRICE_PER_1K_TOKENS[model];

  const normalized = model.toLowerCase();
  const match = Object.entries(PRICE_PER_1K_TOKENS).find(([key]) => {
    const lookup = key.toLowerCase();
    return normalized === lookup || normalized.startsWith(`${lookup}-`) || normalized.endsWith(`/${lookup}`) || normalized.includes(lookup);
  });

  return match?.[1];
}

function extractUsageTotals(usage: any): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: Math.max(0, Math.round(firstFiniteNumber(
      usage?.prompt_tokens,
      usage?.input_tokens,
      usage?.inputTokens,
      usage?.promptTokenCount,
      usage?.prompt_tokens_details?.cached_tokens,
      usage?.inputTokenCount
    ) ?? 0)),
    outputTokens: Math.max(0, Math.round(firstFiniteNumber(
      usage?.completion_tokens,
      usage?.output_tokens,
      usage?.outputTokens,
      usage?.outputTokenCount,
      usage?.candidatesTokenCount,
      usage?.completionTokenCount
    ) ?? 0)),
  };
}

function estimateProviderCost(model: string, usage: any): number {
  const pricing = getProviderPricing(model);
  if (!pricing) return 0;

  const { inputTokens, outputTokens } = extractUsageTotals(usage);
  return Number((((inputTokens / 1000) * pricing.input) + ((outputTokens / 1000) * pricing.output)).toFixed(6));
}

function resolvePrismApiKey(config: Record<string, any>, context: ExecutorContext | undefined, provider: string): string {
  const providerConfig = PRISM_PROVIDERS[provider as keyof typeof PRISM_PROVIDERS];
  const envKeys = PRISM_PROVIDER_ENV_KEYS[provider] ?? (providerConfig ? [providerConfig.envKey] : []);

  try {
    return resolveApiKey(config, context, envKeys, `Prism ${providerConfig?.label || provider}`);
  } catch {
    const envKey = providerConfig?.envKey || envKeys[0] || 'API_KEY';
    const providerLabel = providerConfig?.label || provider;
    throw new Error(`Prism: API key required for ${providerLabel}. Set ${envKey} or provide it in node config.`);
  }
}

export async function prismChat(
  config: Record<string, any>,
  messages: ChatMessage[],
  context?: ExecutorContext
): Promise<ProviderResult> {
  const provider = String(config.provider || 'openai').toLowerCase() === 'gemini'
    ? 'google'
    : String(config.provider || 'openai').toLowerCase();
  const model = normalizeOptionalString(config.model) || DEFAULT_CHAT_MODEL;
  const timeout = getTimeout(config);

  try {
    let result: ProviderResult;

    if (OPENAI_COMPATIBLE_PRISM_PROVIDERS.has(provider)) {
      const apiKey = resolvePrismApiKey(config, context, provider);
      const providerConfig = PRISM_PROVIDERS[provider as keyof typeof PRISM_PROVIDERS];
      const baseUrl = normalizeOptionalString(config.baseUrl) || providerConfig?.baseUrl;
      const authHeaders = provider === 'azure'
        ? { 'api-key': apiKey }
        : undefined;

      if (provider === 'azure' && (!baseUrl || !/\/chat\/completions(\?|$)/.test(baseUrl))) {
        throw new Error('Prism Azure requires a full chat completions endpoint in baseUrl.');
      }

      result = await openAIChat({
        apiKey,
        model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        outputFormat: config.outputFormat,
        label: `Prism ${provider}`,
        baseUrl,
        authHeaders,
        provider,
      });
    } else {
      switch (provider) {
        case 'anthropic':
          result = await anthropicChat({
            apiKey: resolvePrismApiKey(config, context, provider),
            model,
            messages,
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            timeout,
            label: 'Prism anthropic',
          });
          break;
        case 'google':
          result = await googleChat({
            apiKey: resolvePrismApiKey(config, context, provider),
            model,
            messages,
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            timeout,
            label: 'Prism google',
          });
          break;
        case 'mistral':
          result = await mistralChat({
            apiKey: resolvePrismApiKey(config, context, provider),
            model,
            messages,
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            timeout,
            label: 'Prism mistral',
          });
          break;
        case 'cohere':
          result = await cohereChat({
            apiKey: resolvePrismApiKey(config, context, provider),
            model,
            messages,
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            timeout,
            label: 'Prism cohere',
          });
          break;
        default:
          throw new Error(`Prism: Unsupported provider ${provider}`);
      }
    }

    return {
      ...result,
      provider,
      model: result.model || model,
      cost: estimateProviderCost(result.model || model, result.usage),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Prism ${provider}/${model} failed: ${message}`);
  }
}

export async function generateText(
  config: Record<string, any>,
  messages: ChatMessage[],
  label: string,
  context?: ExecutorContext
): Promise<ProviderResult> {
  const provider = (config.provider || 'openai').toLowerCase();
  const timeout = getTimeout(config);
  switch (provider) {
    case 'openai':
      return openAIChat({
        apiKey: resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        outputFormat: config.outputFormat,
        label,
      });
    case 'anthropic':
      return anthropicChat({
        apiKey: resolveApiKey(config, context, ['ANTHROPIC_API_KEY'], 'Anthropic'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        label,
      });
    case 'google':
    case 'gemini':
      return googleChat({
        apiKey: resolveApiKey(config, context, ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'], 'Google'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        label,
      });
    case 'cohere':
      return cohereChat({
        apiKey: resolveApiKey(config, context, ['COHERE_API_KEY'], 'Cohere'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        label,
      });
    case 'mistral':
      return mistralChat({
        apiKey: resolveApiKey(config, context, ['MISTRAL_API_KEY'], 'Mistral'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        label,
      });
    case 'custom':
      return customChat({
        apiKey: resolveApiKey(config, context, ['CUSTOM_LLM_API_KEY'], 'Custom LLM'),
        model: config.model,
        messages,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout,
        label,
        baseUrl: config.baseUrl,
        auth: config.auth,
      });
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

async function createEmbedding(config: Record<string, any>, input: any, context?: ExecutorContext): Promise<any> {
  const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
  const timeout = getTimeout(config);
  const text = composePrompt(config.text, input).trim();
  if (!text) {
    throw new Error('Embedding input text is required');
  }

  const data = await requestJson<any>('OpenAI embedding', 'https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'text-embedding-3-small',
      input: text,
      ...(config.encodingFormat ? { encoding_format: config.encodingFormat } : {}),
    }),
    timeout,
  });

  const embedding = data.data?.[0]?.embedding || [];
  return {
    output: embedding,
    embedding,
    text,
    dimensions: embedding.length,
    usage: data.usage,
    model: data.model || config.model || 'text-embedding-3-small',
    provider: 'openai',
    raw: data,
  };
}

function normalizeVector(value: any): number[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) return value;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'number')) return parsed;
  }
  return null;
}

async function resolveQueryVector(config: Record<string, any>, input: any, context?: ExecutorContext): Promise<{ vector: number[]; sourceText?: string }> {
  const explicitVector = normalizeVector(config.queryVector) || normalizeVector(input?.queryVector) || normalizeVector(input);
  if (explicitVector) {
    return { vector: explicitVector };
  }
  const sourceText = composePrompt(config.query, input, 'Query').trim();
  if (!sourceText) {
    throw new Error('Vector search requires either a queryVector or query text');
  }
  const embedding = await createEmbedding(
    {
      ...config,
      apiKey: config.embeddingApiKey || config.apiKey,
      model: config.embeddingModel || 'text-embedding-3-small',
      text: sourceText,
    },
    undefined,
    context
  );
  return { vector: embedding.embedding, sourceText };
}

function withJsonHeaders(headers?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(headers || {}),
  };
}

async function vectorSearch(config: Record<string, any>, input: any, context?: ExecutorContext): Promise<any> {
  const provider = (config.provider || 'pinecone').toLowerCase();
  const timeout = getTimeout(config);
  const { vector, sourceText } = await resolveQueryVector(config, input, context);
  const topK = Number(config.topK) || 10;
  const threshold = config.threshold !== undefined ? Number(config.threshold) : undefined;

  if (provider === 'pinecone') {
    const endpoint = interpolate(config.endpoint || config.baseUrl || '', { variables: {}, nodeOutputs: {} } as ExecutorContext).replace(/\/$/, '');
    if (!endpoint) throw new Error('Pinecone vector search requires config.endpoint or config.baseUrl');
    const apiKey = resolveApiKey(config, context, ['PINECONE_API_KEY'], 'Pinecone');
    const data = await requestJson<any>('Pinecone vector search', `${endpoint}/query`, {
      method: 'POST',
      headers: withJsonHeaders({ 'Api-Key': apiKey }),
      body: JSON.stringify({
        vector,
        topK,
        includeMetadata: config.includeMetadata ?? true,
        includeValues: config.includeValues ?? false,
        ...(config.namespace ? { namespace: config.namespace } : {}),
      }),
      timeout,
    });
    const matches = data.matches || [];
    return {
      output: matches,
      matches,
      vector,
      sourceText,
      provider: 'pinecone',
      collection: config.collection || config.namespace,
      raw: data,
    };
  }

  if (provider === 'weaviate') {
    const endpoint = (config.endpoint || config.baseUrl || '').replace(/\/$/, '');
    const collection = config.collection || config.className;
    if (!endpoint || !collection) {
      throw new Error('Weaviate vector search requires config.endpoint and config.collection');
    }
    const weaviateApiKey = context?.secrets?.WEAVIATE_API_KEY || context?.envVars?.WEAVIATE_API_KEY || process.env.WEAVIATE_API_KEY || config.apiKey;
    const authHeaders = weaviateApiKey
      ? { Authorization: `Bearer ${weaviateApiKey}` }
      : buildAuthHeaders(config.auth);
    const graphQuery = `{
      Get {
        ${collection}(
          nearVector: { vector: [${vector.join(',')}]${threshold !== undefined ? `, certainty: ${threshold}` : ''} }
          limit: ${topK}
        ) {
          _additional {
            id
            distance
            certainty
          }
        }
      }
    }`;
    const data = await requestJson<any>('Weaviate vector search', `${endpoint}/v1/graphql`, {
      method: 'POST',
      headers: withJsonHeaders(authHeaders),
      body: JSON.stringify({ query: graphQuery }),
      timeout,
    });
    const matches = data.data?.Get?.[collection] || [];
    return {
      output: matches,
      matches,
      vector,
      sourceText,
      provider: 'weaviate',
      collection,
      raw: data,
    };
  }

  if (provider === 'qdrant') {
    const endpoint = (config.endpoint || config.baseUrl || '').replace(/\/$/, '');
    const collection = config.collection;
    if (!endpoint || !collection) {
      throw new Error('Qdrant vector search requires config.endpoint and config.collection');
    }
    const qdrantApiKey = context?.secrets?.QDRANT_API_KEY || context?.envVars?.QDRANT_API_KEY || process.env.QDRANT_API_KEY || config.apiKey;
    const authHeaders = qdrantApiKey
      ? { 'api-key': String(qdrantApiKey) }
      : buildAuthHeaders(config.auth);
    const data = await requestJson<any>('Qdrant vector search', `${endpoint}/collections/${encodeURIComponent(collection)}/points/search`, {
      method: 'POST',
      headers: withJsonHeaders(authHeaders),
      body: JSON.stringify({
        vector,
        limit: topK,
        with_payload: config.includeMetadata ?? true,
        with_vector: config.includeValues ?? false,
        ...(threshold !== undefined ? { score_threshold: threshold } : {}),
      }),
      timeout,
    });
    const matches = data.result || [];
    return {
      output: matches,
      matches,
      vector,
      sourceText,
      provider: 'qdrant',
      collection,
      raw: data,
    };
  }

  throw new Error(`Unsupported vector search provider: ${config.provider}`);
}

function extractBase64Payload(value: string): { mimeType: string; base64: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function loadBinaryInput(source: any, fallbackMimeType: string): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (!source) {
    throw new Error('Binary input is required');
  }
  if (typeof source !== 'string') {
    const text = stringifyValue(source);
    return {
      blob: new Blob([text], { type: fallbackMimeType }),
      filename: `input.${fallbackMimeType.split('/')[1] || 'bin'}`,
      mimeType: fallbackMimeType,
    };
  }

  const dataUri = extractBase64Payload(source);
  if (dataUri) {
    return {
      blob: new Blob([Buffer.from(dataUri.base64, 'base64')], { type: dataUri.mimeType }),
      filename: `input.${dataUri.mimeType.split('/')[1] || 'bin'}`,
      mimeType: dataUri.mimeType,
    };
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await externalRequest('Binary fetch', source, {
      method: 'GET',
      timeout: DEFAULT_TIMEOUT,
    });
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || fallbackMimeType;
    const filenameFromUrl = source.split('/').pop()?.split('?')[0] || `input.${mimeType.split('/')[1] || 'bin'}`;
    return {
      blob: new Blob([arrayBuffer], { type: mimeType }),
      filename: filenameFromUrl,
      mimeType,
    };
  }

  return {
    blob: new Blob([Buffer.from(source, 'base64')], { type: fallbackMimeType }),
    filename: `input.${fallbackMimeType.split('/')[1] || 'bin'}`,
    mimeType: fallbackMimeType,
  };
}

async function runVisionAnalysis(config: Record<string, any>, input: any, taskPrompt: string, label: string, context?: ExecutorContext) {
  const imageSource = config.imageUrl || config.imageBase64 || input?.imageUrl || input?.imageBase64 || input;
  if (!imageSource) throw new Error(`${label} requires an imageUrl, imageBase64, or image input`);
  const provider = (config.provider || 'openai').toLowerCase();
  const prompt = composePrompt(taskPrompt || config.prompt, input?.context, 'Context') || taskPrompt;

  if (provider === 'openai') {
    const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
    const data = await requestJson<any>('OpenAI vision analysis', 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_CHAT_MODEL,
        messages: [
          ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt || 'Analyze this image.' },
              {
                type: 'image_url',
                image_url: {
                  url: String(imageSource),
                  ...(config.imageDetail ? { detail: config.imageDetail } : {}),
                },
              },
            ],
          },
        ],
        temperature: config.temperature ?? 0.2,
        max_tokens: config.maxTokens ?? 2000,
        ...(config.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
      timeout: getTimeout(config),
    });

    return {
      output: parseJsonIfNeeded(data.choices?.[0]?.message?.content ?? '', config.outputFormat),
      text: data.choices?.[0]?.message?.content ?? '',
      provider: 'openai',
      model: data.model || config.model || DEFAULT_CHAT_MODEL,
      usage: data.usage,
      raw: data,
    };
  }

  if (provider === 'anthropic') {
    const apiKey = resolveApiKey(config, context, ['ANTHROPIC_API_KEY'], 'Anthropic');
    const source = extractBase64Payload(String(imageSource));
    const imageContent = source
      ? {
          type: 'image',
          source: {
            type: 'base64',
            media_type: source.mimeType,
            data: source.base64,
          },
        }
      : {
          type: 'image',
          source: {
            type: 'url',
            url: String(imageSource),
          },
        };
    const data = await requestJson<any>('Anthropic vision analysis', 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: config.maxTokens ?? 2000,
        temperature: config.temperature ?? 0.2,
        ...(config.systemPrompt ? { system: config.systemPrompt } : {}),
        messages: [
          {
            role: 'user',
            content: [imageContent, { type: 'text', text: prompt || 'Analyze this image.' }],
          },
        ],
      }),
      timeout: getTimeout(config),
    });

    const text = (data.content || []).map((item: any) => item?.text || '').join('');
    return {
      output: parseJsonIfNeeded(text, config.outputFormat),
      text,
      provider: 'anthropic',
      model: data.model || config.model || DEFAULT_ANTHROPIC_MODEL,
      usage: data.usage,
      raw: data,
    };
  }

  throw new Error(`Unsupported vision provider: ${config.provider}`);
}

export const aiExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.PRISM_LLM]: createAiExecutor('Prism LLM', async ({ config, input, context }) => {
    const prompt = composePrompt(config.prompt ?? config.userPrompt, input, 'Input');
    if (!prompt) throw new Error('Prism LLM requires a prompt input');

    const result = await prismChat(config, [{ role: 'user', content: prompt }], context);

    return {
      output: result.text,
      text: result.text,
      response: result.text,
      prompt,
      usage: result.usage,
      finishReason: result.finishReason,
      provider: result.provider,
      model: result.model,
      cost: result.cost ?? 0,
      raw: result.raw,
    };
  }),

  [NodeType.AI_LLM]: createAiExecutor('AI LLM', async ({ config, input, context, deps, nodeId, nodeName }) => {
    const prompt = composePrompt(config.prompt, input);
    if (!prompt) throw new Error('AI LLM requires a prompt or input');

    const primaryModel = String(config.model || DEFAULT_CHAT_MODEL);
    const configuredFallback = config.retryPolicy?.fallbackModel ? String(config.retryPolicy.fallbackModel) : undefined;
    const fallbackModels = configuredFallback
      ? [configuredFallback, ...getFallbackModels(primaryModel).filter((model) => model !== configuredFallback)]
      : getFallbackModels(primaryModel);

    const result = await withModelFallback(
      (model) => generateText({ ...config, model }, [{ role: 'user', content: prompt }], 'LLM call', context),
      {
        primaryModel,
        fallbackModels: fallbackModels.length > 0 ? fallbackModels : undefined,
        onFallback: (from, to, error) => {
          void logExecution(
            deps,
            nodeId,
            nodeName,
            'warn',
            `Switching LLM model from ${from} to ${to}`,
            context,
            { error: error.message }
          );
        },
      }
    );

    return {
      output: parseJsonIfNeeded(result.text, config.outputFormat),
      prompt,
      response: result.text,
      messages: [{ role: 'user', content: prompt }],
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_CHAT]: createAiExecutor('AI chat', async ({ config, input, context }) => {
    const historySource = config.history ?? config.messages ?? (Array.isArray(input) ? input : input?.history);
    const history = coerceMessages(historySource);
    const userPrompt = composePrompt(config.prompt, Array.isArray(input) ? undefined : input);
    if (!userPrompt) throw new Error('AI chat requires a prompt or chat input');
    const messages = [...history, { role: 'user', content: userPrompt } as ChatMessage];
    const result = await generateText(config, messages, 'chat call', context);
    const assistantMessage = { role: 'assistant', content: result.text } as ChatMessage;
    const updatedHistory = [...messages, assistantMessage];
    return {
      output: result.text,
      prompt: userPrompt,
      response: result.text,
      assistantMessage: result.text,
      messages: updatedHistory,
      history: updatedHistory,
      usage: result.usage,
      finishReason: result.finishReason,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_COMPLETION]: createAiExecutor('AI completion', async ({ config, input, context }) => {
    const prompt = composePrompt(config.prompt || config.text, input);
    if (!prompt) throw new Error('AI completion requires prompt text or input');
    const result = await generateText(config, [{ role: 'user', content: prompt }], 'completion call', context);
    return {
      output: parseJsonIfNeeded(result.text, config.outputFormat),
      prompt,
      response: result.text,
      completion: result.text,
      messages: [{ role: 'user', content: prompt }],
      usage: result.usage,
      finishReason: result.finishReason,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_EMBEDDING]: createAiExecutor('AI embedding', async ({ config, input, context }) => createEmbedding(config, input, context)),

  [NodeType.AI_VECTOR_SEARCH]: createAiExecutor('AI vector search', async ({ config, input, context }) => vectorSearch(config, input, context)),

  [NodeType.AI_CLASSIFICATION]: createAiExecutor('AI classification', async ({ config, input, context }) => {
    const text = composePrompt(config.text, input, 'Text').trim();
    if (!text) throw new Error('AI classification requires text or input');
    const labels = coerceStringArray(config.labels);
    if (labels.length === 0) throw new Error('AI classification requires at least one label');
    const prompt = `${config.prompt || 'Classify the provided text into one of the allowed labels.'}\n\nAllowed labels: ${labels.join(', ')}\n\nReturn JSON with keys label, confidence, and rationale.\n\nText:\n${text}`;
    const result = await generateText({ ...config, outputFormat: 'json' }, [{ role: 'user', content: prompt }], 'classification call', context);
    const parsed = safeJsonParse(result.text) || {};
    return {
      output: parsed,
      classification: parsed,
      labels,
      text,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_SENTIMENT]: createAiExecutor('AI sentiment', async ({ config, input, context }) => {
    const text = composePrompt(config.text, input, 'Text').trim();
    if (!text) throw new Error('AI sentiment requires text or input');
    const prompt = `${config.prompt || 'Analyze the sentiment of the provided text.'}\n\nReturn JSON with keys label (positive, negative, or neutral), score (between -1 and 1), and rationale.\n\nText:\n${text}`;
    const result = await generateText({ ...config, outputFormat: 'json' }, [{ role: 'user', content: prompt }], 'sentiment call', context);
    const parsed = safeJsonParse(result.text) || {};
    return {
      output: parsed,
      sentiment: parsed,
      text,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_SUMMARIZATION]: createAiExecutor('AI summarization', async ({ config, input, context }) => {
    const text = composePrompt(config.text, input, 'Text').trim();
    if (!text) throw new Error('AI summarization requires text or input');
    const length = config.length || 'medium';
    const prompt = `${config.prompt || 'Summarize the provided content.'}\n\nSummary length: ${length}.${config.maxWords ? ` Maximum words: ${config.maxWords}.` : ''}\n\nText:\n${text}`;
    const result = await generateText(config, [{ role: 'user', content: prompt }], 'summarization call', context);
    return {
      output: result.text,
      summary: result.text,
      length,
      text,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_TRANSLATION]: createAiExecutor('AI translation', async ({ config, input, context }) => {
    const text = composePrompt(config.text, input, 'Text').trim();
    if (!text) throw new Error('AI translation requires text or input');
    const targetLanguage = config.targetLanguage || 'English';
    const sourceLanguage = config.sourceLanguage || 'auto-detect';
    const prompt = `${config.prompt || 'Translate the provided text.'}\n\nTranslate from ${sourceLanguage} to ${targetLanguage}. Preserve meaning, tone, formatting, and proper nouns when appropriate.\n\nText:\n${text}`;
    const result = await generateText(config, [{ role: 'user', content: prompt }], 'translation call', context);
    return {
      output: result.text,
      translation: result.text,
      sourceLanguage,
      targetLanguage,
      text,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      raw: result.raw,
    };
  }),

  [NodeType.AI_IMAGE_GEN]: createAiExecutor('AI image generation', async ({ config, input, context }) => {
    const prompt = composePrompt(config.prompt, input).trim();
    if (!prompt) throw new Error('AI image generation requires a prompt or input');
    const provider = (config.provider || 'openai').toLowerCase();
    const timeout = getTimeout(config);

    if (provider === 'openai') {
      const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
      const data = await requestJson<any>('OpenAI image generation', 'https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'dall-e-3',
          prompt,
          size: config.size || '1024x1024',
          quality: config.quality || 'standard',
          style: config.style,
          n: 1,
          response_format: config.responseFormat || 'b64_json',
        }),
        timeout,
      });
      const image = data.data?.[0] || {};
      return {
        output: image.url || image.b64_json || null,
        imageUrl: image.url,
        imageBase64: image.b64_json,
        revisedPrompt: image.revised_prompt,
        provider: 'openai',
        model: data.model || config.model || 'dall-e-3',
        raw: data,
      };
    }

    if (provider === 'stability' || provider === 'stable-diffusion') {
      const apiKey = resolveApiKey(config, context, ['STABILITY_API_KEY'], 'Stability');
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('output_format', config.outputFormat || 'png');
      if (config.aspectRatio) formData.append('aspect_ratio', String(config.aspectRatio));
      if (config.negativePrompt) formData.append('negative_prompt', String(config.negativePrompt));
      const response = await externalRequest('Stability image generation', 'https://api.stability.ai/v2beta/stable-image/generate/core', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'image/*,application/json',
        },
        body: formData,
        timeout,
      });
      const contentType = response.headers.get('content-type') || 'image/png';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return {
          output: data.image || data.artifacts?.[0]?.base64 || null,
          imageBase64: data.image || data.artifacts?.[0]?.base64,
          provider: 'stability',
          model: config.model || 'stable-diffusion',
          raw: data,
        };
      }
      const buffer = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        output: buffer,
        imageBase64: buffer,
        mimeType: contentType,
        provider: 'stability',
        model: config.model || 'stable-diffusion',
      };
    }

    throw new Error(`Unsupported image generation provider: ${config.provider}`);
  }),

  [NodeType.AI_IMAGE_ANALYZE]: createAiExecutor('AI image analysis', async ({ config, input, context }) =>
    runVisionAnalysis(config, input, config.prompt || 'Analyze this image and provide a detailed response.', 'AI image analysis', context)),

  [NodeType.AI_SPEECH_TO_TEXT]: createAiExecutor('AI speech-to-text', async ({ config, input, context }) => {
    const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
    const timeout = getTimeout(config);
    const audioSource = config.audioUrl || config.audioBase64 || input?.audioUrl || input?.audioBase64 || input;
    const file = await loadBinaryInput(audioSource, 'audio/mpeg');
    const formData = new FormData();
    formData.append('file', file.blob, file.filename);
    formData.append('model', config.model || 'whisper-1');
    if (config.prompt) formData.append('prompt', config.prompt);
    if (config.language) formData.append('language', config.language);
    formData.append('response_format', config.responseFormat || 'verbose_json');

    const response = await externalRequest('OpenAI speech-to-text', 'https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      timeout,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return {
        output: data.text || data,
        text: data.text || '',
        language: data.language || config.language,
        durationSeconds: data.duration,
        segments: data.segments,
        provider: 'openai',
        model: config.model || 'whisper-1',
        raw: data,
      };
    }

    const text = await response.text();
    return {
      output: text,
      text,
      provider: 'openai',
      model: config.model || 'whisper-1',
    };
  }),

  [NodeType.AI_TEXT_TO_SPEECH]: createAiExecutor('AI text-to-speech', async ({ config, input, context }) => {
    const provider = (config.provider || 'openai').toLowerCase();
    const text = composePrompt(config.text, input, 'Text').trim();
    if (!text) throw new Error('AI text-to-speech requires text or input');
    const timeout = getTimeout(config);

    if (provider === 'openai') {
      const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
      const response = await externalRequest('OpenAI text-to-speech', 'https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'tts-1',
          voice: config.voice || 'alloy',
          input: text,
          format: config.format || 'mp3',
          speed: config.speed ?? 1,
        }),
        timeout,
      });
      const mimeType = response.headers.get('content-type') || 'audio/mpeg';
      const audioBase64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        output: audioBase64,
        audioBase64,
        mimeType,
        text,
        provider: 'openai',
        model: config.model || 'tts-1',
        voice: config.voice || 'alloy',
      };
    }

    if (provider === 'elevenlabs') {
      const apiKey = resolveApiKey(config, context, ['ELEVENLABS_API_KEY'], 'ElevenLabs');
      const voiceId = config.voiceId || config.voice || context?.secrets?.ELEVENLABS_VOICE_ID || context?.envVars?.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
      if (!voiceId) throw new Error('ElevenLabs text-to-speech requires config.voiceId or config.voice');
      const response = await externalRequest('ElevenLabs text-to-speech', `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(String(voiceId))}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: config.model || 'eleven_multilingual_v2',
          voice_settings: {
            stability: config.stability ?? 0.5,
            similarity_boost: config.similarityBoost ?? 0.75,
            style: config.style ?? 0,
            use_speaker_boost: config.useSpeakerBoost ?? true,
          },
        }),
        timeout,
      });
      const mimeType = response.headers.get('content-type') || 'audio/mpeg';
      const audioBase64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        output: audioBase64,
        audioBase64,
        mimeType,
        text,
        provider: 'elevenlabs',
        model: config.model || 'eleven_multilingual_v2',
        voiceId,
      };
    }

    throw new Error(`Unsupported text-to-speech provider: ${config.provider}`);
  }),

  [NodeType.AI_OCR]: createAiExecutor('AI OCR', async ({ config, input, context }) => {
    const provider = (config.provider || 'openai').toLowerCase();
    if (provider === 'openai' || provider === 'anthropic') {
      const result = await runVisionAnalysis(
        { ...config, outputFormat: 'json' },
        input,
        config.prompt || 'Extract all readable text from this image. Return JSON with keys text, lines, confidence, and language if identifiable.',
        'AI OCR',
        context
      );
      return {
        ...result,
        output: safeJsonParse(result.text),
        text: result.text,
      };
    }

    if (provider === 'tesseract') {
      const endpoint = config.endpoint || config.baseUrl;
      if (!endpoint) throw new Error('Tesseract OCR requires config.endpoint or config.baseUrl');
      const imageSource = config.imageUrl || config.imageBase64 || input?.imageUrl || input?.imageBase64 || input;
      if (!imageSource) throw new Error('Tesseract OCR requires image input');
      const authHeaders = buildAuthHeaders({
        type: config.auth?.type || 'bearer',
        token: config.auth?.token,
        apiKey: context?.secrets?.TESSERACT_API_KEY || context?.envVars?.TESSERACT_API_KEY || process.env.TESSERACT_API_KEY || config.auth?.apiKey || config.apiKey,
        apiKeyHeader: config.auth?.apiKeyHeader,
        username: config.auth?.username,
        password: config.auth?.password,
      });
      const data = await requestJson<any>('Tesseract OCR', endpoint, {
        method: 'POST',
        headers: withJsonHeaders(authHeaders),
        body: JSON.stringify({
          imageUrl: /^https?:\/\//i.test(String(imageSource)) ? imageSource : undefined,
          imageBase64: /^https?:\/\//i.test(String(imageSource)) ? undefined : imageSource,
          language: config.language,
          options: config.options,
        }),
        timeout: getTimeout(config),
      });
      return {
        output: data.text || data,
        text: data.text || stringifyValue(data),
        lines: data.lines,
        confidence: data.confidence,
        provider: 'tesseract',
        raw: data,
      };
    }

    throw new Error(`Unsupported OCR provider: ${config.provider}`);
  }),

  [NodeType.AI_MODERATION]: createAiExecutor('AI moderation', async ({ config, input, context }) => {
    const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY'], 'OpenAI');
    const text = composePrompt(config.text, input, 'Content').trim();
    if (!text) throw new Error('AI moderation requires text or input');
    const data = await requestJson<any>('OpenAI moderation', 'https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'omni-moderation-latest',
        input: text,
      }),
      timeout: getTimeout(config),
    });
    const result = data.results?.[0] || {};
    return {
      output: result,
      flagged: result.flagged ?? false,
      categories: result.categories || {},
      categoryScores: result.category_scores || {},
      provider: 'openai',
      model: data.model || config.model || 'omni-moderation-latest',
      raw: data,
    };
  }),
};
