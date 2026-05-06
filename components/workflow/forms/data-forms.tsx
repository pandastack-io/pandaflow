'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { ComponentType } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type DataFormComponent = ComponentType<NodeFormProps>;

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function CheckboxRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-normal">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      <span>{label}</span>
    </label>
  );
}

function InfoPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function SourceFields({
  config,
  onChange,
  includeHeaders,
}: {
  config: any;
  onChange: (config: any) => void;
  includeHeaders?: boolean;
}) {
  const sourceType = config.sourceType || 'url';

  return (
    <>
      <div>
        <Label htmlFor="data-source-type">Source</Label>
        <Select value={sourceType} onValueChange={(value) => updateConfig(config, onChange, 'sourceType', value)}>
          <SelectTrigger id="data-source-type">
            <SelectValue placeholder="Source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="url">URL</SelectItem>
            <SelectItem value="content">Inline Content</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {sourceType === 'url' ? (
        <div>
          <Label htmlFor="data-url">URL</Label>
          <Input
            id="data-url"
            value={config.url || ''}
            onChange={(event) => updateConfig(config, onChange, 'url', event.target.value)}
            placeholder="https://example.com/data.json"
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="data-content">Inline Content</Label>
          <Textarea
            id="data-content"
            value={config.content || ''}
            onChange={(event) => updateConfig(config, onChange, 'content', event.target.value)}
            placeholder="Paste raw text or base64 payload"
            className="min-h-[140px] font-mono text-xs"
          />
        </div>
      )}
      {includeHeaders && (
        <div>
          <Label htmlFor="data-headers">Request Headers (JSON)</Label>
          <Textarea
            id="data-headers"
            value={config.headers || ''}
            onChange={(event) => updateConfig(config, onChange, 'headers', event.target.value)}
            placeholder='{"Authorization":"Bearer {{token}}"}'
            className="min-h-[100px] font-mono text-xs"
          />
        </div>
      )}
    </>
  );
}

function CsvReadForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="CSV reader" lines={['Reads CSV from a URL or inline content and returns rows, headers, and count.']} />
      <SourceFields config={config} onChange={onChange} includeHeaders />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="csv-delimiter">Delimiter</Label>
          <Input id="csv-delimiter" value={config.delimiter || ','} onChange={(event) => updateConfig(config, onChange, 'delimiter', event.target.value)} placeholder="," />
        </div>
        <div>
          <Label htmlFor="csv-limit">Row Limit</Label>
          <Input id="csv-limit" type="number" value={config.limit || ''} onChange={(event) => updateConfig(config, onChange, 'limit', event.target.value ? Number(event.target.value) : '')} placeholder="1000" />
        </div>
      </div>
      <CheckboxRow
        id="csv-has-headers"
        label="First row contains headers"
        checked={config.hasHeaders !== false}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'hasHeaders', checked)}
      />
    </div>
  );
}

function JsonReadForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="JSON reader" lines={['Fetches or parses JSON and can apply JSONPath to extract a subset of the payload.']} />
      <SourceFields config={config} onChange={onChange} includeHeaders />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="json-path">JSONPath</Label>
          <Input id="json-path" value={config.jsonPath || ''} onChange={(event) => updateConfig(config, onChange, 'jsonPath', event.target.value)} placeholder="$.items[*]" />
        </div>
        <div>
          <Label htmlFor="json-timeout">Timeout (ms)</Label>
          <Input id="json-timeout" type="number" value={config.timeout || 30000} onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))} />
        </div>
      </div>
      <div>
        <Label htmlFor="json-input-variable">Input Variable (fallback)</Label>
        <Input id="json-input-variable" value={config.inputVariable || 'input'} onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)} placeholder="input" />
      </div>
    </div>
  );
}

function XmlReadForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="XML reader" lines={['Fetches or parses XML and converts it to a nested JavaScript object with attributes and text nodes.']} />
      <SourceFields config={config} onChange={onChange} includeHeaders />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="xml-timeout">Timeout (ms)</Label>
          <Input id="xml-timeout" type="number" value={config.timeout || 30000} onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))} />
        </div>
        <div>
          <Label htmlFor="xml-input-variable">Input Variable (fallback)</Label>
          <Input id="xml-input-variable" value={config.inputVariable || 'input'} onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)} placeholder="input" />
        </div>
      </div>
    </div>
  );
}

function YamlReadForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="YAML reader" lines={['Parses simple YAML from a URL, inline content, or upstream input into an object.']} />
      <SourceFields config={config} onChange={onChange} includeHeaders />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="yaml-timeout">Timeout (ms)</Label>
          <Input id="yaml-timeout" type="number" value={config.timeout || 30000} onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))} />
        </div>
        <div>
          <Label htmlFor="yaml-input-variable">Input Variable (fallback)</Label>
          <Input id="yaml-input-variable" value={config.inputVariable || 'input'} onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)} placeholder="input" />
        </div>
      </div>
      <CheckboxRow
        id="yaml-preserve"
        label="Preserve raw source in downstream metadata"
        checked={Boolean(config.preserveRaw)}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'preserveRaw', checked)}
      />
    </div>
  );
}

function ExcelReadForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Excel reader" lines={['Fetches workbook bytes and returns base64 plus metadata. Full sheet parsing requires a downstream xlsx-capable service or node.']} />
      <SourceFields config={config} onChange={onChange} includeHeaders />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="excel-sheet">Preferred Sheet Name</Label>
          <Input id="excel-sheet" value={config.sheetName || ''} onChange={(event) => updateConfig(config, onChange, 'sheetName', event.target.value)} placeholder="Sheet1" />
        </div>
        <div>
          <Label htmlFor="excel-timeout">Timeout (ms)</Label>
          <Input id="excel-timeout" type="number" value={config.timeout || 30000} onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))} />
        </div>
      </div>
      <div>
        <Label htmlFor="excel-input-variable">Input Variable (fallback)</Label>
        <Input id="excel-input-variable" value={config.inputVariable || 'input'} onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)} placeholder="input" />
      </div>
    </div>
  );
}

function DocumentExtractorForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Document extractor" lines={["Sends document text and your target JSON schema to an LLM, then returns parsed structured data."]} />
      <div>
        <Label htmlFor="document-extractor-model">Model</Label>
        <Input id="document-extractor-model" value={config.model || 'gpt-4o'} onChange={(event) => updateConfig(config, onChange, 'model', event.target.value)} placeholder="gpt-4o" />
      </div>
      <div>
        <Label htmlFor="document-extractor-schema">Schema (JSON Schema string)</Label>
        <Textarea
          id="document-extractor-schema"
          value={config.schema || ''}
          onChange={(event) => updateConfig(config, onChange, 'schema', event.target.value)}
          placeholder={`{
  "type": "object",
  "properties": {
    "invoiceNumber": { "type": "string" },
    "total": { "type": "number" }
  }
}`}
          className="min-h-[180px] font-mono text-xs"
        />
      </div>
      <div>
        <Label htmlFor="document-extractor-instruction">Instruction</Label>
        <Textarea
          id="document-extractor-instruction"
          value={config.instruction || ''}
          onChange={(event) => updateConfig(config, onChange, 'instruction', event.target.value)}
          placeholder="Optional extraction guidance"
          className="min-h-[100px]"
        />
      </div>
    </div>
  );
}

