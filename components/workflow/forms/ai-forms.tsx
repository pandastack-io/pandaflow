/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { ExpressionInput, ExpressionTextarea } from '@/components/workflow/expression-input';
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
      {helper ? <p className="text-xs text-muted-foreground mt-1">{helper}</p> : null}
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
  type = 'text',
  helper,
  expression = false,
  nodeId,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  helper?: string;
  expression?: boolean;
  nodeId?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      {expression ? (
        <ExpressionInput value={value ?? ''} nodeId={nodeId} placeholder={placeholder} onValueChange={onChange} />
      ) : (
        <Input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
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
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
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
  expression = false,
  nodeId,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  rows?: number;
  expression?: boolean;
  nodeId?: string;
}) {
  return (
    <Field label={label} helper={helper}>
      {expression ? (
        <ExpressionTextarea rows={rows} value={value ?? ''} nodeId={nodeId} placeholder={placeholder} onValueChange={onChange} />
      ) : (
        <Textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
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
        onChange={(e) => {
          const raw = e.target.value;
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
    case 'pinecone':
      return 'pinecone';
    case 'weaviate':
      return 'weaviate';
    case 'qdrant':
      return 'qdrant';
    case 'stability':
    case 'stable-diffusion':
      return 'stability';
    case 'elevenlabs':
      return 'elevenlabs';
    default:
      return undefined;
  }
}

function renderCredentialPicker(config: any, update: (key: string, value: any) => void, providerId?: string, label = 'Credentials') {
  if (!providerId) return null;

  return (
    <CredentialPicker
      providerId={providerId}
      config={config}
      onChange={(updates) => Object.entries(updates).forEach(([key, value]) => update(key, value))}
      label={label}
    />
  );
}

function CommonProviderFields({ config, update, providers }: { config: any; update: (key: string, value: any) => void; providers: Array<{ value: string; label: string }> }) {
  const provider = config.provider || providers[0]?.value;

  return (
    <>
      {renderCredentialPicker(config, update, getCredentialProviderId(provider))}
      <Field label="Provider">
        <Select value={provider} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => (
              <SelectItem key={provider.value} value={provider.value}>
                {provider.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Model" value={config.model || ''} onChange={(value) => update('model', value)} placeholder="Enter model name" helper="Use a common model name or your provider-specific model ID." />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} placeholder="Provider API key" helper="If left blank, the executor will fall back to environment variables." />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} placeholder="upstreamVariableName" helper="Optional variable name to pull upstream input from the workflow context." />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </>
  );
}

function LLMBehaviorFields({ config, update, nodeId }: { config: any; update: (key: string, value: any) => void; nodeId?: string }) {
  return (
    <>
      <TextAreaField label="System Prompt" value={config.systemPrompt || ''} onChange={(value) => update('systemPrompt', value)} placeholder="You are a helpful assistant..." rows={3} helper="System instructions are applied before user messages." expression nodeId={nodeId} />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} placeholder="Describe the task or question..." rows={5} helper="Supports template variables like {{variableName}} at runtime." expression nodeId={nodeId} />
      <NumberField label="Temperature" value={config.temperature ?? 0.7} onChange={(value) => update('temperature', value)} min={0} max={2} step={0.1} helper="Lower values are more deterministic; higher values are more creative." />
      <NumberField label="Max Tokens" value={config.maxTokens ?? 2000} onChange={(value) => update('maxTokens', value)} min={1} max={16000} step={1} />
      <Field label="Output Format">
        <Select value={config.outputFormat || 'text'} onValueChange={(value) => update('outputFormat', value)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function AILLMForm({ config, onChange, nodeId }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <LLMBehaviorFields config={config} update={update} nodeId={nodeId} />
    </div>
  );
}

function AIChatForm({ config, onChange, nodeId }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <LLMBehaviorFields config={config} update={update} nodeId={nodeId} />
      <JsonField label="History / Messages" value={config.history || []} onChange={(value) => update('history', value)} rows={5} helper="Provide an array of prior messages to maintain stateful conversation context." />
    </div>
  );
}

function AICompletionForm({ config, onChange, nodeId }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} placeholder="Write the text completion prompt..." rows={5} expression nodeId={nodeId} />
      <NumberField label="Temperature" value={config.temperature ?? 0.7} onChange={(value) => update('temperature', value)} min={0} max={2} step={0.1} />
      <NumberField label="Max Tokens" value={config.maxTokens ?? 512} onChange={(value) => update('maxTokens', value)} min={1} max={16000} step={1} />
      <Field label="Output Format">
        <Select value={config.outputFormat || 'text'} onValueChange={(value) => update('outputFormat', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function AIEmbeddingForm({ config, onChange, nodeId }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, 'openai')}
      <TextField label="Model" value={config.model || 'text-embedding-3-small'} onChange={(value) => update('model', value)} helper="Common OpenAI models: text-embedding-3-small and text-embedding-3-large." />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={5} helper="The text to embed. You can also pass text via Input Variable." expression nodeId={nodeId} />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <Field label="Encoding Format" helper="Float is typically used for vector database storage.">
        <Select value={config.encodingFormat || 'float'} onValueChange={(value) => update('encodingFormat', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="float">Float</SelectItem>
            <SelectItem value="base64">Base64</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AIVectorSearchForm({ config, onChange, nodeId }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, getCredentialProviderId(config.provider || 'pinecone'), 'Vector store credentials')}
      {renderCredentialPicker(config, update, 'openai', 'Embedding credentials')}
      <Field label="Provider">
        <Select value={config.provider || 'pinecone'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pinecone">Pinecone</SelectItem>
            <SelectItem value="weaviate">Weaviate</SelectItem>
            <SelectItem value="qdrant">Qdrant</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Endpoint / Base URL" value={config.endpoint || ''} onChange={(value) => update('endpoint', value)} placeholder="https://your-index-host" helper="For Pinecone, use your index host. For Weaviate/Qdrant, use the service base URL." expression nodeId={nodeId} />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextAreaField label="Query Text" value={config.query || ''} onChange={(value) => update('query', value)} rows={4} helper="Optional natural-language query. If no query vector is provided, the executor will generate one using OpenAI embeddings." expression nodeId={nodeId} />
      <TextField label="Embedding Model" value={config.embeddingModel || 'text-embedding-3-small'} onChange={(value) => update('embeddingModel', value)} />
      <TextField label="Embedding API Key" type="password" value={config.embeddingApiKey || ''} onChange={(value) => update('embeddingApiKey', value)} />
      <JsonField label="Query Vector" value={config.queryVector || []} onChange={(value) => update('queryVector', value)} rows={4} helper="Provide a numeric vector array to skip runtime embedding generation." />
      <TextField label="Collection / Class" value={config.collection || ''} onChange={(value) => update('collection', value)} placeholder="collection-name" />
      <TextField label="Namespace" value={config.namespace || ''} onChange={(value) => update('namespace', value)} placeholder="optional namespace" />
      <NumberField label="Top K" value={config.topK ?? 10} onChange={(value) => update('topK', value)} min={1} max={100} step={1} />
      <NumberField label="Threshold" value={config.threshold} onChange={(value) => update('threshold', value)} min={0} max={1} step={0.01} helper="Optional score/certainty threshold depending on the provider." />
      <ToggleField label="Include Metadata" checked={config.includeMetadata ?? true} onChange={(value) => update('includeMetadata', value)} />
      <ToggleField label="Include Values" checked={config.includeValues ?? false} onChange={(value) => update('includeValues', value)} />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AIParameterExtractorForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <TextField label="Model" value={config.model || 'gpt-4o-mini'} onChange={(value) => update('model', value)} placeholder="gpt-4o-mini" helper="Uses OpenAI chat completions with JSON mode." />
      <JsonField
        label="Parameters"
        value={config.parameters || []}
        onChange={(value) => update('parameters', value)}
        rows={8}
        helper={'Array of extraction targets. Example: [{"name":"email","type":"string","description":"Customer email","required":true}]'}
      />
      <TextAreaField label="Instruction" value={config.instruction || ''} onChange={(value) => update('instruction', value)} rows={4} helper="Optional extra guidance for edge cases, formatting, or normalization." />
    </div>
  );
}

function AIQuestionClassifierForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <TextField label="Model" value={config.model || 'gpt-4o-mini'} onChange={(value) => update('model', value)} placeholder="gpt-4o-mini" helper="Uses OpenAI chat completions with JSON mode." />
      <JsonField
        label="Classes"
        value={config.classes || []}
        onChange={(value) => update('classes', value)}
        rows={8}
        helper={'Each class needs an id and name. The id becomes the output handle for routing. Example: [{"id":"sales","name":"Sales","description":"Pricing and plan questions"}]'}
      />
      <TextAreaField label="Instruction" value={config.instruction || ''} onChange={(value) => update('instruction', value)} rows={4} helper="Optional routing guidance for ambiguous questions." />
    </div>
  );
}

function AIClassificationForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={4} />
      <TextField label="Labels" value={Array.isArray(config.labels) ? config.labels.join(', ') : config.labels || ''} onChange={(value) => update('labels', value)} placeholder="spam, support, sales" helper="Comma-separated class labels." />
      <TextAreaField label="Classification Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} helper="Optional extra guidance for the classifier." />
      <NumberField label="Temperature" value={config.temperature ?? 0} onChange={(value) => update('temperature', value)} min={0} max={2} step={0.1} />
      <NumberField label="Max Tokens" value={config.maxTokens ?? 500} onChange={(value) => update('maxTokens', value)} min={1} max={4000} step={1} />
    </div>
  );
}

function AISentimentForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={4} />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} helper="Optional guidance for domain-specific sentiment analysis." />
      <NumberField label="Temperature" value={config.temperature ?? 0} onChange={(value) => update('temperature', value)} min={0} max={2} step={0.1} />
      <NumberField label="Max Tokens" value={config.maxTokens ?? 300} onChange={(value) => update('maxTokens', value)} min={1} max={4000} step={1} />
    </div>
  );
}

function AISummarizationForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={6} />
      <Field label="Summary Length">
        <Select value={config.length || 'medium'} onValueChange={(value) => update('length', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="long">Long</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <NumberField label="Max Words" value={config.maxWords} onChange={(value) => update('maxWords', value)} min={10} max={5000} step={10} helper="Optional word budget for the generated summary." />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} />
    </div>
  );
}

function AITranslationForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <CommonProviderFields config={config} update={update} providers={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'google', label: 'Google' }, { value: 'cohere', label: 'Cohere' }, { value: 'mistral', label: 'Mistral' }]} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={5} />
      <TextField label="Source Language" value={config.sourceLanguage || 'auto-detect'} onChange={(value) => update('sourceLanguage', value)} placeholder="auto-detect" />
      <TextField label="Target Language" value={config.targetLanguage || 'English'} onChange={(value) => update('targetLanguage', value)} placeholder="English" />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} helper="Optional domain terminology or style instructions." />
    </div>
  );
}

function AIImageGenerationForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, getCredentialProviderId(config.provider || 'openai'))}
      <Field label="Provider">
        <Select value={config.provider || 'openai'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="stability">Stability AI</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Model" value={config.model || ''} onChange={(value) => update('model', value)} placeholder="dall-e-3 or stable-diffusion" />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={5} helper="Describe the image you want to generate in detail." />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <TextField label="Image Size" value={config.size || '1024x1024'} onChange={(value) => update('size', value)} placeholder="1024x1024" />
      <TextField label="Quality / Style" value={config.quality || 'standard'} onChange={(value) => update('quality', value)} placeholder="standard" helper="For OpenAI, common values are standard or hd." />
      <TextField label="Aspect Ratio" value={config.aspectRatio || ''} onChange={(value) => update('aspectRatio', value)} placeholder="1:1" helper="Optional Stability AI aspect ratio." />
      <TextAreaField label="Negative Prompt" value={config.negativePrompt || ''} onChange={(value) => update('negativePrompt', value)} rows={3} helper="Optional Stability AI negative prompt." />
      <TextField label="Response Format" value={config.responseFormat || 'b64_json'} onChange={(value) => update('responseFormat', value)} placeholder="b64_json" />
      <NumberField label="Timeout (ms)" value={config.timeout || 60000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AIImageAnalysisForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, getCredentialProviderId(config.provider || 'openai'))}
      <Field label="Provider">
        <Select value={config.provider || 'openai'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Model" value={config.model || ''} onChange={(value) => update('model', value)} placeholder="gpt-4o or claude-opus-4-7-20250514" />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextField label="Image URL" value={config.imageUrl || ''} onChange={(value) => update('imageUrl', value)} placeholder="https://..." />
      <TextAreaField label="Image Base64" value={config.imageBase64 || ''} onChange={(value) => update('imageBase64', value)} rows={4} helper="Optional data URI or raw base64 image payload." />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={4} helper="Ask for captions, object detection, extraction, or other visual analysis." />
      <TextAreaField label="System Prompt" value={config.systemPrompt || ''} onChange={(value) => update('systemPrompt', value)} rows={3} />
      <Field label="Output Format">
        <Select value={config.outputFormat || 'text'} onValueChange={(value) => update('outputFormat', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <NumberField label="Max Tokens" value={config.maxTokens ?? 2000} onChange={(value) => update('maxTokens', value)} min={1} max={8000} step={1} />
      <NumberField label="Timeout (ms)" value={config.timeout || 60000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AISpeechToTextForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, 'openai')}
      <TextField label="Model" value={config.model || 'whisper-1'} onChange={(value) => update('model', value)} />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextField label="Audio URL" value={config.audioUrl || ''} onChange={(value) => update('audioUrl', value)} placeholder="https://..." />
      <TextAreaField label="Audio Base64" value={config.audioBase64 || ''} onChange={(value) => update('audioBase64', value)} rows={4} helper="Optional base64 audio payload or data URI." />
      <TextField label="Language" value={config.language || ''} onChange={(value) => update('language', value)} placeholder="en" />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} helper="Optional contextual prompt to improve transcription accuracy." />
      <TextField label="Response Format" value={config.responseFormat || 'verbose_json'} onChange={(value) => update('responseFormat', value)} placeholder="verbose_json" />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <NumberField label="Timeout (ms)" value={config.timeout || 60000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AITextToSpeechForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, getCredentialProviderId(config.provider || 'openai'))}
      <Field label="Provider">
        <Select value={config.provider || 'openai'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Model" value={config.model || ''} onChange={(value) => update('model', value)} placeholder="tts-1 or eleven_multilingual_v2" />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={4} />
      <TextField label="Voice / Voice ID" value={config.voice || config.voiceId || ''} onChange={(value) => { update('voice', value); update('voiceId', value); }} placeholder="alloy or ElevenLabs voice ID" />
      <TextField label="Format" value={config.format || 'mp3'} onChange={(value) => update('format', value)} placeholder="mp3" />
      <NumberField label="Speed" value={config.speed ?? 1} onChange={(value) => update('speed', value)} min={0.25} max={4} step={0.05} />
      <NumberField label="Stability" value={config.stability ?? 0.5} onChange={(value) => update('stability', value)} min={0} max={1} step={0.01} helper="ElevenLabs voice stability." />
      <NumberField label="Similarity Boost" value={config.similarityBoost ?? 0.75} onChange={(value) => update('similarityBoost', value)} min={0} max={1} step={0.01} helper="ElevenLabs pronunciation similarity boost." />
      <ToggleField label="Use Speaker Boost" checked={config.useSpeakerBoost ?? true} onChange={(value) => update('useSpeakerBoost', value)} />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <NumberField label="Timeout (ms)" value={config.timeout || 60000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AIOCRForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, getCredentialProviderId(config.provider || 'openai'))}
      <Field label="Provider">
        <Select value={config.provider || 'openai'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI Vision</SelectItem>
            <SelectItem value="anthropic">Anthropic Vision</SelectItem>
            <SelectItem value="tesseract">Tesseract API</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="Model" value={config.model || ''} onChange={(value) => update('model', value)} placeholder="Vision model when using OpenAI or Anthropic" />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextField label="Endpoint" value={config.endpoint || ''} onChange={(value) => update('endpoint', value)} placeholder="Required for Tesseract API provider" />
      <TextField label="Image URL" value={config.imageUrl || ''} onChange={(value) => update('imageUrl', value)} placeholder="https://..." />
      <TextAreaField label="Image Base64" value={config.imageBase64 || ''} onChange={(value) => update('imageBase64', value)} rows={4} />
      <TextField label="Language Hint" value={config.language || ''} onChange={(value) => update('language', value)} placeholder="eng" />
      <TextAreaField label="Prompt" value={config.prompt || ''} onChange={(value) => update('prompt', value)} rows={3} helper="Optional OCR guidance, for example table extraction or handwritten text." />
      <JsonField label="Options / Auth Config" value={config.options || {}} onChange={(value) => update('options', value)} rows={4} helper="Additional OCR provider options as a JSON object." />
      <NumberField label="Timeout (ms)" value={config.timeout || 60000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

function AIModerationForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      {renderCredentialPicker(config, update, 'openai')}
      <TextField label="Model" value={config.model || 'omni-moderation-latest'} onChange={(value) => update('model', value)} />
      <TextField label="API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} />
      <TextAreaField label="Text" value={config.text || ''} onChange={(value) => update('text', value)} rows={5} helper="Content to moderate. You can also provide this via Input Variable." />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
    </div>
  );
}

