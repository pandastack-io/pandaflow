/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'buffer';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { interpolateDeep, withRetry, fetchWithTimeout, resolveNodeInput, safeJsonParse } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type CommExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

type ParsedAddress = {
  email: string;
  name?: string;
};

const DEFAULT_TIMEOUT = 30000;

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

function createExecutor(name: string, handler: CommExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} communication executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} communication executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${name} communication error`;
      await safeLog(deps, node, 'error', message, context, {
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  };
}

function parseConfigValue<T = any>(value: any, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return (parsed === value ? fallback : parsed) as T;
  }
  return value as T;
}

function toRecord(value: any): Record<string, any> {
  const parsed = parseConfigValue<Record<string, any>>(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  const parsed = parseConfigValue<any[]>(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function toString(value: any): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function toStringRecord(value: any): Record<string, string> {
  return Object.fromEntries(
    Object.entries(toRecord(value)).map(([key, entry]) => [String(key), String(entry ?? '')])
  );
}

function toStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (value === undefined || value === null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function getResolvedConfig(node: WorkflowNode, context: ExecutorContext): Record<string, any> {
  const rawConfig = node.data.config || {};
  const resolvedInput = resolveNodeInput(context, rawConfig.inputVariable);
  const parsedInput = interpolateDeep(parseConfigValue(resolvedInput, resolvedInput), context);
  const mergedInput = parsedInput && typeof parsedInput === 'object' && !Array.isArray(parsedInput) ? parsedInput : {};
  const resolvedConfig = interpolateDeep(rawConfig, context);
  return {
    ...mergedInput,
    ...resolvedConfig,
  };
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Received malformed JSON response from upstream communication service');
    }
  }

  return safeJsonParse(text);
}

function describeBody(body: any): string {
  if (body === undefined || body === null) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 1000);
  try {
    return JSON.stringify(body).slice(0, 1000);
  } catch {
    return String(body).slice(0, 1000);
  }
}

async function sendRequest(
  label: string,
  url: string,
  init: RequestInit & { timeout?: number },
  retries = 1
): Promise<{ response: Response; body: any }> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, init);
      const body = await parseResponseBody(response);

      if (!response.ok) {
        const error = new Error(
          `${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      return { response, body };
    },
    {
      maxAttempts: Math.max(1, retries),
      retryOn: (error) => {
        const status = (error as Error & { status?: number }).status;
        return status === undefined || status === 408 || status === 425 || status === 429 || status >= 500;
      },
    }
  );
}

function parseAddress(value: string): ParsedAddress {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return { email: trimmed };
  }

  const name = match[1]?.trim().replace(/^"|"$/g, '');
  return {
    email: match[2].trim(),
    ...(name ? { name } : {}),
  };
}

function parseAddresses(value: any): ParsedAddress[] {
  return toStringArray(value).map(parseAddress);
}

function formatSendGridAddresses(value: any) {
  return parseAddresses(value).map((entry) => ({
    email: entry.email,
    ...(entry.name ? { name: entry.name } : {}),
  }));
}

function buildEmailMessage(config: Record<string, any>) {
  const from = toString(config.from);
  const fromName = toString(config.fromName);
  const subject = toString(config.subject);
  const text = toString(config.text ?? config.body);
  const html = toString(config.html);
  const replyTo = toString(config.replyTo);
  const tags = toStringArray(config.tags);
  const metadata = toRecord(config.metadata);
  const messageHeaders = toStringRecord(config.messageHeaders ?? config.headers);
  const attachments = toArray(config.attachments);

  return {
    from,
    fromName,
    to: toStringArray(config.to),
    cc: toStringArray(config.cc),
    bcc: toStringArray(config.bcc),
    subject,
    text,
    html,
    replyTo,
    tags,
    metadata,
    messageHeaders,
    attachments,
    templateId: toString(config.templateId),
    templateData: toRecord(config.templateData),
    templateName: toString(config.templateName ?? config.template),
  };
}

function getTimeout(config: Record<string, any>): number {
  return Number(config.timeout || DEFAULT_TIMEOUT);
}

