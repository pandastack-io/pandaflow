import { and, desc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { chatSessions, workflows } from '@/lib/db/schema';
import { isUuid, sanitizeChatMessages } from '@/lib/chat';

async function findWorkflow(id: string) {
  const [byPublicId] = await db.select().from(workflows).where(eq(workflows.chatPublicId, id)).limit(1);
  if (byPublicId) {
    return byPublicId;
  }

  if (!isUuid(id)) {
    return null;
  }

  const [byId] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  return byId ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userSession = await auth();
    if (!userSession?.user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workflow = await findWorkflow(id);
    if (!workflow) {
      return Response.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    const sessions = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.workflowId, workflow.id))
      .orderBy(desc(chatSessions.lastMessageAt));

    return Response.json({
      success: true,
      data: sessions.map((session) => ({
        id: session.id,
        sessionId: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastMessageAt: session.lastMessageAt,
        messageCount: sanitizeChatMessages(session.messages).length,
      })),
    });
  } catch (error) {
    console.error('Error listing chat sessions:', error);
    return Response.json({ success: false, error: 'Failed to list chat sessions' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userSession = await auth();
    if (!userSession?.user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workflow = await findWorkflow(id);
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!workflow) {
      return Response.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    if (!sessionId) {
      return Response.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(chatSessions)
      .where(and(eq(chatSessions.workflowId, workflow.id), eq(chatSessions.sessionId, sessionId)))
      .returning();

    if (!deleted) {
      return Response.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    return Response.json({ success: true, data: { sessionId } });
  } catch (error) {
    console.error('Error clearing chat session:', error);
    return Response.json({ success: false, error: 'Failed to clear chat session' }, { status: 500 });
  }
}
