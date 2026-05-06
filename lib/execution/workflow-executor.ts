import { Node, Edge } from 'reactflow';
import { eq } from 'drizzle-orm';
import { WorkflowDefinition, WorkflowEnvVar, WorkflowNodeData, WorkflowVariable, NodeCategory, NodeType } from '@/types/nodes';
import { SandboxManager } from '@/lib/sandflare/manager';
import { db } from '@/lib/db';
import { credentials, executionLogs, vectorDocuments } from '@/lib/db/schema';
import { decrypt } from '@/lib/secrets/crypto';
import { Parser } from 'expr-eval';
import { JSONPath } from 'jsonpath-plus';
import jmespath from 'jmespath';
import { getNodeExecutor } from './node-executors/index';
import { generateText } from './node-executors/ai';
import { getNodeByType } from '@/lib/nodes/registry';
import type { ExecutorContext } from './node-executors/types';
import { executionEmitter } from './execution-emitter';
import { debugExecutionController } from './debug-controller';
import { withRetry } from './retry';
import {
  calculateLLMCost,
  calculateSandflareCost,
  recordNodeCost,
} from './cost-tracker';

const ORG_ID = '00000000-0000-0000-0000-000000000000'; // seed org — only used in dev (SKIP_AUTH=true)

type ExecutionContext = ExecutorContext;

interface ExecuteOptions {
  executionId?: string;
  organizationId?: string;
  workflowId?: string;
  workflowType?: string;
  agentId?: string;
  agentName?: string;
  agentNamespace?: string;
  variables?: Record<string, any>;
  envVars?: Record<string, string>;
  debugMode?: boolean;
}

interface ExecutionResult {
  output: any;
  error?: string;
  duration: number;
  nodeResults: Record<string, any>;
  sandboxId?: string;
  cancelled?: boolean;
}

class DebugAbortError extends Error {
  constructor() {
    super('Execution aborted in debug mode');
    this.name = 'DebugAbortError';
  }
}

/** Node types that execute code inside a sandbox and benefit from sharing one. */
const SANDFLARE_CODE_TYPES = new Set<string>([
  NodeType.SANDFLARE_PYTHON,
  NodeType.SANDFLARE_NODEJS,
  NodeType.SANDFLARE_GO,
  NodeType.SANDFLARE_RUST,
  NodeType.SANDFLARE_BASH,
  NodeType.SANDFLARE_RUBY,
  NodeType.SANDFLARE_PHP,
  NodeType.SANDFLARE_JAVA,
  NodeType.SANDFLARE_DOCKER,
  NodeType.SANDFLARE_JUPYTER,
  NodeType.SANDFLARE_EXECUTE,
  NodeType.SANDFLARE_FILE_WRITE,
  NodeType.SANDFLARE_FILE_READ,
  NodeType.SANDFLARE_FILE_LIST,
  NodeType.SANDFLARE_INSTALL,
  NodeType.SANDFLARE_SNAPSHOT,
  NodeType.SANDFLARE_FORK,
  NodeType.SANDFLARE_GIT_CLONE,
  NodeType.SANDFLARE_PLAYWRIGHT,
  NodeType.SANDFLARE_METRICS,
]);

/** Pick the best Sandflare template for the node types used in this workflow. */
function pickTemplate(nodeTypes: string[]): string {
  const hasJupyter = nodeTypes.includes(NodeType.SANDFLARE_JUPYTER);
  const hasPlaywright = nodeTypes.includes(NodeType.SANDFLARE_PLAYWRIGHT);
  const hasNode = nodeTypes.includes(NodeType.SANDFLARE_NODEJS);
  const hasPython = nodeTypes.some((t) =>
    [NodeType.SANDFLARE_PYTHON, NodeType.SANDFLARE_GIT_CLONE, NodeType.SANDFLARE_INSTALL].includes(t as NodeType)
  );

  if (hasJupyter || hasPlaywright) return 'browser-agent'; // Has chromium + Playwright
  if (hasNode && hasPython) return 'ai-agent'; // ai-agent has both
  if (hasNode) return 'ai-agent';
  if (hasPython) return 'ai-agent';
  return 'ai-agent'; // Sensible default — has LLM libs, requests, pandas, etc.
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getFirstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function getUsageFromResult(result: any): any {
  return result?.usage ?? result?.output?.usage ?? result?.raw?.usage ?? result?.raw?.usageMetadata ?? result?.metadata?.usage;
}

function buildNodeInputSnapshot(
  node: Node<WorkflowNodeData>,
  definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
  context: ExecutionContext
) {
  const incomingEdges = definition.edges.filter((edge) => edge.target === node.id);

  if (incomingEdges.length === 0) {
    return Object.keys(context.variables).length > 0
      ? { variables: context.variables }
      : undefined;
  }

  const upstreamInputs = incomingEdges.map((edge) => {
    const sourceNode = definition.nodes.find((candidate) => candidate.id === edge.source);
    const sourceName = (sourceNode?.data as any)?.label || sourceNode?.data?.config?.label || edge.source;

    return {
      sourceNodeId: edge.source,
      sourceNodeName: sourceName,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      output: context.nodeOutputs[edge.source],
    };
  });

  return upstreamInputs.length === 1 ? upstreamInputs[0].output : upstreamInputs;
}

function extractTokenCounts(result: any): { tokensInput: number; tokensOutput: number } {
  const usage = getUsageFromResult(result);
  const tokensInput = Math.max(0, Math.round(getFirstNumber(
    usage?.promptTokens,
    usage?.prompt_tokens,
    usage?.inputTokens,
    usage?.input_tokens,
    usage?.inputTokenCount,
    usage?.promptTokenCount,
    usage?.input_tokens_count
  ) ?? 0));
  const tokensOutput = Math.max(0, Math.round(getFirstNumber(
    usage?.completionTokens,
    usage?.completion_tokens,
    usage?.outputTokens,
    usage?.output_tokens,
    usage?.outputTokenCount,
    usage?.candidatesTokenCount,
    usage?.completionTokenCount
  ) ?? 0));

  return { tokensInput, tokensOutput };
}

function extractModel(result: any, fallback?: string): string | undefined {
  const model = result?.model ?? result?.output?.model ?? result?.raw?.model ?? fallback;
  return typeof model === 'string' && model.trim() ? model : undefined;
}

function scheduleNodeCostRecording(
  executionId: string | undefined,
  node: Node<WorkflowNodeData>,
  nodeName: string,
  result: any
) {
  if (!executionId) return;

  const { tokensInput, tokensOutput } = extractTokenCounts(result);
  const model = extractModel(result, typeof node.data.config?.model === 'string' ? String(node.data.config.model) : undefined) ?? 'default';
  const sandflareMs = node.data.type.startsWith('sandflare.')
    ? Math.max(0, Math.round(getFirstNumber(result?.executionTime, result?.durationMs) ?? 0))
    : 0;

  const llmCost = (tokensInput > 0 || tokensOutput > 0)
    ? calculateLLMCost(model, tokensInput, tokensOutput)
    : 0;
  const sandboxCost = sandflareMs > 0 ? calculateSandflareCost(sandflareMs) : 0;
  const costUsd = llmCost + sandboxCost;

  if (costUsd <= 0) return;

  void recordNodeCost({
    executionId,
    nodeId: node.id,
    nodeName,
    nodeType: node.data.type,
    tokensInput,
    tokensOutput,
    sandflareMs,
    model,
    costUsd,
  });
}

function buildWorkflowVariables(
  workflowVariables: WorkflowVariable[] | undefined,
  overrides: Record<string, any>
): Record<string, any> {
  const baseVariables = Object.fromEntries(
    (workflowVariables ?? [])
      .filter((variable) => variable.name)
      .map((variable) => [variable.name, variable.defaultValue])
  );

  return {
    ...baseVariables,
    ...overrides,
  };
}

function buildWorkflowEnvVars(workflowEnvVars: WorkflowEnvVar[] | undefined): Record<string, string> {
  return Object.fromEntries(
    (workflowEnvVars ?? [])
      .filter((envVar) => envVar.name)
      .map((envVar) => [envVar.name, String(envVar.value ?? '')])
  );
}

function resolveSecretReferencesInString(value: string, secrets: Record<string, string>): string {
  return value.replace(/\{\{\s*secret\.([^}]+)\s*\}\}/g, (_, rawName) => {
    const secretName = String(rawName).trim();
    return secrets[secretName] ?? `{{secret.${secretName}}}`;
  });
}

function resolveSecretReferences<T>(value: T, secrets: Record<string, string>): T {
  if (typeof value === 'string') {
    return resolveSecretReferencesInString(value, secrets) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveSecretReferences(item, secrets)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveSecretReferences(item, secrets)])
    ) as T;
  }

  return value;
}

export class WorkflowExecutor {
  private sandboxManager: SandboxManager;

  constructor() {
    // Use 'auto' to automatically select Sandflare if API key is available, otherwise mock
    // Disable fallback to mock - fail if Sandflare API fails
    this.sandboxManager = new SandboxManager({ provider: 'auto', fallbackToMock: false });
  }

  private async loadSecrets(organizationId = ORG_ID): Promise<Record<string, string>> {
    const secretRows = await db
      .select({
        name: credentials.name,
        encryptedData: credentials.encryptedData,
        encryptionKeyId: credentials.encryptionKeyId,
      })
      .from(credentials)
      .where(eq(credentials.organizationId, organizationId));

    const resolvedSecrets: Record<string, string> = {};

    for (const secret of secretRows) {
      try {
        resolvedSecrets[secret.name] = await decrypt(secret.encryptedData, secret.encryptionKeyId);
      } catch {
        // Skip invalid or undecryptable secrets during execution.
      }
    }

    return resolvedSecrets;
  }

