import OpenAI from 'openai';
import type { Edge } from 'reactflow';
import { nodeRegistry } from '@/lib/nodes/registry';
import { NodeType, type WorkflowDefinition, type WorkflowNode } from '@/types/nodes';

const AI_WORKFLOW_SYSTEM_PROMPT = `You are an AI workflow builder. Given a description, output a complete JSON workflow definition.

The workflow must be a valid JSON object with this structure:
{
  "name": "Workflow name",
  "description": "Brief description", 
  "nodes": [...],
  "edges": [...]
}

Available node types:
- trigger.manual: { label: "Manual Trigger" }
- trigger.schedule: { label: "Schedule", config: { cron: "0 9 * * 1-5", timezone: "UTC" } }
- trigger.webhook: { label: "Webhook Trigger", config: { path: "/webhook/...", method: "POST" } }
- ai.llm: { label: "LLM", config: { model: "gpt-4o", systemPrompt: "...", userPrompt: "{{input}}", temperature: 0.7 } }
- ai.agent: { label: "AI Agent", config: { goal: "...", tools: [], model: "gpt-4o" } }
- ai.summarize: { label: "Summarize", config: { model: "gpt-4o", prompt: "Summarize: {{input}}" } }
- http.request: { label: "HTTP Request", config: { url: "...", method: "GET", headers: {} } }
- data.transform: { label: "Transform", config: { expression: "input.data" } }
- data.filter: { label: "Filter", config: { condition: "item.value > 0" } }
- code.javascript: { label: "JavaScript", config: { code: "return input;" } }
- code.python: { label: "Python", config: { code: "return input" } }
- output.email: { label: "Send Email", config: { to: "{{email}}", subject: "...", body: "..." } }
- output.slack: { label: "Slack Message", config: { channel: "#general", message: "..." } }
- output.webhook: { label: "Webhook Output", config: { url: "...", method: "POST" } }
- memory.read: { label: "Read Memory", config: { key: "..." } }
- memory.write: { label: "Write Memory", config: { key: "...", value: "{{output}}" } }
- control.condition: { label: "Condition", config: { condition: "input.value > 0", trueLabel: "Yes", falseLabel: "No" } }
- control.delay: { label: "Delay", config: { duration: 1000 } }
- scraping.webpage: { label: "Web Scraper", config: { url: "...", selector: "body" } }
- notification.email: { label: "Email Notification" }

Each node needs:
- id: unique string like "node-1", "node-2"
- type: one of the types above
- position: { x: number, y: number } (arrange logically left-to-right, 250px apart, 150px vertical spacing)
- data: { label: string, nodeType: string, config: object, inputs: [], outputs: [] }

Each edge needs:
- id: "edge-1" etc
- source: source node id
- target: target node id
- sourceHandle: "output-0"
- targetHandle: "input-0"

Rules:
- Always start with a trigger node
- Arrange nodes left-to-right in execution order
- Keep config realistic and useful
- Generate 4-10 nodes typically
- Output ONLY the JSON, no explanation`;

const AI_ALIAS_TO_NODE_TYPE: Record<string, NodeType> = {
  'trigger.manual': NodeType.TRIGGER_MANUAL,
  'trigger.schedule': NodeType.TRIGGER_SCHEDULE,
  'trigger.webhook': NodeType.TRIGGER_WEBHOOK,
  'ai.llm': NodeType.AI_LLM,
  'ai.agent': NodeType.AGENT_LLM,
  'ai.summarize': NodeType.AI_SUMMARIZATION,
  'ai.summarization': NodeType.AI_SUMMARIZATION,
  'http.request': NodeType.INTEGRATION_HTTP,
  'data.transform': NodeType.TRANSFORM_DATA,
  'data.filter': NodeType.TRANSFORM_FILTER,
  'code.javascript': NodeType.SANDFLARE_NODEJS,
  'code.python': NodeType.SANDFLARE_PYTHON,
  'output.email': NodeType.OUTPUT_EMAIL,
  'output.slack': NodeType.INTEGRATION_SLACK,
  'output.webhook': NodeType.OUTPUT_WEBHOOK,
  'memory.read': NodeType.MEMORY_AGENT_READ,
  'memory.write': NodeType.MEMORY_AGENT_WRITE,
  'control.condition': NodeType.CONTROL_CONDITION,
  'control.delay': NodeType.UTILITY_DELAY,
  'scraping.webpage': NodeType.SANDFLARE_SCRAPE,
  'notification.email': NodeType.OUTPUT_EMAIL,
};

