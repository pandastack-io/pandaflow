/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExpressionInput, ExpressionTextarea } from '@/components/workflow/expression-input';
import type { NodeFormProps } from './index';

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function updateNestedConfig(
  config: any,
  onChange: (config: any) => void,
  key: string,
  nestedKey: string,
  value: any
) {
  onChange({
    ...config,
    [key]: {
      ...(config?.[key] || {}),
      [nestedKey]: value,
    },
  });
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function HelperText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function InterpolationHint() {
  return (
    <HelperText>
      Variable interpolation supported in text fields using <code>{'{{variable}}'}</code> syntax.
    </HelperText>
  );
}

function JsonEditor({
  label,
  value,
  onValidChange,
  placeholder,
  rows = 5,
  nodeId,
}: {
  label: string;
  value: any;
  onValidChange: (value: any) => void;
  placeholder: string;
  rows?: number;
  nodeId?: string;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError('');
  }, [value]);

  return (
    <Field label={label} hint="Supports JSON objects, arrays, and interpolated string values.">
      <ExpressionTextarea
        value={text}
        rows={rows}
        nodeId={nodeId}
        onValueChange={(nextValue) => {
          setText(nextValue);
          if (!nextValue.trim()) {
            setError('');
            onValidChange({});
            return;
          }

          try {
            onValidChange(JSON.parse(nextValue));
            setError('');
          } catch {
            setError('Enter valid JSON before saving.');
          }
        }}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </Field>
  );
}

function AuthSection({ config, onChange }: NodeFormProps) {
  const auth = config?.auth || { type: 'none' };

  return (
    <Section title="Authentication">
      <Field label="Auth type">
        <Select
          value={auth.type || 'none'}
          onValueChange={(value) => updateNestedConfig(config, onChange, 'auth', 'type', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer token</SelectItem>
            <SelectItem value="basic">Basic auth</SelectItem>
            <SelectItem value="api_key">API key</SelectItem>
            <SelectItem value="oauth2">OAuth access token</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {(auth.type === 'bearer' || auth.type === 'oauth2') && (
        <Field label={auth.type === 'oauth2' ? 'Access token' : 'Bearer token'}>
          <Input
            type="password"
            value={auth.token || auth.accessToken || ''}
            onChange={(event) =>
              updateNestedConfig(
                config,
                onChange,
                'auth',
                auth.type === 'oauth2' ? 'accessToken' : 'token',
                event.target.value
              )
            }
            placeholder="{{secrets.apiToken}}"
          />
        </Field>
      )}

      {auth.type === 'basic' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Username">
            <Input
              value={auth.username || ''}
              onChange={(event) => updateNestedConfig(config, onChange, 'auth', 'username', event.target.value)}
              placeholder="service-account"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={auth.password || ''}
              onChange={(event) => updateNestedConfig(config, onChange, 'auth', 'password', event.target.value)}
              placeholder="{{secrets.password}}"
            />
          </Field>
        </div>
      )}

      {auth.type === 'api_key' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="API key header">
            <Input
              value={auth.apiKeyHeader || 'X-Api-Key'}
              onChange={(event) => updateNestedConfig(config, onChange, 'auth', 'apiKeyHeader', event.target.value)}
              placeholder="X-Api-Key"
            />
          </Field>
          <Field label="API key">
            <Input
              type="password"
              value={auth.apiKey || ''}
              onChange={(event) => updateNestedConfig(config, onChange, 'auth', 'apiKey', event.target.value)}
              placeholder="{{secrets.apiKey}}"
            />
          </Field>
        </div>
      )}
    </Section>
  );
}

