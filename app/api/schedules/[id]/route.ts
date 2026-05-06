import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflowSchedules } from '@/lib/db/schema';
import { getNextRunFromCron } from '@/lib/scheduling/cron';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const cronExpression = typeof body.cronExpression === 'string' ? body.cronExpression : undefined;
    const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined;

    const [updated] = await db
      .update(workflowSchedules)
      .set({
        cronExpression,
        timezone,
        isActive,
        nextRunAt: isActive === false ? null : cronExpression ? getNextRunFromCron(cronExpression) : undefined,
      })
      .where(and(eq(workflowSchedules.id, id), eq(workflowSchedules.organizationId, DEFAULT_ORGANIZATION_ID)))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating schedule:', error);
    return NextResponse.json({ success: false, error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(workflowSchedules)
      .where(and(eq(workflowSchedules.id, id), eq(workflowSchedules.organizationId, DEFAULT_ORGANIZATION_ID)))
      .returning({ id: workflowSchedules.id });

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete schedule' }, { status: 500 });
  }
}
