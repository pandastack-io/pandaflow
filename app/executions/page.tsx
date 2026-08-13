'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import {
  Activity,
  CheckCircle,
  ChevronRight,
  Eye,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Timer,
  TrendingUp,
  X,
  XCircle,
  Clock,
} from 'lucide-react';
import { MainLayout } from '@/components/layouts/main-layout';
import { ExecutionReplayView, type ExecutionReplayData } from '@/components/executions/execution-replay-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration } from '@/lib/executions/replay';

interface ExecutionListItem {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerType: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  costUsd?: number | null;
  error?: unknown;
}

const statusBadgeClasses: Record<ExecutionListItem['status'], string> = {
  completed: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  running: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  pending: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',
};

function StatusIcon({ status }: { status: ExecutionListItem['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-500 dark:text-yellow-300" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatUsd(value?: number | null) {
  if (!value) return '$0.0000';
  if (value >= 1) return `~$${value.toFixed(2)}`;
  if (value >= 0.01) return `~$${value.toFixed(3)}`;
  return `~$${value.toFixed(4)}`;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionReplayData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const response = await fetch('/api/executions');
      const data = await response.json();
      if (data.success) {
        setExecutions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadExecutions = async () => {
      try {
        const response = await fetch('/api/executions');
        const data = await response.json();
        if (!cancelled && data.success) {
          setExecutions(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch executions:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadExecutions();
    const interval = setInterval(() => {
      void loadExecutions();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selectedExecutionId) {
      return;
    }

    let cancelled = false;

    const loadExecutionDetail = async () => {
      try {
        const response = await fetch(`/api/executions/${selectedExecutionId}`);
        const data = await response.json();
        if (!cancelled && data.success) {
          setSelectedExecution(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch execution detail:', error);
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    void loadExecutionDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedExecutionId]);

  useEffect(() => {
    if (!selectedExecutionId || !selectedExecution || (selectedExecution.status !== 'running' && selectedExecution.status !== 'pending')) {
      return;
    }

    let cancelled = false;

    const refreshExecutionDetail = async () => {
      try {
        const response = await fetch(`/api/executions/${selectedExecutionId}`);
        const data = await response.json();
        if (!cancelled && data.success) {
          setSelectedExecution(data.data);
        }
      } catch (error) {
        console.error('Failed to refresh execution detail:', error);
      }
    };

    const interval = setInterval(() => {
      void refreshExecutionDetail();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedExecution, selectedExecutionId]);

  const handleRerun = async (execution: ExecutionListItem | ExecutionReplayData) => {
    if (!execution.workflowId) return;
    setRerunning(execution.id);

    try {
      await fetch(`/api/workflows/${execution.workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: 'manual' }),
      });
      void fetchExecutions();
    } catch (error) {
      console.error(error);
    } finally {
      setRerunning(null);
    }
  };

  const filteredExecutions = useMemo(
    () => executions.filter((execution) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        execution.workflowName?.toLowerCase().includes(query) ||
        execution.id.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
      return matchesSearch && matchesStatus;
    }),
    [executions, searchQuery, statusFilter]
  );

  const total = executions.length;
  const completed = executions.filter((execution) => execution.status === 'completed').length;
  const failed = executions.filter((execution) => execution.status === 'failed').length;
  const running = executions.filter((execution) => execution.status === 'running').length;
  const successRate = total > 0 ? Math.round((completed / (completed + failed || 1)) * 100) : 0;
  const avgDuration =
    executions.filter((execution) => execution.durationMs).reduce((acc, execution) => acc + (execution.durationMs || 0), 0) /
    (executions.filter((execution) => execution.durationMs).length || 1);

  return (
    <MainLayout>
      <div className="flex h-full flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Executions</h1>
            <p className="mt-1 text-sm text-muted-foreground">Replay completed runs and step through each node with raw inputs and outputs.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchExecutions()}>
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: 'Total Runs', value: total, icon: Activity, color: 'text-blue-600 dark:text-blue-300' },
            { label: 'Success Rate', value: `${successRate}%`, icon: TrendingUp, color: 'text-green-600 dark:text-green-300' },
            { label: 'Avg Duration', value: formatDuration(avgDuration), icon: Timer, color: 'text-violet-600 dark:text-violet-300' },
            { label: 'Running Now', value: running, icon: Loader2, color: 'text-yellow-600 dark:text-yellow-300', spin: running > 0 },
          ].map((stat) => (
            <Card key={stat.label} className="border-border bg-card shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={stat.color}>
                  <stat.icon className={`h-5 w-5 ${stat.spin ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by workflow or execution ID..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-blue-500/50"
            />
          </div>
          {['all', 'running', 'completed', 'failed', 'pending'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                statusFilter === status
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-200'
                  : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className={`min-h-0 ${selectedExecutionId ? 'w-[42%] min-w-[420px]' : 'flex-1'} overflow-hidden`}>
            {loading ? (
              <div className="flex justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredExecutions.length === 0 ? (
              <Card className="border-border bg-card shadow-none">
                <CardContent className="flex flex-col items-center py-16">
                  <div className="mb-4 rounded-full bg-muted p-4">
                    <Play className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {searchQuery || statusFilter !== 'all' ? 'No executions found' : 'No executions yet'}
                  </h3>
                  <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters.'
                      : 'Run a workflow to see execution history here.'}
                  </p>
                  {!searchQuery && statusFilter === 'all' ? (
                    <Button asChild>
                      <Link href="/workflows">Go to Workflows</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card className="h-full border-border bg-card shadow-none">
                <CardContent className="h-full overflow-auto p-0">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 border-b border-border bg-background/95">
                      <tr>
                        <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow</th>
                        <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Trigger</th>
                        <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Started</th>
                        <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Duration</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExecutions.map((execution) => {
                        const selected = selectedExecutionId === execution.id;

                        return (
                          <tr
                            key={execution.id}
                            className={`border-b border-border transition-colors ${selected ? 'bg-blue-500/10' : 'hover:bg-muted/50'} cursor-pointer`}
                            onClick={() => {
                              const nextExecutionId = selected ? null : execution.id;
                              setSelectedExecutionId(nextExecutionId);
                              if (nextExecutionId) {
                                setDetailLoading(true);
                              } else {
                                setSelectedExecution(null);
                                setDetailLoading(false);
                              }
                            }}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <StatusIcon status={execution.status} />
                                <Badge variant="outline" className={statusBadgeClasses[execution.status]}>
                                  {execution.status}
                                </Badge>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <Link
                                  href={`/workflows/${execution.workflowId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="text-sm font-medium text-foreground hover:underline"
                                >
                                  {execution.workflowName || 'Unknown Workflow'}
                                </Link>
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="font-mono text-xs text-muted-foreground">{execution.id.slice(0, 8)}…</p>
                                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
                                    {formatUsd(execution.costUsd)}
                                  </Badge>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">{execution.triggerType || 'manual'}</Badge>
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="text-sm text-foreground">{formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(execution.startedAt), 'MMM d, HH:mm:ss')}</p>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-sm text-muted-foreground">{formatDuration(execution.durationMs)}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                                <Button asChild size="sm" variant="ghost">
                                  <Link href={`/executions/${execution.id}`} title="Open full replay">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                {(execution.status === 'completed' || execution.status === 'failed') ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void handleRerun(execution)}
                                    disabled={rerunning === execution.id}
                                    title="Re-run"
                                  >
                                    {rerunning === execution.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <RotateCcw className="h-3.5 w-3.5" />}
                                  </Button>
                                ) : null}
                                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selected ? 'rotate-90' : ''}`} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          {selectedExecutionId ? (
            <div className="min-h-0 min-w-0 flex-1">
              <Card className="h-full overflow-hidden border-border bg-card shadow-none">
                <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Execution Replay</div>
                    <div className="text-xs text-muted-foreground font-mono">{selectedExecutionId}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setSelectedExecutionId(null);
                    setSelectedExecution(null);
                    setDetailLoading(false);
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardContent className="h-[calc(100%-57px)] p-4">
                  <ExecutionReplayView
                    execution={selectedExecution}
                    loading={detailLoading}
                    headerActions={selectedExecution ? (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/workflows/${selectedExecution.workflowId}`}>Open Workflow</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/executions/${selectedExecution.id}`}>Full View</Link>
                        </Button>
                        {(selectedExecution.status === 'completed' || selectedExecution.status === 'failed') ? (
                          <Button
                            size="sm"
                            onClick={() => void handleRerun(selectedExecution)}
                            disabled={rerunning === selectedExecution.id}
                          >
                            {rerunning === selectedExecution.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Re-run
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    emptyTitle="Loading execution"
                    emptyDescription="Fetching execution logs and replay data."
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
}