function HttpForm({ config, onChange, nodeId }: NodeFormProps) {
  const method = config?.method || 'GET';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Method">
          <Select value={method} onValueChange={(value) => updateConfig(config, onChange, 'method', value)}>
            <SelectTrigger>
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
        <Field label="Request URL" hint="Supports interpolated path and query values.">
          <ExpressionInput
            value={config?.url || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'url', value)}
            placeholder="https://api.example.com/v1/orders/{{orderId}}"
          />
        </Field>
      </div>

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "Accept": "application/json"\n}'}
        rows={4}
      />

      {['POST', 'PUT', 'PATCH'].includes(method) && (
        <JsonEditor
          nodeId={nodeId}
          label="Body"
          value={config?.body}
          onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
          placeholder={'{\n  "customerId": "{{customer.id}}"\n}'}
          rows={7}
        />
      )}

      <Field label="Response mapping" hint="Optional JSONPath expression, e.g. $.data.items[*].id">
        <Input
          value={config?.responseMapping || ''}
          onChange={(event) => updateConfig(config, onChange, 'responseMapping', event.target.value)}
          placeholder="$.data"
        />
      </Field>

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function GraphqlForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Field label="Endpoint URL">
        <ExpressionInput
          value={config?.endpoint || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'endpoint', value)}
          placeholder="https://api.example.com/graphql"
        />
      </Field>

      <Field label="Operation name">
        <Input
          value={config?.operationName || ''}
          onChange={(event) => updateConfig(config, onChange, 'operationName', event.target.value)}
          placeholder="GetUserProfile"
        />
      </Field>

      <Field label="Query / mutation">
        <ExpressionTextarea
          value={config?.query || ''}
          rows={12}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'query', value)}
          placeholder={'query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    email\n  }\n}'}
          className="font-mono text-xs"
        />
      </Field>

      <JsonEditor
        nodeId={nodeId}
        label="Variables"
        value={config?.variables}
        onValidChange={(value) => updateConfig(config, onChange, 'variables', value)}
        placeholder={'{\n  "id": "{{userId}}"\n}'}
        rows={6}
      />

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function RestForm({ config, onChange, nodeId }: NodeFormProps) {
  const method = config?.method || 'GET';
  const pagination = config?.pagination || {};

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Base URL">
          <ExpressionInput
            value={config?.baseUrl || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'baseUrl', value)}
            placeholder="https://api.example.com"
          />
        </Field>
        <Field label="Path">
          <ExpressionInput
            value={config?.path || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'path', value)}
            placeholder="/v1/resources/{{resourceId}}"
          />
        </Field>
      </div>

      <Field label="Method">
        <Select value={method} onValueChange={(value) => updateConfig(config, onChange, 'method', value)}>
          <SelectTrigger>
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

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "Accept": "application/json"\n}'}
        rows={4}
      />

      <JsonEditor
        nodeId={nodeId}
        label="Query params"
        value={config?.query}
        onValidChange={(value) => updateConfig(config, onChange, 'query', value)}
        placeholder={'{\n  "status": "active"\n}'}
        rows={4}
      />

      {['POST', 'PUT', 'PATCH'].includes(method) && (
        <JsonEditor
          nodeId={nodeId}
          label="Request body"
          value={config?.body}
          onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
          placeholder={'{\n  "pageSize": 100\n}'}
          rows={6}
        />
      )}

      <AuthSection config={config} onChange={onChange} />

      <Section title="Pagination">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(pagination.enabled)}
            onChange={(event) =>
              updateConfig(config, onChange, 'pagination', { ...pagination, enabled: event.target.checked })
            }
          />
          Enable pagination
        </label>

        {pagination.enabled && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Pagination type">
                <Select
                  value={pagination.type || 'page'}
                  onValueChange={(value) =>
                    updateConfig(config, onChange, 'pagination', { ...pagination, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">Page</SelectItem>
                    <SelectItem value="offset">Offset</SelectItem>
                    <SelectItem value="cursor">Cursor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Page size">
                <Input
                  type="number"
                  value={pagination.pageSize ?? 100}
                  onChange={(event) =>
                    updateConfig(config, onChange, 'pagination', {
                      ...pagination,
                      pageSize: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Max pages">
                <Input
                  type="number"
                  value={pagination.maxPages ?? 10}
                  onChange={(event) =>
                    updateConfig(config, onChange, 'pagination', {
                      ...pagination,
                      maxPages: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Items JSONPath">
                <Input
                  value={pagination.itemsPath || ''}
                  onChange={(event) =>
                    updateConfig(config, onChange, 'pagination', {
                      ...pagination,
                      itemsPath: event.target.value,
                    })
                  }
                  placeholder="$.items[*]"
                />
              </Field>
            </div>
          </>
        )}
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function SoapForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Endpoint URL">
          <ExpressionInput
            value={config?.endpointUrl || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'endpointUrl', value)}
            placeholder="https://example.com/soap"
          />
        </Field>
        <Field label="WSDL URL (optional)">
          <ExpressionInput
            value={config?.wsdlUrl || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'wsdlUrl', value)}
            placeholder="https://example.com/service?wsdl"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation name">
          <Input
            value={config?.operation || ''}
            onChange={(event) => updateConfig(config, onChange, 'operation', event.target.value)}
            placeholder="GetCustomer"
          />
        </Field>
        <Field label="Namespace">
          <Input
            value={config?.namespace || ''}
            onChange={(event) => updateConfig(config, onChange, 'namespace', event.target.value)}
            placeholder="http://tempuri.org/"
          />
        </Field>
      </div>

      <JsonEditor
        nodeId={nodeId}
        label="Request body"
        value={config?.body}
        onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
        placeholder={'{\n  "CustomerId": "{{customerId}}"\n}'}
        rows={7}
      />

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "SOAPAction": "GetCustomer"\n}'}
        rows={4}
      />

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function WebhookForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Field label="Webhook URL">
        <ExpressionInput
          value={config?.url || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'url', value)}
          placeholder="https://hooks.example.com/ingest"
        />
      </Field>

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "X-Trace-Id": "{{executionId}}"\n}'}
        rows={4}
      />

      <JsonEditor
        nodeId={nodeId}
        label="Payload"
        value={config?.body}
        onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
        placeholder={'{\n  "event": "workflow.completed"\n}'}
        rows={7}
      />

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function GrpcForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Endpoint URL">
          <ExpressionInput
            value={config?.endpointUrl || ''}
            nodeId={nodeId}
            onValueChange={(value) => updateConfig(config, onChange, 'endpointUrl', value)}
            placeholder="https://grpc-gateway.example.com"
          />
        </Field>
        <Field label="Service">
          <Input
            value={config?.service || ''}
            onChange={(event) => updateConfig(config, onChange, 'service', event.target.value)}
            placeholder="users.v1.UsersService"
          />
        </Field>
      </div>

      <Field label="Method">
        <Input
          value={config?.method || ''}
          onChange={(event) => updateConfig(config, onChange, 'method', event.target.value)}
          placeholder="GetUser"
        />
      </Field>

      <JsonEditor
        nodeId={nodeId}
        label="Message payload"
        value={config?.message}
        onValidChange={(value) => updateConfig(config, onChange, 'message', value)}
        placeholder={'{\n  "userId": "{{userId}}"\n}'}
        rows={7}
      />

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "x-tenant": "{{organizationId}}"\n}'}
        rows={4}
      />

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries">
          <Input
            type="number"
            value={config?.retries ?? 1}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function WebSocketForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Field label="WebSocket URL">
        <ExpressionInput
          value={config?.url || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'url', value)}
          placeholder="wss://stream.example.com/ws"
        />
      </Field>

      <Field label="Outgoing message" hint="JSON strings or plain text are both supported.">
        <ExpressionTextarea
          value={typeof config?.message === 'string' ? config.message : JSON.stringify(config?.message || {}, null, 2)}
          rows={8}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'message', value)}
          placeholder={'{\n  "subscribe": "orders"\n}'}
          className="font-mono text-xs"
        />
      </Field>

      <Field label="Response mapping" hint="Optional JSONPath expression applied to the first received message.">
        <Input
          value={config?.responseMapping || ''}
          onChange={(event) => updateConfig(config, onChange, 'responseMapping', event.target.value)}
          placeholder="$.payload"
        />
      </Field>

      <Field label="Timeout (ms)">
        <Input
          type="number"
          value={config?.timeout ?? 30000}
          onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
        />
      </Field>
    </div>
  );
}

