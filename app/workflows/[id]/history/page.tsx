'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  Timer,
  XCircle,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

type ExecutionSummary = {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerType: string;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  nodeCount: number | null;
};

type ExecutionDetail = ExecutionSummary & {
  logs: Array<Record<string, unknown>>;
  nodeExecutions: Array<{
    nodeId: string;
    nodeName: string;
    status: 'completed' | 'failed' | 'running';
    timestamp?: string | null;
    duration?: number | null;
    input?: unknown;
    output?: unknown;
    error?: string | null;
  }>;
};

type HistoryResponse = {
  workflow: { id: string; name: string };
  executions: ExecutionSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalRuns: number;
    successRate: number;
    avgDurationMs: number | null;
    lastRunAt: string | null;
  };
};

function formatDuration(ms?: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusBadge(status: ExecutionSummary['status']) {
  const colors: Record<ExecutionSummary['status'], string> = {
    completed: 'bg-green-100 text-green-700 border-green-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    running: 'bg-blue-100 text-blue-700 border-blue-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return <Badge variant="outline" className={colors[status]}>{status}</Badge>;
}

function getStatusIcon(status: ExecutionSummary['status'] | ExecutionDetail['nodeExecutions'][number]['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    default:
      return <Clock3 className="h-4 w-4 text-amber-600" />;
  }
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export default function WorkflowHistoryPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'running'>('all');
  const [sortBy, setSortBy] = useState<'status' | 'triggerType' | 'startedAt' | 'durationMs' | 'nodeCount'>('startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);
  const [visiblePayloads, setVisiblePayloads] = useState<Record<string, boolean>>({});

  const historyQueryKey = useMemo(
    () => ['workflow-executions', workflowId, statusFilter, sortBy, sortOrder, page, pageSize],
    [workflowId, statusFilter, sortBy, sortOrder, page, pageSize]
  );

  const historyQuery = useQuery<HistoryResponse>({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
        sortBy,
        sortOrder,
      });
      const response = await fetch(`/api/workflows/${workflowId}/executions?${searchParams.toString()}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error);
      }
      return payload.data as HistoryResponse;
    },
    refetchInterval: (query) => (query.state.data?.executions.some((execution) => execution.status === 'running') ? 10000 : false),
  });

  const detailQuery = useQuery<ExecutionDetail>({
    queryKey: ['workflow-execution-detail', expandedExecutionId],
    enabled: Boolean(expandedExecutionId),
    queryFn: async () => {
      const response = await fetch(`/api/executions/${expandedExecutionId}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error);
      }
      return payload.data as ExecutionDetail;
    },
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 10000 : false),
  });

  const replayMutation = useMutation({
    mutationFn: async (execution: ExecutionSummary) => {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: execution.input ?? {} }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error);
      }
      return payload.data as { executionId: string };
    },
    onSuccess: () => {
      toast({
        title: 'Replay started',
        description: 'The workflow is running again with the same input.',
      });
      void queryClient.invalidateQueries({ queryKey: ['workflow-executions', workflowId] });
    },
    onError: (error) => {
      toast({
        title: 'Replay failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder(column === 'status' || column === 'triggerType' ? 'asc' : 'desc');
  };

  const stats = historyQuery.data?.stats;
  const workflow = historyQuery.data?.workflow;
  const pagination = historyQuery.data?.pagination;
  const executions = historyQuery.data?.executions ?? [];
  const rangeStart = ((pagination?.page ?? page) - 1) * (pagination?.pageSize ?? pageSize) + (executions.length ? 1 : 0);
  const rangeEnd = ((pagination?.page ?? page) - 1) * (pagination?.pageSize ?? pageSize) + executions.length;

  return (
    <MainLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{workflow?.name ?? 'Workflow'}</p>
            <h1 className="text-3xl font-bold tracking-tight">Execution History</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/workflows/${workflowId}`}>Back to Editor</Link>
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total runs', value: stats?.totalRuns ?? 0, icon: Activity },
            { label: 'Success rate', value: `${stats?.successRate ?? 0}%`, icon: CheckCircle2 },
            { label: 'Avg duration', value: formatDuration(stats?.avgDurationMs), icon: Timer },
            {
              label: 'Last run time',
              value: stats?.lastRunAt ? formatDistanceToNow(new Date(stats.lastRunAt), { addSuffix: true }) : '—',
              icon: Clock3,
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <stat.icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-semibold leading-none">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full max-w-44">
                <Select
                  value={statusFilter}
                  onValueChange={(value: 'all' | 'completed' | 'failed' | 'running') => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full max-w-32">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 rows</SelectItem>
                    <SelectItem value="25">25 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {historyQuery.isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : historyQuery.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {historyQuery.error instanceof Error ? historyQuery.error.message : 'Failed to load executions'}
              </div>
            ) : executions.length === 0 ? (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                No execution history for this workflow yet.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'status', label: 'Status' },
                        { key: 'triggerType', label: 'Trigger type' },
                        { key: 'startedAt', label: 'Started at' },
                        { key: 'durationMs', label: 'Duration' },
                        { key: 'nodeCount', label: 'Node count' },
                      ].map((column) => (
                        <TableHead key={column.key}>
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key as typeof sortBy)}
                            className="inline-flex items-center gap-1"
                          >
                            {column.label}
                            {sortBy === column.key ? (
                              sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </TableHead>
                      ))}
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions.map((execution) => {
                      const isExpanded = expandedExecutionId === execution.id;
                      const detail = isExpanded ? detailQuery.data : null;
                      const nodeExecutions = detail?.nodeExecutions ?? [];
                      return (
                        <Fragment key={execution.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => setExpandedExecutionId((current) => (current === execution.id ? null : execution.id))}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(execution.status)}
                                {getStatusBadge(execution.status)}
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{execution.triggerType}</TableCell>
                            <TableCell>
                              {execution.startedAt ? (
                                <div>
                                  <div>{formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}</div>
                                  <div className="text-xs text-muted-foreground">{format(new Date(execution.startedAt), 'MMM d, yyyy HH:mm:ss')}</div>
                                </div>
                              ) : '—'}
                            </TableCell>
                            <TableCell>{formatDuration(execution.durationMs)}</TableCell>
                            <TableCell>{execution.nodeCount ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={replayMutation.isPending && replayMutation.variables?.id === execution.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  replayMutation.mutate(execution);
                                }}
                              >
                                {replayMutation.isPending && replayMutation.variables?.id === execution.id ? (
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="mr-2 h-3.5 w-3.5" />
                                )}
                                Replay
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={6} className="bg-muted/20">
                                {detailQuery.isLoading ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                  </div>
                                ) : detailQuery.isError ? (
                                  <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    {detailQuery.error instanceof Error ? detailQuery.error.message : 'Failed to load node executions'}
                                  </div>
                                ) : (
                                  <div className="space-y-4 p-2">
                                    {Boolean(detail?.error) && (
                                      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                        {typeof detail?.error === 'string' ? detail.error : String(detail?.error ? JSON.stringify(detail.error) : detail?.error)}
                                      </div>
                                    )}
                                    {nodeExecutions.length > 0 ? (
                                      nodeExecutions.map((nodeExecution) => {
                                        const inputKey = `${execution.id}:${nodeExecution.nodeId}:input`;
                                        const outputKey = `${execution.id}:${nodeExecution.nodeId}:output`;
                                        return (
                                          <Card key={nodeExecution.nodeId}>
                                            <CardContent className="space-y-3 p-4">
                                              <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                  {getStatusIcon(nodeExecution.status)}
                                                  <div>
                                                    <p className="font-medium">{nodeExecution.nodeName}</p>
                                                    <p className="text-xs text-muted-foreground">{nodeExecution.nodeId}</p>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                  <span>{formatDuration(nodeExecution.duration)}</span>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setVisiblePayloads((current) => ({ ...current, [inputKey]: !current[inputKey] }))}
                                                  >
                                                    {visiblePayloads[inputKey] ? 'Hide input' : 'Show input'}
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setVisiblePayloads((current) => ({ ...current, [outputKey]: !current[outputKey] }))}
                                                  >
                                                    {visiblePayloads[outputKey] ? 'Hide output' : 'Show output'}
                                                  </Button>
                                                </div>
                                              </div>

                                              {nodeExecution.error && (
                                                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                                  {nodeExecution.error}
                                                </div>
                                              )}

                                              {visiblePayloads[inputKey] && <JsonBlock value={nodeExecution.input} />}
                                              {visiblePayloads[outputKey] && <JsonBlock value={nodeExecution.output} />}
                                            </CardContent>
                                          </Card>
                                        );
                                      })
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No per-node execution details were recorded.</p>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Showing {rangeStart}-{rangeEnd} of {pagination?.total ?? executions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((current) => Math.max(current - 1, 1))}
                      disabled={(pagination?.page ?? page) <= 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={(pagination?.page ?? page) >= (pagination?.totalPages ?? 1)}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
