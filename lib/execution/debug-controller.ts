export type DebugAction = 'continue' | 'abort';

export interface DebugPausePayload {
  nodeId: string;
  nodeName: string;
  output?: unknown;
}

type PendingPause = {
  resolve: (action: DebugAction) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  payload: DebugPausePayload;
};

class DebugExecutionController {
  private pendingPauses = new Map<string, PendingPause>();
  private abortedExecutions = new Set<string>();

  async pause(executionId: string, payload: DebugPausePayload, durationMs = 2000): Promise<DebugAction> {
    if (this.abortedExecutions.has(executionId)) {
      return 'abort';
    }

    const current = this.pendingPauses.get(executionId);
    if (current) {
      clearTimeout(current.timeoutId);
      current.resolve('continue');
      this.pendingPauses.delete(executionId);
    }

    return new Promise<DebugAction>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingPauses.delete(executionId);
        resolve('continue');
      }, durationMs);

      this.pendingPauses.set(executionId, {
        resolve: (action) => {
          clearTimeout(timeoutId);
          this.pendingPauses.delete(executionId);
          resolve(action);
        },
        timeoutId,
        payload,
      });
    });
  }

  signal(executionId: string, action: DebugAction) {
    if (action === 'abort') {
      this.abortedExecutions.add(executionId);
    }

    const pending = this.pendingPauses.get(executionId);
    if (!pending) {
      return false;
    }

    pending.resolve(action);
    return true;
  }

  getPause(executionId: string) {
    return this.pendingPauses.get(executionId)?.payload ?? null;
  }

  clear(executionId: string) {
    const pending = this.pendingPauses.get(executionId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingPauses.delete(executionId);
    }
    this.abortedExecutions.delete(executionId);
  }
}

export const debugExecutionController = new DebugExecutionController();
