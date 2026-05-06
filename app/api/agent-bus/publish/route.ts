import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { publishToTopic } from '@/lib/agents/message-bus';
import { db } from '@/lib/db';
import { agentMessages, agents } from '@/lib/db/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('X-Agent-Token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing X-Agent-Token header' }, { status: 401 });
    }

    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        organizationId: agents.organizationId,
      })
      .from(agents)
      .where(eq(agents.identityToken, token))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Invalid agent token' }, { status: 401 });
    }

    const body = await request.json();
    const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
    const payload = isRecord(body?.payload) ? body.payload : null;

    if (!topic) {
      return NextResponse.json({ success: false, error: 'Topic is required' }, { status: 400 });
    }

    if (!payload) {
      return NextResponse.json({ success: false, error: 'Payload must be an object' }, { status: 400 });
    }

    const messageId = await publishToTopic(topic, payload, agent.id, agent.organizationId, agent.name);

    await db.insert(agentMessages).values({
      id: messageId,
      organizationId: agent.organizationId,
      fromAgentId: agent.id,
      topic,
      payload,
      status: 'published',
    });

    return NextResponse.json({
      success: true,
      data: { messageId },
    });
  } catch (error) {
    console.error('Error publishing to agent bus:', error);
    return NextResponse.json({ success: false, error: 'Failed to publish message' }, { status: 500 });
  }
}
