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

type Option = { value: string; label: string };
type FieldType = 'text' | 'password' | 'number' | 'textarea' | 'json' | 'select';

type FieldDefinition = {
  key: string;
  section: string;
  label: string;
  type?: FieldType;
  hint?: string;
  placeholder?: string;
  rows?: number;
  options?: Option[];
  defaultValue?: any;
  when?: (config: any) => boolean;
  parseValue?: (value: string) => any;
  formatValue?: (value: any) => string;
};

type ServiceDefinition = {
  title: string;
  description: string;
  credentialProviderId?: string;
  operationOptions?: Option[];
  fields: FieldDefinition[];
};

const yesNoOptions: Option[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const boolField = (key: string, section: string, label: string, hint?: string, defaultValue = false): FieldDefinition => ({
  key,
  section,
  label,
  hint,
  type: 'select',
  options: yesNoOptions,
  defaultValue,
  parseValue: (value) => value === 'true',
  formatValue: (value) => String(Boolean(value ?? defaultValue)),
});

const httpMethodOptions: Option[] = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

const accessOptions: Option[] = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
];

const invocationTypeOptions: Option[] = [
  { value: 'RequestResponse', label: 'RequestResponse' },
  { value: 'Event', label: 'Event' },
  { value: 'DryRun', label: 'DryRun' },
];

const logTypeOptions: Option[] = [
  { value: 'None', label: 'None' },
  { value: 'Tail', label: 'Tail' },
];

const commonNetworkFields: FieldDefinition[] = [
  {
    key: 'inputVariable',
    section: 'Advanced',
    label: 'Input variable',
    hint: 'Optional variable name. Leave blank to use the most recent upstream node output.',
    placeholder: 'payload',
  },
  {
    key: 'timeout',
    section: 'Advanced',
    label: 'Timeout (ms)',
    type: 'number',
    hint: 'Applies to every REST request made by this node.',
    defaultValue: 30000,
  },
  {
    key: 'retries',
    section: 'Advanced',
    label: 'Retry attempts',
    type: 'number',
    hint: 'Retry policy uses exponential backoff and only retries retryable failures.',
    defaultValue: 3,
  },
];

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...(config || {}), [key]: value });
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
      Variable interpolation is supported in text fields using <code>{'{{variable}}'}</code> syntax.
    </HelperText>
  );
}

