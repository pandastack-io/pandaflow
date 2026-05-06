import { format } from 'date-fns';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { executions, workflows } from '@/lib/db/schema';

const STATUS_COLORS = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  cancelled: '#6b7280',
} as const;

const DASHBOARD_STATUSES = ['completed', 'failed', 'running', 'cancelled'] as const;

type DashboardStatus = (typeof DASHBOARD_STATUSES)[number];

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function getErrorMessage(error: unknown) {
  if (!error) return null;
  if (typeof error === 'string') return error;

  if (typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Execution failed';
    }
  }

  return String(error);
}

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const totalExecutionsExpr = count(executions.id);
    const completedCountExpr = sql<number>`count(case when ${executions.status} = 'completed' then 1 end)`;
    const failedCountExpr = sql<number>`count(case when ${executions.status} = 'failed' then 1 end)`;
    const runningCountExpr = sql<number>`count(case when ${executions.status} = 'running' then 1 end)`;

    const [
      [{ totalWorkflows }],
      [{ totalExecutions, completedCount, runningNow }],
      [{ executionsToday, failedToday }],
      [{ avgDurationMs }],
      recentExecutionRows,
      recentWorkflows,
      statusRows,
      topWorkflowRows,
      recentSevenDayExecutions,
    ] = await Promise.all([
      db.select({ totalWorkflows: count() }).from(workflows),
      db
        .select({
          totalExecutions: totalExecutionsExpr,
          completedCount: completedCountExpr,
          runningNow: runningCountExpr,
        })
        .from(executions),
      db
        .select({
          executionsToday: count(),
          failedToday: failedCountExpr,
        })
        .from(executions)
        .where(gte(executions.createdAt, todayStart)),
      db
        .select({
          avgDurationMs: sql<number>`coalesce(avg(${executions.durationMs}), 0)`,
        })
        .from(executions)
        .where(and(eq(executions.status, 'completed'), sql`${executions.durationMs} is not null`)),
      db
        .select({
          execution: executions,
          workflowName: workflows.name,
        })
        .from(executions)
        .leftJoin(workflows, eq(executions.workflowId, workflows.id))
        .orderBy(desc(executions.createdAt))
        .limit(8),
      db
        .select({
          id: workflows.id,
          name: workflows.name,
          status: workflows.status,
          createdAt: workflows.createdAt,
        })
        .from(workflows)
        .orderBy(desc(workflows.createdAt))
        .limit(6),
      db
        .select({
          status: executions.status,
          value: count(),
        })
        .from(executions)
        .groupBy(executions.status),
      db
        .select({
          id: workflows.id,
          name: workflows.name,
          executionCount: totalExecutionsExpr,
          completedCount: completedCountExpr,
        })
        .from(workflows)
        .leftJoin(executions, eq(executions.workflowId, workflows.id))
        .groupBy(workflows.id, workflows.name)
        .orderBy(desc(totalExecutionsExpr), desc(completedCountExpr))
        .limit(5),
      db
        .select({
          status: executions.status,
          startedAt: executions.startedAt,
          createdAt: executions.createdAt,
        })
        .from(executions)
        .where(gte(executions.createdAt, sevenDaysAgo))
        .orderBy(desc(executions.createdAt)),
    ]);

    const totalExecutionCount = Number(totalExecutions ?? 0);
    const completedExecutionCount = Number(completedCount ?? 0);
    const successRate = totalExecutionCount
      ? round((completedExecutionCount / totalExecutionCount) * 100)
      : 0;

    const statusMap = new Map<DashboardStatus, number>();
    DASHBOARD_STATUSES.forEach((status) => statusMap.set(status, 0));

    statusRows.forEach((row) => {
      if (row.status && DASHBOARD_STATUSES.includes(row.status as DashboardStatus)) {
        statusMap.set(row.status as DashboardStatus, Number(row.value ?? 0));
      }
    });

    const bucketMap = new Map<string, { completed: number; failed: number; total: number }>();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + index);
      const key = format(date, 'yyyy-MM-dd');
      bucketMap.set(key, { completed: 0, failed: 0, total: 0 });
      return date;
    });

    recentSevenDayExecutions.forEach((execution) => {
      const sourceDate = execution.startedAt ?? execution.createdAt;
      if (!sourceDate) {
        return;
      }

      const key = format(new Date(sourceDate), 'yyyy-MM-dd');
      const bucket = bucketMap.get(key);
      if (!bucket) {
        return;
      }

      bucket.total += 1;
      if (execution.status === 'completed') {
        bucket.completed += 1;
      }
      if (execution.status === 'failed') {
        bucket.failed += 1;
      }
    });

    const executionsByDay = days.map((date) => {
      const key = format(date, 'yyyy-MM-dd');
      const bucket = bucketMap.get(key) ?? { completed: 0, failed: 0, total: 0 };

      return {
        date: format(date, 'MMM dd'),
        dayLabel: format(date, 'EEE'),
        ...bucket,
      };
    });

    const statusBreakdown = DASHBOARD_STATUSES.map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: statusMap.get(status) ?? 0,
      color: STATUS_COLORS[status],
    }));

    const recentExecutions = recentExecutionRows.map(({ execution, workflowName }) => ({
      ...execution,
      workflowName: workflowName ?? 'Untitled workflow',
      error: getErrorMessage(execution.error),
    }));

    const topWorkflows = topWorkflowRows
      .map((workflow) => {
        const executionCount = Number(workflow.executionCount ?? 0);
        const workflowCompletedCount = Number(workflow.completedCount ?? 0);

        return {
          id: workflow.id,
          name: workflow.name,
          executionCount,
          successRate: executionCount ? round((workflowCompletedCount / executionCount) * 100) : 0,
        };
      })
      .filter((workflow) => workflow.executionCount > 0);

    return NextResponse.json({
      success: true,
      data: {
        totalWorkflows: Number(totalWorkflows ?? 0),
        totalExecutions: totalExecutionCount,
        executionsToday: Number(executionsToday ?? 0),
        successRate,
        avgDurationMs: Math.round(Number(avgDurationMs ?? 0)),
        failedToday: Number(failedToday ?? 0),
        runningNow: Number(runningNow ?? 0),
        executionsByDay,
        statusBreakdown,
        recentExecutions,
        recentWorkflows,
        topWorkflows,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard stats',
      },
      { status: 500 }
    );
  }
}
