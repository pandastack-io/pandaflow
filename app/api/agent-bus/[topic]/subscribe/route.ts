import { NextRequest } from 'next/server';
import { BusMessage, subscribeToTopic } from '@/lib/agents/message-bus';

export async function GET(request: NextRequest, { params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const cleanup = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    if (keepalive) clearInterval(keepalive);
    unsubscribe?.();
    if (controller) {
      try {
        controller.close();
      } catch {
        // Stream already closed.
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      const sendMessage = (message: BusMessage) => {
        send(`data: ${JSON.stringify(message)}\n\n`);
      };

      send('retry: 3000\n\n');
      unsubscribe = await subscribeToTopic(topic, sendMessage);
      keepalive = setInterval(() => send(': keepalive\n\n'), 30000);
      request.signal.addEventListener('abort', () => cleanup(controller), { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
