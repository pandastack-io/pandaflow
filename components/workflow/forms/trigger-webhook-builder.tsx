'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ExpressionTextarea } from '@/components/workflow/expression-input';
import { useToast } from '@/hooks/use-toast';
import type { NodeFormProps } from './types';

type WebhookRecord = {
  id: string;
  urlPath: string;
  httpMethod: string | null;
  authType: string | null;
  authConfig?: { token?: string } | null;
  isActive: boolean | null;
  recentLogs?: Array<{
    id: string;
    method: string | null;
    statusCode: number | null;
    receivedAt: string | null;
  }>;
};

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

export function TriggerWebhookBuilder({ config, onChange, nodeId }: NodeFormProps) {
  const params = useParams<{ id: string }>();
  const workflowId = String(params.id ?? '');
  const { toast } = useToast();
  const [webhook, setWebhook] = useState<WebhookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const method = config.method || 'POST';
  const authType = config.authType || 'none';
  const bearerToken = config.authConfig?.token || '';
  const isActive = config.enabled !== false;

  useEffect(() => {
    const fetchWebhook = async () => {
      try {
        const response = await fetch(`/api/webhooks?workflowId=${workflowId}`);
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error);
        }

        const existing = data.data?.[0] as WebhookRecord | undefined;
        if (existing) {
          setWebhook(existing);
          onChange({
            ...config,
            webhookId: existing.id,
            urlPath: existing.urlPath,
            method: existing.httpMethod || 'POST',
            authType: existing.authType || 'none',
            authConfig: existing.authConfig || {},
            enabled: existing.isActive !== false,
          });
        }
      } catch (error) {
        toast({
          title: 'Failed to load webhook',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchWebhook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const persistWebhook = async (create = false) => {
    setSaving(true);
    try {
      const response = await fetch(create || !webhook?.id ? '/api/webhooks' : `/api/webhooks/${webhook.id}`, {
        method: create || !webhook?.id ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          httpMethod: method,
          authType,
          authConfig: authType === 'bearer' ? { token: bearerToken } : {},
          isActive,
          requestSchema: config.requestSchema || null,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      const nextWebhook = create || !webhook?.id ? data.data : { ...webhook, ...data.data };
      setWebhook(nextWebhook);
      onChange({
        ...config,
        webhookId: nextWebhook.id,
        urlPath: nextWebhook.urlPath,
        method,
        authType,
        authConfig: authType === 'bearer' ? { token: bearerToken } : {},
        enabled: isActive,
      });
      toast({ title: create || !webhook?.id ? 'Webhook created' : 'Webhook updated', description: nextWebhook.urlPath });
    } catch (error) {
      toast({
        title: 'Failed to save webhook',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = async () => {
    const urlPath = webhook?.urlPath || config.urlPath;
    if (!urlPath) {
      return;
    }

    await navigator.clipboard.writeText(`${baseUrl}/api/webhooks/trigger/${urlPath}`);
    toast({ title: 'Webhook URL copied', description: 'Ready to share.' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Trigger payload</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Provides request body, headers, query params, method, and timestamp.</li>
          <li>Auth is enforced before the workflow execution is accepted.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label>Webhook URL</Label>
        {webhook?.urlPath || config.urlPath ? (
          <div className="flex gap-2">
            <Input readOnly value={`${baseUrl}/api/webhooks/trigger/${webhook?.urlPath || config.urlPath}`} />
            <Button type="button" variant="outline" size="icon" onClick={() => void copyWebhookUrl()}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Create a webhook to generate its URL.</div>
        )}
      </div>

      <div>
        <Label htmlFor="webhook-method">HTTP Method</Label>
        <Select value={method} onValueChange={(value) => updateConfig(config, onChange, 'method', value)}>
          <SelectTrigger id="webhook-method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="webhook-auth">Auth Type</Label>
        <Select value={authType} onValueChange={(value) => updateConfig(config, onChange, 'authType', value)}>
          <SelectTrigger id="webhook-auth"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {authType === 'bearer' && (
        <div>
          <Label htmlFor="webhook-bearer-token">Bearer Token</Label>
          <Input
            id="webhook-bearer-token"
            value={bearerToken}
            onChange={(event) => updateConfig(config, onChange, 'authConfig', { token: event.target.value })}
            placeholder="secret-token"
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <div className="text-sm font-medium">Webhook active</div>
          <div className="text-xs text-muted-foreground">Disable to reject incoming requests without deleting the URL.</div>
        </div>
        <Switch checked={isActive} onCheckedChange={(checked) => updateConfig(config, onChange, 'enabled', checked)} />
      </div>

      <div>
        <Label htmlFor="webhook-schema">Request Schema (JSON)</Label>
        <ExpressionTextarea
          id="webhook-schema"
          value={config.requestSchema || ''}
          nodeId={nodeId}
          onValueChange={(value) => updateConfig(config, onChange, 'requestSchema', value)}
          placeholder='{"type":"object","properties":{"id":{"type":"string"}}}'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>

      <Button type="button" onClick={() => void persistWebhook(!webhook?.id)} disabled={loading || saving} className="w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {webhook?.id ? 'Update Webhook' : 'Create Webhook'}
      </Button>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Recent requests</Label>
          {webhook?.recentLogs?.length ? <span className="text-xs text-muted-foreground">Last 5</span> : null}
        </div>
        {webhook?.recentLogs?.length ? (
          <div className="space-y-2">
            {webhook.recentLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{log.method || 'POST'}</span>
                  <span className="text-muted-foreground">{log.statusCode || '—'}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {log.receivedAt ? formatDistanceToNow(new Date(log.receivedAt), { addSuffix: true }) : 'Unknown time'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No webhook requests yet.</div>
        )}
      </div>
    </div>
  );
}
