/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from 'drizzle-orm';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { db } from '@/lib/db';
import { executions, vectorDocuments } from '@/lib/db/schema';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { fetchWithTimeout, interpolate, interpolateDeep, resolveNodeInput, safeJsonParse, withRetry } from './utils';

type GenericConfig = Record<string, any>;
type Metadata = Record<string, any>;

type RagDocument = {
  content: string;
  metadata: Metadata;
};

type EmbeddedDocument = RagDocument & {
  embedding: number[];
};

type StoredVector = EmbeddedDocument & {
  id?: string;
  score?: number;
};

type WorkflowNode = {
  id: string;
  data?: WorkflowNodeData;
};

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_QA_MODEL = 'gpt-4o-mini';
const DEFAULT_CONTEXT_TEMPLATE = 'Use the following context to answer the question:\n\n{context}\n\nQuestion: {question}';
const DEFAULT_SYSTEM_PROMPT = 'You are a retrieval-augmented assistant. Answer using only the supplied context. If the answer is not in the context, say you do not know.';

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep(node.data?.config ?? {}, context) ?? {};
}

function getTimeout(config: GenericConfig): number {
  const timeout = Number(config.timeout ?? DEFAULT_TIMEOUT);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT;
}

function toErrorResult(error: unknown) {
  return {
    error: error instanceof Error ? error.message : String(error),
    output: null,
  };
}

function stringifyValue(value: any): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asRecord(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [];
}

function resolveInput(config: GenericConfig, context: ExecutorContext): any {
  return resolveNodeInput(context, typeof config.inputVariable === 'string' ? config.inputVariable : undefined);
}

function decodeBase64Payload(value: string): Buffer {
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) {
    const [, encoded] = trimmed.split(',', 2);
    return Buffer.from(encoded ?? '', 'base64');
  }
  return Buffer.from(trimmed, 'base64');
}

function isProbablyBase64(value: string): boolean {
  const trimmed = value.replace(/\s+/g, '');
  return trimmed.length > 0 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

function normalizeDocument(value: any, fallbackSource: string, index: number): RagDocument | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const content = value.trim();
    return content ? { content, metadata: { source: fallbackSource, index } } : null;
  }

  const record = asRecord(value);
  const content = stringifyValue(record.content ?? record.pageContent ?? record.text ?? record.body).trim();
  if (!content) return null;
  return {
    content,
    metadata: {
      source: fallbackSource,
      ...asRecord(record.metadata),
    },
  };
}

function getDocumentsFromInput(input: any, fallbackSource = 'input'): RagDocument[] {
  const directDocuments = asArray(input?.documents);
  if (directDocuments.length > 0) {
    return directDocuments
      .map((document, index) => normalizeDocument(document, fallbackSource, index))
      .filter((document): document is RagDocument => Boolean(document));
  }

  if (Array.isArray(input)) {
    return input
      .map((document, index) => normalizeDocument(document, fallbackSource, index))
      .filter((document): document is RagDocument => Boolean(document));
  }

  const single = normalizeDocument(input, fallbackSource, 0);
  return single ? [single] : [];
}

function getEmbeddingsFromInput(input: any): EmbeddedDocument[] {
  const rawItems = asArray(input?.embeddings).length > 0 ? asArray(input?.embeddings) : asArray(input);
  return rawItems
    .map((item) => {
      const record = asRecord(item);
      const embedding = Array.isArray(record.embedding) ? record.embedding.map((value) => Number(value)) : [];
      if (embedding.length === 0) return null;
      return {
        content: stringifyValue(record.content ?? record.text ?? record.pageContent),
        embedding,
        metadata: asRecord(record.metadata),
      } satisfies EmbeddedDocument;
    })
    .filter((item): item is EmbeddedDocument => Boolean(item));
}