export interface WorkflowPreviewNode {
  id: string;
  label: string;
  nodeType: NodeType;
}

export interface GeneratedWorkflowData {
  workflowId?: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  nodes: WorkflowPreviewNode[];
  definition: WorkflowDefinition;
}

type RawNodeRecord = Record<string, unknown>;
type RawEdgeRecord = Record<string, unknown>;
type RawWorkflowRecord = Record<string, unknown>;

function isTriggerNodeType(nodeType: NodeType) {
  return nodeType.startsWith('trigger.');
}

export function inferWorkflowName(description: string) {
  const cleaned = description.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'AI Generated Workflow';
  }

  const withoutTrailingPunctuation = cleaned.replace(/[.!?]+$/, '');
  const capped = withoutTrailingPunctuation.length > 60
    ? `${withoutTrailingPunctuation.slice(0, 57).trimEnd()}...`
    : withoutTrailingPunctuation;

  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

function inferWorkflowDescription(description: string) {
  return description.trim() || 'AI-generated workflow';
}

function slugifySegment(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'endpoint';
}

function createNode(id: string, nodeType: NodeType, config: Record<string, unknown>, position = { x: 0, y: 0 }): WorkflowNode {
  const registryEntry = nodeRegistry[nodeType];
  const label = typeof config.label === 'string' && config.label.trim() ? config.label.trim() : registryEntry?.name ?? nodeType;

  return {
    id,
    type: 'custom',
    position,
    data: {
      type: nodeType,
      category: registryEntry.category,
      config: {
        ...(registryEntry.defaultConfig ?? {}),
        ...config,
        label,
      },
      status: 'idle',
      executionStatus: 'idle',
    },
  };
}

function resolveNodeType(value: unknown, index: number, total: number): NodeType {
  if (typeof value === 'string') {
    const mappedType = AI_ALIAS_TO_NODE_TYPE[value] ?? (nodeRegistry[value] ? (value as NodeType) : undefined);
    if (mappedType) {
      return mappedType;
    }
  }

  if (index === 0) {
    return NodeType.TRIGGER_MANUAL;
  }

  if (index === total - 1) {
    return NodeType.OUTPUT_WEBHOOK;
  }

  return NodeType.AI_LLM;
}

