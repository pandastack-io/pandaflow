'use client';

import { formatDistanceToNow } from 'date-fns';
import { MessageSquareText, Radio } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type BusMessage = {
  id: string;
  fromAgentId?: string;
  fromAgentName?: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

type TopicSummary = {
  topic: string;
  count: number;
};

interface MessageBusPanelProps {
  selectedTopic?: string;
  onTopicChange?: (topic: string) => void;
  topics?: TopicSummary[];
  showSelector?: boolean;
  limit?: number;
  refreshIntervalMs?: number;
  className?: string;
}

function formatPayload(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload, null, 2);
  return serialized.length > 280 ? `${serialized.slice(0, 277)}...` : serialized;
}

function getInitials(message: BusMessage) {
  const source = message.fromAgentName || message.fromAgentId || 'SYS';
  return source.slice(0, 2).toUpperCase();
}

export function MessageBusPanel({
  selectedTopic,
  onTopicChange,
  topics,
  showSelector = true,
  limit = 30,
  refreshIntervalMs = 2000,
  className,
}: MessageBusPanelProps) {
  const [fetchedTopics, setFetchedTopics] = useState<TopicSummary[]>([]);
  const [internalTopic, setInternalTopic] = useState(selectedTopic ?? '');
  const [messages, setMessages] = useState<BusMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const availableTopics = topics ?? fetchedTopics;
  const activeTopic = selectedTopic ?? internalTopic;
  const effectiveTopic = activeTopic || availableTopics[0]?.topic || '';

  useEffect(() => {
    if (topics || !showSelector) return;

    let cancelled = false;

    const loadTopics = async () => {
      try {
        const response = await fetch('/api/agent-bus/topics', { cache: 'no-store' });
        const result = await response.json();
        if (!cancelled && result.success) {
          setFetchedTopics(result.data as TopicSummary[]);
        }
      } catch {
        // Ignore polling failures.
      }
    };

    void loadTopics();
    const interval = setInterval(() => void loadTopics(), refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [topics, showSelector, refreshIntervalMs]);

  useEffect(() => {
    if (!effectiveTopic) {
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/agent-bus/${encodeURIComponent(effectiveTopic)}/messages?limit=${limit}`, {
          cache: 'no-store',
        });
        const result = await response.json();
        if (!cancelled && result.success) {
          setMessages(result.data as BusMessage[]);
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadMessages();
    const interval = setInterval(() => void loadMessages(), refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [effectiveTopic, limit, refreshIntervalMs]);

  const selectorValue = useMemo(() => (effectiveTopic ? effectiveTopic : undefined), [effectiveTopic]);

  return (
    <Card className={className}>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-violet-500" />
            Message Feed
          </CardTitle>
          {effectiveTopic ? <span className="text-xs text-muted-foreground">{messages.length} shown</span> : null}
        </div>
        {showSelector ? (
          <Select
            value={selectorValue}
            onValueChange={(value) => {
              if (onTopicChange) onTopicChange(value);
              else setInternalTopic(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select topic" />
            </SelectTrigger>
            <SelectContent>
              {availableTopics.map((topic) => (
                <SelectItem key={topic.topic} value={topic.topic}>
                  {topic.topic} ({topic.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent>
        {!effectiveTopic ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Select a topic to inspect message traffic.
          </div>
        ) : messages.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No recent messages for <span className="font-medium text-foreground">{effectiveTopic}</span>.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                  {getInitials(message)}
                </div>
                <div className="min-w-0 flex-1 rounded-2xl bg-muted px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{message.fromAgentName || message.fromAgentId || 'System'}</span>
                    <span>•</span>
                    <span>{message.topic}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}</span>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
                    {formatPayload(message.payload)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && messages.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquareText className="h-3.5 w-3.5" />
            Loading messages...
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