function getResultsFromInput(input: any): StoredVector[] {
  const rawItems = asArray(input?.documents).length > 0
    ? asArray(input?.documents)
    : asArray(input?.results).length > 0
      ? asArray(input?.results)
      : asArray(input);

  return rawItems
    .map((item): StoredVector | null => {
      const record = asRecord(item);
      const content = stringifyValue(record.content ?? record.text ?? record.pageContent).trim();
      if (!content) return null;
      const embedding = Array.isArray(record.embedding) ? record.embedding.map((value) => Number(value)) : [];
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        content,
        metadata: asRecord(record.metadata),
        embedding,
        score: record.score !== undefined ? Number(record.score) : undefined,
      };
    })
    .filter((item): item is StoredVector => item !== null);
}

function getQueryText(config: GenericConfig, input: any): string {
  const direct = [config.query, config.question, input?.query, input?.question, input?.text]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);

  if (direct) return direct;
  if (typeof input === 'string') return input.trim();
  return '';
}

function getQueryEmbedding(input: any): number[] | null {
  const candidates = [input?.queryEmbedding, input?.embedding, input?.vector, input];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((value) => typeof value === 'number')) {
      return candidate.map((value) => Number(value));
    }
    if (typeof candidate === 'string') {
      const parsed = safeJsonParse(candidate);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'number')) {
        return parsed.map((value) => Number(value));
      }
    }
  }
  return null;
}

function splitByCharacterWindow(text: string, chunkSize: number, chunkOverlap: number, smartBreak = false): string[] {
  if (!text.trim()) return [];
  const size = Math.max(1, chunkSize);
  const overlap = Math.min(Math.max(0, chunkOverlap), Math.max(0, size - 1));
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (smartBreak && end < text.length) {
      const windowText = text.slice(start, end);
      const breakCandidates = ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '];
      for (const candidate of breakCandidates) {
        const breakIndex = windowText.lastIndexOf(candidate);
        if (breakIndex > Math.floor(windowText.length * 0.6)) {
          end = start + breakIndex + candidate.length;
          break;
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function splitRecursively(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const blocks = text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return splitByCharacterWindow(text, chunkSize, chunkOverlap, true);
  }

  const merged: string[] = [];
  let current = '';
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }
    if (current) merged.push(current);
    if (block.length > chunkSize) {
      merged.push(...splitByCharacterWindow(block, chunkSize, chunkOverlap, true));
      current = '';
    } else {
      current = block;
    }
  }
  if (current) merged.push(current);
  return merged;
}

function splitMarkdown(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const sections = text
    .split(/(?=^#{1,3}\s)/gm)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return splitRecursively(text, chunkSize, chunkOverlap);
  }

  return sections.flatMap((section) =>
    section.length > chunkSize ? splitByCharacterWindow(section, chunkSize, chunkOverlap, true) : [section]
  );
}

function splitText(text: string, strategy: string, chunkSize: number, chunkOverlap: number): string[] {
  switch (strategy) {
    case 'character':
      return splitByCharacterWindow(text, chunkSize, chunkOverlap, false);
    case 'token':
      return splitByCharacterWindow(text, chunkSize, chunkOverlap, true);
    case 'markdown':
      return splitMarkdown(text, chunkSize, chunkOverlap);
    case 'recursive':
    default:
      return splitRecursively(text, chunkSize, chunkOverlap);
  }
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).trim() || undefined : undefined;
}

function extractSelectorHtml(html: string, selector?: string): string {
  if (!selector) return html;
  const trimmed = selector.trim();
  if (!trimmed) return html;

  if (trimmed.startsWith('#')) {
    const id = trimmed.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<([a-z0-9-]+)([^>]*\\bid=["']${id}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i'));
    return match?.[0] ?? html;
  }

  if (trimmed.startsWith('.')) {
    const className = trimmed.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<([a-z0-9-]+)([^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i'));
    return match?.[0] ?? html;
  }

  const tag = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[0] ?? html;
}

function extractLinks(baseUrl: string, html: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html))) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.origin === base.origin) {
        links.add(resolved.toString());
      }
    } catch {
      // Ignore invalid URLs.
    }
  }

  return Array.from(links);
}

