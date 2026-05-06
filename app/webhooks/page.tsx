'use client';

import { Fragment, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, Copy, Loader2, Trash2, Webhook } from 'lucide-react';
import Link from 'next/link';
import { MainLayout } from '@/components/layouts/main-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

type WebhookLog = {
  id: string;
  method: string | null;
  statusCode: number | null;
  receivedAt: string | null;
};

type WebhookItem = {
  id: string;
  workflowId: string;
  workflowName: string | null;
  urlPath: string;
  httpMethod: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  recentLogs?: WebhookLog[];
};

export default function WebhooksPage() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/webhooks')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error);
        }
        setWebhooks(data.data);
      })
      .catch((error) => {
        toast({
          title: 'Failed to load webhooks',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const toggleActive = async (webhook: WebhookItem, checked: boolean) => {
    setPendingId(webhook.id);
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: checked }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      setWebhooks((current) => current.map((item) => (item.id === webhook.id ? { ...item, isActive: checked } : item)));
    } catch (error) {
      toast({
        title: 'Failed to update webhook',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingId(null);
    }
  };

  const deleteWebhook = async (webhook: WebhookItem) => {
    if (!confirm(`Delete webhook for ${webhook.workflowName || 'workflow'}?`)) {
      return;
    }

    setPendingId(webhook.id);
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      setWebhooks((current) => current.filter((item) => item.id !== webhook.id));
      setExpandedId((current) => (current === webhook.id ? null : current));
    } catch (error) {
      toast({
        title: 'Failed to delete webhook',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingId(null);
    }
  };

  const copyUrl = async (path: string) => {
    const fullUrl = `${window.location.origin}/api/webhooks/trigger/${path}`;
    await navigator.clipboard.writeText(fullUrl);
    toast({ title: 'Webhook URL copied', description: fullUrl });
  };

  return (
    <MainLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
            <p className="mt-1 text-muted-foreground">Manage incoming workflow endpoints and inspect recent request activity.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/workflows">
              <Webhook className="mr-2 h-4 w-4" />
              Open Workflows
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : webhooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Webhook className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No webhooks yet</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">Add a Webhook trigger node to any workflow to generate an endpoint.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="w-12 p-4" />
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Workflow</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">URL Path</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Method</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Created</th>
                      <th className="p-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhooks.map((webhook) => {
                      const expanded = expandedId === webhook.id;
                      return (
                        <Fragment key={webhook.id}>
                          <tr key={webhook.id} className="border-b transition-colors hover:bg-muted/20">
                            <td className="p-4">
                              <button type="button" onClick={() => setExpandedId(expanded ? null : webhook.id)} className="rounded p-1 hover:bg-accent">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="p-4">
                              <Link href={`/workflows/${webhook.workflowId}`} className="font-medium hover:underline">
                                {webhook.workflowName || 'Untitled workflow'}
                              </Link>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <code className="rounded bg-muted px-2 py-1 text-xs">{webhook.urlPath}</code>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copyUrl(webhook.urlPath)}>
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">{webhook.httpMethod || 'POST'}</td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <Switch checked={webhook.isActive !== false} onCheckedChange={(checked) => void toggleActive(webhook, checked)} disabled={pendingId === webhook.id} />
                                <span className={`text-xs font-medium ${webhook.isActive !== false ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                  {webhook.isActive !== false ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {webhook.createdAt ? formatDistanceToNow(new Date(webhook.createdAt), { addSuffix: true }) : '—'}
                            </td>
                            <td className="p-4 text-right">
                              <Button type="button" variant="ghost" size="icon" onClick={() => void deleteWebhook(webhook)} disabled={pendingId === webhook.id}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr key={`${webhook.id}-logs`} className="border-b bg-muted/10">
                              <td colSpan={7} className="p-4">
                                <div className="space-y-2">
                                  <div className="text-sm font-medium">Recent requests</div>
                                  {webhook.recentLogs?.length ? (
                                    webhook.recentLogs.map((log) => (
                                      <div key={log.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                        <div className="flex items-center gap-3">
                                          <span className="font-medium">{log.method || 'POST'}</span>
                                          <span className="text-muted-foreground">HTTP {log.statusCode || '—'}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {log.receivedAt ? formatDistanceToNow(new Date(log.receivedAt), { addSuffix: true }) : 'Unknown time'}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-muted-foreground">No recent requests for this webhook.</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
