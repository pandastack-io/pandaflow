import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteAgentMemory,
  deleteAllAgentMemories,
  listAgentMemories,
  writeAgentMemory,
} from '@/lib/agents/memory';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';

const writeMemorySchema = z.object({
  key: z.string().trim().min(1, 'Memory key is required'),
  value: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function getAgentMemoryContext(id: string) {
  const [agent] = await db
    .select({
      id: agents.id,
      workflowId: agents.workflowId,
      memoryNamespace: agents.memoryNamespace,
    })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);

  return agent;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await getAgentMemoryContext(id);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const memories = await listAgentMemories(agent.workflowId, agent.memoryNamespace);
    const key = request.nextUrl.searchParams.get('key');

    if (key) {
      const memory = memories.find((entry) => entry.key === key) ?? null;
      return NextResponse.json({
        success: true,
        data: {
          namespace: agent.memoryNamespace,
          memory,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        namespace: agent.memoryNamespace,
        memories,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch agent memory';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await getAgentMemoryContext(id);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = writeMemorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid memory payload' },
        { status: 400 }
      );
    }

    await writeAgentMemory(
      agent.workflowId,
      agent.memoryNamespace,
      parsed.data.key,
      parsed.data.value,
      parsed.data.metadata
    );

    return NextResponse.json({
      success: true,
      data: {
        namespace: agent.memoryNamespace,
        key: parsed.data.key,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write agent memory';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await getAgentMemoryContext(id);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const key = request.nextUrl.searchParams.get('key');

    if (key) {
      await deleteAgentMemory(agent.workflowId, agent.memoryNamespace, key);
    } else {
      await deleteAllAgentMemories(agent.workflowId, agent.memoryNamespace);
    }

    return NextResponse.json({
      success: true,
      data: {
        namespace: agent.memoryNamespace,
        deleted: key ?? '*',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete agent memory';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