function extractPdfTextFallback(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const textBlocks = Array.from(raw.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g))
    .map((match) =>
      match[1]
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .trim()
    )
    .filter((block) => /[A-Za-z0-9]/.test(block) && block.length > 2);

  if (textBlocks.length > 0) {
    return textBlocks.join(' ');
  }

  const printable = raw
    .replace(/[^\x20-\x7E\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return printable;
}

function splitPdfPages(text: string, pageCount: number): string[] {
  const byFormFeed = text.split(/\f+/g).map((page) => page.trim()).filter(Boolean);
  if (byFormFeed.length > 0) return byFormFeed;
  if (pageCount <= 1 || !text.trim()) return [text.trim()].filter(Boolean);
  return [text.trim()];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (magnitudeA * magnitudeB);
}

function keywordRerankScore(query: string, content: string, baseScore = 0): number {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 1);
  const normalizedContent = content.toLowerCase();
  const keywordHits = terms.reduce((score, term) => score + (normalizedContent.includes(term) ? 1 : 0), 0);
  return baseScore + keywordHits;
}

function mmrSelect(candidates: StoredVector[], queryEmbedding: number[], topK: number, lambda = 0.7): StoredVector[] {
  const remaining = [...candidates];
  const selected: StoredVector[] = [];

  while (remaining.length > 0 && selected.length < topK) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const relevance = candidate.embedding.length > 0 ? cosineSimilarity(queryEmbedding, candidate.embedding) : candidate.score ?? 0;
      const diversityPenalty = selected.length === 0
        ? 0
        : Math.max(
            ...selected.map((selectedDoc) =>
              selectedDoc.embedding.length > 0 && candidate.embedding.length > 0
                ? cosineSimilarity(candidate.embedding, selectedDoc.embedding)
                : 0
            )
          );
      const score = lambda * relevance - (1 - lambda) * diversityPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

async function logExecution(
  deps: ExecutorDeps,
  nodeId: string,
  nodeName: string,
  level: 'info' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(nodeId, nodeName, level, message, data, context);
  } catch {
    // Ignore logging errors.
  }
}

async function fetchResponse(url: string, config: GenericConfig, options: RequestInit = {}): Promise<Response> {
  const timeout = getTimeout(config);
  const headers = {
    ...asRecord(safeJsonParse(typeof config.headers === 'string' ? config.headers : '{}')),
    ...asRecord(options.headers),
  };

  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, { ...options, headers, timeout });
      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        throw new Error(`Request failed (${response.status}): ${body || response.statusText}`);
      }
      return response;
    },
    { maxAttempts: 3 }
  );
}

async function fetchBinary(url: string, config: GenericConfig): Promise<Buffer> {
  const response = await fetchResponse(url, config);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url: string, config: GenericConfig): Promise<string> {
  const response = await fetchResponse(url, config);
  return response.text();
}

function resolveSecretValue(context: ExecutorContext, key: string): string | undefined {
  return context.secrets?.[key] ?? context.envVars?.[key] ?? process.env[key];
}

function resolveApiKey(config: GenericConfig, context: ExecutorContext, possibleKeys: string[]): string {
  const directKey = typeof config.apiKey === 'string' && config.apiKey.trim() ? config.apiKey.trim() : '';
  if (directKey) return directKey;
  for (const key of possibleKeys) {
    const value = resolveSecretValue(context, key);
    if (value) return value;
  }
  throw new Error(`Missing API key. Expected one of: ${possibleKeys.join(', ')}`);
}

async function openAIEmbeddings(texts: string[], model: string, apiKey: string, timeout: number): Promise<number[][]> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    timeout,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return asArray(data?.data).map((item) => asArray<number>(item?.embedding).map((value) => Number(value)));
}

