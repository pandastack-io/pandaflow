'use client';

import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type AgentDetails = {
  id: string;
  isAutoHealing?: boolean;
  events?: Array<{ type: string; createdAt: string }>;
};

interface HealthIndicatorProps {
  agentId: string;
  status: string;
  lastHeartbeatAt?: string | Date | null;
}

function getHeartbeatText(lastHeartbeatAt?: string | Date | null) {
  if (!lastHeartbeatAt) {
    return 'Last heartbeat: not received';
  }

  return `Last heartbeat: ${formatDistanceToNow(new Date(lastHeartbeatAt), { addSuffix: true })}`;
}

export function HealthIndicator({ agentId, status, lastHeartbeatAt }: HealthIndicatorProps) {
  const agentQuery = useQuery<AgentDetails>({
    queryKey: ['agent', agentId, 'indicator'],
    queryFn: async () => {
      const response = await fetch(`/api/agents/${agentId}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load agent health');
      }
      return payload.data as AgentDetails;
    },
    enabled: Boolean(agentId),
    staleTime: 15000,
    refetchInterval: 15000,
  });

  const recentCrash = agentQuery.data?.events?.find((event) => event.type === 'crashed');
  const crashedRecently =
    status === 'crashed' &&
    recentCrash &&
    Date.now() - new Date(recentCrash.createdAt).getTime() <= 30000;

  const tone = (() => {
    if (status === 'running') return 'bg-emerald-500';
    if (status === 'paused' || status === 'deployed' || status === 'deploying') return 'bg-amber-500';
    if (status === 'crashed' || status === 'error') return 'bg-red-500';
    return 'bg-slate-400';
  })();

  const label = (() => {
    if (status === 'running') return 'Healthy';
    if (status === 'paused') return 'Paused';
    if (status === 'deployed' || status === 'deploying') return 'Deployed';
    if ((status === 'crashed' || status === 'error') && (crashedRecently || agentQuery.data?.isAutoHealing)) return 'Auto-healing...';
    if (status === 'crashed' || status === 'error') return 'Crashed';
    return 'Stopped';
  })();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', tone, status === 'running' && 'animate-pulse')} />
        <Badge
          variant="outline"
          className={cn(
            status === 'running' && 'border-emerald-200 text-emerald-700',
            (status === 'paused' || status === 'deployed' || status === 'deploying') && 'border-amber-200 text-amber-700',
            (status === 'crashed' || status === 'error') && 'border-red-200 text-red-700',
            status === 'stopped' && 'border-slate-200 text-slate-600'
          )}
        >
          {label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{getHeartbeatText(lastHeartbeatAt)}</p>
    </div>
  );
}
