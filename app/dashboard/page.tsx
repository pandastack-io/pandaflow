'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowRight,
  Bot,
  LayoutTemplate,
  PlayCircle,
  RefreshCcw,
  Settings2,
  TrendingUp,
  Workflow,
  Zap,
  KeyRound,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

type DashboardExecution = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  triggerType: string;
  startedAt?: string | null;
  createdAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
};

type DashboardWorkflow = {
  id: string;
  name: string;
  status: string;
  createdAt?: string | null;
};

type DashboardStats = {
  totalWorkflows: number;
  totalExecutions: number;
  executionsToday: number;
  successRate: number;
  avgDurationMs: number;
  failedToday: number;
  runningNow: number;
  executionsByDay: Array<{
    date: string;
    dayLabel: string;
    completed: number;
    failed: number;
    total: number;
  }>;
  statusBreakdown: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  recentExecutions: DashboardExecution[];
  recentWorkflows: DashboardWorkflow[];
  topWorkflows: Array<{
    id: string;
    name: string;
    executionCount: number;
    successRate: number;
  }>;
};

const quickActions = [
  {
    title: 'Create Workflow',
    description: 'Start a new automation graph.',
    href: '/workflows/new',
    icon: Workflow,
  },
  {
    title: 'Browse Templates',
    description: 'Launch from proven blueprints.',
    href: '/templates',
    icon: LayoutTemplate,
  },
  {
    title: 'View All Executions',
    description: 'Inspect recent runs and failures.',
    href: '/executions',
    icon: PlayCircle,
  },
  {
    title: 'Manage Secrets',
    description: 'Rotate and store credentials.',
    href: '/settings/secrets',
    icon: KeyRound,
  },
  {
    title: 'Settings',
    description: 'Tune organization defaults.',
    href: '/settings',
    icon: Settings2,
  },
] as const;

const tooltipStyles = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.75rem',
  color: 'var(--color-foreground)',
};

function formatDuration(durationMs?: number | null) {
  if (durationMs == null) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
  return `${(durationMs / 60000).toFixed(1)}m`;
}

function getStatusBadgeClass(status: ExecutionStatus) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    case 'failed':
      return 'border-red-500/20 bg-red-500/10 text-red-300';
    case 'running':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
    case 'pending':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-300';
    case 'cancelled':
    default:
      return 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300';
  }
}

