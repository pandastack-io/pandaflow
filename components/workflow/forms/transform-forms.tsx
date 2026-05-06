/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExpressionInput, ExpressionTextarea } from '@/components/workflow/expression-input';
import { NodeFormProps } from './index';

type GenericConfig = Record<string, any>;

type SelectOption = { value: string; label: string };

function updateConfig(config: GenericConfig, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function updateArrayItem(
  config: GenericConfig,
  onChange: (config: any) => void,
  key: string,
  index: number,
  value: any
) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  current[index] = value;
  onChange({ ...config, [key]: current });
}

function removeArrayItem(config: GenericConfig, onChange: (config: any) => void, key: string, index: number) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  current.splice(index, 1);
  onChange({ ...config, [key]: current });
}

function addArrayItem(config: GenericConfig, onChange: (config: any) => void, key: string, value: any) {
  const current = Array.isArray(config[key]) ? [...config[key]] : [];
  onChange({ ...config, [key]: [...current, value] });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  expression = false,
  nodeId,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  expression?: boolean;
  nodeId?: string;
}) {
  return (
    <Field label={label}>
      {expression ? (
        <ExpressionInput value={String(value ?? '')} nodeId={nodeId} onValueChange={onChange} placeholder={placeholder} className="h-8 text-sm" />
      ) : (
        <Input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
      )}
    </Field>
  );
}

function AreaField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
  helper,
  expression = false,
  nodeId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  helper?: string;
  expression?: boolean;
  nodeId?: string;
}) {
  return (
    <Field label={label}>
      {expression ? (
        <ExpressionTextarea
          value={value ?? ''}
          nodeId={nodeId}
          onValueChange={onChange}
          placeholder={placeholder}
          className={mono ? 'min-h-[100px] font-mono text-xs' : 'min-h-[100px] text-sm'}
        />
      ) : (
        <Textarea
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={mono ? 'min-h-[100px] font-mono text-xs' : 'min-h-[100px] text-sm'}
        />
      )}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
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

function DataTransformForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField
        label="Input Variable"
        value={config.inputVariable ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)}
        placeholder="input"
      />
      <SelectField
        label="Transform Type"
        value={config.transformType ?? 'javascript'}
        onChange={(value) => updateConfig(config, onChange, 'transformType', value)}
        options={[
          { value: 'javascript', label: 'JavaScript' },
          { value: 'jsonpath', label: 'JSONPath' },
          { value: 'jmespath', label: 'JMESPath' },
        ]}
      />
      <AreaField
        label="Transformation"
        value={config.transformation ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'transformation', value)}
        placeholder="item => ({ id: item.id, score: item.value * 2 })"
        mono
        expression
        nodeId={nodeId}
      />
      <AreaField
        label="Input Mapping (JSON)"
        value={config.inputMapping ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'inputMapping', value)}
        placeholder='{"currentUser": "$.user", "items": "$.items"}'
        mono
        expression
        nodeId={nodeId}
      />
      <AreaField
        label="Output Mapping (JSON)"
        value={config.outputMapping ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'outputMapping', value)}
        placeholder='{"result": "$.value"}'
        mono
        expression
        nodeId={nodeId}
      />
    </div>
  );
}

function FilterForm({ config, onChange, nodeId }: NodeFormProps) {
  const conditions: any[] = Array.isArray(config.conditions) ? config.conditions : [];

  return (
    <div className="space-y-4">
      <TextField
        label="Input Variable"
        value={config.inputVariable ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)}
        placeholder="items"
      />
      <SelectField
        label="Condition Logic"
        value={config.logic ?? 'AND'}
        onChange={(value) => updateConfig(config, onChange, 'logic', value)}
        options={[
          { value: 'AND', label: 'AND' },
          { value: 'OR', label: 'OR' },
        ]}
      />
      <AreaField
        label="Expression (optional)"
        value={config.expression ?? ''}
        onChange={(value) => updateConfig(config, onChange, 'expression', value)}
        placeholder="item.status === 'active' && item.score > 50"
        mono
        expression
        nodeId={nodeId}
      />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Conditions</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addArrayItem(config, onChange, 'conditions', { field: '', operator: 'eq', value: '' })}
          >
            Add Condition
          </Button>
        </div>
        {conditions.map((condition, index) => (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <TextField
              label="Field"
              value={condition.field ?? ''}
              onChange={(value) => updateArrayItem(config, onChange, 'conditions', index, { ...condition, field: value })}
              placeholder="status"
            />
            <SelectField
              label="Operator"
              value={condition.operator ?? 'eq'}
              onChange={(value) => updateArrayItem(config, onChange, 'conditions', index, { ...condition, operator: value })}
              options={[
                { value: 'eq', label: 'Equals' },
                { value: 'neq', label: 'Not Equals' },
                { value: 'gt', label: 'Greater Than' },
                { value: 'gte', label: 'Greater Than or Equal' },
                { value: 'lt', label: 'Less Than' },
                { value: 'lte', label: 'Less Than or Equal' },
                { value: 'contains', label: 'Contains' },
                { value: 'regex', label: 'Regex' },
              ]}
            />
            <TextField
              label="Value"
              value={condition.value ?? ''}
              onChange={(value) => updateArrayItem(config, onChange, 'conditions', index, { ...condition, value })}
              placeholder="active"
            />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeArrayItem(config, onChange, 'conditions', index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <AreaField label="Map Expression" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="item => ({ id: item.id, label: item.name })" mono expression nodeId={nodeId} />
    </div>
  );
}

function ReduceForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <AreaField label="Reduce Expression" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="(acc, item) => acc + item.value" mono expression nodeId={nodeId} />
      <AreaField label="Initial Value" value={config.initialValue ?? ''} onChange={(value) => updateConfig(config, onChange, 'initialValue', value)} placeholder="0" mono expression nodeId={nodeId} />
    </div>
  );
}

