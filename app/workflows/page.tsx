'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Copy, Edit, Play, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { HealthIndicator } from '@/components/agents/health-indicator';
import { SelfHealingLog } from '@/components/agents/self-healing-log';
import { MainLayout } from '@/components/layouts/main-layout';
import { GenerateWorkflowDialog } from '@/components/workflow/generate-workflow-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getTagColorClasses, parseImportedWorkflowJson } from '@/lib/workflow-utils';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  workflowType?: 'automation' | 'chat' | 'agent';
  version: string;
  createdAt: string;
  updatedAt: string;
  definition: unknown;
  tags?: string[];
}

interface AgentSummary {
  id: string;
  workflowId: string;
  name: string;
  status: string;
  lastHeartbeatAt?: string | null;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [runningWorkflows, setRunningWorkflows] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [importText, setImportText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const workflowsQuery = useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const response = await fetch('/api/workflows');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch workflows');
      }
      return data.data as Workflow[];
    },
  });

  const agentsQuery = useQuery<AgentSummary[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch('/api/agents');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch agents');
      }
      return data.data as AgentSummary[];
    },
  });

  const workflows = useMemo(() => workflowsQuery.data ?? [], [workflowsQuery.data]);
  const agentsByWorkflowId = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.workflowId, agent])),
    [agentsQuery.data]
  );
  const loading = workflowsQuery.isLoading;

  const handleRun = async (workflowId: string) => {
    setRunningWorkflows((previous) => new Set(previous).add(workflowId));
    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      router.push(`/executions/${data.data.executionId}`);
    } catch (error) {
      console.error('Failed to run workflow:', error);
      toast({
        title: 'Failed to run workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunningWorkflows((previous) => {
        const next = new Set(previous);
        next.delete(workflowId);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      queryClient.setQueryData<Workflow[]>(['workflows'], (previous = []) =>
        previous.filter((workflow) => workflow.id !== id)
      );
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast({
        title: 'Failed to delete workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async (workflow: Workflow) => {
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          definition: workflow.definition,
          tags: workflow.tags ?? [],
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    } catch (error) {
      console.error('Failed to duplicate workflow:', error);
      toast({
        title: 'Failed to duplicate workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const resetImportDialog = () => {
    setImportMode('upload');
    setImportText('');
    setSelectedFileName('');
    setImportError(null);
    setImporting(false);
  };

  const handleImportFromRaw = async (raw: string) => {
    setImporting(true);
    setImportError(null);

    try {
      const importedWorkflow = parseImportedWorkflowJson(raw);
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importedWorkflow.name,
          description: importedWorkflow.description,
          definition: importedWorkflow.definition,
          tags: importedWorkflow.tags,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setShowImportDialog(false);
      resetImportDialog();
      toast({
        title: 'Workflow imported',
        description: `“${importedWorkflow.name}” is ready to edit.`,
      });
      router.push(`/workflows/${data.data.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid workflow JSON';
      setImportError(message);
      toast({
        title: 'Import failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const uniqueTags = useMemo(
    () => Array.from(new Set(workflows.flatMap((workflow) => workflow.tags ?? []))).sort((left, right) => left.localeCompare(right)),
    [workflows]
  );

  useEffect(() => {
    if (!workflowsQuery.isError) {
      return;
    }

    toast({
      title: 'Failed to load workflows',
      description: workflowsQuery.error instanceof Error ? workflowsQuery.error.message : 'Unknown error',
      variant: 'destructive',
    });
  }, [toast, workflowsQuery.error, workflowsQuery.isError]);

  useEffect(() => {
    if (!agentsQuery.isError) {
      return;
    }

    toast({
      title: 'Failed to load agents',
      description: agentsQuery.error instanceof Error ? agentsQuery.error.message : 'Unknown error',
      variant: 'destructive',
    });
  }, [agentsQuery.error, agentsQuery.isError, toast]);

  const filteredWorkflows = workflows.filter((workflow) => {
    const matchesSearch =
      workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (workflow.tags ?? []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = !selectedTag || (workflow.tags ?? []).includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'archived':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <MainLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="mt-1 text-muted-foreground">Create and manage your AI agent workflows</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import Workflow
            </Button>
            <Button variant="outline" onClick={() => setShowGenerateDialog(true)}>
              ✨ Generate with AI
            </Button>
            <Button asChild>
              <Link href="/workflows/new">
                <Plus className="mr-2 h-4 w-4" />
                New Workflow
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {uniqueTags.length > 0 && (
          <Card className="mb-6">
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <Button
                variant={selectedTag ? 'outline' : 'default'}
                size="sm"
                onClick={() => setSelectedTag(null)}
              >
                All tags
              </Button>
              {uniqueTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag((current) => (current === tag ? null : tag))}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${getTagColorClasses(tag)} ${selectedTag === tag ? 'ring-2 ring-primary/40' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" />
          </div>
        )}

        {!loading && filteredWorkflows.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Name</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Description</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Version</th>
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Last Updated</th>
                      <th className="p-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkflows.map((workflow) => {
                      const agent = agentsByWorkflowId.get(workflow.id);

                      return (
                        <tr key={workflow.id} className="border-b transition-colors hover:bg-muted/30">
                          <td className="p-4 align-top">
                            <div className="space-y-2">
                              <div className="font-medium">{workflow.name}</div>
                              {(workflow.tags ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {workflow.tags?.map((tag) => (
                                    <Badge key={tag} variant="secondary" className={getTagColorClasses(tag)}>
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="space-y-3">
                              <div className="line-clamp-2 text-sm text-muted-foreground">
                                {workflow.description || 'No description'}
                              </div>
                              {workflow.workflowType === 'agent' && agent && (
                                <>
                                  <HealthIndicator
                                    agentId={agent.id}
                                    status={agent.status}
                                    lastHeartbeatAt={agent.lastHeartbeatAt}
                                  />
                                  <SelfHealingLog agentId={agent.id} />
                                </>
                              )}
                              {workflow.workflowType === 'agent' && !agent && (
                                <div className="text-xs text-muted-foreground">No deployed agent health data yet.</div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="space-y-2">
                              <span className={`rounded-md border px-2 py-1 text-xs ${getStatusColor(workflow.status)}`}>
                                {workflow.status}
                              </span>
                              {workflow.workflowType === 'agent' && (
                                <div className="text-xs text-muted-foreground">Self-healing enabled</div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <span className="text-sm text-muted-foreground">v{workflow.version}</span>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(workflow.updatedAt), { addSuffix: true })}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleRun(workflow.id)}
                                disabled={runningWorkflows.has(workflow.id)}
                              >
                                <Play className="mr-1 h-3 w-3" />
                                {runningWorkflows.has(workflow.id) ? 'Running...' : 'Run'}
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/workflows/${workflow.id}`}>
                                  <Edit className="mr-1 h-3 w-3" />
                                  Edit
                                </Link>
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDuplicate(workflow)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDelete(workflow.id)}>
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && filteredWorkflows.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 rounded-full bg-muted p-4">
                <Plus className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">
                {searchQuery || selectedTag ? 'No workflows found' : 'No workflows yet'}
              </h3>
              <p className="mb-6 max-w-md text-center text-muted-foreground">
                {searchQuery || selectedTag
                  ? 'Try adjusting your search query or tag filter.'
                  : 'Create your first workflow to automate tasks, process data, and build AI agents.'}
              </p>
              {!searchQuery && !selectedTag && (
                <Button asChild>
                  <Link href="/workflows/new">Create Your First Workflow</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <GenerateWorkflowDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onGenerated={async () => {
            await queryClient.invalidateQueries({ queryKey: ['workflows'] });
            toast({
              title: 'Workflow generated',
              description: 'Preview ready — open it in the canvas when you are ready.',
            });
          }}
        />

        <Dialog
          open={showImportDialog}
          onOpenChange={(open) => {
            setShowImportDialog(open);
            if (!open) {
              resetImportDialog();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Workflow</DialogTitle>
              <DialogDescription>
                Upload a workflow JSON file or paste its contents to create a new workflow.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={importMode === 'upload' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setImportMode('upload')}
              >
                Upload JSON file
              </Button>
              <Button
                type="button"
                variant={importMode === 'paste' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setImportMode('paste')}
              >
                Paste JSON
              </Button>
            </div>

            {importMode === 'upload' ? (
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".json,.workflow.json,application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setSelectedFileName('');
                      setImportText('');
                      return;
                    }

                    setSelectedFileName(file.name);
                    setImportError(null);
                    setImportText(await file.text());
                  }}
                />
                {selectedFileName && <p className="text-sm text-muted-foreground">Selected file: {selectedFileName}</p>}
              </div>
            ) : (
              <Textarea
                placeholder="Paste exported workflow JSON here..."
                value={importText}
                onChange={(event) => {
                  setImportText(event.target.value);
                  setImportError(null);
                }}
                className="min-h-56 font-mono text-xs"
              />
            )}

            {importError && <p className="text-sm text-red-600">{importError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleImportFromRaw(importText)}
                disabled={importing || !importText.trim()}
              >
                {importing ? 'Importing...' : 'Import Workflow'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
