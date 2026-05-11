import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { createWorkflowRecord } from '@/lib/workflows/create-workflow';
import { workflowCreateSchema } from '@/lib/workflow-utils';
import { requireOrgId } from '@/lib/auth/get-org-id';

// GET /api/workflows - List all workflows
export async function GET() {
  try {
    const orgId = await requireOrgId();
    const allWorkflows = await db.select().from(workflows);

    return NextResponse.json({
      success: true,
      data: allWorkflows,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error fetching workflows:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}

// POST /api/workflows - Create new workflow
export async function POST(request: NextRequest) {
  try {
    const orgId = await requireOrgId();
    const body = await request.json();
    const parsed = workflowCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid workflow payload' },
        { status: 400 }
      );
    }

    const newWorkflow = await createWorkflowRecord({ organizationId: orgId, ...parsed.data });

    return NextResponse.json({
      success: true,
      data: newWorkflow,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error creating workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create workflow' },
      { status: 500 }
    );
  }
}