function getSuccessTone(successRate: number) {
  if (successRate >= 90) return 'text-emerald-400';
  if (successRate >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Loading...</CardDescription>
      </CardHeader>
      <CardContent className="h-24 animate-pulse rounded-xl bg-muted/40" />
    </Card>
  );
}

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setRelativeTimeTick] = useState(0);

  const fetchDashboard = useCallback(async (mode: 'initial' | 'refresh' | 'poll' = 'initial') => {
    if (mode !== 'initial') {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/dashboard/stats', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load dashboard');
      }

      setStats(payload.data);
      setError(null);
      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void fetchDashboard();
    }, 0);

    const refreshTimer = window.setInterval(() => {
      void fetchDashboard('poll');
    }, 30000);

    const relativeTimer = window.setInterval(() => {
      setRelativeTimeTick((value) => value + 1);
    }, 30000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(relativeTimer);
    };
  }, [fetchDashboard]);

  const totalStatusCount = useMemo(
    () => stats?.statusBreakdown.reduce((sum, item) => sum + item.value, 0) ?? 0,
    [stats]
  );

  const lastUpdatedLabel = lastUpdated
    ? formatDistanceToNow(lastUpdated, { addSuffix: true })
    : 'Waiting for first sync';

  return (
    <MainLayout>
      <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-primary">PandaFlow dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">PandaFlow</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Last updated {lastUpdatedLabel}
                {stats ? ` • ${stats.totalExecutions.toLocaleString()} total executions tracked` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => void fetchDashboard('refresh')} disabled={refreshing}>
                <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error && !stats ? (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader>
                <CardTitle>Dashboard unavailable</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void fetchDashboard('refresh')}>Try again</Button>
              </CardContent>
            </Card>
          ) : null}

          {loading && !stats ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <LoadingCard title="Total Workflows" />
                <LoadingCard title="Executions Today" />
                <LoadingCard title="Success Rate" />
                <LoadingCard title="Active Now" />
              </div>
              <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                <LoadingCard title="Executions (last 7 days)" />
                <LoadingCard title="Status Breakdown" />
              </div>
              <LoadingCard title="Recent Executions" />
            </>
          ) : null}

          {stats ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Link href="/workflows" className="block">
                  <Card className="h-full border-border/60 bg-card/80 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <CardDescription>Total Workflows</CardDescription>
                        <CardTitle className="mt-2 text-3xl">{stats.totalWorkflows.toLocaleString()}</CardTitle>
                      </div>
                      <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">
                        <Workflow className="h-5 w-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">Manage definitions, versions, and rollout status.</CardContent>
                  </Card>
                </Link>

                <Link href="/executions" className="block">
                  <Card className="h-full border-border/60 bg-card/80 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <CardDescription>Executions Today</CardDescription>
                        <CardTitle className="mt-2 text-3xl">{stats.executionsToday.toLocaleString()}</CardTitle>
                      </div>
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 p-3">
                        <Zap className="h-5 w-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {stats.failedToday > 0 ? `${stats.failedToday} failed today` : 'No failures recorded today'}
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/executions" className="block">
                  <Card className="h-full border-border/60 bg-card/80 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <CardDescription>Success Rate</CardDescription>
                        <CardTitle className={`mt-2 text-3xl ${getSuccessTone(stats.successRate)}`}>
                          {stats.successRate.toFixed(1)}%
                        </CardTitle>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-400">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      Avg. execution duration {formatDuration(stats.avgDurationMs)}
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/executions" className="block">
                  <Card className="h-full border-border/60 bg-card/80 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <CardDescription>Active Now</CardDescription>
                        <CardTitle className="mt-2 flex items-center gap-3 text-3xl">
                          {stats.runningNow.toLocaleString()}
                          <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                        </CardTitle>
                      </div>
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-400">
                        <Activity className="h-5 w-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">Live runs currently in progress across your workflows.</CardContent>
                  </Card>
                </Link>
              </div>

              <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                <Card className="border-border/60 bg-card/80">
                  <CardHeader>
                    <CardTitle>Executions (last 7 days)</CardTitle>
                    <CardDescription>Completed vs failed runs over the past week.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={stats.executionsByDay} barGap={8}>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="dayLabel" stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={tooltipStyles}
                          cursor={{ fill: 'color-mix(in srgb, var(--color-muted) 55%, transparent)' }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                        />
                        <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/80">
                  <CardHeader>
                    <CardTitle>Status Breakdown</CardTitle>
                    <CardDescription>Distribution across terminal and live states.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {totalStatusCount > 0 ? (
                      <div className="relative">
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={stats.statusBreakdown}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={62}
                              outerRadius={92}
                              paddingAngle={3}
                            >
                              {stats.statusBreakdown.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyles} />
                            <Legend align="right" layout="vertical" verticalAlign="middle" />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-semibold">{totalStatusCount}</span>
                          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Total runs</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-center">
                        <Bot className="mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="font-medium">No execution data yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Run a workflow to populate the dashboard.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Recent Executions</CardTitle>
                      <CardDescription>Most recent workflow runs, refreshed every 30 seconds.</CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/executions">
                        View all
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {stats.recentExecutions.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/40 text-left text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3 font-medium">Workflow</th>
                              <th className="px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3 font-medium">Duration</th>
                              <th className="px-4 py-3 font-medium">Triggered</th>
                              <th className="px-4 py-3 font-medium">Time</th>
                              <th className="px-4 py-3 font-medium">Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.recentExecutions.map((execution) => {
                              const triggeredAt = safeDate(execution.startedAt) ?? safeDate(execution.createdAt);

                              return (
                                <tr
                                  key={execution.id}
                                  className="cursor-pointer border-t border-border/60 transition hover:bg-muted/25"
                                  onClick={() => router.push(`/executions/${execution.id}`)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      router.push(`/executions/${execution.id}`);
                                    }
                                  }}
                                  tabIndex={0}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-foreground">{execution.workflowName}</span>
                                      <span className="text-xs text-muted-foreground">{execution.id.slice(0, 8)}...</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge className={`capitalize ${getStatusBadgeClass(execution.status)}`} variant="outline">
                                      {execution.status === 'running' ? (
                                        <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-current animate-pulse" />
                                      ) : null}
                                      {execution.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-muted-foreground">{formatDuration(execution.durationMs)}</td>
                                  <td className="px-4 py-3 capitalize text-muted-foreground">{execution.triggerType}</td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {triggeredAt ? formatDistanceToNow(triggeredAt, { addSuffix: true }) : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="ghost"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <Link href={`/executions/${execution.id}`}>Open</Link>
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
                      <Bot className="mb-4 h-10 w-10 text-muted-foreground" />
                      <p className="text-lg font-medium">No executions yet</p>
                      <p className="mt-2 max-w-md text-sm text-muted-foreground">
                        Launch your first workflow to see runtime telemetry, durations, and status changes here.
                      </p>
                      <Button asChild className="mt-6">
                        <Link href="/workflows/new">Create Workflow</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <Card className="border-border/60 bg-card/80">
                  <CardHeader>
                    <CardTitle>Top Workflows</CardTitle>
                    <CardDescription>Highest-volume workflow definitions by execution count.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {stats.topWorkflows.length > 0 ? (
                      <div className="space-y-3">
                        {stats.topWorkflows.map((workflow, index) => (
                          <Link
                            key={workflow.id}
                            href={`/workflows/${workflow.id}`}
                            className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 transition hover:border-primary/40 hover:bg-muted/30"
                          >
                            <div>
                              <p className="text-sm text-muted-foreground">#{index + 1}</p>
                              <p className="font-medium">{workflow.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold">{workflow.executionCount}</p>
                              <p className={`text-sm ${getSuccessTone(workflow.successRate)}`}>
                                {workflow.successRate.toFixed(1)}% success
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                        Top workflows will appear once executions start flowing.
                      </div>
                    )}

                    <div>
                      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Recently created workflows</h3>
                      <div className="space-y-2">
                        {stats.recentWorkflows.length > 0 ? (
                          stats.recentWorkflows.map((workflow) => {
                            const createdAt = safeDate(workflow.createdAt);

                            return (
                              <Link
                                key={workflow.id}
                                href={`/workflows/${workflow.id}`}
                                className="flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-muted/30"
                              >
                                <div>
                                  <p className="font-medium">{workflow.name}</p>
                                  <p className="text-xs text-muted-foreground">{createdAt ? format(createdAt, 'MMM d, yyyy') : 'Recently added'}</p>
                                </div>
                                <Badge variant="outline" className="capitalize border-border/60 bg-muted/20 text-muted-foreground">
                                  {workflow.status}
                                </Badge>
                              </Link>
                            );
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground">No workflows created yet.</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/80">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Common tasks for operators, builders, and admins.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {quickActions.map((action) => (
                      <Button
                        key={action.href}
                        asChild
                        variant="outline"
                        className="h-auto justify-between rounded-xl border-border/60 px-4 py-4 text-left"
                      >
                        <Link href={action.href}>
                          <span className="flex items-center gap-3">
                            <span className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                              <action.icon className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-medium">{action.title}</span>
                              <span className="block text-xs text-muted-foreground">{action.description}</span>
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
}
