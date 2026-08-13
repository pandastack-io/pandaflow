'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { ComponentType } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type OutputFormComponent = ComponentType<NodeFormProps>;

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

function ResponseOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Response output" lines={['Returns a final response body, status code, content type, and headers.']} />
      <div>
        <Label htmlFor="response-status">Status Code</Label>
        <Input
          id="response-status"
          type="number"
          value={config.statusCode || 200}
          onChange={(event) => updateConfig(config, onChange, 'statusCode', Number(event.target.value))}
        />
      </div>
      <div>
        <Label htmlFor="response-content-type">Content Type</Label>
        <Input
          id="response-content-type"
          value={config.contentType || 'application/json'}
          onChange={(event) => updateConfig(config, onChange, 'contentType', event.target.value)}
          placeholder="application/json"
        />
      </div>
      <div>
        <Label htmlFor="response-headers">Headers (JSON)</Label>
        <Textarea
          id="response-headers"
          value={config.headers || ''}
          onChange={(event) => updateConfig(config, onChange, 'headers', event.target.value)}
          placeholder='{"Cache-Control":"no-store"}'
          className="min-h-[110px] font-mono text-xs"
        />
      </div>
    </div>
  );
}

function JsonOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="JSON output" lines={['Serializes incoming data as JSON and optionally validates against a schema.']} />
      <div>
        <Label htmlFor="json-input-variable">Input Variable</Label>
        <Input
          id="json-input-variable"
          value={config.inputVariable || 'input'}
          onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)}
          placeholder="input"
        />
      </div>
      <div>
        <Label htmlFor="json-schema">JSON Schema</Label>
        <Textarea
          id="json-schema"
          value={config.schema || ''}
          onChange={(event) => updateConfig(config, onChange, 'schema', event.target.value)}
          placeholder='{"type":"object","required":["id"]}'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxRow
          id="json-pretty"
          label="Pretty print"
          checked={config.pretty !== false}
          onCheckedChange={(checked) => updateConfig(config, onChange, 'pretty', checked)}
        />
        <div>
          <Label htmlFor="json-indent">Indent</Label>
          <Input
            id="json-indent"
            type="number"
            value={config.indent || 2}
            onChange={(event) => updateConfig(config, onChange, 'indent', Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

function FileOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="File output" lines={['Writes text or serialized JSON to disk using the configured path and encoding.']} />
      <div>
        <Label htmlFor="file-path">Path</Label>
        <Input
          id="file-path"
          value={config.path || ''}
          onChange={(event) => updateConfig(config, onChange, 'path', event.target.value)}
          placeholder="exports/output.json"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="file-encoding">Encoding</Label>
          <Select value={config.encoding || 'utf8'} onValueChange={(value) => updateConfig(config, onChange, 'encoding', value)}>
            <SelectTrigger id="file-encoding">
              <SelectValue placeholder="Encoding" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utf8">utf8</SelectItem>
              <SelectItem value="ascii">ascii</SelectItem>
              <SelectItem value="base64">base64</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="file-input-variable">Input Variable</Label>
          <Input
            id="file-input-variable"
            value={config.inputVariable || 'input'}
            onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)}
            placeholder="input"
          />
        </div>
      </div>
      <CheckboxRow
        id="file-append"
        label="Append instead of overwrite"
        checked={Boolean(config.append)}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'append', checked)}
      />
      <div>
        <Label htmlFor="file-content">Custom Content (optional)</Label>
        <Textarea
          id="file-content"
          value={config.content || ''}
          onChange={(event) => updateConfig(config, onChange, 'content', event.target.value)}
          placeholder="Leave blank to write the resolved input"
          className="min-h-[110px]"
        />
      </div>
    </div>
  );
}

