import { NextRequest, NextResponse } from 'next/server';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const execution = await startWorkflowExecution({
      workflowId: id,
      triggerType: 'manual',
      input: body.input || {},
      variables: body.variables || {},
      envVars: body.envVars || {},
      debug: Boolean(body.debug),
      metadata: {
        source: 'editor',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        executionId: execution.id,
        status: 'running',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute workflow';
    return NextResponse.json({ success: false, error: message }, { status: message === 'Workflow not found' ? 404 : 500 });
  }
}
