import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getRecentEpisodicMemories } from '@/lib/agents/memory';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [agent] = await db
      .select({
        workflowId: agents.workflowId,
        memoryNamespace: agents.memoryNamespace,
      })
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 50)) : 10;
    const memories = await getRecentEpisodicMemories(agent.workflowId, agent.memoryNamespace, limit);

    return NextResponse.json({
      success: true,
      data: {
        namespace: agent.memoryNamespace,
        memories,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch episodic memories';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
