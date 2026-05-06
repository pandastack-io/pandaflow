/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node, Edge } from 'reactflow';
import { NodeCategory, NodeType, WorkflowNodeData } from '@/types/nodes';
import { SandboxManager } from '@/lib/sandflare/manager';
import type { ExecutionOptions } from '@/lib/sandflare/types';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolate,
  interpolateDeep,
  resolveNodeInput,
  safeJsonParse,
  withRetry,
  fetchWithTimeout,
  buildAuthHeaders,
} from './utils';
import { generateText, type ChatMessage } from './ai';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type GenericConfig = Record<string, any>;
type AgentMessage = ChatMessage | { role: 'tool'; content: string; tool_call_id?: string } | { role: 'assistant'; content: string | null; tool_calls?: any[] };

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, any>;
  _nodeId: string;
  code?: string;
  language?: string;
  timeout?: number;
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o';

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getNodeName(node: WorkflowNode, fallback: string): string {
  return node.data?.config?.label || node.data?.type || fallback;
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

function flattenContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || '').join('');
  }
  return stringifyValue(content);
}

function getInput(config: GenericConfig, context: ExecutorContext): any {
  const input = resolveNodeInput(context, config.inputVariable);
  if (input !== undefined) return input;
  return config.input;
}

function normalizeMessage(message: any): AgentMessage | null {
  if (!message) return null;
  if (typeof message === 'string') return { role: 'user', content: message };
  const role = message.role === 'system' || message.role === 'assistant' || message.role === 'tool' ? message.role : 'user';
  const content = role === 'assistant' && message.content == null ? null : flattenContent(message.content ?? message.text ?? message.message ?? '');
  return { ...message, role, content } as AgentMessage;
}

function normalizeMessages(value: any): AgentMessage[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : typeof value === 'string' ? safeJsonParse(value) : [value];
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeMessage(item)).filter((item): item is AgentMessage => Boolean(item));
}

function trimMessages(messages: AgentMessage[], maxMessages = 20): AgentMessage[] {
  return maxMessages > 0 && messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
}

async function safeLog(
  deps: ExecutorDeps,
  node: WorkflowNode,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(node.id, getNodeName(node, node.id), level, message, data, context);
  } catch {
    // Ignore logging errors.
  }
}