function normalizeNodeConfig(nodeType: NodeType, rawConfig: Record<string, unknown>, label: string, workflowDescription: string) {
  const baseConfig = {
    ...(nodeRegistry[nodeType]?.defaultConfig ?? {}),
    ...rawConfig,
    label,
  } as Record<string, unknown>;

  switch (nodeType) {
    case NodeType.AI_LLM:
      return {
        provider: 'openai',
        model: String(rawConfig.model ?? 'gpt-4o'),
        systemPrompt: String(rawConfig.systemPrompt ?? 'You are a helpful workflow assistant.'),
        prompt: String(rawConfig.userPrompt ?? rawConfig.prompt ?? `Process the incoming workflow data for: ${workflowDescription}`),
        temperature: typeof rawConfig.temperature === 'number' ? rawConfig.temperature : 0.4,
        ...baseConfig,
      };
    case NodeType.AGENT_LLM:
      return {
        provider: 'openai',
        model: String(rawConfig.model ?? 'gpt-4o'),
        systemPrompt: String(rawConfig.goal ?? rawConfig.systemPrompt ?? 'Plan the best next step and produce a concise action-ready result.'),
        temperature: typeof rawConfig.temperature === 'number' ? rawConfig.temperature : 0.5,
        tools: Array.isArray(rawConfig.tools) ? rawConfig.tools : [],
        ...baseConfig,
      };
    case NodeType.AI_SUMMARIZATION:
      return {
        provider: 'openai',
        model: String(rawConfig.model ?? 'gpt-4o'),
        prompt: String(rawConfig.prompt ?? 'Summarize the incoming content into actionable bullet points.'),
        text: String(rawConfig.text ?? '{{input}}'),
        ...baseConfig,
      };
    case NodeType.INTEGRATION_HTTP:
      return {
        url: String(rawConfig.url ?? 'https://api.example.com/data'),
        method: String(rawConfig.method ?? 'GET').toUpperCase(),
        headers: typeof rawConfig.headers === 'object' && rawConfig.headers !== null ? rawConfig.headers : {},
        ...baseConfig,
      };
    case NodeType.TRANSFORM_DATA:
      return {
        transformType: 'javascript',
        transformation: String(rawConfig.expression ?? rawConfig.transformation ?? 'return input;'),
        ...baseConfig,
      };
    case NodeType.TRANSFORM_FILTER:
      return {
        condition: String(rawConfig.condition ?? 'Boolean(input)'),
        ...baseConfig,
      };
    case NodeType.SANDFLARE_NODEJS:
      return {
        provider: 'auto',
        language: 'nodejs',
        code: String(rawConfig.code ?? 'return input;'),
        timeout: typeof rawConfig.timeout === 'number' ? rawConfig.timeout : 30000,
        ...baseConfig,
      };
    case NodeType.SANDFLARE_PYTHON:
      return {
        provider: 'auto',
        language: 'python',
        code: String(rawConfig.code ?? 'return input'),
        timeout: typeof rawConfig.timeout === 'number' ? rawConfig.timeout : 30000,
        ...baseConfig,
      };
    case NodeType.OUTPUT_EMAIL:
      return {
        to: String(rawConfig.to ?? '{{email}}'),
        subject: String(rawConfig.subject ?? 'Automated workflow update'),
        body: String(rawConfig.body ?? '{{input}}'),
        ...baseConfig,
      };
    case NodeType.INTEGRATION_SLACK:
      return {
        channel: String(rawConfig.channel ?? '#general'),
        message: String(rawConfig.message ?? '{{input}}'),
        ...baseConfig,
      };
    case NodeType.OUTPUT_WEBHOOK:
      return {
        url: String(rawConfig.url ?? 'https://example.com/webhook'),
        method: String(rawConfig.method ?? 'POST').toUpperCase(),
        ...baseConfig,
      };
    case NodeType.MEMORY_AGENT_READ:
      return {
        key: String(rawConfig.key ?? 'workflow_context'),
        defaultValue: rawConfig.defaultValue ?? '',
        ...baseConfig,
      };
    case NodeType.MEMORY_AGENT_WRITE:
      return {
        key: String(rawConfig.key ?? 'latest_result'),
        value: rawConfig.value ?? '{{input}}',
        ...baseConfig,
      };
    case NodeType.CONTROL_CONDITION:
      return {
        condition: String(rawConfig.condition ?? 'Boolean(input)'),
        evaluationType: 'expression',
        trueLabel: rawConfig.trueLabel ?? 'Yes',
        falseLabel: rawConfig.falseLabel ?? 'No',
        ...baseConfig,
      };
    case NodeType.UTILITY_DELAY:
      return {
        duration: typeof rawConfig.duration === 'number' ? rawConfig.duration : 1000,
        ...baseConfig,
      };
    case NodeType.SANDFLARE_SCRAPE:
      return {
        provider: 'auto',
        url: String(rawConfig.url ?? 'https://example.com'),
        selector: String(rawConfig.selector ?? 'body'),
        javascript: true,
        ...baseConfig,
      };
    case NodeType.TRIGGER_SCHEDULE:
      return {
        cron: String(rawConfig.cron ?? '0 9 * * 1-5'),
        timezone: String(rawConfig.timezone ?? 'UTC'),
        enabled: true,
        ...baseConfig,
      };
    case NodeType.TRIGGER_WEBHOOK:
      return {
        path: String(rawConfig.path ?? `/webhook/${slugifySegment(label)}`),
        method: String(rawConfig.method ?? 'POST').toUpperCase(),
        authType: String(rawConfig.authType ?? 'none'),
        ...baseConfig,
      };
    default:
      return baseConfig;
  }
}

