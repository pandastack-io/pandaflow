import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executionCosts } from '@/lib/db/schema';
import { getCostForExecution } from '@/lib/execution/cost-tracker';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;

  try {
    const { id } = await params;
    const [totalCostUsd, nodes] = await Promise.all([
      getCostForExecution(id),
      db
        .select()
        .from(executionCosts)
        .where(eq(executionCosts.executionId, id))
        .orderBy(asc(executionCosts.createdAt)),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalCostUsd,
        nodes: nodes.map((node) => ({
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          tokensInput: node.tokensInput ?? 0,
          tokensOutput: node.tokensOutput ?? 0,
          sandflareMs: node.sandflareMs ?? 0,
          costUsd: toNumber(node.costUsd),
          model: node.model,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching execution cost:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch execution cost' },
      { status: 500 }
    );
  }
}
