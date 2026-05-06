/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExpressionInput } from '@/components/workflow/expression-input';

type GenericConfig = Record<string, any>;
type SelectOption = { value: string; label: string };

function updateConfig(config: GenericConfig, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; placeholder?: string; type?: 'text' | 'number' }) {
  return (
    <Field label={label}>
      <Input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </Field>
  );
}

function ExpressionField({ label, value, onChange, placeholder, nodeId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; nodeId?: string }) {
  return (
    <Field label={label}>
      <ExpressionInput value={value ?? ''} nodeId={nodeId} onValueChange={onChange} placeholder={placeholder} className="h-8 text-sm" />
    </Field>
  );
}

function AreaField({ label, value, onChange, placeholder, helper }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; helper?: string }) {
  return (
    <Field label={label}>
      <Textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-[110px] font-mono text-xs" />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </Field>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[] }) {
  return (
    <Field label={label}>
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

function DelayForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <TextField label="Delay (ms)" value={config.delay ?? config.duration ?? 1000} onChange={(value) => updateConfig(config, onChange, 'delay', value)} type="number" placeholder="1000" />
    </div>
  );
}

function LogForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Level" value={config.level ?? 'info'} onChange={(value) => updateConfig(config, onChange, 'level', value)} options={[{ value: 'debug', label: 'Debug' }, { value: 'info', label: 'Info' }, { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' }]} />
      <AreaField label="Message" value={config.message ?? ''} onChange={(value) => updateConfig(config, onChange, 'message', value)} placeholder="Processing customer {{variables.customerId}}" helper="Supports variable interpolation with {{variable}} syntax." />
      <AreaField label="Data (optional)" value={config.data ?? ''} onChange={(value) => updateConfig(config, onChange, 'data', value)} placeholder='{"step":"validation"}' />
    </div>
  );
}

function SetVariableForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Variable Name" value={config.name ?? config.variableName ?? ''} onChange={(value) => updateConfig(config, onChange, 'name', value)} placeholder="customerId" />
      <ExpressionField label="Value" value={config.value ?? ''} nodeId={nodeId} onChange={(value) => updateConfig(config, onChange, 'value', value)} placeholder="{{input.id}}" />
      <p className="text-xs text-muted-foreground">Use <code>{'{{...}}'}</code> expressions to store values from inputs, upstream nodes, or workflow variables.</p>
    </div>
  );
}

function GetVariableForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Variable Name" value={config.name ?? config.variableName ?? ''} onChange={(value) => updateConfig(config, onChange, 'name', value)} placeholder="customerId" />
      <p className="text-xs text-muted-foreground">This node outputs the current value stored at <code>{'{{variables.<name>}}'}</code>.</p>
    </div>
  );
}

function CacheForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'get'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'get', label: 'Get' }, { value: 'set', label: 'Set' }, { value: 'delete', label: 'Delete' }, { value: 'exists', label: 'Exists' }]} />
      <TextField label="Cache Key" value={config.key ?? ''} onChange={(value) => updateConfig(config, onChange, 'key', value)} placeholder="workflow:customer:{{variables.customerId}}" />
      <TextField label="TTL (seconds)" value={config.ttl ?? 300} onChange={(value) => updateConfig(config, onChange, 'ttl', value)} type="number" placeholder="300" />
      <AreaField label="Value" value={config.value ?? ''} onChange={(value) => updateConfig(config, onChange, 'value', value)} placeholder='{"status":"cached"}' />
    </div>
  );
}

function QueueForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'enqueue'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'enqueue', label: 'Enqueue' }, { value: 'dequeue', label: 'Dequeue' }, { value: 'peek', label: 'Peek' }, { value: 'length', label: 'Length' }]} />
      <TextField label="Queue Name" value={config.queue ?? ''} onChange={(value) => updateConfig(config, onChange, 'queue', value)} placeholder="jobs:pending" />
      <SelectField label="Direction" value={config.direction ?? 'right'} onChange={(value) => updateConfig(config, onChange, 'direction', value)} options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]} />
      <AreaField label="Value" value={config.value ?? ''} onChange={(value) => updateConfig(config, onChange, 'value', value)} placeholder='{"jobId":"123"}' />
    </div>
  );
}