function ListOperatorForm({ config, onChange }: NodeFormProps) {
  const operation = config.operation || 'filter';

  return (
    <div className="space-y-3">
      <InfoPanel title="List operator" lines={["Works on array input from upstream nodes.", "Expressions can use item, index, array, and context."]} />
      <div>
        <Label htmlFor="list-operation">Operation</Label>
        <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
          <SelectTrigger id="list-operation"><SelectValue placeholder="Select operation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="filter">Filter</SelectItem>
            <SelectItem value="map">Map</SelectItem>
            <SelectItem value="sort">Sort</SelectItem>
            <SelectItem value="slice">Slice</SelectItem>
            <SelectItem value="unique">Unique</SelectItem>
            <SelectItem value="count">Count</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {operation === 'filter' ? (
        <div>
          <Label htmlFor="list-filter-expression">Filter Expression</Label>
          <Input id="list-filter-expression" value={config.filterExpression || ''} onChange={(event) => updateConfig(config, onChange, 'filterExpression', event.target.value)} placeholder="item.value > 0 && item.active" />
        </div>
      ) : null}
      {operation === 'map' ? (
        <div>
          <Label htmlFor="list-map-expression">Map Expression</Label>
          <Input id="list-map-expression" value={config.mapExpression || ''} onChange={(event) => updateConfig(config, onChange, 'mapExpression', event.target.value)} placeholder="item.name" />
        </div>
      ) : null}
      {operation === 'sort' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="list-sort-key">Sort Key</Label>
            <Input id="list-sort-key" value={config.sortKey || ''} onChange={(event) => updateConfig(config, onChange, 'sortKey', event.target.value)} placeholder="item.createdAt" />
          </div>
          <div>
            <Label htmlFor="list-sort-order">Sort Order</Label>
            <Select value={config.sortOrder || 'asc'} onValueChange={(value) => updateConfig(config, onChange, 'sortOrder', value)}>
              <SelectTrigger id="list-sort-order"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      {operation === 'slice' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="list-slice-start">Slice Start</Label>
            <Input id="list-slice-start" type="number" value={config.sliceStart ?? 0} onChange={(event) => updateConfig(config, onChange, 'sliceStart', event.target.value === '' ? '' : Number(event.target.value))} />
          </div>
          <div>
            <Label htmlFor="list-slice-end">Slice End</Label>
            <Input id="list-slice-end" type="number" value={config.sliceEnd ?? ''} onChange={(event) => updateConfig(config, onChange, 'sliceEnd', event.target.value === '' ? '' : Number(event.target.value))} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VariableAggregatorForm({ config, onChange }: NodeFormProps) {
  const mode = config.mode || 'object';

  return (
    <div className="space-y-3">
      <InfoPanel title="Variable aggregator" lines={["Combines all incoming edge values into one object, array, or merged object.", "Object mode uses the provided keys in incoming edge order."]} />
      <div>
        <Label htmlFor="aggregator-mode">Mode</Label>
        <Select value={mode} onValueChange={(value) => updateConfig(config, onChange, 'mode', value)}>
          <SelectTrigger id="aggregator-mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="object">Object</SelectItem>
            <SelectItem value="array">Array</SelectItem>
            <SelectItem value="merge">Merge Objects</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'object' ? (
        <div>
          <Label htmlFor="aggregator-keys">Keys</Label>
          <Input
            id="aggregator-keys"
            value={Array.isArray(config.keys) ? config.keys.join(', ') : ''}
            onChange={(event) => updateConfig(config, onChange, 'keys', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))}
            placeholder="firstInput, secondInput"
          />
        </div>
      ) : null}
    </div>
  );
}

export const dataForms: Partial<Record<NodeType, DataFormComponent>> = {
  [NodeType.DATA_CSV_READ]: CsvReadForm,
  [NodeType.DATA_JSON_READ]: JsonReadForm,
  [NodeType.DATA_XML_READ]: XmlReadForm,
  [NodeType.DATA_YAML_READ]: YamlReadForm,
  [NodeType.DATA_EXCEL_READ]: ExcelReadForm,
  [NodeType.DATA_DOCUMENT_EXTRACTOR]: DocumentExtractorForm,
  [NodeType.DATA_LIST_OPERATOR]: ListOperatorForm,
  [NodeType.DATA_VARIABLE_AGGREGATOR]: VariableAggregatorForm,
};
