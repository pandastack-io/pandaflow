'use client';

import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDuration, type ExecutionReplayStep } from '@/lib/executions/replay';

interface ExecutionTimelineProps {
  steps: ExecutionReplayStep[];
  selectedStepId?: string;
  onSelectStep: (stepIndex: number) => void;
}

function StepStatusIcon({ status }: { status: ExecutionReplayStep['status'] }) {
  switch (status) {
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'running':
      return <Clock className="h-4 w-4 text-yellow-500 dark:text-yellow-300" />;
    default:
      return <CheckCircle className="h-4 w-4 text-green-400" />;
  }
}

export function ExecutionTimeline({ steps, selectedStepId, onSelectStep }: ExecutionTimelineProps) {
  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-sm text-foreground">Execution Timeline</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {steps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No step logs captured for this execution.
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, index) => {
              const selected = selectedStepId === step.nodeId;
              const stateClass = step.status === 'failed'
                ? 'border-red-500/30 bg-red-500/10'
                : step.status === 'running'
                  ? 'border-yellow-500/30 bg-yellow-500/10'
                  : 'border-green-500/30 bg-green-500/10';

              return (
                <div key={step.nodeId} className="relative pl-8">
                  {index < steps.length - 1 && (
                    <div className="absolute left-[11px] top-7 h-[calc(100%-4px)] w-px bg-border" />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectStep(index)}
                    className={cn(
                      'group w-full rounded-xl border px-4 py-3 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted/50',
                      stateClass,
                      selected && 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
                    )}
                  >
                    <span className="absolute left-0 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
                      <StepStatusIcon status={step.status} />
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{step.nodeName}</div>
                        <div className="mt-1 text-xs text-muted-foreground font-mono">{step.nodeId}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>{formatDuration(step.durationMs)}</div>
                        <div className="mt-1">{step.logCount} logs</div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