function getRetries(config: Record<string, any>): number {
  return Number(config.retries || 1);
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireOneOf(values: string[], label: string): string[] {
  if (values.length === 0) {
    throw new Error(`At least one ${label} is required`);
  }
  return values;
}

function inferEmailProvider(config: Record<string, any>): 'smtp' | 'sendgrid' | 'mailgun' {
  const provider = String(config.provider || config.emailProvider || '').toLowerCase();
  if (provider === 'smtp' || provider === 'sendgrid' || provider === 'mailgun') {
    return provider;
  }
  if (config.apiUrl || config.transportUrl || config.smtpHost || config.host) return 'smtp';
  if (config.domain) return 'mailgun';
  return 'sendgrid';
}

async function sendViaSmtpBridge(config: Record<string, any>) {
  const message = buildEmailMessage(config);
  const apiUrl = requireValue(toString(config.apiUrl ?? config.transportUrl ?? config.endpoint), 'SMTP bridge API URL');
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...toStringRecord(config.requestHeaders),
  };

  const bridgeApiKey = toString(config.apiKey ?? config.bridgeApiKey);
  const bridgeToken = toString(config.bridgeToken);
  const bridgeUsername = toString(config.bridgeUsername);
  const bridgePassword = toString(config.bridgePassword);

  if (bridgeApiKey) {
    requestHeaders.Authorization = `Bearer ${bridgeApiKey}`;
  } else if (bridgeToken) {
    requestHeaders.Authorization = `Bearer ${bridgeToken}`;
  } else if (bridgeUsername || bridgePassword) {
    requestHeaders.Authorization = `Basic ${Buffer.from(`${bridgeUsername || ''}:${bridgePassword || ''}`).toString('base64')}`;
  }

  const payload = {
    operation: String(config.operation || 'send').toLowerCase(),
    smtp: {
      host: toString(config.smtpHost ?? config.host),
      port: Number(config.smtpPort ?? config.port ?? 587),
      secure: Boolean(config.secure),
      username: toString(config.smtpUsername ?? config.username),
      password: toString(config.smtpPassword ?? config.password),
    },
    message,
    options: {
      timeout: getTimeout(config),
      tracking: Boolean(config.tracking),
    },
    extraPayload: toRecord(config.extraPayload),
  };

  const { response, body } = await sendRequest(
    'SMTP bridge request',
    apiUrl,
    {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  return {
    output: body?.messageId || body?.id || body?.result || body,
    provider: 'smtp',
    operation: payload.operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function sendViaSendGrid(config: Record<string, any>) {
  const message = buildEmailMessage(config);
  const apiKey = requireValue(toString(config.apiKey), 'SendGrid API key');
  const from = requireValue(message.from, 'SendGrid from address');
  const to = requireOneOf(message.to, 'SendGrid recipient');
  const operation = String(config.operation || 'send').toLowerCase();
  const fromAddress = parseAddress(from);
  const replyToAddress = message.replyTo ? parseAddress(message.replyTo) : undefined;
  const personalizations: Record<string, any>[] = [
    {
      to: formatSendGridAddresses(to),
      ...(message.cc.length ? { cc: formatSendGridAddresses(message.cc) } : {}),
      ...(message.bcc.length ? { bcc: formatSendGridAddresses(message.bcc) } : {}),
      ...(Object.keys(message.metadata).length ? { custom_args: message.metadata } : {}),
      ...(operation === 'template' && Object.keys(message.templateData).length
        ? { dynamic_template_data: message.templateData }
        : {}),
    },
  ];

  const payload: Record<string, any> = {
    personalizations,
    from: {
      email: fromAddress.email,
      ...(message.fromName ? { name: message.fromName } : fromAddress.name ? { name: fromAddress.name } : {}),
    },
    ...(replyToAddress ? { reply_to: { email: replyToAddress.email } } : {}),
    ...(Object.keys(message.messageHeaders).length ? { headers: message.messageHeaders } : {}),
    ...(message.tags.length ? { categories: message.tags.slice(0, 10) } : {}),
    ...(message.attachments.length ? { attachments: message.attachments } : {}),
  };

  if (operation === 'template') {
    payload.template_id = requireValue(message.templateId, 'SendGrid template ID');
  } else {
    payload.subject = requireValue(message.subject, 'SendGrid subject');
    payload.content = [
      ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
      ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
    ];

    if (!payload.content.length) {
      throw new Error('SendGrid message text or html content is required');
    }
  }

  const { response, body } = await sendRequest(
    'SendGrid request',
    'https://api.sendgrid.com/v3/mail/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  const output = body || {
    accepted: true,
    messageId: response.headers.get('x-message-id'),
  };

  return {
    output,
    provider: 'sendgrid',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function sendViaMailgun(config: Record<string, any>) {
  const message = buildEmailMessage(config);
  const apiKey = requireValue(toString(config.apiKey), 'Mailgun API key');
  const domain = requireValue(toString(config.domain), 'Mailgun domain');
  const endpointBase = toString(config.apiBaseUrl) || 'https://api.mailgun.net';
  const operation = String(config.operation || 'send').toLowerCase();
  const params = new URLSearchParams();

  params.set('from', requireValue(message.from, 'Mailgun from address'));
  requireOneOf(message.to, 'Mailgun recipient').forEach((entry) => params.append('to', entry));
  message.cc.forEach((entry) => params.append('cc', entry));
  message.bcc.forEach((entry) => params.append('bcc', entry));
  if (message.replyTo) params.append('h:Reply-To', message.replyTo);
  Object.entries(message.messageHeaders).forEach(([key, value]) => params.append(`h:${key}`, value));
  message.tags.forEach((entry) => params.append('o:tag', entry));
  Object.entries(message.metadata).forEach(([key, value]) =>
    params.append(`v:${key}`, typeof value === 'string' ? value : JSON.stringify(value))
  );

  if (operation === 'template') {
    params.set('template', requireValue(message.templateName || message.templateId, 'Mailgun template name'));
    if (Object.keys(message.templateData).length) {
      params.set('t:variables', JSON.stringify(message.templateData));
    }
    if (message.subject) params.set('subject', message.subject);
  } else {
    params.set('subject', requireValue(message.subject, 'Mailgun subject'));
    if (message.text) params.set('text', message.text);
    if (message.html) params.set('html', message.html);
    if (!message.text && !message.html) {
      throw new Error('Mailgun message text or html content is required');
    }
  }

  const { response, body } = await sendRequest(
    'Mailgun request',
    `${endpointBase.replace(/\/$/, '')}/v3/${domain}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  return {
    output: body?.id || body,
    provider: 'mailgun',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function executeEmail(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const provider = inferEmailProvider(config);

  if (provider === 'smtp') return sendViaSmtpBridge(config);
  if (provider === 'mailgun') return sendViaMailgun(config);
  return sendViaSendGrid(config);
}

async function executeSmtp(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  return sendViaSmtpBridge(getResolvedConfig(node, context));
}

async function executeSendGrid(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  return sendViaSendGrid(getResolvedConfig(node, context));
}

async function executeMailgun(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  return sendViaMailgun(getResolvedConfig(node, context));
}

async function executeSlack(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const operation = String(config.operation || 'chat.postMessage').toLowerCase();
  const payload = {
    channel: toString(config.channel),
    text: requireValue(toString(config.text ?? config.body), 'Slack text'),
    blocks: toArray(config.blocks),
    attachments: toArray(config.attachments),
    thread_ts: toString(config.threadTs),
    username: toString(config.username),
    icon_emoji: toString(config.iconEmoji),
    metadata: Object.keys(toRecord(config.metadata)).length
      ? { event_type: 'workflow_execution', event_payload: toRecord(config.metadata) }
      : undefined,
  };

  if (operation === 'webhook') {
    const webhookUrl = requireValue(toString(config.webhookUrl), 'Slack webhook URL');
    const { response, body } = await sendRequest(
      'Slack webhook request',
      webhookUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: getTimeout(config),
      },
      getRetries(config)
    );

    return {
      output: body || { posted: true },
      provider: 'slack',
      operation,
      status: response.status,
      headers: responseHeaders(response),
      data: body,
    };
  }

  const token = requireValue(toString(config.botToken ?? config.token), 'Slack bot token');
  const { response, body } = await sendRequest(
    'Slack API request',
    'https://slack.com/api/chat.postMessage',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  if (body?.ok === false) {
    throw new Error(`Slack API request failed: ${describeBody(body)}`);
  }

  return {
    output: body?.message || body,
    provider: 'slack',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function executeDiscord(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const operation = String(config.operation || 'webhook').toLowerCase();
  const payload = {
    content: requireValue(toString(config.content ?? config.text ?? config.body), 'Discord content'),
    username: toString(config.username),
    avatar_url: toString(config.avatarUrl),
    tts: Boolean(config.tts),
    embeds: toArray(config.embeds),
    components: toArray(config.components),
    allowed_mentions: Object.keys(toRecord(config.allowedMentions)).length ? toRecord(config.allowedMentions) : undefined,
  };

  if (operation === 'channelmessage') {
    const token = requireValue(toString(config.botToken ?? config.token), 'Discord bot token');
    const channelId = requireValue(toString(config.channelId), 'Discord channel ID');
    const { response, body } = await sendRequest(
      'Discord channel message request',
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: getTimeout(config),
      },
      getRetries(config)
    );

    return {
      output: body,
      provider: 'discord',
      operation,
      status: response.status,
      headers: responseHeaders(response),
      data: body,
    };
  }

  const webhookUrl = requireValue(toString(config.webhookUrl), 'Discord webhook URL');
  const wait = config.waitResponse === undefined ? true : Boolean(config.waitResponse);
  const requestUrl = new URL(webhookUrl);
  requestUrl.searchParams.set('wait', wait ? 'true' : 'false');
  const { response, body } = await sendRequest(
    'Discord webhook request',
    requestUrl.toString(),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  return {
    output: body || { posted: true },
    provider: 'discord',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function executeTelegram(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const operation = String(config.operation || 'sendMessage');
  const botToken = requireValue(toString(config.botToken ?? config.token), 'Telegram bot token');
  const chatId = requireValue(toString(config.chatId), 'Telegram chat ID');
  const payload: Record<string, any> = {
    chat_id: chatId,
    parse_mode: toString(config.parseMode),
    disable_web_page_preview:
      config.disableWebPagePreview === undefined ? undefined : Boolean(config.disableWebPagePreview),
    reply_markup: Object.keys(toRecord(config.replyMarkup)).length ? toRecord(config.replyMarkup) : undefined,
  };

  if (operation === 'sendPhoto') {
    payload.photo = requireValue(toString(config.photo), 'Telegram photo URL or file_id');
    payload.caption = toString(config.caption ?? config.text ?? config.body);
  } else {
    payload.text = requireValue(toString(config.text ?? config.body), 'Telegram message text');
  }

  const { response, body } = await sendRequest(
    'Telegram request',
    `https://api.telegram.org/bot${botToken}/${operation}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  if (body?.ok === false) {
    throw new Error(`Telegram request failed: ${describeBody(body)}`);
  }

  return {
    output: body?.result || body,
    provider: 'telegram',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

async function sendViaTwilio(config: Record<string, any>, forcedOperation?: 'sms' | 'call' | 'whatsapp') {
  const accountSid = requireValue(toString(config.accountSid), 'Twilio account SID');
  const authToken = requireValue(toString(config.authToken), 'Twilio auth token');
  const operation = (forcedOperation || String(config.operation || 'sms').toLowerCase()) as 'sms' | 'call' | 'whatsapp';
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const params = new URLSearchParams();
  const from = requireValue(toString(config.from), 'Twilio from number');
  const to = requireValue(toString(config.to), 'Twilio destination number');

  if (operation === 'call') {
    params.set('To', to);
    params.set('From', from);
    if (config.twiml) {
      params.set('Twiml', String(config.twiml));
    } else {
      params.set('Url', requireValue(toString(config.url), 'Twilio call URL'));
      if (config.method) params.set('Method', String(config.method).toUpperCase());
    }
  } else {
    const toValue = operation === 'whatsapp' && !String(to).startsWith('whatsapp:') ? `whatsapp:${to}` : String(to);
    const fromValue =
      operation === 'whatsapp' && !String(from).startsWith('whatsapp:') ? `whatsapp:${from}` : String(from);
    params.set('To', toValue);
    params.set('From', fromValue);
    params.set('Body', requireValue(toString(config.body ?? config.text), 'Twilio message body'));
    if (config.messagingServiceSid) params.set('MessagingServiceSid', String(config.messagingServiceSid));
    if (config.statusCallback) params.set('StatusCallback', String(config.statusCallback));
    toStringArray(config.mediaUrl).forEach((entry) => params.append('MediaUrl', entry));
  }

  const resource = operation === 'call' ? 'Calls.json' : 'Messages.json';
  const { response, body } = await sendRequest(
    `Twilio ${operation} request`,
    `${baseUrl}/${resource}`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(accountSid, authToken),
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  return {
    output: body,
    provider: 'twilio',
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function executeTwilio(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  return sendViaTwilio(getResolvedConfig(node, context));
}

async function executeWhatsApp(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const provider = String(config.provider || 'meta').toLowerCase();
  const operation = String(config.operation || 'text').toLowerCase();

  if (provider === 'twilio') {
    const twilioConfig = {
      ...config,
      operation: 'whatsapp',
      body: config.body ?? config.text,
    };
    return sendViaTwilio(twilioConfig, 'whatsapp');
  }

  const accessToken = requireValue(toString(config.accessToken), 'WhatsApp access token');
  const phoneNumberId = requireValue(toString(config.phoneNumberId), 'WhatsApp phone number ID');
  const to = requireValue(toString(config.to), 'WhatsApp recipient');
  const payload: Record<string, any> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
  };

  if (operation === 'template') {
    payload.type = 'template';
    payload.template = {
      name: requireValue(toString(config.templateName ?? config.template), 'WhatsApp template name'),
      language: { code: toString(config.languageCode) || 'en_US' },
      ...(toArray(config.components).length ? { components: toArray(config.components) } : {}),
    };
  } else {
    payload.type = 'text';
    payload.text = {
      body: requireValue(toString(config.body ?? config.text), 'WhatsApp message body'),
      preview_url: Boolean(config.previewUrl),
    };
  }

  const { response, body } = await sendRequest(
    'WhatsApp request',
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: getTimeout(config),
    },
    getRetries(config)
  );

  return {
    output: body?.messages || body,
    provider: 'whatsapp',
    transport: provider,
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
  };
}

async function executeSms(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getResolvedConfig(node, context);
  const provider = String(config.provider || 'twilio').toLowerCase();

  if (provider !== 'twilio') {
    throw new Error(`Unsupported SMS provider "${provider}". Expected: twilio`);
  }

  return sendViaTwilio(
    {
      ...config,
      operation: 'sms',
    },
    'sms'
  );
}

export const integrationCommExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_EMAIL]: createExecutor('Email', executeEmail),
  [NodeType.INTEGRATION_SMTP]: createExecutor('SMTP', executeSmtp),
  [NodeType.INTEGRATION_SENDGRID]: createExecutor('SendGrid', executeSendGrid),
  [NodeType.INTEGRATION_MAILGUN]: createExecutor('Mailgun', executeMailgun),
  [NodeType.INTEGRATION_SLACK]: createExecutor('Slack', executeSlack),
  [NodeType.INTEGRATION_DISCORD]: createExecutor('Discord', executeDiscord),
  [NodeType.INTEGRATION_TELEGRAM]: createExecutor('Telegram', executeTelegram),
  [NodeType.INTEGRATION_WHATSAPP]: createExecutor('WhatsApp', executeWhatsApp),
  [NodeType.INTEGRATION_TWILIO]: createExecutor('Twilio', executeTwilio),
  [NodeType.INTEGRATION_SMS]: createExecutor('SMS', executeSms),
};
