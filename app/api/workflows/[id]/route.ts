import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generatePublicChatId, resolveChatSettings, type ChatSettings, type WorkflowType } from '@/lib/chat';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { sanitizeTags, workflowDefinitionSchema } from '@/lib/workflow-utils';

const workflowUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  definition: workflowDefinitionSchema.optional(),
  status: z.string().optional(),
  workflowType: z.enum(['automation', 'chat', 'agent']).optional(),
  chatSettings: z.unknown().nullable().optional(),
  isPublic: z.boolean().optional(),
  chatPublicId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const workflowPatchSchema = z.object({
  workflowType: z.enum(['automation', 'chat', 'agent']).optional(),
  chatSettings: z.unknown().nullable().optional(),
  isPublic: z.boolean().optional(),
  chatPublicId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/workflows/[id] - Get single workflow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflow' },
      { status: 500 }
    );
  }
}

// PUT /api/workflows/[id] - Update workflow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = workflowUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid workflow payload' },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      definition,
      status,
      workflowType,
      chatSettings,
      isPublic,
      chatPublicId,
      tags,
    } = parsed.data as {
      name?: string;
      description?: string;
      definition?: unknown;
      status?: string;
      workflowType?: WorkflowType;
      chatSettings?: ChatSettings | null;
      isPublic?: boolean;
      chatPublicId?: string | null;
      tags?: string[];
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (definition !== undefined) updateData.definition = definition;
    if (status !== undefined) updateData.status = status;
    if (workflowType !== undefined) updateData.workflowType = workflowType;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (chatPublicId !== undefined) updateData.chatPublicId = chatPublicId;
    if (chatSettings !== undefined) updateData.chatSettings = chatSettings;
    if (tags !== undefined) updateData.tags = sanitizeTags(tags);

    const [updatedWorkflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, id))
      .returning();

    if (!updatedWorkflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedWorkflow,
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update workflow' },
      { status: 500 }
    );
  }
}

// PATCH /api/workflows/[id] - Update workflow settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [existingWorkflow] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);

    if (!existingWorkflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = workflowPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid workflow payload' },
        { status: 400 }
      );
    }

    const payload = parsed.data as {
      workflowType?: WorkflowType;
      chatSettings?: ChatSettings | null;
      isPublic?: boolean;
      chatPublicId?: string | null;
      tags?: string[];
    };

    const nextWorkflowType = payload.workflowType ?? existingWorkflow.workflowType;
    const updateData: Record<string, unknown> = {
      workflowType: nextWorkflowType,
      updatedAt: new Date(),
    };

    if (nextWorkflowType === 'chat') {
      updateData.chatSettings = resolveChatSettings(payload.chatSettings ?? existingWorkflow.chatSettings, existingWorkflow.name);
      updateData.isPublic = payload.isPublic ?? existingWorkflow.isPublic;
      updateData.chatPublicId = payload.chatPublicId || existingWorkflow.chatPublicId || generatePublicChatId();
    } else {
      updateData.isPublic = payload.isPublic ?? existingWorkflow.isPublic;
      updateData.chatSettings = payload.chatSettings ?? existingWorkflow.chatSettings;
      updateData.chatPublicId = payload.chatPublicId ?? existingWorkflow.chatPublicId;
    }

    if (payload.tags !== undefined) {
      updateData.tags = sanitizeTags(payload.tags);
    }

    const [updatedWorkflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updatedWorkflow,
    });
  } catch (error) {
    console.error('Error updating workflow settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update workflow settings' },
      { status: 500 }
    );
  }
}

// DELETE /api/workflows/[id] - Delete workflow
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deletedWorkflow] = await db.delete(workflows).where(eq(workflows.id, id)).returning();

    if (!deletedWorkflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: deletedWorkflow,
    });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete workflow' },
      { status: 500 }
    );
  }
}
