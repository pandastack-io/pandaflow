'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { NodeExecutionState } from '@/hooks/use-execution-stream';
import { CheckCircle2, Loader2, Square, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExecutionStatusBarProps {
  executionStatus: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, NodeExecutionState>;
  nodeIds?: string[];
  totalNodes: number;
  durationMs?: number;
  visible: boolean;
  onViewLogs: () => void;
  onDismiss: () => void;
  onStop?: () => void;
}

function formatDuration(durationMs?: number) {
  if (durationMs == null) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
}

export function ExecutionStatusBar({
  executionStatus,
  nodeStates,
  nodeIds = [],
  totalNodes,
  durationMs,
  visible,
  onViewLogs,
  onDismiss,
  onStop,
}: ExecutionStatusBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (executionStatus !== 'running') {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [executionStatus]);

  const displayTotal = Math.max(totalNodes, nodeIds.length);
  const dotIds = nodeIds.length > 0 ? nodeIds : Array.from({ length: totalNodes }, (_, index) => `node-${index}`);
  const states = dotIds.map((id) => nodeStates[id]?.status ?? 'idle');
  const completedCount = states.filter((state) => state === 'completed').length;
  const failedCount = states.filter((state) => state === 'failed').length;
  const runningCount = states.filter((state) => state === 'running').length;
  const activeCount = completedCount + failedCount + runningCount;
  const progress = displayTotal > 0 ? Math.min(100, Math.round((activeCount / displayTotal) * 100)) : 0;

  const elapsedDurationMs = useMemo(() => {
    if (typeof durationMs === 'number') {
      return durationMs;
    }

    if (executionStatus !== 'running') {
      return undefined;
    }

    const startedAtValues = Object.values(nodeStates)
      .map((state) => state.startedAt)
      .filter((value): value is number => typeof value === 'number');

    if (startedAtValues.length === 0) {
      return undefined;
    }

    return Math.max(0, now - Math.min(...startedAtValues));
  }, [durationMs, executionStatus, nodeStates, now]);

  const formattedDuration = formatDuration(elapsedDurationMs);

  if (!visible || executionStatus === 'idle') {
    return null;
  }

  const theme = {
    running: {
      wrapper: 'border-blue-500/20 bg-background/95',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
      label: 'Running',
      labelClassName: 'text-blue-600',
      barClassName: 'bg-blue-500',
      buttonLabel: 'Logs',
    },
    completed: {
      wrapper: 'border-green-500/20 bg-background/95',
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
      label: 'Completed',
      labelClassName: 'text-green-600',
      barClassName: 'bg-green-500',
      buttonLabel: 'View Output',
    },
    failed: {
      wrapper: 'border-red-500/20 bg-background/95',
      icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
      label: 'Failed',
      labelClassName: 'text-red-600',
      barClassName: 'bg-red-500',
      buttonLabel: 'Logs',
    },
    cancelled: {
      wrapper: 'border-amber-500/20 bg-background/95',
      icon: <X className="h-3.5 w-3.5 text-amber-500" />,
      label: 'Cancelled',
      labelClassName: 'text-amber-600',
      barClassName: 'bg-amber-500',
      buttonLabel: 'Logs',
    },
  }[executionStatus];

  return (
    <div className={cn('fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl', theme.wrapper)}>
      <div className="flex h-11 items-center gap-3 px-4">
        {theme.icon}
        <span className={cn('text-sm font-medium', theme.labelClassName)}>{theme.label}</span>

        <div className="hidden items-center gap-1 sm:flex">
          {dotIds.map((id) => {
            const status = nodeStates[id]?.status ?? 'idle';
            return (
              <span
                key={id}
                className={cn(
                  'h-2.5 w-2.5 rounded-full border transition-all',
                  status === 'completed' && 'border-green-500 bg-green-500',
                  status === 'running' && 'border-blue-500 bg-blue-500 animate-pulse shadow-[0_0_10px_var(--color-blue-500)]',
                  status === 'failed' && 'border-red-500 bg-red-500',
                  status === 'idle' && 'border-muted-foreground/30 bg-transparent'
                )}
              />
            );
          })}
        </div>

        <span className="hidden text-xs text-muted-foreground md:inline">
          {displayTotal > 0
            ? `${completedCount} / ${displayTotal} nodes completed`
            : executionStatus === 'running'
              ? 'Starting…'
              : 'No nodes executed'}
          {failedCount > 0 ? ` • ${failedCount} failed` : ''}
          {runningCount > 0 ? ' • active now' : ''}
        </span>

        {formattedDuration && (
          <span className="ml-auto text-xs text-muted-foreground">
            {executionStatus === 'running' ? `Elapsed ${formattedDuration}` : `in ${formattedDuration}`}
          </span>
        )}
        {!formattedDuration && <span className="ml-auto text-xs text-muted-foreground">{progress}%</span>}

        {executionStatus === 'running' && onStop && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onStop}>
            <Square className="mr-1.5 h-3 w-3" />
            Stop
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onViewLogs}>
          {theme.buttonLabel}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-0.5 bg-muted/60">
        <div
          className={cn('h-full transition-all duration-300', theme.barClassName)}
          style={{ width: executionStatus === 'completed' ? '100%' : `${progress}%` }}
        />
      </div>
    </div>
  );
}