function parseOutputIndex(handle: string) {
  const match = handle.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function resolveSourceHandle(nodeId: string, requestedHandle: unknown, nodeMap: Map<string, WorkflowNode>) {
  const node = nodeMap.get(nodeId);
  const outputs = node ? nodeRegistry[node.data.type]?.outputs.map((output) => output.name) ?? [] : [];

  if (outputs.length === 0) {
    return 'output';
  }

  if (typeof requestedHandle === 'string' && outputs.includes(requestedHandle)) {
    return requestedHandle;
  }

  if (typeof requestedHandle === 'string') {
    const normalizedHandle = requestedHandle.toLowerCase();
    if (normalizedHandle.includes('true') && outputs.includes('true')) {
      return 'true';
    }
    if (normalizedHandle.includes('false') && outputs.includes('false')) {
      return 'false';
    }
    if (normalizedHandle.includes('default') && outputs.includes('default')) {
      return 'default';
    }

    return outputs[Math.min(parseOutputIndex(normalizedHandle), outputs.length - 1)] ?? outputs[0];
  }

  return outputs[0];
}

function resolveTargetHandle(nodeId: string, requestedHandle: unknown, nodeMap: Map<string, WorkflowNode>) {
  const node = nodeMap.get(nodeId);
  const inputs = node ? nodeRegistry[node.data.type]?.inputs.map((input) => input.name) ?? [] : [];
  const fallbackHandle = inputs[0] ?? 'input';

  if (typeof requestedHandle === 'string' && inputs.includes(requestedHandle)) {
    return requestedHandle;
  }

  return fallbackHandle;
}

function ensureConnectedGraph(nodes: WorkflowNode[], edges: Edge[]) {
  if (nodes.length <= 1) {
    return edges;
  }

  const connectedTargets = new Set(edges.map((edge) => edge.target));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const repairedEdges = [...edges];

  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (connectedTargets.has(node.id)) {
      continue;
    }

    const previousNode = nodes[index - 1];
    repairedEdges.push({
      id: `edge-auto-${index}`,
      source: previousNode.id,
      target: node.id,
      sourceHandle: resolveSourceHandle(previousNode.id, undefined, nodeMap),
      targetHandle: resolveTargetHandle(node.id, undefined, nodeMap),
      type: 'smoothstep',
    });
    connectedTargets.add(node.id);
  }

  return repairedEdges;
}

function applyLeftToRightLayout(nodes: WorkflowNode[], edges: Edge[]) {
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  nodes.forEach((node) => {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  });

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const orderedIds: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    orderedIds.push(current);

    for (const target of outgoing.get(current) ?? []) {
      const nextIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(target);
      }
    }
  }

  nodes.forEach((node) => {
    if (!orderedIds.includes(node.id)) {
      orderedIds.push(node.id);
    }
  });

  const levels = new Map<string, number>();
  orderedIds.forEach((nodeId) => {
    const incomingEdges = edges.filter((edge) => edge.target === nodeId);
    const level = incomingEdges.reduce((maxLevel, edge) => Math.max(maxLevel, (levels.get(edge.source) ?? 0) + 1), 0);
    levels.set(nodeId, level);
  });

  const nodesByLevel = new Map<number, string[]>();
  orderedIds.forEach((nodeId) => {
    const level = levels.get(nodeId) ?? 0;
    const currentLevelNodes = nodesByLevel.get(level) ?? [];
    currentLevelNodes.push(nodeId);
    nodesByLevel.set(level, currentLevelNodes);
  });

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const siblings = nodesByLevel.get(level) ?? [node.id];
    const siblingIndex = siblings.indexOf(node.id);
    const verticalOffset = siblingIndex * 150 - ((siblings.length - 1) * 150) / 2;

    return {
      ...node,
      position: {
        x: 80 + level * 250,
        y: 240 + verticalOffset,
      },
    };
  });
}