function SseForm({ config, onChange, nodeId }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Field label="SSE URL">
        <ExpressionInput
          value={config?.url || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'url', value)}
          placeholder="https://stream.example.com/events"
        />
      </Field>

      <JsonEditor
        nodeId={nodeId}
        label="Headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "Last-Event-ID": "{{lastEventId}}"\n}'}
        rows={4}
      />

      <AuthSection config={config} onChange={onChange} />

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Max events">
          <Input
            type="number"
            value={config?.maxEvents ?? 10}
            onChange={(event) => updateConfig(config, onChange, 'maxEvents', Number(event.target.value))}
          />
        </Field>
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function OAuthForm({ config, onChange }: NodeFormProps) {
  const flow = config?.flow || 'client_credentials';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="OAuth flow">
          <Select value={flow} onValueChange={(value) => updateConfig(config, onChange, 'flow', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_credentials">Client credentials</SelectItem>
              <SelectItem value="authorization_code">Authorization code</SelectItem>
              <SelectItem value="refresh_token">Refresh token</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Token URL">
          <Input
            value={config?.tokenUrl || ''}
            onChange={(event) => updateConfig(config, onChange, 'tokenUrl', event.target.value)}
            placeholder="https://auth.example.com/oauth/token"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Client ID">
          <Input
            value={config?.clientId || ''}
            onChange={(event) => updateConfig(config, onChange, 'clientId', event.target.value)}
            placeholder="{{secrets.clientId}}"
          />
        </Field>
        <Field label="Client secret">
          <Input
            type="password"
            value={config?.clientSecret || ''}
            onChange={(event) => updateConfig(config, onChange, 'clientSecret', event.target.value)}
            placeholder="{{secrets.clientSecret}}"
          />
        </Field>
      </div>

      <Field label="Scope">
        <Input
          value={config?.scope || ''}
          onChange={(event) => updateConfig(config, onChange, 'scope', event.target.value)}
          placeholder="read:users write:users"
        />
      </Field>

      {flow === 'refresh_token' && (
        <Field label="Refresh token">
          <Input
            type="password"
            value={config?.refreshToken || ''}
            onChange={(event) => updateConfig(config, onChange, 'refreshToken', event.target.value)}
            placeholder="{{oauth.refreshToken}}"
          />
        </Field>
      )}

      {flow === 'authorization_code' && (
        <>
          <Field label="Authorization code">
            <Input
              type="password"
              value={config?.code || ''}
              onChange={(event) => updateConfig(config, onChange, 'code', event.target.value)}
              placeholder="{{oauth.code}}"
            />
          </Field>
          <Field label="Redirect URI">
            <Input
              value={config?.redirectUri || ''}
              onChange={(event) => updateConfig(config, onChange, 'redirectUri', event.target.value)}
              placeholder="https://app.example.com/callback"
            />
          </Field>
        </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(config?.useBasicAuth)}
          onChange={(event) => updateConfig(config, onChange, 'useBasicAuth', event.target.checked)}
        />
        Send client credentials via HTTP Basic auth
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Output variable name">
          <Input
            value={config?.outputVariable || 'oauthToken'}
            onChange={(event) => updateConfig(config, onChange, 'outputVariable', event.target.value)}
            placeholder="oauthToken"
          />
        </Field>
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

function ApiKeyForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Placement">
          <Select
            value={config?.placement || 'header'}
            onValueChange={(value) => updateConfig(config, onChange, 'placement', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header">Header</SelectItem>
              <SelectItem value="query">Query parameter</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Key name">
          <Input
            value={config?.keyName || 'X-Api-Key'}
            onChange={(event) => updateConfig(config, onChange, 'keyName', event.target.value)}
            placeholder="X-Api-Key"
          />
        </Field>
      </div>

      <Field label="API key">
        <Input
          type="password"
          value={config?.apiKey || ''}
          onChange={(event) => updateConfig(config, onChange, 'apiKey', event.target.value)}
          placeholder="{{secrets.thirdPartyApiKey}}"
        />
      </Field>

      <Field label="Output variable name" hint="Stores the raw key and generated header metadata in workflow variables.">
        <Input
          value={config?.variableName || 'apiKey'}
          onChange={(event) => updateConfig(config, onChange, 'variableName', event.target.value)}
          placeholder="apiKey"
        />
      </Field>
    </div>
  );
}

export const integrationApiForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_HTTP]: HttpForm,
  [NodeType.INTEGRATION_GRAPHQL]: GraphqlForm,
  [NodeType.INTEGRATION_REST]: RestForm,
  [NodeType.INTEGRATION_SOAP]: SoapForm,
  [NodeType.INTEGRATION_WEBHOOK]: WebhookForm,
  [NodeType.INTEGRATION_GRPC]: GrpcForm,
  [NodeType.INTEGRATION_WEBSOCKET_CLIENT]: WebSocketForm,
  [NodeType.INTEGRATION_SSE]: SseForm,
  [NodeType.INTEGRATION_OAUTH]: OAuthForm,
  [NodeType.INTEGRATION_API_KEY]: ApiKeyForm,
};
