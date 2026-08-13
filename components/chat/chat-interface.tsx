'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, SendHorizonal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { defaultChatSettings, resolveChatSettings, type ChatMessage, type ChatSettings } from '@/lib/chat';

type ChatInterfaceProps = {
  chatId: string;
  workflowName: string;
  chatSettings: ChatSettings | null;
  embedded?: boolean;
};

type HistoryResponse = {
  messages: ChatMessage[];
  title?: string | null;
  createdAt?: string | null;
};

const STORAGE_PREFIX = 'ai-agent-builder-chat-session';

function createSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(content: string) {
  const codeBlocks: string[] = [];
  let html = escapeHtml(content).replace(/```([\s\S]*?)```/g, (_, block: string) => {
    const index = codeBlocks.push(`<pre class="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/90"><code>${block.trim()}</code></pre>`) - 1;
    return `__CODE_BLOCK_${index}__`;
  });

  html = html
    .replace(/^### (.*)$/gm, '<h3 class="mt-4 mb-2 text-base font-semibold">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="mt-4 mb-2 text-lg font-semibold">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="mt-4 mb-2 text-xl font-semibold">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 text-[0.9em]">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline underline-offset-4">$1</a>');

  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return '';
      }

      const lines = trimmed.split('\n');
      const unordered = lines.every((line) => /^[-*]\s+/.test(line));
      const ordered = lines.every((line) => /^\d+\.\s+/.test(line));

      if (unordered) {
        return `<ul class="my-3 ml-5 list-disc space-y-1">${lines.map((line) => `<li>${line.replace(/^[-*]\s+/, '')}</li>`).join('')}</ul>`;
      }

      if (ordered) {
        return `<ol class="my-3 ml-5 list-decimal space-y-1">${lines.map((line) => `<li>${line.replace(/^\d+\.\s+/, '')}</li>`).join('')}</ol>`;
      }

      if (/^<h[1-3]|^<pre/.test(trimmed)) {
        return trimmed;
      }

      return `<p>${lines.join('<br />')}</p>`;
    })
    .join('');

  codeBlocks.forEach((block, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return html;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((item) => (
        <span
          key={item}
          className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary/80"
          style={{ animationDelay: `${item * 120}ms` }}
        />
      ))}
    </div>
  );
}

export function ChatInterface({ chatId, workflowName, chatSettings, embedded = false }: ChatInterfaceProps) {
  const settings = useMemo(() => resolveChatSettings(chatSettings, workflowName), [chatSettings, workflowName]);
  const storageKey = `${STORAGE_PREFIX}:${chatId}`;
  const sessionIdRef = useRef('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSubmittedMessage, setLastSubmittedMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const welcomeVisible = messages.length === 0;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      const stored = localStorage.getItem(storageKey);
      const nextSessionId = stored || createSessionId();
      localStorage.setItem(storageKey, nextSessionId);
      sessionIdRef.current = nextSessionId;

      try {
        if (active) {
          setError(null);
        }

        const response = await fetch(`/api/chat/${chatId}?sessionId=${encodeURIComponent(nextSessionId)}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load chat history');
        }

        const history = data.data as HistoryResponse;
        if (active) {
          setMessages(Array.isArray(history.messages) ? history.messages : []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load chat history');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [chatId, retryCount, storageKey]);

  const handleSend = useCallback(async (rawMessage?: string) => {
    const message = (rawMessage ?? input).trim();
    const sessionId = sessionIdRef.current;
    if (!message || !sessionId || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    const assistantMessageId = crypto.randomUUID();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantPlaceholder]);
    setInput('');
    setSending(true);
    setError(null);
    setLastSubmittedMessage(message);

    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message,
          sessionId,
          history: nextMessages,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start chat stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const line = event.split('\n').find((entry) => entry.startsWith('data: '));
          if (!line) {
            continue;
          }

          const payload = JSON.parse(line.slice(6)) as { type: string; content?: string; error?: string };
          if (payload.type === 'token' && payload.content) {
            assistantContent += payload.content;
            setMessages((current) => current.map((item) => item.id === assistantMessageId ? { ...item, content: assistantContent } : item));
          }

          if (payload.type === 'error') {
            throw new Error(payload.error || 'Streaming failed');
          }
        }
      }
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
      setInput(message);
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [chatId, input, messages, sending]);

  const shellClasses = embedded
    ? 'h-screen bg-transparent p-0'
    : 'min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_45%,#020617_100%)] px-3 py-3 md:px-6 md:py-6';

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center', shellClasses)}>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-white/80 backdrop-blur-xl">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Preparing your assistant...
        </div>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className={cn('flex items-center justify-center', shellClasses)}>
        <div className="max-w-md rounded-3xl border border-white/10 bg-black/30 p-8 text-center shadow-2xl backdrop-blur-xl">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h2 className="text-xl font-semibold text-white">Unable to load chat</h2>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <Button className="mt-5" onClick={() => {
            setLoading(true);
            setRetryCount((count) => count + 1);
          }}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClasses}>
      <div className={cn(
        'mx-auto flex h-full max-w-5xl flex-col overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] text-white shadow-[0_30px_120px_rgba(2,6,23,0.75)] backdrop-blur-2xl',
        embedded ? 'rounded-none' : 'rounded-[28px]'
      )}>
        <div className="border-b border-white/10 bg-white/5 px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),#8b5cf6)] shadow-lg shadow-primary/20">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">{settings.title}</h1>
                  <Badge className="border-primary/20 bg-primary/15 text-primary hover:bg-primary/15">Live chat</Badge>
                </div>
                <p className="text-sm text-white/60">Beautiful, embedded AI support powered by your workflow.</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="border-white/10 bg-white/5 text-white/70">Powered by ⚡</Badge>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-white/70">PandaStack-ready</Badge>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {welcomeVisible ? (
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="max-w-[85%] rounded-[22px] rounded-bl-md border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-white/90 shadow-lg shadow-black/20">
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(settings.welcomeMessage) }} />
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isEmptyAssistant = message.role === 'assistant' && !message.content && sending;

              return (
                <div key={message.id || `${message.role}-${message.timestamp}`} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-7 shadow-lg', isUser
                    ? 'rounded-br-md bg-[linear-gradient(135deg,var(--color-primary),#2563eb)] text-white shadow-primary/20'
                    : 'rounded-bl-md border border-white/8 bg-white/[0.04] text-white/90 shadow-black/20')}>
                    {isEmptyAssistant ? <TypingIndicator /> : <div className="prose prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />}
                  </div>
                </div>
              );
            })}

            <div ref={scrollRef} />
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.03] px-4 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            {error && messages.length > 0 ? (
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <span>{error}</span>
                <Button variant="ghost" className="text-red-100 hover:bg-red-500/10 hover:text-white" onClick={() => void handleSend(lastSubmittedMessage || undefined)}>
                  Retry
                </Button>
              </div>
            ) : null}

            <div className="rounded-[24px] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-end gap-3">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={settings.placeholder || defaultChatSettings.placeholder}
                  rows={1}
                  className="max-h-40 min-h-[72px] resize-none border-0 bg-transparent px-2 py-3 text-base text-white placeholder:text-white/35 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="mb-1 h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),#2563eb)] shadow-lg shadow-primary/20"
                  onClick={() => void handleSend()}
                  disabled={sending || !input.trim()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-col justify-between gap-2 text-xs text-white/45 md:flex-row md:items-center">
              <span>Enter to send · Shift + Enter for a newline</span>
              <span>Powered by AI Agent Builder + PandaStack</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
