import { NextRequest, NextResponse } from 'next/server';
import { checkAndRunScheduledAgents } from '@/lib/agents/scheduler';

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.SCHEDULER_SECRET;
  const providedSecret = request.headers.get('x-scheduler-secret');

  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: 'SCHEDULER_SECRET is not configured' }, { status: 500 });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndRunScheduledAgents();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run scheduler tick';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
