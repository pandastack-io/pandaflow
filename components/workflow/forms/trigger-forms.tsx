'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { ComponentType } from 'react';
import { TriggerScheduleBuilder } from './trigger-schedule-builder';
import { TriggerWebhookBuilder } from './trigger-webhook-builder';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExpressionTextarea } from '@/components/workflow/expression-input';

type TriggerFormComponent = ComponentType<NodeFormProps>;

type InfoProps = {
  title: string;
  lines: string[];
};

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function toggleArrayValue(config: any, onChange: (config: any) => void, key: string, value: string) {
  const current = Array.isArray(config[key]) ? config[key] : [];
  const next = current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value];
  updateConfig(config, onChange, key, next);
}

function InfoPanel({ title, lines }: InfoProps) {
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

function ManualTriggerForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Receives whatever input payload starts the workflow.',
          'Passes variables.input through as the output payload.',
          'Useful for testing, forms, and ad-hoc executions.',
        ]}
      />
      <div>
        <Label htmlFor="manual-input-schema">Input Schema (JSON, optional)</Label>
        <Textarea
          id="manual-input-schema"
          value={config.inputSchema || ''}
          onChange={(event) => updateConfig(config, onChange, 'inputSchema', event.target.value)}
          placeholder='{"type":"object","required":["prompt"]}'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
    </div>
  );
}

function ScheduleTriggerForm({ config, onChange }: NodeFormProps) {
  return <TriggerScheduleBuilder config={config} onChange={onChange} />;
}

function WebhookTriggerForm({ config, onChange, nodeId }: NodeFormProps) {
  return <TriggerWebhookBuilder config={config} onChange={onChange} nodeId={nodeId} />;
}

function EventTriggerForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides eventName, payload, source, matched, and receivedAt.',
          'Payload filters are matched against the incoming event payload.',
        ]}
      />
      <div>
        <Label htmlFor="event-name">Event Name</Label>
        <Input
          id="event-name"
          value={config.eventName || ''}
          onChange={(event) => updateConfig(config, onChange, 'eventName', event.target.value)}
          placeholder="customer.created"
        />
      </div>
      <div>
        <Label htmlFor="event-source">Event Source</Label>
        <Input
          id="event-source"
          value={config.source || ''}
          onChange={(event) => updateConfig(config, onChange, 'source', event.target.value)}
          placeholder="internal-bus"
        />
      </div>
      <div>
        <Label htmlFor="event-filters">Payload Filters (JSON)</Label>
        <ExpressionTextarea
          id="event-filters"
          value={config.payloadFilters || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'payloadFilters', value)}
          placeholder='[{"field":"tenantId","operator":"eq","value":"acme"}]'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
      <div>
        <Label htmlFor="event-input-variable">Input Variable</Label>
        <Input
          id="event-input-variable"
          value={config.inputVariable || 'input'}
          onChange={(event) => updateConfig(config, onChange, 'inputVariable', event.target.value)}
          placeholder="input"
        />
      </div>
    </div>
  );
}

function EmailTriggerForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides subject, from, to, body, attachments, and normalized email metadata.',
          'Use filterRules to match fields like subject, from.0, or headers.message-id.',
        ]}
      />
      <div>
        <Label htmlFor="email-address">Inbox / Alias</Label>
        <Input
          id="email-address"
          value={config.emailAddress || ''}
          onChange={(event) => updateConfig(config, onChange, 'emailAddress', event.target.value)}
          placeholder="support@example.com"
        />
      </div>
      <div>
        <Label htmlFor="email-provider-mode">Collection Mode</Label>
        <Select value={config.mode || 'webhook'} onValueChange={(value) => updateConfig(config, onChange, 'mode', value)}>
          <SelectTrigger id="email-provider-mode">
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook">Provider Webhook</SelectItem>
            <SelectItem value="imap">IMAP Polling</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="email-filters">Filter Rules (JSON)</Label>
        <ExpressionTextarea
          id="email-filters"
          value={config.filterRules || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'filterRules', value)}
          placeholder='[{"field":"subject","operator":"contains","value":"Invoice"}]'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
      <div>
        <Label htmlFor="email-timeout">Timeout (ms)</Label>
        <Input
          id="email-timeout"
          type="number"
          value={config.timeout || 30000}
          onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function FileWatchTriggerForm({ config, onChange }: NodeFormProps) {
  const events = Array.isArray(config.events) ? config.events : [];
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides eventType, path, filename, size, timestamp, and matched.',
          'Pattern uses glob matching against the changed file path.',
        ]}
      />
      <div>
        <Label htmlFor="file-path">Watch Path</Label>
        <Input
          id="file-path"
          value={config.path || ''}
          onChange={(event) => updateConfig(config, onChange, 'path', event.target.value)}
          placeholder="/data/incoming"
        />
      </div>
      <div>
        <Label htmlFor="file-pattern">Pattern</Label>
        <Input
          id="file-pattern"
          value={config.pattern || ''}
          onChange={(event) => updateConfig(config, onChange, 'pattern', event.target.value)}
          placeholder="**/*.csv"
        />
      </div>
      <div className="space-y-2">
        <Label>Events</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {['create', 'update', 'delete'].map((eventName) => (
            <CheckboxRow
              key={eventName}
              id={`file-event-${eventName}`}
              label={eventName}
              checked={events.includes(eventName)}
              onCheckedChange={() => toggleArrayValue(config, onChange, 'events', eventName)}
            />
          ))}
        </div>
      </div>
      <CheckboxRow
        id="file-recursive"
        label="Watch recursively"
        checked={Boolean(config.recursive ?? true)}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'recursive', checked)}
      />
    </div>
  );
}