async function cohereEmbeddings(texts: string[], model: string, apiKey: string, timeout: number): Promise<number[][]> {
  const response = await fetchWithTimeout('https://api.cohere.ai/v1/embed', {
    method: 'POST',
    timeout,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      texts,
      input_type: 'search_document',
      truncate: 'END',
    }),
  });

  if (!response.ok) {
    throw new Error(`Cohere embeddings failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return asArray(data?.embeddings).map((embedding) => asArray<number>(embedding).map((value) => Number(value)));
}

async function embedTexts(texts: string[], config: GenericConfig, context: ExecutorContext): Promise<{ embeddings: number[][]; provider: string; model: string }> {
  const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim().toLowerCase() : 'openai';
  const model = typeof config.model === 'string' && config.model.trim()
    ? config.model.trim()
    : provider === 'cohere'
      ? 'embed-english-v3.0'
      : DEFAULT_EMBEDDING_MODEL;
  const timeout = getTimeout(config);

  if (provider === 'cohere') {
    const apiKey = resolveApiKey(config, context, ['COHERE_API_KEY']);
    return { embeddings: await cohereEmbeddings(texts, model, apiKey, timeout), provider, model };
  }

  const apiKey = resolveApiKey(config, context, ['OPENAI_API_KEY']);
  return { embeddings: await openAIEmbeddings(texts, model, apiKey, timeout), provider: 'openai', model };
}

async function callLlm(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  prompt: string,
  timeout: number
): Promise<{ text: string; usage?: any; provider: string; model: string }> {
  switch (provider) {
    case 'anthropic': {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        timeout,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`Anthropic QA failed: ${response.status} ${await response.text()}`);
      const data = await response.json();
      const text = asArray(data?.content).map((part) => part?.text).filter(Boolean).join('\n').trim();
      return { text, usage: data?.usage, provider, model };
    }
    case 'google': {
      const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        timeout,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      });
      if (!response.ok) throw new Error(`Google QA failed: ${response.status} ${await response.text()}`);
      const data = await response.json();
      const text = asArray(data?.candidates?.[0]?.content?.parts).map((part) => part?.text).filter(Boolean).join('\n').trim();
      return { text, usage: data?.usageMetadata, provider, model };
    }
    case 'cohere': {
      const response = await fetchWithTimeout('https://api.cohere.com/v2/chat', {
        method: 'POST',
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`Cohere QA failed: ${response.status} ${await response.text()}`);
      const data = await response.json();
      const text = data?.message?.content?.[0]?.text ?? data?.text ?? '';
      return { text: String(text).trim(), usage: data?.usage, provider, model };
    }
    case 'mistral': {
      const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`Mistral QA failed: ${response.status} ${await response.text()}`);
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      return { text: String(text).trim(), usage: data?.usage, provider, model };
    }
    case 'openai':
    default: {
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI QA failed: ${response.status} ${await response.text()}`);
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      return { text: String(text).trim(), usage: data?.usage, provider: 'openai', model };
    }
  }
}

async function resolveWorkflowId(context: ExecutorContext): Promise<string | undefined> {
  const explicitWorkflowId = context.variables.workflowId || context.variables.workflow?.id;
  if (typeof explicitWorkflowId === 'string' && explicitWorkflowId) {
    return explicitWorkflowId;
  }

  if (!context.executionId) return undefined;
  const rows = await db
    .select({ workflowId: executions.workflowId })
    .from(executions)
    .where(eq(executions.id, context.executionId))
    .limit(1);

  return rows[0]?.workflowId;
}

function getMemoryVectorStore(context: ExecutorContext, indexName: string, namespace?: string): StoredVector[] {
  const key = `_vectorstore_${indexName}`;
  const bucket = context.variables[key];
  const namespaceKey = namespace || '__default__';

  if (Array.isArray(bucket)) {
    return bucket as StoredVector[];
  }

  if (!bucket || typeof bucket !== 'object') {
    context.variables[key] = { [namespaceKey]: [] };
  }

  const record = asRecord(context.variables[key]);
  if (!Array.isArray(record[namespaceKey])) {
    record[namespaceKey] = [];
  }
  context.variables[key] = record;
  return record[namespaceKey] as StoredVector[];
}

