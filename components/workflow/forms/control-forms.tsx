/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Button } from '@/components/ui/button';
import { NodeFormProps } from './index';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExpressionInput } from '@/components/workflow/expression-input';

type GenericConfig = Record<string, any>;
type SelectOption = { value: string; label: string };
type WorkflowOption = { id: string; name: string };

function updateConfig(config: GenericConfig, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function addArrayItem(config: GenericConfig, onChange: (config: any) => void, key: string, value: any) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  onChange({ ...config, [key]: [...current, value] });
}

function updateArrayItem(config: GenericConfig, onChange: (config: any) => void, key: string, index: number, value: any) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  current[index] = value;
  onChange({ ...config, [key]: current });
}

function removeArrayItem(config: GenericConfig, onChange: (config: any) => void, key: string, index: number) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  current.splice(index, 1);
  onChange({ ...config, [key]: current });
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

function ToggleField({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <Label>{label}</Label>
      <Button type="button" variant={checked ? 'default' : 'outline'} size="sm" onClick={onToggle}>
        {checked ? 'Enabled' : 'Disabled'}
      </Button>
    </div>
  );
}

function ConditionForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Evaluation Type" value={config.evaluationType ?? 'expression'} onChange={(value) => updateConfig(config, onChange, 'evaluationType', value)} options={[{ value: 'expression', label: 'Expression' }, { value: 'javascript', label: 'JavaScript' }]} />
      <AreaField label="Condition Expression" value={config.condition ?? ''} onChange={(value) => updateConfig(config, onChange, 'condition', value)} placeholder="input.total > 1000 && variables.approved === true" helper="Return true to follow the true handle; false for the false handle." />
    </div>
  );
}

function SwitchForm({ config, onChange }: NodeFormProps) {
  const cases: any[] = Array.isArray(config.cases) ? config.cases : [];

  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Switch Expression" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="input.status" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Cases</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem(config, onChange, 'cases', { branchKey: `case_${cases.length + 1}`, label: `Case ${cases.length + 1}`, condition: '', value: '' })}>
            Add Case
          </Button>
        </div>
        {cases.map((entry, index) => (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <TextField label="Branch Handle" value={entry.branchKey ?? `case_${index + 1}`} onChange={(value) => updateArrayItem(config, onChange, 'cases', index, { ...entry, branchKey: value })} placeholder={`case_${index + 1}`} />
            <TextField label="Display Label" value={entry.label ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'cases', index, { ...entry, label: value })} placeholder={`Case ${index + 1}`} />
            <AreaField label="Condition" value={entry.condition ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'cases', index, { ...entry, condition: value })} placeholder="value === 'approved'" />
            <TextField label="Match Value" value={entry.value ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'cases', index, { ...entry, value })} placeholder="approved" />
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Edges should connect to the handle named <code>{entry.branchKey ?? `case_${index + 1}`}</code>.</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeArrayItem(config, onChange, 'cases', index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">A <code>default</code> output handle is always available when no case matches.</p>
      </div>
    </div>
  );
}

function LoopForm({ config, onChange }: NodeFormProps) {
  const loopType = config.loopType ?? 'forEach';

  return (
    <div className="space-y-4">
      <SelectField label="Loop Type" value={loopType} onChange={(value) => updateConfig(config, onChange, 'loopType', value)} options={[{ value: 'forEach', label: 'For Each' }, { value: 'while', label: 'While' }]} />
      <TextField label="Input Variable" value={config.inputVariable ?? config.arrayVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <TextField label="Item Variable Name" value={config.itemVariable ?? 'item'} onChange={(value) => updateConfig(config, onChange, 'itemVariable', value)} placeholder="item" />
      {loopType === 'while' ? (
        <AreaField label="Condition Expression" value={config.condition ?? ''} onChange={(value) => updateConfig(config, onChange, 'condition', value)} placeholder="current && current.hasMore === true" />
      ) : null}
      <TextField label="Max Iterations" value={config.maxIterations ?? 100} onChange={(value) => updateConfig(config, onChange, 'maxIterations', value)} type="number" placeholder="100" />
      <ToggleField label="Run Items in Parallel" checked={Boolean(config.parallel)} onToggle={() => updateConfig(config, onChange, 'parallel', !config.parallel)} />
      <TextField label="Batch Size" value={config.batchSize ?? 1} onChange={(value) => updateConfig(config, onChange, 'batchSize', value)} type="number" placeholder="10" />
    </div>
  );
}

function ForeachForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Array Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <TextField label="Item Variable Name" value={config.itemVariable ?? 'item'} onChange={(value) => updateConfig(config, onChange, 'itemVariable', value)} placeholder="item" />
      <ToggleField label="Parallel Execution" checked={Boolean(config.parallel)} onToggle={() => updateConfig(config, onChange, 'parallel', !config.parallel)} />
      <TextField label="Batch Size" value={config.batchSize ?? 1} onChange={(value) => updateConfig(config, onChange, 'batchSize', value)} type="number" placeholder="25" />
      <AreaField label="Per-item Expression (optional)" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="item => ({ id: item.id, status: 'processed' })" />
    </div>
  );
}

function WhileForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Condition Expression" value={config.condition ?? ''} onChange={(value) => updateConfig(config, onChange, 'condition', value)} placeholder="current.page < 10" />
      <AreaField label="Step Expression" value={config.stepExpression ?? ''} onChange={(value) => updateConfig(config, onChange, 'stepExpression', value)} placeholder="current => ({ ...current, page: current.page + 1 })" />
      <TextField label="Max Iterations" value={config.maxIterations ?? 100} onChange={(value) => updateConfig(config, onChange, 'maxIterations', value)} type="number" placeholder="100" />
    </div>
  );
}

function ParallelForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <p className="text-xs text-muted-foreground">All downstream nodes will be marked for concurrent fan-out execution.</p>
    </div>
  );
}

function SequenceForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <p className="text-xs text-muted-foreground">Downstream nodes will execute strictly in sequence.</p>
    </div>
  );
}

function ErrorForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Try Expression" value={config.tryExpression ?? ''} onChange={(value) => updateConfig(config, onChange, 'tryExpression', value)} placeholder="input => JSON.parse(input.payload)" />
      <TextField label="Error Variable Name" value={config.errorVariable ?? 'lastError'} onChange={(value) => updateConfig(config, onChange, 'errorVariable', value)} placeholder="lastError" />
      <ToggleField label="Re-throw Error" checked={Boolean(config.rethrow)} onToggle={() => updateConfig(config, onChange, 'rethrow', !config.rethrow)} />
      <AreaField label="Fallback Output" value={config.fallback ?? ''} onChange={(value) => updateConfig(config, onChange, 'fallback', value)} placeholder='{"status":"failed"}' />
    </div>
  );
}

function RetryForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Retry Expression" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="input => fetchResult(input.id)" />
      <TextField label="Max Attempts" value={config.maxAttempts ?? 3} onChange={(value) => updateConfig(config, onChange, 'maxAttempts', value)} type="number" placeholder="3" />
      <TextField label="Initial Delay (ms)" value={config.initialDelayMs ?? 500} onChange={(value) => updateConfig(config, onChange, 'initialDelayMs', value)} type="number" placeholder="500" />
      <TextField label="Max Delay (ms)" value={config.maxDelayMs ?? 10000} onChange={(value) => updateConfig(config, onChange, 'maxDelayMs', value)} type="number" placeholder="10000" />
      <TextField label="Retry On Message Contains" value={config.retryOnMessage ?? ''} onChange={(value) => updateConfig(config, onChange, 'retryOnMessage', value)} placeholder="429" />
    </div>
  );
}

function TimeoutForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <AreaField label="Timed Expression" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="input => longRunningTask(input)" />
      <TextField label="Timeout (ms)" value={config.timeoutMs ?? 30000} onChange={(value) => updateConfig(config, onChange, 'timeoutMs', value)} type="number" placeholder="30000" />
      <ToggleField label="Throw On Timeout" checked={config.throwOnTimeout !== false} onToggle={() => updateConfig(config, onChange, 'throwOnTimeout', !(config.throwOnTimeout !== false))} />
      <AreaField label="Fallback Output" value={config.fallback ?? ''} onChange={(value) => updateConfig(config, onChange, 'fallback', value)} placeholder='{"status":"timed_out"}' />
    </div>
  );
}

function HumanApprovalForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Approval Title" value={config.title ?? 'Approval Required'} onChange={(value) => updateConfig(config, onChange, 'title', value)} placeholder="Approval Required" />
      <AreaField label="Approval Message" value={config.message ?? 'Please review and approve or reject this step.'} onChange={(value) => updateConfig(config, onChange, 'message', value)} placeholder="Please review and approve or reject this step." helper="This message is shown in the editor banner while the workflow waits." />
      <TextField label="Timeout (minutes)" value={config.timeoutMinutes ?? 60} onChange={(value) => updateConfig(config, onChange, 'timeoutMinutes', value)} type="number" placeholder="60" />
      <TextField label="Notify Email (optional)" value={config.notifyEmail ?? ''} onChange={(value) => updateConfig(config, onChange, 'notifyEmail', value)} placeholder="approver@example.com" />
    </div>
  );
}

function SubWorkflowForm({ config, onChange, nodeId }: NodeFormProps) {
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows');
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to fetch workflows');
        }

        if (!isMounted) {
          return;
        }

        setWorkflows(
          (payload.data as Array<{ id: string; name: string }>).map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
          }))
        );
        setError(null);
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch workflows');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadWorkflows();

    return () => {
      isMounted = false;
    };
  }, []);

  const mappingEntries = useMemo(
    () => Object.entries((config.inputMapping ?? {}) as Record<string, string>),
    [config.inputMapping]
  );

  const updateMappingEntry = (index: number, nextKey: string, nextValue: string) => {
    const entries = [...mappingEntries];
    entries[index] = [nextKey, nextValue];
    updateConfig(
      config,
      onChange,
      'inputMapping',
      Object.fromEntries(entries.filter(([key]) => key.trim().length > 0))
    );
  };

  const addMappingEntry = () => {
    updateConfig(config, onChange, 'inputMapping', {
      ...(config.inputMapping ?? {}),
      [`input_${mappingEntries.length + 1}`]: '',
    });
  };

  const removeMappingEntry = (index: number) => {
    const entries = [...mappingEntries];
    entries.splice(index, 1);
    updateConfig(config, onChange, 'inputMapping', Object.fromEntries(entries));
  };

  return (
    <div className="space-y-4">
      <Field label="Workflow">
        <Select value={config.workflowId ?? ''} onValueChange={(value) => updateConfig(config, onChange, 'workflowId', value)} disabled={loading}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={loading ? 'Loading workflows...' : 'Select a workflow'} />
          </SelectTrigger>
          <SelectContent>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {!loading && workflows.length === 0 ? <p className="text-xs text-muted-foreground">No saved workflows available yet.</p> : null}
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Input Mapping</Label>
          <Button type="button" variant="outline" size="sm" onClick={addMappingEntry}>
            Add Mapping
          </Button>
        </div>

        {mappingEntries.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
            Leave empty to forward the current node input as-is to the sub-workflow.
          </p>
        ) : null}

        {mappingEntries.map(([key, value], index) => (
          <div key={`${key}-${index}`} className="rounded-md border p-3 space-y-3">
            <TextField label="Input Key" value={key} onChange={(nextKey) => updateMappingEntry(index, nextKey, value)} placeholder="customerId" />
            <ExpressionField label="Source Value" value={value} onChange={(nextValue) => updateMappingEntry(index, key, nextValue)} placeholder="{{input.customer.id}}" nodeId={nodeId} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeMappingEntry(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">Map keys that the selected sub-workflow expects. Expression values can reference upstream outputs or workflow variables.</p>
      </div>
    </div>
  );
}

export const controlForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.CONTROL_CONDITION]: ConditionForm,
  [NodeType.CONTROL_SWITCH]: SwitchForm,
  [NodeType.CONTROL_LOOP]: LoopForm,
  [NodeType.CONTROL_FOREACH]: ForeachForm,
  [NodeType.CONTROL_WHILE]: WhileForm,
  [NodeType.CONTROL_PARALLEL]: ParallelForm,
  [NodeType.CONTROL_SEQUENCE]: SequenceForm,
  [NodeType.CONTROL_ERROR]: ErrorForm,
  [NodeType.CONTROL_RETRY]: RetryForm,
  [NodeType.CONTROL_TIMEOUT]: TimeoutForm,
  [NodeType.HUMAN_APPROVAL]: HumanApprovalForm,
  [NodeType.CONTROL_SUB_WORKFLOW]: SubWorkflowForm,
};
