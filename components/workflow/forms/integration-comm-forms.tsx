/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
      Variable interpolation is supported in all string fields using <code>{'{{variable}}'}</code> syntax.
    </HelperText>
  );
}

function JsonEditor({
  label,
  value,
  onValidChange,
  placeholder,
  rows = 5,
  hint,
}: {
  label: string;
  value: any;
  onValidChange: (value: any) => void;
  placeholder: string;
  rows?: number;
  hint?: string;
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

function CommCredentialFields({ config, onChange, providerId }: NodeFormProps & { providerId?: string }) {
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

function TextField({
  label,
  config,
  onChange,
  field,
  placeholder,
  hint,
  type = 'text',
}: {
  label: string;
  config: any;
  onChange: (config: any) => void;
  field: string;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type={type}
        value={config?.[field] || ''}
        onChange={(event) => updateConfig(config, onChange, field, event.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function NumberField({
  label,
  config,
  onChange,
  field,
  hint,
  placeholder,
}: {
  label: string;
  config: any;
  onChange: (config: any) => void;
  field: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={config?.[field] ?? ''}
        onChange={(event) =>
          updateConfig(config, onChange, field, event.target.value ? Number(event.target.value) : undefined)
        }
        placeholder={placeholder}
      />
    </Field>
  );
}

function ToggleField({
  label,
  checked,
  onCheckedChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex h-10 items-center">
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </Field>
  );
}

function TimeoutRetryFields({ config, onChange }: NodeFormProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <NumberField
        label="Timeout (ms)"
        config={config}
        onChange={onChange}
        field="timeout"
        hint="Used by the executor timeout wrapper."
      />
      <NumberField
        label="Retries"
        config={config}
        onChange={onChange}
        field="retries"
        hint="Retries use the shared REST retry helper."
      />
    </div>
  );
}

function EmailMessageFields({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'send';

  return (
    <Section title="Message">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="From" config={config} onChange={onChange} field="from" placeholder="Ops <ops@example.com>" />
        <TextField label="From name" config={config} onChange={onChange} field="fromName" placeholder="Ops Bot" />
        <TextField
          label="To"
          config={config}
          onChange={onChange}
          field="to"
          placeholder="user@example.com, admin@example.com"
          hint="Comma or newline separated recipients."
        />
        <TextField label="Reply-To" config={config} onChange={onChange} field="replyTo" placeholder="support@example.com" />
        <TextField label="CC" config={config} onChange={onChange} field="cc" placeholder="finance@example.com" />
        <TextField label="BCC" config={config} onChange={onChange} field="bcc" placeholder="audit@example.com" />
      </div>

      {operation === 'template' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Template ID / name"
              config={config}
              onChange={onChange}
              field="templateId"
              placeholder="d-1234567890abcdef"
              hint="Used by SendGrid; Mailgun also accepts templateName."
            />
            <TextField
              label="Template name override"
              config={config}
              onChange={onChange}
              field="templateName"
              placeholder="welcome-email"
              hint="Used by Mailgun templates."
            />
          </div>
          <JsonEditor
            label="Template data"
            value={config?.templateData}
            onValidChange={(value) => updateConfig(config, onChange, 'templateData', value)}
            placeholder={'{\n  "firstName": "{{customer.firstName}}"\n}'}
            rows={6}
          />
        </>
      ) : (
        <>
          <TextField
            label="Subject"
            config={config}
            onChange={onChange}
            field="subject"
            placeholder="Order update for {{customer.email}}"
          />
          <Field label="Text body" hint="Plain text fallback for email clients.">
            <Textarea
              value={config?.text || ''}
              rows={5}
              onChange={(event) => updateConfig(config, onChange, 'text', event.target.value)}
              placeholder="Your order is on the way."
            />
          </Field>
          <Field label="HTML body" hint="Optional rich HTML email body.">
            <Textarea
              value={config?.html || ''}
              rows={8}
              onChange={(event) => updateConfig(config, onChange, 'html', event.target.value)}
              placeholder={'<p>Hello {{customer.firstName}},</p>'}
              className="font-mono text-xs"
            />
          </Field>
        </>
      )}

      <JsonEditor
        label="Message headers"
        value={config?.messageHeaders}
        onValidChange={(value) => updateConfig(config, onChange, 'messageHeaders', value)}
        placeholder={'{\n  "X-Workflow-Id": "{{workflow.id}}"\n}'}
        rows={4}
      />
      <JsonEditor
        label="Attachments"
        value={config?.attachments}
        onValidChange={(value) => updateConfig(config, onChange, 'attachments', value)}
        placeholder={'[\n  {\n    "filename": "invoice.pdf",\n    "type": "application/pdf",\n    "content": "<base64>"\n  }\n]'}
        rows={6}
        hint="Use provider-supported attachment shapes. SendGrid accepts base64 attachment objects."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Tags"
          config={config}
          onChange={onChange}
          field="tags"
          placeholder="billing, critical"
          hint="Comma separated provider tags/categories."
        />
      </div>
      <JsonEditor
        label="Metadata"
        value={config?.metadata}
        onValidChange={(value) => updateConfig(config, onChange, 'metadata', value)}
        placeholder={'{\n  "orderId": "{{order.id}}"\n}'}
        rows={4}
      />
    </Section>
  );
}

function EmailProviderFields({
  config,
  onChange,
  fixedProvider,
}: NodeFormProps & { fixedProvider?: 'smtp' | 'sendgrid' | 'mailgun' }) {
  const provider = (config?.provider || 'sendgrid') as 'smtp' | 'sendgrid' | 'mailgun';
  const activeProvider = fixedProvider || provider;
  const operation = config?.operation || 'send';

  return (
    <>
      <CommCredentialFields
        config={config}
        onChange={onChange}
        providerId={activeProvider === 'sendgrid' ? 'sendgrid' : activeProvider === 'mailgun' ? 'mailgun' : activeProvider === 'smtp' ? 'smtp' : undefined}
      />
      <Section title="Provider">
        {!fixedProvider ? (
          <Field label="Email provider" hint="Generic email routes to the selected REST transport.">
            <Select value={provider} onValueChange={(value) => updateConfig(config, onChange, 'provider', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smtp">SMTP bridge</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="mailgun">Mailgun</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <HelperText>
            {activeProvider === 'smtp'
              ? 'SMTP uses a configurable HTTP bridge because executor HTTP calls are fetch-only.'
              : `${activeProvider} REST configuration`}
          </HelperText>
        )}

        {activeProvider !== 'smtp' ? (
          <Field label="Operation" hint="Template mode uses provider-side templates and JSON variables.">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send">Send message</SelectItem>
                <SelectItem value="template">Send template</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {activeProvider === 'smtp' ? (
          <>
            <TextField
              label="Bridge API URL"
              config={config}
              onChange={onChange}
              field="apiUrl"
              placeholder="https://mailer.internal.example/send"
              hint="REST endpoint that accepts SMTP credentials plus the message payload."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="SMTP host" config={config} onChange={onChange} field="smtpHost" placeholder="smtp.example.com" />
              <NumberField label="SMTP port" config={config} onChange={onChange} field="smtpPort" placeholder="587" />
              <TextField label="SMTP username" config={config} onChange={onChange} field="smtpUsername" placeholder="apikey" />
              <TextField
                label="SMTP password"
                config={config}
                onChange={onChange}
                field="smtpPassword"
                type="password"
                placeholder="{{secrets.smtpPassword}}"
              />
            </div>
            <ToggleField
              label="Use TLS / secure transport"
              checked={Boolean(config?.secure)}
              onCheckedChange={(checked) => updateConfig(config, onChange, 'secure', checked)}
              hint="Sent to the SMTP bridge request payload."
            />
            <JsonEditor
              label="Bridge request headers"
              value={config?.requestHeaders}
              onValidChange={(value) => updateConfig(config, onChange, 'requestHeaders', value)}
              placeholder={'{\n  "X-Bridge-Key": "{{secrets.bridgeKey}}"\n}'}
              rows={4}
              hint="Optional REST headers for the bridge itself."
            />
            <JsonEditor
              label="Extra bridge payload"
              value={config?.extraPayload}
              onValidChange={(value) => updateConfig(config, onChange, 'extraPayload', value)}
              placeholder={'{\n  "tracking": true\n}'}
              rows={4}
            />
          </>
        ) : null}

        {activeProvider === 'sendgrid' ? (
          <TextField
            label="SendGrid API key"
            config={config}
            onChange={onChange}
            field="apiKey"
            type="password"
            placeholder="{{secrets.sendgridApiKey}}"
            hint="Uses the v3 Mail Send REST API."
          />
        ) : null}

        {activeProvider === 'mailgun' ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Mailgun domain" config={config} onChange={onChange} field="domain" placeholder="mg.example.com" />
              <TextField
                label="Mailgun API key"
                config={config}
                onChange={onChange}
                field="apiKey"
                type="password"
                placeholder="{{secrets.mailgunApiKey}}"
              />
            </div>
            <TextField
              label="Mailgun API base URL"
              config={config}
              onChange={onChange}
              field="apiBaseUrl"
              placeholder="https://api.mailgun.net"
              hint="Override only for EU or custom Mailgun regions."
            />
          </>
        ) : null}
      </Section>
      <EmailMessageFields config={config} onChange={onChange} />
    </>
  );
}

function EmailForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <EmailProviderFields {...props} />
      <TimeoutRetryFields {...props} />
    </div>
  );
}

function SmtpForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <EmailProviderFields {...props} fixedProvider="smtp" />
      <TimeoutRetryFields {...props} />
    </div>
  );
}

function SendGridForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <EmailProviderFields {...props} fixedProvider="sendgrid" />
      <TimeoutRetryFields {...props} />
    </div>
  );
}

function MailgunForm(props: NodeFormProps) {
  return (
    <div className="space-y-4">
      <InterpolationHint />
      <EmailProviderFields {...props} fixedProvider="mailgun" />
      <TimeoutRetryFields {...props} />
    </div>
  );
}

function SlackForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'chat.postMessage';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId="slack" />
      <Field label="Operation" hint="Use incoming webhook for simple alerts or chat.postMessage for richer bot messages.">
        <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat.postMessage">chat.postMessage</SelectItem>
            <SelectItem value="webhook">Incoming webhook</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Section title="Connection">
        {operation === 'webhook' ? (
          <TextField
            label="Webhook URL"
            config={config}
            onChange={onChange}
            field="webhookUrl"
            type="password"
            placeholder="https://hooks.slack.com/services/..."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Bot token"
              config={config}
              onChange={onChange}
              field="botToken"
              type="password"
              placeholder="{{secrets.slackBotToken}}"
            />
            <TextField label="Channel" config={config} onChange={onChange} field="channel" placeholder="#alerts" />
          </div>
        )}
      </Section>

      <Section title="Message">
        <Field label="Text" hint="Required fallback text even when blocks are provided.">
          <Textarea
            value={config?.text || ''}
            rows={4}
            onChange={(event) => updateConfig(config, onChange, 'text', event.target.value)}
            placeholder="Deployment finished for {{env.name}}"
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Username override" config={config} onChange={onChange} field="username" placeholder="Workflow Bot" />
          <TextField label="Thread TS" config={config} onChange={onChange} field="threadTs" placeholder="1718045486.123456" />
        </div>
        <TextField label="Icon emoji" config={config} onChange={onChange} field="iconEmoji" placeholder=":robot_face:" />
        <JsonEditor
          label="Blocks"
          value={config?.blocks}
          onValidChange={(value) => updateConfig(config, onChange, 'blocks', value)}
          placeholder={'[\n  {\n    "type": "section",\n    "text": { "type": "mrkdwn", "text": "*Hello*" }\n  }\n]'}
          rows={8}
        />
        <JsonEditor
          label="Attachments"
          value={config?.attachments}
          onValidChange={(value) => updateConfig(config, onChange, 'attachments', value)}
          placeholder={'[\n  {\n    "color": "#22c55e",\n    "text": "Build passed"\n  }\n]'}
          rows={6}
        />
        <JsonEditor
          label="Metadata"
          value={config?.metadata}
          onValidChange={(value) => updateConfig(config, onChange, 'metadata', value)}
          placeholder={'{\n  "runId": "{{run.id}}"\n}'}
          rows={4}
        />
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

function DiscordForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'webhook';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId="discord" />
      <Field
        label="Operation"
        hint="Webhook mode is best for lightweight notifications. Bot mode posts directly to a channel."
      >
        <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="channelMessage">Channel message</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Section title="Connection">
        {operation === 'channelMessage' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Bot token"
              config={config}
              onChange={onChange}
              field="botToken"
              type="password"
              placeholder="{{secrets.discordBotToken}}"
            />
            <TextField
              label="Channel ID"
              config={config}
              onChange={onChange}
              field="channelId"
              placeholder="123456789012345678"
            />
          </div>
        ) : (
          <>
            <TextField
              label="Webhook URL"
              config={config}
              onChange={onChange}
              field="webhookUrl"
              type="password"
              placeholder="https://discord.com/api/webhooks/..."
            />
            <ToggleField
              label="Wait for response body"
              checked={config?.waitResponse !== false}
              onCheckedChange={(checked) => updateConfig(config, onChange, 'waitResponse', checked)}
              hint="Adds ?wait=true to webhook requests so message metadata is returned."
            />
          </>
        )}
      </Section>

      <Section title="Message">
        <Field label="Content">
          <Textarea
            value={config?.content || ''}
            rows={4}
            onChange={(event) => updateConfig(config, onChange, 'content', event.target.value)}
            placeholder="Release completed successfully."
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Username override" config={config} onChange={onChange} field="username" placeholder="Workflow Bot" />
          <TextField label="Avatar URL" config={config} onChange={onChange} field="avatarUrl" placeholder="https://example.com/bot.png" />
        </div>
        <ToggleField label="Text-to-speech" checked={Boolean(config?.tts)} onCheckedChange={(checked) => updateConfig(config, onChange, 'tts', checked)} />
        <JsonEditor
          label="Embeds"
          value={config?.embeds}
          onValidChange={(value) => updateConfig(config, onChange, 'embeds', value)}
          placeholder={'[\n  {\n    "title": "Deployment",\n    "description": "Success"\n  }\n]'}
          rows={8}
        />
        <JsonEditor
          label="Components"
          value={config?.components}
          onValidChange={(value) => updateConfig(config, onChange, 'components', value)}
          placeholder={'[\n  {\n    "type": 1,\n    "components": []\n  }\n]'}
          rows={6}
        />
        <JsonEditor
          label="Allowed mentions"
          value={config?.allowedMentions}
          onValidChange={(value) => updateConfig(config, onChange, 'allowedMentions', value)}
          placeholder={'{\n  "parse": ["users"]\n}'}
          rows={4}
        />
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

function TelegramForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'sendMessage';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId="telegram" />
      <Field label="Operation" hint="sendPhoto expects a remote photo URL or Telegram file_id.">
        <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sendMessage">sendMessage</SelectItem>
            <SelectItem value="sendPhoto">sendPhoto</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Section title="Connection">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Bot token"
            config={config}
            onChange={onChange}
            field="botToken"
            type="password"
            placeholder="{{secrets.telegramBotToken}}"
          />
          <TextField label="Chat ID" config={config} onChange={onChange} field="chatId" placeholder="-1001234567890" />
        </div>
      </Section>

      <Section title="Message">
        {operation === 'sendPhoto' ? (
          <>
            <TextField
              label="Photo URL / file_id"
              config={config}
              onChange={onChange}
              field="photo"
              placeholder="https://example.com/image.png"
            />
            <Field label="Caption">
              <Textarea
                value={config?.caption || ''}
                rows={4}
                onChange={(event) => updateConfig(config, onChange, 'caption', event.target.value)}
                placeholder="Photo caption"
              />
            </Field>
          </>
        ) : (
          <Field label="Text">
            <Textarea
              value={config?.text || ''}
              rows={4}
              onChange={(event) => updateConfig(config, onChange, 'text', event.target.value)}
              placeholder="Hello from {{workflow.name}}"
            />
          </Field>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Parse mode"
            config={config}
            onChange={onChange}
            field="parseMode"
            placeholder="MarkdownV2"
            hint="Optional: MarkdownV2 or HTML."
          />
        </div>
        <ToggleField
          label="Disable web page preview"
          checked={Boolean(config?.disableWebPagePreview)}
          onCheckedChange={(checked) => updateConfig(config, onChange, 'disableWebPagePreview', checked)}
        />
        <JsonEditor
          label="Reply markup"
          value={config?.replyMarkup}
          onValidChange={(value) => updateConfig(config, onChange, 'replyMarkup', value)}
          placeholder={'{\n  "inline_keyboard": [[{ "text": "Open", "url": "https://example.com" }]]\n}'}
          rows={6}
        />
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

function WhatsAppForm({ config, onChange }: NodeFormProps) {
  const provider = config?.provider || 'meta';
  const operation = config?.operation || 'text';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId={provider === 'twilio' ? 'twilio' : 'whatsapp'} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Provider" hint="Meta uses WhatsApp Cloud API. Twilio reuses the Twilio REST Messages API.">
          <Select value={provider} onValueChange={(value) => updateConfig(config, onChange, 'provider', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">Meta Cloud API</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Operation" hint="Template mode is available for Meta Cloud API.">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text message</SelectItem>
              {provider === 'meta' ? <SelectItem value="template">Template message</SelectItem> : null}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Section title="Connection">
        {provider === 'twilio' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Account SID"
              config={config}
              onChange={onChange}
              field="accountSid"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <TextField
              label="Auth token"
              config={config}
              onChange={onChange}
              field="authToken"
              type="password"
              placeholder="{{secrets.twilioAuthToken}}"
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Access token"
              config={config}
              onChange={onChange}
              field="accessToken"
              type="password"
              placeholder="{{secrets.whatsappAccessToken}}"
            />
            <TextField
              label="Phone number ID"
              config={config}
              onChange={onChange}
              field="phoneNumberId"
              placeholder="123456789012345"
            />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="From"
            config={config}
            onChange={onChange}
            field="from"
            placeholder="+14155551234 or whatsapp:+14155551234"
            hint={provider === 'twilio' ? 'Twilio sender. whatsapp: prefix is optional.' : 'Ignored by Meta Cloud API.'}
          />
          <TextField label="To" config={config} onChange={onChange} field="to" placeholder="+14155559876" />
        </div>
      </Section>

      <Section title="Message">
        {provider === 'meta' && operation === 'template' ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="Template name"
                config={config}
                onChange={onChange}
                field="templateName"
                placeholder="order_update"
              />
              <TextField
                label="Language code"
                config={config}
                onChange={onChange}
                field="languageCode"
                placeholder="en_US"
              />
            </div>
            <JsonEditor
              label="Template components"
              value={config?.components}
              onValidChange={(value) => updateConfig(config, onChange, 'components', value)}
              placeholder={'[\n  {\n    "type": "body",\n    "parameters": [{ "type": "text", "text": "{{customer.firstName}}" }]\n  }\n]'}
              rows={8}
            />
          </>
        ) : (
          <>
            <Field label="Body">
              <Textarea
                value={config?.body || ''}
                rows={4}
                onChange={(event) => updateConfig(config, onChange, 'body', event.target.value)}
                placeholder="Your verification code is {{otp.code}}"
              />
            </Field>
            {provider === 'meta' ? (
              <ToggleField
                label="Preview URL"
                checked={Boolean(config?.previewUrl)}
                onCheckedChange={(checked) => updateConfig(config, onChange, 'previewUrl', checked)}
              />
            ) : null}
          </>
        )}
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

function TwilioForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'sms';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId="twilio" />
      <Field label="Operation" hint="Choose Messages API or Calls API behavior.">
        <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sms">SMS / MMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp message</SelectItem>
            <SelectItem value="call">Voice call</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Section title="Credentials">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Account SID"
            config={config}
            onChange={onChange}
            field="accountSid"
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <TextField
            label="Auth token"
            config={config}
            onChange={onChange}
            field="authToken"
            type="password"
            placeholder="{{secrets.twilioAuthToken}}"
          />
        </div>
      </Section>

      <Section title="Request">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="From"
            config={config}
            onChange={onChange}
            field="from"
            placeholder={operation === 'whatsapp' ? 'whatsapp:+14155551234' : '+14155551234'}
            hint={operation === 'whatsapp' ? 'whatsapp: prefix is optional.' : undefined}
          />
          <TextField
            label="To"
            config={config}
            onChange={onChange}
            field="to"
            placeholder={operation === 'whatsapp' ? 'whatsapp:+14155559876' : '+14155559876'}
            hint={operation === 'whatsapp' ? 'whatsapp: prefix is optional.' : undefined}
          />
        </div>

        {operation === 'call' ? (
          <>
            <TextField
              label="TwiML URL"
              config={config}
              onChange={onChange}
              field="url"
              placeholder="https://example.com/twiml"
              hint="Required unless inline TwiML is provided."
            />
            <Field label="Inline TwiML" hint="Optional. When provided it overrides the URL field.">
              <Textarea
                value={config?.twiml || ''}
                rows={6}
                onChange={(event) => updateConfig(config, onChange, 'twiml', event.target.value)}
                placeholder={'<Response><Say>Hello world</Say></Response>'}
                className="font-mono text-xs"
              />
            </Field>
            <TextField label="HTTP method" config={config} onChange={onChange} field="method" placeholder="POST" />
          </>
        ) : (
          <>
            <Field label="Body">
              <Textarea
                value={config?.body || ''}
                rows={4}
                onChange={(event) => updateConfig(config, onChange, 'body', event.target.value)}
                placeholder="Workflow completed successfully."
              />
            </Field>
            <TextField
              label="Messaging Service SID"
              config={config}
              onChange={onChange}
              field="messagingServiceSid"
              placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <TextField
              label="Status callback URL"
              config={config}
              onChange={onChange}
              field="statusCallback"
              placeholder="https://example.com/twilio-status"
            />
            <TextField
              label="Media URLs"
              config={config}
              onChange={onChange}
              field="mediaUrl"
              placeholder="https://example.com/image.png, https://example.com/manual.pdf"
              hint="Comma separated MediaUrl values for MMS/WhatsApp."
            />
          </>
        )}
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

function SmsForm({ config, onChange }: NodeFormProps) {
  const provider = config?.provider || 'twilio';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <CommCredentialFields config={config} onChange={onChange} providerId="twilio" />
      <Field label="Provider" hint="Generic SMS routes through the selected REST transport.">
        <Select value={provider} onValueChange={(value) => updateConfig(config, onChange, 'provider', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="twilio">Twilio</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Section title="Credentials">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Account SID"
            config={config}
            onChange={onChange}
            field="accountSid"
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <TextField
            label="Auth token"
            config={config}
            onChange={onChange}
            field="authToken"
            type="password"
            placeholder="{{secrets.twilioAuthToken}}"
          />
        </div>
      </Section>

      <Section title="Message">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="From" config={config} onChange={onChange} field="from" placeholder="+14155551234" />
          <TextField label="To" config={config} onChange={onChange} field="to" placeholder="+14155559876" />
        </div>
        <Field label="Body">
          <Textarea
            value={config?.body || ''}
            rows={4}
            onChange={(event) => updateConfig(config, onChange, 'body', event.target.value)}
            placeholder="Your code is {{otp.code}}"
          />
        </Field>
        <TextField
          label="Messaging Service SID"
          config={config}
          onChange={onChange}
          field="messagingServiceSid"
          placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <TextField
          label="Status callback URL"
          config={config}
          onChange={onChange}
          field="statusCallback"
          placeholder="https://example.com/twilio-status"
        />
        <TextField
          label="Media URLs"
          config={config}
          onChange={onChange}
          field="mediaUrl"
          placeholder="https://example.com/image.png"
          hint="Optional comma separated URLs for MMS."
        />
      </Section>

      <TimeoutRetryFields config={config} onChange={onChange} />
    </div>
  );
}

export const integrationCommForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_EMAIL]: EmailForm,
  [NodeType.INTEGRATION_SMTP]: SmtpForm,
  [NodeType.INTEGRATION_SENDGRID]: SendGridForm,
  [NodeType.INTEGRATION_MAILGUN]: MailgunForm,
  [NodeType.INTEGRATION_SLACK]: SlackForm,
  [NodeType.INTEGRATION_DISCORD]: DiscordForm,
  [NodeType.INTEGRATION_TELEGRAM]: TelegramForm,
  [NodeType.INTEGRATION_WHATSAPP]: WhatsAppForm,
  [NodeType.INTEGRATION_TWILIO]: TwilioForm,
  [NodeType.INTEGRATION_SMS]: SmsForm,
};
