import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents, executionCosts, executions } from '@/lib/db/schema';

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0000025, output: 0.00001 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'gpt-4': { input: 0.00003, output: 0.00006 },
  'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'o1': { input: 0.000015, output: 0.00006 },
  'o1-mini': { input: 0.000003, output: 0.000012 },
  'o3-mini': { input: 0.0000011, output: 0.0000044 },
  'claude-3-5-sonnet': { input: 0.000003, output: 0.000015 },
  'claude-3-5-haiku': { input: 0.0000008, output: 0.000004 },
  'claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
  'claude-3-opus': { input: 0.000015, output: 0.000075 },
  'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },
  'claude-3-5-haiku-20241022': { input: 0.0000008, output: 0.000004 },
  'claude-3-opus-20240229': { input: 0.000015, output: 0.000075 },
  'gemini-2.5-pro': { input: 0.0000035, output: 0.0000105 },
  'gemini-2.5-flash': { input: 0.00000035, output: 0.00000105 },
  'gemini-1.5-pro': { input: 0.00000125, output: 0.000005 },
  'gemini-1.5-flash': { input: 0.000000075, output: 0.0000003 },
  'gemini-pro': { input: 0.000000125, output: 0.000000375 },
  'llama-3.3-70b-versatile': { input: 0.00000059, output: 0.00000079 },
  'llama-3.1-8b-instant': { input: 0.00000005, output: 0.00000008 },
  'mixtral-8x7b-32768': { input: 0.00000024, output: 0.00000024 },
  'gemma2-9b-it': { input: 0.0000002, output: 0.0000002 },
  'deepseek-chat': { input: 0.00000027, output: 0.0000011 },
  'deepseek-reasoner': { input: 0.00000055, output: 0.00000219 },
  'llama-3.1-sonar-large-128k-online': { input: 0.000001, output: 0.000001 },
  'llama-3.1-sonar-small-128k-online': { input: 0.0000002, output: 0.0000002 },
  'llama-3.1-sonar-huge-128k-online': { input: 0.000005, output: 0.000005 },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.00000088, output: 0.00000088 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.0000006, output: 0.0000006 },
  'google/gemma-2-27b-it': { input: 0.0000008, output: 0.0000008 },
  'accounts/fireworks/models/llama-v3p1-70b-instruct': { input: 0.0000009, output: 0.0000009 },
  'accounts/fireworks/models/mixtral-8x7b-instruct': { input: 0.0000005, output: 0.0000005 },
  'openai/gpt-4o': { input: 0.0000025, output: 0.00001 },
  'anthropic/claude-3.5-sonnet': { input: 0.000003, output: 0.000015 },
  'google/gemini-pro-1.5': { input: 0.00000125, output: 0.000005 },
  'meta-llama/llama-3.1-405b-instruct': { input: 0.0000035, output: 0.0000035 },
  'mistral-large-latest': { input: 0.000004, output: 0.000012 },
  'mistral-small-latest': { input: 0.000001, output: 0.000003 },
  'open-mixtral-8x7b': { input: 0.0000007, output: 0.0000007 },
  'command-r-plus': { input: 0.000003, output: 0.000015 },
  'command-r': { input: 0.0000005, output: 0.0000015 },
  'grok-beta': { input: 0.000005, output: 0.000015 },
  'grok-2': { input: 0.000005, output: 0.000015 },
  'Meta-Llama-3.1-405B-Instruct': { input: 0.000005, output: 0.000005 },
  'Meta-Llama-3.3-70B-Instruct': { input: 0.0000012, output: 0.0000012 },
  default: { input: 0, output: 0 },
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

function getModelRates(model: string): { input: number; output: number } {
  if (MODEL_COSTS[model]) {
    return MODEL_COSTS[model];
  }

  const normalized = model.toLowerCase();
  const matched = Object.entries(MODEL_COSTS).find(([key]) => {
    if (key === 'default') return false;
    const lookup = key.toLowerCase();
    return normalized === lookup || normalized.startsWith(`${lookup}-`) || normalized.endsWith(`/${lookup}`) || normalized.includes(lookup);
  });

  return matched?.[1] || MODEL_COSTS.default;
}

export function calculateLLMCost(model: string, tokensInput: number, tokensOutput: number): number {
  const rates = getModelRates(model);
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
