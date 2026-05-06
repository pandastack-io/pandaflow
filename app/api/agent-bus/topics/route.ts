import { NextResponse } from 'next/server';
import { listMessageTopics } from '@/lib/agents/message-bus';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';
import { requireOrgId } from '@/lib/auth/get-org-id';

export async function GET() {
  const orgId = await requireOrgId();
  try {
    const topics = await listMessageTopics(DEFAULT_ORGANIZATION_ID);
    return NextResponse.json({ success: true, data: topics });
  } catch (error) {
    console.error('Error fetching agent bus topics:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch topics' }, { status: 500 });
  }
}
