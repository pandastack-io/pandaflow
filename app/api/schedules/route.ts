import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflowSchedules, workflows } from '@/lib/db/schema';
import { getNextRunFromCron } from '@/lib/scheduling/cron';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

export async function GET(request: NextRequest) {
  try {
    const workflowId = request.nextUrl.searchParams.get('workflowId');
    const conditions = [eq(workflowSchedules.organizationId, DEFAULT_ORGANIZATION_ID)];

    if (workflowId) {
      conditions.push(eq(workflowSchedules.workflowId, workflowId));
    }

    const rows = await db
      .select({
        id: workflowSchedules.id,
        workflowId: workflowSchedules.workflowId,
        organizationId: workflowSchedules.organizationId,
        cronExpression: workflowSchedules.cronExpression,
        timezone: workflowSchedules.timezone,
        isActive: workflowSchedules.isActive,
        lastRunAt: workflowSchedules.lastRunAt,
        nextRunAt: workflowSchedules.nextRunAt,
        createdAt: workflowSchedules.createdAt,
        workflowName: workflows.name,
      })
      .from(workflowSchedules)
      .leftJoin(workflows, eq(workflowSchedules.workflowId, workflows.id))
      .where(and(...conditions))
      .orderBy(desc(workflowSchedules.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflowId = typeof body.workflowId === 'string' ? body.workflowId : '';
    const cronExpression = typeof body.cronExpression === 'string' ? body.cronExpression : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    if (!workflowId || !cronExpression) {
      return NextResponse.json({ success: false, error: 'workflowId and cronExpression are required' }, { status: 400 });
    }

    const [workflow] = await db
      .select({ id: workflows.id, organizationId: workflows.organizationId, name: workflows.name })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.organizationId, DEFAULT_ORGANIZATION_ID)))
      .limit(1);

    if (!workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    const [existing] = await db
      .select()
      .from(workflowSchedules)
      .where(and(eq(workflowSchedules.workflowId, workflowId), eq(workflowSchedules.organizationId, workflow.organizationId)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const [created] = await db
      .insert(workflowSchedules)
      .values({
        workflowId,
        organizationId: workflow.organizationId,
        cronExpression,
        timezone,
        isActive: body.isActive !== false,
        nextRunAt: body.isActive === false ? null : getNextRunFromCron(cronExpression),
      })
      .returning();

    return NextResponse.json({ success: true, data: { ...created, workflowName: workflow.name } });
  } catch (error) {
    console.error('Error creating schedule:', error);
    return NextResponse.json({ success: false, error: 'Failed to create schedule' }, { status: 500 });
  }
}
