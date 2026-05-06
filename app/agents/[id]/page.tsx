'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity,
  Bot,
  Check,
  Clock3,
  Copy,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Square,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { CronEditor } from '@/components/agents/cron-editor';
import { MemoryViewer } from '@/components/agents/memory-viewer';
import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_AGENT_TIMEZONE, getAgentSchedule, getAgentTimezoneOptions, getNextCronRuns, type AgentScheduleConfig } from '@/lib/agents/schedule';
import { cn } from '@/lib/utils';

type AgentStatus = 'deployed' | 'running' | 'stopped' | 'paused' | 'error' | 'crashed';

type AgentEvent = {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type AgentMessage = {
  id: string;
  topic: string;
  status: string;
  createdAt?: string | null;
  fromAgentId?: string | null;
  toAgentId?: string | null;
};

type AgentDetail = {
  id: string;
  name: string;
  description?: string | null;
  status: AgentStatus;
  identityToken: string;
  memoryNamespace: string;
  config?: Record<string, unknown> | null;
  workflowId: string;
  lastRunAt?: string | null;
  lastHeartbeatAt?: string | null;
  totalExecutions?: number | null;
  totalCostUsd?: string | number | null;
  workflow?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
  };
  recentEvents: AgentEvent[];
  messages: AgentMessage[];
};

type ExecutionListItem = {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerType: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  costUsd?: string | number | null;
};