function NotificationOutputForm({ config, onChange }: NodeFormProps) {
  const channels = Array.isArray(config.channels) ? config.channels : [];
  const toggleChannel = (channel: string) => {
    const next = channels.includes(channel) ? channels.filter((value: string) => value !== channel) : [...channels, channel];
    updateConfig(config, onChange, 'channels', next);
  };

  return (
    <div className="space-y-3">
      <InfoPanel title="Notification output" lines={['Logs a structured notification and can optionally fan out to a webhook.']} />
      <div>
        <Label htmlFor="notification-title">Title</Label>
        <Input
          id="notification-title"
          value={config.title || ''}
          onChange={(event) => updateConfig(config, onChange, 'title', event.target.value)}
          placeholder="Workflow completed"
        />
      </div>
      <div>
        <Label htmlFor="notification-message">Message</Label>
        <Textarea
          id="notification-message"
          value={config.message || ''}
          onChange={(event) => updateConfig(config, onChange, 'message', event.target.value)}
          placeholder="A new workflow event was processed."
          className="min-h-[110px]"
        />
      </div>
      <div>
        <Label htmlFor="notification-severity">Severity</Label>
        <Select value={config.severity || 'info'} onValueChange={(value) => updateConfig(config, onChange, 'severity', value)}>
          <SelectTrigger id="notification-severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Channels</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {['in_app', 'email', 'webhook'].map((channel) => (
            <CheckboxRow
              key={channel}
              id={`notification-${channel}`}
              label={channel}
              checked={channels.includes(channel)}
              onCheckedChange={() => toggleChannel(channel)}
            />
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="notification-webhook">Webhook URL</Label>
        <Input
          id="notification-webhook"
          value={config.webhookUrl || ''}
          onChange={(event) => updateConfig(config, onChange, 'webhookUrl', event.target.value)}
          placeholder="https://hooks.example.com/workflow"
        />
      </div>
    </div>
  );
}

function ExportOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Export output" lines={['Exports data as CSV, JSON, XML, or Excel-compatible HTML and returns a download payload.']} />
      <div>
        <Label htmlFor="export-format">Format</Label>
        <Select value={config.format || 'json'} onValueChange={(value) => updateConfig(config, onChange, 'format', value)}>
          <SelectTrigger id="export-format">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="xml">XML</SelectItem>
            <SelectItem value="excel">Excel</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="export-filename">Filename</Label>
          <Input
            id="export-filename"
            value={config.filename || ''}
            onChange={(event) => updateConfig(config, onChange, 'filename', event.target.value)}
            placeholder="report"
          />
        </div>
        <div>
          <Label htmlFor="export-root-name">XML Root Name</Label>
          <Input
            id="export-root-name"
            value={config.rootName || 'root'}
            onChange={(event) => updateConfig(config, onChange, 'rootName', event.target.value)}
            placeholder="root"
          />
        </div>
      </div>
      <CheckboxRow
        id="export-headers"
        label="Include headers when exporting tabular data"
        checked={config.includeHeaders !== false}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'includeHeaders', checked)}
      />
      <CheckboxRow
        id="export-pretty"
        label="Pretty print JSON exports"
        checked={config.pretty !== false}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'pretty', checked)}
      />
      <div>
        <Label htmlFor="export-base-url">Base Download URL (optional)</Label>
        <Input
          id="export-base-url"
          value={config.baseDownloadUrl || ''}
          onChange={(event) => updateConfig(config, onChange, 'baseDownloadUrl', event.target.value)}
          placeholder="https://downloads.example.com/exports"
        />
      </div>
    </div>
  );
}

function LogOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Structured log output" lines={['Writes a structured execution log entry for observability and audit trails.']} />
      <div>
        <Label htmlFor="log-level">Level</Label>
        <Select value={config.level || 'info'} onValueChange={(value) => updateConfig(config, onChange, 'level', value)}>
          <SelectTrigger id="log-level">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="log-message">Message</Label>
        <Textarea
          id="log-message"
          value={config.message || ''}
          onChange={(event) => updateConfig(config, onChange, 'message', event.target.value)}
          placeholder="Processed customer webhook"
          className="min-h-[110px]"
        />
      </div>
      <div>
        <Label htmlFor="log-fields">Additional Fields (JSON)</Label>
        <Textarea
          id="log-fields"
          value={config.fields || ''}
          onChange={(event) => updateConfig(config, onChange, 'fields', event.target.value)}
          placeholder='{"tenantId":"acme"}'
          className="min-h-[110px] font-mono text-xs"
        />
      </div>
    </div>
  );
}

function WebhookOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Webhook output" lines={['Posts the current payload to an external HTTP endpoint with retry and timeout controls.']} />
      <div>
        <Label htmlFor="out-webhook-url">Webhook URL</Label>
        <Input
          id="out-webhook-url"
          value={config.url || ''}
          onChange={(event) => updateConfig(config, onChange, 'url', event.target.value)}
          placeholder="https://hooks.example.com/workflow"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="out-webhook-method">Method</Label>
          <Select value={config.method || 'POST'} onValueChange={(value) => updateConfig(config, onChange, 'method', value)}>
            <SelectTrigger id="out-webhook-method">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="out-webhook-retries">Retries</Label>
          <Input
            id="out-webhook-retries"
            type="number"
            value={config.retries || 3}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="out-webhook-timeout">Timeout (ms)</Label>
        <Input
          id="out-webhook-timeout"
          type="number"
          value={config.timeout || 30000}
          onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
        />
      </div>
      <div>
        <Label htmlFor="out-webhook-headers">Headers (JSON)</Label>
        <Textarea
          id="out-webhook-headers"
          value={config.headers || ''}
          onChange={(event) => updateConfig(config, onChange, 'headers', event.target.value)}
          placeholder='{"X-Workflow-Key":"secret"}'
          className="min-h-[110px] font-mono text-xs"
        />
      </div>
      <div>
        <Label htmlFor="out-webhook-body">Custom Body (optional)</Label>
        <Textarea
          id="out-webhook-body"
          value={config.body || ''}
          onChange={(event) => updateConfig(config, onChange, 'body', event.target.value)}
          placeholder="Leave blank to POST the resolved input"
          className="min-h-[110px]"
        />
      </div>
    </div>
  );
}

function EmailOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Email output" lines={['Sends email via SendGrid when configured, otherwise falls back to SMTP environment settings.']} />
      <div>
        <Label htmlFor="email-provider">Provider</Label>
        <Select value={config.provider || 'auto'} onValueChange={(value) => updateConfig(config, onChange, 'provider', value)}>
          <SelectTrigger id="email-provider">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="sendgrid">SendGrid</SelectItem>
            <SelectItem value="smtp">SMTP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="email-from">From</Label>
          <Input id="email-from" value={config.from || ''} onChange={(event) => updateConfig(config, onChange, 'from', event.target.value)} placeholder="ops@example.com" />
        </div>
        <div>
          <Label htmlFor="email-to">To</Label>
          <Input id="email-to" value={config.to || ''} onChange={(event) => updateConfig(config, onChange, 'to', event.target.value)} placeholder="team@example.com" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="email-cc">CC</Label>
          <Input id="email-cc" value={config.cc || ''} onChange={(event) => updateConfig(config, onChange, 'cc', event.target.value)} placeholder="cc@example.com" />
        </div>
        <div>
          <Label htmlFor="email-bcc">BCC</Label>
          <Input id="email-bcc" value={config.bcc || ''} onChange={(event) => updateConfig(config, onChange, 'bcc', event.target.value)} placeholder="audit@example.com" />
        </div>
      </div>
      <div>
        <Label htmlFor="email-subject">Subject</Label>
        <Input id="email-subject" value={config.subject || ''} onChange={(event) => updateConfig(config, onChange, 'subject', event.target.value)} placeholder="Workflow update" />
      </div>
      <div>
        <Label htmlFor="email-text">Text Body</Label>
        <Textarea id="email-text" value={config.textBody || ''} onChange={(event) => updateConfig(config, onChange, 'textBody', event.target.value)} className="min-h-[110px]" />
      </div>
      <div>
        <Label htmlFor="email-html">HTML Body</Label>
        <Textarea id="email-html" value={config.htmlBody || ''} onChange={(event) => updateConfig(config, onChange, 'htmlBody', event.target.value)} className="min-h-[110px] font-mono text-xs" />
      </div>
    </div>
  );
}

function StorageOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Storage output" lines={['Uploads the resolved payload to an S3-compatible bucket using Signature V4.']} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="storage-bucket">Bucket</Label>
          <Input id="storage-bucket" value={config.bucket || ''} onChange={(event) => updateConfig(config, onChange, 'bucket', event.target.value)} placeholder="workflow-exports" />
        </div>
        <div>
          <Label htmlFor="storage-region">Region</Label>
          <Input id="storage-region" value={config.region || 'us-east-1'} onChange={(event) => updateConfig(config, onChange, 'region', event.target.value)} placeholder="us-east-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="storage-endpoint">Endpoint (optional)</Label>
        <Input id="storage-endpoint" value={config.endpoint || ''} onChange={(event) => updateConfig(config, onChange, 'endpoint', event.target.value)} placeholder="https://s3.amazonaws.com" />
      </div>
      <div>
        <Label htmlFor="storage-key">Object Key</Label>
        <Input id="storage-key" value={config.key || ''} onChange={(event) => updateConfig(config, onChange, 'key', event.target.value)} placeholder="exports/{{executionId}}.json" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="storage-content-type">Content Type</Label>
          <Input id="storage-content-type" value={config.contentType || 'application/json'} onChange={(event) => updateConfig(config, onChange, 'contentType', event.target.value)} />
        </div>
        <div>
          <Label htmlFor="storage-acl">ACL</Label>
          <Input id="storage-acl" value={config.acl || ''} onChange={(event) => updateConfig(config, onChange, 'acl', event.target.value)} placeholder="private" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="storage-access-key">Access Key ID</Label>
          <Input id="storage-access-key" value={config.accessKeyId || ''} onChange={(event) => updateConfig(config, onChange, 'accessKeyId', event.target.value)} placeholder="AKIA..." />
        </div>
        <div>
          <Label htmlFor="storage-secret-key">Secret Access Key</Label>
          <Input id="storage-secret-key" type="password" value={config.secretAccessKey || ''} onChange={(event) => updateConfig(config, onChange, 'secretAccessKey', event.target.value)} placeholder="••••••••"  autoComplete="new-password" />
        </div>
      </div>
    </div>
  );
}

function StreamOutputForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel title="Stream output" lines={['Marks the result for SSE streaming with event, id, retry, and payload metadata.']} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="stream-event">Event Name</Label>
          <Input id="stream-event" value={config.event || 'message'} onChange={(event) => updateConfig(config, onChange, 'event', event.target.value)} placeholder="message" />
        </div>
        <div>
          <Label htmlFor="stream-id">Event ID</Label>
          <Input id="stream-id" value={config.id || ''} onChange={(event) => updateConfig(config, onChange, 'id', event.target.value)} placeholder="evt-001" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="stream-retry">Retry (ms)</Label>
          <Input id="stream-retry" type="number" value={config.retry || 3000} onChange={(event) => updateConfig(config, onChange, 'retry', Number(event.target.value))} />
        </div>
        <div>
          <Label htmlFor="stream-input-variable">Input Variable</Label>
          <Input id="stream-input-variable" value={config.inputVariable || 'input'} onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)} placeholder="input" />
        </div>
      </div>
      <div>
        <Label htmlFor="stream-data">Custom Data (optional)</Label>
        <Textarea id="stream-data" value={config.data || ''} onChange={(event) => updateConfig(config, onChange, 'data', event.target.value)} className="min-h-[110px]" />
      </div>
    </div>
  );
}

export const outputForms: Partial<Record<NodeType, OutputFormComponent>> = {
  [NodeType.OUTPUT_RESPONSE]: ResponseOutputForm,
  [NodeType.OUTPUT_JSON]: JsonOutputForm,
  [NodeType.OUTPUT_FILE]: FileOutputForm,
  [NodeType.OUTPUT_NOTIFICATION]: NotificationOutputForm,
  [NodeType.OUTPUT_EXPORT]: ExportOutputForm,
  [NodeType.OUTPUT_LOG]: LogOutputForm,
  [NodeType.OUTPUT_WEBHOOK]: WebhookOutputForm,
  [NodeType.OUTPUT_EMAIL]: EmailOutputForm,
  [NodeType.OUTPUT_STORAGE]: StorageOutputForm,
  [NodeType.OUTPUT_STREAM]: StreamOutputForm,
};
