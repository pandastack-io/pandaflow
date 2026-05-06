'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type MemoryEntry = {
  key: string;
  value: unknown;
  updatedAt: string;
  summary?: string;
  metadata?: { type?: string } | null;
};

type MemoryPayload = {
  namespace: string;
  memories: MemoryEntry[];
};

interface MemoryViewerProps {
  agentId: string;
}

type MemoryFilter = 'all' | 'episodic' | 'custom';

const FILTERS: Array<{ value: MemoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'episodic', label: 'Episodic' },
  { value: 'custom', label: 'Custom' },
];

function isEpisodic(entry: MemoryEntry) {
  return entry.metadata?.type === 'episodic' || entry.key.startsWith('episodic:');
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function MemoryViewer({ agentId }: MemoryViewerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const memoryQuery = useQuery<MemoryPayload>({
    queryKey: ['agent', agentId, 'memory'],
    queryFn: async () => {
      const response = await fetch(`/api/agents/${agentId}/memory`, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load agent memory');
      }

      return payload.data as MemoryPayload;
    },
    enabled: Boolean(agentId),
    staleTime: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (key?: string) => {
      const query = key ? `?key=${encodeURIComponent(key)}` : '';
      const response = await fetch(`/api/agents/${agentId}/memory${query}`, { method: 'DELETE' });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to delete memory');
      }
    },
    onSuccess: async (_, key) => {
      if (key && expandedKey === key) {
        setExpandedKey(null);
      }
      await queryClient.invalidateQueries({ queryKey: ['agent', agentId, 'memory'] });
      toast({
        title: key ? 'Memory deleted' : 'Memories cleared',
        description: key ? `Removed ${key} from agent memory.` : 'All agent memories were cleared.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Memory action failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const memories = useMemo(() => {
    const items = memoryQuery.data?.memories ?? [];
    if (filter === 'all') return items;
    return items.filter((entry) => (filter === 'episodic' ? isEpisodic(entry) : !isEpisodic(entry)));
  }, [filter, memoryQuery.data?.memories]);

  const hasMemories = (memoryQuery.data?.memories?.length ?? 0) > 0;

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <div className="flex items-center gap-2 text-zinc-100">
          <Brain className="h-4 w-4 text-blue-300" />
          <h3 className="font-semibold">Agent Memory</h3>
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          <span className="text-zinc-500">namespace:</span>{' '}
          <span className="break-all font-mono text-xs text-zinc-200">{memoryQuery.data?.namespace ?? 'Loading...'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition',
              filter === item.value
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {memoryQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : memoryQuery.isError ? (
        <div className="rounded-xl border border-dashed border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
          {memoryQuery.error instanceof Error ? memoryQuery.error.message : 'Failed to load memories.'}
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-zinc-500">
          No memories yet. This agent hasn&apos;t stored any memory.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 bg-zinc-950/80 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <div>Key</div>
            <div>Updated</div>
            <div>Actions</div>
          </div>
          <div className="divide-y divide-zinc-800">
            {memories.map((entry) => {
              const expanded = expandedKey === entry.key;
              const episodic = isEpisodic(entry);

              return (
                <div
                  key={entry.key}
                  className={cn(
                    'px-4 py-3 transition',
                    episodic ? 'bg-blue-500/5' : 'bg-purple-500/5'
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_88px] items-center gap-3">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() => setExpandedKey(expanded ? null : entry.key)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-zinc-100">{entry.key}</div>
                        {entry.summary ? (
                          <div className="truncate text-xs text-zinc-400">{entry.summary}</div>
                        ) : null}
                      </div>
                    </button>
                    <div className="text-sm text-zinc-400">
                      {formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}
                    </div>
                    <div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-red-200"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(entry.key)}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === entry.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
                      {formatJson(entry.value)}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end border-t border-zinc-800 pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasMemories || deleteMutation.isPending}
          onClick={() => {
            if (confirm('Clear all memories for this agent?')) {
              deleteMutation.mutate(undefined);
            }
          }}
        >
          {deleteMutation.isPending && !deleteMutation.variables ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Clear All
        </Button>
      </div>
    </div>
  );
}
