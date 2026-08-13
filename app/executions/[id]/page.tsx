'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  Code,
  Database,
  Download,
  FastForward,
  GitBranch,
  Globe,
  Loader2,
  PauseCircle,
  Play,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type StepStatus = 'completed' | 'failed' | 'running' | 'skipped';

type ExecutionLog = {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: unknown;
  timestamp: string | null;
  durationMs?: number | null;
};

type ExecutionStep = {
  id: string;
  nodeId: string | null;
  nodeName: string | null;
  nodeType: string | null;
  status: StepStatus;
  input: unknown;
  output: unknown;
  logs: string[];
  rawLogs: ExecutionLog[];
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  prompt: {
    request?: unknown;
    response?: unknown;
    messages?: unknown;
  } | null;
};

type ExecutionSummary = {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  status: ExecutionStatus;
  triggerType?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  costUsd?: number | null;
  error?: unknown;
  output?: unknown;
};

type ExecutionReplayResponse = {
  execution: ExecutionSummary;
  steps: ExecutionStep[];
  logs: ExecutionLog[];
};

function formatDuration(ms?: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(value?: string | null, fallback = '—') {
  if (!value) return fallback;

  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm:ss');
  } catch {
    return fallback;
  }
}

function formatTrigger(value?: string | null) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stringifyValue(value: unknown, empty = 'No data captured.') {
  if (value === undefined) return empty;
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isAiNode(nodeType?: string | null) {
  return Boolean(nodeType?.startsWith('ai.') || nodeType?.startsWith('agent.'));
}

function getStatusBadgeClass(status: ExecutionStatus | StepStatus) {
  switch (status) {
    case 'completed':
      return 'border-green-500/25 bg-green-500/10 text-green-300';
    case 'failed':
      return 'border-red-500/25 bg-red-500/10 text-red-300';
    case 'running':
      return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300';
    case 'skipped':
    case 'pending':
    case 'cancelled':
      return 'border-zinc-700 bg-zinc-800/80 text-zinc-300';
    default:
      return 'border-zinc-700 bg-zinc-800/80 text-zinc-300';
  }
}

function getStatusSymbol(status: StepStatus) {
  switch (status) {
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'running':
      return '⏸';
    case 'skipped':
      return '⏭';
  }
}

function getNodeIcon(nodeType?: string | null): LucideIcon {
  if (!nodeType) return Workflow;
  if (nodeType.startsWith('ai.') || nodeType.startsWith('agent.')) return Brain;
  if (nodeType.startsWith('pandastack.') || nodeType.startsWith('code.')) return Code;
  if (nodeType.startsWith('integration.http') || nodeType.startsWith('trigger.webhook')) return Globe;
  if (nodeType.startsWith('trigger.')) return Play;
  if (nodeType.startsWith('control.')) return GitBranch;
  if (nodeType.startsWith('memory.') || nodeType.startsWith('data.') || nodeType.startsWith('rag.')) return Database;
  if (nodeType.startsWith('utility.')) return Terminal;
  if (nodeType.startsWith('output.')) return Zap;
  return Sparkles;
}

function getPreferredStepId(steps: ExecutionStep[]) {
  return steps.find((step) => step.status === 'running')?.id
    ?? steps.find((step) => step.status === 'failed')?.id
    ?? steps[0]?.id
    ?? null;
}

function JsonViewer({ value, emptyMessage }: { value: unknown; emptyMessage?: string }) {
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200">
      {stringifyValue(value, emptyMessage)}
    </pre>
  );
}

function InspectorEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Workflow className="h-8 w-8 text-zinc-500" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-zinc-400">{description}</p>
    </div>
  );
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const executionId = params.id as string;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const executionQuery = useQuery<ExecutionReplayResponse, Error>({
    queryKey: ['execution-replay', executionId],
    queryFn: async () => {
      const response = await fetch(`/api/executions/${executionId}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load execution replay');
      }

      return payload.data as ExecutionReplayResponse;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status;
      return autoRefresh && (status === 'running' || status === 'pending') ? 3000 : false;
    },
  });

  const execution = executionQuery.data?.execution ?? null;
  const steps = useMemo(() => executionQuery.data?.steps ?? [], [executionQuery.data?.steps]);
  const activeStepId = selectedStepId && steps.some((step) => step.id === selectedStepId)
    ? selectedStepId
    : getPreferredStepId(steps);

  const selectedStep = useMemo(
    () => steps.find((step) => step.id === activeStepId) ?? steps[0] ?? null,
    [activeStepId, steps]
  );

  const downloadJson = () => {
    if (!executionQuery.data) return;

    const blob = new Blob([JSON.stringify(executionQuery.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `execution-${executionId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const executionError = execution?.error ? stringifyValue(execution.error, '') : null;

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="border-zinc-800 bg-zinc-950 text-zinc-100 shadow-none">
          <CardContent className="space-y-6 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild variant="ghost" size="sm" className="gap-2 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100">
                    <Link href="/executions">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Executions
                    </Link>
                  </Button>
                  {execution ? (
                    <Badge variant="outline" className={cn('capitalize', getStatusBadgeClass(execution.status))}>
                      {execution.status}
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
                    {execution?.workflowName || 'Execution Replay'}
                  </h1>
                  <p className="mt-2 text-sm text-zinc-400">
                    Chrome DevTools-style step replay for every node transition, payload, prompt, and log line.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-300">
                  <div className="space-y-0.5">
                    <div className="font-medium text-zinc-100">Auto-refresh</div>
                    <div className="text-xs text-zinc-500">Poll every 3s while running</div>
                  </div>
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Toggle auto refresh" />
                </div>
                <Button variant="outline" className="gap-2 border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800" onClick={downloadJson} disabled={!executionQuery.data}>
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                { label: 'Trigger', value: formatTrigger(execution?.triggerType) },
                { label: 'Started', value: formatTimestamp(execution?.startedAt) },
                { label: 'Completed', value: formatTimestamp(execution?.completedAt) },
                { label: 'Duration', value: formatDuration(execution?.durationMs) },
                { label: 'Steps', value: steps.length ? String(steps.length) : '0' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{item.label}</div>
                  <div className="mt-2 text-sm font-medium text-zinc-100">{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {executionQuery.isLoading ? (
          <Card className="flex min-h-[34rem] items-center justify-center border-zinc-800 bg-zinc-950 shadow-none">
            <CardContent className="flex items-center gap-3 p-6 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading execution replay…
            </CardContent>
          </Card>
        ) : executionQuery.isError ? (
          <Card className="border-red-500/20 bg-zinc-950 shadow-none">
            <CardContent className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <div className="text-lg font-semibold text-zinc-100">Failed to load execution replay</div>
              <p className="max-w-md text-sm text-zinc-400">{executionQuery.error.message}</p>
              <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800" onClick={() => void executionQuery.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-h-[40rem] flex-1 gap-6 xl:grid-cols-[minmax(280px,30%)_minmax(0,1fr)]">
            <Card className="border-zinc-800 bg-zinc-950 shadow-none">
              <CardContent className="flex h-full flex-col p-0">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">Step timeline</div>
                    <div className="text-xs text-zinc-500">Select a node to inspect its replay data</div>
                  </div>
                  {execution && (execution.status === 'running' || execution.status === 'pending') ? (
                    <Badge variant="outline" className={cn('gap-1 capitalize', getStatusBadgeClass('running'))}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      live
                    </Badge>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {steps.length === 0 ? (
                    <InspectorEmpty
                      title="No step data available"
                      description="No step data available for this execution. Future executions will capture full replay data."
                    />
                  ) : (
                    <div className="space-y-3">
                      {steps.map((step) => {
                        const Icon = getNodeIcon(step.nodeType);
                        const selected = selectedStep?.id === step.id;
                        const tone = step.status === 'completed'
                          ? 'border-green-500/20 bg-green-500/10 hover:border-green-500/40'
                          : step.status === 'failed'
                            ? 'border-red-500/20 bg-red-500/10 hover:border-red-500/40'
                            : step.status === 'running'
                              ? 'border-yellow-500/20 bg-yellow-500/10 hover:border-yellow-500/40'
                              : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700';

                        return (
                          <button
                            key={step.id}
                            type="button"
                            onClick={() => setSelectedStepId(step.id)}
                            className={cn(
                              'w-full rounded-2xl border p-4 text-left transition-all',
                              tone,
                              selected && 'ring-1 ring-blue-500/40 border-blue-500/50 bg-blue-500/10'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
                                    <Icon className="h-4 w-4 text-zinc-200" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-zinc-100">{step.nodeName || step.nodeId || 'Unnamed node'}</div>
                                    <div className="truncate text-xs text-zinc-500">{step.nodeType || step.nodeId || 'Unknown node'}</div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className={cn('gap-1 text-xs', getStatusBadgeClass(step.status))}>
                                    <span>{getStatusSymbol(step.status)}</span>
                                    <span className="capitalize">{step.status}</span>
                                  </Badge>
                                  <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                                    {formatDuration(step.durationMs)}
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-right text-[11px] text-zinc-500">
                                <div>{formatTimestamp(step.startedAt, 'Waiting')}</div>
                                <div className="mt-2">{step.rawLogs.length} logs</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950 shadow-none">
              <CardContent className="flex h-full flex-col p-0">
                <div className="border-b border-zinc-800 px-5 py-4">
                  {selectedStep ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-xl font-semibold text-zinc-50">{selectedStep.nodeName || selectedStep.nodeId || 'Step inspector'}</h2>
                            <Badge variant="outline" className={cn('capitalize', getStatusBadgeClass(selectedStep.status))}>
                              {selectedStep.status}
                            </Badge>
                          </div>
                          <div className="mt-2 text-sm text-zinc-500">{selectedStep.nodeType || selectedStep.nodeId || 'Unknown node'}</div>
                        </div>
                        <div className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Started</div>
                            <div className="mt-1 text-zinc-200">{formatTimestamp(selectedStep.startedAt)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Completed</div>
                            <div className="mt-1 text-zinc-200">{formatTimestamp(selectedStep.completedAt)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Duration</div>
                            <div className="mt-1 text-zinc-200">{formatDuration(selectedStep.durationMs)}</div>
                          </div>
                        </div>
                      </div>

                      {selectedStep.error ? (
                        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs">{selectedStep.error}</pre>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-semibold text-zinc-50">Step inspector</h2>
                      <p className="mt-1 text-sm text-zinc-500">Choose a step from the timeline to inspect its input, output, and logs.</p>
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {!selectedStep ? (
                    <InspectorEmpty title="No step selected" description="Pick a step on the left to inspect payloads, prompts, and raw logs." />
                  ) : (
                    <Tabs key={selectedStep.id} defaultValue="input" className="space-y-4">
                      <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-xl bg-zinc-900 p-1 text-zinc-400">
                        <TabsTrigger value="input" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50">Input</TabsTrigger>
                        <TabsTrigger value="output" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50">Output</TabsTrigger>
                        <TabsTrigger value="logs" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50">Logs</TabsTrigger>
                        {isAiNode(selectedStep.nodeType) ? (
                          <TabsTrigger value="prompt" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50">Prompt</TabsTrigger>
                        ) : null}
                      </TabsList>

                      <TabsContent value="input" className="space-y-4">
                        <JsonViewer value={selectedStep.input} emptyMessage="No input payload was captured for this step." />
                      </TabsContent>

                      <TabsContent value="output" className="space-y-4">
                        <JsonViewer value={selectedStep.output} emptyMessage="No output payload was captured for this step." />
                      </TabsContent>

                      <TabsContent value="logs" className="space-y-4">
                        {selectedStep.logs.length === 0 ? (
                          <InspectorEmpty title="No logs captured" description="This step did not persist any raw log lines." />
                        ) : (
                          <pre className="max-h-[32rem] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs leading-6 text-zinc-200">
                            {selectedStep.logs.join('\n')}
                          </pre>
                        )}
                      </TabsContent>

                      {isAiNode(selectedStep.nodeType) ? (
                        <TabsContent value="prompt" className="space-y-4">
                          {selectedStep.prompt ? (
                            <div className="grid gap-4 xl:grid-cols-2">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                  <PauseCircle className="h-4 w-4 text-zinc-400" />
                                  Prompt request
                                </div>
                                <JsonViewer value={selectedStep.prompt.messages ?? selectedStep.prompt.request} emptyMessage="No prompt request was captured for this AI step." />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                  <FastForward className="h-4 w-4 text-zinc-400" />
                                  Model response
                                </div>
                                <JsonViewer value={selectedStep.prompt.response} emptyMessage="No model response was captured for this AI step." />
                              </div>
                            </div>
                          ) : (
                            <InspectorEmpty title="No prompt captured" description="This AI step ran before prompt capture was enabled, or the node did not persist prompt metadata." />
                          )}
                        </TabsContent>
                      ) : null}
                    </Tabs>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {executionError ? (
          <Card className="border-red-500/20 bg-zinc-950 shadow-none">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Execution error
              </div>
              <pre className="overflow-auto rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-100">
                {executionError}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </MainLayout>
  );
}