const statusStyles: Record<AgentStatus, { badge: string; dot: string; pulse?: boolean; label: string }> = {
  running: { badge: 'border-green-500/30 bg-green-500/15 text-green-400', dot: 'bg-green-400', pulse: true, label: 'Running' },
  stopped: { badge: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-400', dot: 'bg-zinc-400', label: 'Stopped' },
  crashed: { badge: 'border-red-500/30 bg-red-500/15 text-red-400', dot: 'bg-red-400', label: 'Crashed' },
  paused: { badge: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400', dot: 'bg-yellow-400', label: 'Paused' },
  deployed: { badge: 'border-blue-500/30 bg-blue-500/15 text-blue-400', dot: 'bg-blue-400', label: 'Deployed' },
  error: { badge: 'border-red-500/30 bg-red-500/15 text-red-400', dot: 'bg-red-400', label: 'Error' },
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

function maskToken(token: string) {
  if (token.length <= 14) {
    return token;
  }

  return `${token.slice(0, 8)}••••${token.slice(-6)}`;
}

function formatScheduleRun(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(value);
}

export default function AgentDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const agentId = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<AgentScheduleConfig>({
    enabled: false,
    cron: '0 * * * *',
    timezone: DEFAULT_AGENT_TIMEZONE,
  });
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const copyToken = useCallback((token: string) => {
    void navigator.clipboard.writeText(token).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  }, []);

  // Cost state
  type CostData = {
    totalCostUsd: number;
    totalExecutions: number;
    avgCostPerRun: number;
    dailyTrend: { date: string; cost: number }[];
    topNodes: { nodeId: string; nodeType: string; totalCost: number; callCount: number }[];
  };
  const [costData, setCostData] = useState<CostData | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  const fetchAgent = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const agentResponse = await fetch(`/api/agents/${agentId}`, { cache: 'no-store' });
      const agentPayload = await agentResponse.json();

      if (!agentResponse.ok || !agentPayload.success) {
        throw new Error(agentPayload.error || 'Failed to fetch agent');
      }

      setAgent(agentPayload.data);
      if (!scheduleDirty) {
        setScheduleConfig(getAgentSchedule(agentPayload.data?.config));
      }

      // Fetch cost data and executions in parallel
      setCostLoading(true);
      const costPromise = fetch(`/api/agents/${agentId}/cost`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((p) => { if (p.success) setCostData(p.data); })
        .catch(() => null)
        .finally(() => setCostLoading(false));

      if (agentPayload.data?.workflow?.id) {
        const [executionsResponse] = await Promise.all([
          fetch(`/api/executions?workflowId=${agentPayload.data.workflow.id}&agentId=${agentId}&limit=100`, { cache: 'no-store' }),
          costPromise,
        ]);
        const executionsPayload = await executionsResponse.json();

        if (!executionsResponse.ok || !executionsPayload.success) {
          throw new Error(executionsPayload.error || 'Failed to fetch executions');
        }

        setExecutions(executionsPayload.data ?? []);
      } else {
        await costPromise;
      }
    } catch (error) {
      toast({
        title: 'Failed to load agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, scheduleDirty, toast]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchAgent();
    }, 0);

    const interval = window.setInterval(() => {
      void fetchAgent(true);
    }, 5000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [fetchAgent]);

  const updateScheduleConfig = useCallback((updates: Partial<AgentScheduleConfig>) => {
    setScheduleDirty(true);
    setScheduleConfig((current) => ({ ...current, ...updates }));
  }, []);

  const handleLifecycleAction = useCallback(async (action: 'start' | 'stop' | 'pause' | 'resume' | 'restart') => {
    setPendingAction(action);

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

      await fetchAgent(true);
    } catch (error) {
      toast({
        title: 'Lifecycle action failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }, [agentId, fetchAgent, toast]);

  const handleScheduleSave = useCallback(async () => {
    setSavingSchedule(true);

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: scheduleConfig }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to save schedule');
      }

      const nextSchedule = payload.data?.schedule ?? scheduleConfig;
      setScheduleConfig(nextSchedule);
      setScheduleDirty(false);
      setAgent((current) => current ? { ...current, config: payload.data?.config ?? current.config } : current);
      toast({
        title: 'Schedule saved',
        description: nextSchedule.enabled ? 'Scheduled execution is active.' : 'Scheduled execution is disabled.',
      });
    } catch (error) {
      toast({
        title: 'Failed to save schedule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSavingSchedule(false);
    }
  }, [agentId, scheduleConfig, toast]);

  const executionSummary = useMemo(() => ({
    running: executions.filter((execution) => execution.status === 'running').length,
    completed: executions.filter((execution) => execution.status === 'completed').length,
    failed: executions.filter((execution) => execution.status === 'failed').length,
  }), [executions]);
  const timezoneOptions = useMemo(() => getAgentTimezoneOptions(scheduleConfig.timezone), [scheduleConfig.timezone]);
  const nextFiveRuns = useMemo(() => getNextCronRuns(scheduleConfig.cron, scheduleConfig.timezone, 5), [scheduleConfig.cron, scheduleConfig.timezone]);

  if (loading || !agent) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </MainLayout>
    );
  }

  const status = statusStyles[agent.status] ?? statusStyles.stopped;

  return (
    <MainLayout>
      <div className="flex h-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{agent.name}</h1>
                  <Badge variant="outline" className={cn('gap-2 rounded-full px-3 py-1 text-xs', status.badge)}>
                    <span className={cn('h-2.5 w-2.5 rounded-full', status.dot, status.pulse && 'animate-pulse')} />
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                  {agent.description || 'Persistent workflow agent with an isolated identity, memory namespace, and event timeline.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <Link href={`/workflows/${agent.workflow?.id || agent.workflowId}`} className="inline-flex items-center gap-2 text-blue-300 transition hover:text-blue-200">
                <Workflow className="h-4 w-4" />
                {agent.workflow?.name || 'Workflow'}
              </Link>
              <span className="text-zinc-600">|</span>
              <span>Last heartbeat: <span className="text-zinc-100">{formatRelativeTime(agent.lastHeartbeatAt)}</span></span>
              <span className="text-zinc-600">|</span>
              <span>Last run: <span className="text-zinc-100">{formatRelativeTime(agent.lastRunAt)}</span></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchAgent(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" disabled={agent.status === 'running' || pendingAction === 'start'} onClick={() => void handleLifecycleAction('start')}>
              {pendingAction === 'start' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start
            </Button>
            <Button variant="outline" size="sm" disabled={agent.status !== 'running' || pendingAction === 'pause'} onClick={() => void handleLifecycleAction('pause')}>
              {pendingAction === 'pause' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Pause
            </Button>
            <Button variant="outline" size="sm" disabled={(agent.status !== 'running' && agent.status !== 'paused' && agent.status !== 'crashed') || pendingAction === 'stop'} onClick={() => void handleLifecycleAction('stop')}>
              {pendingAction === 'stop' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              Stop
            </Button>
            <Button variant="outline" size="sm" disabled={pendingAction === 'restart'} onClick={() => void handleLifecycleAction('restart')}>
              {pendingAction === 'restart' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Restart
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total executions', value: agent.totalExecutions ?? 0, icon: Activity, accent: 'text-blue-300' },
            { label: 'Running executions', value: executionSummary.running, icon: Play, accent: 'text-green-300' },
            { label: 'Completed runs', value: executionSummary.completed, icon: Clock3, accent: 'text-violet-300' },
            { label: 'Total cost', value: formatCurrency(agent.totalCostUsd), icon: Bot, accent: 'text-emerald-300' },
          ].map((stat) => (
            <Card key={stat.label} className="border-zinc-800 bg-zinc-900/60 shadow-none">
              <CardContent className="flex items-center gap-3 p-5">
                <div className={cn('rounded-xl border border-white/5 bg-black/20 p-3', stat.accent)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-zinc-50">{stat.value}</div>
                  <div className="text-sm text-zinc-500">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="flex-1">
          <TabsList className="grid w-full grid-cols-4 bg-zinc-900/80 text-zinc-400">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="executions">Executions</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="cost">Cost</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Identity</CardTitle>
                  <CardDescription>Use the token below to invoke this agent from any external system.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {/* Identity token with reveal + copy */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Identity token</div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setTokenRevealed((v) => !v)}
                          className="rounded p-1 text-zinc-500 hover:text-zinc-300 transition"
                          title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                        >
                          {tokenRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => copyToken(agent.identityToken)}
                          className="rounded p-1 text-zinc-500 hover:text-zinc-300 transition"
                          title="Copy token"
                        >
                          {tokenCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 font-mono text-sm text-zinc-100 break-all">
                      {tokenRevealed ? agent.identityToken : maskToken(agent.identityToken)}
                    </div>
                  </div>

                  {/* How to invoke */}
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                    <div className="text-xs font-medium text-blue-300">How to invoke this agent externally</div>
                    <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300 whitespace-pre-wrap">{`curl -X POST https://your-domain/api/agents/invoke \\
  -H "Authorization: Bearer ${tokenRevealed ? agent.identityToken : maskToken(agent.identityToken)}" \\
  -H "Content-Type: application/json" \\
  -d '{"input": {"message": "hello"}}'`}</pre>
                    <div className="text-xs text-zinc-500">Returns: <code className="text-zinc-300">{'{ executionId, agentId, status }'}</code></div>
                  </div>

                  {/* Memory namespace */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Memory namespace</div>
                    <div className="mt-2 break-all font-mono text-sm text-zinc-100">{agent.memoryNamespace}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Config</div>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-zinc-300">{JSON.stringify(agent.config ?? {}, null, 2)}</pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Message bus</CardTitle>
                  <CardDescription>Recent inbound and outbound agent traffic.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {agent.messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                      No inter-agent messages yet.
                    </div>
                  ) : (
                    agent.messages.map((message) => (
                      <div key={message.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-zinc-100">{message.topic}</div>
                          <Badge variant="outline" className="border-zinc-700 text-zinc-300">{message.status}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">{formatRelativeTime(message.createdAt)}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-zinc-100">Schedule</CardTitle>
                  <CardDescription>Run this deployed agent automatically on a cron schedule.</CardDescription>
                </div>
                <Button size="sm" onClick={() => void handleScheduleSave()} disabled={savingSchedule || !scheduleDirty}>
                  {savingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save schedule
                </Button>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">Enable scheduled execution</div>
                      <div className="text-xs text-zinc-500">External cron can call the scheduler tick route every minute.</div>
                    </div>
                    <Switch checked={scheduleConfig.enabled} onCheckedChange={(checked) => updateScheduleConfig({ enabled: checked })} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-schedule-timezone" className="text-zinc-300">Timezone</Label>
                    <Select value={scheduleConfig.timezone} onValueChange={(value) => updateScheduleConfig({ timezone: value })}>
                      <SelectTrigger id="agent-schedule-timezone" className="border-zinc-800 bg-zinc-900/60 text-zinc-100">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {timezoneOptions.map((timezone) => (
                          <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <CronEditor
                    value={scheduleConfig.cron}
                    timezone={scheduleConfig.timezone}
                    onChange={(cron) => updateScheduleConfig({ cron })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn('border-zinc-700', scheduleConfig.enabled ? 'text-green-300' : 'text-zinc-400')}>
                        {scheduleConfig.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <span className="text-sm text-zinc-400">{scheduleConfig.timezone}</span>
                    </div>

                    <div className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Next 5 runs</div>
                    <div className="mt-3 space-y-2">
                      {scheduleConfig.enabled && nextFiveRuns.length > 0 ? (
                        nextFiveRuns.map((run, index) => (
                          <div key={`${run.toISOString()}-${index}`} className="rounded-lg border border-zinc-800 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                            {formatScheduleRun(run, scheduleConfig.timezone)}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-zinc-800 bg-black/20 px-3 py-4 text-sm text-zinc-500">
                          {scheduleConfig.enabled ? 'Enter a valid cron expression to preview upcoming runs.' : 'Enable the schedule to preview upcoming runs.'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-zinc-300">
                    <div className="font-medium text-blue-300">Scheduler endpoint</div>
                    <p className="mt-2 text-zinc-400">Call <code className="text-zinc-200">GET /api/agents/scheduler/tick</code> every minute with the <code className="text-zinc-200">X-Scheduler-Secret</code> header.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-zinc-100">Recent events timeline</CardTitle>
                <CardDescription>Status changes, heartbeats, and deployments are recorded here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {agent.recentEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                    No events recorded yet.
                  </div>
                ) : (
                  agent.recentEvents.map((event) => (
                    <div key={event.id} className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="font-medium capitalize text-zinc-100">{event.type.replace(/-/g, ' ')}</div>
                          <div className="text-xs text-zinc-500">{formatRelativeTime(event.createdAt)}</div>
                        </div>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-zinc-400">{JSON.stringify(event.data ?? {}, null, 2)}</pre>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="executions" className="pt-4">
            <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-zinc-100">Workflow executions</CardTitle>
                <CardDescription>All runs triggered for the workflow behind this agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {executions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                    No executions have been recorded yet.
                  </div>
                ) : (
                  executions.map((execution) => (
                    <Link
                      key={execution.id}
                      href={`/executions/${execution.id}`}
                      className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-blue-500/30 hover:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-zinc-100">{execution.id}</div>
                          <div className="mt-1 text-xs text-zinc-500">Triggered via {execution.triggerType}</div>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-300 capitalize">{execution.status}</Badge>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
                        <div>Started: <span className="text-zinc-100">{formatRelativeTime(execution.startedAt)}</span></div>
                        <div>Duration: <span className="text-zinc-100">{execution.durationMs ? `${execution.durationMs} ms` : '—'}</span></div>
                        <div>Cost: <span className="text-zinc-100">{formatCurrency(execution.costUsd)}</span></div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="memory" className="pt-4">
            <MemoryViewer agentId={agentId} />
          </TabsContent>

          <TabsContent value="cost" className="pt-4">
            {costLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : costData ? (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: 'Total spend', value: formatCurrency(costData.totalCostUsd), icon: DollarSign, accent: 'text-emerald-300' },
                    { label: 'Total runs', value: String(costData.totalExecutions), icon: Activity, accent: 'text-blue-300' },
                    { label: 'Avg per run', value: formatCurrency(costData.avgCostPerRun), icon: TrendingUp, accent: 'text-violet-300' },
                  ].map((stat) => (
                    <Card key={stat.label} className="border-zinc-800 bg-zinc-900/60 shadow-none">
                      <CardContent className="flex items-center gap-3 p-5">
                        <div className={cn('rounded-xl border border-white/5 bg-black/20 p-3', stat.accent)}>
                          <stat.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-xl font-semibold text-zinc-50">{stat.value}</div>
                          <div className="text-sm text-zinc-500">{stat.label}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 7-day trend */}
                {costData.dailyTrend.length > 0 && (
                  <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-zinc-300">7-day spend trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-1.5 h-24">
                        {(() => {
                          const max = Math.max(...costData.dailyTrend.map((d) => d.cost), 0.000001);
                          return costData.dailyTrend.map((day) => (
                            <div key={day.date} className="flex flex-1 flex-col items-center gap-1 group">
                              <div
                                className="w-full rounded-t bg-blue-500/60 transition-all group-hover:bg-blue-400"
                                style={{ height: `${Math.max((day.cost / max) * 80, day.cost > 0 ? 4 : 0)}px` }}
                                title={`${day.date}: ${formatCurrency(day.cost)}`}
                              />
                              <span className="text-[10px] text-zinc-600">{day.date.slice(5)}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top nodes by cost */}
                {costData.topNodes.length > 0 && (
                  <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-zinc-300">Top nodes by spend</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {costData.topNodes.map((node) => (
                        <div key={node.nodeId} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/20 px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-zinc-100">{node.nodeType}</div>
                            <div className="text-xs text-zinc-500">{node.callCount} call{node.callCount !== 1 ? 's' : ''} · ID: {node.nodeId.slice(0, 8)}…</div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-300">{formatCurrency(node.totalCost)}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="border-dashed border-zinc-800 bg-zinc-950/60 shadow-none">
                <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    <DollarSign className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-zinc-100">No cost data yet</h3>
                    <p className="text-sm text-zinc-400">Run this agent to start tracking token and sandbox spend per node.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