async function searchStoredVectors(
  backend: string,
  indexName: string,
  namespace: string | undefined,
  queryEmbedding: number[],
  context: ExecutorContext,
  options: { topK: number; scoreThreshold?: number }
): Promise<StoredVector[]> {
  let vectors: StoredVector[] = [];

  if (backend === 'pgvector') {
    const workflowId = await resolveWorkflowId(context);
    if (!workflowId) {
      throw new Error('workflowId is required for pgvector search');
    }

    const collectionName = namespace ? `${indexName}:${namespace}` : indexName;
    const rows = await db
      .select({
        id: vectorDocuments.id,
        content: vectorDocuments.content,
        metadata: vectorDocuments.metadata,
        embeddingJson: vectorDocuments.embeddingJson,
      })
      .from(vectorDocuments)
      .where(and(eq(vectorDocuments.workflowId, workflowId), eq(vectorDocuments.collectionName, collectionName)));

    vectors = rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: asRecord(row.metadata),
      embedding: asArray<number>(safeJsonParse(row.embeddingJson ?? '[]')).map((value) => Number(value)),
    }));
  } else {
    vectors = [...getMemoryVectorStore(context, indexName, namespace)];
  }

  return vectors
    .map((item) => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .filter((item) => (options.scoreThreshold ?? 0) <= (item.score ?? 0))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, Math.max(1, options.topK));
}

function createRagExecutor(
  label: string,
  handler: (args: { config: GenericConfig; context: ExecutorContext; deps: ExecutorDeps; input: any; node: WorkflowNode }) => Promise<Record<string, any>>
): NodeExecutorFn {
  return async (node, _definition, context, deps) => {
    const workflowNode = node as WorkflowNode;
    const config = getConfig(workflowNode, context);
    const input = resolveInput(config, context);
    const nodeName = config.label || workflowNode.data?.type || label;

    await logExecution(deps, workflowNode.id, nodeName, 'info', `${label} started`, context, {
      nodeType: workflowNode.data?.type,
    });

    try {
      const result = await handler({ config, context, deps, input, node: workflowNode });
      await logExecution(deps, workflowNode.id, nodeName, 'info', `${label} completed`, context, {
        outputKeys: Object.keys(result),
      });
      return result;
    } catch (error) {
      await logExecution(deps, workflowNode.id, nodeName, 'error', `${label} failed`, context, {
        message: error instanceof Error ? error.message : String(error),
      });
      return toErrorResult(error);
    }
  };
}

const executePdfLoader = createRagExecutor('RAG PDF Loader', async ({ config, context, input }) => {
  const sourceMode = String(config.source || 'url');
  const sourceValue = sourceMode === 'variable'
    ? context.variables[config.variableName || config.inputVariable || 'input'] ?? input
    : config.url ?? input;

  const source = stringifyValue(sourceValue).trim();
  if (!source) {
    throw new Error('PDF source is required');
  }

  const bytes = source.startsWith('http://') || source.startsWith('https://')
    ? await fetchBinary(interpolate(source, context), config)
    : isProbablyBase64(source)
      ? decodeBase64Payload(source)
      : Buffer.from(source, 'utf8');

  let text = '';
  let pageCount = 1;
  try {
    const pdfModule = await import('pdf-parse');
    const pdfParse = (pdfModule as any).default as (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;
    const parsed = await pdfParse(bytes);
    text = parsed?.text?.trim() || '';
    pageCount = Number(parsed?.numpages || 1);
  } catch {
    text = extractPdfTextFallback(bytes);
  }

  if (!text.trim()) {
    text = `[PDF Document: ${source}]`;
  }

  const pages = config.splitPages ? splitPdfPages(text, pageCount) : [text.trim()];
  const documents = pages.map((content, index) => ({
    content,
    metadata: {
      page: index + 1,
      source,
      extractImages: Boolean(config.extractImages),
    },
  }));

  return {
    output: documents,
    documents,
    pageCount: pages.length || pageCount,
    source,
  };
});

const executeWebLoader = createRagExecutor('RAG Web Loader', async ({ config, context }) => {
  const startUrl = stringifyValue(config.url).trim();
  if (!startUrl) {
    throw new Error('Web URL is required');
  }

  const recursive = Boolean(config.recursive);
  const maxDepth = Math.max(0, Number(config.maxDepth ?? 0));
  const maxPages = Math.max(1, Number(config.maxPages ?? (recursive ? 10 : 1)));
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: interpolate(startUrl, context), depth: 0 }];
  const documents: RagDocument[] = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) continue;
    visited.add(current.url);

    const html = await fetchText(current.url, config);
    const selectedHtml = extractSelectorHtml(html, typeof config.selector === 'string' ? config.selector : undefined);
    const text = stripHtml(selectedHtml);
    documents.push({
      content: text || `[Web Document: ${current.url}]`,
      metadata: {
        url: current.url,
        title: extractTitle(html),
        depth: current.depth,
        source: current.url,
      },
    });

    if (recursive && current.depth < maxDepth) {
      for (const link of extractLinks(current.url, html)) {
        if (!visited.has(link)) {
          queue.push({ url: link, depth: current.depth + 1 });
        }
      }
    }
  }

  return {
    output: documents,
    documents,
    url: startUrl,
    crawled: visited.size,
  };
});

