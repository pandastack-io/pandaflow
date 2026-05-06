import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { restartAgent, runHealthCheck } from '@/lib/agents/health-monitor';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';

export async function GET() {
  try {
    const result = await runHealthCheck();

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error running agent health check:', error);
    return NextResponse.json({ success: false, error: 'Failed to run agent health check' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetAgentId = typeof body?.agentId === 'string' ? body.agentId : undefined;

    const healthResult = await runHealthCheck();
    const crashedAgents = await db
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .where(targetAgentId ? eq(agents.id, targetAgentId) : eq(agents.status, 'crashed'));

    const healed: string[] = [];
    for (const agent of crashedAgents) {
      if (agent.status !== 'crashed') {
        continue;
      }

      await restartAgent(agent.id);
      healed.push(agent.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...healthResult,
        healed,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error auto-healing agents:', error);
    return NextResponse.json({ success: false, error: 'Failed to auto-heal agents' }, { status: 500 });
  }
}
