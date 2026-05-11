'use client';

/**
 * TraceViewer — Distributed trace waterfall for multi-agent executions.
 *
 * Shows all executions involved in a trace as a indented waterfall.
 * Each row = one agent/workflow call, with depth indent, status dot,
 * duration bar, and cost. Clicking a trace row links to the execution detail.
 *
 * Data flow:
 *   1. Fetch recent executions for this agent (via /api/executions?agentId=…)
 *   2. Collect unique traceIds from multi-agent executions (isDurable = true)
 *   3. For each traceId, fetch the call tree from /api/traces/[traceId]
 *   4. Render waterfall
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, ChevronDown, ChevronRight, Clock, DollarSign, GitBranch, Loader2, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TraceNode {
  executionId: string;
  parentExecutionId: string | null;
  callerNodeId: string | null;
  agentId: string | null;
  agentName: string | null;
  workflowId: string;
  workflowName: string | null;
  callDepth: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  costUsd: number;
  children: TraceNode[];
}

interface TraceResponse {
  traceId: string;
  rootExecution: TraceNode;
  totalCostUsd: number;
  totalDurationMs: number;
  nodeCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case 'completed': return 'bg-emerald-400';
    case 'running':   return 'bg-blue-400 animate-pulse';
    case 'failed':    return 'bg-red-400';
    case 'cancelled': return 'bg-zinc-500';
    default:          return 'bg-yellow-400';
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed': return 'text-emerald-300 border-emerald-800';
    case 'running':   return 'text-blue-300 border-blue-800';
    case 'failed':    return 'text-red-300 border-red-800';
    case 'cancelled': return 'text-zinc-400 border-zinc-700';
    default:          return 'text-yellow-300 border-yellow-800';
  }
}

function formatCost(value: number) {
  if (!value) return '—';
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function formatMs(ms: number | null) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ─── Waterfall Row ─────────────────────────────────────────────────────────────

function TraceRow({ node, rootDuration, expanded, onToggle }: {
  node: TraceNode;
  rootDuration: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expanded.has(node.executionId);
  const hasChildren = node.children.length > 0;

  // Duration bar width as % of root duration
  const barWidth = rootDuration > 0 && node.durationMs
    ? Math.min(100, (node.durationMs / rootDuration) * 100)
    : 0;

  const indentPx = node.callDepth * 24;

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2.5 text-sm',
          'hover:border-zinc-700 hover:bg-zinc-900 transition-colors'
        )}
        style={{ marginLeft: indentPx }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => onToggle(node.executionId)}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-300',
            !hasChildren && 'invisible'
          )}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Status dot */}
        <div className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(node.status))} />

        {/* Name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 truncate">
              {node.agentName ?? node.workflowName ?? node.executionId.slice(0, 8)}
            </span>
            {node.callDepth === 0 && (
              <span className="shrink-0 rounded bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">root</span>
            )}
            {node.callDepth > 0 && (
              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                depth {node.callDepth}
              </span>
            )}
          </div>
          {/* Duration bar */}
          {barWidth > 0 && (
            <div className="mt-1 h-1 w-full rounded-full bg-zinc-800">
              <div
                className={cn(
                  'h-1 rounded-full',
                  node.status === 'failed' ? 'bg-red-500' :
                  node.callDepth === 0 ? 'bg-indigo-500' : 'bg-blue-500'
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          )}
        </div>

        {/* Duration */}
        <div className="shrink-0 w-16 text-right text-xs text-zinc-400 tabular-nums">
          {formatMs(node.durationMs)}
        </div>

        {/* Cost */}
        <div className="shrink-0 w-20 text-right text-xs text-emerald-300 tabular-nums">
          {formatCost(node.costUsd)}
        </div>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn('shrink-0 capitalize text-xs', statusBadge(node.status))}
        >
          {node.status}
        </Badge>

        {/* Link to execution */}
        <Link
          href={`/executions/${node.executionId}`}
          className="shrink-0 text-[10px] text-zinc-600 hover:text-zinc-400 underline"
          onClick={(e) => e.stopPropagation()}
        >
          open
        </Link>
      </div>

      {/* Children */}
      {isExpanded && node.children.map((child) => (
        <TraceRow
          key={child.executionId}
          node={child}
          rootDuration={rootDuration}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

// ─── Single Trace Card ─────────────────────────────────────────────────────────

function TraceCard({ trace }: { trace: TraceResponse }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand root and depth-1 nodes
    const ids = new Set<string>();
    ids.add(trace.rootExecution.executionId);
    trace.rootExecution.children.forEach((c) => ids.add(c.executionId));
    return ids;
  });

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const startedAt = trace.rootExecution.startedAt
    ? new Date(trace.rootExecution.startedAt)
    : null;

  return (
    <Card className="border-zinc-800 bg-zinc-950/70 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 shrink-0 text-indigo-400" />
              <CardTitle className="text-sm font-semibold text-zinc-100 truncate">
                {trace.rootExecution.agentName ?? trace.rootExecution.workflowName ?? 'Trace'}
              </CardTitle>
              <Badge variant="outline" className={cn('capitalize text-xs shrink-0', statusBadge(trace.rootExecution.status))}>
                {trace.rootExecution.status}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-xs text-zinc-500 font-mono">
              {trace.traceId}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <div className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{trace.nodeCount} agent{trace.nodeCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatMs(trace.totalDurationMs)}</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-300">{formatCost(trace.totalCostUsd)}</span>
            </div>
            {startedAt && (
              <span className="text-zinc-500">
                {formatDistanceToNow(startedAt, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Column headers */}
        <div className="mb-1.5 flex items-center gap-3 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
          <div className="w-5 shrink-0" />
          <div className="w-2 shrink-0" />
          <div className="flex-1">Agent / Workflow</div>
          <div className="w-16 shrink-0 text-right">Duration</div>
          <div className="w-20 shrink-0 text-right">Cost</div>
          <div className="w-20 shrink-0 text-right">Status</div>
          <div className="w-8 shrink-0" />
        </div>
        <div className="space-y-1">
          <TraceRow
            node={trace.rootExecution}
            rootDuration={trace.totalDurationMs || trace.rootExecution.durationMs || 1}
            expanded={expanded}
            onToggle={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface TraceViewerProps {
  agentId: string;
}

export function TraceViewer({ agentId }: TraceViewerProps) {
  const [traces, setTraces] = useState<TraceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch recent executions for this agent.
        const execRes = await fetch(
          `/api/executions?agentId=${encodeURIComponent(agentId)}&limit=50`,
          { cache: 'no-store' }
        );
        const execData = await execRes.json();
        const executionList: Array<{ traceId?: string; isDurable?: boolean }> =
          Array.isArray(execData.executions) ? execData.executions :
          Array.isArray(execData) ? execData : [];

        // 2. Unique traceIds from durable (multi-agent) executions.
        const traceIds = [
          ...new Set(
            executionList
              .filter((e) => e.traceId && e.isDurable)
              .map((e) => e.traceId as string)
          ),
        ].slice(0, 10); // Show at most 10 recent traces

        if (cancelled) return;

        if (traceIds.length === 0) {
          setTraces([]);
          setLoading(false);
          return;
        }

        // 3. Fetch each trace in parallel.
        const results = await Promise.allSettled(
          traceIds.map((id) =>
            fetch(`/api/traces/${id}`, { cache: 'no-store' }).then((r) => r.json() as Promise<TraceResponse>)
          )
        );

        if (cancelled) return;

        const loaded = results
          .filter((r): r is PromiseFulfilledResult<TraceResponse> => r.status === 'fulfilled' && !!r.value.traceId)
          .map((r) => r.value);

        setTraces(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load traces');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-900/40 bg-red-950/20 shadow-none">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (traces.length === 0) {
    return (
      <Card className="border-dashed border-zinc-800 bg-zinc-950/60 shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
            <Network className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-100">No multi-agent traces yet</h3>
            <p className="text-sm text-zinc-400">
              Add a <span className="font-mono text-xs text-indigo-300">Supervisor</span> or{' '}
              <span className="font-mono text-xs text-indigo-300">Invoke Agent</span> node to your
              workflow, then run it. Each call chain will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Multi-agent call traces</h3>
          <p className="text-xs text-zinc-500">
            Each trace shows the full agent call tree for one workflow run.
          </p>
        </div>
        <span className="text-xs text-zinc-500">{traces.length} trace{traces.length !== 1 ? 's' : ''}</span>
      </div>
      {traces.map((trace) => (
        <TraceCard key={trace.traceId} trace={trace} />
      ))}
    </div>
  );
}