  private maskSecrets<T>(value: T, context?: ExecutionContext): T {
    const secretValues = Object.values(context?.secrets ?? {}).filter(Boolean);

    if (secretValues.length === 0) {
      return value;
    }

    const maskString = (input: string) => {
      let nextValue = input;
      for (const secretValue of secretValues) {
        nextValue = nextValue.split(secretValue).join('[SECRET]');
      }
      return nextValue;
    };

    if (typeof value === 'string') {
      return maskString(value) as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.maskSecrets(item, context)) as T;
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.maskSecrets(item, context)])
      ) as T;
    }

    return value;
  }

  private resolveTemplateValue(path: string, context: ExecutionContext): any {
    return path.split('.').reduce<any>((current, segment) => {
      if (current === null || current === undefined) return undefined;
      return current[segment];
    }, {
      ...context.variables,
      variable: context.variables,
      variables: context.variables,
      env: context.envVars ?? {},
      secret: context.secrets ?? {},
      secrets: context.secrets ?? {},
      nodes: context.nodeOutputs,
    });
  }

  private interpolateText(template: string, context: ExecutionContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.resolveTemplateValue(String(path).trim(), context);
      return value !== undefined ? String(value) : match;
    });
  }

  private interpolateValue<T>(value: T, context: ExecutionContext): T {
    if (typeof value === 'string') {
      return this.interpolateText(value, context) as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.interpolateValue(item, context)) as T;
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.interpolateValue(item, context)])
      ) as T;
    }

    return value;
  }

  private getLatestNodeOutput(context: ExecutionContext): any {
    const nodeIds = Object.keys(context.nodeOutputs);
    if (nodeIds.length === 0) {
      return context.variables.input;
    }

    return context.nodeOutputs[nodeIds[nodeIds.length - 1]];
  }

  private unwrapNodeValue(value: any): any {
    if (value && typeof value === 'object') {
      if ('output' in value) return value.output;
      if ('result' in value && Object.keys(value).length <= 3) return value.result;
      if ('data' in value && Object.keys(value).length <= 3) return value.data;
    }
    return value;
  }

  private getIncomingNodeOutputs(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): any[] {
    return definition.edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => context.nodeOutputs[edge.source])
      .filter((value) => value !== undefined);
  }

  private getNodeInput(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext,
    definition?: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] }
  ): any {
    const config = (node.data.config ?? {}) as Record<string, any>;

    if (typeof config.inputVariable === 'string' && config.inputVariable.trim()) {
      return context.variables[config.inputVariable];
    }

    if (definition) {
      const incomingOutputs = this.getIncomingNodeOutputs(node, definition, context);
      if (incomingOutputs.length === 1) {
        return this.unwrapNodeValue(incomingOutputs[0]);
      }
      if (incomingOutputs.length > 1) {
        return incomingOutputs.map((value) => this.unwrapNodeValue(value));
      }
    }

    if (node.data.inputs !== undefined) {
      return node.data.inputs;
    }

    return this.unwrapNodeValue(this.getLatestNodeOutput(context));
  }

  private async parseJsonResponse(response: Response, providerName: string): Promise<any> {
    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(`${providerName} request failed (${response.status}): ${bodyText.slice(0, 500)}`);
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error(`${providerName} returned invalid JSON`);
    }
  }

  private stripHtml(html: string): string {
    return this.decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractHtmlBySelector(html: string, selector?: string): string {
    if (!selector) {
      return this.stripHtml(html);
    }

    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = selector.startsWith('#')
      ? [new RegExp(`<([a-z0-9:-]+)[^>]*id=["'][^"']*${escapedSelector.slice(2)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')]
      : selector.startsWith('.')
        ? [new RegExp(`<([a-z0-9:-]+)[^>]*class=["'][^"']*${escapedSelector.slice(2)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')]
        : [new RegExp(`<(${escapedSelector})[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[2]) {
        return this.stripHtml(match[2]);
      }
    }

    return this.stripHtml(html);
  }

  private stringifyValue(value: any): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private extractTextValue(value: any): string {
    const unwrapped = this.unwrapNodeValue(value);
    if (typeof unwrapped === 'string') return unwrapped;
    if (Array.isArray(unwrapped)) return unwrapped.map((item) => this.extractTextValue(item)).filter(Boolean).join('\n\n');
    if (unwrapped && typeof unwrapped === 'object') {
      const record = unwrapped as Record<string, any>;
      const preferred = record.text ?? record.content ?? record.body ?? record.markdown ?? record.html ?? record.input;
      if (preferred !== undefined) {
        return typeof preferred === 'string' ? preferred : this.stringifyValue(preferred);
      }
    }
    return this.stringifyValue(unwrapped);
  }

  private parseJsonObject(text: string, label: string): Record<string, any> {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label} must return a JSON object`);
      }
      return parsed as Record<string, any>;
    } catch (error) {
      throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getOpenAIApiKey(context: ExecutionContext): string {
    const apiKey = context.secrets?.OPENAI_API_KEY ?? context.envVars?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    return apiKey;
  }

  private getEnvironmentValue(name: string, context: ExecutionContext): string | undefined {
    return context.secrets?.[name] ?? context.envVars?.[name] ?? process.env[name];
  }

  private getEnvironmentValueOrThrow(name: string, context: ExecutionContext): string {
    const value = this.getEnvironmentValue(name, context);
    if (!value) {
      throw new Error(`${name} environment variable not set`);
    }
    return value;
  }

  private traversePath(value: any, path: string): any {
    return path
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .reduce<any>((current, segment) => {
        if (current === undefined || current === null) return undefined;
        if (Array.isArray(current) && /^\d+$/.test(segment)) {
          return current[Number(segment)];
        }
        return current[segment];
      }, value);
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  private parseCsvText(
    text: string,
    delimiter: string,
    hasHeader: boolean,
    configuredColumns?: string[]
  ): { rows: Record<string, string>[]; columns: string[] } {
    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return { rows: [], columns: configuredColumns ?? [] };
    }

    const parsedRows = lines.map((line) => line.split(delimiter).map((value) => value.trim()));
    const headerRow = hasHeader ? parsedRows.shift() ?? [] : [];
    const columns = (configuredColumns?.length ? configuredColumns : headerRow).map((column, index) => column || `column_${index + 1}`);
    const normalizedColumns = columns.length > 0
      ? columns
      : Array.from({ length: parsedRows[0]?.length ?? 0 }, (_, index) => `column_${index + 1}`);

    const rows = parsedRows.map((values) =>
      Object.fromEntries(normalizedColumns.map((column, index) => [column, values[index] ?? '']))
    );

    return { rows, columns: normalizedColumns };
  }

  private extractXmlTagValue(block: string, tagNames: string[]): string {
    for (const tagName of tagNames) {
      const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i'));
      if (match?.[1]) {
        return this.stripHtml(match[1]);
      }
    }
    return '';
  }

  private extractOpenAIResponseText(data: any): string {
    if (typeof data?.output_text === 'string') {
      return data.output_text;
    }

    if (Array.isArray(data?.output)) {
      return data.output
        .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .map((content: any) => content?.text ?? content?.output_text ?? '')
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  private extractLinks(html: string): string[] {
    const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)];
    return Array.from(new Set(linkMatches.map((match) => this.decodeHtmlEntities(match[1]).trim()).filter(Boolean)));
  }

  private extractNotionRichText(richText: any[] | undefined): string {
    if (!Array.isArray(richText)) return '';
    return richText.map((entry) => entry?.plain_text ?? '').filter(Boolean).join('');
  }

  private extractNotionTitle(properties: Record<string, any> | undefined): string {
    if (!properties || typeof properties !== 'object') return '';

    for (const property of Object.values(properties)) {
      if (property?.type === 'title') {
        return this.extractNotionRichText(property.title);
      }
    }

    return '';
  }

  private simplifyNotionProperties(properties: Record<string, any> | undefined): Record<string, any> {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(properties).map(([key, property]) => {
        const type = property?.type;
        let value: any = null;

        switch (type) {
          case 'title':
            value = this.extractNotionRichText(property.title);
            break;
          case 'rich_text':
            value = this.extractNotionRichText(property.rich_text);
            break;
          case 'number':
            value = property.number;
            break;
          case 'select':
            value = property.select?.name ?? null;
            break;
          case 'multi_select':
            value = Array.isArray(property.multi_select) ? property.multi_select.map((item: any) => item?.name).filter(Boolean) : [];
            break;
          case 'status':
            value = property.status?.name ?? null;
            break;
          case 'date':
            value = property.date?.start ?? null;
            break;
          case 'checkbox':
            value = Boolean(property.checkbox);
            break;
          case 'url':
            value = property.url ?? null;
            break;
          case 'email':
            value = property.email ?? null;
            break;
          case 'phone_number':
            value = property.phone_number ?? null;
            break;
          case 'people':
            value = Array.isArray(property.people) ? property.people.map((item: any) => item?.name ?? item?.id).filter(Boolean) : [];
            break;
          default:
            value = property?.[type] ?? null;
            break;
        }

        return [key, value];
      })
    );
  }

  private async fetchNotionBlockText(
    blockId: string,
    recursive: boolean,
    headers: Record<string, string>
  ): Promise<string[]> {
    const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, { headers });
    const data = await this.parseJsonResponse(response, 'Notion API');
    const lines: string[] = [];

    for (const block of data?.results ?? []) {
      const blockType = block?.type;
      const blockValue = blockType ? block?.[blockType] : undefined;
      const richText = blockValue?.rich_text ?? blockValue?.caption ?? [];
      const text = this.extractNotionRichText(richText).trim();
      if (text) {
        lines.push(text);
      }

      if (recursive && block?.has_children) {
        lines.push(...await this.fetchNotionBlockText(String(block.id), true, headers));
      }
    }

    return lines;
  }

  private stripPdfBinary(text: string): string {
    return text
      .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getSecretValue(context: ExecutionContext, key: string): string | undefined {
    const value = context.secrets?.[key] ?? context.envVars?.[key] ?? process.env[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getRequiredSecretValue(context: ExecutionContext, key: string): string {
    const value = this.getSecretValue(context, key);
    if (!value) {
      throw new Error(`${key} is required`);
    }
    return value;
  }

  private normalizeBaseUrl(value: string, label: string): string {
    const trimmed = value.trim().replace(/\/$/, '');
    if (!trimmed) {
      throw new Error(`${label} is required`);
    }
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  private ensureEmbeddingInput(input: any): number[] {
    const candidates = [input?.embedding, input?.vector, input?.queryEmbedding, input];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        const embedding = candidate.map((value) => Number(value));
        if (embedding.length > 0 && embedding.every((value) => Number.isFinite(value))) {
          return embedding;
        }
      }
      if (typeof candidate === 'string') {
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed)) {
            const embedding = parsed.map((value) => Number(value));
            if (embedding.length > 0 && embedding.every((value) => Number.isFinite(value))) {
              return embedding;
            }
          }
        } catch {
          throw new Error('Vector store nodes require an embedding array in input.embedding. Generate an embedding first.');
        }
      }
    }

    throw new Error('Vector store nodes require an embedding array in input.embedding. Generate an embedding first.');
  }

  private getEmbeddingTextInput(input: any, configuredInput?: string): string {
    const explicitInput = typeof configuredInput === 'string' ? configuredInput.trim() : '';
    if (explicitInput) return explicitInput;

    const text = this.extractTextValue(input).trim();
    if (!text) {
      throw new Error('Embedding node requires input text');
    }
    return text;
  }

  private normalizeEmbeddingResponse(value: any): number[] {
    if (!Array.isArray(value)) {
      throw new Error('Embedding provider did not return a valid embedding array');
    }

    if (value.every((item) => typeof item === 'number')) {
      return value.map((item) => Number(item));
    }

    if (value.every((item) => Array.isArray(item))) {
      const rows = value
        .map((item) => Array.isArray(item) ? item.map((entry) => Number(entry)) : [])
        .filter((item) => item.length > 0 && item.every((entry) => Number.isFinite(entry)));
      if (rows.length === 0) {
        throw new Error('Embedding provider did not return numeric embeddings');
      }
      return rows[0].map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
    }

    throw new Error('Embedding provider did not return a valid embedding array');
  }

  private getVectorMetadata(input: any): Record<string, any> {
    return input && typeof input === 'object' && !Array.isArray(input) && input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata as Record<string, any>
      : {};
  }

  private getVectorRecordId(input: any): string {
    const record = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, any> : {};
    const candidate = record.id ?? record.documentId ?? record.key;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : crypto.randomUUID();
  }

  private getVectorDeleteIds(input: any): string[] {
    const candidates = [
      ...(Array.isArray(input?.ids) ? input.ids : []),
      ...(typeof input?.id === 'string' ? [input.id] : []),
    ]
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (candidates.length === 0) {
      throw new Error('Delete operation requires input.id or input.ids');
    }

    return candidates;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
    const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  private async getChromaCollectionId(baseUrl: string, collectionName: string): Promise<string> {
    const encodedName = encodeURIComponent(collectionName);
    const existingResponse = await fetch(`${baseUrl}/api/v1/collections/${encodedName}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (existingResponse.ok) {
      const existing = await this.parseJsonResponse(existingResponse, 'Chroma collection lookup');
      const existingId = existing?.id ?? existing?.uuid;
      if (!existingId) {
        throw new Error('Chroma collection lookup did not return an id');
      }
      return String(existingId);
    }

    if (existingResponse.status !== 404) {
      await this.parseJsonResponse(existingResponse, 'Chroma collection lookup');
    }

    const createResponse = await fetch(`${baseUrl}/api/v1/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: collectionName }),
    });
    const created = await this.parseJsonResponse(createResponse, 'Chroma collection create');
    const createdId = created?.id ?? created?.uuid;
    if (!createdId) {
      throw new Error('Chroma collection create did not return an id');
    }
    return String(createdId);
  }

  private async executeRedisRestCommand(context: ExecutionContext, command: unknown[]): Promise<any> {
    const baseUrl = this.normalizeBaseUrl(this.getRequiredSecretValue(context, 'REDIS_REST_URL'), 'REDIS_REST_URL');
    const token = this.getRequiredSecretValue(context, 'REDIS_REST_TOKEN');
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    return this.parseJsonResponse(response, 'Redis REST API');
  }

  private splitCharacterChunks(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const normalized = text.trim();
    if (!normalized) return [];

    const size = Math.max(1, Math.floor(chunkSize));
    const overlap = Math.min(Math.max(0, Math.floor(chunkOverlap)), Math.max(0, size - 1));
    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      const end = Math.min(start + size, normalized.length);
      const chunk = normalized.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= normalized.length) break;
      start = Math.max(end - overlap, start + 1);
    }

    return chunks;
  }

  private coerceParameterValue(value: any, type: string): any {
    if (value === undefined || value === null) return value;

    switch (type) {
      case 'number': {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : value;
      }
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true') return true;
          if (value.toLowerCase() === 'false') return false;
        }
        return Boolean(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'string':
      default:
        return typeof value === 'string' ? value : this.stringifyValue(value);
    }
  }

  private assertSafeListExpression(expression: string, label: string) {
    const bannedPattern = /(^|[^\w])(globalThis|global|process|window|document|Function|eval|require|import|constructor|prototype|__proto__|this)([^\w]|$)/;
    if (bannedPattern.test(expression)) {
      throw new Error(`${label} contains unsupported tokens`);
    }
  }

  private evaluateListExpression(expression: string, item: any, index: number, array: any[], context: ExecutionContext): any {
    this.assertSafeListExpression(expression, 'List expression');
    const evaluator = new Function('item', 'index', 'array', 'context', `"use strict"; return (${expression});`);
    return evaluator(item, index, array, { variables: context.variables, nodes: context.nodeOutputs });
  }

  private resolveSortValue(sortKey: string | undefined, item: any, index: number, array: any[], context: ExecutionContext): any {
    if (!sortKey) return item;
    const trimmed = sortKey.trim();
    if (!trimmed) return item;
    return this.evaluateListExpression(trimmed, item, index, array, context);
  }

  async execute(
    definition: WorkflowDefinition,
    input: any = {},
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const secrets = await this.loadSecrets(options.organizationId);
    const resolvedVariableOverrides = resolveSecretReferences(options.variables ?? {}, secrets);
    const resolvedEnvOverrides = Object.fromEntries(
      Object.entries(options.envVars ?? {}).map(([key, value]) => [key, resolveSecretReferencesInString(value, secrets)])
    );
    const context: ExecutionContext = {
      variables: {
        input,
        workflowId: options.workflowId,
        workflowType: options.workflowType,
        agentId: options.agentId,
        agentName: options.agentName,
        agentNamespace: options.agentNamespace,
        ...buildWorkflowVariables(definition.variables, resolvedVariableOverrides),
      },
      nodeOutputs: {},
      executionId: options.executionId,
      organizationId: options.organizationId,
      workflowId: options.workflowId,
      agentId: options.agentId,
      agentName: options.agentName,
      agentNamespace: options.agentNamespace,
      secrets,
      envVars: Object.fromEntries(
        Object.entries({
          ...buildWorkflowEnvVars(definition.envVars),
          ...resolvedEnvOverrides,
        }).map(([key, value]) => [key, resolveSecretReferencesInString(value, secrets)])
      ),
      debugMode: Boolean(options.debugMode),
    } as ExecutionContext & { debugMode?: boolean };

    if (context.executionId) {
      executionEmitter.emit(context.executionId, {
        type: 'execution:start',
        executionId: context.executionId,
        timestamp: Date.now(),
      });
    }

    // ── Shared sandbox lifecycle ────────────────────────────────────────────
    // If the workflow contains any Sandflare code/file/install nodes, create
    // ONE shared sandbox before the DAG runs so all nodes share state.
    const sandflareNodeTypes = definition.nodes
      .map((n) => n.data.type)
      .filter((t) => SANDFLARE_CODE_TYPES.has(t));

    let ownedSandboxId: string | undefined;
    const persistentAgentSandbox = options.workflowType === 'agent' && Boolean(options.workflowId);
    const sandboxRegistry = persistentAgentSandbox
      ? await import('@/lib/agents/sandbox-registry')
      : null;
    if (sandflareNodeTypes.length > 0) {
      try {
        const provider = this.sandboxManager.getProvider();
        const template = pickTemplate(sandflareNodeTypes);

        if (persistentAgentSandbox && options.workflowId && sandboxRegistry) {
          const existingSandboxId = await sandboxRegistry.getAgentSandboxId(options.workflowId);

          if (existingSandboxId) {
            try {
              await provider.getMetrics(existingSandboxId);
              context.sandbox = { id: existingSandboxId, provider, language: 'python' };
              await sandboxRegistry.refreshAgentSandboxTTL(options.workflowId);
              console.log(`[WorkflowExecutor] Reusing persistent sandbox ${existingSandboxId} for agent ${options.workflowId}`);
            } catch {
              await sandboxRegistry.clearAgentSandbox(options.workflowId).catch(() => undefined);
            }
          }

          if (!context.sandbox) {
            const sandbox = await provider.createSandbox({
              language: 'python',
              template,
              size: 'small',
              timeout: 3600000,
            } as any);
            context.sandbox = { id: sandbox.id, provider, language: 'python' };
            await sandboxRegistry.setAgentSandboxId(options.workflowId, sandbox.id);
            console.log(`[WorkflowExecutor] Created persistent sandbox ${sandbox.id} for agent ${options.workflowId}`);
          }
        } else {
          const sandbox = await provider.createSandbox({
            language: 'python', // template overrides the language
            template,
            size: 'small',
            timeout: 3600000, // 1 hour max per Sandflare free plan
          } as any);
          ownedSandboxId = sandbox.id;
          context.sandbox = { id: sandbox.id, provider, language: 'python' };
          console.log(`[WorkflowExecutor] Created shared sandbox ${sandbox.id} (template: ${template})`);
        }
      } catch (err) {
        // If sandbox creation fails (e.g. mock mode, quota), log and continue.
        // Individual nodes will fall back to creating their own sandboxes.
        console.warn('[WorkflowExecutor] Could not create shared sandbox:', err instanceof Error ? err.message : err);
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    try {
      // Find trigger nodes
      const triggerNodes = definition.nodes.filter((node) => {
        const nodeInfo = getNodeByType(node.data.type);
        return nodeInfo?.category === NodeCategory.TRIGGER || node.data.type.startsWith('trigger.');
      });

      if (triggerNodes.length === 0) {
        throw new Error('No trigger node found in workflow');
      }

      // Execute from each trigger (for now, just execute the first one)
      const triggerNode = triggerNodes[0];
      await this.executeNode(triggerNode, definition, context);

      const duration = Date.now() - startTime;

      if (context.executionId) {
        executionEmitter.emit(context.executionId, {
          type: 'execution:complete',
          executionId: context.executionId,
          timestamp: Date.now(),
        });
      }

      return {
        output: context.nodeOutputs,
        duration,
        nodeResults: context.nodeOutputs,
        sandboxId: ownedSandboxId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof DebugAbortError) {
        if (context.executionId) {
          executionEmitter.emit(context.executionId, {
            type: 'execution:cancelled',
            executionId: context.executionId,
            timestamp: Date.now(),
            error: error.message,
          });
        }

        return {
          output: context.nodeOutputs,
          error: error.message,
          duration,
          nodeResults: context.nodeOutputs,
          sandboxId: ownedSandboxId,
          cancelled: true,
        };
      }

      if (context.executionId) {
        executionEmitter.emit(context.executionId, {
          type: 'execution:error',
          executionId: context.executionId,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      return {
        output: context.nodeOutputs,
        error: this.maskSecrets(error instanceof Error ? error.message : 'Unknown error', context),
        duration,
        nodeResults: context.nodeOutputs,
        sandboxId: ownedSandboxId,
      };
    } finally {
      if (context.executionId) {
        debugExecutionController.clear(context.executionId);
      }

      if (persistentAgentSandbox && options.workflowId && context.sandbox && sandboxRegistry) {
        await sandboxRegistry.refreshAgentSandboxTTL(options.workflowId).catch(() => undefined);
      }

      // Always destroy non-persistent shared sandboxes when the workflow completes or fails.
      if (ownedSandboxId && context.sandbox) {
        try {
          await context.sandbox.provider.destroySandbox(ownedSandboxId);
          console.log(`[WorkflowExecutor] Destroyed shared sandbox ${ownedSandboxId}`);
        } catch (err) {
          console.warn('[WorkflowExecutor] Failed to destroy shared sandbox:', err instanceof Error ? err.message : err);
        }
      }
    }
  }

  private async logNodeExecution(
    nodeId: string,
    nodeName: string,
    level: 'info' | 'error',
    message: string,
    data?: any,
    context?: ExecutionContext
  ) {
    if (!context?.executionId) return;

    try {
      await db.insert(executionLogs).values({
        executionId: context.executionId,
        nodeId,
        nodeName,
        level,
        message: this.maskSecrets(message, context),
        data: this.maskSecrets(data, context),
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to log node execution:', error);
    }
  }

  private async executeNode(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const nodeStartTime = Date.now();
    const nodeName = (node.data as any).label || node.data.config?.label || node.data.type;
    const nodeInput = buildNodeInputSnapshot(node, definition, context);
    console.log(`Executing node: ${node.id} (${node.data.type})`);

    if (context.executionId) {
      executionEmitter.emit(context.executionId, {
        type: 'node:start',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName,
        timestamp: Date.now(),
      });
    }

    // Log node start
    await this.logNodeExecution(
      node.id,
      nodeName,
      'info',
      `Starting execution of ${node.data.type}`,
      {
        nodeType: node.data.type,
        input: nodeInput,
      },
      context
    );

    let result: any;

    // ── Step 1: Execute THIS node's own logic only ───────────────────────────
    // The try/catch below must NOT wrap downstream node calls so that a failure
    // in a child node does not get re-logged as a failure of the parent.
    try {
      // Check the modular registry first — covers 160+ node types
      const registeredExecutor = getNodeExecutor(node.data.type);
      if (registeredExecutor) {
        const nodeRetryPolicy = (node.data.config as any)?.retryPolicy;
        const workflowRetryPolicy =
          (definition as any)?.config?.retryPolicy ??
          (definition as any)?.retryPolicy ??
          (definition as any)?.metadata?.retryPolicy;

        result = await withRetry(
          () =>
            registeredExecutor(node, definition, context, {
              logNodeExecution: async (nodeId, nodeName, level, message, data) => {
                const mappedLevel = (level === 'debug' || level === 'warn') ? 'info' : level as 'info' | 'error';
                await this.logNodeExecution(nodeId, nodeName, mappedLevel, message, data, context);
              },
            }),
          nodeRetryPolicy || workflowRetryPolicy || {},
          `${node.data.type}:${node.id}`
        );
      } else {
      // Legacy fallback for node types handled directly in this class
      switch (node.data.type) {
      case NodeType.TRIGGER_MANUAL:
        result = await this.executeTriggerManual(node, context);
        break;

      case NodeType.TRIGGER_SCHEDULE:
        result = await this.executeTriggerSchedule(node, context);
        break;

      case NodeType.TRIGGER_WEBHOOK:
        result = await this.executeTriggerWebhook(node, context);
        break;

      case NodeType.SANDFLARE_EXECUTE:
        result = await this.executeSandflareCode(node, context);
        break;

      case NodeType.SANDFLARE_SCRAPE:
        result = await this.executeSandflareScrape(node, context);
        break;

      case NodeType.AI_LLM:
        result = await this.executeAILLM(node, context);
        break;

      case NodeType.AI_ANTHROPIC:
        result = await this.executeAnthropicNode(node, context);
        break;

      case NodeType.AI_MISTRAL:
        result = await this.executeMistralNode(node, context);
        break;

      case NodeType.AI_GROQ:
        result = await this.executeGroqNode(node, context);
        break;

      case NodeType.AI_OLLAMA:
        result = await this.executeOllamaNode(node, context);
        break;

      case NodeType.TRANSFORM_DATA:
        result = await this.executeDataTransform(node, context);
        break;

      case NodeType.CONTROL_CONDITION:
        result = await this.executeLogicIf(node, context);
        break;

      case NodeType.CONTROL_LOOP:
        result = await this.executeLogicLoop(node, context);
        break;

      case NodeType.INTEGRATION_HTTP:
        result = await this.executeHTTPRequest(node, context);
        break;

      case NodeType.UTILITY_DELAY:
        result = await this.executeUtilityDelay(node, context);
        break;

      case NodeType.UTILITY_LOG:
        result = await this.executeUtilityLog(node, context);
        break;

      case NodeType.UTILITY_VARIABLE:
        result = await this.executeUtilityVariable(node, context);
        break;

      case NodeType.TOOL_CALCULATOR:
        result = await this.executeToolCalculator(node, context);
        break;

      case NodeType.TOOL_WEB_SEARCH:
        result = await this.executeToolWebSearch(node, context);
        break;

      case NodeType.TOOL_WEB_BROWSER:
        result = await this.executeToolWebBrowser(node, context);
        break;

      case NodeType.TOOL_DATETIME:
        result = await this.executeToolDatetime(node, context);
        break;

      case NodeType.ANALYTICS_LANGFUSE:
        result = await this.executeAnalyticsLangfuse(node, context);
        break;

      case NodeType.ANALYTICS_LOG:
        result = await this.executeAnalyticsLog(node, context);
        break;

      case NodeType.AI_PARAMETER_EXTRACTOR:
        result = await this.executeAIParameterExtractor(node, definition, context);
        break;

      case NodeType.AI_QUESTION_CLASSIFIER:
        result = await this.executeAIQuestionClassifier(node, definition, context);
        break;

      case NodeType.RAG_KNOWLEDGE_INDEXER:
        result = await this.executeRagKnowledgeIndexer(node, definition, context);
        break;

      case NodeType.EMBEDDING_OPENAI:
        result = await this.executeEmbeddingOpenAI(node, definition, context);
        break;

      case NodeType.EMBEDDING_COHERE:
        result = await this.executeEmbeddingCohere(node, definition, context);
        break;

      case NodeType.EMBEDDING_HUGGINGFACE:
        result = await this.executeEmbeddingHuggingFace(node, definition, context);
        break;

      case NodeType.VECTORSTORE_PINECONE:
        result = await this.executeVectorStorePinecone(node, definition, context);
        break;

      case NodeType.VECTORSTORE_QDRANT:
        result = await this.executeVectorStoreQdrant(node, definition, context);
        break;

      case NodeType.VECTORSTORE_CHROMA:
        result = await this.executeVectorStoreChroma(node, definition, context);
        break;

      case NodeType.VECTORSTORE_WEAVIATE:
        result = await this.executeVectorStoreWeaviate(node, definition, context);
        break;

      case NodeType.VECTORSTORE_PGVECTOR:
        result = await this.executeVectorStorePgvector(node, definition, context);
        break;

      case NodeType.VECTORSTORE_REDIS:
        result = await this.executeVectorStoreRedis(node, definition, context);
        break;

      case NodeType.DATA_DOCUMENT_EXTRACTOR:
        result = await this.executeDataDocumentExtractor(node, definition, context);
        break;

      case NodeType.DATA_LIST_OPERATOR:
        result = await this.executeDataListOperator(node, definition, context);
        break;

      case NodeType.DATA_VARIABLE_AGGREGATOR:
        result = await this.executeDataVariableAggregator(node, definition, context);
        break;

      case NodeType.LOADER_CSV:
        result = await this.executeLoaderCsv(node, definition, context);
        break;

      case NodeType.LOADER_JSON:
        result = await this.executeLoaderJson(node, definition, context);
        break;

      case NodeType.LOADER_PDF:
        result = await this.executeLoaderPdf(node, definition, context);
        break;

      case NodeType.LOADER_WEBPAGE:
        result = await this.executeLoaderWebpage(node, definition, context);
        break;

      case NodeType.LOADER_GITHUB:
        result = await this.executeLoaderGithub(node, definition, context);
        break;

      case NodeType.LOADER_NOTION:
        result = await this.executeLoaderNotion(node, definition, context);
        break;

      case NodeType.LOADER_GOOGLE_DRIVE:
        result = await this.executeLoaderGoogleDrive(node, definition, context);
        break;

      case NodeType.LOADER_AIRTABLE:
        result = await this.executeLoaderAirtable(node, definition, context);
        break;

      case NodeType.LOADER_RSS:
        result = await this.executeLoaderRss(node, definition, context);
        break;

      case NodeType.LOADER_SITEMAP:
        result = await this.executeLoaderSitemap(node, definition, context);
        break;

      case NodeType.OUTPUT_RESPONSE:
        result = await this.executeOutputResponse(node, context);
        break;

        default:
          throw new Error(`Node type ${node.data.type} is not implemented`);
      }
      } // end else (legacy fallback)
    } catch (error) {
      // Only this node's own logic failed — log and emit for this node only.
      const nodeDuration = Date.now() - nodeStartTime;

      await this.logNodeExecution(
        node.id,
        nodeName,
        'error',
        error instanceof Error ? error.message : 'Unknown error',
        {
          nodeType: node.data.type,
          input: nodeInput,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        context
      );

      if (context.executionId) {
        executionEmitter.emit(context.executionId, {
          type: 'node:error',
          executionId: context.executionId,
          nodeId: node.id,
          nodeName,
          timestamp: Date.now(),
          durationMs: nodeDuration,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }

    // ── Step 2: Node succeeded — persist result and notify ───────────────────
    // Store output
    context.nodeOutputs[node.id] = result;

    scheduleNodeCostRecording(context.executionId, node, nodeName, result);

    // Log successful execution
    const nodeDuration = Date.now() - nodeStartTime;
    await this.logNodeExecution(
      node.id,
      nodeName,
      'info',
      'Node execution completed',
      {
        nodeType: node.data.type,
        input: nodeInput,
        output: result,
      },
      context
    );

    await db.insert(executionLogs).values({
      executionId: context.executionId!,
      nodeId: node.id,
      nodeName,
      level: 'info',
      message: 'Execution completed',
      data: {
        nodeType: node.data.type,
        durationMs: nodeDuration,
      },
      durationMs: nodeDuration,
      timestamp: new Date(),
    });

    if (context.executionId) {
      executionEmitter.emit(context.executionId, {
        type: 'node:complete',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName,
        timestamp: Date.now(),
        durationMs: nodeDuration,
        output: result,
      });
    }

    if (context.executionId && context.executionId && Boolean((context as ExecutionContext & { debugMode?: boolean }).debugMode)) {
      executionEmitter.emit(context.executionId, {
        type: 'debug:paused',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName,
        timestamp: Date.now(),
        output: result,
      });

      const action = await debugExecutionController.pause(context.executionId, {
        nodeId: node.id,
        nodeName,
        output: result,
      });

      if (action === 'abort') {
        throw new DebugAbortError();
      }
    }

    // ── Step 3: Execute downstream nodes (outside the per-node try/catch) ────
    // Errors from child nodes propagate naturally without being re-attributed
    // to this parent node.

      // Find and execute connected nodes — respect branch routing for condition/switch nodes
      const outgoingEdges = definition.edges.filter((edge) => edge.source === node.id);

      // Determine active branch if this is a branching node
      const activeBranch: string | null = (() => {
        const nodeType = node.data?.type as string | undefined;
        if (nodeType === 'control.condition' || nodeType === 'agent.condition') {
          return result?.metadata?.branch ?? result?.branch ?? null;
        }
        if (nodeType === 'control.switch' || nodeType === NodeType.HUMAN_APPROVAL) {
          return result?.metadata?.branch ?? result?.branch ?? null;
        }
        if (nodeType === NodeType.AI_QUESTION_CLASSIFIER) {
          return result?.metadata?.branch ?? result?.classId ?? null;
        }
        return null;
      })();

      const executableEdges = outgoingEdges.filter((edge) => {
        if (activeBranch !== null && edge.sourceHandle && edge.sourceHandle !== activeBranch) {
          return false;
        }
        return true;
      });

      const executeEdgeTarget = async (edge: typeof outgoingEdges[number], branchContext: ExecutionContext = context) => {
        const targetNode = definition.nodes.find((n) => n.id === edge.target);
        if (targetNode) {
          await this.executeNode(targetNode, definition, branchContext);
        }
      };

      const controlFlow = result?.metadata?.controlFlow;
      if (controlFlow?.type === 'parallel') {
        await Promise.all(
          executableEdges.map((edge) =>
            executeEdgeTarget(edge, {
              ...context,
              variables: { ...context.variables },
              nodeOutputs: context.nodeOutputs,
            })
          )
        );
        return result;
      }

      if (controlFlow?.type === 'loop') {
        const iterations = Array.isArray(controlFlow.iterations) ? controlFlow.iterations : [];
        const runIteration = async (iteration: any) => {
          const iterationInput = iteration?.input;
          const itemVariable = controlFlow.itemVariable || 'item';
          const iterationContext: ExecutionContext = {
            ...context,
            variables: {
              ...context.variables,
              input: iterationInput,
              item: iterationInput,
              current: iterationInput,
              loopIndex: iteration?.index ?? 0,
              iteration: iteration?.index ?? 0,
              [itemVariable]: iterationInput,
              ...(iteration?.variables ?? {}),
            },
            nodeOutputs: context.nodeOutputs,
          };

          if (controlFlow.parallel) {
            await Promise.all(executableEdges.map((edge) => executeEdgeTarget(edge, iterationContext)));
            return;
          }

          for (const edge of executableEdges) {
            await executeEdgeTarget(edge, iterationContext);
          }
        };

        if (controlFlow.parallel) {
          await Promise.all(iterations.map((iteration: any) => runIteration(iteration)));
        } else {
          for (const iteration of iterations) {
            await runIteration(iteration);
          }
        }
        return result;
      }

      for (const edge of executableEdges) {
        await executeEdgeTarget(edge);
      }

      return result;
  }

  private async executeTriggerManual(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    // Manual trigger just passes through the input
    return {
      triggered: true,
      timestamp: new Date().toISOString(),
      input: context.variables.input,
    };
  }

  private async executeSandflareCode(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    if (!config.code) {
      throw new Error('No code provided for Sandflare execution');
    }

    // Replace variables in code
    const code = this.interpolateText(String(config.code), context);

    // Execute in sandbox
    const result = await this.sandboxManager.executeCode(
      config.language || 'python',
      code,
      {
        timeout: config.timeout || 30000,
        environment: {
          ...(context.envVars || {}),
          ...(context.secrets || {}),
          ...(config.environment || {}),
        },
      }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Code execution failed: ${result.stderr}`);
    }

    // Try to parse JSON output
    let output = result.stdout;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      // Keep as string if not valid JSON
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      output,
      executionTime: result.executionTime,
      memoryUsed: result.memoryUsed,
    };
  }

  private async executeSandflareScrape(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    if (!config.url) {
      throw new Error('No URL provided for web scraping');
    }

    const result = await this.sandboxManager.scrapeWebsite({
      url: config.url,
      javascript: config.javascript || false,
      waitFor: config.waitFor,
      timeout: config.timeout || 30000,
    });

    return {
      url: result.metadata?.url,
      title: result.metadata?.title,
      html: result.html,
      text: result.text,
      extractedData: result.extractedData,
    };
  }

  private async executeAILLM(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    throw new Error(`Legacy AI executor should not be used for ${node.data.type}`);
  }

  private async executeAnthropicNode(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const systemPrompt = this.interpolateText(String(config.systemPrompt ?? ''), context);
    const userPrompt = this.interpolateText(String(config.userPrompt ?? ''), context);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-5',
          max_tokens: config.maxTokens || 1024,
          temperature: config.temperature ?? 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      const data = await this.parseJsonResponse(response, 'Anthropic API');
      const output = Array.isArray(data?.content)
        ? data.content.map((item: any) => item?.text).filter(Boolean).join('\n')
        : '';

      return {
        output,
        model: data?.model ?? config.model ?? 'claude-sonnet-4-5',
        usage: {
          inputTokens: Number(data?.usage?.input_tokens ?? 0),
          outputTokens: Number(data?.usage?.output_tokens ?? 0),
        },
        raw: data,
      };
    } catch (error) {
      throw new Error(`Anthropic node failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeOpenAICompatibleNode(
    config: Record<string, any>,
    context: ExecutionContext,
    options: { providerName: string; endpoint: string; apiKey: string | undefined; defaultModel: string }
  ): Promise<any> {
    if (!options.apiKey) {
      throw new Error(`${options.providerName} API key is not set`);
    }

    const systemPrompt = this.interpolateText(String(config.systemPrompt ?? ''), context);
    const userPrompt = this.interpolateText(String(config.userPrompt ?? ''), context);

    const messages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userPrompt },
    ];

    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || options.defaultModel,
        temperature: config.temperature ?? 0.7,
        messages,
      }),
    });

    const data = await this.parseJsonResponse(response, options.providerName);
    return {
      output: data?.choices?.[0]?.message?.content ?? '',
      model: data?.model ?? config.model ?? options.defaultModel,
      usage: data?.usage ?? {},
      raw: data,
    };
  }

  private async executeMistralNode(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    try {
      return await this.executeOpenAICompatibleNode(node.data.config ?? {}, context, {
        providerName: 'Mistral API',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        apiKey: process.env.MISTRAL_API_KEY,
        defaultModel: 'mistral-large-latest',
      });
    } catch (error) {
      throw new Error(`Mistral node failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeGroqNode(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    try {
      return await this.executeOpenAICompatibleNode(node.data.config ?? {}, context, {
        providerName: 'Groq API',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        defaultModel: 'llama-3.3-70b-versatile',
      });
    } catch (error) {
      throw new Error(`Groq node failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeOllamaNode(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const systemPrompt = this.interpolateText(String(config.systemPrompt ?? ''), context);
    const userPrompt = this.interpolateText(String(config.userPrompt ?? ''), context);
    const host = String(config.host || 'http://localhost:11434').replace(/\/$/, '');

    try {
      const response = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'llama3.2',
          stream: false,
          options: { temperature: config.temperature ?? 0.7 },
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      const data = await this.parseJsonResponse(response, 'Ollama API');
      return {
        output: data?.message?.content ?? '',
        model: data?.model ?? config.model ?? 'llama3.2',
        usage: {
          inputTokens: Number(data?.prompt_eval_count ?? 0),
          outputTokens: Number(data?.eval_count ?? 0),
        },
        raw: data,
      };
    } catch (error) {
      throw new Error(`Ollama node failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeDataTransform(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Get input data from previous node outputs or context
    let inputData: any;
    if (config.inputVariable) {
      inputData = context.variables[config.inputVariable];
    } else {
      // Get from the previous node
      const incomingEdges = Object.keys(context.nodeOutputs);
      if (incomingEdges.length > 0) {
        const lastNodeId = incomingEdges[incomingEdges.length - 1];
        inputData = context.nodeOutputs[lastNodeId];
      } else {
        inputData = context.variables.input;
      }
    }

    let result: any;
    const transformType = config.transformType || config.operation || 'jsonpath';
    const transformation = config.transformation || config.expression || '$';

    try {
      switch (transformType) {
        case 'jsonpath':
          // Use JSONPath library for safe JSON querying
          result = JSONPath({ path: transformation, json: inputData });
          // If single result, unwrap from array
          if (Array.isArray(result) && result.length === 1) {
            result = result[0];
          }
          break;

        case 'jmespath':
          // Use JMESPath library for advanced JSON querying
          result = jmespath.search(inputData, transformation);
          break;

        case 'javascript':
          // Use safe expression evaluator instead of eval()
          const parser = new Parser();

          // For map/filter operations on arrays
          if (Array.isArray(inputData)) {
            if (transformation.includes('map') || config.operation === 'map') {
              // Extract the expression from map syntax
              const expr = transformation.replace(/\.map\((.*)\)/g, '$1').trim();
              result = inputData.map((item, index) => {
                try {
                  const parsed = parser.parse(expr);
                  return parsed.evaluate({ item, index, ...context.variables } as any);
                } catch (e) {
                  console.error('Error evaluating map expression:', e);
                  return item;
                }
              });
            } else if (transformation.includes('filter') || config.operation === 'filter') {
              // Extract the expression from filter syntax
              const expr = transformation.replace(/\.filter\((.*)\)/g, '$1').trim();
              result = inputData.filter((item, index) => {
                try {
                  const parsed = parser.parse(expr);
                  return parsed.evaluate({ item, index, ...context.variables } as any);
                } catch (e) {
                  console.error('Error evaluating filter expression:', e);
                  return false;
                }
              });
            } else {
              // General expression evaluation
              const parsed = parser.parse(transformation);
              result = parsed.evaluate({ data: inputData, ...context.variables } as any);
            }
          } else {
            // Non-array data, evaluate expression
            const parsed = parser.parse(transformation);
            result = parsed.evaluate({ data: inputData, ...context.variables } as any);
          }
          break;

        default:
          // Pass through unchanged
          result = inputData;
      }

      // Apply output mapping if specified
      if (config.outputMapping) {
        const mapped: Record<string, any> = {};
        for (const [key, path] of Object.entries(config.outputMapping)) {
          try {
            mapped[key] = JSONPath({ path: path as string, json: result })[0];
          } catch (e) {
            mapped[key] = null;
          }
        }
        result = mapped;
      }

      return {
        output: result,
        transformType,
        inputSize: JSON.stringify(inputData).length,
        outputSize: JSON.stringify(result).length,
      };
    } catch (error) {
      throw new Error(`Data transform failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeLogicIf(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    if (!config.condition) {
      throw new Error('Condition is required for Logic If node');
    }

    // Get input data
    let inputData: any;
    const incomingEdges = Object.keys(context.nodeOutputs);
    if (incomingEdges.length > 0) {
      const lastNodeId = incomingEdges[incomingEdges.length - 1];
      inputData = context.nodeOutputs[lastNodeId];
    } else {
      inputData = context.variables.input;
    }

    // Evaluate condition safely
    let conditionResult: boolean;

    try {
      if (config.evaluationType === 'javascript') {
        // Use safe expression parser
        const parser = new Parser();
        const parsed = parser.parse(config.condition);
        conditionResult = Boolean(parsed.evaluate({
          input: inputData,
          data: inputData,
          ...context.variables,
        }));
      } else {
        // Simple expression evaluation (supports: >, <, >=, <=, ==, !=, &&, ||)
        const parser = new Parser();
        const parsed = parser.parse(config.condition);
        conditionResult = Boolean(parsed.evaluate({
          input: inputData,
          data: inputData,
          ...context.variables,
        }));
      }
    } catch (error) {
      throw new Error(`Condition evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      condition: config.condition,
      result: conditionResult,
      branch: conditionResult ? 'true' : 'false',
      input: inputData,
    };
  }

  private async executeLogicLoop(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    const items = context.variables[config.arrayVariable];
    const results = [];

    if (Array.isArray(items)) {
      for (const item of items) {
        // Store current item in context
        context.variables['currentItem'] = item;
        results.push(item);
      }
    }

    return { iterations: results.length, results };
  }

  private async executeHTTPRequest(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    if (!config.url) {
      throw new Error('No URL provided for HTTP request');
    }

    // Replace variables in URL and body
    const url = this.interpolateText(String(config.url), context);

    const response = await fetch(url, {
      method: config.method || 'GET',
      headers: config.headers || {},
      body: config.body ? JSON.stringify(config.body) : undefined,
    });

    const data = await response.json();

    return {
      status: response.status,
      statusText: response.statusText,
      data,
    };
  }

  private async executeTriggerSchedule(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    if (!config.cron) {
      throw new Error('No cron expression provided for schedule trigger');
    }

    // Log schedule information
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      'info',
      `Schedule trigger executed with cron: ${config.cron}`,
      { cron: config.cron, timezone: config.timezone, enabled: config.enabled },
      context
    );

    // Schedule trigger passes through execution metadata
    return {
      triggered: true,
      timestamp: new Date().toISOString(),
      cron: config.cron,
      timezone: config.timezone || 'UTC',
      enabled: config.enabled !== false,
      input: context.variables.input,
    };
  }

  private async executeTriggerWebhook(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Log webhook trigger information
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      'info',
      `Webhook trigger executed with method: ${config.method || 'POST'}`,
      { method: config.method, authType: config.authType },
      context
    );

    // Webhook trigger passes through the request data
    // In a real implementation, this would be populated by the incoming HTTP request
    return {
      triggered: true,
      timestamp: new Date().toISOString(),
      method: config.method || 'POST',
      authType: config.authType || 'none',
      headers: context.variables.headers || {},
      body: context.variables.input || {},
      query: context.variables.query || {},
    };
  }

  private async executeUtilityDelay(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Get delay duration from config or default to 1000ms
    const delay = config.delay || config.duration || 1000;

    if (typeof delay !== 'number' || delay < 0) {
      throw new Error('Invalid delay duration. Must be a positive number in milliseconds.');
    }

    // Log delay start
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      'info',
      `Delaying execution for ${delay}ms`,
      { delay },
      context
    );

    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, delay));

    // Pass through the input data
    const inputData = context.variables.input || node.data.inputs;

    return {
      delayed: true,
      duration: delay,
      timestamp: new Date().toISOString(),
      output: inputData,
    };
  }

  private async executeUtilityLog(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Get data to log from config or inputs
    const logData = config.data || node.data.inputs || context.variables;
    const logMessage = config.message || 'Debug log';
    const logLevel = config.level || 'info';

    // Replace variables in message
    const message = this.interpolateText(String(logMessage), context);

    // Log to execution logs
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      logLevel as 'info' | 'error',
      message,
      logData,
      context
    );

    // Also console log for debugging
    console.log(
      this.maskSecrets(`[${logLevel.toUpperCase()}] ${message}`, context),
      this.maskSecrets(logData, context)
    );

    // Pass through the data
    return {
      logged: true,
      level: logLevel,
      message,
      data: logData,
      timestamp: new Date().toISOString(),
      output: logData,
    };
  }

  private async executeUtilityVariable(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Get variable name and value from config
    const variableName = config.name || config.variableName;
    const variableValue = config.value !== undefined ? config.value : node.data.inputs;

    if (!variableName) {
      throw new Error('Variable name is required');
    }

    // Support variable interpolation in the value
    const value = typeof variableValue === 'string'
      ? this.interpolateText(variableValue, context)
      : variableValue;

    // Set the variable in context
    context.variables[variableName] = value;

    // Log variable set
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      'info',
      `Set variable '${variableName}'`,
      { name: variableName, value },
      context
    );

    return {
      variableSet: true,
      name: variableName,
      value,
      timestamp: new Date().toISOString(),
      output: value,
    };
  }

  private async executeToolCalculator(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const rawInput = this.getNodeInput(node, context);
    const expressionSource = config.expression ?? (typeof rawInput === 'string' ? rawInput : rawInput?.expression);

    if (!expressionSource) {
      throw new Error('Calculator expression is required');
    }

    const expression = this.interpolateText(String(expressionSource), context).trim();
    const allowedIdentifierPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
    const allowedCharsPattern = /^[0-9+\-*/%().,\sA-Za-z_]*$/;

    if (!allowedCharsPattern.test(expression)) {
      throw new Error('Calculator expression contains unsupported characters');
    }

    const allowedIdentifiers = new Set(['Math', ...Object.getOwnPropertyNames(Math)]);
    for (const identifier of expression.match(allowedIdentifierPattern) ?? []) {
      if (!allowedIdentifiers.has(identifier)) {
        throw new Error(`Calculator expression contains unsupported identifier: ${identifier}`);
      }
    }

    try {
      const result = Function(`"use strict"; return (${expression});`)();
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('Expression did not evaluate to a finite number');
      }

      return { result, expression };
    } catch (error) {
      throw new Error(`Calculator evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeToolWebSearch(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const inputValue = this.getNodeInput(node, context);
    const querySource = config.query ?? (typeof inputValue === 'string' ? inputValue : inputValue?.query);
    const query = this.interpolateText(String(querySource ?? ''), context).trim();
    const provider = String(config.provider || 'tavily');
    const maxResults = Number(config.maxResults ?? 5);

    if (!query) {
      throw new Error('Web search query is required');
    }

    try {
      if (provider === 'tavily') {
        if (!process.env.TAVILY_API_KEY) {
          return { results: [{ title: `Mock Tavily result for ${query}`, url: 'https://example.com/mock-tavily', content: 'Set TAVILY_API_KEY to run real web searches.', score: 1 }], note: 'TAVILY_API_KEY is not set' };
        }

        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: maxResults }),
        });
        const data = await this.parseJsonResponse(response, 'Tavily API');
        return {
          results: (data?.results ?? []).map((item: any) => ({
            title: item?.title ?? '',
            url: item?.url ?? '',
            content: item?.content ?? '',
            score: item?.score ?? null,
          })),
        };
      }

      if (provider === 'serpapi') {
        if (!process.env.SERPAPI_KEY) {
          return { results: [{ title: `Mock SerpAPI result for ${query}`, url: 'https://example.com/mock-serpapi', content: 'Set SERPAPI_KEY to run real web searches.', score: 1 }], note: 'SERPAPI_KEY is not set' };
        }

        const response = await fetch(`https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(process.env.SERPAPI_KEY)}`);
        const data = await this.parseJsonResponse(response, 'SerpAPI');
        return {
          results: (data?.organic_results ?? []).slice(0, maxResults).map((item: any) => ({
            title: item?.title ?? '',
            url: item?.link ?? '',
            content: item?.snippet ?? '',
            score: item?.position ?? null,
          })),
        };
      }

      if (provider === 'brave') {
        if (!process.env.BRAVE_API_KEY) {
          return { results: [{ title: `Mock Brave result for ${query}`, url: 'https://example.com/mock-brave', content: 'Set BRAVE_API_KEY to run real web searches.', score: 1 }], note: 'BRAVE_API_KEY is not set' };
        }

        const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
          headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY },
        });
        const data = await this.parseJsonResponse(response, 'Brave Search API');
        return {
          results: (data?.web?.results ?? []).slice(0, maxResults).map((item: any) => ({
            title: item?.title ?? '',
            url: item?.url ?? '',
            content: item?.description ?? '',
            score: item?.page_age ?? null,
          })),
        };
      }

      throw new Error(`Unsupported web search provider: ${provider}`);
    } catch (error) {
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeToolWebBrowser(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const inputValue = this.getNodeInput(node, context);
    const urlSource = config.url ?? (typeof inputValue === 'string' ? inputValue : inputValue?.url);
    const url = this.interpolateText(String(urlSource ?? ''), context).trim();
    const action = String(config.action || 'read');
    const selector = config.selector ? this.interpolateText(String(config.selector), context) : undefined;

    if (!url) {
      throw new Error('Web browser URL is required');
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? this.stripHtml(titleMatch[1]) : url;
      const extractedContent = action === 'extract'
        ? this.extractHtmlBySelector(html, selector)
        : this.stripHtml(html);

      return {
        content: action === 'screenshot' ? `[screenshot unavailable in fetch mode] ${extractedContent}` : extractedContent,
        title,
        url,
        statusCode: response.status,
      };
    } catch (error) {
      throw new Error(`Web browser failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeToolDatetime(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const inputValue = this.getNodeInput(node, context) ?? {};
    const inputRecord = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, any> : {};
    const operation = String(config.operation || 'now');
    const timezone = String(config.timezone || 'UTC');
    const format = String(config.format || 'ISO');
    const amount = Number(config.amount ?? inputRecord.amount ?? 0);
    const unit = String(config.unit ?? inputRecord.unit ?? 'days');
    const baseValue = inputRecord.datetime ?? inputRecord.date ?? inputRecord.baseDate ?? context.variables.inputDate;
    const compareValue = inputRecord.compareDate ?? inputRecord.endDate ?? inputRecord.otherDate;
    const baseDate = baseValue ? new Date(baseValue) : new Date();

    if (Number.isNaN(baseDate.getTime())) {
      throw new Error('Invalid base date provided for datetime operation');
    }

    const multipliers: Record<string, number> = {
      days: 86400000,
      hours: 3600000,
      minutes: 60000,
      seconds: 1000,
    };
    const deltaMs = amount * (multipliers[unit] ?? multipliers.days);

    let resultDate = new Date(baseDate);
    let diff: number | undefined;

    switch (operation) {
      case 'add':
        resultDate = new Date(baseDate.getTime() + deltaMs);
        break;
      case 'subtract':
        resultDate = new Date(baseDate.getTime() - deltaMs);
        break;
      case 'format':
      case 'now':
        resultDate = operation === 'now' ? new Date() : baseDate;
        break;
      case 'diff': {
        const compareDate = compareValue ? new Date(compareValue) : new Date();
        if (Number.isNaN(compareDate.getTime())) {
          throw new Error('Invalid comparison date provided for datetime diff');
        }
        diff = compareDate.getTime() - baseDate.getTime();
        resultDate = compareDate;
        break;
      }
      default:
        throw new Error(`Unsupported datetime operation: ${operation}`);
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: format === 'ISO' ? undefined : 'medium',
      timeStyle: format === 'ISO' ? undefined : 'medium',
      year: format === 'ISO' ? 'numeric' : undefined,
      month: format === 'ISO' ? '2-digit' : undefined,
      day: format === 'ISO' ? '2-digit' : undefined,
      hour: format === 'ISO' ? '2-digit' : undefined,
      minute: format === 'ISO' ? '2-digit' : undefined,
      second: format === 'ISO' ? '2-digit' : undefined,
      hour12: false,
    });

    return {
      datetime: resultDate.toISOString(),
      timestamp: resultDate.getTime(),
      formatted: format === 'ISO' ? resultDate.toISOString() : formatter.format(resultDate),
      ...(diff !== undefined ? { diffMs: diff } : {}),
    };
  }

  private async executeAnalyticsLangfuse(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return { logged: false, reason: 'LANGFUSE_PUBLIC_KEY not set' };
    }

    const eventId = crypto.randomUUID();

    try {
      const response = await fetch('https://cloud.langfuse.com/api/public/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        },
        body: JSON.stringify({
          id: eventId,
          type: 'event',
          name: this.interpolateText(String(config.eventName || 'workflow.event'), context),
          timestamp: new Date().toISOString(),
          input: config.input ? this.interpolateText(String(config.input), context) : undefined,
          output: config.output ? this.interpolateText(String(config.output), context) : undefined,
          metadata: this.interpolateValue(config.metadata ?? {}, context),
          tags: Array.isArray(config.tags) ? config.tags.map((tag: string) => this.interpolateText(tag, context)) : [],
        }),
      });

      const data = await this.parseJsonResponse(response, 'Langfuse API');
      return { logged: true, eventId: data?.id ?? eventId };
    } catch (error) {
      throw new Error(`Langfuse logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeAnalyticsLog(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config ?? {};
    const inputData = this.getNodeInput(node, context);
    const message = this.interpolateText(String(config.message || 'Analytics log'), context);
    const level = String(config.level || 'info') as 'info' | 'warn' | 'error';
    const payload = {
      ...(config.includeInput !== false ? { input: inputData } : {}),
    };
    const timestamp = new Date().toISOString();

    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      level === 'warn' ? 'info' : level,
      message,
      payload,
      context
    );

    console.log(this.maskSecrets(`[${level.toUpperCase()}] ${message}`, context), this.maskSecrets(payload, context));

    return { logged: true, level, message, timestamp, ...(config.includeInput !== false ? { input: inputData } : {}) };
  }

  private async executeAIParameterExtractor(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const parameters = Array.isArray(config.parameters) ? config.parameters : [];
    if (parameters.length === 0) {
      throw new Error('Parameter extractor requires at least one parameter');
    }

    const inputText = this.extractTextValue(this.getNodeInput(node, context, definition)).trim();
    if (!inputText) {
      throw new Error('Parameter extractor requires input text');
    }

    const prompt = [
      'Extract the requested parameters from the input and return only a JSON object.',
      `Parameters: ${JSON.stringify(parameters)}`,
      config.instruction ? `Instruction: ${String(config.instruction)}` : null,
      `Input: ${inputText}`,
    ].filter(Boolean).join('\n\n');

    const response = await generateText(
      { provider: 'openai', model: config.model || 'gpt-4o-mini', outputFormat: 'json' },
      [{ role: 'user', content: prompt }],
      'parameter extraction',
      context
    );

    const parsed = this.parseJsonObject(response.text, 'Parameter extractor');
    const extracted = Object.fromEntries(
      parameters.map((parameter: Record<string, any>) => {
        const name = String(parameter.name || '');
        const type = String(parameter.type || 'string');
        const rawValue = parsed[name];
        return [name, this.coerceParameterValue(rawValue, type)];
      })
    );

    return {
      output: extracted,
      extracted,
      raw: response.text,
      usage: response.usage,
      provider: response.provider,
      model: response.model,
    };
  }

  private async executeAIQuestionClassifier(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const classes = Array.isArray(config.classes) ? config.classes : [];
    if (classes.length === 0) {
      throw new Error('Question classifier requires at least one class');
    }

    const inputText = this.extractTextValue(this.getNodeInput(node, context, definition)).trim();
    if (!inputText) {
      throw new Error('Question classifier requires input text');
    }

    const prompt = [
      'Classify the input into exactly one class and return only a JSON object with classId, className, confidence, and reasoning.',
      `Classes: ${JSON.stringify(classes)}`,
      config.instruction ? `Instruction: ${String(config.instruction)}` : null,
      `Input: ${inputText}`,
    ].filter(Boolean).join('\n\n');

    const response = await generateText(
      { provider: 'openai', model: config.model || 'gpt-4o-mini', outputFormat: 'json' },
      [{ role: 'user', content: prompt }],
      'question classification',
      context
    );

    const parsed = this.parseJsonObject(response.text, 'Question classifier');
    const matchedClass = classes.find((entry: Record<string, any>) => entry.id === parsed.classId || entry.name === parsed.className);
    const branch = matchedClass ? String(matchedClass.id) : 'default';
    const confidence = Number(parsed.confidence);

    return {
      output: {
        classId: matchedClass ? String(matchedClass.id) : branch,
        className: matchedClass ? String(matchedClass.name) : String(parsed.className || 'Default'),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        reasoning: String(parsed.reasoning || ''),
      },
      classId: matchedClass ? String(matchedClass.id) : branch,
      className: matchedClass ? String(matchedClass.name) : String(parsed.className || 'Default'),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      reasoning: String(parsed.reasoning || ''),
      raw: response.text,
      usage: response.usage,
      provider: response.provider,
      model: response.model,
      metadata: {
        branch,
      },
    };
  }

  private async executeRagKnowledgeIndexer(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    if (!context.workflowId) {
      throw new Error('Knowledge indexer requires a workflow ID');
    }

    const collectionName = String(config.collectionName || '').trim();
    if (!collectionName) {
      throw new Error('Knowledge indexer requires a collection name');
    }

    const inputText = this.extractTextValue(this.getNodeInput(node, context, definition)).trim();
    if (!inputText) {
      throw new Error('Knowledge indexer requires input text');
    }

    const chunkSize = Number(config.chunkSize ?? 1000);
    const chunkOverlap = Number(config.chunkOverlap ?? 200);
    const chunks = this.splitCharacterChunks(inputText, chunkSize, chunkOverlap);
    const apiKey = this.getOpenAIApiKey(context);
    const embeddingModel = String(config.embeddingModel || 'text-embedding-3-small');
    const staticMetadata = config.metadata && typeof config.metadata === 'object' ? config.metadata : {};

    const rows = [];
    for (const [index, chunk] of chunks.entries()) {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: chunk,
        }),
      });
      const data = await this.parseJsonResponse(response, 'OpenAI embeddings');
      const embedding = data?.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('OpenAI embeddings response did not include an embedding');
      }

      rows.push({
        workflowId: context.workflowId,
        collectionName,
        content: chunk,
        metadata: {
          ...staticMetadata,
          chunkIndex: String(index),
          chunkCount: String(chunks.length),
        },
        embeddingJson: JSON.stringify(embedding),
      });
    }

    if (rows.length > 0) {
      await db.insert(vectorDocuments).values(rows as any);
    }

    return {
      output: { indexed: rows.length, collection: collectionName, chunks: chunks.length },
      indexed: rows.length,
      collection: collectionName,
      chunks: chunks.length,
      embeddingModel,
    };
  }

  private async executeDataDocumentExtractor(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    if (!config.schema) {
      throw new Error('Document extractor requires a schema');
    }

    const inputText = this.extractTextValue(this.getNodeInput(node, context, definition)).trim();
    if (!inputText) {
      throw new Error('Document extractor requires input text');
    }

    const prompt = [
      'Extract structured data from the input and return only a JSON object that matches the provided schema.',
      `Schema: ${String(config.schema)}`,
      config.instruction ? `Instruction: ${String(config.instruction)}` : null,
      `Input: ${inputText}`,
    ].filter(Boolean).join('\n\n');

    const response = await generateText(
      { provider: 'openai', model: config.model || 'gpt-4o', outputFormat: 'json' },
      [{ role: 'user', content: prompt }],
      'document extraction',
      context
    );

    const parsed = this.parseJsonObject(response.text, 'Document extractor');
    return {
      output: parsed,
      data: parsed,
      raw: response.text,
      usage: response.usage,
      provider: response.provider,
      model: response.model,
    };
  }

  private async executeDataListOperator(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceArray = Array.isArray(inputValue)
      ? inputValue
      : Array.isArray(inputValue?.output)
        ? inputValue.output
        : Array.isArray(inputValue?.result)
          ? inputValue.result
          : Array.isArray(inputValue?.data)
            ? inputValue.data
            : null;

    if (!Array.isArray(sourceArray)) {
      throw new Error('List operator requires array input');
    }

    const operation = String(config.operation || 'filter');
    let result: any[] = [...sourceArray];

    switch (operation) {
      case 'filter': {
        const expression = String(config.filterExpression || 'true');
        result = sourceArray.filter((item, index, array) => Boolean(this.evaluateListExpression(expression, item, index, array, context)));
        break;
      }
      case 'map': {
        const expression = String(config.mapExpression || 'item');
        result = sourceArray.map((item, index, array) => this.evaluateListExpression(expression, item, index, array, context));
        break;
      }
      case 'sort': {
        const sortOrder = String(config.sortOrder || 'asc');
        result = [...sourceArray].sort((left, right) => {
          const leftValue = this.resolveSortValue(config.sortKey, left, 0, sourceArray, context);
          const rightValue = this.resolveSortValue(config.sortKey, right, 0, sourceArray, context);
          if (leftValue === rightValue) return 0;
          const comparison = leftValue > rightValue ? 1 : -1;
          return sortOrder === 'desc' ? -comparison : comparison;
        });
        break;
      }
      case 'slice':
        result = sourceArray.slice(
          config.sliceStart !== undefined ? Number(config.sliceStart) : 0,
          config.sliceEnd !== undefined && config.sliceEnd !== '' ? Number(config.sliceEnd) : undefined
        );
        break;
      case 'unique': {
        const seen = new Set<string>();
        result = sourceArray.filter((item) => {
          const key = typeof item === 'string' ? item : JSON.stringify(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        break;
      }
      case 'count':
        result = [];
        break;
      default:
        throw new Error(`Unsupported list operation: ${operation}`);
    }

    const count = operation === 'count' ? sourceArray.length : result.length;
    return {
      output: operation === 'count' ? count : result,
      result,
      count,
      operation,
    };
  }

  private async executeDataVariableAggregator(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const incomingValues = this.getIncomingNodeOutputs(node, definition, context).map((value) => this.unwrapNodeValue(value));
    const values = incomingValues.length > 0 ? incomingValues : [this.getNodeInput(node, context, definition)];
    const mode = String(config.mode || 'object');
    let combined: any;

    switch (mode) {
      case 'array':
        combined = values;
        break;
      case 'merge':
        combined = values.reduce((acc, value) => (value && typeof value === 'object' && !Array.isArray(value) ? { ...acc, ...value } : acc), {});
        break;
      case 'object':
      default: {
        const keys = Array.isArray(config.keys) ? config.keys : [];
        combined = Object.fromEntries(values.map((value, index) => [String(keys[index] || `input${index + 1}`), value]));
        break;
      }
    }

    return {
      output: combined,
      result: combined,
      mode,
      count: values.length,
    };
  }

  private async executeLoaderCsv(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const delimiter = String(config.delimiter || ',');
    const hasHeader = config.hasHeader !== false;
    const columns = Array.isArray(config.columns) ? config.columns.map(String) : undefined;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = config.url ? this.interpolateText(String(config.url), context) : '';

    let csvText = '';
    if (sourceUrl) {
      const response = await fetch(sourceUrl);
      csvText = await response.text();
      if (!response.ok) {
        throw new Error(`CSV loader request failed (${response.status}): ${csvText.slice(0, 500)}`);
      }
    } else {
      csvText = this.extractTextValue(inputValue);
    }

    if (!csvText.trim()) {
      throw new Error('CSV loader requires CSV input or url');
    }

    const parsed = this.parseCsvText(csvText, delimiter, hasHeader, columns);
    return {
      rows: parsed.rows,
      count: parsed.rows.length,
      columns: parsed.columns,
      metadata: {
        source: sourceUrl ? 'url' : 'input',
        url: sourceUrl || undefined,
        delimiter,
        hasHeader,
      },
    };
  }

  private async executeLoaderJson(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = config.url ? this.interpolateText(String(config.url), context) : '';

    let parsedJson: any;
    if (sourceUrl) {
      const response = await fetch(sourceUrl);
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`JSON loader request failed (${response.status}): ${bodyText.slice(0, 500)}`);
      }
      parsedJson = JSON.parse(bodyText);
    } else if (typeof inputValue === 'string') {
      parsedJson = JSON.parse(inputValue);
    } else {
      parsedJson = this.unwrapNodeValue(inputValue);
    }

    const selectedData = config.path ? this.traversePath(parsedJson, String(config.path)) : parsedJson;
    return {
      data: selectedData,
      count: Array.isArray(selectedData) ? selectedData.length : selectedData === undefined || selectedData === null ? 0 : 1,
      metadata: {
        source: sourceUrl ? 'url' : 'input',
        url: sourceUrl || undefined,
        path: config.path ? String(config.path) : undefined,
      },
    };
  }

  private async executeLoaderPdf(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = this.interpolateText(String(config.url || inputValue?.url || ''), context).trim();

    if (!sourceUrl) {
      throw new Error('PDF loader requires a url');
    }

    const response = await fetch(sourceUrl);
    const arrayBuffer = await response.arrayBuffer();
    if (!response.ok) {
      const errorText = Buffer.from(arrayBuffer).toString('utf8');
      throw new Error(`PDF loader request failed (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const pdfBuffer = Buffer.from(arrayBuffer);
    const binaryText = pdfBuffer.toString('latin1');
    const pageMatches = binaryText.match(/\/Type\s*\/Page\b/g) ?? [];
    const pageCount = pageMatches.length > 0 ? pageMatches.length : 1;
    const fileName = sourceUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
    const extractMetadata = config.extractMetadata === true;

    let text = '';
    let extractedMetadata: Record<string, any> = {};
    let extractionMethod = 'fallback';
    const openaiApiKey = this.getEnvironmentValue('OPENAI_API_KEY', context);

    if (openaiApiKey) {
      try {
        const uploadForm = new FormData();
        uploadForm.append('purpose', 'user_data');
        uploadForm.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

        const uploadResponse = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: uploadForm,
        });
        const uploadData = await this.parseJsonResponse(uploadResponse, 'OpenAI files');

        const extractionResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: 'Extract all text from this PDF. Return JSON with keys text and metadata.' },
                  { type: 'input_file', file_id: uploadData.id },
                ],
              },
            ],
          }),
        });
        const extractionData = await this.parseJsonResponse(extractionResponse, 'OpenAI responses');
        const extractedText = this.extractOpenAIResponseText(extractionData).trim();
        if (extractedText) {
          try {
            const parsed = JSON.parse(extractedText);
            text = typeof parsed?.text === 'string' ? parsed.text : extractedText;
            extractedMetadata = parsed?.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {};
          } catch {
            text = extractedText;
          }
          extractionMethod = 'openai';
        }
      } catch (error) {
        extractedMetadata.openaiError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    if (!text.trim()) {
      text = this.stripPdfBinary(binaryText);
    }

    return {
      text,
      pageCount,
      count: pageCount,
      metadata: {
        url: sourceUrl,
        fileName,
        extractionMethod,
        contentType: response.headers.get('content-type') || 'application/pdf',
        ...(extractMetadata ? {
          contentLength: pdfBuffer.byteLength,
          lastModified: response.headers.get('last-modified') || undefined,
        } : {}),
        ...extractedMetadata,
      },
    };
  }

  private async executeLoaderWebpage(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = this.interpolateText(String(config.url || inputValue?.url || ''), context).trim();
    const selector = config.selector ? this.interpolateText(String(config.selector), context) : undefined;
    const includeLinks = config.includeLinks === true;

    if (!sourceUrl) {
      throw new Error('Webpage loader requires a url');
    }

    const response = await fetch(sourceUrl);
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`Webpage loader request failed (${response.status}): ${html.slice(0, 500)}`);
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this.stripHtml(titleMatch[1]) : sourceUrl;
    const text = selector ? this.extractHtmlBySelector(html, selector) : this.stripHtml(html);
    const links = includeLinks ? this.extractLinks(html) : [];

    return {
      text,
      title,
      url: sourceUrl,
      links,
      count: text.length,
      metadata: {
        selector,
        includeLinks,
        statusCode: response.status,
      },
    };
  }

  private async executeLoaderGithub(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const repoValue = this.interpolateText(String(config.repo || ''), context).trim();
    const branch = this.interpolateText(String(config.branch || 'main'), context).trim() || 'main';
    const startPath = this.interpolateText(String(config.path || ''), context).replace(/^\/+|\/+$/g, '');
    const fileTypes = Array.isArray(config.fileTypes) ? config.fileTypes.map((value: string) => String(value)) : [];
    const githubToken = this.getEnvironmentValueOrThrow('GITHUB_TOKEN', context);

    const [owner, repo] = repoValue.split('/');
    if (!owner || !repo) {
      throw new Error('GitHub loader repo must be in the format owner/repo');
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
    };
    const files: Array<{ path: string; content: string; size: number }> = [];
    const matchesFileType = (path: string) => fileTypes.length === 0 || fileTypes.some((fileType) => path.endsWith(fileType));
    const buildContentsUrl = (path: string) => {
      const encodedPath = path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return `https://api.github.com/repos/${owner}/${repo}/contents${encodedPath ? `/${encodedPath}` : ''}?ref=${encodeURIComponent(branch)}`;
    };

    const fetchContentEntry = async (path: string) => {
      const response = await fetch(buildContentsUrl(path), { headers });
      const data = await this.parseJsonResponse(response, 'GitHub API');
      if (data?.type !== 'file') {
        return;
      }

      const decodedContent = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
      files.push({
        path: String(data.path),
        content: decodedContent,
        size: Number(data.size ?? Buffer.byteLength(decodedContent)),
      });
    };

    const visitPath = async (path: string) => {
      const response = await fetch(buildContentsUrl(path), { headers });
      const data = await this.parseJsonResponse(response, 'GitHub API');

      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry?.type === 'dir') {
            await visitPath(String(entry.path));
          } else if (entry?.type === 'file' && matchesFileType(String(entry.path))) {
            await fetchContentEntry(String(entry.path));
          }
        }
        return;
      }

      if (data?.type === 'dir') {
        await visitPath(String(data.path));
        return;
      }

      if (data?.type === 'file' && matchesFileType(String(data.path))) {
        const decodedContent = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
        files.push({
          path: String(data.path),
          content: decodedContent,
          size: Number(data.size ?? Buffer.byteLength(decodedContent)),
        });
      }
    };

    await visitPath(startPath);

    return {
      files,
      totalFiles: files.length,
      count: files.length,
      metadata: {
        repo: repoValue,
        branch,
        path: startPath || undefined,
        fileTypes,
      },
    };
  }

  private async executeLoaderNotion(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const pageId = this.interpolateText(String(config.pageId || inputValue?.pageId || ''), context).trim();
    const databaseId = this.interpolateText(String(config.databaseId || inputValue?.databaseId || ''), context).trim();
    const recursive = config.recursive === true;
    const notionToken = this.getEnvironmentValueOrThrow('NOTION_TOKEN', context);
    const headers = {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    if (!pageId && !databaseId) {
      throw new Error('Notion loader requires pageId or databaseId');
    }

    if (pageId) {
      const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });
      const pageData = await this.parseJsonResponse(pageResponse, 'Notion API');
      const content = (await this.fetchNotionBlockText(pageId, recursive, headers)).join('\n\n').trim();
      const properties = this.simplifyNotionProperties(pageData?.properties);
      const title = this.extractNotionTitle(pageData?.properties) || pageId;

      return {
        content,
        title,
        properties,
        count: content.length,
        metadata: {
          pageId,
          recursive,
        },
      };
    }

    const [databaseResponse, queryResponse] = await Promise.all([
      fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers }),
      fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ page_size: 100 }),
      }),
    ]);
    const databaseData = await this.parseJsonResponse(databaseResponse, 'Notion API');
    const queryData = await this.parseJsonResponse(queryResponse, 'Notion API');

    const pages = Array.isArray(queryData?.results) ? queryData.results : [];
    const entries = [];
    for (const page of pages) {
      const title = this.extractNotionTitle(page?.properties) || page?.id;
      const properties = this.simplifyNotionProperties(page?.properties);
      const blockText = recursive ? (await this.fetchNotionBlockText(String(page.id), true, headers)).join('\n\n').trim() : '';
      entries.push({
        id: page?.id,
        title,
        properties,
        content: blockText,
      });
    }

    const content = entries
      .map((entry) => [entry.title, entry.content].filter(Boolean).join('\n\n'))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const databaseTitle = Array.isArray(databaseData?.title)
      ? databaseData.title.map((item: any) => item?.plain_text ?? '').filter(Boolean).join('')
      : databaseId;

    return {
      content,
      title: databaseTitle || databaseId,
      properties: { results: entries.map(({ properties, id, title }) => ({ id, title, properties })) },
      count: content.length,
      metadata: {
        databaseId,
        recursive,
        pageCount: entries.length,
      },
    };
  }

  private async executeLoaderGoogleDrive(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const fileId = this.interpolateText(String(config.fileId || inputValue?.fileId || ''), context).trim();

    if (!fileId) {
      throw new Error('Google Drive loader requires a fileId');
    }

    const googleToken = this.getEnvironmentValueOrThrow('GOOGLE_ACCESS_TOKEN', context);
    const headers = {
      Authorization: `Bearer ${googleToken}`,
    };

    const [metadataResponse, contentResponse] = await Promise.all([
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, { headers }),
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers }),
    ]);
    const metadataData = await this.parseJsonResponse(metadataResponse, 'Google Drive API');
    const contentBuffer = Buffer.from(await contentResponse.arrayBuffer());
    if (!contentResponse.ok) {
      throw new Error(`Google Drive API request failed (${contentResponse.status}): ${contentBuffer.toString('utf8').slice(0, 500)}`);
    }

    const mimeType = String(config.mimeType || metadataData?.mimeType || contentResponse.headers.get('content-type') || 'application/octet-stream');
    const content = /^text\/|json|xml|javascript|csv/i.test(mimeType)
      ? contentBuffer.toString('utf8')
      : contentBuffer.toString('base64');

    return {
      content,
      fileName: String(metadataData?.name || fileId),
      mimeType,
      count: content.length,
      metadata: {
        fileId,
      },
    };
  }

  private async executeLoaderAirtable(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const baseId = this.interpolateText(String(config.baseId || inputValue?.baseId || ''), context).trim();
    const tableId = this.interpolateText(String(config.tableId || inputValue?.tableId || ''), context).trim();
    const filterFormula = config.filterFormula ? this.interpolateText(String(config.filterFormula), context) : undefined;
    const maxRecords = Math.max(1, Number(config.maxRecords ?? 100));

    if (!baseId || !tableId) {
      throw new Error('Airtable loader requires baseId and tableId');
    }

    const airtableApiKey = this.getEnvironmentValueOrThrow('AIRTABLE_API_KEY', context);
    const headers = {
      Authorization: `Bearer ${airtableApiKey}`,
    };
    const records: Array<Record<string, any>> = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        pageSize: String(Math.min(100, maxRecords - records.length)),
        maxRecords: String(Math.min(100, maxRecords - records.length)),
      });
      if (filterFormula) {
        params.set('filterByFormula', filterFormula);
      }
      if (offset) {
        params.set('offset', offset);
      }

      const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}?${params.toString()}`, { headers });
      const data = await this.parseJsonResponse(response, 'Airtable API');
      const pageRecords = Array.isArray(data?.records) ? data.records : [];
      records.push(...pageRecords.map((record: any) => ({ id: record?.id, ...(record?.fields ?? {}) })));
      offset = typeof data?.offset === 'string' ? data.offset : undefined;
    } while (offset && records.length < maxRecords);

    const limitedRecords = records.slice(0, maxRecords);
    const fields = Array.from(new Set(limitedRecords.flatMap((record) => Object.keys(record).filter((key) => key !== 'id'))));

    return {
      records: limitedRecords,
      count: limitedRecords.length,
      fields,
      metadata: {
        baseId,
        tableId,
        filterFormula,
      },
    };
  }

  private async executeLoaderRss(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = this.interpolateText(String(config.url || inputValue?.url || ''), context).trim();
    const maxItems = Math.max(1, Number(config.maxItems ?? 10));
    const includeContent = config.includeContent === true;

    if (!sourceUrl) {
      throw new Error('RSS loader requires a url');
    }

    const response = await fetch(sourceUrl);
    const xml = await response.text();
    if (!response.ok) {
      throw new Error(`RSS loader request failed (${response.status}): ${xml.slice(0, 500)}`);
    }

    const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
    const entries = (blocks.length > 0 ? blocks : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]))
      .slice(0, maxItems)
      .map((block) => {
        const atomLinkMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
        return {
          title: this.extractXmlTagValue(block, ['title']),
          url: atomLinkMatch?.[1] || this.extractXmlTagValue(block, ['link', 'id']),
          description: includeContent
            ? this.extractXmlTagValue(block, ['content', 'encoded', 'description', 'summary'])
            : this.extractXmlTagValue(block, ['description', 'summary']),
          publishedAt: this.extractXmlTagValue(block, ['pubDate', 'published', 'updated']),
        };
      });

    return {
      items: entries,
      count: entries.length,
      metadata: {
        url: sourceUrl,
        includeContent,
      },
    };
  }

  private async executeLoaderSitemap(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const inputValue = this.getNodeInput(node, context, definition);
    const sourceUrl = this.interpolateText(String(config.url || inputValue?.url || ''), context).trim();
    const maxUrls = Math.max(1, Number(config.maxUrls ?? 50));
    const filter = config.filter ? this.interpolateText(String(config.filter), context) : '';

    if (!sourceUrl) {
      throw new Error('Sitemap loader requires a url');
    }

    const response = await fetch(sourceUrl);
    const xml = await response.text();
    if (!response.ok) {
      throw new Error(`Sitemap loader request failed (${response.status}): ${xml.slice(0, 500)}`);
    }

    const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
      .map((match) => this.decodeHtmlEntities(match[1]).trim())
      .filter((url) => !filter || url.includes(filter))
      .slice(0, maxUrls);

    return {
      urls,
      count: urls.length,
      metadata: {
        url: sourceUrl,
        filter: filter || undefined,
      },
    };
  }

  private async executeEmbeddingOpenAI(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const model = String(config.model || 'text-embedding-3-small');
    const textInput = this.getEmbeddingTextInput(input, config.input);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getOpenAIApiKey(context)}`,
      },
      body: JSON.stringify({ model, input: textInput }),
    });
    const data = await this.parseJsonResponse(response, 'OpenAI embeddings');
    const embedding = this.normalizeEmbeddingResponse(data?.data?.[0]?.embedding);

    return {
      output: { embedding, dimensions: embedding.length, model },
      embedding,
      dimensions: embedding.length,
      model,
      input: textInput,
      usage: data?.usage,
    };
  }

  private async executeEmbeddingCohere(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const model = String(config.model || 'embed-english-v3.0');
    const inputType = String(config.inputType || 'search_document');
    const textInput = this.getEmbeddingTextInput(input);
    const response = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getRequiredSecretValue(context, 'COHERE_API_KEY')}`,
      },
      body: JSON.stringify({
        model,
        texts: [textInput],
        input_type: inputType,
      }),
    });
    const data = await this.parseJsonResponse(response, 'Cohere embeddings');
    const embeddingPayload = data?.embeddings?.[0] ?? data?.embeddings?.float?.[0];
    const embedding = this.normalizeEmbeddingResponse(embeddingPayload);

    return {
      output: { embedding, dimensions: embedding.length, model },
      embedding,
      dimensions: embedding.length,
      model,
      inputType,
      input: textInput,
    };
  }

  private async executeEmbeddingHuggingFace(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const model = String(config.model || 'sentence-transformers/all-MiniLM-L6-v2');
    const textInput = this.getEmbeddingTextInput(input);
    const encodedModel = model.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const response = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${encodedModel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getRequiredSecretValue(context, 'HF_API_KEY')}`,
      },
      body: JSON.stringify(textInput),
    });
    const data = await this.parseJsonResponse(response, 'Hugging Face embeddings');
    const embedding = this.normalizeEmbeddingResponse(data);

    return {
      output: { embedding, dimensions: embedding.length, model },
      embedding,
      dimensions: embedding.length,
      model,
      input: textInput,
    };
  }

  private async executeVectorStorePinecone(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const baseUrl = this.normalizeBaseUrl(this.getRequiredSecretValue(context, 'PINECONE_HOST'), 'PINECONE_HOST');
    const headers = {
      'Content-Type': 'application/json',
      'Api-Key': this.getRequiredSecretValue(context, 'PINECONE_API_KEY'),
    };

    if (operation === 'upsert') {
      const embedding = this.ensureEmbeddingInput(input);
      const id = this.getVectorRecordId(input);
      const metadata = this.getVectorMetadata(input);
      const response = await fetch(`${baseUrl}/vectors/upsert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vectors: [{ id, values: embedding, metadata }],
          namespace: config.namespace || undefined,
        }),
      });
      const data = await this.parseJsonResponse(response, 'Pinecone upsert');
      return {
        output: { id, namespace: config.namespace || null, upsertedCount: data?.upsertedCount ?? 1 },
        id,
        upsertedCount: data?.upsertedCount ?? 1,
      };
    }

    if (operation === 'query') {
      const embedding = this.ensureEmbeddingInput(input);
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vector: embedding,
          topK: Number(config.topK ?? 5),
          namespace: config.namespace || undefined,
          includeMetadata: config.includeMetadata ?? true,
        }),
      });
      const data = await this.parseJsonResponse(response, 'Pinecone query');
      const matches = Array.isArray(data?.matches)
        ? data.matches.map((match: any) => ({
            id: String(match.id),
            score: Number(match.score ?? 0),
            metadata: match.metadata ?? {},
          }))
        : [];
      return { output: { matches }, matches };
    }

    if (operation === 'delete') {
      const ids = this.getVectorDeleteIds(input);
      const response = await fetch(`${baseUrl}/vectors/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids, namespace: config.namespace || undefined }),
      });
      await this.parseJsonResponse(response, 'Pinecone delete');
      return { output: { deletedIds: ids }, deletedIds: ids };
    }

    throw new Error(`Unsupported Pinecone operation: ${operation}`);
  }

  private async executeVectorStoreQdrant(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const collectionName = String(config.collectionName || '').trim();
    if (!collectionName) throw new Error('Qdrant collectionName is required');
    const baseUrl = this.normalizeBaseUrl(this.getSecretValue(context, 'QDRANT_URL') || 'http://localhost:6333', 'QDRANT_URL');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getSecretValue(context, 'QDRANT_API_KEY');
    if (apiKey) headers['api-key'] = apiKey;

    if (operation === 'upsert') {
      const embedding = this.ensureEmbeddingInput(input);
      const id = this.getVectorRecordId(input);
      const payload = this.getVectorMetadata(input);
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collectionName)}/points`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ points: [{ id, vector: embedding, payload }] }),
      });
      const data = await this.parseJsonResponse(response, 'Qdrant upsert');
      return { output: { id, status: data?.status ?? 'ok' }, id, status: data?.status ?? 'ok' };
    }

    if (operation === 'query') {
      const embedding = this.ensureEmbeddingInput(input);
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collectionName)}/points/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vector: embedding, limit: Number(config.topK ?? 5), with_payload: true }),
      });
      const data = await this.parseJsonResponse(response, 'Qdrant query');
      const matches = Array.isArray(data?.result)
        ? data.result.map((match: any) => ({
            id: String(match.id),
            score: Number(match.score ?? 0),
            metadata: match.payload ?? {},
          }))
        : [];
      return { output: { matches }, matches };
    }

    if (operation === 'delete') {
      const ids = this.getVectorDeleteIds(input);
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collectionName)}/points/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ points: ids }),
      });
      await this.parseJsonResponse(response, 'Qdrant delete');
      return { output: { deletedIds: ids }, deletedIds: ids };
    }

    throw new Error(`Unsupported Qdrant operation: ${operation}`);
  }

  private async executeVectorStoreChroma(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const collectionName = String(config.collectionName || '').trim();
    if (!collectionName) throw new Error('Chroma collectionName is required');
    const baseUrl = this.normalizeBaseUrl(this.getSecretValue(context, 'CHROMA_URL') || 'http://localhost:8000', 'CHROMA_URL');
    const collectionId = await this.getChromaCollectionId(baseUrl, collectionName);
    const headers = { 'Content-Type': 'application/json' };

    if (operation === 'upsert') {
      const embedding = this.ensureEmbeddingInput(input);
      const id = this.getVectorRecordId(input);
      const metadata = this.getVectorMetadata(input);
      const response = await fetch(`${baseUrl}/api/v1/collections/${encodeURIComponent(collectionId)}/upsert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          embeddings: [embedding],
          metadatas: [metadata],
          ids: [id],
        }),
      });
      await this.parseJsonResponse(response, 'Chroma upsert');
      return { output: { id, collectionId }, id, collectionId };
    }

    if (operation === 'query') {
      const embedding = this.ensureEmbeddingInput(input);
      const response = await fetch(`${baseUrl}/api/v1/collections/${encodeURIComponent(collectionId)}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query_embeddings: [embedding], n_results: Number(config.topK ?? 5) }),
      });
      const data = await this.parseJsonResponse(response, 'Chroma query');
      const ids = Array.isArray(data?.ids?.[0]) ? data.ids[0] : [];
      const metadatas = Array.isArray(data?.metadatas?.[0]) ? data.metadatas[0] : [];
      const distances = Array.isArray(data?.distances?.[0]) ? data.distances[0] : [];
      const documents = Array.isArray(data?.documents?.[0]) ? data.documents[0] : [];
      const matches = ids.map((id: any, index: number) => ({
        id: String(id),
        score: typeof distances[index] === 'number' ? 1 - Number(distances[index]) : 0,
        metadata: metadatas[index] ?? {},
        content: documents[index] ?? undefined,
      }));
      return { output: { matches }, matches };
    }

    if (operation === 'delete') {
      const ids = this.getVectorDeleteIds(input);
      const response = await fetch(`${baseUrl}/api/v1/collections/${encodeURIComponent(collectionId)}/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      });
      await this.parseJsonResponse(response, 'Chroma delete');
      return { output: { deletedIds: ids }, deletedIds: ids };
    }

    throw new Error(`Unsupported Chroma operation: ${operation}`);
  }

  private async executeVectorStoreWeaviate(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const className = String(config.className || '').trim();
    if (!className) throw new Error('Weaviate className is required');
    const baseUrl = this.normalizeBaseUrl(this.getSecretValue(context, 'WEAVIATE_URL') || 'http://localhost:8080', 'WEAVIATE_URL');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getSecretValue(context, 'WEAVIATE_API_KEY');
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    if (operation === 'upsert') {
      const embedding = this.ensureEmbeddingInput(input);
      const properties = this.getVectorMetadata(input);
      const response = await fetch(`${baseUrl}/v1/objects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ class: className, properties, vector: embedding }),
      });
      const data = await this.parseJsonResponse(response, 'Weaviate upsert');
      return { output: { id: data?.id, className }, id: data?.id, className };
    }

    if (operation === 'query') {
      const embedding = this.ensureEmbeddingInput(input);
      const query = `query Get${className} { Get { ${className}(nearVector: { vector: ${JSON.stringify(embedding)} }, limit: ${Number(config.topK ?? 5)}) { _additional { id distance certainty } } } }`;
      const response = await fetch(`${baseUrl}/v1/graphql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });
      const data = await this.parseJsonResponse(response, 'Weaviate query');
      const items = Array.isArray(data?.data?.Get?.[className]) ? data.data.Get[className] : [];
      const matches = items.map((item: any) => ({
        id: String(item?._additional?.id ?? ''),
        score: typeof item?._additional?.certainty === 'number'
          ? Number(item._additional.certainty)
          : typeof item?._additional?.distance === 'number'
            ? 1 - Number(item._additional.distance)
            : 0,
        metadata: Object.fromEntries(Object.entries(item ?? {}).filter(([key]) => key !== '_additional')),
      }));
      return { output: { matches }, matches };
    }

    throw new Error(`Unsupported Weaviate operation: ${operation}`);
  }

  private async executeVectorStorePgvector(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const collectionName = String(input?.collectionName || input?.namespace || input?.metadata?.collectionName || config.collectionName || config.tableName || 'vector_documents').trim();

    if (operation === 'upsert') {
      if (!context.workflowId) {
        throw new Error('pgvector upsert requires a workflow ID');
      }
      const embedding = this.ensureEmbeddingInput(input);
      const metadata = this.getVectorMetadata(input);
      const content = String(input?.content || input?.text || input?.pageContent || input?.metadata?.content || JSON.stringify(metadata));
      const row = {
        workflowId: context.workflowId,
        collectionName,
        content,
        metadata,
        embeddingJson: JSON.stringify(embedding),
      };
      const inserted = await db.insert(vectorDocuments).values(row as any).returning({ id: vectorDocuments.id });
      return { output: { id: inserted[0]?.id, collectionName }, id: inserted[0]?.id, collectionName };
    }

    if (operation === 'query') {
      const embedding = this.ensureEmbeddingInput(input);
      const rows = await db.select().from(vectorDocuments).where(eq(vectorDocuments.collectionName, collectionName));
      const matches = rows
        .filter((row) => !context.workflowId || row.workflowId === context.workflowId)
        .map((row) => {
          const storedEmbedding = row.embeddingJson ? JSON.parse(row.embeddingJson) : [];
          const vector = Array.isArray(storedEmbedding) ? storedEmbedding.map((value) => Number(value)) : [];
          return {
            id: row.id,
            score: this.cosineSimilarity(embedding, vector),
            content: row.content,
            metadata: row.metadata ?? {},
          };
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, Number(config.topK ?? 5));
      return { output: { matches }, matches };
    }

    throw new Error(`Unsupported pgvector operation: ${operation}`);
  }

  private async executeVectorStoreRedis(
    node: Node<WorkflowNodeData>,
    definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
    context: ExecutionContext
  ): Promise<any> {
    const config = (node.data.config ?? {}) as Record<string, any>;
    const input = this.getNodeInput(node, context, definition);
    const operation = String(config.operation || 'upsert');
    const keyPrefix = String(config.keyPrefix || 'vec').trim() || 'vec';

    if (operation === 'upsert') {
      const embedding = this.ensureEmbeddingInput(input);
      const metadata = this.getVectorMetadata(input);
      const id = this.getVectorRecordId(input);
      const key = `${keyPrefix}:${id}`;
      await this.executeRedisRestCommand(context, ['SET', key, JSON.stringify({ embedding, metadata })]);
      return { output: { key, id }, key, id };
    }

    if (operation === 'query') {
      const queryEmbedding = this.ensureEmbeddingInput(input);
      const keysResponse = await this.executeRedisRestCommand(context, ['KEYS', `${keyPrefix}:*`]);
      const keys = Array.isArray(keysResponse?.result) ? keysResponse.result : [];
      const matches = [] as Array<{ key: string; score: number; metadata: Record<string, any> }>;

      for (const key of keys) {
        const valueResponse = await this.executeRedisRestCommand(context, ['GET', String(key)]);
        if (typeof valueResponse?.result !== 'string') continue;
        try {
          const parsed = JSON.parse(valueResponse.result);
          const embedding = this.ensureEmbeddingInput(parsed);
          matches.push({
            key: String(key),
            score: this.cosineSimilarity(queryEmbedding, embedding),
            metadata: parsed?.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
          });
        } catch {
          // Ignore malformed records.
        }
      }

      matches.sort((left, right) => right.score - left.score);
      const limited = matches.slice(0, Number(config.topK ?? 5));
      return { output: { matches: limited }, matches: limited };
    }

    throw new Error(`Unsupported Redis vector operation: ${operation}`);
  }

  private async executeOutputResponse(
    node: Node<WorkflowNodeData>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.data.config;

    // Get response data from config or inputs
    const responseData = config.data || node.data.inputs || context.nodeOutputs;
    const statusCode = config.statusCode || config.status || 200;
    const headers = config.headers || {};

    // Support variable interpolation in response data
    let data = responseData;
    if (typeof responseData === 'string') {
      data = this.interpolateText(responseData, context);
      // Try to parse as JSON
      try {
        data = JSON.parse(data);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    // Log response
    await this.logNodeExecution(
      node.id,
      (node.data as any).label || node.data.type,
      'info',
      'Workflow response generated',
      { statusCode, data },
      context
    );

    return {
      response: true,
      statusCode,
      headers,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