const executeTextSplitter = createRagExecutor('RAG Text Splitter', async ({ config, input }) => {
  const documents = getDocumentsFromInput(input, 'splitter');
  if (documents.length === 0) {
    throw new Error('Text splitter requires documents input');
  }

  const strategy = String(config.strategy || 'recursive');
  const chunkSize = Math.max(100, Number(config.chunkSize ?? 1000));
  const chunkOverlap = Math.max(0, Number(config.chunkOverlap ?? 200));
  const chunks: RagDocument[] = [];

  documents.forEach((document, documentIndex) => {
    splitText(document.content, strategy, chunkSize, chunkOverlap).forEach((content, chunkIndex) => {
      chunks.push({
        content,
        metadata: {
          ...document.metadata,
          source: document.metadata.source || document.metadata.url || `document_${documentIndex + 1}`,
          documentIndex,
          chunkIndex,
          strategy,
        },
      });
    });
  });

  return {
    output: chunks,
    chunks,
    totalChunks: chunks.length,
    strategy,
  };
});

const executeEmbedder = createRagExecutor('RAG Embedder', async ({ config, input, context }) => {
  const documents = getDocumentsFromInput(input?.chunks ?? input?.documents ?? input, 'embedder');
  if (documents.length === 0) {
    throw new Error('Embedder requires chunks or documents input');
  }

  const batchSize = Math.max(1, Number(config.batchSize ?? 100));
  const embeddedDocuments: EmbeddedDocument[] = [];
  let resolvedProvider = 'openai';
  let resolvedModel = DEFAULT_EMBEDDING_MODEL;

  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = documents.slice(index, index + batchSize);
    const { embeddings, provider, model } = await embedTexts(batch.map((item) => item.content), config, context);
    resolvedProvider = provider;
    resolvedModel = model;
    batch.forEach((item, batchIndex) => {
      embeddedDocuments.push({
        content: item.content,
        metadata: item.metadata,
        embedding: embeddings[batchIndex] ?? [],
      });
    });
  }

  return {
    output: embeddedDocuments,
    embeddings: embeddedDocuments,
    model: resolvedModel,
    provider: resolvedProvider,
    dimensions: embeddedDocuments[0]?.embedding.length ?? 0,
  };
});

