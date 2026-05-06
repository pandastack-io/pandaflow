'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, Loader2, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { WorkflowTypeSelector } from '@/components/workflow/workflow-type-selector';
import { defaultChatSettings, resolveChatSettings, type ChatSettings, type WorkflowType } from '@/lib/chat';

type ChatSettingsDialogProps = {
  workflowId: string;
  workflowName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowType: WorkflowType;
  chatSettings: ChatSettings | null | undefined;
  isPublic: boolean;
  chatPublicId: string | null;
  onSaved: (payload: {
    workflowType: WorkflowType;
    chatSettings: ChatSettings;
    isPublic: boolean;
    chatPublicId: string | null;
  }) => void;
};

type ChatSettingsDialogContentProps = ChatSettingsDialogProps;

function ChatSettingsDialogContent({
  workflowId,
  workflowName,
  workflowType,
  chatSettings,
  isPublic,
  chatPublicId,
  onOpenChange,
  onSaved,
}: ChatSettingsDialogContentProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkflowType>(workflowType);
  const [publicEnabled, setPublicEnabled] = useState(isPublic);
  const [form, setForm] = useState(() => resolveChatSettings(chatSettings, workflowName));
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const publicUrl = useMemo(() => chatPublicId && origin ? `${origin}/chat/${chatPublicId}` : '', [chatPublicId, origin]);
  const embedCode = useMemo(() => chatPublicId && origin
    ? `<script src="${origin}/chat-widget.js" data-chat-id="${chatPublicId}"></script>`
    : '', [chatPublicId, origin]);

  const copy = async (value: string, label: string) => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied`, description: 'Ready to share.' });
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowType: selectedType,
          isPublic: publicEnabled,
          chatPublicId,
          chatSettings: selectedType === 'chat'
            ? {
                ...form,
                temperature: Number(form.temperature) || defaultChatSettings.temperature,
              }
            : null,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save chat settings');
      }

      onSaved({
        workflowType: data.data.workflowType,
        chatSettings: data.data.chatSettings,
        isPublic: data.data.isPublic,
        chatPublicId: data.data.chatPublicId,
      });

      toast({ title: 'Chat settings saved', description: 'Your shareable assistant is ready.' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to save chat settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-3xl border-border/60 bg-card/95 shadow-2xl backdrop-blur">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Chat Settings
        </DialogTitle>
        <DialogDescription>
          Turn this workflow into a polished AI assistant with a public URL and embeddable widget.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-foreground">Workflow Type</Label>
            <p className="mt-1 text-xs text-muted-foreground">Choose the experience this workflow should deliver.</p>
          </div>
          <WorkflowTypeSelector value={selectedType} onChange={setSelectedType} compact />
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Chat Configuration</h3>
              <p className="text-xs text-muted-foreground">Customize the assistant personality and frontend copy.</p>
            </div>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Publish-ready</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chat-title">Chat Title</Label>
              <Input id="chat-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-model">AI Model</Label>
              <Select value={form.model} onValueChange={(value) => setForm((current) => ({ ...current, model: value }))}>
                <SelectTrigger id="chat-model">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="gpt-4.1-mini">gpt-4.1-mini</SelectItem>
                  <SelectItem value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="chat-welcome">Welcome Message</Label>
              <Textarea id="chat-welcome" value={form.welcomeMessage} onChange={(event) => setForm((current) => ({ ...current, welcomeMessage: event.target.value }))} className="min-h-[88px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="chat-system-prompt">System Prompt</Label>
              <Textarea id="chat-system-prompt" value={form.systemPrompt} onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))} className="min-h-[120px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-provider">Provider</Label>
              <Select value={form.provider} onValueChange={(value: 'openai' | 'anthropic') => setForm((current) => ({ ...current, provider: value }))}>
                <SelectTrigger id="chat-provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-temperature">Temperature</Label>
              <Input
                id="chat-temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={String(form.temperature)}
                onChange={(event) => setForm((current) => ({ ...current, temperature: Number(event.target.value) }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="chat-placeholder">Input Placeholder</Label>
              <Input id="chat-placeholder" value={form.placeholder} onChange={(event) => setForm((current) => ({ ...current, placeholder: event.target.value }))} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Sharing</h3>
              <p className="text-xs text-muted-foreground">Enable public access and copy production-ready share links.</p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-border/60 px-3 py-2">
              <Switch checked={publicEnabled} onCheckedChange={setPublicEnabled} id="chat-public" />
              <Label htmlFor="chat-public">Enable public access</Label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/80 p-4">
              <Label className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Public Chat URL</Label>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
                <Input readOnly value={publicUrl || 'Save to generate a public URL'} className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void copy(publicUrl, 'Public URL')} disabled={!publicUrl}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  {publicUrl ? (
                    <Button type="button" asChild>
                      <Link href={publicUrl} target="_blank">
                        Open
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/80 p-4">
              <Label className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Embed Code</Label>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
                <Textarea readOnly value={embedCode || 'Save to generate embed code'} className="min-h-[88px] font-mono text-xs" />
                <Button type="button" variant="outline" onClick={() => void copy(embedCode, 'Embed code')} disabled={!embedCode}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving} className="min-w-36">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function ChatSettingsDialog(props: ChatSettingsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <ChatSettingsDialogContent
          key={`${props.workflowType}:${props.chatPublicId}:${props.isPublic}:${props.workflowName}`}
          {...props}
        />
      ) : null}
    </Dialog>
  );
}
