/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NodeFormProps } from './index';
import { CredentialPicker } from './credential-picker';

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
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

function InterpolationHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Variable interpolation supported in text fields using <code>{'{{variable}}'}</code> syntax.
    </p>
  );
}

function ConnectionHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Set a timeout and verify credentials with a connection test before activating the workflow.
    </p>
  );
}

function DbCredentialFields({ config, onChange, providerId }: NodeFormProps & { providerId?: string }) {
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

function JsonEditor({
  label,
  value,
  onValidChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: any;
  onValidChange: (value: any) => void;
  placeholder: string;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError('');
  }, [value]);

  return (
    <Field label={label} hint="Provide valid JSON. Interpolated strings are allowed inside JSON values.">
      <Textarea
        value={text}
        rows={rows}
        onChange={(event) => {
          const nextValue = event.target.value;
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

function CommonDbFooter({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-2">
      <Field label="Timeout (ms)">
        <Input
          type="number"
          value={config?.timeout ?? 30000}
          onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
        />
      </Field>
      <ConnectionHint />
    </div>
  );
}

function SqlQuerySection({ config, onChange, connectionLabel, providerId }: NodeFormProps & { connectionLabel: string; providerId?: string }) {
  return (
    <>
      <DbCredentialFields config={config} onChange={onChange} providerId={providerId} />
      <InterpolationHint />
      <Field label={connectionLabel} hint="Use a secret-backed connection string when possible.">
        <Input
          type="password"
          value={config?.connectionString || ''}
          onChange={(event) => updateConfig(config, onChange, 'connectionString', event.target.value)}
          placeholder="{{secrets.databaseUrl}}"
            autoComplete="new-password"
          />
      </Field>

      <Field label="Query" hint="Parameterized SQL is recommended for production use.">
        <Textarea
          value={config?.query || ''}
          rows={10}
          onChange={(event) => updateConfig(config, onChange, 'query', event.target.value)}
          placeholder={'SELECT *\nFROM users\nWHERE id = :userId'}
          className="font-mono text-xs"
        />
      </Field>

      <JsonEditor
        label="Parameters"
        value={config?.parameters}
        onValidChange={(value) => updateConfig(config, onChange, 'parameters', value)}
        placeholder={'{\n  "userId": "{{userId}}"\n}'}
        rows={5}
      />
    </>
  );
}

function GenericDatabaseForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <DbCredentialFields
        config={config}
        onChange={onChange}
        providerId={['postgres', 'mysql', 'mongodb', 'redis'].includes(config?.dbType || 'postgres') ? config?.dbType || 'postgres' : undefined}
      />
      <InterpolationHint />
      <Field label="Database type">
        <Select
          value={config?.dbType || 'postgres'}
          onValueChange={(value) => updateConfig(config, onChange, 'dbType', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="postgres">PostgreSQL</SelectItem>
            <SelectItem value="mysql">MySQL</SelectItem>
            <SelectItem value="mongodb">MongoDB</SelectItem>
            <SelectItem value="redis">Redis</SelectItem>
            <SelectItem value="elasticsearch">Elasticsearch</SelectItem>
            <SelectItem value="dynamodb">DynamoDB</SelectItem>
            <SelectItem value="cassandra">Cassandra</SelectItem>
            <SelectItem value="firestore">Firestore</SelectItem>
            <SelectItem value="supabase">Supabase</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Connection string / endpoint" hint="Used by SQL-compatible providers or HTTP database gateways.">
        <Input
          type="password"
          value={config?.connectionString || ''}
          onChange={(event) => updateConfig(config, onChange, 'connectionString', event.target.value)}
          placeholder="{{secrets.databaseUrl}}"
            autoComplete="new-password"
          />
      </Field>

      <Field label="Query / operation payload">
        <Textarea
          value={config?.query || ''}
          rows={8}
          onChange={(event) => updateConfig(config, onChange, 'query', event.target.value)}
          placeholder="SELECT now()"
          className="font-mono text-xs"
        />
      </Field>

      <JsonEditor
        label="Parameters"
        value={config?.parameters}
        onValidChange={(value) => updateConfig(config, onChange, 'parameters', value)}
        placeholder={'{\n  "limit": 100\n}'}
        rows={5}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function PostgresForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SqlQuerySection {...props} connectionLabel="PostgreSQL connection string" providerId="postgres" />
      <CommonDbFooter {...props} />
    </div>
  );
}

function MysqlForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <SqlQuerySection {...props} connectionLabel="MySQL connection string" providerId="mysql" />
      <CommonDbFooter {...props} />
    </div>
  );
}

function MongoForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <DbCredentialFields config={config} onChange={onChange} providerId="mongodb" />
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="App ID">
          <Input
            value={config?.appId || ''}
            onChange={(event) => updateConfig(config, onChange, 'appId', event.target.value)}
            placeholder="data-abcde"
          />
        </Field>
        <Field label="API key">
          <Input
            type="password"
            value={config?.apiKey || ''}
            onChange={(event) => updateConfig(config, onChange, 'apiKey', event.target.value)}
            placeholder="{{secrets.mongodbApiKey}}"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Database">
          <Input
            value={config?.database || ''}
            onChange={(event) => updateConfig(config, onChange, 'database', event.target.value)}
            placeholder="app"
          />
        </Field>
        <Field label="Collection">
          <Input
            value={config?.collection || ''}
            onChange={(event) => updateConfig(config, onChange, 'collection', event.target.value)}
            placeholder="users"
          />
        </Field>
      </div>

      <Field label="Operation">
        <Select
          value={config?.operation || 'find'}
          onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="find">find</SelectItem>
            <SelectItem value="insertOne">insertOne</SelectItem>
            <SelectItem value="updateOne">updateOne</SelectItem>
            <SelectItem value="deleteOne">deleteOne</SelectItem>
            <SelectItem value="aggregate">aggregate</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <JsonEditor
        label="Filter"
        value={config?.filter}
        onValidChange={(value) => updateConfig(config, onChange, 'filter', value)}
        placeholder={'{\n  "email": "{{user.email}}"\n}'}
        rows={5}
      />

      <JsonEditor
        label="Document / update"
        value={config?.document}
        onValidChange={(value) => updateConfig(config, onChange, 'document', value)}
        placeholder={'{\n  "$set": {\n    "lastLoginAt": "{{now}}"\n  }\n}'}
        rows={7}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function RedisForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'get';

  return (
    <div className="space-y-4">
      <DbCredentialFields config={config} onChange={onChange} providerId="redis" />
      <InterpolationHint />
      <Field label="Redis URL (optional)" hint="Leave blank to use the app's configured Redis connection.">
        <Input
          type="password"
          value={config?.redisUrl || ''}
          onChange={(event) => updateConfig(config, onChange, 'redisUrl', event.target.value)}
          placeholder="{{secrets.redisUrl}}"
            autoComplete="new-password"
          />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select
            value={operation}
            onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="get">get</SelectItem>
              <SelectItem value="set">set</SelectItem>
              <SelectItem value="hget">hget</SelectItem>
              <SelectItem value="hset">hset</SelectItem>
              <SelectItem value="lpush">lpush</SelectItem>
              <SelectItem value="rpop">rpop</SelectItem>
              <SelectItem value="del">del</SelectItem>
              <SelectItem value="exists">exists</SelectItem>
              <SelectItem value="expire">expire</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Key">
          <Input
            value={config?.key || ''}
            onChange={(event) => updateConfig(config, onChange, 'key', event.target.value)}
            placeholder="session:{{userId}}"
          />
        </Field>
      </div>

      {(operation === 'hget' || operation === 'hset') && (
        <Field label="Hash field">
          <Input
            value={config?.field || ''}
            onChange={(event) => updateConfig(config, onChange, 'field', event.target.value)}
            placeholder="profile"
          />
        </Field>
      )}

      {['set', 'hset', 'lpush'].includes(operation) && (
        <Field label="Value">
          <Textarea
            value={typeof config?.value === 'string' ? config.value : JSON.stringify(config?.value || {}, null, 2)}
            rows={6}
            onChange={(event) => updateConfig(config, onChange, 'value', event.target.value)}
            placeholder={'{\n  "enabled": true\n}'}
            className="font-mono text-xs"
          />
        </Field>
      )}

      {['set', 'expire'].includes(operation) && (
        <Field label="TTL (seconds)">
          <Input
            type="number"
            value={config?.ttl ?? 60}
            onChange={(event) => updateConfig(config, onChange, 'ttl', Number(event.target.value))}
          />
        </Field>
      )}

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function ElasticsearchForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Node URL">
          <Input
            value={config?.node || ''}
            onChange={(event) => updateConfig(config, onChange, 'node', event.target.value)}
            placeholder="https://search.example.com"
          />
        </Field>
        <Field label="Index">
          <Input
            value={config?.index || ''}
            onChange={(event) => updateConfig(config, onChange, 'index', event.target.value)}
            placeholder="orders"
          />
        </Field>
      </div>

      <Field label="Operation">
        <Select
          value={config?.operation || 'search'}
          onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="search">search</SelectItem>
            <SelectItem value="index">index</SelectItem>
            <SelectItem value="get">get</SelectItem>
            <SelectItem value="delete">delete</SelectItem>
            <SelectItem value="bulk">bulk</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Document ID (optional)">
        <Input
          value={config?.id || ''}
          onChange={(event) => updateConfig(config, onChange, 'id', event.target.value)}
          placeholder="{{documentId}}"
        />
      </Field>

      <JsonEditor
        label="Query JSON"
        value={config?.query}
        onValidChange={(value) => updateConfig(config, onChange, 'query', value)}
        placeholder={'{\n  "query": {\n    "match_all": {}\n  }\n}'}
        rows={7}
      />

      <JsonEditor
        label="Document / bulk payload"
        value={config?.document}
        onValidChange={(value) => updateConfig(config, onChange, 'document', value)}
        placeholder={'{\n  "status": "queued"\n}'}
        rows={7}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function DynamoForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Region">
          <Input
            value={config?.region || ''}
            onChange={(event) => updateConfig(config, onChange, 'region', event.target.value)}
            placeholder="us-east-1"
          />
        </Field>
        <Field label="Table name">
          <Input
            value={config?.tableName || ''}
            onChange={(event) => updateConfig(config, onChange, 'tableName', event.target.value)}
            placeholder="Users"
          />
        </Field>
      </div>

      <Field label="Operation">
        <Select
          value={config?.operation || 'getItem'}
          onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="getItem">getItem</SelectItem>
            <SelectItem value="putItem">putItem</SelectItem>
            <SelectItem value="query">query</SelectItem>
            <SelectItem value="scan">scan</SelectItem>
            <SelectItem value="deleteItem">deleteItem</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Access key ID">
          <Input
            type="password"
            value={config?.accessKeyId || ''}
            onChange={(event) => updateConfig(config, onChange, 'accessKeyId', event.target.value)}
            placeholder="{{secrets.awsAccessKeyId}}"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Secret access key">
          <Input
            type="password"
            value={config?.secretAccessKey || ''}
            onChange={(event) => updateConfig(config, onChange, 'secretAccessKey', event.target.value)}
            placeholder="{{secrets.awsSecretAccessKey}}"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <JsonEditor
        label="Key JSON"
        value={config?.key}
        onValidChange={(value) => updateConfig(config, onChange, 'key', value)}
        placeholder={'{\n  "id": "{{userId}}"\n}'}
        rows={5}
      />

      <JsonEditor
        label="Item JSON"
        value={config?.item}
        onValidChange={(value) => updateConfig(config, onChange, 'item', value)}
        placeholder={'{\n  "id": "{{userId}}",\n  "email": "{{email}}"\n}'}
        rows={7}
      />

      <Field label="Filter expression / key condition">
        <Input
          value={config?.filterExpression || config?.keyConditionExpression || ''}
          onChange={(event) => updateConfig(config, onChange, 'filterExpression', event.target.value)}
          placeholder="begins_with(pk, :prefix)"
        />
      </Field>

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function CassandraForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Astra URL">
          <Input
            value={config?.astraUrl || ''}
            onChange={(event) => updateConfig(config, onChange, 'astraUrl', event.target.value)}
            placeholder="https://<db-id>-<region>.apps.astra.datastax.com"
          />
        </Field>
        <Field label="Token">
          <Input
            type="password"
            value={config?.token || ''}
            onChange={(event) => updateConfig(config, onChange, 'token', event.target.value)}
            placeholder="{{secrets.astraToken}}"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Keyspace">
          <Input
            value={config?.keyspace || ''}
            onChange={(event) => updateConfig(config, onChange, 'keyspace', event.target.value)}
            placeholder="app"
          />
        </Field>
        <Field label="Table">
          <Input
            value={config?.table || ''}
            onChange={(event) => updateConfig(config, onChange, 'table', event.target.value)}
            placeholder="events"
          />
        </Field>
      </div>

      <Field label="Operation">
        <Select
          value={config?.operation || 'select'}
          onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="select">select</SelectItem>
            <SelectItem value="insert">insert</SelectItem>
            <SelectItem value="update">update</SelectItem>
            <SelectItem value="delete">delete</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <JsonEditor
        label="Where clause JSON"
        value={config?.where}
        onValidChange={(value) => updateConfig(config, onChange, 'where', value)}
        placeholder={'{\n  "id": {\n    "$eq": "{{eventId}}"\n  }\n}'}
        rows={5}
      />

      <JsonEditor
        label="Document JSON"
        value={config?.document}
        onValidChange={(value) => updateConfig(config, onChange, 'document', value)}
        placeholder={'{\n  "id": "{{eventId}}",\n  "status": "processed"\n}'}
        rows={7}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function FirestoreForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Project ID">
          <Input
            value={config?.projectId || ''}
            onChange={(event) => updateConfig(config, onChange, 'projectId', event.target.value)}
            placeholder="my-firebase-project"
          />
        </Field>
        <Field label="Collection">
          <Input
            value={config?.collection || ''}
            onChange={(event) => updateConfig(config, onChange, 'collection', event.target.value)}
            placeholder="users"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Document ID">
          <Input
            value={config?.documentId || ''}
            onChange={(event) => updateConfig(config, onChange, 'documentId', event.target.value)}
            placeholder="{{userId}}"
          />
        </Field>
        <Field label="Access token">
          <Input
            type="password"
            value={config?.accessToken || ''}
            onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
            placeholder="{{secrets.firebaseAccessToken}}"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <Field label="Operation">
        <Select
          value={config?.operation || 'get'}
          onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="get">get</SelectItem>
            <SelectItem value="set">set</SelectItem>
            <SelectItem value="query">query</SelectItem>
            <SelectItem value="delete">delete</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <JsonEditor
        label="Data JSON"
        value={config?.data}
        onValidChange={(value) => updateConfig(config, onChange, 'data', value)}
        placeholder={'{\n  "displayName": "{{user.name}}"\n}'}
        rows={7}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

function SupabaseForm({ config, onChange }: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Project URL">
          <Input
            value={config?.supabaseUrl || ''}
            onChange={(event) => updateConfig(config, onChange, 'supabaseUrl', event.target.value)}
            placeholder="https://xyzcompany.supabase.co"
          />
        </Field>
        <Field label="Anon key">
          <Input
            type="password"
            value={config?.anonKey || ''}
            onChange={(event) => updateConfig(config, onChange, 'anonKey', event.target.value)}
            placeholder="{{secrets.supabaseAnonKey}}"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Table">
          <Input
            value={config?.table || ''}
            onChange={(event) => updateConfig(config, onChange, 'table', event.target.value)}
            placeholder="profiles"
          />
        </Field>
        <Field label="Operation">
          <Select
            value={config?.operation || 'select'}
            onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="select">select</SelectItem>
              <SelectItem value="insert">insert</SelectItem>
              <SelectItem value="update">update</SelectItem>
              <SelectItem value="delete">delete</SelectItem>
              <SelectItem value="upsert">upsert</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Filter query" hint="Use PostgREST syntax, e.g. id=eq.123&status=eq.active">
        <Input
          value={config?.filter || ''}
          onChange={(event) => updateConfig(config, onChange, 'filter', event.target.value)}
          placeholder="id=eq.{{userId}}"
        />
      </Field>

      <Field label="Select columns">
        <Input
          value={config?.select || '*'}
          onChange={(event) => updateConfig(config, onChange, 'select', event.target.value)}
          placeholder="id,email,created_at"
        />
      </Field>

      <JsonEditor
        label="Data JSON"
        value={config?.data}
        onValidChange={(value) => updateConfig(config, onChange, 'data', value)}
        placeholder={'{\n  "email": "{{user.email}}"\n}'}
        rows={7}
      />

      <CommonDbFooter config={config} onChange={onChange} />
    </div>
  );
}

export const integrationDbForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_DATABASE]: GenericDatabaseForm,
  [NodeType.INTEGRATION_POSTGRES]: PostgresForm,
  [NodeType.INTEGRATION_MYSQL]: MysqlForm,
  [NodeType.INTEGRATION_MONGODB]: MongoForm,
  [NodeType.INTEGRATION_REDIS]: RedisForm,
  [NodeType.INTEGRATION_ELASTICSEARCH]: ElasticsearchForm,
  [NodeType.INTEGRATION_DYNAMODB]: DynamoForm,
  [NodeType.INTEGRATION_CASSANDRA]: CassandraForm,
  [NodeType.INTEGRATION_FIRESTORE]: FirestoreForm,
  [NodeType.INTEGRATION_SUPABASE]: SupabaseForm,
};