function buildPreviewNodes(nodes: WorkflowNode[]): WorkflowPreviewNode[] {
  return nodes.map((node) => ({
    id: node.id,
    label: typeof node.data.config?.label === 'string' ? node.data.config.label : nodeRegistry[node.data.type]?.name ?? node.data.type,
    nodeType: node.data.type,
  }));
}

function extractJsonObject(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || content.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model did not return JSON');
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export function normalizeGeneratedWorkflow(rawWorkflow: RawWorkflowRecord, description: string): GeneratedWorkflowData {
  const rawNodes = Array.isArray(rawWorkflow.nodes) ? rawWorkflow.nodes : [];
  const rawEdges = Array.isArray(rawWorkflow.edges) ? rawWorkflow.edges : [];

  if (rawNodes.length === 0) {
    return buildFallbackWorkflow(description);
  }

  const normalizedNodes = rawNodes.map((rawNode, index) => {
    const nodeRecord = typeof rawNode === 'object' && rawNode !== null ? rawNode as RawNodeRecord : {};
    const dataRecord = typeof nodeRecord.data === 'object' && nodeRecord.data !== null ? nodeRecord.data as RawNodeRecord : {};
    const requestedType = dataRecord.nodeType ?? dataRecord.type ?? nodeRecord.type;
    const nodeType = resolveNodeType(requestedType, index, rawNodes.length);
    const label = String(dataRecord.label ?? (typeof dataRecord.config === 'object' && dataRecord.config !== null ? (dataRecord.config as RawNodeRecord).label : undefined) ?? nodeRegistry[nodeType]?.name ?? `Node ${index + 1}`);
    const rawConfig = typeof dataRecord.config === 'object' && dataRecord.config !== null ? dataRecord.config as RawNodeRecord : {};
    const nodeId = typeof nodeRecord.id === 'string' && nodeRecord.id.trim() ? nodeRecord.id.trim() : `node-${index + 1}`;

    return createNode(nodeId, nodeType, normalizeNodeConfig(nodeType, rawConfig, label, description));
  });

  const nodes = normalizedNodes.map((node, index) => ({
    ...node,
    id: normalizedNodes.findIndex((candidate) => candidate.id === node.id) === index ? node.id : `${node.id}-${index + 1}`,
  }));

  if (!isTriggerNodeType(nodes[0].data.type)) {
    nodes.unshift(
      createNode('node-trigger', NodeType.TRIGGER_MANUAL, {
        label: 'Manual Trigger',
      })
    );
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const normalizedEdges = rawEdges.flatMap((rawEdge, index) => {
    const edgeRecord = typeof rawEdge === 'object' && rawEdge !== null ? rawEdge as RawEdgeRecord : {};
    const source = typeof edgeRecord.source === 'string' ? edgeRecord.source : '';
    const target = typeof edgeRecord.target === 'string' ? edgeRecord.target : '';

    if (!nodeMap.has(source) || !nodeMap.has(target) || source === target) {
      return [];
    }

    return [{
      id: typeof edgeRecord.id === 'string' && edgeRecord.id.trim() ? edgeRecord.id : `edge-${index + 1}`,
      source,
      target,
      sourceHandle: resolveSourceHandle(source, edgeRecord.sourceHandle, nodeMap),
      targetHandle: resolveTargetHandle(target, edgeRecord.targetHandle, nodeMap),
      type: 'smoothstep',
    } satisfies Edge];
  });

  const repairedEdges = ensureConnectedGraph(nodes, normalizedEdges);
  const positionedNodes = applyLeftToRightLayout(nodes, repairedEdges);
  const definition: WorkflowDefinition = { nodes: positionedNodes, edges: repairedEdges };
  const name = typeof rawWorkflow.name === 'string' && rawWorkflow.name.trim() ? rawWorkflow.name.trim() : inferWorkflowName(description);
  const workflowDescription = typeof rawWorkflow.description === 'string' && rawWorkflow.description.trim()
    ? rawWorkflow.description.trim()
    : inferWorkflowDescription(description);

  return {
    name,
    description: workflowDescription,
    definition,
    nodeCount: definition.nodes.length,
    edgeCount: definition.edges.length,
    nodes: buildPreviewNodes(definition.nodes),
  };
}

function inferCron(description: string) {
  const normalized = description.toLowerCase();
  if (normalized.includes('weekly')) {
    return '0 9 * * 1';
  }
  if (normalized.includes('hourly')) {
    return '0 * * * *';
  }
  if (normalized.includes('monthly')) {
    return '0 9 1 * *';
  }
  return '0 9 * * *';
}

export function buildFallbackWorkflow(description: string): GeneratedWorkflowData {
  const normalized = description.toLowerCase();
  const nodes: WorkflowNode[] = [];
  const edges: Edge[] = [];
  let edgeIndex = 1;

  const triggerType = normalized.includes('webhook') || normalized.includes('api')
    ? NodeType.TRIGGER_WEBHOOK
    : /daily|weekly|monthly|hourly|schedule|every|monitor/.test(normalized)
      ? NodeType.TRIGGER_SCHEDULE
      : NodeType.TRIGGER_MANUAL;

  nodes.push(
    createNode(
      'node-1',
      triggerType,
      triggerType === NodeType.TRIGGER_SCHEDULE
        ? { label: 'Scheduled Trigger', cron: inferCron(description), timezone: 'UTC' }
        : triggerType === NodeType.TRIGGER_WEBHOOK
          ? { label: 'Webhook Trigger', path: `/webhook/${slugifySegment(description)}`, method: 'POST' }
          : { label: 'Manual Trigger' }
    )
  );

  const shouldScrape = /scrape|news|competitor|website|web|price/.test(normalized);
  const shouldUseHttp = /api|fetch|request|report|email|slack/.test(normalized) && !shouldScrape;
  const shouldUseMemory = /monitor|history|remember|track/.test(normalized);
  const shouldUsePython = /python|csv|analysis|analyze|data/.test(normalized);
  const shouldSummarize = /summarize|summary|digest|report|news|email/.test(normalized);
  const shouldUseCondition = /alert|only if|threshold|when /.test(normalized);
  const wantsSlack = /slack/.test(normalized);
  const wantsEmail = /email/.test(normalized) || !wantsSlack;
  const wantsWebhookOutput = /webhook|callback|post to/.test(normalized);

  if (shouldScrape) {
    nodes.push(createNode('node-2', NodeType.SANDFLARE_SCRAPE, {
      label: /competitor/.test(normalized) ? 'Scrape Competitor Sites' : 'Scrape Source Content',
      url: /news/.test(normalized) ? 'https://news.ycombinator.com/' : 'https://example.com',
      selector: 'body',
      javascript: true,
    }));
  } else if (shouldUseHttp) {
    nodes.push(createNode('node-2', NodeType.INTEGRATION_HTTP, {
      label: 'Fetch Source Data',
      url: 'https://api.example.com/data',
      method: 'GET',
      headers: {},
    }));
  } else {
    nodes.push(createNode('node-2', NodeType.TRANSFORM_DATA, {
      label: 'Prepare Input',
      transformation: 'return input;',
      transformType: 'javascript',
    }));
  }

  nodes.push(createNode('node-3', NodeType.TRANSFORM_DATA, {
    label: 'Normalize Data',
    transformation: shouldUsePython ? 'return { records: input.records ?? input };' : 'return input;',
    transformType: 'javascript',
  }));

  if (shouldUsePython) {
    nodes.push(createNode('node-4', NodeType.SANDFLARE_PYTHON, {
      label: 'Run Python Analysis',
      code: 'records = input.get("records", input)\nreturn {"analysis": records, "summary": "Analysis complete"}',
      timeout: 30000,
    }));
  } else if (shouldSummarize) {
    nodes.push(createNode('node-4', NodeType.AI_SUMMARIZATION, {
      label: 'Summarize Findings',
      model: 'gpt-4o',
      prompt: 'Summarize the incoming content into a concise actionable update.',
      text: '{{input}}',
    }));
  } else {
    nodes.push(createNode('node-4', NodeType.AI_LLM, {
      label: 'Generate Insights',
      model: 'gpt-4o',
      systemPrompt: 'You are an automation assistant that turns workflow inputs into useful outputs.',
      prompt: `Process this workflow request: ${description}`,
      temperature: 0.4,
    }));
  }

  if (shouldUseCondition) {
    nodes.push(createNode('node-5', NodeType.CONTROL_CONDITION, {
      label: 'Check Conditions',
      condition: 'Boolean(input)',
      evaluationType: 'expression',
      trueLabel: 'Proceed',
      falseLabel: 'Skip',
    }));
  } else if (shouldUseMemory) {
    nodes.push(createNode('node-5', NodeType.MEMORY_AGENT_WRITE, {
      label: 'Store Workflow Memory',
      key: /price/.test(normalized) ? 'latest_price_snapshot' : 'latest_workflow_result',
      value: '{{input}}',
    }));
  } else {
    nodes.push(createNode('node-5', NodeType.AI_LLM, {
      label: 'Draft Final Message',
      model: 'gpt-4o',
      systemPrompt: 'Turn the workflow output into a polished message ready to send.',
      prompt: 'Create the final message using the incoming data.',
      temperature: 0.3,
    }));
  }

  if (wantsSlack) {
    nodes.push(createNode('node-6', NodeType.INTEGRATION_SLACK, {
      label: 'Send Slack Digest',
      channel: '#general',
      message: '{{input}}',
    }));
  } else if (wantsWebhookOutput) {
    nodes.push(createNode('node-6', NodeType.OUTPUT_WEBHOOK, {
      label: 'Send Webhook Output',
      url: 'https://example.com/webhook',
      method: 'POST',
    }));
  } else if (wantsEmail) {
    nodes.push(createNode('node-6', NodeType.OUTPUT_EMAIL, {
      label: 'Send Email Report',
      to: '{{email}}',
      subject: 'Automated workflow report',
      body: '{{input}}',
    }));
  }

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: `edge-${edgeIndex}`,
      source: nodes[index].id,
      target: nodes[index + 1].id,
      sourceHandle: resolveSourceHandle(nodes[index].id, undefined, new Map(nodes.map((node) => [node.id, node]))),
      targetHandle: 'input',
      type: 'smoothstep',
    });
    edgeIndex += 1;
  }

  const positionedNodes = applyLeftToRightLayout(nodes, edges);
  const definition: WorkflowDefinition = { nodes: positionedNodes, edges };

  return {
    name: inferWorkflowName(description),
    description: inferWorkflowDescription(description),
    definition,
    nodeCount: definition.nodes.length,
    edgeCount: definition.edges.length,
    nodes: buildPreviewNodes(definition.nodes),
  };
}

export async function generateWorkflow(description: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildFallbackWorkflow(description);
  }

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: AI_WORKFLOW_SYSTEM_PROMPT },
      { role: 'user', content: description.trim() },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No workflow content returned from OpenAI');
  }

  const parsed = JSON.parse(extractJsonObject(content)) as RawWorkflowRecord;
  return normalizeGeneratedWorkflow(parsed, description);
}

export function buildAiGeneratedTags(description: string) {
  const normalized = description.toLowerCase();
  const tags = ['ai-generated'];

  if (/slack/.test(normalized)) tags.push('slack');
  if (/email/.test(normalized)) tags.push('email');
  if (/python|csv|analysis/.test(normalized)) tags.push('python');
  if (/schedule|daily|weekly|monthly/.test(normalized)) tags.push('scheduled');
  if (/scrape|news|competitor/.test(normalized)) tags.push('scraping');

  return Array.from(new Set(tags));
}
