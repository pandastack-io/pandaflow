import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executions } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { getHitlRedisPattern, parseHitlApprovalState } from '@/lib/execution/hitl';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [execution] = await db.select({ status: executions.status }).from(executions).where(eq(executions.id, id)).limit(1);

    if (!execution) {
      return NextResponse.json({ success: false, error: 'Execution not found' }, { status: 404 });
    }

    if (execution.status !== 'running') {
      return NextResponse.json({ success: true, data: null });
    }

    const keys = await redis.keys(getHitlRedisPattern(id));
    for (const key of keys) {
      const pending = parseHitlApprovalState(await redis.get(key));
      if (pending?.status === 'pending') {
        return NextResponse.json({
          success: true,
          data: {
            executionId: id,
            nodeId: pending.nodeId,
            title: pending.title ?? 'Approval Required',
            message: pending.message ?? 'Please review and approve or reject this step.',
          },
        });
      }
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load pending approval' },
      { status: 500 }
    );
  }
}
