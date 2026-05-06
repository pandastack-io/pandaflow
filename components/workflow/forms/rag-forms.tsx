/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CredentialPicker } from './credential-picker';

type FieldProps = {
  label: string;
  helper?: string;
  children: ReactNode;
};

function Field({ label, helper, children }: FieldProps) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function useUpdater(config: any, onChange: (config: any) => void) {
  return (key: string, value: any) => onChange({ ...config, [key]: value });
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = 'text',
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  type?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      <Input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  helper,
}: {
  label: string;
  value: any;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      <Input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    </Field>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      <div className="flex h-10 items-center">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  rows = 4,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  rows?: number;
}) {
  return (
    <Field label={label} helper={helper}>
      <Textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function JsonField({
  label,
  value,
  onChange,
  helper,
  rows = 4,
}: {
  label: string;
  value: any;
  onChange: (value: any) => void;
  helper?: string;
  rows?: number;
}) {
  const displayValue = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  return (
    <Field label={label} helper={helper}>
      <Textarea
        rows={rows}
        value={displayValue}
        onChange={(event) => {
          const raw = event.target.value;
          try {
            onChange(raw.trim() ? JSON.parse(raw) : {});
          } catch {
            onChange(raw);
          }
        }}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  helper?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const chatProviders = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'mistral', label: 'Mistral' },
];

function getCredentialProviderId(provider?: string) {
  switch ((provider || '').toLowerCase()) {
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'google':
    case 'gemini':
      return 'google_ai';
    case 'cohere':
      return 'cohere';
    case 'mistral':
      return 'mistral';
    default:
      return undefined;
  }
}

function RagCredentialFields({ config, onChange, providerId, label = 'Credentials' }: NodeFormProps & { providerId?: string; label?: string }) {
  if (!providerId) return null;

  return (
    <CredentialPicker
      providerId={providerId}
      config={config}
      onChange={(updates) => onChange({ ...config, ...updates })}
      label={label}
    />
  );
}

function RagPdfLoaderForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  const source = config.source || 'url';

  return (
    <div className="space-y-3">
      <SelectField label="Source" value={source} onChange={(value) => update('source', value)} options={[{ value: 'url', label: 'URL' }, { value: 'variable', label: 'Variable / Input' }]} />
      {source === 'url' ? (
        <TextField label="PDF URL" value={config.url || ''} onChange={(value) => update('url', value)} placeholder="https://example.com/file.pdf" />
      ) : (
        <>
          <TextField label="Variable Name" value={config.variableName || ''} onChange={(value) => update('variableName', value)} placeholder="pdfBase64" helper="Reads a workflow variable, input variable, or upstream payload." />
          <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} placeholder="input" />
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField label="Split pages" checked={config.splitPages !== false} onChange={(value) => update('splitPages', value)} helper="Returns one document per parsed page when possible." />
        <ToggleField label="Extract images" checked={Boolean(config.extractImages)} onChange={(value) => update('extractImages', value)} helper="Reserved metadata flag for downstream multimodal flows." />
      </div>
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function RagWebLoaderForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <TextField label="URL" value={config.url || ''} onChange={(value) => update('url', value)} placeholder="https://example.com" />
      <TextField label="CSS Selector" value={config.selector || ''} onChange={(value) => update('selector', value)} placeholder="#content, .article, main" helper="Optional lightweight selector extraction before HTML cleanup." />
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField label="Recursive crawl" checked={Boolean(config.recursive)} onChange={(value) => update('recursive', value)} helper="Follow same-origin links when enabled." />
        <NumberField label="Max depth" value={config.maxDepth ?? 0} onChange={(value) => update('maxDepth', value)} min={0} max={5} step={1} helper="Only used when recursive crawl is enabled." />
      </div>
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function RagTextSplitterForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <SelectField
        label="Strategy"
        value={config.strategy || 'recursive'}
        onChange={(value) => update('strategy', value)}
        options={[
          { value: 'recursive', label: 'Recursive' },
          { value: 'character', label: 'Character' },
          { value: 'token', label: 'Token estimate' },
          { value: 'markdown', label: 'Markdown headings' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Chunk size" value={config.chunkSize ?? 1000} onChange={(value) => update('chunkSize', value)} min={100} max={4000} step={50} helper="Target chunk size in characters." />
        <NumberField label="Chunk overlap" value={config.chunkOverlap ?? 200} onChange={(value) => update('chunkOverlap', value)} min={0} max={500} step={10} helper="Overlap in characters to preserve context." />
      </div>
    </div>
  );
}

function RagEmbedderForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider || 'openai')} />
      <SelectField label="Provider" value={config.provider || 'openai'} onChange={(value) => update('provider', value)} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'cohere', label: 'Cohere' }]} />
      <TextField label="Model" value={config.model || 'text-embedding-3-small'} onChange={(value) => update('model', value)} placeholder="text-embedding-3-small, text-embedding-3-large, embed-english-v3.0" helper="Common models: text-embedding-3-small, text-embedding-3-large, embed-english-v3.0." />
      <TextField label="API Key" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} type="password" helper="Optional override. Executor falls back to environment variables." />
      <NumberField label="Batch size" value={config.batchSize ?? 100} onChange={(value) => update('batchSize', value)} min={1} max={500} step={1} />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function RagVectorStoreForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  const operation = config.operation || 'upsert';

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider || 'openai')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Backend" value={config.backend || 'memory'} onChange={(value) => update('backend', value)} options={[{ value: 'memory', label: 'In-memory' }, { value: 'pgvector', label: 'Postgres / pgvector-ready' }]} />
        <SelectField label="Operation" value={operation} onChange={(value) => update('operation', value)} options={[{ value: 'upsert', label: 'Upsert embeddings' }, { value: 'query', label: 'Query vectors' }]} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Index name" value={config.indexName || 'default'} onChange={(value) => update('indexName', value)} placeholder="knowledge-base" />
        <TextField label="Namespace" value={config.namespace || ''} onChange={(value) => update('namespace', value)} placeholder="docs-v1" />
      </div>
      {operation === 'query' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Top K" value={config.topK ?? 5} onChange={(value) => update('topK', value)} min={1} max={20} step={1} />
          <NumberField label="Score threshold" value={config.scoreThreshold ?? 0} onChange={(value) => update('scoreThreshold', value)} min={0} max={1} step={0.05} helper="Minimum cosine similarity score." />
        </div>
      ) : null}
      <SelectField label="Embedding provider" value={config.provider || 'openai'} onChange={(value) => update('provider', value)} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'cohere', label: 'Cohere' }]} helper="Used when query mode must embed raw text." />
      <TextField label="Embedding model" value={config.model || 'text-embedding-3-small'} onChange={(value) => update('model', value)} placeholder="text-embedding-3-small" />
      <TextField label="API Key" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} type="password" />
    </div>
  );
}

function RagRetrieverForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  const strategy = config.strategy || 'similarity';

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider || 'openai')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Index name" value={config.indexName || 'default'} onChange={(value) => update('indexName', value)} placeholder="knowledge-base" />
        <TextField label="Namespace" value={config.namespace || ''} onChange={(value) => update('namespace', value)} placeholder="docs-v1" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Backend" value={config.backend || 'memory'} onChange={(value) => update('backend', value)} options={[{ value: 'memory', label: 'In-memory' }, { value: 'pgvector', label: 'Postgres / pgvector-ready' }]} />
        <SelectField label="Strategy" value={strategy} onChange={(value) => update('strategy', value)} options={[{ value: 'similarity', label: 'Similarity' }, { value: 'mmr', label: 'MMR' }, { value: 'threshold', label: 'Threshold' }]} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Top K" value={config.topK ?? 5} onChange={(value) => update('topK', value)} min={1} max={20} step={1} />
        <NumberField label="Score threshold" value={config.scoreThreshold ?? 0} onChange={(value) => update('scoreThreshold', value)} min={0} max={1} step={0.05} />
      </div>
      {strategy === 'mmr' ? <NumberField label="Fetch K" value={config.fetchK ?? 10} onChange={(value) => update('fetchK', value)} min={1} max={50} step={1} helper="Candidate pool size before diversity re-ranking." /> : null}
      <SelectField label="Embedding provider" value={config.provider || 'openai'} onChange={(value) => update('provider', value)} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'cohere', label: 'Cohere' }]} helper="Used to embed raw query text when an embedding is not already supplied." />
      <TextField label="Embedding model" value={config.model || 'text-embedding-3-small'} onChange={(value) => update('model', value)} />
      <TextField label="API Key" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} type="password" />
    </div>
  );
}

function RagQaChainForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider || 'openai')} />
      <SelectField label="Provider" value={config.provider || 'openai'} onChange={(value) => update('provider', value)} options={chatProviders} />
      <TextField label="Model" value={config.model || 'gpt-4o-mini'} onChange={(value) => update('model', value)} placeholder="gpt-4o-mini" helper="Examples: gpt-4o-mini, claude-3-5-sonnet, gemini-2.5-pro." />
      <TextField label="API Key" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} type="password" />
      <TextAreaField label="System Prompt" value={config.systemPrompt || ''} onChange={(value) => update('systemPrompt', value)} rows={3} placeholder="You are a retrieval-augmented assistant..." />
      <TextAreaField label="Context Template" value={config.contextTemplate || 'Use the following context to answer the question:\n\n{context}\n\nQuestion: {question}'} onChange={(value) => update('contextTemplate', value)} rows={5} helper="Use {context} and {question} placeholders." />
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField label="Return sources" checked={Boolean(config.returnSources)} onChange={(value) => update('returnSources', value)} />
        <NumberField label="Max context tokens" value={config.maxContextTokens ?? 4000} onChange={(value) => update('maxContextTokens', value)} min={256} max={32000} step={256} />
      </div>
    </div>
  );
}

function RagKnowledgeIndexerForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId="openai" />
      <TextField label="Collection Name" value={config.collectionName || 'knowledge-base'} onChange={(value) => update('collectionName', value)} placeholder="knowledge-base" helper="Documents are stored in the vector_documents table under this collection name." />
      <SelectField
        label="Embedding Model"
        value={config.embeddingModel || 'text-embedding-3-small'}
        onChange={(value) => update('embeddingModel', value)}
        options={[
          { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
          { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
          { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Chunk size" value={config.chunkSize ?? 1000} onChange={(value) => update('chunkSize', value)} min={1} max={10000} step={50} helper="Character count per chunk." />
        <NumberField label="Chunk overlap" value={config.chunkOverlap ?? 200} onChange={(value) => update('chunkOverlap', value)} min={0} max={5000} step={10} helper="Shared characters between adjacent chunks." />
      </div>
      <JsonField label="Static Metadata" value={config.metadata || {}} onChange={(value) => update('metadata', value)} rows={5} helper={'Attached to every stored chunk. Example: {"source":"faq","team":"support"}'} />
    </div>
  );
}

function RagRerankerForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);

  return (
    <div className="space-y-3">
      <RagCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider || 'cohere')} />
      <SelectField label="Provider" value={config.provider || 'cohere'} onChange={(value) => update('provider', value)} options={[{ value: 'cohere', label: 'Cohere' }, { value: 'keyword', label: 'Keyword fallback' }]} />
      <TextField label="Model" value={config.model || 'rerank-english-v3.0'} onChange={(value) => update('model', value)} placeholder="rerank-english-v3.0" />
      <TextField label="API Key" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} type="password" helper="Optional for Cohere. Keyword fallback ignores this field." />
      <NumberField label="Top N" value={config.topN ?? 5} onChange={(value) => update('topN', value)} min={1} max={50} step={1} />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

export const ragForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.RAG_PDF_LOADER]: RagPdfLoaderForm,
  [NodeType.RAG_WEB_LOADER]: RagWebLoaderForm,
  [NodeType.RAG_TEXT_SPLITTER]: RagTextSplitterForm,
  [NodeType.RAG_EMBEDDER]: RagEmbedderForm,
  [NodeType.RAG_VECTOR_STORE]: RagVectorStoreForm,
  [NodeType.RAG_RETRIEVER]: RagRetrieverForm,
  [NodeType.RAG_QA_CHAIN]: RagQaChainForm,
  [NodeType.RAG_RERANKER]: RagRerankerForm,
  [NodeType.RAG_KNOWLEDGE_INDEXER]: RagKnowledgeIndexerForm,
};
