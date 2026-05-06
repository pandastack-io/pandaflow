import { desc, eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';
import { executions, workflows } from '@/lib/db/schema';
import { getCostForExecution } from '@/lib/execution/cost-tracker';

const createExecutionSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  triggerType: z.enum(['manual', 'schedule', 'webhook', 'event', 'chat']).default('manual'),
  input: z.unknown().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  envVars: z.record(z.string(), z.string()).optional(),
  debug: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  triggeredBy: z.string().optional(),
  agentId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const baseQuery = db
      .select({
        execution: executions,
        workflowName: workflows.name,
      })
      .from(executions)
      .leftJoin(workflows, eq(executions.workflowId, workflows.id))
      .orderBy(desc(executions.createdAt))
      .limit(limit);

    // When both are provided, show executions matching EITHER — covers old runs
    // (before agentId was tracked) and new ones properly linked by agentId.
    const whereClause = workflowId && agentId
      ? or(eq(executions.workflowId, workflowId), eq(executions.agentId, agentId))
      : workflowId
        ? eq(executions.workflowId, workflowId)
        : agentId
          ? eq(executions.agentId, agentId)
          : undefined;

    const results = whereClause ? await baseQuery.where(whereClause) : await baseQuery;
    const data = await Promise.all(
      results.map(async (row) => ({
        ...row.execution,
        costUsd: await getCostForExecution(row.execution.id),
        workflowName: row.workflowName,
      }))
    );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch executions';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createExecutionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid execution payload' },
        { status: 400 }
      );
    }

    const execution = await startWorkflowExecution(parsed.data);

    return NextResponse.json({
      success: true,
      data: {
        executionId: execution.id,
        status: 'running',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create execution';
    return NextResponse.json({ success: false, error: message }, { status: message === 'Workflow not found' ? 404 : 500 });
  }
}
