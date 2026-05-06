'use client';

import * as React from 'react';
import { CheckCircle2, Clock, Download, Loader2, PanelRightClose, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import { OutputViewer } from './output-viewer';

interface NodeExecution {
  nodeId: string;
  nodeName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
  timestamp?: string;
}

interface ExecutionResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  nodeExecutions: NodeExecution[];
  error?: unknown;
  output?: unknown;
}

interface ExecutionResultsPanelProps {
  execution: ExecutionResult | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(duration?: number) {
  if (!duration) return null;
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(duration >= 10000 ? 0 : 1)}s`;
}

export function ExecutionResultsPanel({ execution, isOpen, onClose }: ExecutionResultsPanelProps) {
  const selectedCanvasNode = useWorkflowStore((state) => state.selectedNode);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const [manualSelectedNodeId, setManualSelectedNodeId] = React.useState<string | null>(null);

  const selectedNodeId = React.useMemo(() => {
    if (!execution) {
      return null;
    }

    if (
      manualSelectedNodeId &&
      execution.nodeExecutions.some((nodeExecution) => nodeExecution.nodeId === manualSelectedNodeId)
    ) {
      return manualSelectedNodeId;
    }

    if (
      selectedCanvasNode?.id &&
      execution.nodeExecutions.some((nodeExecution) => nodeExecution.nodeId === selectedCanvasNode.id)
    ) {
      return selectedCanvasNode.id;
    }

    return (
      execution.nodeExecutions.find((nodeExecution) => nodeExecution.status === 'running')?.nodeId ??
      [...execution.nodeExecutions].reverse().find((nodeExecution) => nodeExecution.status === 'failed')?.nodeId ??
      [...execution.nodeExecutions].reverse().find((nodeExecution) => nodeExecution.status === 'completed')?.nodeId ??
      execution.nodeExecutions[0]?.nodeId ??
      null
    );
  }, [execution, manualSelectedNodeId, selectedCanvasNode?.id]);

  const selectedNodeExecution = selectedNodeId
    ? execution?.nodeExecutions.find((nodeExecution) => nodeExecution.nodeId === selectedNodeId) ?? null
    : null;

  const handleExport = React.useCallback(() => {
    if (!execution) {
      return;
    }

    const blob = new Blob([JSON.stringify(execution, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `execution-${execution.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [execution]);

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-[calc(100vw-5rem)] transform flex-col border-l border-border bg-card/95 shadow-2xl backdrop-blur-xl transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      <div className="pointer-events-auto flex h-full flex-col pt-14">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">Execution Logs</h3>
              {execution && <ExecutionStatusBadge status={execution.status} />}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {execution ? `Execution ${execution.id.slice(0, 8)}` : 'No execution selected'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={handleExport} disabled={!execution}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!execution ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            Run a workflow to inspect per-node logs and outputs.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(execution.duration) ?? 'In progress'}
              </div>
              <div className="text-right">{execution.nodeExecutions.length} node events</div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
              <div className="overflow-y-auto border-r border-border bg-muted/10 p-3">
                <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Node executions
                </div>
                {execution.nodeExecutions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
                    No nodes executed yet.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {execution.nodeExecutions.map((nodeExecution) => (
                      <button
                        key={nodeExecution.nodeId}
                        type="button"
                        onClick={() => {
                          setManualSelectedNodeId(nodeExecution.nodeId);
                          selectNode(nodeExecution.nodeId);
                        }}
                        className={cn(
                          'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                          selectedNodeId === nodeExecution.nodeId
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-transparent bg-card hover:border-border hover:bg-accent/40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <NodeStatusIcon status={nodeExecution.status} />
                            <span className="truncate text-xs font-medium text-foreground">
                              {nodeExecution.nodeName || nodeExecution.nodeId}
                            </span>
                          </div>
                          {nodeExecution.duration && (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatDuration(nodeExecution.duration)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-h-0 overflow-y-auto p-4">
                {selectedNodeExecution ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {selectedNodeExecution.nodeName || selectedNodeExecution.nodeId}
                        </h4>
                        <ExecutionStatusBadge status={selectedNodeExecution.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {selectedNodeExecution.duration && <span>{formatDuration(selectedNodeExecution.duration)}</span>}
                        {selectedNodeExecution.timestamp && (
                          <span>{new Date(selectedNodeExecution.timestamp).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>

                    <OutputViewer
                      input={selectedNodeExecution.input}
                      output={selectedNodeExecution.output}
                      error={selectedNodeExecution.error}
                    />
                  </div>
                ) : execution.error ? (
                  <OutputViewer error={typeof execution.error === 'string' ? execution.error : JSON.stringify(execution.error, null, 2)} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                    Select a node to view its details.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExecutionStatusBadge({ status }: { status: string }) {
  const variants = {
    pending: 'border-border bg-muted text-muted-foreground',
    running: 'border-blue-500/20 bg-blue-500/10 text-blue-600',
    completed: 'border-green-500/20 bg-green-500/10 text-green-600',
    failed: 'border-red-500/20 bg-red-500/10 text-red-600',
    cancelled: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
  };

  const icons = {
    pending: Clock,
    running: Loader2,
    completed: CheckCircle2,
    failed: XCircle,
    cancelled: XCircle,
  };

  const Icon = icons[status as keyof typeof icons] || Clock;
  const variant = variants[status as keyof typeof variants] || variants.pending;

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium', variant)}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      <span className="capitalize">{status}</span>
    </div>
  );
}

function NodeStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}
