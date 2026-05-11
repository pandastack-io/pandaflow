/**
 * GET /api/traces/[traceId]
 *
 * Returns the full multi-agent call tree for a given trace ID.
 * A trace spans every execution involved in one top-level workflow run,
 * including all sub-workflow and agent.invoke children.
 *
 * Response shape:
 * {
 *   traceId: string,
 *   rootExecution: TraceNode,
 *   totalCostUsd: number,
 *   totalDurationMs: number,
 *   nodeCount: number,
 * }
 *
 * TraceNode: {
 *   executionId, parentExecutionId, agentId, agentName,
 *   workflowId, workflowName, callDepth, status,
 *   startedAt, completedAt, durationMs, costUsd,
 *   children: TraceNode[]
 * }
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { executionCosts, executionTraces, workflows } from '@/lib/db/schema';

interface TraceRow {
  traceId: string;
  executionId: string;
  parentExecutionId: string | null;
  callerNodeId: string | null;
  agentId: string | null;
  agentName: string | null;
  workflowId: string;
  workflowName: string | null;
  callDepth: number;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  costUsd: string | null;
}

interface TraceNode extends Omit<TraceRow, 'costUsd'> {
  costUsd: number;
  children: TraceNode[];
}

function buildTree(rows: TraceRow[]): TraceNode | null {
  if (rows.length === 0) return null;

  // Enrich each row with cost as a number and empty children array.
  const nodeMap = new Map<string, TraceNode>(
    rows.map((r) => [r.executionId, { ...r, costUsd: parseFloat(r.costUsd ?? '0') || 0, children: [] }])
  );

  let root: TraceNode | null = null;

  for (const node of nodeMap.values()) {
    if (!node.parentExecutionId) {
      root = node;
    } else {
      const parent = nodeMap.get(node.parentExecutionId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  // Sort children by startedAt ascending.
  function sortChildren(node: TraceNode) {
    node.children.sort((a, b) => {
      const at = a.startedAt?.getTime() ?? 0;
      const bt = b.startedAt?.getTime() ?? 0;
      return at - bt;
    });
    node.children.forEach(sortChildren);
  }

  if (root) sortChildren(root);
  return root;
}

function sumTree(node: TraceNode): { totalCostUsd: number; totalDurationMs: number; nodeCount: number } {
  let totalCostUsd = node.costUsd;
  let totalDurationMs = node.durationMs ?? 0;
  let nodeCount = 1;

  for (const child of node.children) {
    const sub = sumTree(child);
    totalCostUsd += sub.totalCostUsd;
    // Duration of root already covers wall time; just accumulate children for accounting.
    nodeCount += sub.nodeCount;
  }

  return { totalCostUsd, totalDurationMs, nodeCount };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;

  if (!traceId) {
    return NextResponse.json({ error: 'traceId is required' }, { status: 400 });
  }

  // Fetch all trace rows for this traceId.
  const rows = await db
    .select({
      traceId: executionTraces.traceId,
      executionId: executionTraces.executionId,
      parentExecutionId: executionTraces.parentExecutionId,
      callerNodeId: executionTraces.callerNodeId,
      agentId: executionTraces.agentId,
      agentName: executionTraces.agentName,
      workflowId: executionTraces.workflowId,
      workflowName: executionTraces.workflowName,
      callDepth: executionTraces.callDepth,
      status: executionTraces.status,
      startedAt: executionTraces.startedAt,
      completedAt: executionTraces.completedAt,
      durationMs: executionTraces.durationMs,
      costUsd: executionTraces.costUsd,
    })
    .from(executionTraces)
    .where(eq(executionTraces.traceId, traceId));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  // Enrich workflow names where missing.
  const workflowIds = [...new Set(rows.map((r) => r.workflowId))];
  const workflowNames = await db
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(sql`${workflows.id} = ANY(${workflowIds})`);

  const nameMap = new Map(workflowNames.map((w) => [w.id, w.name]));

  // Fill in live cost from execution_costs if trace row has no cost.
  const executionIds = rows.map((r) => r.executionId);
  const costRows = await db
    .select({
      executionId: executionCosts.executionId,
      total: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
    })
    .from(executionCosts)
    .where(sql`${executionCosts.executionId} = ANY(${executionIds})`)
    .groupBy(executionCosts.executionId);

  const costMap = new Map(costRows.map((c) => [c.executionId, parseFloat(c.total) || 0]));

  const enriched: TraceRow[] = rows.map((r) => ({
    ...r,
    workflowName: r.workflowName ?? nameMap.get(r.workflowId) ?? r.workflowId,
    costUsd: String(costMap.get(r.executionId) ?? (parseFloat(r.costUsd ?? '0') || 0)),
  }));

  const tree = buildTree(enriched);

  if (!tree) {
    return NextResponse.json({ error: 'Could not build trace tree' }, { status: 500 });
  }

  const { totalCostUsd, totalDurationMs, nodeCount } = sumTree(tree);

  return NextResponse.json({
    traceId,
    rootExecution: tree,
    totalCostUsd,
    totalDurationMs,
    nodeCount,
  });
}
