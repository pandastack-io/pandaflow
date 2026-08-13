'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import {
  Activity,
  Bot,
  Clock3,
  DollarSign,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Settings2,
  Square,
  Trash2,
  Workflow,
} from 'lucide-react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type AgentStatus = 'deployed' | 'running' | 'stopped' | 'paused' | 'error' | 'crashed';

type AgentListItem = {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  name: string;
  description?: string | null;
  status: AgentStatus;
  lastRunAt?: string | null;
  totalExecutions?: number | null;
  totalCostUsd?: string | number | null;
  updatedAt?: string | null;
};

type ExecutionListItem = {
  id: string;
  createdAt?: string | null;
};

const statusStyles: Record<AgentStatus, { badge: string; dot: string; pulse?: boolean; label: string }> = {
  running: {
    badge: 'border-green-500/30 bg-green-500/15 text-green-600 dark:text-green-400',
    dot: 'bg-green-400',
    pulse: true,
    label: 'Running',
  },
  stopped: {
    badge: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Stopped',
  },
  crashed: {
    badge: 'border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400',
    dot: 'bg-red-400',
    label: 'Crashed',
  },
  paused: {
    badge: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    dot: 'bg-yellow-400',
    label: 'Paused',
  },
  deployed: {
    badge: 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-400',
    label: 'Deployed',
  },
  error: {
    badge: 'border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400',
    dot: 'bg-red-400',
    label: 'Error',
  },
};

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Never';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function formatCurrency(value?: string | number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value ?? 0));
}

type WorkflowItem = {
  id: string;
  name: string;
  description?: string | null;
};

