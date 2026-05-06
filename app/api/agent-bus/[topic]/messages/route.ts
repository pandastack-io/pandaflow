import { NextRequest, NextResponse } from 'next/server';
import { getRecentMessages } from '@/lib/agents/message-bus';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

export async function GET(request: NextRequest, { params }: { params: Promise<{ topic: string }> }) {
  try {
    const { topic } = await params;
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
    const messages = await getRecentMessages(DEFAULT_ORGANIZATION_ID, topic, limit);

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching agent bus messages:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
  }
}
