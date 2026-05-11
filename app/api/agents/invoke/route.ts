/**
 * POST /api/agents/invoke
 *
 * Publicly callable endpoint to trigger an agent execution using its identity token.
 * Use this from external services, cron jobs, or other agents.
 *
 * Authorization: Bearer <identity_token>
 * Body: { input?: unknown, variables?: Record<string, unknown> }
 * Query: ?stream=true  — stream SSE execution events instead of returning immediately
 *
 * Returns: { executionId, agentId, status }
 */
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentEvents, agents } from '@/lib/db/schema';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';
import { executionEmitter } from '@/lib/execution/execution-emitter';

export const runtime = 'nodejs';

const invokeSchema = z.object({
  input: z.unknown().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

function extractBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing Authorization: Bearer <identity_token> header' },
        { status: 401 }
      );
    }

    // Look up agent by identity token
    const [agent] = await db
      .select({
        id: agents.id,
        workflowId: agents.workflowId,
        name: agents.name,
        status: agents.status,
        totalExecutions: agents.totalExecutions,
      })
      .from(agents)
      .where(eq(agents.identityToken, token))
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Invalid identity token' },
        { status: 401 }
      );
    }

    if (agent.status === 'paused') {
      return NextResponse.json(
        { success: false, error: 'Agent is paused and cannot accept invocations' },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = invokeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const { input, variables, envVars } = parsed.data;
    const stream = request.nextUrl.searchParams.get('stream') === 'true';

    // Trigger the workflow execution
    const execution = await startWorkflowExecution({
      workflowId: agent.workflowId,
      agentId: agent.id,
      triggerType: 'event',
      input: input ?? {},
      variables: variables ?? {},
      envVars: envVars ?? {},
      metadata: { source: 'identity-token-invoke', agentId: agent.id },
    });

    // Update agent counters + record event
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(agents)
        .set({
          status: 'running',
          lastRunAt: now,
          totalExecutions: (agent.totalExecutions ?? 0) + 1,
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id));

      await tx.insert(agentEvents).values({
        agentId: agent.id,
        type: 'invoked',
        data: { executionId: execution.id, source: 'api', triggerType: 'event', stream },
      });
    });

    // SSE streaming mode — pipe execution events back to caller
    if (stream) {
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        start(controller) {
          const send = (event: unknown) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch {
              // Client disconnected
            }
          };

          // Send initial connected event with execution info
          send({ type: 'connected', executionId: execution.id, agentId: agent.id, agentName: agent.name });

          const unsubscribe = executionEmitter.subscribe(execution.id, (event) => {
            send(event);
            // Close stream when execution finishes
            if (event.type === 'execution:complete' || event.type === 'execution:error') {
              unsubscribe();
              try { controller.close(); } catch { /* ignore */ }
            }
          });

          request.signal.addEventListener('abort', () => {
            unsubscribe();
            try { controller.close(); } catch { /* ignore */ }
          }, { once: true });
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        executionId: execution.id,
        agentId: agent.id,
        agentName: agent.name,
        status: 'running',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to invoke agent';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