function DatabaseTriggerForm({ config, onChange }: NodeFormProps) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides operation, table, record, previousRecord, and timestamp.',
          'Polling / CDC infrastructure triggers the workflow before this node executes.',
        ]}
      />
      <div>
        <Label htmlFor="db-connection">Connection ID</Label>
        <Input
          id="db-connection"
          value={config.connectionId || ''}
          onChange={(event) => updateConfig(config, onChange, 'connectionId', event.target.value)}
          placeholder="primary-postgres"
        />
      </div>
      <div>
        <Label htmlFor="db-table">Table</Label>
        <Input
          id="db-table"
          value={config.table || ''}
          onChange={(event) => updateConfig(config, onChange, 'table', event.target.value)}
          placeholder="orders"
        />
      </div>
      <div className="space-y-2">
        <Label>Operations</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {['INSERT', 'UPDATE', 'DELETE'].map((operation) => (
            <CheckboxRow
              key={operation}
              id={`db-operation-${operation}`}
              label={operation}
              checked={operations.includes(operation)}
              onCheckedChange={() => toggleArrayValue(config, onChange, 'operations', operation)}
            />
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="db-poll-interval">Poll Interval (ms)</Label>
        <Input
          id="db-poll-interval"
          type="number"
          value={config.pollInterval || 10000}
          onChange={(event) => updateConfig(config, onChange, 'pollInterval', Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function MqttTriggerForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides broker, topic, qos, retained flag, payload, and timestamp.',
          'Topic filters support MQTT wildcards (+ and #).',
        ]}
      />
      <div>
        <Label htmlFor="mqtt-broker">Broker URL</Label>
        <Input
          id="mqtt-broker"
          value={config.broker || ''}
          onChange={(event) => updateConfig(config, onChange, 'broker', event.target.value)}
          placeholder="mqtt://broker.example.com:1883"
        />
      </div>
      <div>
        <Label htmlFor="mqtt-topic">Topic</Label>
        <Input
          id="mqtt-topic"
          value={config.topic || ''}
          onChange={(event) => updateConfig(config, onChange, 'topic', event.target.value)}
          placeholder="devices/+/events"
        />
      </div>
      <div>
        <Label htmlFor="mqtt-qos">QoS</Label>
        <Select value={String(config.qos || '0')} onValueChange={(value) => updateConfig(config, onChange, 'qos', value)}>
          <SelectTrigger id="mqtt-qos">
            <SelectValue placeholder="Select QoS" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0</SelectItem>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="2">2</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="mqtt-client-id">Client ID</Label>
        <Input
          id="mqtt-client-id"
          value={config.clientId || ''}
          onChange={(event) => updateConfig(config, onChange, 'clientId', event.target.value)}
          placeholder="workflow-trigger-client"
        />
      </div>
    </div>
  );
}

function WebsocketTriggerForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides message, channel/path, protocols, timestamp, and source URL.',
          'Protocols should be entered as a comma-separated list.',
        ]}
      />
      <div>
        <Label htmlFor="ws-url">WebSocket URL</Label>
        <Input
          id="ws-url"
          value={config.url || ''}
          onChange={(event) => updateConfig(config, onChange, 'url', event.target.value)}
          placeholder="wss://stream.example.com/events"
        />
      </div>
      <div>
        <Label htmlFor="ws-protocols">Protocols</Label>
        <Input
          id="ws-protocols"
          value={config.protocols || ''}
          onChange={(event) => updateConfig(config, onChange, 'protocols', event.target.value)}
          placeholder="json, workflow-v1"
        />
      </div>
      <div>
        <Label htmlFor="ws-heartbeat">Heartbeat (ms)</Label>
        <Input
          id="ws-heartbeat"
          type="number"
          value={config.heartbeatInterval || 30000}
          onChange={(event) => updateConfig(config, onChange, 'heartbeatInterval', Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function KafkaTriggerForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-3">
      <InfoPanel
        title="Trigger payload"
        lines={[
          'Provides topic, partition, offset, key, value, headers, and timestamp.',
          'Brokers are configured as a comma-separated list.',
        ]}
      />
      <div>
        <Label htmlFor="kafka-brokers">Brokers</Label>
        <Input
          id="kafka-brokers"
          value={config.brokers || ''}
          onChange={(event) => updateConfig(config, onChange, 'brokers', event.target.value)}
          placeholder="broker-1:9092,broker-2:9092"
        />
      </div>
      <div>
        <Label htmlFor="kafka-topic">Topic</Label>
        <Input
          id="kafka-topic"
          value={config.topic || ''}
          onChange={(event) => updateConfig(config, onChange, 'topic', event.target.value)}
          placeholder="workflow-events"
        />
      </div>
      <div>
        <Label htmlFor="kafka-group-id">Group ID</Label>
        <Input
          id="kafka-group-id"
          value={config.groupId || ''}
          onChange={(event) => updateConfig(config, onChange, 'groupId', event.target.value)}
          placeholder="workflow-trigger-group"
        />
      </div>
      <div>
        <Label htmlFor="kafka-sasl-mechanism">SASL Mechanism</Label>
        <Select value={config.saslMechanism || 'plain'} onValueChange={(value) => updateConfig(config, onChange, 'saslMechanism', value)}>
          <SelectTrigger id="kafka-sasl-mechanism">
            <SelectValue placeholder="Select mechanism" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plain">PLAIN</SelectItem>
            <SelectItem value="scram-sha-256">SCRAM-SHA-256</SelectItem>
            <SelectItem value="scram-sha-512">SCRAM-SHA-512</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CheckboxRow
        id="kafka-ssl"
        label="Use SSL"
        checked={Boolean(config.ssl ?? true)}
        onCheckedChange={(checked) => updateConfig(config, onChange, 'ssl', checked)}
      />
    </div>
  );
}

export const triggerForms: Partial<Record<NodeType, TriggerFormComponent>> = {
  [NodeType.TRIGGER_MANUAL]: ManualTriggerForm,
  [NodeType.TRIGGER_SCHEDULE]: ScheduleTriggerForm,
  [NodeType.TRIGGER_WEBHOOK]: WebhookTriggerForm,
  [NodeType.TRIGGER_EVENT]: EventTriggerForm,
  [NodeType.TRIGGER_EMAIL]: EmailTriggerForm,
  [NodeType.TRIGGER_FILE_WATCH]: FileWatchTriggerForm,
  [NodeType.TRIGGER_DATABASE]: DatabaseTriggerForm,
  [NodeType.TRIGGER_MQTT]: MqttTriggerForm,
  [NodeType.TRIGGER_WEBSOCKET]: WebsocketTriggerForm,
  [NodeType.TRIGGER_KAFKA]: KafkaTriggerForm,
};
