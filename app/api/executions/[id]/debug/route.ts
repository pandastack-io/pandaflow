import { NextRequest, NextResponse } from 'next/server';
import { debugExecutionController } from '@/lib/execution/debug-controller';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body?.action;

    if (action !== 'continue' && action !== 'abort') {
      return NextResponse.json({ success: false, error: 'Invalid debug action' }, { status: 400 });
    }

    const handled = debugExecutionController.signal(id, action);
    if (!handled && !debugExecutionController.getPause(id)) {
      return NextResponse.json({ success: false, error: 'Execution is not currently paused' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { executionId: id, action } });
  } catch (error) {
    console.error('Error handling debug action:', error);
    return NextResponse.json({ success: false, error: 'Failed to handle debug action' }, { status: 500 });
  }
}