function createExecutor(name: string, handler: NodeExecutorFn): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'info', `${name} started`, context);
    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await safeLog(deps, node, 'error', error instanceof Error ? error.message : `${name} failed`, context, {
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}


function resolveCredential(
  config: GenericConfig,
  context: ExecutorContext,
  configKeys: string[],
  envKeys: string[]
): string {
  for (const key of envKeys) {
    const value = context.secrets?.[key] || context.envVars?.[key] || process.env[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  for (const key of configKeys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function getNodeById(definition: WorkflowDefinition, nodeId?: string | null): WorkflowNode | undefined {
  if (!nodeId) return undefined;
  return definition.nodes.find((candidate) => candidate.id === nodeId);
}

function getConnectedNodes(node: WorkflowNode, definition: WorkflowDefinition, type?: NodeType): WorkflowNode[] {
  const connectedIds = new Set<string>();
  for (const edge of definition.edges) {
    if (edge.source === node.id) connectedIds.add(edge.target);
    if (edge.target === node.id) connectedIds.add(edge.source);
  }
  return definition.nodes.filter((candidate) => connectedIds.has(candidate.id) && (!type || candidate.data.type === type));
}

function isDependencyEdge(edge: Edge, role?: 'model' | 'memory' | 'tool'): boolean {
  if (!edge.data?.isDependency) {
    return false;
  }

  return role ? edge.targetHandle === role : true;
}

function getDependencySourceNodes(node: WorkflowNode, definition: WorkflowDefinition, role: 'model' | 'memory' | 'tool'): WorkflowNode[] {
  const sourceIds = definition.edges
    .filter((edge) => edge.target === node.id && isDependencyEdge(edge, role))
    .map((edge) => edge.source);

  return definition.nodes.filter((candidate) => sourceIds.includes(candidate.id));
}

function isToolNode(node: WorkflowNode): boolean {
  return node.data.type === NodeType.AGENT_TOOL || node.data.category === NodeCategory.TOOL || node.data.category === NodeCategory.INTEGRATION;
}

function resolveModelOverrides(modelNode: WorkflowNode, context: ExecutorContext): GenericConfig {
  const modelConfig = getConfig(modelNode, context);
  const providerOverrides: Partial<GenericConfig> = {};

  if (!modelConfig.provider) {
    if (modelNode.data.type === NodeType.AI_ANTHROPIC) {
      providerOverrides.provider = 'anthropic';
    } else if (modelNode.data.type === NodeType.AI_MISTRAL) {
      providerOverrides.provider = 'mistral';
    }
  }

  return {
    ...providerOverrides,
    ...modelConfig,
  };
}

function resolveAgentConfig(node: WorkflowNode, definition: WorkflowDefinition, context: ExecutorContext): GenericConfig {
  const config = getConfig(node, context);
  const modelNode = getDependencySourceNodes(node, definition, 'model')[0];
  if (modelNode) {
    const modelConfig = resolveModelOverrides(modelNode, context);
    for (const key of ['provider', 'model', 'systemPrompt', 'temperature', 'maxTokens', 'outputFormat', 'streaming', 'apiKey', 'baseUrl', 'auth', 'timeout']) {
      if (modelConfig[key] !== undefined) {
        config[key] = modelConfig[key];
      }
    }
  }

  const memoryNode = getDependencySourceNodes(node, definition, 'memory')[0];
  if (memoryNode) {
    const memoryConfig = getConfig(memoryNode, context);
    config.memoryNodeId = memoryNode.id;
    config.memoryType = memoryNode.data.type;
    config.memoryConfig = memoryConfig;
  }

  const toolNodes = getDependencySourceNodes(node, definition, 'tool').filter(isToolNode);
  if (toolNodes.length > 0) {
    config.tools = toolNodes.map((toolNode) => toolNode.id);
  }

  return config;
}

function createToolDefinition(node: WorkflowNode, context: ExecutorContext): ToolDefinition {
  const config = getConfig(node, context);
  const hasCode = typeof config.code === 'string' && config.code.trim().length > 0;
  const definition: ToolDefinition = {
    name: String(config.name || config.label || node.data?.config?.name || getNodeName(node, `tool_${node.id}`)).trim(),
    description: String(config.description || `${getNodeName(node, 'Workflow Tool')} workflow tool`).trim(),
    parameters:
      typeof config.parameters === 'string'
        ? safeJsonParse(config.parameters)
        : config.parameters || { type: 'object', properties: {}, additionalProperties: true },
    _nodeId: node.id,
    code: hasCode ? String(config.code) : undefined,
    language: hasCode ? String(config.language || 'nodejs').toLowerCase() : undefined,
    timeout: Number(config.timeout) || 30000,
  };
  return definition;
}

function registerToolDefinition(definition: ToolDefinition, context: ExecutorContext) {
  context.variables[`tool_${definition._nodeId}_definition`] = definition;
  context.variables[`tool_${definition.name}_definition`] = definition;
  context.variables[`tool_def_${definition.name}`] = definition;
}

function registerConnectedTools(node: WorkflowNode, definition: WorkflowDefinition, context: ExecutorContext): ToolDefinition[] {
  const toolNodes = getDependencySourceNodes(node, definition, 'tool').filter(isToolNode);
  const toolDefinitions = toolNodes.map((toolNode) => createToolDefinition(toolNode, context));
  toolDefinitions.forEach((toolDefinition) => registerToolDefinition(toolDefinition, context));
  return toolDefinitions;
}

function getToolDefinitionByName(name: string, context: ExecutorContext): ToolDefinition | undefined {
  const direct = context.variables[`tool_def_${name}`] || context.variables[`tool_${name}_definition`];
  if (direct) return direct as ToolDefinition;
  return Object.values(context.variables).find((value) => value && typeof value === 'object' && (value as ToolDefinition).name === name) as ToolDefinition | undefined;
}

function createExecutionEnvironment(context: ExecutorContext, args: Record<string, any>) {
  return {
    TOOL_ARGS: JSON.stringify(args ?? {}),
    TOOL_CONTEXT: JSON.stringify({
      executionId: context.executionId,
      variables: context.variables,
      nodeOutputs: context.nodeOutputs,
    }),
  };
}

function indentPython(code: string): string {
  return code
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function buildNodeToolCode(toolDefinition: ToolDefinition): { code: string; language: ExecutionOptions['language'] } {
  const language = (toolDefinition.language || 'nodejs').toLowerCase();
  if (language === 'python') {
    return {
      language: 'python',
      code: `import json\nimport os\n\nargs = json.loads(os.environ.get('TOOL_ARGS', '{}'))\ncontext = json.loads(os.environ.get('TOOL_CONTEXT', '{}'))\ninput = args\n\ndef run(args, input, context):\n${indentPython(toolDefinition.code || 'return args')}\n\nresult = run(args, input, context)\nif isinstance(result, str):\n    print(result)\nelse:\n    print(json.dumps(result))`,
    };
  }

  return {
    language: 'nodejs',
    code: `const args = JSON.parse(process.env.TOOL_ARGS || '{}');\nconst context = JSON.parse(process.env.TOOL_CONTEXT || '{}');\nconst input = args;\nconst run = async (args, input, context) => {\n${toolDefinition.code || 'return args;'}\n};\nPromise.resolve(run(args, input, context))\n  .then((result) => {\n    if (typeof result === 'string') {\n      console.log(result);\n      return;\n    }\n    console.log(JSON.stringify(result ?? null));\n  })\n  .catch((error) => {\n    console.error(error?.stack || error?.message || String(error));\n    process.exit(1);\n  });`,
  };
}

async function evaluateNodeTool(toolDefinition: ToolDefinition, args: Record<string, any>, context: ExecutorContext): Promise<any> {
  const compiled = new Function(
    'args',
    'input',
    'context',
    `'use strict';\nreturn (async () => {\n${toolDefinition.code || 'return args;'}\n})();`
  );
  return compiled(args, args, {
    executionId: context.executionId,
    variables: context.variables,
    nodeOutputs: context.nodeOutputs,
  });
}

async function executeToolByName(name: string, args: Record<string, any>, context: ExecutorContext): Promise<any> {
  const toolDefinition = getToolDefinitionByName(name, context);
  if (!toolDefinition) {
    throw new Error(`Tool not found: ${name}`);
  }

  if (!toolDefinition.code) {
    return { ok: true, args };
  }

  if (toolDefinition.language === 'nodejs' && !context.sandbox) {
    return evaluateNodeTool(toolDefinition, args, context);
  }

  const manager = new SandboxManager({
    provider: 'auto',
    sandflareApiKey: resolveCredential(toolDefinition as GenericConfig, context, ['apiKey'], ['SANDFLARE_API_KEY']),
    fallbackToMock: true,
  });

  const built = buildNodeToolCode(toolDefinition);
  const environment = createExecutionEnvironment(context, args);

  if (context.sandbox) {
    const result = await context.sandbox.provider.executeSandbox(context.sandbox.id, {
      code: built.code,
      language: built.language,
      timeout: toolDefinition.timeout,
      environment,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Tool ${name} failed with exit code ${result.exitCode}`);
    }
    return safeJsonParse(result.stdout.trim());
  }

  const result = await manager.executeCode(built.language as 'python' | 'nodejs' | 'go' | 'rust' | 'bash', built.code, {
    timeout: toolDefinition.timeout,
    environment,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Tool ${name} failed with exit code ${result.exitCode}`);
  }

  return safeJsonParse(result.stdout.trim());
}

function resolveMemoryAliases(memoryNodeId: string | undefined, definition: WorkflowDefinition, context: ExecutorContext): string[] {
  const aliases = new Set<string>();
  if (memoryNodeId) {
    aliases.add(memoryNodeId);
    const memoryNode = getNodeById(definition, memoryNodeId);
    const memoryConfig = memoryNode ? getConfig(memoryNode, context) : undefined;
    if (memoryConfig?.sessionKey) aliases.add(String(memoryConfig.sessionKey));
  }
  return Array.from(aliases);
}

function getMemoryMessageLimit(memoryNodeId: string | undefined, definition: WorkflowDefinition, context: ExecutorContext): number {
  const memoryNode = getNodeById(definition, memoryNodeId);
  if (!memoryNode) {
    return 50;
  }

  const memoryConfig = getConfig(memoryNode, context);

  switch (memoryNode.data.type) {
    case NodeType.MEMORY_WINDOW:
      return Math.max(1, Number(memoryConfig.windowSize) || 5);
    case NodeType.MEMORY_SUMMARY:
      return Math.max(1, Number(memoryConfig.keepRecentMessages) || 6);
    case NodeType.MEMORY_BUFFER:
    case NodeType.MEMORY_REDIS:
    case NodeType.MEMORY_POSTGRES:
      return Math.max(1, Number(memoryConfig.maxMessages) || 20);
    default:
      return 50;
  }
}

function getMemoryMessages(memoryNodeId: string | undefined, definition: WorkflowDefinition, context: ExecutorContext): AgentMessage[] {
  const aliases = resolveMemoryAliases(memoryNodeId, definition, context);
  const limit = getMemoryMessageLimit(memoryNodeId, definition, context);
  for (const alias of aliases) {
    const messages = normalizeMessages(context.variables[`memory_${alias}`]);
    if (messages.length > 0) return trimMessages(messages, limit);
  }

  const connectedMemoryNodes = definition.nodes.filter((candidate) => {
    const isMemoryNode = [
      NodeType.MEMORY_BUFFER,
      NodeType.MEMORY_REDIS,
      NodeType.MEMORY_POSTGRES,
      NodeType.MEMORY_SUMMARY,
      NodeType.MEMORY_WINDOW,
    ].includes(candidate.data.type);
    if (!isMemoryNode) return false;
    return definition.edges.some((edge) => (edge.source === candidate.id && edge.target === memoryNodeId) || (edge.target === candidate.id && edge.source === memoryNodeId));
  });

  for (const memoryNode of connectedMemoryNodes) {
    const config = getConfig(memoryNode, context);
    const aliasesToTry = [memoryNode.id, config.sessionKey, context.executionId, 'default'].filter(Boolean).map(String);
    for (const alias of aliasesToTry) {
      const messages = normalizeMessages(context.variables[`memory_${alias}`]);
      if (messages.length > 0) return messages;
    }
  }

  return [];
}

function storeMemoryConversation(
  memoryNodeId: string | undefined,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  messages: AgentMessage[]
) {
  const aliases = resolveMemoryAliases(memoryNodeId, definition, context);
  if (aliases.length === 0) return;
  const trimmed = trimMessages(messages, getMemoryMessageLimit(memoryNodeId, definition, context));
  for (const alias of aliases) {
    context.variables[`memory_${alias}`] = trimmed;
  }
}

function buildToolSpecs(toolDefinitions: ToolDefinition[]) {
  return toolDefinitions.map((toolDefinition) => ({
    type: 'function',
    function: {
      name: toolDefinition.name,
      description: toolDefinition.description,
      parameters: toolDefinition.parameters || { type: 'object', properties: {}, additionalProperties: true },
    },
  }));
}

async function openAICompatibleChat(
  config: GenericConfig,
  messages: AgentMessage[],
  context: ExecutorContext,
  toolDefinitions: ToolDefinition[] = []
): Promise<{ text: string; message: any; finishReason: string; model: string; usage?: any; raw: any }> {
  const provider = String(config.provider || 'openai').toLowerCase();
  if (provider !== 'openai' && provider !== 'custom') {
    throw new Error(`Tool calling is only supported for OpenAI-compatible providers, received ${provider}`);
  }

  const apiKey = provider === 'openai'
    ? resolveCredential(config, context, ['apiKey'], ['OPENAI_API_KEY'])
    : resolveCredential(config, context, ['apiKey'], ['CUSTOM_LLM_API_KEY']);

  if (!apiKey) {
    throw new Error(`${provider === 'openai' ? 'OpenAI' : 'Custom'} API key is required`);
  }

  const baseUrl = provider === 'custom'
    ? String(config.baseUrl || '').replace(/\/$/, '')
    : 'https://api.openai.com';

  if (provider === 'custom' && !baseUrl) {
    throw new Error('Custom OpenAI-compatible provider requires config.baseUrl');
  }

  const headers: Record<string, string> = provider === 'custom'
    ? {
        'Content-Type': 'application/json',
        ...buildAuthHeaders({
          type: config.auth?.type || 'bearer',
          token: config.auth?.token || apiKey,
          apiKey: config.auth?.apiKey || apiKey,
          apiKeyHeader: config.auth?.apiKeyHeader,
          username: config.auth?.username,
          password: config.auth?.password,
        }),
      }
    : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

  const response = await withRetry(async () => {
    const result = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      timeout: Number(config.timeout) || 30000,
      body: JSON.stringify({
        model: config.model || DEFAULT_OPENAI_MODEL,
        messages: config.systemPrompt
          ? [{ role: 'system', content: String(config.systemPrompt) }, ...messages]
          : messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2000,
        ...(toolDefinitions.length > 0 ? { tools: buildToolSpecs(toolDefinitions), tool_choice: 'auto' } : {}),
      }),
    });

    if (!result.ok) {
      const payload = await result.text();
      throw new Error(`OpenAI-compatible chat failed: ${result.status} ${payload}`);
    }

    return result;
  }, {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 8000,
  });

  const data = await response.json();
  const choice = data.choices?.[0] || {};
  return {
    text: flattenContent(choice.message?.content ?? ''),
    message: choice.message || {},
    finishReason: choice.finish_reason || 'stop',
    model: data.model || config.model || DEFAULT_OPENAI_MODEL,
    usage: data.usage,
    raw: data,
  };
}

function parseReActAction(text: string): { finalAnswer?: string; action?: string; actionInput?: any; thought?: string } {
  const finalAnswerMatch = text.match(/Final Answer:\s*([\s\S]*)$/i);
  if (finalAnswerMatch) {
    return {
      finalAnswer: finalAnswerMatch[1].trim(),
      thought: text,
    };
  }

  const actionMatch = text.match(/Action:\s*(.+)/i);
  const actionInputMatch = text.match(/Action Input:\s*([\s\S]*?)(?:\n(?:Observation|Thought|Final Answer):|$)/i);
  return {
    thought: text,
    action: actionMatch?.[1]?.trim(),
    actionInput: safeJsonParse(actionInputMatch?.[1]?.trim() || ''),
  };
}

function evaluateExpression(expression: string, input: any, context: ExecutorContext, extra: Record<string, any> = {}) {
  const scope = {
    input,
    data: input,
    variables: context.variables,
    nodes: context.nodeOutputs,
    context,
    ...extra,
  };
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  try {
    return new Function(...keys, `'use strict'; return (${expression});`)(...values);
  } catch {
    return new Function(...keys, `'use strict'; ${expression}`)(...values);
  }
}

function coerceBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

async function runWorkerAgent(
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps,
  inputOverride?: any
) {
  const config = resolveAgentConfig(node, definition, context);
  const input = inputOverride !== undefined ? inputOverride : getInput(config, context);
  const toolDefinitions = registerConnectedTools(node, definition, context);
  const history = getMemoryMessages(config.memoryNodeId, definition, context);
  const prompt = String(config.systemPrompt || 'You are a specialized worker agent.');
  const messages = [...history, { role: 'user', content: stringifyValue(input) }] as ChatMessage[];
  const result = await generateText({ ...config, systemPrompt: prompt }, messages, 'worker agent', context);
  const updatedMessages = [...messages, { role: 'assistant', content: result.text } as ChatMessage];
  storeMemoryConversation(config.memoryNodeId, definition, context, updatedMessages as AgentMessage[]);

  const selfDescription = {
    id: node.id,
    name: String(config.name || getNodeName(node, 'Worker Agent')),
    description: String(config.description || 'Specialized workflow worker'),
  };
  context.variables[`worker_${node.id}_definition`] = selfDescription;

  return {
    output: result.text,
    messages: updatedMessages,
    worker: selfDescription,
    availableTools: toolDefinitions.map((tool) => tool.name),
    usage: result.usage,
    model: result.model,
    provider: result.provider,
  };
}

const agentLlmExecutor = createExecutor('Agent LLM', async (node, definition, context, deps) => {
  const config = resolveAgentConfig(node, definition, context);
  const input = getInput(config, context);
  const toolDefinitions = registerConnectedTools(node, definition, context);
  const history = getMemoryMessages(config.memoryNodeId, definition, context);
  const messages: AgentMessage[] = [...history, { role: 'user', content: stringifyValue(input) }];

  const provider = String(config.provider || 'openai').toLowerCase();
  const supportsTools = toolDefinitions.length > 0 && (provider === 'openai' || provider === 'custom');
  const toolCalls: any[] = [];

  let finalText = '';
  let usage: any;
  let model = String(config.model || DEFAULT_OPENAI_MODEL);
  let raw: any;

  if (supportsTools) {
    let response = await openAICompatibleChat(config, messages, context, toolDefinitions);
    usage = response.usage;
    model = response.model;
    raw = response.raw;

    while (response.finishReason === 'tool_calls' || (Array.isArray(response.message?.tool_calls) && response.message.tool_calls.length > 0)) {
      const currentToolCalls = response.message?.tool_calls || [];
      toolCalls.push(...currentToolCalls);
      messages.push({ role: 'assistant', content: response.message?.content ?? null, tool_calls: currentToolCalls });

      for (const toolCall of currentToolCalls) {
        const args = safeJsonParse(toolCall.function?.arguments || '{}');
        await safeLog(deps, node, 'info', `Executing tool ${toolCall.function?.name}`, context, { args });
        const toolResult = await executeToolByName(toolCall.function?.name, args, context);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      response = await openAICompatibleChat(config, messages, context, toolDefinitions);
      usage = response.usage;
      model = response.model;
      raw = response.raw;
      finalText = response.text;
    }

    if (!finalText) {
      finalText = response.text;
    }
  } else {
    if (toolDefinitions.length > 0) {
      await safeLog(deps, node, 'warn', 'Connected tools ignored for non OpenAI-compatible provider', context, {
        provider,
        tools: toolDefinitions.map((tool) => tool.name),
      });
    }
    const result = await generateText(config, messages as ChatMessage[], 'agent llm', context);
    finalText = result.text;
    usage = result.usage;
    model = result.model;
    raw = result.raw;
  }

  const finalMessages = trimMessages([
    ...messages,
    { role: 'assistant', content: finalText },
  ]);
  storeMemoryConversation(config.memoryNodeId, definition, context, finalMessages);

  return {
    output: finalText,
    messages: finalMessages,
    toolCalls,
    usage,
    model,
    provider,
    raw,
  };
});

const agentReactExecutor = createExecutor('Agent ReAct', async (node, definition, context) => {
  const config = resolveAgentConfig(node, definition, context);
  const input = getInput(config, context);
  const toolDefinitions = registerConnectedTools(node, definition, context);
  if (toolDefinitions.length === 0) {
    throw new Error('Agent ReAct requires at least one connected tool sub-node');
  }
  const maxIterations = Math.min(20, Math.max(1, Number(config.maxIterations) || 5));
  const systemPrompt = [
    config.systemPrompt || 'You are a ReAct agent.',
    'Use this format exactly:',
    'Thought: <reasoning>',
    'Action: <tool name>',
    'Action Input: <JSON object or string>',
    'Observation: <tool result>',
    'When done, respond with: Final Answer: <answer>',
  ].join('\n');

  let trajectory = `Input:\n${stringifyValue(input)}`;
  const observations: Array<{ action: string; input: any; observation: any }> = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const result = await generateText(
      {
        ...config,
        systemPrompt,
        temperature: config.temperature ?? 0.2,
      },
      [{ role: 'user', content: trajectory }],
      'react agent',
      context
    );

    const parsed = parseReActAction(result.text);
    if (parsed.finalAnswer) {
      const messages = [
        { role: 'user', content: stringifyValue(input) },
        { role: 'assistant', content: parsed.finalAnswer },
      ];
      storeMemoryConversation(config.memoryNodeId, definition, context, messages as AgentMessage[]);
      return {
        output: parsed.finalAnswer,
        messages,
        trajectory,
        observations,
        usage: result.usage,
        model: result.model,
      };
    }

    if (!parsed.action) {
      throw new Error(`ReAct agent failed to choose an action on iteration ${iteration + 1}`);
    }

    const toolResult = await executeToolByName(parsed.action, parsed.actionInput ?? {}, context);
    observations.push({
      action: parsed.action,
      input: parsed.actionInput,
      observation: toolResult,
    });

    trajectory = `${trajectory}\n\n${result.text.trim()}\nObservation: ${stringifyValue(toolResult)}`;
  }

  return {
    output: trajectory,
    messages: [{ role: 'assistant', content: trajectory }],
    trajectory,
    observations,
    maxIterationsReached: true,
  };
});

const agentToolExecutor = createExecutor('Agent Tool', async (node, _definition, context) => {
  const definition = createToolDefinition(node, context);
  registerToolDefinition(definition, context);
  return {
    output: definition,
    definition,
  };
});

const agentConditionExecutor = createExecutor('Agent Condition', async (node, definition, context) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const conditionType = String(config.conditionType || 'expression');
  let branch: 'true' | 'false' = 'false';
  let reasoning = '';

  if (conditionType === 'llm') {
    const result = await generateText(
      {
        ...config,
        temperature: config.temperature ?? 0,
        systemPrompt: config.systemPrompt || 'Choose only one branch: true or false. Briefly explain why.',
      },
      [{
        role: 'user',
        content: `${config.prompt || 'Given the input, which path should we take: true or false?'}\n\nInput:\n${stringifyValue(input)}`,
      }],
      'agent condition',
      context
    );
    reasoning = result.text;
    branch = /\btrue\b/i.test(result.text) ? 'true' : 'false';
  } else {
    const expression = interpolate(String(config.expression || 'Boolean(input)'), context);
    const result = evaluateExpression(expression, input, context);
    branch = coerceBoolean(result) ? 'true' : 'false';
    reasoning = `Expression evaluated to ${stringifyValue(result)}`;
  }

  context.variables._last_condition_branch = branch;
  context.variables._last_condition_reasoning = reasoning;

  if (config.memoryNodeId) {
    storeMemoryConversation(config.memoryNodeId, definition, context, [
      { role: 'user', content: stringifyValue(input) },
      { role: 'assistant', content: `Branch selected: ${branch}. ${reasoning}` },
    ]);
  }

  return {
    output: input,
    branch,
    reasoning,
    metadata: {
      branch,
      reasoning,
    },
  };
});

const agentLoopExecutor = createExecutor('Agent Loop', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const maxIterations = Math.min(100, Math.max(1, Number(config.maxIterations) || 5));
  const aggregateResults = config.aggregateResults !== false;
  const exitExpression = String(config.exitCondition || config.conditionExpression || 'false');
  const stepExpression = config.stepExpression ? String(config.stepExpression) : '';
  const results: any[] = [];
  let current = input;
  let iterations = 0;

  for (; iterations < maxIterations; iterations += 1) {
    const stepResult = stepExpression
      ? evaluateExpression(stepExpression, current, context, { current, iteration: iterations, results })
      : current;
    results.push(stepResult);
    current = stepResult;
    const shouldExit = coerceBoolean(evaluateExpression(exitExpression, current, context, { current, iteration: iterations, results }));
    if (shouldExit) {
      iterations += 1;
      break;
    }
  }

  return {
    output: aggregateResults ? results : current,
    iterations,
    results,
  };
});

const agentSupervisorExecutor = createExecutor('Agent Supervisor', async (node, definition, context, deps) => {
  const config = resolveAgentConfig(node, definition, context);
  const input = getInput(config, context);
  const workers = getConnectedNodes(node, definition, NodeType.AGENT_WORKER);
  if (workers.length === 0) {
    throw new Error('Agent Supervisor requires at least one connected Agent Worker node');
  }

  const workerDefinitions = workers.map((worker) => {
    const workerConfig = getConfig(worker, context);
    return {
      id: worker.id,
      name: String(workerConfig.name || getNodeName(worker, 'Worker')),
      description: String(workerConfig.description || 'General worker'),
    };
  });

  const routeResult = await generateText(
    {
      ...config,
      temperature: config.temperature ?? 0,
      systemPrompt: config.systemPrompt || 'Choose the best worker for the task and explain why. Return JSON with keys workerId and reasoning.',
    },
    [{
      role: 'user',
      content: `Input:\n${stringifyValue(input)}\n\nWorkers:\n${JSON.stringify(workerDefinitions, null, 2)}`,
    }],
    'supervisor routing',
    context
  );

  const parsed = safeJsonParse(routeResult.text);
  const selectedWorkerId = parsed?.workerId || workerDefinitions.find((worker) => routeResult.text.includes(worker.id) || routeResult.text.includes(worker.name))?.id || workerDefinitions[0].id;
  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId) || workers[0];
  await safeLog(deps, node, 'info', `Supervisor routed to worker ${selectedWorker.id}`, context, {
    selectedWorkerId,
    reasoning: parsed?.reasoning || routeResult.text,
  });

  const workerResult = await runWorkerAgent(selectedWorker, definition, context, deps, input);

  return {
    output: workerResult.output,
    selectedWorker: workerResult.worker,
    routing: parsed?.reasoning || routeResult.text,
    workerResult,
  };
});

const agentWorkerExecutor = createExecutor('Agent Worker', async (node, definition, context, deps) => {
  return runWorkerAgent(node, definition, context, deps);
});

const agentPlannerExecutor = createExecutor('Agent Planner', async (node, _definition, context) => {
  const config = resolveAgentConfig(node, _definition, context);
  const input = getInput(config, context);
  const result = await generateText(
    {
      ...config,
      systemPrompt:
        config.systemPrompt ||
        'Create an execution plan. Prefer JSON with a top-level steps array. Each step should include id, title, objective, and dependencies.',
      temperature: config.temperature ?? 0.2,
    },
    [{ role: 'user', content: stringifyValue(input) }],
    'agent planner',
    context
  );

  const parsed = safeJsonParse(result.text);
  return {
    output: parsed?.steps || parsed || result.text,
    plan: parsed,
    text: result.text,
    usage: result.usage,
    model: result.model,
    provider: result.provider,
  };
});

export const agentExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.AGENT_LLM]: agentLlmExecutor,
  [NodeType.AGENT_REACT]: agentReactExecutor,
  [NodeType.AGENT_TOOL]: agentToolExecutor,
  [NodeType.AGENT_CONDITION]: agentConditionExecutor,
  [NodeType.AGENT_LOOP]: agentLoopExecutor,
  [NodeType.AGENT_SUPERVISOR]: agentSupervisorExecutor,
  [NodeType.AGENT_WORKER]: agentWorkerExecutor,
  [NodeType.AGENT_PLANNER]: agentPlannerExecutor,
};
