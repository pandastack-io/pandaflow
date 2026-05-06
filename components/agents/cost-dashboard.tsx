'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Coins, Cpu, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type CostByDay = { date: string; cost: number; executions: number };
type TopNode = { nodeType: string; nodeName: string; totalCost: number; count: number };

type AgentCostData = {
  totalCostUsd: number;
  executionCount: number;
  avgCostPerExecution: number;
  breakdown: {
    llmCost: number;
    sandboxCost: number;
    totalTokensInput: number;
    totalTokensOutput: number;
  };
  byDay: CostByDay[];
  topExpensiveNodes: TopNode[];
};

function formatUsd(value: number) {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function buildSparklinePath(values: number[], width = 220, height = 52) {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function CostDashboard({ agentId, className }: { agentId: string; className?: string }) {
  const [data, setData] = useState<AgentCostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadCost = async () => {
      try {
        const response = await fetch(`/api/agents/${agentId}/cost`, { cache: 'no-store' });
        const payload = await response.json();
        if (!cancelled && payload.success) {
          setData(payload.data);
        }
      } catch (error) {
        console.error('Failed to load agent cost intelligence:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCost();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const trend = useMemo(() => {
    const days = data?.byDay ?? [];
    const firstHalf = days.slice(0, Math.ceil(days.length / 2)).reduce((sum, day) => sum + day.cost, 0);
    const secondHalf = days.slice(Math.ceil(days.length / 2)).reduce((sum, day) => sum + day.cost, 0);
    const delta = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : secondHalf > 0 ? 100 : 0;
    return {
      delta,
      direction: delta >= 0 ? 'up' : 'down',
    };
  }, [data?.byDay]);

  const sparklinePath = useMemo(
    () => buildSparklinePath((data?.byDay ?? []).map((day) => day.cost)),
    [data?.byDay]
  );

  const optimizationTip = data?.topExpensiveNodes[0]
    ? `Consider using gpt-4o-mini for ${data.topExpensiveNodes[0].nodeName} — could save ~60%.`
    : 'No hotspots yet — run your agent to start collecting cost intelligence.';

  const totalBreakdown = (data?.breakdown.llmCost ?? 0) + (data?.breakdown.sandboxCost ?? 0);
  const llmShare = totalBreakdown > 0 ? ((data?.breakdown.llmCost ?? 0) / totalBreakdown) * 100 : 0;
  const sandboxShare = totalBreakdown > 0 ? ((data?.breakdown.sandboxCost ?? 0) / totalBreakdown) * 100 : 0;

  return (
    <Card className={cn('border-zinc-800 bg-zinc-900/50 shadow-none', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base text-zinc-50">Cost Intelligence</CardTitle>
            <p className="mt-1 text-sm text-zinc-400">Runtime spend, token usage, and optimization signals.</p>
          </div>
          <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
            <Cpu className="mr-1 h-3.5 w-3.5" /> Agent OS
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-400">
            Cost intelligence is unavailable right now.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Total spend</div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-3xl font-semibold text-zinc-50">{formatUsd(data.totalCostUsd)}</div>
                  <div className={cn('mb-1 inline-flex items-center text-xs', trend.direction === 'up' ? 'text-amber-300' : 'text-emerald-300')}>
                    {trend.direction === 'up' ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : <ArrowDownRight className="mr-1 h-3.5 w-3.5" />}
                    {Math.abs(trend.delta).toFixed(0)}% vs prior days
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-zinc-500">Executions</div>
                    <div className="mt-1 text-zinc-100">{data.executionCount}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Avg / run</div>
                    <div className="mt-1 text-zinc-100">{formatUsd(data.avgCostPerExecution)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Coins className="h-4 w-4 text-emerald-300" /> Daily cost
                </div>
                <svg viewBox="0 0 220 52" className="h-[52px] w-full overflow-visible">
                  <path d={sparklinePath} fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
                  <span>{data.byDay[0]?.date ?? '—'}</span>
                  <span>{data.byDay[data.byDay.length - 1]?.date ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="mb-3 text-sm font-medium text-zinc-200">Breakdown</div>
                {[
                  { label: 'LLM', value: data.breakdown.llmCost, percent: llmShare, color: 'bg-blue-400' },
                  { label: 'Sandbox', value: data.breakdown.sandboxCost, percent: sandboxShare, color: 'bg-violet-400' },
                ].map((item) => (
                  <div key={item.label} className="mb-3 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>{item.label}</span>
                      <span>{formatUsd(item.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800">
                      <div className={cn('h-2 rounded-full', item.color)} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400">
                  <div>
                    <div>Input tokens</div>
                    <div className="mt-1 text-sm text-zinc-100">{data.breakdown.totalTokensInput.toLocaleString()}</div>
                  </div>
                  <div>
                    <div>Output tokens</div>
                    <div className="mt-1 text-sm text-zinc-100">{data.breakdown.totalTokensOutput.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="mb-3 text-sm font-medium text-zinc-200">Top expensive nodes</div>
                <div className="space-y-2">
                  {data.topExpensiveNodes.length === 0 ? (
                    <div className="text-sm text-zinc-400">No costly nodes recorded yet.</div>
                  ) : data.topExpensiveNodes.map((node) => (
                    <div key={`${node.nodeType}-${node.nodeName}`} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate text-zinc-100">{node.nodeName}</div>
                        <div className="text-xs text-zinc-500">{node.nodeType} • {node.count} runs</div>
                      </div>
                      <div className="text-right text-zinc-200">{formatUsd(node.totalCost)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {optimizationTip}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
