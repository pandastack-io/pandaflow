/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { NodeFormProps } from './index';

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

function InterpolationHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Text fields support variable interpolation with <code>{'{{variable}}'}</code> syntax.
    </p>
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
    <Field label={label} hint={hint || 'Provide valid JSON. Interpolated strings are allowed inside values.'}>
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

function FooterFields({ config, onChange }: NodeFormProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Timeout (ms)" hint="All requests use fetchWithTimeout plus retry handling.">
        <Input
          type="number"
          value={config?.timeout ?? 30000}
          onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
        />
      </Field>
      <Field label="Retries" hint="Retries are applied around every REST request.">
        <Input
          type="number"
          value={config?.retries ?? 3}
          onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
        />
      </Field>
    </div>
  );
}

function GoogleAnalyticsForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'run_report';
  const isEventOperation = operation === 'send_event' || operation === 'debug_event';
  const isMetadataOperation = operation === 'get_metadata';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="run_report">Run report</SelectItem>
              <SelectItem value="run_realtime_report">Run realtime report</SelectItem>
              <SelectItem value="get_metadata">Get metadata</SelectItem>
              <SelectItem value="send_event">Send event</SelectItem>
              <SelectItem value="debug_event">Debug event</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Endpoint override" hint="Optional custom endpoint for proxying or region-specific routing.">
          <Input
            value={config?.endpoint || ''}
            onChange={(event) => updateConfig(config, onChange, 'endpoint', event.target.value)}
            placeholder={
              isEventOperation
                ? 'https://www.google-analytics.com/mp/collect'
                : 'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport'
            }
          />
        </Field>
      </div>

      {isEventOperation ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Measurement ID" hint="Required for Measurement Protocol event delivery.">
              <Input
                value={config?.measurementId || ''}
                onChange={(event) => updateConfig(config, onChange, 'measurementId', event.target.value)}
                placeholder="G-XXXXXXXXXX"
              />
            </Field>
            <Field label="API secret" hint="Store this as a secret-backed interpolated value.">
              <Input
                type="password"
                value={config?.apiSecret || ''}
                onChange={(event) => updateConfig(config, onChange, 'apiSecret', event.target.value)}
                placeholder="{{secrets.gaApiSecret}}"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Client ID" hint="Required for Measurement Protocol event payloads.">
              <Input
                value={config?.clientId || ''}
                onChange={(event) => updateConfig(config, onChange, 'clientId', event.target.value)}
                placeholder="555.1234567890"
              />
            </Field>
            <Field label="User ID" hint="Optional signed-in user identifier.">
              <Input
                value={config?.userId || ''}
                onChange={(event) => updateConfig(config, onChange, 'userId', event.target.value)}
                placeholder="{{user.id}}"
              />
            </Field>
          </div>

          <Section title="Event options">
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Non-personalized ads</div>
                <p className="text-xs text-muted-foreground">
                  Sets <code>non_personalized_ads</code> in the Measurement Protocol payload.
                </p>
              </div>
              <Switch
                checked={Boolean(config?.nonPersonalizedAds)}
                onCheckedChange={(checked) => updateConfig(config, onChange, 'nonPersonalizedAds', checked)}
              />
            </div>
          </Section>

          <JsonEditor
            label="Events"
            value={config?.events}
            onValidChange={(value) => updateConfig(config, onChange, 'events', value)}
            placeholder={'[\n  {\n    "name": "purchase",\n    "params": {\n      "currency": "USD",\n      "value": "{{order.total}}"\n    }\n  }\n]'}
            hint="Provide an array of Measurement Protocol events."
            rows={10}
          />
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Property ID" hint="Numeric GA4 property ID used by the Analytics Data API.">
              <Input
                value={config?.propertyId || ''}
                onChange={(event) => updateConfig(config, onChange, 'propertyId', event.target.value)}
                placeholder="123456789"
              />
            </Field>
            <Field label="Access token" hint="OAuth bearer token with Analytics Data API access.">
              <Input
                type="password"
                value={config?.accessToken || ''}
                onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
                placeholder="{{secrets.googleAccessToken}}"
              />
            </Field>
          </div>

          {!isMetadataOperation && (
            <JsonEditor
              label="Report request"
              value={config?.request}
              onValidChange={(value) => updateConfig(config, onChange, 'request', value)}
              placeholder={'{\n  "dimensions": [{ "name": "country" }],\n  "metrics": [{ "name": "activeUsers" }],\n  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "today" }]\n}'}
              hint="Paste a Google Analytics Data API request object."
              rows={10}
            />
          )}
        </>
      )}

      <FooterFields config={config} onChange={onChange} />
    </div>
  );
}

function MixpanelForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'track_event';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="track_event">Track event</SelectItem>
              <SelectItem value="track_batch">Track batch</SelectItem>
              <SelectItem value="profile_set">Profile set</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="API base URL" hint="Defaults to Mixpanel's public ingestion API.">
          <Input
            value={config?.baseUrl || 'https://api.mixpanel.com'}
            onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
            placeholder="https://api.mixpanel.com"
          />
        </Field>
      </div>

      <Field label="Project token" hint="Used inside the event payload and should typically come from secrets.">
        <Input
          type="password"
          value={config?.token || ''}
          onChange={(event) => updateConfig(config, onChange, 'token', event.target.value)}
          placeholder="{{secrets.mixpanelToken}}"
        />
      </Field>

      {operation === 'track_batch' ? (
        <JsonEditor
          label="Events"
          value={config?.events}
          onValidChange={(value) => updateConfig(config, onChange, 'events', value)}
          placeholder={'[\n  {\n    "event": "Order Completed",\n    "properties": {\n      "distinct_id": "{{user.id}}",\n      "amount": "{{order.total}}"\n    }\n  }\n]'}
          hint="Each event object can include event plus Mixpanel properties."
          rows={10}
        />
      ) : operation === 'profile_set' ? (
        <>
          <Field label="Distinct ID" hint="Required for Mixpanel profile updates.">
            <Input
              value={config?.distinctId || ''}
              onChange={(event) => updateConfig(config, onChange, 'distinctId', event.target.value)}
              placeholder="{{user.id}}"
            />
          </Field>
          <JsonEditor
            label="Profile properties"
            value={config?.profileProperties}
            onValidChange={(value) => updateConfig(config, onChange, 'profileProperties', value)}
            placeholder={'{\n  "plan": "pro",\n  "mrr": 199\n}'}
            hint="Mapped to Mixpanel's $set payload field."
            rows={8}
          />
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Event name">
              <Input
                value={config?.event || ''}
                onChange={(event) => updateConfig(config, onChange, 'event', event.target.value)}
                placeholder="Order Completed"
              />
            </Field>
            <Field label="Distinct ID">
              <Input
                value={config?.distinctId || ''}
                onChange={(event) => updateConfig(config, onChange, 'distinctId', event.target.value)}
                placeholder="{{user.id}}"
              />
            </Field>
          </div>
          <JsonEditor
            label="Properties"
            value={config?.properties}
            onValidChange={(value) => updateConfig(config, onChange, 'properties', value)}
            placeholder={'{\n  "source": "workflow",\n  "amount": "{{order.total}}"\n}'}
            rows={8}
          />
        </>
      )}

      <FooterFields config={config} onChange={onChange} />
    </div>
  );
}

function SegmentForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'track';
  const supportsName = operation === 'page' || operation === 'screen';
  const supportsEvent = operation === 'track';
  const supportsTraits = operation === 'identify' || operation === 'group';
  const supportsProperties = operation === 'track' || operation === 'page' || operation === 'screen';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="track">Track</SelectItem>
              <SelectItem value="identify">Identify</SelectItem>
              <SelectItem value="group">Group</SelectItem>
              <SelectItem value="page">Page</SelectItem>
              <SelectItem value="screen">Screen</SelectItem>
              <SelectItem value="alias">Alias</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="API base URL" hint="Defaults to Segment's HTTP Tracking API.">
          <Input
            value={config?.baseUrl || 'https://api.segment.io/v1'}
            onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
            placeholder="https://api.segment.io/v1"
          />
        </Field>
      </div>

      <Field label="Write key" hint="Sent via HTTP Basic auth.">
        <Input
          type="password"
          value={config?.writeKey || ''}
          onChange={(event) => updateConfig(config, onChange, 'writeKey', event.target.value)}
          placeholder="{{secrets.segmentWriteKey}}"
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="User ID" hint="Optional when anonymousId is provided.">
          <Input
            value={config?.userId || ''}
            onChange={(event) => updateConfig(config, onChange, 'userId', event.target.value)}
            placeholder="{{user.id}}"
          />
        </Field>
        <Field label="Anonymous ID">
          <Input
            value={config?.anonymousId || ''}
            onChange={(event) => updateConfig(config, onChange, 'anonymousId', event.target.value)}
            placeholder="{{session.id}}"
          />
        </Field>
      </div>

      {operation === 'group' && (
        <Field label="Group ID">
          <Input
            value={config?.groupId || ''}
            onChange={(event) => updateConfig(config, onChange, 'groupId', event.target.value)}
            placeholder="org_123"
          />
        </Field>
      )}

      {operation === 'alias' && (
        <Field label="Previous ID" hint="Segment alias links an old identifier to the current userId/anonymousId.">
          <Input
            value={config?.previousId || ''}
            onChange={(event) => updateConfig(config, onChange, 'previousId', event.target.value)}
            placeholder="legacy_user_123"
          />
        </Field>
      )}

      {supportsEvent && (
        <Field label="Event name">
          <Input
            value={config?.event || ''}
            onChange={(event) => updateConfig(config, onChange, 'event', event.target.value)}
            placeholder="Order Completed"
          />
        </Field>
      )}

      {supportsName && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <Input
              value={config?.name || ''}
              onChange={(event) => updateConfig(config, onChange, 'name', event.target.value)}
              placeholder={operation === 'page' ? 'Pricing' : 'Onboarding'}
            />
          </Field>
          <Field label="Category">
            <Input
              value={config?.category || ''}
              onChange={(event) => updateConfig(config, onChange, 'category', event.target.value)}
              placeholder="marketing"
            />
          </Field>
        </div>
      )}

      {supportsTraits && (
        <JsonEditor
          label="Traits"
          value={config?.traits}
          onValidChange={(value) => updateConfig(config, onChange, 'traits', value)}
          placeholder={'{\n  "plan": "pro",\n  "team": "growth"\n}'}
          rows={8}
        />
      )}

      {supportsProperties && (
        <JsonEditor
          label="Properties"
          value={config?.properties}
          onValidChange={(value) => updateConfig(config, onChange, 'properties', value)}
          placeholder={'{\n  "amount": "{{order.total}}",\n  "currency": "USD"\n}'}
          rows={8}
        />
      )}

      <Section title="Optional metadata">
        <JsonEditor
          label="Context"
          value={config?.context}
          onValidChange={(value) => updateConfig(config, onChange, 'context', value)}
          placeholder={'{\n  "ip": "{{request.ip}}",\n  "library": { "name": "workflow" }\n}'}
          rows={6}
        />
        <JsonEditor
          label="Integrations"
          value={config?.integrations}
          onValidChange={(value) => updateConfig(config, onChange, 'integrations', value)}
          placeholder={'{\n  "All": true\n}'}
          rows={4}
        />
      </Section>

      <FooterFields config={config} onChange={onChange} />
    </div>
  );
}

function AmplitudeForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'track_event';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="track_event">Track event</SelectItem>
              <SelectItem value="track_batch">Track batch</SelectItem>
              <SelectItem value="identify">Identify</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="API base URL" hint="Defaults to the Amplitude HTTP API v2 hostname.">
          <Input
            value={config?.baseUrl || 'https://api2.amplitude.com'}
            onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
            placeholder="https://api2.amplitude.com"
          />
        </Field>
      </div>

      <Field label="API key" hint="Amplitude project API key.">
        <Input
          type="password"
          value={config?.apiKey || ''}
          onChange={(event) => updateConfig(config, onChange, 'apiKey', event.target.value)}
          placeholder="{{secrets.amplitudeApiKey}}"
        />
      </Field>

      {operation === 'track_batch' ? (
        <JsonEditor
          label="Events"
          value={config?.events}
          onValidChange={(value) => updateConfig(config, onChange, 'events', value)}
          placeholder={'[\n  {\n    "event_type": "Order Completed",\n    "user_id": "{{user.id}}",\n    "event_properties": {\n      "amount": "{{order.total}}"\n    }\n  }\n]'}
          rows={10}
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="User ID">
              <Input
                value={config?.userId || ''}
                onChange={(event) => updateConfig(config, onChange, 'userId', event.target.value)}
                placeholder="{{user.id}}"
              />
            </Field>
            <Field label="Device ID">
              <Input
                value={config?.deviceId || ''}
                onChange={(event) => updateConfig(config, onChange, 'deviceId', event.target.value)}
                placeholder="{{device.id}}"
              />
            </Field>
          </div>

          {operation === 'track_event' && (
            <Field label="Event type">
              <Input
                value={config?.eventType || ''}
                onChange={(event) => updateConfig(config, onChange, 'eventType', event.target.value)}
                placeholder="Order Completed"
              />
            </Field>
          )}

          <JsonEditor
            label={operation === 'identify' ? 'User properties' : 'Event properties'}
            value={operation === 'identify' ? config?.userProperties : config?.eventProperties}
            onValidChange={(value) =>
              updateConfig(config, onChange, operation === 'identify' ? 'userProperties' : 'eventProperties', value)
            }
            placeholder={'{\n  "plan": "pro",\n  "amount": "{{order.total}}"\n}'}
            rows={8}
          />

          {operation === 'track_event' && (
            <JsonEditor
              label="User properties"
              value={config?.userProperties}
              onValidChange={(value) => updateConfig(config, onChange, 'userProperties', value)}
              placeholder={'{\n  "tier": "enterprise"\n}'}
              rows={6}
            />
          )}
        </>
      )}

      <JsonEditor
        label="Options"
        value={config?.options}
        onValidChange={(value) => updateConfig(config, onChange, 'options', value)}
        placeholder={'{\n  "min_id_length": 5\n}'}
        hint="Optional top-level Amplitude request options."
        rows={4}
      />

      <FooterFields config={config} onChange={onChange} />
    </div>
  );
}

function PostHogForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'capture';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Operation">
          <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="capture">Capture</SelectItem>
              <SelectItem value="identify">Identify</SelectItem>
              <SelectItem value="alias">Alias</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="API base URL" hint="Use your PostHog instance host, including self-hosted deployments.">
          <Input
            value={config?.baseUrl || 'https://us.i.posthog.com'}
            onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
            placeholder="https://us.i.posthog.com"
          />
        </Field>
      </div>

      <Field label="Project API key" hint="Public project key used by PostHog ingestion endpoints.">
        <Input
          type="password"
          value={config?.apiKey || ''}
          onChange={(event) => updateConfig(config, onChange, 'apiKey', event.target.value)}
          placeholder="{{secrets.posthogApiKey}}"
        />
      </Field>

      <Field label="Distinct ID">
        <Input
          value={config?.distinctId || ''}
          onChange={(event) => updateConfig(config, onChange, 'distinctId', event.target.value)}
          placeholder="{{user.id}}"
        />
      </Field>

      {operation === 'capture' && (
        <>
          <Field label="Event name">
            <Input
              value={config?.event || ''}
              onChange={(event) => updateConfig(config, onChange, 'event', event.target.value)}
              placeholder="Order Completed"
            />
          </Field>
          <JsonEditor
            label="Properties"
            value={config?.properties}
            onValidChange={(value) => updateConfig(config, onChange, 'properties', value)}
            placeholder={'{\n  "$set": {\n    "plan": "pro"\n  },\n  "amount": "{{order.total}}"\n}'}
            rows={8}
          />
        </>
      )}

      {operation === 'identify' && (
        <>
          <JsonEditor
            label="Properties"
            value={config?.properties}
            onValidChange={(value) => updateConfig(config, onChange, 'properties', value)}
            placeholder={'{\n  "email": "{{user.email}}",\n  "plan": "pro"\n}'}
            rows={8}
          />
          <JsonEditor
            label="Set properties"
            value={config?.set}
            onValidChange={(value) => updateConfig(config, onChange, 'set', value)}
            placeholder={'{\n  "lifecycle_stage": "customer"\n}'}
            hint="Optional additional properties sent in PostHog's set field."
            rows={6}
          />
        </>
      )}

      {operation === 'alias' && (
        <Field label="Alias" hint="The new alias to connect to the existing distinct ID.">
          <Input
            value={config?.alias || ''}
            onChange={(event) => updateConfig(config, onChange, 'alias', event.target.value)}
            placeholder="crm_{{user.id}}"
          />
        </Field>
      )}

      <FooterFields config={config} onChange={onChange} />
    </div>
  );
}

export const integrationAnalyticsForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_GOOGLE_ANALYTICS]: GoogleAnalyticsForm,
  [NodeType.INTEGRATION_MIXPANEL]: MixpanelForm,
  [NodeType.INTEGRATION_SEGMENT]: SegmentForm,
  [NodeType.INTEGRATION_AMPLITUDE]: AmplitudeForm,
  [NodeType.INTEGRATION_POSTHOG]: PostHogForm,
};
