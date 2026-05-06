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
  rows = 6,
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

function RequestSettings({ config, onChange }: NodeFormProps) {
  return (
    <Section title="Request settings">
      <JsonEditor
        label="Additional headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "Idempotency-Key": "{{payment.idempotencyKey}}"\n}'}
        rows={4}
        hint="Optional provider-specific headers to merge into each request."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Timeout (ms)" hint="Applied to every outbound REST call.">
          <Input
            type="number"
            value={config?.timeout ?? 30000}
            onChange={(event) => updateConfig(config, onChange, 'timeout', Number(event.target.value))}
          />
        </Field>
        <Field label="Retries" hint="Retries network failures and upstream 5xx responses.">
          <Input
            type="number"
            value={config?.retries ?? 3}
            onChange={(event) => updateConfig(config, onChange, 'retries', Number(event.target.value))}
          />
        </Field>
      </div>
    </Section>
  );
}

function EnvironmentField({ config, onChange, provider }: NodeFormProps & { provider: string }) {
  return (
    <Field label="Environment" hint={`Use ${provider} sandbox endpoints while developing.`}>
      <Select value={config?.environment || 'sandbox'} onValueChange={(value) => updateConfig(config, onChange, 'environment', value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sandbox">Sandbox</SelectItem>
          <SelectItem value="live">Live</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function StripeForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'create_payment_intent';
  const showsBody = operation !== 'retrieve_payment_intent';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Stripe connection">
        <CredentialPicker
          providerId="stripe"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Operation">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_payment_intent">Create payment intent</SelectItem>
                <SelectItem value="retrieve_payment_intent">Retrieve payment intent</SelectItem>
                <SelectItem value="create_refund">Create refund</SelectItem>
                <SelectItem value="create_customer">Create customer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Secret key" hint="Use your server-side Stripe secret key.">
            <Input
              type="password"
              value={config?.secretKey || ''}
              onChange={(event) => updateConfig(config, onChange, 'secretKey', event.target.value)}
              placeholder="{{secrets.stripeSecretKey}}"
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Connected account" hint="Optional Stripe-Account header for Connect platforms.">
            <Input
              value={config?.account || ''}
              onChange={(event) => updateConfig(config, onChange, 'account', event.target.value)}
              placeholder="acct_123456789"
            />
          </Field>
          <Field label="API version" hint="Optional Stripe-Version override.">
            <Input
              value={config?.apiVersion || ''}
              onChange={(event) => updateConfig(config, onChange, 'apiVersion', event.target.value)}
              placeholder="2024-06-20"
            />
          </Field>
        </div>

        {operation === 'retrieve_payment_intent' && (
          <Field label="Payment intent ID" hint="Supports interpolation from previous node output.">
            <Input
              value={config?.paymentIntentId || ''}
              onChange={(event) => updateConfig(config, onChange, 'paymentIntentId', event.target.value)}
              placeholder="{{nodes.checkout.output.id}}"
            />
          </Field>
        )}

        {showsBody ? (
          <JsonEditor
            label="Request body JSON"
            value={config?.body}
            onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
            placeholder={
              operation === 'create_refund'
                ? '{\n  "payment_intent": "{{paymentIntentId}}",\n  "amount": 500\n}'
                : operation === 'create_customer'
                  ? '{\n  "email": "{{customer.email}}",\n  "name": "{{customer.name}}"\n}'
                  : '{\n  "amount": 1099,\n  "currency": "usd",\n  "automatic_payment_methods": {\n    "enabled": true\n  }\n}'
            }
            hint="JSON is converted to Stripe form-encoded fields automatically."
          />
        ) : null}
      </Section>

      <RequestSettings config={config} onChange={onChange} />
    </div>
  );
}

function PayPalForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'create_order';
  const showsBody = operation !== 'get_order';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="PayPal connection">
        <CredentialPicker
          providerId="paypal"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <EnvironmentField config={config} onChange={onChange} provider="PayPal" />
          <Field label="Operation">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_order">Create order</SelectItem>
                <SelectItem value="capture_order">Capture order</SelectItem>
                <SelectItem value="get_order">Get order</SelectItem>
                <SelectItem value="refund_capture">Refund capture</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Client ID">
            <Input
              value={config?.clientId || ''}
              onChange={(event) => updateConfig(config, onChange, 'clientId', event.target.value)}
              placeholder="{{secrets.paypalClientId}}"
            />
          </Field>
          <Field label="Client secret" hint="Used to fetch an OAuth token when access token is omitted.">
            <Input
              type="password"
              value={config?.clientSecret || ''}
              onChange={(event) => updateConfig(config, onChange, 'clientSecret', event.target.value)}
              placeholder="{{secrets.paypalClientSecret}}"
            />
          </Field>
        </div>

        <Field label="Access token" hint="Optional override if you already manage token refresh elsewhere.">
          <Input
            type="password"
            value={config?.accessToken || ''}
            onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
            placeholder="{{secrets.paypalAccessToken}}"
          />
        </Field>

        {operation === 'capture_order' || operation === 'get_order' ? (
          <Field label="Order ID">
            <Input
              value={config?.orderId || ''}
              onChange={(event) => updateConfig(config, onChange, 'orderId', event.target.value)}
              placeholder="{{nodes.paypalCreate.output.id}}"
            />
          </Field>
        ) : null}

        {operation === 'refund_capture' ? (
          <Field label="Capture ID">
            <Input
              value={config?.captureId || ''}
              onChange={(event) => updateConfig(config, onChange, 'captureId', event.target.value)}
              placeholder="{{captureId}}"
            />
          </Field>
        ) : null}

        {showsBody ? (
          <JsonEditor
            label="Request body JSON"
            value={config?.body}
            onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
            placeholder={
              operation === 'refund_capture'
                ? '{\n  "amount": {\n    "currency_code": "USD",\n    "value": "10.99"\n  }\n}'
                : operation === 'capture_order'
                  ? '{\n  "final_capture": true\n}'
                  : '{\n  "intent": "CAPTURE",\n  "purchase_units": [\n    {\n      "amount": {\n        "currency_code": "USD",\n        "value": "10.99"\n      }\n    }\n  ]\n}'
            }
          />
        ) : null}
      </Section>

      <RequestSettings config={config} onChange={onChange} />
    </div>
  );
}

function SquareForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'create_payment';
  const showsBody = operation !== 'get_payment';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Square connection">
        <CredentialPicker
          providerId="square"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <EnvironmentField config={config} onChange={onChange} provider="Square" />
          <Field label="Operation">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_payment">Create payment</SelectItem>
                <SelectItem value="get_payment">Get payment</SelectItem>
                <SelectItem value="refund_payment">Refund payment</SelectItem>
                <SelectItem value="create_customer">Create customer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Access token">
            <Input
              type="password"
              value={config?.accessToken || ''}
              onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
              placeholder="{{secrets.squareAccessToken}}"
            />
          </Field>
          <Field label="Square version" hint="Sent as the Square-Version header.">
            <Input
              value={config?.squareVersion || '2024-01-18'}
              onChange={(event) => updateConfig(config, onChange, 'squareVersion', event.target.value)}
              placeholder="2024-01-18"
            />
          </Field>
        </div>

        {operation === 'get_payment' ? (
          <Field label="Payment ID">
            <Input
              value={config?.paymentId || ''}
              onChange={(event) => updateConfig(config, onChange, 'paymentId', event.target.value)}
              placeholder="{{nodes.squareCreate.output.id}}"
            />
          </Field>
        ) : null}

        {showsBody ? (
          <JsonEditor
            label="Request body JSON"
            value={config?.body}
            onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
            placeholder={
              operation === 'refund_payment'
                ? '{\n  "payment_id": "{{paymentId}}",\n  "amount_money": {\n    "amount": 500,\n    "currency": "USD"\n  }\n}'
                : operation === 'create_customer'
                  ? '{\n  "given_name": "{{customer.firstName}}",\n  "email_address": "{{customer.email}}"\n}'
                  : '{\n  "source_id": "cnon:card-nonce-ok",\n  "amount_money": {\n    "amount": 1099,\n    "currency": "USD"\n  }\n}'
            }
            hint="If idempotency_key is omitted, one is generated automatically for create/refund calls."
          />
        ) : null}
      </Section>

      <RequestSettings config={config} onChange={onChange} />
    </div>
  );
}

function PlaidForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'create_link_token';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Plaid connection">
        <CredentialPicker
          providerId="plaid"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <EnvironmentField config={config} onChange={onChange} provider="Plaid" />
          <Field label="Operation">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_link_token">Create link token</SelectItem>
                <SelectItem value="exchange_public_token">Exchange public token</SelectItem>
                <SelectItem value="get_accounts">Get accounts</SelectItem>
                <SelectItem value="auth_get">Auth get</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Client ID">
            <Input
              value={config?.clientId || ''}
              onChange={(event) => updateConfig(config, onChange, 'clientId', event.target.value)}
              placeholder="{{secrets.plaidClientId}}"
            />
          </Field>
          <Field label="Secret">
            <Input
              type="password"
              value={config?.secret || ''}
              onChange={(event) => updateConfig(config, onChange, 'secret', event.target.value)}
              placeholder="{{secrets.plaidSecret}}"
            />
          </Field>
        </div>

        {operation === 'exchange_public_token' ? (
          <Field label="Public token">
            <Input
              value={config?.publicToken || ''}
              onChange={(event) => updateConfig(config, onChange, 'publicToken', event.target.value)}
              placeholder="{{nodes.link.output.public_token}}"
            />
          </Field>
        ) : null}

        {operation === 'get_accounts' || operation === 'auth_get' ? (
          <Field label="Access token">
            <Input
              type="password"
              value={config?.accessToken || ''}
              onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
              placeholder="{{secrets.plaidAccessToken}}"
            />
          </Field>
        ) : null}

        <JsonEditor
          label="Request body JSON"
          value={config?.body}
          onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
          placeholder={
            operation === 'create_link_token'
              ? '{\n  "client_name": "My App",\n  "country_codes": ["US"],\n  "language": "en",\n  "user": {\n    "client_user_id": "{{user.id}}"\n  },\n  "products": ["auth"]\n}'
              : operation === 'exchange_public_token'
                ? '{\n  "public_token": "{{publicToken}}"\n}'
                : '{\n  "options": {\n    "account_ids": ["{{accountId}}"]\n  }\n}'
          }
          hint="Client credentials are added automatically to the JSON payload."
        />
      </Section>

      <RequestSettings config={config} onChange={onChange} />
    </div>
  );
}

function QuickBooksForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'create_customer';
  const showsJsonBody = operation === 'create_customer' || operation === 'create_invoice';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="QuickBooks connection">
        <CredentialPicker
          providerId="quickbooks"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <EnvironmentField config={config} onChange={onChange} provider="QuickBooks" />
          <Field label="Operation">
            <Select value={operation} onValueChange={(value) => updateConfig(config, onChange, 'operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_customer">Create customer</SelectItem>
                <SelectItem value="get_customer">Get customer</SelectItem>
                <SelectItem value="create_invoice">Create invoice</SelectItem>
                <SelectItem value="get_invoice">Get invoice</SelectItem>
                <SelectItem value="query">Query</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Access token">
            <Input
              type="password"
              value={config?.accessToken || ''}
              onChange={(event) => updateConfig(config, onChange, 'accessToken', event.target.value)}
              placeholder="{{secrets.quickbooksAccessToken}}"
            />
          </Field>
          <Field label="Realm / company ID" hint="The company identifier used in QuickBooks API paths.">
            <Input
              value={config?.realmId || ''}
              onChange={(event) => updateConfig(config, onChange, 'realmId', event.target.value)}
              placeholder="{{secrets.quickbooksRealmId}}"
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Minor version" hint="Optional Intuit minorversion query parameter.">
            <Input
              value={config?.minorVersion || ''}
              onChange={(event) => updateConfig(config, onChange, 'minorVersion', event.target.value)}
              placeholder="75"
            />
          </Field>
          <Field label="Base URL override" hint="Leave blank unless you need a custom proxy.">
            <Input
              value={config?.baseUrl || ''}
              onChange={(event) => updateConfig(config, onChange, 'baseUrl', event.target.value)}
              placeholder="https://quickbooks.api.intuit.com"
            />
          </Field>
        </div>

        {operation === 'get_customer' ? (
          <Field label="Customer ID">
            <Input
              value={config?.customerId || ''}
              onChange={(event) => updateConfig(config, onChange, 'customerId', event.target.value)}
              placeholder="{{customerId}}"
            />
          </Field>
        ) : null}

        {operation === 'get_invoice' ? (
          <Field label="Invoice ID">
            <Input
              value={config?.invoiceId || ''}
              onChange={(event) => updateConfig(config, onChange, 'invoiceId', event.target.value)}
              placeholder="{{invoiceId}}"
            />
          </Field>
        ) : null}

        {operation === 'query' ? (
          <Field label="SQL-like query" hint="Example: SELECT * FROM Customer STARTPOSITION 1 MAXRESULTS 10">
            <Textarea
              value={config?.query || ''}
              rows={5}
              onChange={(event) => updateConfig(config, onChange, 'query', event.target.value)}
              placeholder="SELECT * FROM Invoice"
              className="font-mono text-xs"
            />
          </Field>
        ) : null}

        {showsJsonBody ? (
          <JsonEditor
            label="Request body JSON"
            value={config?.body}
            onValidChange={(value) => updateConfig(config, onChange, 'body', value)}
            placeholder={
              operation === 'create_invoice'
                ? '{\n  "CustomerRef": {\n    "value": "{{customerId}}"\n  },\n  "Line": [\n    {\n      "Amount": 10.99,\n      "DetailType": "SalesItemLineDetail"\n    }\n  ]\n}'
                : '{\n  "DisplayName": "{{customer.displayName}}",\n  "PrimaryEmailAddr": {\n    "Address": "{{customer.email}}"\n  }\n}'
            }
          />
        ) : null}
      </Section>

      <RequestSettings config={config} onChange={onChange} />
    </div>
  );
}

export const integrationPaymentForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_STRIPE]: StripeForm,
  [NodeType.INTEGRATION_PAYPAL]: PayPalForm,
  [NodeType.INTEGRATION_SQUARE]: SquareForm,
  [NodeType.INTEGRATION_PLAID]: PlaidForm,
  [NodeType.INTEGRATION_QUICKBOOKS]: QuickBooksForm,
};
