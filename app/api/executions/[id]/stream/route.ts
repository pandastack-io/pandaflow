import { NextRequest } from 'next/server';
import { executionEmitter, type AnyExecutionEvent } from '@/lib/execution/execution-emitter';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: executionId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: AnyExecutionEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Ignore enqueue failures during disconnects.
        }
      };

      try {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'connected', executionId, timestamp: Date.now() })}\n\n`
          )
        );
      } catch {
        // Ignore early disconnects.
      }

      const unsubscribe = executionEmitter.subscribe(executionId, send);
      const onAbort = () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      request.signal.addEventListener('abort', onAbort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
