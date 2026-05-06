/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NodeFormProps } from './types';
import { CredentialPicker } from './credential-picker';

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function TextField({ label, value, onChange, type = 'text', placeholder, helper }: { label: string; value: any; onChange: (value: string) => void; type?: string; placeholder?: string; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <Input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </Field>
  );
}

function RangeField({ label, value, onChange, min, max, step = 1, helper }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <div className="space-y-2">
        <input className="w-full" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <div className="text-xs text-muted-foreground">{value}</div>
      </div>
    </Field>
  );
}

function TextAreaField({ label, value, onChange, rows = 4, helper }: { label: string; value: any; onChange: (value: string) => void; rows?: number; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <Textarea rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectField({ label, value, onChange, options, helper }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
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

const providerOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google / Gemini' },
  { value: 'custom', label: 'Custom OpenAI-compatible' },
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
    case 'postgres':
      return 'postgres';
    case 'redis':
      return 'redis';
    default:
      return undefined;
  }
}

function MemoryCredentialFields({ config, onChange, providerId }: NodeFormProps & { providerId?: string }) {
  if (!providerId) return null;

  return (
    <CredentialPicker
      providerId={providerId}
      config={config}
      onChange={(updates) => onChange({ ...config, ...updates })}
      label="Credentials"
    />
  );
}

function MemoryBufferForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <RangeField label="Max Messages" value={Number(config.maxMessages ?? 10)} onChange={(value) => updateConfig(config, onChange, 'maxMessages', value)} min={1} max={100} step={1} />
      <TextField label="Session Key" value={config.sessionKey ?? ''} onChange={(value) => updateConfig(config, onChange, 'sessionKey', value)} placeholder="chat-session-1" />
    </div>
  );
}

function MemoryRedisForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <MemoryCredentialFields config={config} onChange={onChange} providerId="redis" />
      <TextField label="Session Key" value={config.sessionKey ?? ''} onChange={(value) => updateConfig(config, onChange, 'sessionKey', value)} placeholder="user-123" />
      <TextField label="TTL Seconds" type="number" value={config.ttlSeconds ?? 86400} onChange={(value) => updateConfig(config, onChange, 'ttlSeconds', value === '' ? undefined : Number(value))} placeholder="86400" />
      <RangeField label="Max Messages" value={Number(config.maxMessages ?? 20)} onChange={(value) => updateConfig(config, onChange, 'maxMessages', value)} min={1} max={200} step={1} />
    </div>
  );
}

function MemoryPostgresForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <MemoryCredentialFields config={config} onChange={onChange} providerId="postgres" />
      <TextField label="Session Key" value={config.sessionKey ?? ''} onChange={(value) => updateConfig(config, onChange, 'sessionKey', value)} placeholder="team-chat" />
      <RangeField label="Max Messages" value={Number(config.maxMessages ?? 20)} onChange={(value) => updateConfig(config, onChange, 'maxMessages', value)} min={1} max={200} step={1} />
      <TextField label="Workflow ID (optional override)" value={config.workflowId ?? ''} onChange={(value) => updateConfig(config, onChange, 'workflowId', value)} placeholder="UUID from workflows table" helper="If omitted, executor will try to infer the workflow id from runtime context." />
      <TextAreaField label="Table Hint" value={config.tableHint ?? 'Uses memory_store table'} onChange={(value) => updateConfig(config, onChange, 'tableHint', value)} rows={2} helper="Documentation-only hint for builders." />
    </div>
  );
}

function MemorySummaryForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <MemoryCredentialFields config={config} onChange={onChange} providerId={getCredentialProviderId(config.provider ?? 'openai')} />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <TextField label="Max Tokens Before Summary" type="number" value={config.maxTokensBeforeSummary ?? 2000} onChange={(value) => updateConfig(config, onChange, 'maxTokensBeforeSummary', value === '' ? undefined : Number(value))} placeholder="2000" />
      <TextField label="Keep Recent Messages" type="number" value={config.keepRecentMessages ?? 6} onChange={(value) => updateConfig(config, onChange, 'keepRecentMessages', value === '' ? undefined : Number(value))} placeholder="6" />
    </div>
  );
}

function MemoryWindowForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <RangeField label="Window Size" value={Number(config.windowSize ?? 5)} onChange={(value) => updateConfig(config, onChange, 'windowSize', value)} min={1} max={50} step={1} helper="Keeps the last N user + assistant pairs." />
      <TextField label="Session Key" value={config.sessionKey ?? ''} onChange={(value) => updateConfig(config, onChange, 'sessionKey', value)} placeholder="shared-memory" />
    </div>
  );
}

export const memoryForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.MEMORY_BUFFER]: MemoryBufferForm,
  [NodeType.MEMORY_REDIS]: MemoryRedisForm,
  [NodeType.MEMORY_POSTGRES]: MemoryPostgresForm,
  [NodeType.MEMORY_SUMMARY]: MemorySummaryForm,
  [NodeType.MEMORY_WINDOW]: MemoryWindowForm,
};
