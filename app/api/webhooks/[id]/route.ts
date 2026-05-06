import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookLogs, webhooks, workflows } from '@/lib/db/schema';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';
import { requireOrgId } from '@/lib/auth/get-org-id';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [webhook] = await db
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
      .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, DEFAULT_ORGANIZATION_ID)))
      .limit(1);

    if (!webhook) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    const logs = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.webhookId, webhook.id))
      .orderBy(desc(webhookLogs.receivedAt))
      .limit(5);

    return NextResponse.json({ success: true, data: { ...webhook, recentLogs: logs } });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch webhook' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db
      .update(webhooks)
      .set({
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
        httpMethod: typeof body.httpMethod === 'string' ? body.httpMethod : undefined,
        authType: typeof body.authType === 'string' ? body.authType : undefined,
        authConfig: typeof body.authConfig !== 'undefined' ? body.authConfig : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, DEFAULT_ORGANIZATION_ID)))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating webhook:', error);
    return NextResponse.json({ success: false, error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, DEFAULT_ORGANIZATION_ID)))
      .returning({ id: webhooks.id });

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete webhook' }, { status: 500 });
  }
}
