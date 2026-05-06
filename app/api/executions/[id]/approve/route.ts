import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getHitlRedisKey, parseHitlApprovalState } from '@/lib/execution/hitl';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const nodeId = String(body.nodeId ?? '').trim();
    const decision = body.decision === 'approved' || body.decision === 'rejected' ? body.decision : null;
    const comment = typeof body.comment === 'string' ? body.comment : undefined;

    if (!nodeId || !decision) {
      return NextResponse.json({ success: false, error: 'nodeId and a valid decision are required' }, { status: 400 });
    }

    const key = getHitlRedisKey(id, nodeId);
    const existing = parseHitlApprovalState(await redis.get(key));

    if (!existing || existing.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'No pending approval found for this node' }, { status: 404 });
    }

    const ttl = await redis.ttl(key);
    const nextValue = JSON.stringify({
      ...existing,
      status: decision,
      comment,
      decidedAt: new Date().toISOString(),
    });

    if (ttl > 0) {
      await redis.set(key, nextValue, 'EX', ttl);
    } else {
      await redis.set(key, nextValue, 'EX', 3600);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to store approval decision' },
      { status: 500 }
    );
  }
}
