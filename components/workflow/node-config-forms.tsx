/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/static-components */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NodeType, PRISM_PROVIDERS } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getNodeForm } from '@/components/workflow/forms/index';

type SecretSummary = {
  id: string;
  name: string;
  type?: string;
};

type HeaderRow = {
  id: string;
  key: string;
  value: string;
};

interface NodeConfigFormProps {
  nodeType: NodeType;
  config: any;
  onChange: (config: any) => void;
  nodeId?: string;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  formatter,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
  formatter?: (value: number) => string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{min}</span>
          <span className="font-medium text-foreground">{formatter ? formatter(value) : value}</span>
          <span>{max}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer accent-indigo-500"
        />
      </div>
    </Field>
  );
}

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function toSecretTemplate(secretName: string) {
  return `{{secret.${secretName}}}`;
}

function parseSecretReference(value: unknown) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^\{\{secret\.([^}]+)\}\}$/);
  return match?.[1] ?? '';
}

function headersToRows(headers: unknown): HeaderRow[] {
  if (Array.isArray(headers)) {
    return headers.map((header, index) => ({
      id: `header-${index}`,
      key: String((header as Record<string, unknown>)?.key ?? ''),
      value: String((header as Record<string, unknown>)?.value ?? ''),
    }));
  }

  if (headers && typeof headers === 'object') {
    return Object.entries(headers as Record<string, unknown>).map(([key, value], index) => ({
      id: `header-${index}`,
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
  }

  return [{ id: 'header-0', key: '', value: '' }];
}

function rowsToHeaders(rows: HeaderRow[]) {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value;
    return acc;
  }, {});
}

function useSecrets() {
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/secrets')
      .then((response) => response.json())
      .then((result) => {
        if (cancelled) return;
        setSecrets(result.success ? (result.data ?? []) : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSecrets([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return secrets;
}

function SecretSelect({
  label,
  value,
  onChange,
  secrets,
  hint,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  secrets: SecretSummary[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value || '__none__'} onValueChange={(nextValue) => onChange(nextValue === '__none__' ? '' : nextValue)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Choose a secret" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No secret linked</SelectItem>
          {secrets.map((secret) => (
            <SelectItem key={secret.id} value={secret.name}>
              {secret.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const AI_MODELS: Partial<Record<NodeType, string[]>> = {
  [NodeType.AI_LLM]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  [NodeType.AI_ANTHROPIC]: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  [NodeType.AI_MISTRAL]: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  [NodeType.AI_GROQ]: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  [NodeType.AI_OLLAMA]: ['llama3.2', 'mistral', 'gemma2', 'phi3'],
};

const PRISM_PROVIDER_OPTIONS = Object.entries(PRISM_PROVIDERS) as Array<[
  keyof typeof PRISM_PROVIDERS,
  (typeof PRISM_PROVIDERS)[keyof typeof PRISM_PROVIDERS]
]>;

const PRISM_PROVIDER_ACCENTS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d4a373',
  google: '#4285f4',
  groq: '#f97316',
  deepseek: '#2563eb',
  perplexity: '#0f172a',
  together: '#7c3aed',
  fireworks: '#ef4444',
  openrouter: '#8b5cf6',
  ollama: '#14b8a6',
  lmstudio: '#f59e0b',
  azure: '#0ea5e9',
  mistral: '#ff7000',
  cohere: '#334155',
  xai: '#111827',
  sambanova: '#ec4899',
};

const PRISM_BASE_URL_PROVIDERS = new Set(['ollama', 'lmstudio', 'azure', 'openrouter']);

const VERDICT_NODE_TYPES: NodeType[] = [
  NodeType.VERDICT_FAITHFULNESS,
  NodeType.VERDICT_CORRECTNESS,
  NodeType.VERDICT_RELEVANCE,
  NodeType.VERDICT_CONTEXT_PRECISION,
  NodeType.VERDICT_CONTEXT_RECALL,
  NodeType.VERDICT_HALLUCINATION,
  NodeType.VERDICT_TOXICITY,
  NodeType.VERDICT_BATCH,
];

function VerdictConfigForm({
  nodeType,
  config,
  onChange,
}: {
  nodeType: NodeType;
  config: Record<string, any>;
  onChange: (config: any) => void;
}) {
  const metricLabel =
    ({
      [NodeType.VERDICT_FAITHFULNESS]: 'Faithfulness',
      [NodeType.VERDICT_CORRECTNESS]: 'Correctness',
      [NodeType.VERDICT_RELEVANCE]: 'Relevance',
      [NodeType.VERDICT_CONTEXT_PRECISION]: 'Context Precision',
      [NodeType.VERDICT_CONTEXT_RECALL]: 'Context Recall',
      [NodeType.VERDICT_HALLUCINATION]: 'Hallucination',
      [NodeType.VERDICT_TOXICITY]: 'Toxicity',
      [NodeType.VERDICT_BATCH]: 'Batch Verdict',
    } as Partial<Record<NodeType, string>>)[nodeType] ?? 'Verdict';

  return (
    <div className="space-y-4">
      <Section
        title="Judge Configuration"
        description={`${metricLabel} uses an LLM-as-judge evaluator. Lower threshold = more lenient.`}
      >
        <Field label="Judge Provider">
          <Select
            value={config.judgeProvider || 'openai'}
            onValueChange={(value) => onChange({ ...config, judgeProvider: value })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Judge Model" hint="Default: gpt-4o-mini for cost-efficient evaluation.">
          <Input
            value={config.judgeModel || ''}
            onChange={(event) => updateConfig(config, onChange, 'judgeModel', event.target.value)}
            placeholder="gpt-4o-mini"
            className="h-9 text-sm"
          />
        </Field>

        <Field label="Judge API Key">
          <Input
            type="password"
            value={config.judgeApiKey || ''}
            onChange={(event) => updateConfig(config, onChange, 'judgeApiKey', event.target.value)}
            placeholder="sk-..."
            className="h-9 text-sm"
          />
        </Field>

        {(config.judgeProvider || 'openai') === 'custom' ? (
          <Field label="Base URL" hint="Use for OpenAI-compatible endpoints such as Ollama or self-hosted gateways.">
            <Input
              value={config.judgeBaseUrl || ''}
              onChange={(event) => updateConfig(config, onChange, 'judgeBaseUrl', event.target.value)}
              placeholder="http://localhost:11434/v1"
              className="h-9 text-sm"
            />
          </Field>
        ) : null}

        <RangeField
          label="Threshold"
          value={typeof config.threshold === 'number' ? config.threshold : 0.7}
          onChange={(value) => updateConfig(config, onChange, 'threshold', value)}
          min={0}
          max={1}
          step={0.05}
          formatter={(value) => value.toFixed(2)}
          hint="This node uses an LLM to evaluate quality. Lower threshold = more lenient."
        />
      </Section>
    </div>
  );
}

function LLMEnterpriseForm({
  nodeType,
  config,
  onChange,
  secrets,
}: {
  nodeType: NodeType;
  config: Record<string, any>;
  onChange: (config: any) => void;
  secrets: SecretSummary[];
}) {
  const models = AI_MODELS[nodeType] ?? [];
  const currentModel = typeof config.model === 'string' ? config.model : models[0] ?? '';
  const selectedModel = models.includes(currentModel) ? currentModel : '__custom__';
  const linkedSecret = config.apiKeySecret || parseSecretReference(config.apiKey);
  const promptValue = config.prompt ?? config.userPrompt ?? '';

  return (
    <div className="space-y-4">
      <Section title="Model Settings" description="Provider-specific model controls with reusable secrets.">
        <Field label="Model">
          <Select
            value={selectedModel || '__custom__'}
            onValueChange={(value) => {
              if (value === '__custom__') {
                updateConfig(config, onChange, 'model', currentModel || '');
                return;
              }
              onChange({ ...config, model: value });
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom model…</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {selectedModel === '__custom__' && (
          <Field label="Custom Model ID">
            <Input
              value={currentModel}
              onChange={(event) => updateConfig(config, onChange, 'model', event.target.value)}
              placeholder="Enter provider model name"
              className="h-9 text-sm"
            />
          </Field>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <RangeField
            label="Temperature"
            value={typeof config.temperature === 'number' ? config.temperature : 0.7}
            onChange={(value) => updateConfig(config, onChange, 'temperature', value)}
            min={0}
            max={2}
            step={0.1}
            formatter={(value) => value.toFixed(1)}
          />
          <Field label="Max Tokens">
            <Input
              type="number"
              min={1}
              value={config.maxTokens ?? 1024}
              onChange={(event) => updateConfig(config, onChange, 'maxTokens', Number(event.target.value) || 0)}
              className="h-9 text-sm"
            />
          </Field>
        </div>

        <SecretSelect
          label="Link to Secret"
          value={linkedSecret}
          onChange={(secretName) =>
            onChange({
              ...config,
              apiKeySecret: secretName || undefined,
              apiKey: secretName ? toSecretTemplate(secretName) : '',
            })
          }
          secrets={secrets}
          hint="API key secrets from /api/secrets are referenced as {{secret.NAME}} at runtime."
        />
      </Section>

      <Section title="Prompting" description="Tune runtime behavior and default instructions for this model node.">
        <Field label="System Prompt" hint="Applied before any user input. Supports variable interpolation.">
          <Textarea
            value={config.systemPrompt || ''}
            onChange={(event) => updateConfig(config, onChange, 'systemPrompt', event.target.value)}
            placeholder="You are an expert assistant..."
            className="min-h-[140px] font-mono text-xs"
          />
        </Field>
        <Field label="Prompt" hint="Optional prompt template for the node body.">
          <Textarea
            value={promptValue}
            onChange={(event) =>
              onChange({
                ...config,
                prompt: event.target.value,
                userPrompt: event.target.value,
              })
            }
            placeholder="Summarize {{input}} for the support team..."
            className="min-h-[120px] text-sm"
          />
        </Field>
      </Section>
    </div>
  );
}

function PrismLLMConfigForm({
  config,
  onChange,
  secrets,
}: {
  config: Record<string, any>;
  onChange: (config: any) => void;
  secrets: SecretSummary[];
}) {
  const providerKey = (typeof config.provider === 'string' && config.provider in PRISM_PROVIDERS
    ? config.provider
    : 'openai') as keyof typeof PRISM_PROVIDERS;
  const providerConfig = PRISM_PROVIDERS[providerKey];
  const models = [...providerConfig.models] as string[];
  const currentModel = typeof config.model === 'string' && config.model.trim() ? config.model : models[0] ?? '';
  const selectedModel = models.includes(currentModel) ? currentModel : '__custom__';
  const linkedSecret = config.apiKeySecret || parseSecretReference(config.apiKey);
  const showBaseUrl = PRISM_BASE_URL_PROVIDERS.has(providerKey);

  return (
    <div className="space-y-4">
      <Section title="Gateway" description="Choose a provider, pick a model, and route through Prism's unified chat interface.">
        <Field label="Provider">
          <Select
            value={providerKey}
            onValueChange={(value) => {
              const nextProvider = value as keyof typeof PRISM_PROVIDERS;
              const nextProviderConfig = PRISM_PROVIDERS[nextProvider];
              const currentBaseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
              onChange({
                ...config,
                provider: nextProvider,
                model: ([...nextProviderConfig.models] as string[]).includes(currentModel) ? currentModel : nextProviderConfig.models[0] ?? '',
                baseUrl: PRISM_BASE_URL_PROVIDERS.has(nextProvider)
                  ? (currentBaseUrl || nextProviderConfig.baseUrl)
                  : currentBaseUrl,
              });
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRISM_PROVIDER_OPTIONS.map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRISM_PROVIDER_ACCENTS[key] ?? '#7c3aed' }} />
                    <span>{value.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Model">
          <Select
            value={selectedModel || '__custom__'}
            onValueChange={(value) => {
              if (value === '__custom__') {
                updateConfig(config, onChange, 'model', currentModel || '');
                return;
              }
              updateConfig(config, onChange, 'model', value);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom model…</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {selectedModel === '__custom__' && (
          <Field label="Custom Model ID">
            <Input
              value={currentModel}
              onChange={(event) => updateConfig(config, onChange, 'model', event.target.value)}
              placeholder="Enter any provider model string"
              className="h-9 text-sm"
            />
          </Field>
        )}
      </Section>

      <Section title="Authentication" description={`Provide an API key directly or set ${providerConfig.envKey} in your environment.`}>
        <Field label={`API Key (${providerConfig.envKey})`} hint="Supports raw keys or {{secret.NAME}} references.">
          <Input
            type="password"
            value={config.apiKey || ''}
            onChange={(event) =>
              onChange({
                ...config,
                apiKey: event.target.value,
                apiKeySecret: undefined,
              })
            }
            placeholder={`Set ${providerConfig.envKey} or paste a key`}
            className="h-9 text-sm"
          />
        </Field>

        <SecretSelect
          label="Link to Secret"
          value={linkedSecret}
          onChange={(secretName) =>
            onChange({
              ...config,
              apiKeySecret: secretName || undefined,
              apiKey: secretName ? toSecretTemplate(secretName) : '',
            })
          }
          secrets={secrets}
          hint="Optional: store the API key in /api/secrets and reference it at runtime."
        />
      </Section>

      <Section title="Prompting" description="Tune the runtime behavior for every Prism call.">
        <Field label="System Prompt" hint="Applied before the incoming prompt input.">
          <Textarea
            value={config.systemPrompt || ''}
            onChange={(event) => updateConfig(config, onChange, 'systemPrompt', event.target.value)}
            placeholder="You are a helpful assistant..."
            className="min-h-[140px] font-mono text-xs"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <RangeField
            label="Temperature"
            value={typeof config.temperature === 'number' ? config.temperature : 0.7}
            onChange={(value) => updateConfig(config, onChange, 'temperature', value)}
            min={0}
            max={2}
            step={0.1}
            formatter={(value) => value.toFixed(1)}
          />
          <Field label="Max Tokens">
            <Input
              type="number"
              min={1}
              value={config.maxTokens ?? 1024}
              onChange={(event) => updateConfig(config, onChange, 'maxTokens', Number(event.target.value) || 0)}
              className="h-9 text-sm"
            />
          </Field>
        </div>
      </Section>

      {showBaseUrl && (
        <Section title="Endpoint" description="Override the base URL for compatible gateways, local runtimes, or Azure deployments.">
          <Field label="Base URL" hint={providerKey === 'azure' ? 'Use the full Azure chat completions endpoint including api-version.' : undefined}>
            <Input
              value={config.baseUrl || providerConfig.baseUrl}
              onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
              placeholder={providerConfig.baseUrl}
              className="h-9 text-sm"
            />
          </Field>
        </Section>
      )}

      <Section title="Output" description="Streaming can be enabled for downstream consumers that expect incremental text.">
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <div>
            <Label className="text-sm">Stream output</Label>
            <p className="text-xs text-muted-foreground">Persist the stream preference on the node configuration.</p>
          </div>
          <Switch checked={Boolean(config.streamOutput)} onCheckedChange={(checked) => updateConfig(config, onChange, 'streamOutput', checked)} />
        </div>
      </Section>
    </div>
  );
}

function getVectorstoreNameField(nodeType: NodeType) {
  switch (nodeType) {
    case NodeType.VECTORSTORE_PINECONE:
      return { key: 'indexName', label: 'Index Name', placeholder: 'knowledge-index' };
    case NodeType.VECTORSTORE_QDRANT:
    case NodeType.VECTORSTORE_CHROMA:
      return { key: 'collectionName', label: 'Collection Name', placeholder: 'documents' };
    case NodeType.VECTORSTORE_WEAVIATE:
      return { key: 'className', label: 'Collection Name', placeholder: 'VectorDocument' };
    case NodeType.VECTORSTORE_PGVECTOR:
      return { key: 'tableName', label: 'Collection Name', placeholder: 'vector_documents' };
    case NodeType.VECTORSTORE_REDIS:
      return { key: 'keyPrefix', label: 'Collection Name', placeholder: 'kb:docs' };
    default:
      return { key: 'collectionName', label: 'Collection Name', placeholder: 'documents' };
  }
}

function VectorStoreEnterpriseForm({
  nodeType,
  config,
  onChange,
  secrets,
}: {
  nodeType: NodeType;
  config: Record<string, any>;
  onChange: (config: any) => void;
  secrets: SecretSummary[];
}) {
  const nameField = getVectorstoreNameField(nodeType);
  const linkedSecret = config.apiKeySecret || parseSecretReference(config.apiKey);

  return (
    <div className="space-y-4">
      <Section title="Index Configuration" description="Configure how the vector backend stores and retrieves embeddings.">
        <Field label={nameField.label}>
          <Input
            value={config[nameField.key] || ''}
            onChange={(event) => updateConfig(config, onChange, nameField.key, event.target.value)}
            placeholder={nameField.placeholder}
            className="h-9 text-sm"
          />
        </Field>

        <Field label="Embedding Model">
          <Select
            value={config.embeddingModel || config.model || 'openai-ada-002'}
            onValueChange={(value) =>
              onChange({
                ...config,
                embeddingModel: value,
                model: value,
              })
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-ada-002">openai-ada-002</SelectItem>
              <SelectItem value="cohere-embed">cohere-embed</SelectItem>
              <SelectItem value="huggingface">huggingface</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <RangeField
          label="Top K Results"
          value={typeof config.topK === 'number' ? config.topK : 5}
          onChange={(value) => updateConfig(config, onChange, 'topK', value)}
          min={1}
          max={20}
          step={1}
        />

        <SecretSelect
          label="Link API Key"
          value={linkedSecret}
          onChange={(secretName) =>
            onChange({
              ...config,
              apiKeySecret: secretName || undefined,
              apiKey: secretName ? toSecretTemplate(secretName) : '',
            })
          }
          secrets={secrets}
        />
      </Section>
    </div>
  );
}

function getLoaderPrimaryField(nodeType: NodeType) {
  switch (nodeType) {
    case NodeType.LOADER_CSV:
      return { key: 'path', label: 'CSV File Path or URL', placeholder: '/data/customers.csv or https://example.com/customers.csv' };
    case NodeType.LOADER_JSON:
      return { key: 'path', label: 'JSON File Path or URL', placeholder: '/data/doc.json or https://example.com/doc.json' };
    case NodeType.LOADER_PDF:
      return { key: 'url', label: 'PDF URL or File Path', placeholder: 'https://example.com/file.pdf' };
    case NodeType.LOADER_WEBPAGE:
      return { key: 'url', label: 'Web URL', placeholder: 'https://example.com/docs' };
    case NodeType.LOADER_RSS:
      return { key: 'url', label: 'RSS Feed URL', placeholder: 'https://example.com/feed.xml' };
    case NodeType.LOADER_SITEMAP:
      return { key: 'url', label: 'Sitemap URL', placeholder: 'https://example.com/sitemap.xml' };
    case NodeType.LOADER_GOOGLE_DRIVE:
      return { key: 'fileId', label: 'Google Drive File ID', placeholder: 'drive-file-id' };
    case NodeType.LOADER_AIRTABLE:
      return { key: 'baseId', label: 'Airtable Base ID', placeholder: 'appXXXXXXXXXXXXXX' };
    default:
      return { key: 'path', label: 'File Path or URL', placeholder: 'Enter source' };
  }
}

function LoaderEnterpriseForm({
  nodeType,
  config,
  onChange,
}: {
  nodeType: NodeType;
  config: Record<string, any>;
  onChange: (config: any) => void;
}) {
  const primaryField = getLoaderPrimaryField(nodeType);

  return (
    <div className="space-y-4">
      <Section title="Source" description="Choose where documents are loaded from before downstream chunking and indexing.">
        {nodeType === NodeType.LOADER_GITHUB ? (
          <div className="space-y-3">
            <Field label="Repo URL">
              <Input
                value={config.repoUrl || config.repo || ''}
                onChange={(event) =>
                  onChange({
                    ...config,
                    repoUrl: event.target.value,
                    repo: event.target.value,
                  })
                }
                placeholder="https://github.com/org/repo"
                className="h-9 text-sm"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Branch">
                <Input
                  value={config.branch || 'main'}
                  onChange={(event) => updateConfig(config, onChange, 'branch', event.target.value)}
                  placeholder="main"
                  className="h-9 text-sm"
                />
              </Field>
              <Field label="Path Filter">
                <Input
                  value={config.pathFilter || config.path || ''}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      pathFilter: event.target.value,
                      path: event.target.value,
                    })
                  }
                  placeholder="docs/**/*.md"
                  className="h-9 text-sm"
                />
              </Field>
            </div>
          </div>
        ) : nodeType === NodeType.LOADER_NOTION ? (
          <div className="space-y-3">
            <Field label="Workspace Token">
              <Input
                type="password"
                value={config.workspaceToken || config.apiKey || ''}
                onChange={(event) =>
                  onChange({
                    ...config,
                    workspaceToken: event.target.value,
                    apiKey: event.target.value,
                  })
                }
                placeholder="secret_xxx"
                className="h-9 text-sm"
              />
            </Field>
            <Field label="Database ID">
              <Input
                value={config.databaseId || ''}
                onChange={(event) => updateConfig(config, onChange, 'databaseId', event.target.value)}
                placeholder="database-id"
                className="h-9 text-sm"
              />
            </Field>
          </div>
        ) : (
          <Field label={primaryField.label}>
            <Input
              value={config[primaryField.key] || ''}
              onChange={(event) => updateConfig(config, onChange, primaryField.key, event.target.value)}
              placeholder={primaryField.placeholder}
              className="h-9 text-sm"
            />
          </Field>
        )}
      </Section>

      <Section title="Chunking" description="Control document splitting for retrieval and indexing workflows.">
        <RangeField
          label="Chunk Size"
          value={typeof config.chunkSize === 'number' ? config.chunkSize : 1000}
          onChange={(value) => updateConfig(config, onChange, 'chunkSize', value)}
          min={100}
          max={2000}
          step={50}
        />
        <RangeField
          label="Chunk Overlap"
          value={typeof config.chunkOverlap === 'number' ? config.chunkOverlap : 100}
          onChange={(value) => updateConfig(config, onChange, 'chunkOverlap', value)}
          min={0}
          max={500}
          step={10}
        />
      </Section>
    </div>
  );
}

function HeadersEditor({
  rows,
  onChange,
}: {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={row.key}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, key: event.target.value };
              onChange(nextRows);
            }}
            placeholder="Header name"
            className="h-9 text-sm"
          />
          <Input
            value={row.value}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, value: event.target.value };
              onChange(nextRows);
            }}
            placeholder="Header value"
            className="h-9 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(rows.length === 1 ? [{ ...row, key: '', value: '' }] : rows.filter((item) => item.id !== row.id))}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: `header-${crypto.randomUUID()}`, key: '', value: '' }])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-indigo-500 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add header
      </button>
    </div>
  );
}

function parseBodyValue(value: string) {
  if (!value.trim()) return '';
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function HttpEnterpriseForm({ config, onChange }: { config: Record<string, any>; onChange: (config: any) => void }) {
  const [headers, setHeaders] = useState<HeaderRow[]>(() => headersToRows(config.headers));
  const [bodyText, setBodyText] = useState(() =>
    typeof config.body === 'string' ? config.body : JSON.stringify(config.body ?? '', null, 2)
  );

  useEffect(() => {
    setHeaders(headersToRows(config.headers));
  }, [config.headers]);

  useEffect(() => {
    setBodyText(typeof config.body === 'string' ? config.body : JSON.stringify(config.body ?? '', null, 2));
  }, [config.body]);

  return (
    <div className="space-y-4">
      <Section title="Request" description="Configure the outbound HTTP call with interpolation-friendly inputs.">
        <div className="grid gap-3 md:grid-cols-[120px_1fr]">
          <Field label="Method">
            <Select value={config.method || 'GET'} onValueChange={(value) => updateConfig(config, onChange, 'method', value)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="URL" hint="Use variables like {{node_id.output}} or {{workflowVar}}.">
            <Input
              value={config.url || ''}
              onChange={(event) => updateConfig(config, onChange, 'url', event.target.value)}
              placeholder="https://api.example.com/customers/{{customer_id}}"
              className="h-9 text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section title="Headers" description="Manage headers with an add/remove editor instead of raw JSON.">
        <HeadersEditor
          rows={headers}
          onChange={(nextRows) => {
            setHeaders(nextRows);
            onChange({ ...config, headers: rowsToHeaders(nextRows) });
          }}
        />
      </Section>

      <Section title="Body" description="Paste text or JSON payloads. Valid JSON is stored as objects automatically.">
        <Field label="Request Body">
          <Textarea
            value={bodyText}
            onChange={(event) => {
              setBodyText(event.target.value);
              onChange({
                ...config,
                body: parseBodyValue(event.target.value),
              });
            }}
            placeholder={'{\n  "customerId": "{{customer_id}}"\n}'}
            className="min-h-[160px] font-mono text-xs"
          />
        </Field>
      </Section>
    </div>
  );
}

export function NodeConfigForm({ nodeType, config, onChange, nodeId }: NodeConfigFormProps) {
  const secrets = useSecrets();

  const enhancedForm = useMemo(() => {
    if (nodeType === NodeType.PRISM_LLM) {
      return <PrismLLMConfigForm config={config ?? {}} onChange={onChange} secrets={secrets} />;
    }

    if ([NodeType.AI_LLM, NodeType.AI_ANTHROPIC, NodeType.AI_MISTRAL, NodeType.AI_GROQ, NodeType.AI_OLLAMA].includes(nodeType)) {
      return <LLMEnterpriseForm nodeType={nodeType} config={config ?? {}} onChange={onChange} secrets={secrets} />;
    }

    if (VERDICT_NODE_TYPES.includes(nodeType)) {
      return <VerdictConfigForm nodeType={nodeType} config={config ?? {}} onChange={onChange} />;
    }

    if ([NodeType.VECTORSTORE_PINECONE, NodeType.VECTORSTORE_QDRANT, NodeType.VECTORSTORE_CHROMA, NodeType.VECTORSTORE_WEAVIATE, NodeType.VECTORSTORE_PGVECTOR, NodeType.VECTORSTORE_REDIS].includes(nodeType)) {
      return <VectorStoreEnterpriseForm nodeType={nodeType} config={config ?? {}} onChange={onChange} secrets={secrets} />;
    }

    if ([NodeType.LOADER_CSV, NodeType.LOADER_JSON, NodeType.LOADER_PDF, NodeType.LOADER_WEBPAGE, NodeType.LOADER_GITHUB, NodeType.LOADER_NOTION, NodeType.LOADER_GOOGLE_DRIVE, NodeType.LOADER_AIRTABLE, NodeType.LOADER_RSS, NodeType.LOADER_SITEMAP].includes(nodeType)) {
      return <LoaderEnterpriseForm nodeType={nodeType} config={config ?? {}} onChange={onChange} />;
    }

    if (nodeType === NodeType.INTEGRATION_HTTP) {
      return <HttpEnterpriseForm config={config ?? {}} onChange={onChange} />;
    }

    return null;
  }, [config, nodeType, onChange, secrets]);

  if (enhancedForm) {
    return enhancedForm;
  }

  const updateBasicConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const RegistryForm = getNodeForm(nodeType);
  if (RegistryForm) {
    return <RegistryForm config={config} onChange={onChange} nodeId={nodeId} />;
  }

  switch (nodeType) {
    case NodeType.SANDFLARE_EXECUTE:
      return <SandflareExecuteForm config={config} updateConfig={updateBasicConfig} />;
    case NodeType.SANDFLARE_SCRAPE:
      return <SandflareScrapeForm config={config} updateConfig={updateBasicConfig} />;
    case NodeType.TRANSFORM_DATA:
      return <DataTransformForm config={config} updateConfig={updateBasicConfig} />;
    case NodeType.CONTROL_CONDITION:
      return <LogicIfForm config={config} updateConfig={updateBasicConfig} />;
    case NodeType.CONTROL_LOOP:
      return <LogicLoopForm config={config} updateConfig={updateBasicConfig} />;
    default:
      return <div className="text-xs text-muted-foreground">No configuration available for {nodeType}.</div>;
  }
}

function SandflareExecuteForm({ config, updateConfig }: any) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="language">Language</Label>
        <Select value={config.language || 'python'} onValueChange={(v) => updateConfig('language', v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="nodejs">Node.js</SelectItem>
            <SelectItem value="go">Go</SelectItem>
            <SelectItem value="rust">Rust</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="code">Code</Label>
        <Textarea
          id="code"
          value={config.code || ''}
          onChange={(e) => updateConfig('code', e.target.value)}
          placeholder="# Write your code here&#10;print('Hello from Sandflare!')"
          className="min-h-[200px] font-mono text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">Use {`{{variableName}}`} to reference workflow variables</p>
      </div>

      <div>
        <Label htmlFor="timeout">Timeout (ms)</Label>
        <Input
          id="timeout"
          type="number"
          value={config.timeout || 30000}
          onChange={(e) => updateConfig('timeout', parseInt(e.target.value, 10))}
          className="h-8 text-sm"
        />
      </div>

      <div>
        <Label htmlFor="environment">Environment Variables (JSON)</Label>
        <Textarea
          id="environment"
          value={JSON.stringify(config.environment || {}, null, 2)}
          onChange={(e) => {
            try {
              updateConfig('environment', JSON.parse(e.target.value));
            } catch {}
          }}
          placeholder='{"API_KEY": "your-key"}'
          className="h-20 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function SandflareScrapeForm({ config, updateConfig }: any) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          value={config.url || ''}
          onChange={(e) => updateConfig('url', e.target.value)}
          placeholder="https://example.com"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="javascript"
          checked={config.javascript || false}
          onChange={(e) => updateConfig('javascript', e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="javascript" className="text-sm font-normal">
          Enable JavaScript
        </Label>
      </div>

      <div>
        <Label htmlFor="waitFor">Wait For Selector (optional)</Label>
        <Input
          id="waitFor"
          value={config.waitFor || ''}
          onChange={(e) => updateConfig('waitFor', e.target.value)}
          placeholder=".content-loaded"
          className="h-8 text-sm"
        />
      </div>

      <div>
        <Label htmlFor="timeout">Timeout (ms)</Label>
        <Input
          id="timeout"
          type="number"
          value={config.timeout || 30000}
          onChange={(e) => updateConfig('timeout', parseInt(e.target.value, 10))}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

function DataTransformForm({ config, updateConfig }: any) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="operation">Operation</Label>
        <Select value={config.operation || 'map'} onValueChange={(v) => updateConfig('operation', v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="map">Map</SelectItem>
            <SelectItem value="filter">Filter</SelectItem>
            <SelectItem value="reduce">Reduce</SelectItem>
            <SelectItem value="jsonPath">JSON Path</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="inputVariable">Input Variable</Label>
        <Input
          id="inputVariable"
          value={config.inputVariable || 'input'}
          onChange={(e) => updateConfig('inputVariable', e.target.value)}
          placeholder="input"
          className="h-8 text-sm"
        />
      </div>

      <div>
        <Label htmlFor="expression">Expression</Label>
        <Textarea
          id="expression"
          value={config.expression || ''}
          onChange={(e) => updateConfig('expression', e.target.value)}
          placeholder="item => item.value * 2"
          className="h-20 font-mono text-sm"
        />
      </div>
    </div>
  );
}

function LogicIfForm({ config, updateConfig }: any) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="condition">Condition</Label>
        <Textarea
          id="condition"
          value={config.condition || ''}
          onChange={(e) => updateConfig('condition', e.target.value)}
          placeholder="input.score > 0.8"
          className="h-20 font-mono text-sm"
        />
      </div>
    </div>
  );
}

function LogicLoopForm({ config, updateConfig }: any) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="iterations">Max Iterations</Label>
        <Input
          id="iterations"
          type="number"
          value={config.maxIterations || 10}
          onChange={(e) => updateConfig('maxIterations', parseInt(e.target.value, 10))}
          className="h-8 text-sm"
        />
      </div>

      <div>
        <Label htmlFor="loopVariable">Loop Variable</Label>
        <Input
          id="loopVariable"
          value={config.loopVariable || 'item'}
          onChange={(e) => updateConfig('loopVariable', e.target.value)}
          placeholder="item"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
