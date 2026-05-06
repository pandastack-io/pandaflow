import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents, executionCosts, executions } from '@/lib/db/schema';

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.000005, output: 0.000015 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'gpt-4': { input: 0.00003, output: 0.00006 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'claude-3-5-sonnet': { input: 0.000003, output: 0.000015 },
  'claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
  'gemini-pro': { input: 0.000000125, output: 0.000000375 },
  default: { input: 0.000002, output: 0.000006 },
};

const SANDFLARE_COST_PER_MS = 0.000000008;

export interface NodeCostRecord {
  executionId: string;
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  tokensInput?: number;
  tokensOutput?: number;
  sandflareMs?: number;
  model?: string;
  costUsd: number;
}

function parseCost(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

export function calculateLLMCost(model: string, tokensInput: number, tokensOutput: number): number {
  const rates = MODEL_COSTS[model] || MODEL_COSTS.default;
  return (tokensInput * rates.input) + (tokensOutput * rates.output);
}

export function calculateSandflareCost(durationMs: number): number {
  return durationMs * SANDFLARE_COST_PER_MS;
}

export async function recordNodeCost(record: NodeCostRecord): Promise<void> {
  try {
    await db.insert(executionCosts).values({
      executionId: record.executionId,
      nodeId: record.nodeId,
      nodeName: record.nodeName,
      nodeType: record.nodeType,
      tokensInput: record.tokensInput ?? 0,
      tokensOutput: record.tokensOutput ?? 0,
      sandflareMs: record.sandflareMs ?? 0,
      costUsd: record.costUsd.toFixed(8),
      model: record.model,
    });

    const [execution] = await db
      .select({ agentId: executions.agentId })
      .from(executions)
      .where(eq(executions.id, record.executionId))
      .limit(1);

    if (execution?.agentId) {
      void updateAgentTotalCost(execution.agentId);
    }
  } catch (error) {
    console.warn('[CostTracker] Failed to record cost:', error);
  }
}

export async function getExecutionTotalCost(executionId: string): Promise<number> {
  const [result] = await db
    .select({
      total: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
    })
    .from(executionCosts)
    .where(eq(executionCosts.executionId, executionId));

  return parseCost(result?.total);
}

export async function getCostForExecution(executionId: string): Promise<number> {
  return getExecutionTotalCost(executionId);
}

export async function updateAgentTotalCost(agentId: string): Promise<void> {
  try {
    const [result] = await db
      .select({
        total: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
      })
      .from(executionCosts)
      .innerJoin(executions, eq(executionCosts.executionId, executions.id))
      .where(eq(executions.agentId, agentId));

    await db
      .update(agents)
      .set({ totalCostUsd: parseCost(result?.total).toFixed(6) })
      .where(eq(agents.id, agentId));
  } catch (error) {
    console.warn('[CostTracker] Failed to update agent total cost:', error);
  }
}

export async function getAgentTotalCost(workflowId: string): Promise<number> {
  const [result] = await db
    .select({
      total: sql<string>`coalesce(sum(${executionCosts.costUsd}), 0)`,
    })
    .from(executionCosts)
    .innerJoin(executions, eq(executionCosts.executionId, executions.id))
    .where(eq(executions.workflowId, workflowId));

  return parseCost(result?.total);
}