export const aiForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.AI_LLM]: AILLMForm,
  [NodeType.AI_CHAT]: AIChatForm,
  [NodeType.AI_COMPLETION]: AICompletionForm,
  [NodeType.AI_EMBEDDING]: AIEmbeddingForm,
  [NodeType.AI_VECTOR_SEARCH]: AIVectorSearchForm,
  [NodeType.AI_CLASSIFICATION]: AIClassificationForm,
  [NodeType.AI_SENTIMENT]: AISentimentForm,
  [NodeType.AI_SUMMARIZATION]: AISummarizationForm,
  [NodeType.AI_TRANSLATION]: AITranslationForm,
  [NodeType.AI_IMAGE_GEN]: AIImageGenerationForm,
  [NodeType.AI_IMAGE_ANALYZE]: AIImageAnalysisForm,
  [NodeType.AI_SPEECH_TO_TEXT]: AISpeechToTextForm,
  [NodeType.AI_TEXT_TO_SPEECH]: AITextToSpeechForm,
  [NodeType.AI_OCR]: AIOCRForm,
  [NodeType.AI_MODERATION]: AIModerationForm,
  [NodeType.AI_PARAMETER_EXTRACTOR]: AIParameterExtractorForm,
  [NodeType.AI_QUESTION_CLASSIFIER]: AIQuestionClassifierForm,
};