const executeVectorStore = createRagExecutor('RAG Vector Store', async ({ config, input, context }) => {
  const backend = String(config.backend || 'memory');
  const operation = String(config.operation || 'upsert');
  const indexName = String(config.indexName || 'default');
  const namespace = typeof config.namespace === 'string' && config.namespace.trim() ? config.namespace.trim() : undefined;
  const topK = Math.max(1, Number(config.topK ?? 5));
  const scoreThreshold = Number(config.scoreThreshold ?? 0);

  if (operation === 'query') {
    let queryEmbedding = getQueryEmbedding(input);
    const query = getQueryText(config, input);
    if (!queryEmbedding) {
      if (!query) throw new Error('Vector query requires a query or query embedding');
      const embeddedQuery = await embedTexts([query], {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        timeout: config.timeout,
      }, context);
      queryEmbedding = embeddedQuery.embeddings[0];
    }

    const results = await searchStoredVectors(backend, indexName, namespace, queryEmbedding, context, {
      topK,
      scoreThreshold,
    });

    return {
      output: results.map(({ embedding, ...result }) => result),
      results: results.map(({ embedding, ...result }) => result),
      query,
      topK,
      backend,
      indexName,
    };
  }

  const embeddings = getEmbeddingsFromInput(input);
  if (embeddings.length === 0) {
    throw new Error('Vector store upsert requires embeddings input');
  }

  if (backend === 'pgvector') {
    const workflowId = await resolveWorkflowId(context);
    if (!workflowId) {
      throw new Error('workflowId is required for pgvector upsert');
    }

    const collectionName = namespace ? `${indexName}:${namespace}` : indexName;
    await db.insert(vectorDocuments).values(
      embeddings.map((item) => ({
        workflowId,
        collectionName,
        content: item.content,
        metadata: item.metadata,
        embeddingJson: JSON.stringify(item.embedding),
      }))
    );
  } else {
    const store = getMemoryVectorStore(context, indexName, namespace);
    store.push(...embeddings.map((item, index) => ({
      ...item,
      id: `${indexName}-${Date.now()}-${index}`,
    })));
  }

  return {
    output: {
      stored: embeddings.length,
      indexName,
      backend,
    },
    stored: embeddings.length,
    indexName,
    backend,
  };
});

const executeRetriever = createRagExecutor('RAG Retriever', async ({ config, input, context }) => {
  const backend = String(config.backend || 'memory');
  const indexName = String(config.indexName || 'default');
  const namespace = typeof config.namespace === 'string' && config.namespace.trim() ? config.namespace.trim() : undefined;
  const strategy = String(config.strategy || 'similarity');
  const topK = Math.max(1, Number(config.topK ?? 5));
  const fetchK = Math.max(topK, Number(config.fetchK ?? Math.max(topK * 3, 10)));
  const scoreThreshold = Number(config.scoreThreshold ?? 0);
  const query = getQueryText(config, input);

  let queryEmbedding = getQueryEmbedding(input);
  if (!queryEmbedding) {
    if (!query) throw new Error('Retriever requires a query or query embedding');
    const embeddedQuery = await embedTexts([query], {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      timeout: config.timeout,
    }, context);
    queryEmbedding = embeddedQuery.embeddings[0];
  }

  const candidates = await searchStoredVectors(backend, indexName, namespace, queryEmbedding, context, {
    topK: strategy === 'mmr' ? fetchK : topK,
    scoreThreshold: strategy === 'threshold' ? scoreThreshold : 0,
  });

  const selected = strategy === 'mmr'
    ? mmrSelect(candidates, queryEmbedding, topK, Number(config.mmrLambda ?? 0.7))
    : candidates.filter((item) => (strategy === 'threshold' ? (item.score ?? 0) >= scoreThreshold : true)).slice(0, topK);

  const documents = selected.map(({ embedding, ...item }) => item);
  return {
    output: documents,
    documents,
    query,
    strategy,
    backend,
  };
});

