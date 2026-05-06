import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { executions, workflows } from '@/lib/db/schema';

const STATUS_FILTERS = new Set(['completed', 'failed', 'running']);
const SORT_COLUMNS = {
  status: executions.status,
  triggerType: executions.triggerType,
  startedAt: executions.startedAt,
  durationMs: executions.durationMs,
  nodeCount: executions.nodeCount,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '10', 10) || 10, 1), 50);
    const status = searchParams.get('status') || 'all';
    const sortBy = searchParams.get('sortBy') || 'startedAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const [workflow] = await db
      .select({ id: workflows.id, name: workflows.name })
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    const filters = [eq(executions.workflowId, id)];
    if (STATUS_FILTERS.has(status)) {
      filters.push(eq(executions.status, status as 'completed' | 'failed' | 'running'));
    }
    const whereClause = filters.length > 1 ? and(...filters) : filters[0];

    const sortColumn = SORT_COLUMNS[sortBy as keyof typeof SORT_COLUMNS] ?? executions.startedAt;
    const orderClause = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const offset = (page - 1) * pageSize;

    const pageExecutions = await db
      .select()
      .from(executions)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(pageSize)
      .offset(offset);

    const [filteredCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(executions)
      .where(whereClause);

    const [statsResult] = await db
      .select({
        totalRuns: sql<number>`count(*)`,
        completedRuns: sql<number>`sum(case when ${executions.status} = 'completed' then 1 else 0 end)`,
        failedRuns: sql<number>`sum(case when ${executions.status} = 'failed' then 1 else 0 end)`,
        avgDurationMs: sql<number | null>`avg(${executions.durationMs})`,
        lastRunAt: sql<string | null>`max(${executions.startedAt})`,
      })
      .from(executions)
      .where(eq(executions.workflowId, id));

    const total = Number(filteredCountResult?.count ?? 0);
    const totalRuns = Number(statsResult?.totalRuns ?? 0);
    const completedRuns = Number(statsResult?.completedRuns ?? 0);
    const failedRuns = Number(statsResult?.failedRuns ?? 0);
    const successDenominator = completedRuns + failedRuns;

    return NextResponse.json({
      success: true,
      data: {
        workflow,
        executions: pageExecutions,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1),
        },
        stats: {
          totalRuns,
          successRate: successDenominator > 0 ? Math.round((completedRuns / successDenominator) * 100) : 0,
          avgDurationMs: statsResult?.avgDurationMs ? Math.round(Number(statsResult.avgDurationMs)) : null,
          lastRunAt: statsResult?.lastRunAt ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching workflow executions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflow executions' },
      { status: 500 }
    );
  }
}