function CryptoForm({ config, onChange }: NodeFormProps) {
  const operation = config.operation ?? 'encrypt';

  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={operation} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'encrypt', label: 'AES Encrypt' }, { value: 'decrypt', label: 'AES Decrypt' }, { value: 'sign', label: 'RSA Sign' }, { value: 'verify', label: 'RSA Verify' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <TextField label="Secret / Key" value={config.secret ?? config.key ?? ''} onChange={(value) => updateConfig(config, onChange, 'secret', value)} placeholder="my-secret-key" />
      <TextField label="Salt" value={config.salt ?? ''} onChange={(value) => updateConfig(config, onChange, 'salt', value)} placeholder="workflow-node-salt" />
      {(operation === 'sign' || operation === 'verify') ? (
        <AreaField label={operation === 'sign' ? 'Private Key (PEM)' : 'Public Key (PEM)'} value={operation === 'sign' ? config.privateKey ?? '' : config.publicKey ?? ''} onChange={(value) => updateConfig(config, onChange, operation === 'sign' ? 'privateKey' : 'publicKey', value)} placeholder="-----BEGIN KEY-----" />
      ) : null}
      {operation === 'verify' ? <AreaField label="Signature" value={config.signature ?? ''} onChange={(value) => updateConfig(config, onChange, 'signature', value)} placeholder="base64-signature" /> : null}
      <AreaField label="Value Override (optional)" value={config.value ?? ''} onChange={(value) => updateConfig(config, onChange, 'value', value)} placeholder="Sensitive payload" />
    </div>
  );
}

function HashForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Algorithm" value={config.algorithm ?? 'sha256'} onChange={(value) => updateConfig(config, onChange, 'algorithm', value)} options={[{ value: 'md5', label: 'MD5' }, { value: 'sha1', label: 'SHA1' }, { value: 'sha256', label: 'SHA256' }, { value: 'sha512', label: 'SHA512' }]} />
      <SelectField label="Encoding" value={config.encoding ?? 'hex'} onChange={(value) => updateConfig(config, onChange, 'encoding', value)} options={[{ value: 'hex', label: 'Hex' }, { value: 'base64', label: 'Base64' }]} />
    </div>
  );
}

function UuidForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="UUID Version" value={config.version ?? 'v4'} onChange={(value) => updateConfig(config, onChange, 'version', value)} options={[{ value: 'v4', label: 'UUID v4' }, { value: 'v7', label: 'UUID v7' }]} />
    </div>
  );
}

function DateForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'format'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'now', label: 'Current Time' }, { value: 'parse', label: 'Parse' }, { value: 'format', label: 'Format' }, { value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }, { value: 'diff', label: 'Difference' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="timestamp" />
      <TextField label="Input Format (optional)" value={config.inputFormat ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputFormat', value)} placeholder="yyyy-MM-dd" />
      <TextField label="Output Format" value={config.format ?? ''} onChange={(value) => updateConfig(config, onChange, 'format', value)} placeholder="yyyy-MM-dd'T'HH:mm:ssXXX" />
      <TextField label="Amount" value={config.amount ?? 1} onChange={(value) => updateConfig(config, onChange, 'amount', value)} type="number" placeholder="1" />
      <SelectField label="Unit" value={config.unit ?? 'days'} onChange={(value) => updateConfig(config, onChange, 'unit', value)} options={[{ value: 'milliseconds', label: 'Milliseconds' }, { value: 'seconds', label: 'Seconds' }, { value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }, { value: 'years', label: 'Years' }]} />
      <TextField label="Compare To (for diff)" value={config.compareTo ?? ''} onChange={(value) => updateConfig(config, onChange, 'compareTo', value)} placeholder="2025-01-01T00:00:00Z" />
    </div>
  );
}

function MathForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'round'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'round', label: 'Round' }, { value: 'floor', label: 'Floor' }, { value: 'ceil', label: 'Ceil' }, { value: 'abs', label: 'Absolute' }, { value: 'pow', label: 'Power' }, { value: 'randomRange', label: 'Random Range' }, { value: 'stats', label: 'Statistics' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="numbers" />
      <TextField label="Exponent" value={config.exponent ?? 2} onChange={(value) => updateConfig(config, onChange, 'exponent', value)} type="number" placeholder="2" />
      <TextField label="Min" value={config.min ?? 0} onChange={(value) => updateConfig(config, onChange, 'min', value)} type="number" placeholder="0" />
      <TextField label="Max" value={config.max ?? 100} onChange={(value) => updateConfig(config, onChange, 'max', value)} type="number" placeholder="100" />
    </div>
  );
}

function StringForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'trim'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'trim', label: 'Trim' }, { value: 'upper', label: 'Uppercase' }, { value: 'lower', label: 'Lowercase' }, { value: 'replace', label: 'Replace' }, { value: 'split', label: 'Split' }, { value: 'join', label: 'Join' }, { value: 'pad', label: 'Pad' }, { value: 'truncate', label: 'Truncate' }, { value: 'slugify', label: 'Slugify' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <TextField label="Pattern" value={config.pattern ?? ''} onChange={(value) => updateConfig(config, onChange, 'pattern', value)} placeholder="foo" />
      <TextField label="Replacement" value={config.replacement ?? ''} onChange={(value) => updateConfig(config, onChange, 'replacement', value)} placeholder="bar" />
      <TextField label="Delimiter" value={config.delimiter ?? ''} onChange={(value) => updateConfig(config, onChange, 'delimiter', value)} placeholder="," />
      <TextField label="Length" value={config.length ?? ''} onChange={(value) => updateConfig(config, onChange, 'length', value)} type="number" placeholder="50" />
      <TextField label="Fill / Suffix" value={config.fill ?? config.suffix ?? ''} onChange={(value) => updateConfig(config, onChange, 'fill', value)} placeholder="..." />
      <SelectField label="Direction" value={config.direction ?? 'end'} onChange={(value) => updateConfig(config, onChange, 'direction', value)} options={[{ value: 'start', label: 'Start' }, { value: 'end', label: 'End' }]} />
    </div>
  );
}

function ValidatorForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Validator" value={config.validator ?? 'required'} onChange={(value) => updateConfig(config, onChange, 'validator', value)} options={[{ value: 'required', label: 'Required' }, { value: 'email', label: 'Email' }, { value: 'url', label: 'URL' }, { value: 'uuid', label: 'UUID' }, { value: 'creditCard', label: 'Credit Card' }, { value: 'json', label: 'JSON' }, { value: 'jsonSchema', label: 'JSON Schema' }, { value: 'regex', label: 'Regex' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <TextField label="Pattern" value={config.pattern ?? ''} onChange={(value) => updateConfig(config, onChange, 'pattern', value)} placeholder="^[A-Z]+$" />
      <AreaField label="Schema (for JSON Schema validator)" value={config.schema ?? ''} onChange={(value) => updateConfig(config, onChange, 'schema', value)} placeholder='{"type":"object","required":["email"]}' />
    </div>
  );
}

function ParserForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Parse Type" value={config.operation ?? 'number'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'date', label: 'Date' }, { value: 'json', label: 'JSON' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <TextField label="Input Format (for dates)" value={config.inputFormat ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputFormat', value)} placeholder="yyyy-MM-dd" />
    </div>
  );
}

function TemplateForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Template" value={config.template ?? ''} onChange={(value) => updateConfig(config, onChange, 'template', value)} placeholder="Hello {{variables.customerName}}, your order {{input.orderId}} is ready." helper="Use {{variable}} or nested paths like {{input.customer.email}} for template interpolation." />
    </div>
  );
}

function RandomForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SelectField label="Operation" value={config.operation ?? 'number'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'number', label: 'Random Number' }, { value: 'string', label: 'Random String' }, { value: 'pick', label: 'Pick From Array' }, { value: 'shuffle', label: 'Shuffle Array' }]} />
      <TextField label="Min" value={config.min ?? 0} onChange={(value) => updateConfig(config, onChange, 'min', value)} type="number" placeholder="0" />
      <TextField label="Max" value={config.max ?? 100} onChange={(value) => updateConfig(config, onChange, 'max', value)} type="number" placeholder="100" />
      <TextField label="Length" value={config.length ?? 16} onChange={(value) => updateConfig(config, onChange, 'length', value)} type="number" placeholder="16" />
      <TextField label="Alphabet" value={config.alphabet ?? ''} onChange={(value) => updateConfig(config, onChange, 'alphabet', value)} placeholder="abc123XYZ" />
      <AreaField label="Values (JSON array)" value={config.values ?? ''} onChange={(value) => updateConfig(config, onChange, 'values', value)} placeholder='["red","blue","green"]' />
    </div>
  );
}

export const utilityForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.UTILITY_DELAY]: DelayForm,
  [NodeType.UTILITY_LOG]: LogForm,
  [NodeType.UTILITY_VARIABLE]: SetVariableForm,
  [NodeType.UTILITY_GET_VARIABLE]: GetVariableForm,
  [NodeType.UTILITY_CACHE]: CacheForm,
  [NodeType.UTILITY_QUEUE]: QueueForm,
  [NodeType.UTILITY_CRYPTO]: CryptoForm,
  [NodeType.UTILITY_HASH]: HashForm,
  [NodeType.UTILITY_UUID]: UuidForm,
  [NodeType.UTILITY_DATE]: DateForm,
  [NodeType.UTILITY_MATH]: MathForm,
  [NodeType.UTILITY_STRING]: StringForm,
  [NodeType.UTILITY_VALIDATOR]: ValidatorForm,
  [NodeType.UTILITY_PARSER]: ParserForm,
  [NodeType.UTILITY_TEMPLATE]: TemplateForm,
  [NodeType.UTILITY_RANDOM]: RandomForm,
};
