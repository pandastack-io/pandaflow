import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateAgentToken, generateMemoryNamespace } from '@/lib/agents/identity';
import { db } from '@/lib/db';
import { agentEvents, agents, workflows } from '@/lib/db/schema';
import { requireOrgId } from '@/lib/auth/get-org-id';


const createAgentSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  name: z.string().trim().min(1, 'Agent name is required'),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const orgId = await requireOrgId();
  try {
    const workflowId = request.nextUrl.searchParams.get('workflowId');

    const rows = await db
      .select({
        agent: agents,
        workflowName: workflows.name,
      })
      .from(agents)
      .leftJoin(workflows, eq(agents.workflowId, workflows.id))
      .where(
        workflowId
          ? and(eq(agents.organizationId, orgId), eq(agents.workflowId, workflowId))
          : eq(agents.organizationId, orgId)
      )
      .orderBy(desc(agents.updatedAt), desc(agents.createdAt));

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        ...row.agent,
        workflowName: row.workflowName,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch agents';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = await requireOrgId();
  try {
    const body = await request.json();
    const parsed = createAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid agent payload' },
        { status: 400 }
      );
    }

    const { workflowId, name, description, config } = parsed.data;

    const [workflow] = await db
      .select({
        id: workflows.id,
        name: workflows.name,
      })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.organizationId, orgId)))
      .limit(1);

    if (!workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    const agent = await db.transaction(async (tx) => {
      const [createdAgent] = await tx
        .insert(agents)
        .values({
          organizationId: orgId,
          workflowId,
          name,
          description: description?.trim() || null,
          status: 'deployed',
          identityToken: generateAgentToken(),
          memoryNamespace: generateMemoryNamespace(name),
          config: config ?? {},
        })
        .returning();

      await tx.insert(agentEvents).values({
        agentId: createdAgent.id,
        type: 'deployed',
        data: {
          workflowId,
          status: 'deployed',
        },
      });

      return createdAgent;
    });

    return NextResponse.json({
      success: true,
      data: {
        ...agent,
        workflowName: workflow.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
