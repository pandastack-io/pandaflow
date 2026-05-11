import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAiGeneratedTags, generateWorkflow } from '@/lib/workflows/ai-generation';
import { createWorkflowRecord } from '@/lib/workflows/create-workflow';
import { requireOrgId } from '@/lib/auth/get-org-id';

const generateWorkflowSchema = z.object({
  description: z.string().trim().optional(),
  prompt: z.string().trim().optional(),
  workflowId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.description || value.prompt), {
  message: 'Description is required',
  path: ['description'],
});

export async function POST(request: NextRequest) {
  try {
    const orgId = await requireOrgId();
    const body = await request.json();
    const parsed = generateWorkflowSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid generate payload' },
        { status: 400 }
      );
    }

    const description = (parsed.data.description ?? parsed.data.prompt ?? '').trim();
    const generatedWorkflow = await generateWorkflow(description);

    if (parsed.data.workflowId) {
      return NextResponse.json({
        success: true,
        data: {
          ...generatedWorkflow,
          workflowId: parsed.data.workflowId,
        },
      });
    }

    const newWorkflow = await createWorkflowRecord({
      organizationId: orgId,
      name: generatedWorkflow.name,
      description: generatedWorkflow.description,
      definition: generatedWorkflow.definition,
      tags: buildAiGeneratedTags(description),
    });

    return NextResponse.json({
      success: true,
      data: {
        ...generatedWorkflow,
        workflowId: newWorkflow.id,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error generating workflow:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate workflow' },
      { status: 500 }
    );
  }
}