function JsonEditor({
  label,
  value,
  onValidChange,
  placeholder,
  hint,
  rows = 6,
}: {
  label: string;
  value: any;
  onValidChange: (value: any) => void;
  placeholder: string;
  hint?: string;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError('');
  }, [value]);

  return (
    <Field label={label} hint={hint || 'Provide valid JSON. Interpolated strings are allowed inside JSON values.'}>
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

function renderField(field: FieldDefinition, config: any, onChange: (config: any) => void) {
  if (field.when && !field.when(config)) return null;

  const rawValue = config?.[field.key] ?? field.defaultValue;

  if (field.type === 'json') {
    return (
      <JsonEditor
        key={field.key}
        label={field.label}
        value={rawValue}
        onValidChange={(value) => updateConfig(config, onChange, field.key, value)}
        placeholder={field.placeholder || '{\n  "key": "value"\n}'}
        hint={field.hint}
        rows={field.rows}
      />
    );
  }

  if (field.type === 'select') {
    const selectValue = field.formatValue ? field.formatValue(rawValue) : String(rawValue ?? '');
    return (
      <Field key={field.key} label={field.label} hint={field.hint}>
        <Select
          value={selectValue}
          onValueChange={(value) => updateConfig(config, onChange, field.key, field.parseValue ? field.parseValue(value) : value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field key={field.key} label={field.label} hint={field.hint}>
        <Textarea
          value={String(rawValue ?? '')}
          rows={field.rows || 5}
          onChange={(event) => updateConfig(config, onChange, field.key, event.target.value)}
          placeholder={field.placeholder}
          className="font-mono text-xs"
        />
      </Field>
    );
  }

  if (field.type === 'number') {
    return (
      <Field key={field.key} label={field.label} hint={field.hint}>
        <Input
          type="number"
          value={rawValue ?? ''}
          onChange={(event) =>
            updateConfig(
              config,
              onChange,
              field.key,
              event.target.value === '' ? undefined : Number(event.target.value)
            )
          }
          placeholder={field.placeholder}
        />
      </Field>
    );
  }

  return (
    <Field key={field.key} label={field.label} hint={field.hint}>
      <Input
        type={field.type === 'password' ? 'password' : 'text'}
        value={String(rawValue ?? '')}
        onChange={(event) => updateConfig(config, onChange, field.key, event.target.value)}
        placeholder={field.placeholder}
      />
    </Field>
  );
}

function CloudServiceForm({ definition, config, onChange }: NodeFormProps & { definition: ServiceDefinition }) {
  const operation = config?.operation || definition.operationOptions?.[0]?.value;
  const effectiveConfig = { ...(config || {}), operation };
  const sections = Array.from(
    definition.fields.reduce((map, field) => {
      if (field.when && !field.when(effectiveConfig)) return map;
      const current = map.get(field.section) || [];
      current.push(field);
      map.set(field.section, current);
      return map;
    }, new Map<string, FieldDefinition[]>())
  );

  return (
    <div className="space-y-4">
      {definition.credentialProviderId ? (
        <CredentialPicker
          providerId={definition.credentialProviderId}
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
      ) : null}
      <HelperText>{definition.description}</HelperText>
      <InterpolationHint />

      {definition.operationOptions ? (
        <Section title="Operation">
          {renderField(
            {
              key: 'operation',
              section: 'Operation',
              label: 'Operation',
              type: 'select',
              options: definition.operationOptions,
              defaultValue: definition.operationOptions[0]?.value,
            },
            effectiveConfig,
            onChange
          )}
        </Section>
      ) : null}

      {sections.map(([title, fields]) => (
        <Section key={title} title={title}>
          {fields.map((field) => renderField(field, effectiveConfig, onChange))}
        </Section>
      ))}
    </div>
  );
}

function createServiceForm(definition: ServiceDefinition) {
  return function ServiceForm(props: NodeFormProps) {
    return <CloudServiceForm {...props} definition={definition} />;
  };
}

const awsCredentialFields: FieldDefinition[] = [
  { key: 'region', section: 'Credentials', label: 'Region', hint: 'AWS region used for endpoint resolution and signing.', placeholder: 'us-east-1', defaultValue: 'us-east-1' },
  { key: 'accessKeyId', section: 'Credentials', label: 'Access key ID', type: 'password', placeholder: '{{secrets.awsAccessKeyId}}' },
  { key: 'secretAccessKey', section: 'Credentials', label: 'Secret access key', type: 'password', placeholder: '{{secrets.awsSecretAccessKey}}' },
  { key: 'sessionToken', section: 'Credentials', label: 'Session token', type: 'password', hint: 'Optional for temporary credentials.' },
  { key: 'endpoint', section: 'Credentials', label: 'Custom endpoint', hint: 'Optional. Useful for private endpoints, LocalStack, or VPC interfaces.', placeholder: 'https://s3.us-east-1.amazonaws.com' },
];

const awsS3Definition: ServiceDefinition = {
  title: 'AWS S3',
  credentialProviderId: 'aws',
  description: 'Direct AWS S3 REST integration with inline Signature V4 signing for upload, download, delete, and list operations.',
  operationOptions: [
    { value: 'putObject', label: 'Put object' },
    { value: 'getObject', label: 'Get object' },
    { value: 'deleteObject', label: 'Delete object' },
    { value: 'listObjects', label: 'List objects' },
  ],
  fields: [
    ...awsCredentialFields,
    { key: 'bucket', section: 'Target', label: 'Bucket', placeholder: 'workflow-assets' },
    { key: 'key', section: 'Target', label: 'Object key', placeholder: 'exports/report.json', when: (config) => config.operation !== 'listObjects' },
    { key: 'prefix', section: 'Target', label: 'Prefix', hint: 'Optional filter for list requests.', placeholder: 'exports/', when: (config) => config.operation === 'listObjects' },
    { key: 'maxKeys', section: 'Target', label: 'Max keys', type: 'number', when: (config) => config.operation === 'listObjects' },
    { key: 'continuationToken', section: 'Target', label: 'Continuation token', when: (config) => config.operation === 'listObjects' },
    { key: 'body', section: 'Request', label: 'Body / object content', type: 'textarea', rows: 8, hint: 'Used for Put object. Leave blank to use upstream input.', placeholder: '{\n  "message": "hello"\n}', when: (config) => config.operation === 'putObject' },
    { key: 'bodyEncoding', section: 'Request', label: 'Body encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'putObject' },
    { key: 'contentType', section: 'Request', label: 'Content type', placeholder: 'application/json', when: (config) => config.operation === 'putObject' },
    { key: 'metadata', section: 'Request', label: 'Object metadata', type: 'json', placeholder: '{\n  "source": "workflow"\n}', when: (config) => config.operation === 'putObject' },
    { key: 'headers', section: 'Request', label: 'Additional headers', type: 'json', placeholder: '{\n  "x-amz-storage-class": "STANDARD"\n}', when: (config) => config.operation === 'putObject' },
    ...commonNetworkFields,
  ],
};

const awsLambdaDefinition: ServiceDefinition = {
  title: 'AWS Lambda',
  credentialProviderId: 'aws',
  description: 'Direct AWS Lambda invoke and metadata requests using inline Signature V4 signing.',
  operationOptions: [
    { value: 'invoke', label: 'Invoke function' },
    { value: 'getFunction', label: 'Get function configuration' },
  ],
  fields: [
    ...awsCredentialFields,
    { key: 'functionName', section: 'Target', label: 'Function name or ARN', placeholder: 'processWebhook' },
    { key: 'qualifier', section: 'Target', label: 'Qualifier', hint: 'Optional alias or version.' },
    { key: 'invocationType', section: 'Request', label: 'Invocation type', type: 'select', options: invocationTypeOptions, defaultValue: 'RequestResponse', when: (config) => config.operation === 'invoke' },
    { key: 'logType', section: 'Request', label: 'Log type', type: 'select', options: logTypeOptions, defaultValue: 'None', when: (config) => config.operation === 'invoke' },
    { key: 'payload', section: 'Request', label: 'Payload JSON', type: 'json', placeholder: '{\n  "eventId": "{{event.id}}"\n}', hint: 'Leave blank to use the upstream node output.', when: (config) => config.operation === 'invoke' },
    ...commonNetworkFields,
  ],
};

const awsSqsDefinition: ServiceDefinition = {
  title: 'AWS SQS',
  credentialProviderId: 'aws',
  description: 'Direct AWS SQS Query API requests with Signature V4 signing for send, receive, delete, and attribute retrieval.',
  operationOptions: [
    { value: 'sendMessage', label: 'Send message' },
    { value: 'receiveMessage', label: 'Receive messages' },
    { value: 'deleteMessage', label: 'Delete message' },
    { value: 'getQueueAttributes', label: 'Get queue attributes' },
  ],
  fields: [
    ...awsCredentialFields,
    { key: 'queueUrl', section: 'Target', label: 'Queue URL', placeholder: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders' },
    { key: 'messageBody', section: 'Request', label: 'Message body', type: 'textarea', rows: 6, hint: 'Used for Send message. Leave blank to use upstream input.', placeholder: '{\n  "orderId": "123"\n}', when: (config) => config.operation === 'sendMessage' },
    { key: 'delaySeconds', section: 'Request', label: 'Delay seconds', type: 'number', when: (config) => config.operation === 'sendMessage' },
    { key: 'messageAttributes', section: 'Request', label: 'Message attributes', type: 'json', placeholder: '{\n  "tenant": "acme"\n}', when: (config) => config.operation === 'sendMessage' },
    { key: 'maxNumberOfMessages', section: 'Request', label: 'Max number of messages', type: 'number', defaultValue: 1, when: (config) => config.operation === 'receiveMessage' },
    { key: 'visibilityTimeout', section: 'Request', label: 'Visibility timeout (seconds)', type: 'number', when: (config) => config.operation === 'receiveMessage' },
    { key: 'waitTimeSeconds', section: 'Request', label: 'Wait time seconds', type: 'number', when: (config) => config.operation === 'receiveMessage' },
    { key: 'receiptHandle', section: 'Request', label: 'Receipt handle', when: (config) => config.operation === 'deleteMessage' },
    { key: 'attributeNames', section: 'Request', label: 'Attribute names JSON', type: 'json', placeholder: '["All"]', when: (config) => config.operation === 'getQueueAttributes' },
    ...commonNetworkFields,
  ],
};

const awsSnsDefinition: ServiceDefinition = {
  title: 'AWS SNS',
  credentialProviderId: 'aws',
  description: 'Direct AWS SNS Query API requests with Signature V4 signing for publish and topic inspection operations.',
  operationOptions: [
    { value: 'publish', label: 'Publish message' },
    { value: 'listTopics', label: 'List topics' },
    { value: 'listSubscriptionsByTopic', label: 'List subscriptions by topic' },
  ],
  fields: [
    ...awsCredentialFields,
    { key: 'topicArn', section: 'Target', label: 'Topic ARN', placeholder: 'arn:aws:sns:us-east-1:123456789012:updates', when: (config) => config.operation !== 'listTopics' },
    { key: 'targetArn', section: 'Target', label: 'Target ARN', hint: 'Optional for direct publish operations.', when: (config) => config.operation === 'publish' },
    { key: 'subject', section: 'Request', label: 'Subject', when: (config) => config.operation === 'publish' },
    { key: 'message', section: 'Request', label: 'Message', type: 'textarea', rows: 6, hint: 'Used for Publish. Leave blank to use upstream input.', placeholder: '{\n  "status": "done"\n}', when: (config) => config.operation === 'publish' },
    { key: 'messageAttributes', section: 'Request', label: 'Message attributes', type: 'json', placeholder: '{\n  "severity": "info"\n}', when: (config) => config.operation === 'publish' },
    ...commonNetworkFields,
  ],
};

const gcpStorageDefinition: ServiceDefinition = {
  title: 'GCP Storage',
  credentialProviderId: 'gcp',
  description: 'Direct Google Cloud Storage JSON API requests authenticated with an OAuth access token.',
  operationOptions: [
    { value: 'uploadObject', label: 'Upload object' },
    { value: 'downloadObject', label: 'Download object' },
    { value: 'deleteObject', label: 'Delete object' },
    { value: 'listObjects', label: 'List objects' },
  ],
  fields: [
    { key: 'accessToken', section: 'Credentials', label: 'OAuth access token', type: 'password', placeholder: '{{secrets.gcpAccessToken}}' },
    { key: 'bucket', section: 'Target', label: 'Bucket', placeholder: 'workflow-bucket' },
    { key: 'objectName', section: 'Target', label: 'Object name', placeholder: 'exports/data.json', when: (config) => config.operation !== 'listObjects' },
    { key: 'prefix', section: 'Target', label: 'Prefix', when: (config) => config.operation === 'listObjects' },
    { key: 'maxResults', section: 'Target', label: 'Max results', type: 'number', when: (config) => config.operation === 'listObjects' },
    { key: 'body', section: 'Request', label: 'Body / object content', type: 'textarea', rows: 8, hint: 'Used for Upload object. Leave blank to use upstream input.', placeholder: '{\n  "hello": "world"\n}', when: (config) => config.operation === 'uploadObject' },
    { key: 'bodyEncoding', section: 'Request', label: 'Body encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'uploadObject' },
    { key: 'contentType', section: 'Request', label: 'Content type', placeholder: 'application/json', when: (config) => config.operation === 'uploadObject' },
    { key: 'metadata', section: 'Request', label: 'Object metadata', type: 'json', placeholder: '{\n  "environment": "prod"\n}', when: (config) => config.operation === 'uploadObject' },
    ...commonNetworkFields,
  ],
};

const gcpPubSubDefinition: ServiceDefinition = {
  title: 'GCP Pub/Sub',
  credentialProviderId: 'gcp',
  description: 'Direct Google Cloud Pub/Sub REST requests for topic creation, publishing, pulling, and acknowledgement.',
  operationOptions: [
    { value: 'publish', label: 'Publish messages' },
    { value: 'pull', label: 'Pull messages' },
    { value: 'acknowledge', label: 'Acknowledge messages' },
    { value: 'createTopic', label: 'Create topic' },
  ],
  fields: [
    { key: 'accessToken', section: 'Credentials', label: 'OAuth access token', type: 'password', placeholder: '{{secrets.gcpAccessToken}}' },
    { key: 'projectId', section: 'Target', label: 'Project ID', placeholder: 'my-gcp-project' },
    { key: 'topic', section: 'Target', label: 'Topic name', placeholder: 'workflow-events', when: (config) => config.operation === 'publish' || config.operation === 'createTopic' },
    { key: 'subscription', section: 'Target', label: 'Subscription name', placeholder: 'workflow-subscription', when: (config) => config.operation === 'pull' || config.operation === 'acknowledge' },
    { key: 'message', section: 'Request', label: 'Single message body', type: 'textarea', rows: 5, hint: 'Used for Publish when messages JSON is empty.', placeholder: '{\n  "event": "created"\n}', when: (config) => config.operation === 'publish' },
    { key: 'messages', section: 'Request', label: 'Messages JSON', type: 'json', placeholder: '[\n  { "data": "{{payload}}", "attributes": { "source": "workflow" } }\n]', hint: 'Optional advanced payload. Each message can include base64 data and attributes.', when: (config) => config.operation === 'publish' },
    { key: 'attributes', section: 'Request', label: 'Default attributes', type: 'json', placeholder: '{\n  "workflow": "builder"\n}', when: (config) => config.operation === 'publish' },
    { key: 'maxMessages', section: 'Request', label: 'Max messages', type: 'number', defaultValue: 1, when: (config) => config.operation === 'pull' },
    { key: 'ackIds', section: 'Request', label: 'Ack IDs JSON', type: 'json', placeholder: '["ack-id-1"]', hint: 'Leave blank to derive ackIds from upstream pulled messages.', when: (config) => config.operation === 'acknowledge' },
    ...commonNetworkFields,
  ],
};

const azureBlobDefinition: ServiceDefinition = {
  title: 'Azure Blob',
  credentialProviderId: 'azure',
  description: 'Direct Azure Blob Storage REST requests signed with a Shared Key account signature.',
  operationOptions: [
    { value: 'putBlob', label: 'Put blob' },
    { value: 'getBlob', label: 'Get blob' },
    { value: 'deleteBlob', label: 'Delete blob' },
    { value: 'listBlobs', label: 'List blobs' },
  ],
  fields: [
    { key: 'accountName', section: 'Credentials', label: 'Account name', placeholder: 'storageaccount' },
    { key: 'accountKey', section: 'Credentials', label: 'Account key', type: 'password', placeholder: '{{secrets.azureAccountKey}}' },
    { key: 'container', section: 'Target', label: 'Container', placeholder: 'workflow-data' },
    { key: 'blobName', section: 'Target', label: 'Blob name', placeholder: 'exports/report.json', when: (config) => config.operation !== 'listBlobs' },
    { key: 'prefix', section: 'Target', label: 'Prefix', when: (config) => config.operation === 'listBlobs' },
    { key: 'maxResults', section: 'Target', label: 'Max results', type: 'number', when: (config) => config.operation === 'listBlobs' },
    { key: 'body', section: 'Request', label: 'Blob body', type: 'textarea', rows: 8, hint: 'Used for Put blob. Leave blank to use upstream input.', placeholder: '{\n  "blob": true\n}', when: (config) => config.operation === 'putBlob' },
    { key: 'bodyEncoding', section: 'Request', label: 'Body encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'putBlob' },
    { key: 'contentType', section: 'Request', label: 'Content type', placeholder: 'application/json', when: (config) => config.operation === 'putBlob' },
    { key: 'metadata', section: 'Request', label: 'Blob metadata', type: 'json', placeholder: '{\n  "owner": "workflow"\n}', when: (config) => config.operation === 'putBlob' },
    ...commonNetworkFields,
  ],
};

const azureQueueDefinition: ServiceDefinition = {
  title: 'Azure Queue',
  credentialProviderId: 'azure',
  description: 'Direct Azure Queue Storage REST requests signed with a Shared Key account signature.',
  operationOptions: [
    { value: 'sendMessage', label: 'Send message' },
    { value: 'receiveMessages', label: 'Receive messages' },
    { value: 'peekMessages', label: 'Peek messages' },
    { value: 'deleteMessage', label: 'Delete message' },
  ],
  fields: [
    { key: 'accountName', section: 'Credentials', label: 'Account name', placeholder: 'storageaccount' },
    { key: 'accountKey', section: 'Credentials', label: 'Account key', type: 'password', placeholder: '{{secrets.azureAccountKey}}' },
    { key: 'queueName', section: 'Target', label: 'Queue name', placeholder: 'workflow-queue' },
    { key: 'messageText', section: 'Request', label: 'Message text', type: 'textarea', rows: 5, hint: 'Used for Send message. Leave blank to use upstream input.', placeholder: '{\n  "task": "sync"\n}', when: (config) => config.operation === 'sendMessage' },
    { key: 'numOfMessages', section: 'Request', label: 'Number of messages', type: 'number', defaultValue: 1, when: (config) => config.operation === 'receiveMessages' || config.operation === 'peekMessages' },
    { key: 'visibilityTimeout', section: 'Request', label: 'Visibility timeout (seconds)', type: 'number', when: (config) => config.operation === 'receiveMessages' },
    { key: 'messageId', section: 'Request', label: 'Message ID', when: (config) => config.operation === 'deleteMessage' },
    { key: 'popReceipt', section: 'Request', label: 'Pop receipt', when: (config) => config.operation === 'deleteMessage' },
    ...commonNetworkFields,
  ],
};

const cloudflareKvDefinition: ServiceDefinition = {
  title: 'Cloudflare KV',
  description: 'Direct Cloudflare KV REST requests using an account API token and namespace identifier.',
  operationOptions: [
    { value: 'put', label: 'Put value' },
    { value: 'get', label: 'Get value' },
    { value: 'delete', label: 'Delete value' },
    { value: 'list', label: 'List keys' },
  ],
  fields: [
    { key: 'accountId', section: 'Credentials', label: 'Account ID', placeholder: '{{secrets.cloudflareAccountId}}' },
    { key: 'apiToken', section: 'Credentials', label: 'API token', type: 'password', placeholder: '{{secrets.cloudflareApiToken}}' },
    { key: 'namespaceId', section: 'Credentials', label: 'Namespace ID', placeholder: '{{secrets.cloudflareKvNamespaceId}}' },
    { key: 'key', section: 'Target', label: 'Key', placeholder: 'workflows/latest', when: (config) => config.operation !== 'list' },
    { key: 'prefix', section: 'Target', label: 'Prefix', placeholder: 'workflows/', when: (config) => config.operation === 'list' },
    { key: 'limit', section: 'Target', label: 'Limit', type: 'number', when: (config) => config.operation === 'list' },
    { key: 'cursor', section: 'Target', label: 'Cursor', when: (config) => config.operation === 'list' },
    { key: 'value', section: 'Request', label: 'Value', type: 'textarea', rows: 6, hint: 'Used for Put value. Leave blank to use upstream input.', placeholder: '{\n  "enabled": true\n}', when: (config) => config.operation === 'put' },
    { key: 'bodyEncoding', section: 'Request', label: 'Value encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'put' },
    { key: 'ttl', section: 'Request', label: 'TTL seconds', type: 'number', hint: 'Optional expiration TTL.', when: (config) => config.operation === 'put' },
    { key: 'metadata', section: 'Request', label: 'Metadata JSON', type: 'json', placeholder: '{\n  "owner": "workflow"\n}', when: (config) => config.operation === 'put' },
    ...commonNetworkFields,
  ],
};

const cloudflareR2Definition: ServiceDefinition = {
  title: 'Cloudflare R2',
  description: 'Direct Cloudflare R2 S3-compatible requests signed with inline Signature V4.',
  operationOptions: awsS3Definition.operationOptions,
  fields: [
    { key: 'accountId', section: 'Credentials', label: 'Account ID', placeholder: '{{secrets.cloudflareAccountId}}' },
    { key: 'region', section: 'Credentials', label: 'Region', hint: 'R2 uses auto by default.', placeholder: 'auto', defaultValue: 'auto' },
    { key: 'accessKeyId', section: 'Credentials', label: 'Access key ID', type: 'password', placeholder: '{{secrets.r2AccessKeyId}}' },
    { key: 'secretAccessKey', section: 'Credentials', label: 'Secret access key', type: 'password', placeholder: '{{secrets.r2SecretAccessKey}}' },
    { key: 'bucket', section: 'Target', label: 'Bucket', placeholder: 'workflow-artifacts' },
    { key: 'key', section: 'Target', label: 'Object key', placeholder: 'exports/output.json', when: (config) => config.operation !== 'listObjects' },
    { key: 'prefix', section: 'Target', label: 'Prefix', when: (config) => config.operation === 'listObjects' },
    { key: 'maxKeys', section: 'Target', label: 'Max keys', type: 'number', when: (config) => config.operation === 'listObjects' },
    { key: 'continuationToken', section: 'Target', label: 'Continuation token', when: (config) => config.operation === 'listObjects' },
    { key: 'body', section: 'Request', label: 'Body / object content', type: 'textarea', rows: 8, hint: 'Used for Put object. Leave blank to use upstream input.', placeholder: '{\n  "result": true\n}', when: (config) => config.operation === 'putObject' },
    { key: 'bodyEncoding', section: 'Request', label: 'Body encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'putObject' },
    { key: 'contentType', section: 'Request', label: 'Content type', placeholder: 'application/json', when: (config) => config.operation === 'putObject' },
    { key: 'headers', section: 'Request', label: 'Additional headers', type: 'json', placeholder: '{\n  "Cache-Control": "max-age=60"\n}', when: (config) => config.operation === 'putObject' },
    ...commonNetworkFields,
  ],
};

const cloudflareD1Definition: ServiceDefinition = {
  title: 'Cloudflare D1',
  description: 'Direct Cloudflare D1 query and raw SQL execution over the Cloudflare REST API.',
  operationOptions: [
    { value: 'query', label: 'Query' },
    { value: 'raw', label: 'Raw' },
  ],
  fields: [
    { key: 'accountId', section: 'Credentials', label: 'Account ID', placeholder: '{{secrets.cloudflareAccountId}}' },
    { key: 'apiToken', section: 'Credentials', label: 'API token', type: 'password', placeholder: '{{secrets.cloudflareApiToken}}' },
    { key: 'databaseId', section: 'Credentials', label: 'Database ID', placeholder: '{{secrets.cloudflareD1DatabaseId}}' },
    { key: 'sql', section: 'Query', label: 'SQL', type: 'textarea', rows: 10, placeholder: 'SELECT * FROM users WHERE id = ?' },
    { key: 'params', section: 'Query', label: 'Parameters JSON', type: 'json', placeholder: '["{{user.id}}"]', hint: 'Use an array for positional placeholders.' },
    ...commonNetworkFields,
  ],
};

const vercelKvDefinition: ServiceDefinition = {
  title: 'Vercel KV',
  description: 'Direct Upstash Redis REST requests using the Vercel KV REST API URL and bearer token.',
  operationOptions: [
    { value: 'get', label: 'Get' },
    { value: 'set', label: 'Set' },
    { value: 'del', label: 'Delete' },
    { value: 'lpush', label: 'LPush' },
  ],
  fields: [
    { key: 'restUrl', section: 'Credentials', label: 'REST URL', placeholder: '{{secrets.vercelKvRestUrl}}' },
    { key: 'token', section: 'Credentials', label: 'Token', type: 'password', placeholder: '{{secrets.vercelKvRestToken}}' },
    { key: 'key', section: 'Target', label: 'Key', placeholder: 'workflow:latest' },
    { key: 'value', section: 'Request', label: 'Value', type: 'textarea', rows: 6, hint: 'Used for Set and optional for LPush. Leave blank to use upstream input.', placeholder: '{\n  "status": "ok"\n}', when: (config) => config.operation === 'set' || config.operation === 'lpush' },
    { key: 'values', section: 'Request', label: 'Values JSON', type: 'json', placeholder: '["first", "second"]', hint: 'Optional array for LPush. Overrides the single Value field when provided.', when: (config) => config.operation === 'lpush' },
    ...commonNetworkFields,
  ],
};

const vercelBlobDefinition: ServiceDefinition = {
  title: 'Vercel Blob',
  description: 'Direct Vercel Blob REST requests using the blob API and token-derived store metadata.',
  operationOptions: [
    { value: 'put', label: 'Put blob' },
    { value: 'get', label: 'Get blob' },
    { value: 'delete', label: 'Delete blob' },
  ],
  fields: [
    { key: 'token', section: 'Credentials', label: 'Read-write token', type: 'password', placeholder: '{{secrets.blobReadWriteToken}}' },
    { key: 'access', section: 'Target', label: 'Access', type: 'select', options: accessOptions, defaultValue: 'private' },
    { key: 'pathname', section: 'Target', label: 'Pathname', placeholder: 'uploads/report.json', when: (config) => config.operation !== 'delete' || !config.url },
    { key: 'url', section: 'Target', label: 'Blob URL', hint: 'Optional for Get/Delete. If omitted, the pathname and token are used to construct the URL.', when: (config) => config.operation === 'get' || config.operation === 'delete' },
    { key: 'body', section: 'Request', label: 'Blob body', type: 'textarea', rows: 8, hint: 'Used for Put blob. Leave blank to use upstream input.', placeholder: '{\n  "uploaded": true\n}', when: (config) => config.operation === 'put' },
    { key: 'bodyEncoding', section: 'Request', label: 'Body encoding', type: 'select', options: [{ value: 'utf8', label: 'UTF-8 text / JSON' }, { value: 'base64', label: 'Base64 decode before upload' }], defaultValue: 'utf8', when: (config) => config.operation === 'put' },
    { key: 'contentType', section: 'Request', label: 'Content type', placeholder: 'application/json', when: (config) => config.operation === 'put' },
    boolField('addRandomSuffix', 'Request', 'Add random suffix', 'Recommended to avoid naming collisions.', false),
    boolField('allowOverwrite', 'Request', 'Allow overwrite', 'Enable overwriting an existing blob.', false),
    { key: 'cacheControlMaxAge', section: 'Request', label: 'Cache control max age (seconds)', type: 'number', when: (config) => config.operation === 'put' },
    { key: 'ifMatch', section: 'Request', label: 'If-Match ETag', when: (config) => config.operation === 'put' || config.operation === 'delete' },
    boolField('useCache', 'Request', 'Use cache for reads', 'Disable for strongly consistent private reads.', true),
    ...commonNetworkFields,
  ],
};

const netlifyDefinition: ServiceDefinition = {
  title: 'Netlify',
  description: 'Direct Netlify REST API requests for sites and deploy lifecycle operations.',
  operationOptions: [
    { value: 'listSites', label: 'List sites' },
    { value: 'getSite', label: 'Get site' },
    { value: 'listDeploys', label: 'List deploys' },
    { value: 'getDeploy', label: 'Get deploy' },
    { value: 'createDeploy', label: 'Create deploy' },
    { value: 'deleteSite', label: 'Delete site' },
  ],
  fields: [
    { key: 'accessToken', section: 'Credentials', label: 'Access token', type: 'password', placeholder: '{{secrets.netlifyAccessToken}}' },
    { key: 'siteId', section: 'Target', label: 'Site ID', placeholder: '{{secrets.netlifySiteId}}', when: (config) => config.operation !== 'listSites' && config.operation !== 'getDeploy' },
    { key: 'deployId', section: 'Target', label: 'Deploy ID', placeholder: '64f9d4b2c82a9b0008d1c999', when: (config) => config.operation === 'getDeploy' },
    { key: 'body', section: 'Request', label: 'Request body JSON', type: 'json', placeholder: '{\n  "files": {\n    "/index.html": "sha1-hash"\n  }\n}', hint: 'Used for Create deploy. Leave blank to use upstream input.', when: (config) => config.operation === 'createDeploy' },
    ...commonNetworkFields,
  ],
};

const railwayDefinition: ServiceDefinition = {
  title: 'Railway',
  description: 'Direct HTTP access for Railway public API GraphQL requests or Railway service endpoints with token-based authentication.',
  operationOptions: [
    { value: 'graphql', label: 'GraphQL API' },
    { value: 'request', label: 'Service request' },
  ],
  fields: [
    { key: 'token', section: 'Credentials', label: 'API token', type: 'password', placeholder: '{{secrets.railwayToken}}' },
    { key: 'tokenType', section: 'Credentials', label: 'Token type', type: 'select', options: [{ value: 'bearer', label: 'Bearer token' }, { value: 'project', label: 'Project access token' }], defaultValue: 'bearer' },
    { key: 'baseUrl', section: 'Target', label: 'Base URL / endpoint', placeholder: 'https://backboard.railway.app/graphql/v2' },
    { key: 'path', section: 'Target', label: 'Relative path', placeholder: '/internal/health', hint: 'Used for Service request. Can be omitted when Base URL already includes the full path.', when: (config) => config.operation === 'request' },
    { key: 'method', section: 'Request', label: 'HTTP method', type: 'select', options: httpMethodOptions, defaultValue: 'POST', when: (config) => config.operation === 'request' },
    { key: 'headers', section: 'Request', label: 'Headers JSON', type: 'json', placeholder: '{\n  "x-environment": "production"\n}', when: (config) => config.operation === 'request' },
    { key: 'body', section: 'Request', label: 'Request body JSON', type: 'json', placeholder: '{\n  "deploy": true\n}', hint: 'Used for Service request. Leave blank to use upstream input.', when: (config) => config.operation === 'request' },
    { key: 'query', section: 'Request', label: 'GraphQL query', type: 'textarea', rows: 10, placeholder: 'query { me { name email } }', when: (config) => config.operation === 'graphql' },
    { key: 'variables', section: 'Request', label: 'GraphQL variables JSON', type: 'json', placeholder: '{\n  "projectId": "{{project.id}}"\n}', when: (config) => config.operation === 'graphql' },
    ...commonNetworkFields,
  ],
};

const AwsS3Form = createServiceForm(awsS3Definition);
const AwsLambdaForm = createServiceForm(awsLambdaDefinition);
const AwsSqsForm = createServiceForm(awsSqsDefinition);
const AwsSnsForm = createServiceForm(awsSnsDefinition);
const GcpStorageForm = createServiceForm(gcpStorageDefinition);
const GcpPubSubForm = createServiceForm(gcpPubSubDefinition);
const AzureBlobForm = createServiceForm(azureBlobDefinition);
const AzureQueueForm = createServiceForm(azureQueueDefinition);
const CloudflareKvForm = createServiceForm(cloudflareKvDefinition);
const CloudflareR2Form = createServiceForm(cloudflareR2Definition);
const CloudflareD1Form = createServiceForm(cloudflareD1Definition);
const VercelKvForm = createServiceForm(vercelKvDefinition);
const VercelBlobForm = createServiceForm(vercelBlobDefinition);
const NetlifyForm = createServiceForm(netlifyDefinition);
const RailwayForm = createServiceForm(railwayDefinition);

// ── PandaStack ────────────────────────────────────────────────────────────────

const pandaStackCredentialFields: FieldDefinition[] = [
  {
    key: 'apiToken',
    section: 'Credentials',
    label: 'API token',
    type: 'password',
    placeholder: '{{secrets.PANDASTACK_API_TOKEN}}',
    hint: 'psk_... token from your PandaStack dashboard Settings → API Tokens.',
  },
  {
    key: 'baseUrl',
    section: 'Credentials',
    label: 'API base URL',
    placeholder: '{{secrets.PANDASTACK_API_URL}}',
    hint: 'Your PandaStack backend base URL — no trailing slash.',
  },
];

const pandaStackProjectDefinition: ServiceDefinition = {
  title: 'PandaStack · Project',
  credentialProviderId: 'pandastack',
  description: 'Manage PandaStack projects: list, get details, trigger a deployment, or delete.',
  operationOptions: [
    { value: 'listProjects', label: 'List all projects' },
    { value: 'getProject', label: 'Get project' },
    { value: 'deployProject', label: 'Deploy project' },
    { value: 'deleteProject', label: 'Delete project' },
  ],
  fields: [
    ...pandaStackCredentialFields,
    {
      key: 'projectId',
      section: 'Target',
      label: 'Project ID',
      placeholder: '42',
      hint: 'Required for Get, Deploy, and Delete operations.',
      when: (config) => ['getProject', 'deployProject', 'deleteProject'].includes(config.operation),
    },
    {
      key: 'body',
      section: 'Request',
      label: 'Request body JSON',
      type: 'json',
      placeholder: '{\n  "branch": "main"\n}',
      hint: 'Optional body for the Deploy operation. Leave blank to use upstream input.',
      when: (config) => config.operation === 'deployProject',
    },
    ...commonNetworkFields,
  ],
};

const pandaStackCronjobDefinition: ServiceDefinition = {
  title: 'PandaStack · Cronjob',
  credentialProviderId: 'pandastack',
  description: 'Manage PandaStack cronjobs: list, get details, create, trigger a run, or delete.',
  operationOptions: [
    { value: 'listCronjobs', label: 'List all cronjobs' },
    { value: 'getCronjob', label: 'Get cronjob' },
    { value: 'createCronjob', label: 'Create cronjob' },
    { value: 'triggerCronjob', label: 'Trigger cronjob now' },
    { value: 'deleteCronjob', label: 'Delete cronjob' },
  ],
  fields: [
    ...pandaStackCredentialFields,
    {
      key: 'cronjobId',
      section: 'Target',
      label: 'Cronjob ID',
      placeholder: '7',
      hint: 'Required for Get, Trigger, and Delete operations.',
      when: (config) => ['getCronjob', 'triggerCronjob', 'deleteCronjob'].includes(config.operation),
    },
    {
      key: 'body',
      section: 'Request',
      label: 'Request body JSON',
      type: 'json',
      placeholder: '{\n  "name": "nightly-sync",\n  "image": "my-org/worker:latest",\n  "schedule": "0 2 * * *"\n}',
      hint: 'Body for the Create cronjob operation. Leave blank to use upstream input.',
      when: (config) => config.operation === 'createCronjob',
    },
    ...commonNetworkFields,
  ],
};

const pandaStackDatabaseDefinition: ServiceDefinition = {
  title: 'PandaStack · Database',
  credentialProviderId: 'pandastack',
  description: 'Inspect PandaStack database instances: list all or get details for a specific database.',
  operationOptions: [
    { value: 'listDatabases', label: 'List all databases' },
    { value: 'getDatabase', label: 'Get database details' },
  ],
  fields: [
    ...pandaStackCredentialFields,
    {
      key: 'databaseId',
      section: 'Target',
      label: 'Database ID',
      placeholder: '3',
      hint: 'Required for the Get database details operation.',
      when: (config) => config.operation === 'getDatabase',
    },
    ...commonNetworkFields,
  ],
};

const pandaStackManagedAppDefinition: ServiceDefinition = {
  title: 'PandaStack · Managed App',
  credentialProviderId: 'pandastack',
  description: 'Manage PandaStack managed applications (WordPress/Drupal): list, deploy, check status, or delete.',
  operationOptions: [
    { value: 'listManagedApps', label: 'List all managed apps' },
    { value: 'deployManagedApp', label: 'Deploy managed app' },
    { value: 'getManagedAppStatus', label: 'Get deployment status' },
    { value: 'deleteManagedApp', label: 'Delete managed app' },
  ],
  fields: [
    ...pandaStackCredentialFields,
    {
      key: 'deploymentUuid',
      section: 'Target',
      label: 'Deployment UUID',
      placeholder: 'e4f9a2b1-...',
      hint: 'Required for Get deployment status.',
      when: (config) => config.operation === 'getManagedAppStatus',
    },
    {
      key: 'appId',
      section: 'Target',
      label: 'App ID',
      placeholder: '12',
      hint: 'Required for Delete managed app.',
      when: (config) => config.operation === 'deleteManagedApp',
    },
    {
      key: 'body',
      section: 'Request',
      label: 'Request body JSON',
      type: 'json',
      placeholder: '{\n  "app_type": "wordpress",\n  "plan": "standard"\n}',
      hint: 'Body for the Deploy managed app operation. Leave blank to use upstream input.',
      when: (config) => config.operation === 'deployManagedApp',
    },
    ...commonNetworkFields,
  ],
};

const PandaStackProjectForm = createServiceForm(pandaStackProjectDefinition);
const PandaStackCronjobForm = createServiceForm(pandaStackCronjobDefinition);
const PandaStackDatabaseForm = createServiceForm(pandaStackDatabaseDefinition);
const PandaStackManagedAppForm = createServiceForm(pandaStackManagedAppDefinition);

export const integrationCloudForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_AWS_S3]: AwsS3Form,
  [NodeType.INTEGRATION_AWS_LAMBDA]: AwsLambdaForm,
  [NodeType.INTEGRATION_AWS_SQS]: AwsSqsForm,
  [NodeType.INTEGRATION_AWS_SNS]: AwsSnsForm,
  [NodeType.INTEGRATION_GCP_STORAGE]: GcpStorageForm,
  [NodeType.INTEGRATION_GCP_PUBSUB]: GcpPubSubForm,
  [NodeType.INTEGRATION_AZURE_BLOB]: AzureBlobForm,
  [NodeType.INTEGRATION_AZURE_QUEUE]: AzureQueueForm,
  [NodeType.INTEGRATION_CLOUDFLARE_KV]: CloudflareKvForm,
  [NodeType.INTEGRATION_CLOUDFLARE_R2]: CloudflareR2Form,
  [NodeType.INTEGRATION_CLOUDFLARE_D1]: CloudflareD1Form,
  [NodeType.INTEGRATION_VERCEL_KV]: VercelKvForm,
  [NodeType.INTEGRATION_VERCEL_BLOB]: VercelBlobForm,
  [NodeType.INTEGRATION_NETLIFY]: NetlifyForm,
  [NodeType.INTEGRATION_RAILWAY]: RailwayForm,
  [NodeType.INTEGRATION_PANDASTACK_PROJECT]: PandaStackProjectForm,
  [NodeType.INTEGRATION_PANDASTACK_CRONJOB]: PandaStackCronjobForm,
  [NodeType.INTEGRATION_PANDASTACK_DATABASE]: PandaStackDatabaseForm,
  [NodeType.INTEGRATION_PANDASTACK_MANAGED_APP]: PandaStackManagedAppForm,
};
