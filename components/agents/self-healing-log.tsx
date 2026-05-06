'use client';

import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

type AgentEvent = {
  id: string;
  type: string;
  data?: { reason?: string };
  createdAt: string;
};

type AgentPayload = {
  events: AgentEvent[];
};

interface SelfHealingLogProps {
  agentId: string;
}

const EVENT_STYLES: Record<string, string> = {
  heartbeat: 'bg-emerald-500',
  deployed: 'bg-sky-500',
  started: 'bg-sky-500',
  crashed: 'bg-red-500',
  healing: 'bg-amber-500',
  healed: 'bg-emerald-500',
};

export function SelfHealingLog({ agentId }: SelfHealingLogProps) {
  const agentQuery = useQuery<AgentPayload>({
    queryKey: ['agent', agentId, 'events'],
    queryFn: async () => {
      const response = await fetch(`/api/agents/${agentId}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load agent events');
      }
      return payload.data as AgentPayload;
    },
    enabled: Boolean(agentId),
    staleTime: 10000,
    refetchInterval: 10000,
  });

  const events = agentQuery.data?.events ?? [];

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="text-xs font-medium text-foreground">Self-healing log</div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No agent events yet.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 6).map((event) => (
            <div key={event.id} className="flex items-start gap-2 text-xs">
              <span className={cn('mt-1 inline-flex h-2 w-2 rounded-full', EVENT_STYLES[event.type] ?? 'bg-slate-400')} />
              <div className="min-w-0">
                <div className="font-medium capitalize text-foreground">{event.type.replace(/_/g, ' ')}</div>
                <div className="text-muted-foreground">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                  {event.data?.reason ? ` • ${event.data.reason}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
