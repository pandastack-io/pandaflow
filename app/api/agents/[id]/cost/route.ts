import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agents, executionCosts, executions } from '@/lib/db/schema';
import { getAgentTotalCost } from '@/lib/execution/cost-tracker';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

function lastSevenDays(): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;

  try {
    const { id } = await params;
    const [agent] = await db
      .select({ id: agents.id, workflowId: agents.workflowId })
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const workflowId = agent.workflowId;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [executionCountRow, totalsRow, dailyRows, topNodeRows, totalCostUsd] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(executions)
        .where(eq(executions.workflowId, workflowId)),
      db
        .select({
          llmCost: sql<string>`coalesce(sum(case when (${executionCosts.tokensInput} > 0 or ${executionCosts.tokensOutput} > 0) then ${executionCosts.costUsd} else 0 end), 0)`,
          sandboxCost: sql<string>`coalesce(sum(case when ${executionCosts.sandflareMs} > 0 then ${executionCosts.costUsd} else 0 end), 0)`,
          totalTokensInput: sql<number>`coalesce(sum(${executionCosts.tokensInput}), 0)`,
          totalTokensOutput: sql<number>`coalesce(sum(${executionCosts.tokensOutput}), 0)`,
        })
        .from(executionCosts)
        .innerJoin(executions, eq(executionCosts.executionId, executions.id))
        .where(eq(executions.workflowId, workflowId)),
      db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${executions.createdAt}), 'YYYY-MM-DD')`,
          cost: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
          executions: sql<number>`count(distinct ${executions.id})`,
        })
        .from(executions)
        .leftJoin(executionCosts, eq(executionCosts.executionId, executions.id))
        .where(and(
          eq(executions.workflowId, workflowId),
          gte(executions.createdAt, sevenDaysAgo)
        ))
        .groupBy(sql`date_trunc('day', ${executions.createdAt})`)
        .orderBy(sql`date_trunc('day', ${executions.createdAt}) asc`),
      db
        .select({
          nodeType: executionCosts.nodeType,
          nodeName: executionCosts.nodeName,
          totalCost: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(executionCosts)
        .innerJoin(executions, eq(executionCosts.executionId, executions.id))
        .where(eq(executions.workflowId, workflowId))
        .groupBy(executionCosts.nodeType, executionCosts.nodeName)
        .orderBy(desc(sql`sum(${executionCosts.costUsd})`))
        .limit(5),
      getAgentTotalCost(workflowId),
    ]);

    const executionCount = Number(executionCountRow[0]?.count ?? 0);
    const totals = totalsRow[0];
    const dayLookup = new Map(
      dailyRows.map((row) => [row.date, { cost: toNumber(row.cost), executions: Number(row.executions ?? 0) }])
    );

    return NextResponse.json({
      success: true,
      data: {
        totalCostUsd,
        executionCount,
        avgCostPerExecution: executionCount > 0 ? totalCostUsd / executionCount : 0,
        breakdown: {
          llmCost: toNumber(totals?.llmCost),
          sandboxCost: toNumber(totals?.sandboxCost),
          totalTokensInput: Number(totals?.totalTokensInput ?? 0),
          totalTokensOutput: Number(totals?.totalTokensOutput ?? 0),
        },
        byDay: lastSevenDays().map((date) => ({
          date,
          cost: dayLookup.get(date)?.cost ?? 0,
          executions: dayLookup.get(date)?.executions ?? 0,
        })),
        topExpensiveNodes: topNodeRows.map((row) => ({
          nodeType: row.nodeType ?? 'unknown',
          nodeName: row.nodeName ?? row.nodeType ?? 'Unknown node',
          totalCost: toNumber(row.totalCost),
          count: Number(row.count ?? 0),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching agent cost:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent cost' },
      { status: 500 }
    );
  }
}
