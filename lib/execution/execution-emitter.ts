export type ExecutionEventType =
  | 'node:start'
  | 'node:complete'
  | 'node:error'
  | 'execution:start'
  | 'execution:complete'
  | 'execution:error'
  | 'execution:cancelled'
  | 'debug:paused';

export interface NodeExecutionEvent {
  type: 'node:start' | 'node:complete' | 'node:error';
  executionId: string;
  nodeId: string;
  nodeName: string;
  timestamp: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface ExecutionLifecycleEvent {
  type: 'execution:start' | 'execution:complete' | 'execution:error' | 'execution:cancelled';
  executionId: string;
  timestamp: number;
  error?: string;
}

export interface DebugPausedEvent {
  type: 'debug:paused';
  executionId: string;
  nodeId: string;
  nodeName: string;
  timestamp: number;
  output?: unknown;
}

export type AnyExecutionEvent = NodeExecutionEvent | ExecutionLifecycleEvent | DebugPausedEvent;

const BUFFER_TTL_MS = 5 * 60 * 1000;
const MAX_BUFFER_SIZE = 500;

class ExecutionEventEmitter {
  private listeners = new Map<string, Set<(event: AnyExecutionEvent) => void>>();
  private buffers = new Map<string, AnyExecutionEvent[]>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  subscribe(executionId: string, callback: (event: AnyExecutionEvent) => void): () => void {
    if (!this.listeners.has(executionId)) {
      this.listeners.set(executionId, new Set());
    }

    const buffered = this.buffers.get(executionId) ?? [];
    for (const event of buffered) {
      try {
        callback(event);
      } catch {
      }
    }

    this.listeners.get(executionId)!.add(callback);

    return () => {
      const set = this.listeners.get(executionId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(executionId);
        }
      }
    };
  }

  emit(executionId: string, event: AnyExecutionEvent) {
    if (!this.buffers.has(executionId)) {
      this.buffers.set(executionId, []);
    }
    const buf = this.buffers.get(executionId)!;
    if (buf.length < MAX_BUFFER_SIZE) {
      buf.push(event);
    }

    if (event.type === 'execution:complete' || event.type === 'execution:error' || event.type === 'execution:cancelled') {
      this.scheduleCleanup(executionId);
    }

    const set = this.listeners.get(executionId);
    if (set) {
      for (const callback of set) {
        try {
          callback(event);
        } catch {
        }
      }
    }
  }

  private scheduleCleanup(executionId: string) {
    const existing = this.cleanupTimers.get(executionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.buffers.delete(executionId);
      this.cleanupTimers.delete(executionId);
    }, BUFFER_TTL_MS);

    this.cleanupTimers.set(executionId, timer);
  }
}

// Use globalThis to ensure a single shared instance across all Next.js route
// module instances (hot-reload, route-chunk splits, etc.).
// Without this, the executor emits to instance A while the SSE stream
// subscribes to instance B — events are never delivered.
const g = globalThis as typeof globalThis & { __executionEmitter?: ExecutionEventEmitter };
if (!g.__executionEmitter) {
  g.__executionEmitter = new ExecutionEventEmitter();
}
export const executionEmitter = g.__executionEmitter;
