import OpenAI from 'openai';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { chatSessions, workflows } from '@/lib/db/schema';
import {
  generateSessionTitle,
  isUuid,
  resolveChatSettings,
  sanitizeChatMessages,
  type ChatMessage,
} from '@/lib/chat';

const encoder = new TextEncoder();

function sse(payload: Record<string, unknown>) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

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

async function loadSession(workflowId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.workflowId, workflowId), eq(chatSessions.sessionId, sessionId)))
    .limit(1);

  return session ?? null;
}

async function streamAnthropicResponse(
  messages: ChatMessage[],
  settings: ReturnType<typeof resolveChatSettings>,
  onToken: (token: string) => void
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: settings.model || 'claude-3-5-sonnet-latest',
      system: settings.systemPrompt,
      temperature: settings.temperature,
      max_tokens: 1024,
      stream: true,
      messages: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: message.content })),
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error('Anthropic request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }

      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      const parsed = JSON.parse(payload) as { type?: string; delta?: { text?: string } };
      const token = parsed.type === 'content_block_delta' ? parsed.delta?.text || '' : '';
      if (token) {
        onToken(token);
      }
    }
  }
}

async function streamOpenAIResponse(
  messages: ChatMessage[],
  settings: ReturnType<typeof resolveChatSettings>,
  onToken: (token: string) => void
) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: settings.model || 'gpt-4o',
    temperature: settings.temperature,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) {
      onToken(token);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const workflow = await findWorkflow(id);
    if (!workflow) {
      return Response.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    const userSession = await auth();
    if (workflow.workflowType !== 'chat' || (!workflow.isPublic && !userSession?.user)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const session = await loadSession(workflow.id, sessionId);
    return Response.json({
      success: true,
      data: {
        messages: sanitizeChatMessages(session?.messages),
        title: session?.title ?? null,
        createdAt: session?.createdAt ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching chat session:', error);
    return Response.json({ success: false, error: 'Failed to fetch chat session' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const requestHistory = sanitizeChatMessages(body.history);

    if (!message || !sessionId) {
      return Response.json({ success: false, error: 'message and sessionId are required' }, { status: 400 });
    }

    const workflow = await findWorkflow(id);
    if (!workflow) {
      return Response.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    const userSession = await auth();
    if (workflow.workflowType !== 'chat' || (!workflow.isPublic && !userSession?.user)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const existingSession = await loadSession(workflow.id, sessionId);
    const settings = resolveChatSettings(workflow.chatSettings, workflow.name);
    const baseHistory = requestHistory.length > 0 ? requestHistory : sanitizeChatMessages(existingSession?.messages);
    const conversation = settings.systemPrompt
      ? [{ role: 'system', content: settings.systemPrompt } satisfies ChatMessage, ...baseHistory]
      : [...baseHistory];
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    const startedAt = new Date();
    const sessionTitle = existingSession?.title || generateSessionTitle(message) || settings.title;

    if (!existingSession) {
      await db.insert(chatSessions).values({
        workflowId: workflow.id,
        sessionId,
        title: sessionTitle,
        messages: [],
        metadata: {},
        lastMessageAt: startedAt,
        updatedAt: startedAt,
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let assistantText = '';
        const modelMessages = [...conversation, userMessage];
        const pushToken = (token: string) => {
          assistantText += token;
          controller.enqueue(sse({ type: 'token', content: token }));
        };

        try {
          if (settings.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
            await streamAnthropicResponse(modelMessages, settings, pushToken);
          } else if (process.env.OPENAI_API_KEY) {
            await streamOpenAIResponse(modelMessages, settings, pushToken);
          } else {
            pushToken('⚠️ No AI provider API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment to enable chat responses.');
          }

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: assistantText,
            timestamp: new Date().toISOString(),
          };
          const storedMessages = [...baseHistory, userMessage, assistantMessage];
          const completedAt = new Date();

          await db
            .update(chatSessions)
            .set({
              title: sessionTitle,
              messages: storedMessages,
              lastMessageAt: completedAt,
              updatedAt: completedAt,
            })
            .where(and(eq(chatSessions.workflowId, workflow.id), eq(chatSessions.sessionId, sessionId)));

          controller.enqueue(sse({
            type: 'done',
            sessionId,
            messageId: assistantMessage.id,
            totalTokens: Math.max(1, Math.round(assistantText.length / 4)),
          }));
        } catch (error) {
          console.error('Error streaming chat response:', error);
          controller.enqueue(sse({
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to generate response',
          }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Error starting chat stream:', error);
    return Response.json({ success: false, error: 'Failed to start chat stream' }, { status: 500 });
  }
}
