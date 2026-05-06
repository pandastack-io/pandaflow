'use client';

import { Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MessageBusPanel } from '@/components/agents/message-bus-panel';
import { MainLayout } from '@/components/layouts/main-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type TopicSummary = {
  topic: string;
  count: number;
};

export default function AgentBusPage() {
  const { toast } = useToast();
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [publishTopic, setPublishTopic] = useState('');
  const [payloadText, setPayloadText] = useState('{\n  "message": "hello"\n}');
  const [agentToken, setAgentToken] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadTopics = async () => {
      try {
        const response = await fetch('/api/agent-bus/topics', { cache: 'no-store' });
        const result = await response.json();
        if (!cancelled && result.success) {
          const nextTopics = result.data as TopicSummary[];
          setTopics(nextTopics);
          if (!selectedTopic && nextTopics[0]?.topic) {
            setSelectedTopic(nextTopics[0].topic);
          }
        }
      } catch {
        // Ignore polling failures.
      }
    };

    void loadTopics();
    const interval = setInterval(() => void loadTopics(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedTopic]);

  const visibleTopics = useMemo(() => {
    if (!publishTopic || topics.some((topic) => topic.topic === publishTopic)) {
      return topics;
    }
    return [{ topic: publishTopic, count: 0 }, ...topics];
  }, [publishTopic, topics]);

  const handlePublish = async () => {
    if (!publishTopic.trim()) {
      toast({ title: 'Topic required', description: 'Enter a topic before sending.', variant: 'destructive' });
      return;
    }

    if (!agentToken.trim()) {
      toast({ title: 'Agent token required', description: 'Publishing requires an agent identity token.', variant: 'destructive' });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      toast({ title: 'Invalid JSON payload', description: 'Fix the payload JSON and try again.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/agent-bus/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
        },
        body: JSON.stringify({ topic: publishTopic.trim(), payload }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to publish message');
      }

      setSelectedTopic(publishTopic.trim());
      toast({ title: 'Message published', description: `Message ${result.data.messageId} sent to ${publishTopic.trim()}.` });
    } catch (error) {
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <MainLayout>
      <div className="h-full p-6">
        <div className="grid h-full gap-6 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Topics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleTopics.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No topics yet.
                </div>
              ) : (
                visibleTopics.map((topic) => (
                  <button
                    key={topic.topic}
                    type="button"
                    onClick={() => setSelectedTopic(topic.topic)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${selectedTopic === topic.topic ? 'border-violet-500 bg-violet-50 text-violet-900' : 'hover:bg-muted'}`}
                  >
                    <span className="truncate">{topic.topic}</span>
                    <span className="ml-3 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {topic.count}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <MessageBusPanel
            selectedTopic={selectedTopic}
            onTopicChange={setSelectedTopic}
            topics={visibleTopics}
            showSelector={false}
            className="h-full"
            limit={40}
          />

          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Publish Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                <Input value={publishTopic} onChange={(event) => setPublishTopic(event.target.value)} placeholder="team.alerts" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Agent Token</label>
                <Input value={agentToken} onChange={(event) => setAgentToken(event.target.value)} placeholder="Paste X-Agent-Token value" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payload JSON</label>
                <Textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={14} className="font-mono text-xs" />
              </div>
              <Button onClick={handlePublish} disabled={sending} className="w-full gap-2">
                <Send className="h-4 w-4" />
                {sending ? 'Sending...' : 'Send'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