export default function AgentsPage() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Deploy dialog
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [deployName, setDeployName] = useState('');
  const [deployDescription, setDeployDescription] = useState('');
  const [deploying, setDeploying] = useState(false);

  const fetchData = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [agentsResponse, executionsResponse] = await Promise.all([
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/executions?limit=200', { cache: 'no-store' }),
      ]);

      const [agentsPayload, executionsPayload] = await Promise.all([agentsResponse.json(), executionsResponse.json()]);

      if (!agentsResponse.ok || !agentsPayload.success) {
        throw new Error(agentsPayload.error || 'Failed to fetch agents');
      }

      if (!executionsResponse.ok || !executionsPayload.success) {
        throw new Error(executionsPayload.error || 'Failed to fetch executions');
      }

      setAgents(agentsPayload.data ?? []);
      setExecutions(executionsPayload.data ?? []);
    } catch (error) {
      toast({
        title: 'Failed to load Agent OS',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchData();
    }, 0);

    const interval = window.setInterval(() => {
      void fetchData(true);
    }, 5000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  const openDeployDialog = useCallback(async () => {
    setShowDeployDialog(true);
    setSelectedWorkflowId('');
    setDeployName('');
    setDeployDescription('');
    setWorkflowsLoading(true);
    try {
      const res = await fetch('/api/workflows?limit=100', { cache: 'no-store' });
      const payload = await res.json();
      setWorkflows(payload.data ?? []);
    } catch {
      setWorkflows([]);
    } finally {
      setWorkflowsLoading(false);
    }
  }, []);

  const handleSelectWorkflow = useCallback((wf: WorkflowItem) => {
    setSelectedWorkflowId(wf.id);
    setDeployName(wf.name);
    setDeployDescription(wf.description ?? '');
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!selectedWorkflowId || !deployName.trim() || deploying) return;
    setDeploying(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: selectedWorkflowId, name: deployName.trim(), description: deployDescription.trim() }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'Failed to deploy');
      setShowDeployDialog(false);
      toast({ title: 'Agent deployed', description: `"${deployName}" is now live in Agent OS.` });
      await fetchData(true);
    } catch (error) {
      toast({ title: 'Deploy failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setDeploying(false);
    }
  }, [deployDescription, deployName, deploying, fetchData, selectedWorkflowId, toast]);

  const handleLifecycleAction = useCallback(async (agentId: string, action: 'start' | 'stop' | 'pause' | 'resume' | 'restart') => {
    const actionKey = `${agentId}:${action}`;
    setPendingAction(actionKey);

    try {
      const response = await fetch(`/api/agents/${agentId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Failed to ${action} agent`);
      }

      await fetchData(true);
    } catch (error) {
      toast({
        title: 'Lifecycle action failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }, [fetchData, toast]);

  const handleDelete = useCallback(async (agentId: string) => {
    if (!window.confirm('Delete this agent and its lifecycle history?')) {
      return;
    }

    setPendingAction(`${agentId}:delete`);
    try {
      const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to delete agent');
      }

      await fetchData(true);
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }, [fetchData, toast]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      running: agents.filter((agent) => agent.status === 'running').length,
      stopped: agents.filter((agent) => agent.status === 'stopped').length,
      todayExecutions: executions.filter((execution) => execution.createdAt && new Date(execution.createdAt) >= today).length,
    };
  }, [agents, executions]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex h-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Agent OS</h1>
                <p className="mt-1 text-sm text-muted-foreground">Persistent identity, lifecycle, and process management for deployed workflows.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Running agents: <span className="font-semibold text-foreground">{stats.running}</span></span>
              <span className="text-muted-foreground/60">|</span>
              <span>Stopped: <span className="font-semibold text-foreground">{stats.stopped}</span></span>
              <span className="text-muted-foreground/60">|</span>
              <span>Total executions today: <span className="font-semibold text-foreground">{stats.todayExecutions}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchData(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => void openDeployDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Deploy Agent
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Running now', value: stats.running, icon: Activity, accent: 'text-green-600 dark:text-green-400' },
            { label: 'Stopped', value: stats.stopped, icon: Square, accent: 'text-muted-foreground' },
            { label: 'Executions today', value: stats.todayExecutions, icon: Clock3, accent: 'text-blue-600 dark:text-blue-300' },
          ].map((stat) => (
            <Card key={stat.label} className="border-border bg-muted/50 shadow-none">
              <CardContent className="flex items-center gap-3 p-5">
                <div className={cn('rounded-xl border border-border bg-muted p-3', stat.accent)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {agents.length === 0 ? (
          <Card className="border-dashed border-border bg-muted/30 shadow-none">
            <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Bot className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">No agents deployed yet</h2>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  Deploy a workflow as an agent to give it a persistent identity, memory, and lifecycle management.
                </p>
              </div>
              <Button onClick={() => void openDeployDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Deploy your first agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-foreground">Agent Registry</CardTitle>
                <CardDescription>Monitor live agent processes, costs, and workflow links from one control plane.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Status</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>Total executions</TableHead>
                    <TableHead>Total cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => {
                    const status = statusStyles[agent.status] ?? statusStyles.stopped;
                    return (
                      <TableRow key={agent.id} className="border-border/80 hover:bg-muted/60">
                        <TableCell>
                          <Badge variant="outline" className={cn('gap-2 rounded-full px-3 py-1 text-xs', status.badge)}>
                            <span className={cn('h-2.5 w-2.5 rounded-full', status.dot, status.pulse && 'animate-pulse')} />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Link href={`/agents/${agent.id}`} className="font-medium text-foreground transition hover:text-blue-600 dark:hover:text-blue-300">
                              {agent.name}
                            </Link>
                            <p className="max-w-md text-xs leading-5 text-muted-foreground">
                              {agent.description || 'Persistent workflow agent with lifecycle controls.'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/workflows/${agent.workflowId}`} className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-300 transition hover:text-blue-500 dark:hover:text-blue-200">
                            <Workflow className="h-4 w-4" />
                            {agent.workflowName || 'Untitled workflow'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-foreground">{formatRelativeTime(agent.lastRunAt)}</TableCell>
                        <TableCell className="text-foreground">{agent.totalExecutions ?? 0}</TableCell>
                        <TableCell className="text-foreground">{formatCurrency(agent.totalCostUsd)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={agent.status === 'running' || pendingAction === `${agent.id}:start`}
                              onClick={() => void handleLifecycleAction(agent.id, 'start')}
                            >
                              {pendingAction === `${agent.id}:start` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                              Start
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={agent.status !== 'running' || pendingAction === `${agent.id}:pause`}
                              onClick={() => void handleLifecycleAction(agent.id, 'pause')}
                            >
                              {pendingAction === `${agent.id}:pause` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
                              Pause
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={(agent.status !== 'running' && agent.status !== 'paused' && agent.status !== 'crashed') || pendingAction === `${agent.id}:stop`}
                              onClick={() => void handleLifecycleAction(agent.id, 'stop')}
                            >
                              {pendingAction === `${agent.id}:stop` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                              Stop
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/agents/${agent.id}`}>
                                <Settings2 className="mr-2 h-4 w-4" />
                                Settings
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-500/20 text-red-600 dark:text-red-300 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-200"
                              disabled={pendingAction === `${agent.id}:delete`}
                              onClick={() => void handleDelete(agent.id)}
                            >
                              {pendingAction === `${agent.id}:delete` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-muted/40 shadow-none">
            <CardHeader>
              <CardTitle className="text-foreground">Process notes</CardTitle>
              <CardDescription>Each deployed workflow gets a durable identity token, memory namespace, and message history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Start launches the linked workflow and moves the agent into a running state.</p>
              <p>• Pause freezes the process manager state while preserving identity and memory namespace.</p>
              <p>• Stop marks the agent offline without deleting its registry record.</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-muted/40 shadow-none">
            <CardHeader>
              <CardTitle className="text-foreground">Cost surface</CardTitle>
              <CardDescription>Execution cost intelligence is tracked per agent so you can see spend accumulate over time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <div className="font-medium text-foreground">Aggregate cost visibility</div>
                  <div>Total cost combines all runs triggered under a persistent agent identity.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Deploy Agent Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deploy Agent</DialogTitle>
            <DialogDescription>Select a workflow to give it a persistent identity, memory, and lifecycle controls.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Workflow picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Select workflow</label>
              {workflowsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…</div>
              ) : workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflows found. <Link href="/workflows" className="underline">Create one first</Link>.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
                  {workflows.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => handleSelectWorkflow(wf)}
                      className={cn(
                        'w-full px-4 py-3 text-left text-sm transition hover:bg-muted',
                        selectedWorkflowId === wf.id && 'bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500/15'
                      )}
                    >
                      <div className="font-medium">{wf.name}</div>
                      {wf.description && <div className="mt-0.5 truncate text-xs text-muted-foreground">{wf.description}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedWorkflowId && (
              <>
                <div className="space-y-2">
                  <label htmlFor="deploy-name" className="text-sm font-medium text-foreground">Agent name</label>
                  <Input id="deploy-name" value={deployName} onChange={(e) => setDeployName(e.target.value)} placeholder="My agent" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="deploy-desc" className="text-sm font-medium text-foreground">Description <span className="text-muted-foreground">(optional)</span></label>
                  <Textarea id="deploy-desc" value={deployDescription} onChange={(e) => setDeployDescription(e.target.value)} placeholder="What does this agent do?" className="min-h-[80px]" />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployDialog(false)} disabled={deploying}>Cancel</Button>
            <Button onClick={() => void handleDeploy()} disabled={deploying || !selectedWorkflowId || !deployName.trim()}>
              {deploying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              {deploying ? 'Deploying…' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