const executeQaChain = createRagExecutor('RAG QA Chain', async ({ config, input, context }) => {
  const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim().toLowerCase() : 'openai';
  const model = typeof config.model === 'string' && config.model.trim() ? config.model.trim() : DEFAULT_QA_MODEL;
  const returnSources = Boolean(config.returnSources);
  const question = getQueryText(config, input);
  if (!question) {
    throw new Error('QA chain requires a question');
  }

  const documents = getResultsFromInput(input);
  if (documents.length === 0) {
    throw new Error('QA chain requires retrieved documents');
  }

  const maxContextTokens = Math.max(256, Number(config.maxContextTokens ?? 4000));
  const maxContextChars = maxContextTokens * 4;
  let contextText = '';
  const sources: Array<{ content: string; metadata: Metadata }> = [];

  for (const document of documents) {
    const block = `Source: ${stringifyValue(document.metadata.source || document.metadata.url || 'document')}\n${document.content}`;
    if ((contextText + `\n\n${block}`).length > maxContextChars && contextText) {
      break;
    }
    contextText += `${contextText ? '\n\n' : ''}${block}`;
    sources.push({ content: document.content, metadata: document.metadata });
  }

  const systemPrompt = typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
    ? config.systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;
  const contextTemplate = typeof config.contextTemplate === 'string' && config.contextTemplate.trim()
    ? config.contextTemplate.trim()
    : DEFAULT_CONTEXT_TEMPLATE;
  const prompt = contextTemplate.replace('{context}', contextText).replace('{question}', question);
  const timeout = getTimeout(config);
  const apiKey = provider === 'anthropic'
    ? resolveApiKey(config, context, ['ANTHROPIC_API_KEY'])
    : provider === 'google'
      ? resolveApiKey(config, context, ['GOOGLE_API_KEY', 'GEMINI_API_KEY'])
      : provider === 'cohere'
        ? resolveApiKey(config, context, ['COHERE_API_KEY'])
        : provider === 'mistral'
          ? resolveApiKey(config, context, ['MISTRAL_API_KEY'])
          : resolveApiKey(config, context, ['OPENAI_API_KEY']);

  const response = await callLlm(provider, model, apiKey, systemPrompt, prompt, timeout);
  return {
    output: response.text,
    answer: response.text,
    sources: returnSources ? sources : [],
    model: response.model,
    provider: response.provider,
    usage: response.usage,
  };
});

const executeReranker = createRagExecutor('RAG Reranker', async ({ config, input, context }) => {
  const query = getQueryText(config, input);
  if (!query) {
    throw new Error('Reranker requires a query');
  }

  const documents = getResultsFromInput(input);
  if (documents.length === 0) {
    throw new Error('Reranker requires documents input');
  }

  const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim().toLowerCase() : 'cohere';
  const topN = Math.max(1, Number(config.topN ?? config.topK ?? 5));

  let reranked: StoredVector[] = [];
  if (provider === 'cohere') {
    try {
      const apiKey = resolveApiKey(config, context, ['COHERE_API_KEY']);
      const response = await fetchWithTimeout('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        timeout: getTimeout(config),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'rerank-english-v3.0',
          query,
          documents: documents.map((document) => document.content),
          top_n: topN,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere rerank failed: ${response.status} ${await response.text()}`);
      }

      const data = await response.json();
      reranked = asArray(data?.results).map((result) => ({
        ...documents[Number(result?.index) || 0],
        score: Number(result?.relevance_score ?? 0),
      }));
    } catch {
      reranked = documents
        .map((document) => ({
          ...document,
          score: keywordRerankScore(query, document.content, document.score ?? 0),
        }))
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, topN);
    }
  } else {
    reranked = documents
      .map((document) => ({
        ...document,
        score: keywordRerankScore(query, document.content, document.score ?? 0),
      }))
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, topN);
  }

  const result = reranked.map(({ embedding, ...document }) => document);
  return {
    output: result,
    documents: result,
    query,
  };
});

export const ragExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.RAG_PDF_LOADER]: executePdfLoader,
  [NodeType.RAG_WEB_LOADER]: executeWebLoader,
  [NodeType.RAG_TEXT_SPLITTER]: executeTextSplitter,
  [NodeType.RAG_EMBEDDER]: executeEmbedder,
  [NodeType.RAG_VECTOR_STORE]: executeVectorStore,
  [NodeType.RAG_RETRIEVER]: executeRetriever,
  [NodeType.RAG_QA_CHAIN]: executeQaChain,
  [NodeType.RAG_RERANKER]: executeReranker,
};
