'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildExecutionReplaySteps,
  formatDuration,
  getPreferredStepIndex,
  type ExecutionLogEntry,
  type ExecutionStatus,
} from '@/lib/executions/replay';
import { ExecutionTimeline } from '@/components/executions/execution-timeline';
import { ReplayControls } from '@/components/executions/replay-controls';
import { StepDetailPanel } from '@/components/executions/step-detail-panel';

export interface ExecutionReplayData {
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
  input?: unknown;
  output?: unknown;
  logs?: ExecutionLogEntry[];
}

interface ExecutionReplayViewProps {
  execution: ExecutionReplayData | null;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  headerActions?: React.ReactNode;
}

function stringifyValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—';

  try {
    return format(new Date(value), 'MMM d, HH:mm:ss');
  } catch {
    return '—';
  }
}

function getStatusStyles(status: ExecutionStatus) {
  const styles: Record<ExecutionStatus, string> = {
    completed: 'border-green-500/30 bg-green-500/10 text-green-300',
    failed: 'border-red-500/30 bg-red-500/10 text-red-300',
    running: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    pending: 'border-zinc-700 bg-zinc-900 text-zinc-300',
    cancelled: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  };

  return styles[status];
}

function formatUsd(value?: number | null) {
  if (!value) return '—';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function StatusIcon({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-300" />;
    default:
      return <Clock className="h-4 w-4 text-zinc-400" />;
  }
}

export function ExecutionReplayView({
  execution,
  loading = false,
  emptyTitle = 'No execution selected',
  emptyDescription = 'Choose an execution to replay node-by-node.',
  headerActions,
}: ExecutionReplayViewProps) {
  const steps = React.useMemo(
    () => buildExecutionReplaySteps(execution?.logs ?? [], execution?.status ?? 'completed'),
    [execution?.logs, execution?.status]
  );
  const [selection, setSelection] = React.useState<{ executionId: string | null; stepIndex: number }>({
    executionId: null,
    stepIndex: 0,
  });

  const selectedStepIndex = execution && selection.executionId === execution.id
    ? Math.min(selection.stepIndex, Math.max(steps.length - 1, 0))
    : getPreferredStepIndex(steps);

  const selectedStep = steps[selectedStepIndex] ?? null;

  const selectStepIndex = React.useCallback((stepIndex: number) => {
    setSelection({
      executionId: execution?.id ?? null,
      stepIndex: Math.max(0, Math.min(stepIndex, Math.max(steps.length - 1, 0))),
    });
  }, [execution?.id, steps.length]);

  const handlePrevious = React.useCallback(() => {
    selectStepIndex(selectedStepIndex - 1);
  }, [selectStepIndex, selectedStepIndex]);

  const handleNext = React.useCallback(() => {
    selectStepIndex(selectedStepIndex + 1);
  }, [selectStepIndex, selectedStepIndex]);

  const handleJumpToStart = React.useCallback(() => {
    selectStepIndex(0);
  }, [selectStepIndex]);

  const handleJumpToEnd = React.useCallback(() => {
    selectStepIndex(Math.max(steps.length - 1, 0));
  }, [selectStepIndex, steps.length]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-semibold text-zinc-100">{emptyTitle}</p>
        <p className="max-w-md text-sm text-zinc-400">{emptyDescription}</p>
      </div>
    );
  }

  const executionError = stringifyValue(execution.error);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="border-zinc-800 bg-zinc-900/50 shadow-none">
        <CardHeader className="gap-4 border-b border-zinc-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl text-zinc-50">{execution.workflowName || 'Execution Replay'}</CardTitle>
              <Badge variant="outline" className={getStatusStyles(execution.status)}>
                <StatusIcon status={execution.status} />
                <span className="capitalize">{execution.status}</span>
              </Badge>
              {execution.triggerType ? (
                <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                  {execution.triggerType}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500 font-mono">{execution.id}</div>
          </div>
          {headerActions ? <div className="flex flex-wrap items-center gap-2">{headerActions}</div> : null}
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3 xl:grid-cols-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Started</div>
            <div className="mt-1 text-sm text-zinc-100">{formatTimestamp(execution.startedAt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Completed</div>
            <div className="mt-1 text-sm text-zinc-100">{formatTimestamp(execution.completedAt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Duration</div>
            <div className="mt-1 text-sm text-zinc-100">{formatDuration(execution.durationMs)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Cost</div>
            <div className="mt-1 text-sm text-zinc-100">{formatUsd(execution.costUsd)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Steps</div>
            <div className="mt-1 text-sm text-zinc-100">{steps.length}</div>
          </div>
        </CardContent>
      </Card>

      {executionError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs">{executionError}</pre>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
        <ReplayControls
          currentStep={selectedStepIndex}
          totalSteps={steps.length}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onJumpToStart={handleJumpToStart}
          onJumpToEnd={handleJumpToEnd}
        />

        <div className="grid h-[calc(100%-57px)] min-h-0 gap-4 overflow-hidden p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto">
            <ExecutionTimeline
              steps={steps}
              selectedStepId={selectedStep?.nodeId}
              onSelectStep={selectStepIndex}
            />
          </div>
          <div className="min-h-0 overflow-auto">
            <StepDetailPanel step={selectedStep} />
          </div>
        </div>
      </div>
    </div>
  );
}