function AggregateForm({ config, onChange }: NodeFormProps) {
  const aggregations: any[] = Array.isArray(config.aggregations) ? config.aggregations : [];

  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <TextField label="Group By Fields" value={config.groupBy ?? ''} onChange={(value) => updateConfig(config, onChange, 'groupBy', value)} placeholder="team, region" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Aggregations</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem(config, onChange, 'aggregations', { field: '', function: 'sum', alias: '' })}>
            Add Aggregation
          </Button>
        </div>
        {aggregations.map((aggregation, index) => (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <TextField label="Field" value={aggregation.field ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'aggregations', index, { ...aggregation, field: value })} placeholder="amount" />
            <SelectField
              label="Function"
              value={aggregation.function ?? 'sum'}
              onChange={(value) => updateArrayItem(config, onChange, 'aggregations', index, { ...aggregation, function: value })}
              options={[
                { value: 'sum', label: 'Sum' },
                { value: 'avg', label: 'Average' },
                { value: 'count', label: 'Count' },
                { value: 'min', label: 'Min' },
                { value: 'max', label: 'Max' },
                { value: 'first', label: 'First' },
                { value: 'last', label: 'Last' },
              ]}
            />
            <TextField label="Alias" value={aggregation.alias ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'aggregations', index, { ...aggregation, alias: value })} placeholder="totalAmount" />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeArrayItem(config, onChange, 'aggregations', index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField
        label="Split Mode"
        value={config.mode ?? 'delimiter'}
        onChange={(value) => updateConfig(config, onChange, 'mode', value)}
        options={[
          { value: 'delimiter', label: 'Delimiter' },
          { value: 'regex', label: 'Regex' },
          { value: 'lines', label: 'Lines' },
          { value: 'chars', label: 'Characters' },
          { value: 'chunk', label: 'Chunk' },
          { value: 'fixedLength', label: 'Fixed Length' },
        ]}
      />
      <TextField label="Delimiter / Pattern" value={config.delimiter ?? ''} onChange={(value) => updateConfig(config, onChange, 'delimiter', value)} placeholder="," />
      <TextField label="Chunk Size" value={config.chunkSize ?? ''} onChange={(value) => updateConfig(config, onChange, 'chunkSize', value)} type="number" placeholder="10" />
    </div>
  );
}

function MergeForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="objects" />
      <SelectField
        label="Array Strategy"
        value={config.arrayStrategy ?? 'concat'}
        onChange={(value) => updateConfig(config, onChange, 'arrayStrategy', value)}
        options={[
          { value: 'concat', label: 'Concatenate Arrays' },
          { value: 'replace', label: 'Replace Arrays' },
        ]}
      />
      <AreaField label="Sources (JSON array, optional)" value={config.sources ?? ''} onChange={(value) => updateConfig(config, onChange, 'sources', value)} placeholder='["variables.base", "nodes.fetch.output"]' mono expression nodeId={nodeId} />
    </div>
  );
}

function SortForm({ config, onChange }: NodeFormProps) {
  const fields: any[] = Array.isArray(config.fields) ? config.fields : [];

  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Sort Fields</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem(config, onChange, 'fields', { field: '', direction: 'asc' })}>
            Add Sort Field
          </Button>
        </div>
        {fields.map((field, index) => (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <TextField label="Field Name" value={field.field ?? ''} onChange={(value) => updateArrayItem(config, onChange, 'fields', index, { ...field, field: value })} placeholder="createdAt" />
            <SelectField label="Direction" value={field.direction ?? 'asc'} onChange={(value) => updateArrayItem(config, onChange, 'fields', index, { ...field, direction: value })} options={[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeArrayItem(config, onChange, 'fields', index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DedupeForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="items" />
      <TextField label="Key Field" value={config.keyField ?? ''} onChange={(value) => updateConfig(config, onChange, 'keyField', value)} placeholder="id" />
      <SelectField label="Keep" value={config.keep ?? 'first'} onChange={(value) => updateConfig(config, onChange, 'keep', value)} options={[{ value: 'first', label: 'First Match' }, { value: 'last', label: 'Last Match' }]} />
      <AreaField label="Key Expression (optional)" value={config.expression ?? ''} onChange={(value) => updateConfig(config, onChange, 'expression', value)} placeholder="item => `${item.type}:${item.id}`" mono expression nodeId={nodeId} />
    </div>
  );
}

function JsonForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Operation" value={config.operation ?? 'parse'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'parse', label: 'Parse' }, { value: 'stringify', label: 'Stringify' }, { value: 'validate', label: 'Validate' }, { value: 'format', label: 'Format' }]} />
      <TextField label="Spacing" value={config.spacing ?? ''} onChange={(value) => updateConfig(config, onChange, 'spacing', value)} type="number" placeholder="2" />
    </div>
  );
}

function XmlForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Operation" value={config.operation ?? 'parse'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'parse', label: 'Parse XML' }, { value: 'stringify', label: 'Serialize XML' }, { value: 'validate', label: 'Validate XML' }]} />
      <TextField label="Root Name" value={config.rootName ?? ''} onChange={(value) => updateConfig(config, onChange, 'rootName', value)} placeholder="root" />
    </div>
  );
}

function CsvForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Operation" value={config.operation ?? 'parse'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'parse', label: 'Parse CSV' }, { value: 'stringify', label: 'Serialize CSV' }]} />
      <TextField label="Delimiter" value={config.delimiter ?? ''} onChange={(value) => updateConfig(config, onChange, 'delimiter', value)} placeholder="," />
      <SelectField label="Headers" value={String(config.headers ?? true)} onChange={(value) => updateConfig(config, onChange, 'headers', value === 'true')} options={[{ value: 'true', label: 'Use Headers' }, { value: 'false', label: 'No Headers' }]} />
    </div>
  );
}

function YamlForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="input" />
      <SelectField label="Operation" value={config.operation ?? 'parse'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'parse', label: 'Parse YAML' }, { value: 'stringify', label: 'Serialize YAML' }]} />
    </div>
  );
}

function HtmlForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="html" />
      <SelectField label="Operation" value={config.operation ?? 'extractText'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'extractText', label: 'Extract Text' }, { value: 'extractHtml', label: 'Extract HTML' }, { value: 'extractAttribute', label: 'Extract Attribute' }]} />
      <TextField label="CSS Selector" value={config.selector ?? ''} onChange={(value) => updateConfig(config, onChange, 'selector', value)} placeholder=".article-content" />
      <TextField label="Attribute" value={config.attribute ?? ''} onChange={(value) => updateConfig(config, onChange, 'attribute', value)} placeholder="href" />
      <SelectField label="Return All Matches" value={String(config.all ?? false)} onChange={(value) => updateConfig(config, onChange, 'all', value === 'true')} options={[{ value: 'false', label: 'First Match' }, { value: 'true', label: 'All Matches' }]} />
    </div>
  );
}

function RegexForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <TextField label="Input Variable" value={config.inputVariable ?? ''} onChange={(value) => updateConfig(config, onChange, 'inputVariable', value)} placeholder="text" />
      <SelectField label="Operation" value={config.operation ?? 'match'} onChange={(value) => updateConfig(config, onChange, 'operation', value)} options={[{ value: 'match', label: 'Match' }, { value: 'extract', label: 'Extract Groups' }, { value: 'replace', label: 'Replace' }, { value: 'split', label: 'Split' }, { value: 'test', label: 'Test' }]} />
      <TextField label="Pattern" value={config.pattern ?? ''} onChange={(value) => updateConfig(config, onChange, 'pattern', value)} placeholder="\\d+" />
      <TextField label="Flags" value={config.flags ?? ''} onChange={(value) => updateConfig(config, onChange, 'flags', value)} placeholder="g" />
      <TextField label="Replacement" value={config.replacement ?? ''} onChange={(value) => updateConfig(config, onChange, 'replacement', value)} placeholder="value" />
      <TextField label="Group Index" value={config.group ?? ''} onChange={(value) => updateConfig(config, onChange, 'group', value)} type="number" placeholder="1" />
    </div>
  );
}

export const transformForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.TRANSFORM_DATA]: DataTransformForm,
  [NodeType.TRANSFORM_FILTER]: FilterForm,
  [NodeType.TRANSFORM_MAP]: MapForm,
  [NodeType.TRANSFORM_REDUCE]: ReduceForm,
  [NodeType.TRANSFORM_AGGREGATE]: AggregateForm,
  [NodeType.TRANSFORM_SPLIT]: SplitForm,
  [NodeType.TRANSFORM_MERGE]: MergeForm,
  [NodeType.TRANSFORM_SORT]: SortForm,
  [NodeType.TRANSFORM_DEDUPE]: DedupeForm,
  [NodeType.TRANSFORM_JSON]: JsonForm,
  [NodeType.TRANSFORM_XML]: XmlForm,
  [NodeType.TRANSFORM_CSV]: CsvForm,
  [NodeType.TRANSFORM_YAML]: YamlForm,
  [NodeType.TRANSFORM_HTML]: HtmlForm,
  [NodeType.TRANSFORM_REGEX]: RegexForm,
};
