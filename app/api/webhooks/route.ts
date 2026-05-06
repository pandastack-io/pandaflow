import { and, desc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookLogs, webhooks, workflows } from '@/lib/db/schema';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

async function withRecentLogs(items: Array<typeof webhooks.$inferSelect & { workflowName: string | null }>) {
  if (items.length === 0) {
    return [];
  }

  const logs = await db
    .select()
    .from(webhookLogs)
    .where(inArray(webhookLogs.webhookId, items.map((item) => item.id)))
    .orderBy(desc(webhookLogs.receivedAt));

  return items.map((item) => ({
    ...item,
    recentLogs: logs.filter((log) => log.webhookId === item.id).slice(0, 5),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const workflowId = request.nextUrl.searchParams.get('workflowId');
    const conditions = [eq(webhooks.organizationId, DEFAULT_ORGANIZATION_ID)];

    if (workflowId) {
      conditions.push(eq(webhooks.workflowId, workflowId));
    }

    const rows = await db
      .select({
        id: webhooks.id,
        workflowId: webhooks.workflowId,
        organizationId: webhooks.organizationId,
        urlPath: webhooks.urlPath,
        httpMethod: webhooks.httpMethod,
        authType: webhooks.authType,
        authConfig: webhooks.authConfig,
        requestSchema: webhooks.requestSchema,
        isActive: webhooks.isActive,
        createdBy: webhooks.createdBy,
        createdAt: webhooks.createdAt,
        updatedAt: webhooks.updatedAt,
        workflowName: workflows.name,
      })
      .from(webhooks)
      .leftJoin(workflows, eq(webhooks.workflowId, workflows.id))
      .where(and(...conditions))
      .orderBy(desc(webhooks.createdAt));

    return NextResponse.json({
      success: true,
      data: await withRecentLogs(rows),
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflowId = typeof body.workflowId === 'string' ? body.workflowId : '';

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'workflowId is required' }, { status: 400 });
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
      .from(webhooks)
      .where(and(eq(webhooks.workflowId, workflowId), eq(webhooks.organizationId, workflow.organizationId)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const [created] = await db
      .insert(webhooks)
      .values({
        workflowId,
        organizationId: workflow.organizationId,
        urlPath: `wh_${nanoid(16)}`,
        httpMethod: typeof body.httpMethod === 'string' ? body.httpMethod : 'POST',
        authType: typeof body.authType === 'string' ? body.authType : 'none',
        authConfig: body.authConfig ?? {},
        requestSchema: body.requestSchema ?? null,
        isActive: body.isActive !== false,
      })
      .returning();

    return NextResponse.json({ success: true, data: { ...created, workflowName: workflow.name, recentLogs: [] } });
  } catch (error) {
    console.error('Error creating webhook:', error);
    return NextResponse.json({ success: false, error: 'Failed to create webhook' }, { status: 500 });
  }
}
