/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NodeFormProps } from './types';
import { CredentialPicker } from './credential-picker';
import { ExpressionInput, ExpressionTextarea } from '@/components/workflow/expression-input';

type SelectOption = { value: string; label: string };

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

function TextField({ label, value, onChange, placeholder, type = 'text', helper, expression = false, nodeId }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string; type?: string; helper?: string; expression?: boolean; nodeId?: string }) {
  return (
    <Field label={label} helper={helper}>
      {expression ? (
        <ExpressionInput value={value ?? ''} nodeId={nodeId} onValueChange={onChange} placeholder={placeholder} />
      ) : (
        <Input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </Field>
  );
}

function TextAreaField({ label, value, onChange, placeholder, helper, rows = 5, mono = false, expression = false, nodeId }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string; helper?: string; rows?: number; mono?: boolean; expression?: boolean; nodeId?: string }) {
  return (
    <Field label={label} helper={helper}>
      {expression ? (
        <ExpressionTextarea rows={rows} value={value ?? ''} nodeId={nodeId} onValueChange={onChange} placeholder={placeholder} className={mono ? 'font-mono text-xs' : undefined} />
      ) : (
        <Textarea rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={mono ? 'font-mono text-xs' : undefined} />
      )}
    </Field>
  );
}

function SelectField({ label, value, onChange, options, helper }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; helper?: string }) {
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

function ToggleField({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (checked: boolean) => void; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <div className="flex h-10 items-center">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </Field>
  );
}

function RangeField({ label, value, onChange, min, max, step = 1, helper }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <div className="space-y-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full"
        />
        <div className="text-xs text-muted-foreground">{value}</div>
      </div>
    </Field>
  );
}

function parseJsonInput(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const providerOptions: SelectOption[] = [
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
    default:
      return undefined;
  }
}

function AgentCredentialFields({ config, onChange }: NodeFormProps) {
  const providerId = getCredentialProviderId(config.provider ?? 'openai');

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

function AgentLlmForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <AgentCredentialFields config={config} onChange={onChange} />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <TextAreaField label="System Prompt" value={config.systemPrompt ?? 'You are a helpful assistant.'} onChange={(value) => updateConfig(config, onChange, 'systemPrompt', value)} placeholder="You are a helpful assistant." expression nodeId={nodeId} />
      <RangeField label="Temperature" value={Number(config.temperature ?? 0.7)} onChange={(value) => updateConfig(config, onChange, 'temperature', value)} min={0} max={2} step={0.1} />
      <TextField label="Max Tokens" type="number" value={config.maxTokens ?? 2000} onChange={(value) => updateConfig(config, onChange, 'maxTokens', value === '' ? undefined : Number(value))} placeholder="2000" />
      <TextField label="Memory Node ID" value={config.memoryNodeId ?? ''} onChange={(value) => updateConfig(config, onChange, 'memoryNodeId', value)} placeholder="Optional connected memory node id" />
      <ToggleField label="Streaming" checked={Boolean(config.streaming)} onChange={(value) => updateConfig(config, onChange, 'streaming', value)} helper="Executor stores the flag for future streaming support." />
    </div>
  );
}

function AgentReActForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <AgentCredentialFields config={config} onChange={onChange} />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <TextAreaField label="System Prompt" value={config.systemPrompt ?? 'You are a reasoning-and-acting agent.'} onChange={(value) => updateConfig(config, onChange, 'systemPrompt', value)} expression nodeId={nodeId} />
      <RangeField label="Max Iterations" value={Number(config.maxIterations ?? 5)} onChange={(value) => updateConfig(config, onChange, 'maxIterations', value)} min={1} max={20} step={1} />
      <ToggleField label="Verbose Trace" checked={Boolean(config.verbose)} onChange={(value) => updateConfig(config, onChange, 'verbose', value)} />
    </div>
  );
}

function AgentToolForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Tool Name" value={config.name ?? ''} onChange={(value) => updateConfig(config, onChange, 'name', value)} placeholder="search_docs" />
      <TextField label="Description" value={config.description ?? ''} onChange={(value) => updateConfig(config, onChange, 'description', value)} placeholder="Search internal documentation" />
      <SelectField label="Language" value={config.language ?? 'nodejs'} onChange={(value) => updateConfig(config, onChange, 'language', value)} options={[{ value: 'nodejs', label: 'Node.js' }, { value: 'python', label: 'Python' }]} />
      <TextAreaField label="Code" value={config.code ?? 'return args;'} onChange={(value) => updateConfig(config, onChange, 'code', value)} rows={12} mono helper="Use args, input, and context variables inside the function body." />
      <TextAreaField label="Parameters JSON Schema" value={typeof config.parameters === 'string' ? config.parameters : JSON.stringify(config.parameters ?? { type: 'object', properties: {}, additionalProperties: true }, null, 2)} onChange={(value) => updateConfig(config, onChange, 'parameters', value)} rows={8} mono />
    </div>
  );
}

function AgentConditionForm({ config, onChange, nodeId }: NodeFormProps) {
  const conditionType = config.conditionType ?? 'expression';
  return (
    <div className="space-y-4">
      <SelectField label="Condition Type" value={conditionType} onChange={(value) => updateConfig(config, onChange, 'conditionType', value)} options={[{ value: 'expression', label: 'Expression' }, { value: 'llm', label: 'LLM Routing' }]} />
      {conditionType === 'llm' ? (
        <>
          <AgentCredentialFields config={config} onChange={onChange} />
          <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
          <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
          <TextAreaField label="Routing Prompt" value={config.prompt ?? 'Given the input, which path should we take: true or false?'} onChange={(value) => updateConfig(config, onChange, 'prompt', value)} expression nodeId={nodeId} />
        </>
      ) : (
        <TextAreaField label="Condition Expression" value={config.expression ?? 'Boolean(input)'} onChange={(value) => updateConfig(config, onChange, 'expression', value)} helper="Use input, variables, nodes, and context in the expression." expression nodeId={nodeId} />
      )}
    </div>
  );
}

function AgentLoopForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <RangeField label="Max Iterations" value={Number(config.maxIterations ?? 5)} onChange={(value) => updateConfig(config, onChange, 'maxIterations', value)} min={1} max={100} step={1} />
      <SelectField label="Exit Condition Type" value={config.exitConditionType ?? 'expression'} onChange={(value) => updateConfig(config, onChange, 'exitConditionType', value)} options={[{ value: 'expression', label: 'Expression' }, { value: 'manual', label: 'Manual / External' }]} />
      <TextAreaField label="Condition Expression" value={config.conditionExpression ?? config.exitCondition ?? 'false'} onChange={(value) => updateConfig(config, onChange, 'conditionExpression', value)} placeholder="current.status === 'done'" expression nodeId={nodeId} />
      <TextAreaField label="Step Expression" value={config.stepExpression ?? ''} onChange={(value) => updateConfig(config, onChange, 'stepExpression', value)} placeholder="({ ...current, attempts: (current.attempts || 0) + 1 })" expression nodeId={nodeId} />
      <ToggleField label="Aggregate Results" checked={config.aggregateResults !== false} onChange={(value) => updateConfig(config, onChange, 'aggregateResults', value)} />
    </div>
  );
}

function AgentSupervisorForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <AgentCredentialFields config={config} onChange={onChange} />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <SelectField label="Routing Strategy" value={config.routingStrategy ?? 'llm'} onChange={(value) => updateConfig(config, onChange, 'routingStrategy', value)} options={[{ value: 'llm', label: 'LLM Router' }, { value: 'first-match', label: 'First Match' }]} />
      <TextAreaField label="System Prompt" value={config.systemPrompt ?? 'Route the request to the best worker and explain why.'} onChange={(value) => updateConfig(config, onChange, 'systemPrompt', value)} expression nodeId={nodeId} />
      <RangeField label="Max Rounds" value={Number(config.maxRounds ?? 3)} onChange={(value) => updateConfig(config, onChange, 'maxRounds', value)} min={1} max={10} step={1} />
    </div>
  );
}

function AgentWorkerForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <AgentCredentialFields config={config} onChange={onChange} />
      <TextField label="Worker Name" value={config.name ?? ''} onChange={(value) => updateConfig(config, onChange, 'name', value)} placeholder="Research Worker" />
      <TextField label="Description" value={config.description ?? ''} onChange={(value) => updateConfig(config, onChange, 'description', value)} placeholder="Specialized in web and API research" />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <TextAreaField label="System Prompt" value={config.systemPrompt ?? 'You are a specialized worker agent.'} onChange={(value) => updateConfig(config, onChange, 'systemPrompt', value)} expression nodeId={nodeId} />
      <TextField label="Memory Node ID" value={config.memoryNodeId ?? ''} onChange={(value) => updateConfig(config, onChange, 'memoryNodeId', value)} placeholder="Optional memory node id" />
    </div>
  );
}

function AgentPlannerForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <AgentCredentialFields config={config} onChange={onChange} />
      <SelectField label="Provider" value={config.provider ?? 'openai'} onChange={(value) => updateConfig(config, onChange, 'provider', value)} options={providerOptions} />
      <TextField label="Model" value={config.model ?? 'gpt-4o'} onChange={(value) => updateConfig(config, onChange, 'model', value)} placeholder="gpt-4o" />
      <TextAreaField label="System Prompt" value={config.systemPrompt ?? 'Create a structured execution plan.'} onChange={(value) => updateConfig(config, onChange, 'systemPrompt', value)} expression nodeId={nodeId} />
      <RangeField label="Max Steps" value={Number(config.maxSteps ?? 8)} onChange={(value) => updateConfig(config, onChange, 'maxSteps', value)} min={1} max={20} step={1} />
      <ToggleField label="Prefer JSON Output" checked={config.preferJson !== false} onChange={(value) => updateConfig(config, onChange, 'preferJson', value)} />
    </div>
  );
}

function AgentPublishForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Topic" value={config.topic ?? ''} onChange={(value) => updateConfig(config, onChange, 'topic', value)} placeholder="team.alerts" />
      <TextAreaField
        label="Payload JSON"
        value={typeof config.payload === 'string' ? config.payload : JSON.stringify(config.payload ?? {}, null, 2)}
        onChange={(value) => updateConfig(config, onChange, 'payload', parseJsonInput(value))}
        rows={8}
        mono
      />
      <ToggleField label="Include upstream context" checked={config.includeContext !== false} onChange={(value) => updateConfig(config, onChange, 'includeContext', value)} helper="Merge prior node outputs into the published payload." />
    </div>
  );
}

function AgentSubscribeForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Topic" value={config.topic ?? ''} onChange={(value) => updateConfig(config, onChange, 'topic', value)} placeholder="team.alerts" />
      <TextAreaField label="Filter Expression" value={config.filter ?? ''} onChange={(value) => updateConfig(config, onChange, 'filter', value)} placeholder="$.payload.priority == 'high'" helper="Optional JSONPath-style expression for downstream filtering." expression nodeId={nodeId} rows={4} />
    </div>
  );
}

function AgentCallForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Agent ID" value={config.agentId ?? ''} onChange={(value) => updateConfig(config, onChange, 'agentId', value)} placeholder="Optional exact agent id" />
      <TextField label="Agent Name" value={config.agentName ?? ''} onChange={(value) => updateConfig(config, onChange, 'agentName', value)} placeholder="Fallback lookup by name" />
      <TextField label="Method" value={config.method ?? 'run'} onChange={(value) => updateConfig(config, onChange, 'method', value)} placeholder="run" />
      <TextField label="Timeout (ms)" type="number" value={config.timeoutMs ?? 30000} onChange={(value) => updateConfig(config, onChange, 'timeoutMs', value === '' ? undefined : Number(value))} placeholder="30000" />
      <TextAreaField
        label="Arguments JSON"
        value={typeof config.args === 'string' ? config.args : JSON.stringify(config.args ?? {}, null, 2)}
        onChange={(value) => updateConfig(config, onChange, 'args', parseJsonInput(value))}
        rows={8}
        mono
      />
    </div>
  );
}

export const agentForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.AGENT_LLM]: AgentLlmForm,
  [NodeType.AGENT_REACT]: AgentReActForm,
  [NodeType.AGENT_TOOL]: AgentToolForm,
  [NodeType.AGENT_CONDITION]: AgentConditionForm,
  [NodeType.AGENT_LOOP]: AgentLoopForm,
  [NodeType.AGENT_SUPERVISOR]: AgentSupervisorForm,
  [NodeType.AGENT_WORKER]: AgentWorkerForm,
  [NodeType.AGENT_PLANNER]: AgentPlannerForm,
  [NodeType.AGENT_PUBLISH]: AgentPublishForm,
  [NodeType.AGENT_SUBSCRIBE]: AgentSubscribeForm,
  [NodeType.AGENT_CALL]: AgentCallForm,
};
