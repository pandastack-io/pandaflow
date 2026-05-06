'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnyExecutionEvent } from '@/lib/execution/execution-emitter';
import type { NodeExecutionOutput } from '@/types/nodes';

type StreamEvent = AnyExecutionEvent | {
  type: 'connected';
  executionId: string;
  timestamp: number;
};

export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface NodeExecutionState {
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface ExecutionStreamState {
  executionStatus: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, NodeExecutionState>;
  nodeOutputs: Record<string, NodeExecutionOutput>;
  connected: boolean;
  debugPausedNodeId: string | null;
}

interface InternalExecutionStreamState extends ExecutionStreamState {
  activeExecutionId: string | null;
}

function createInitialState(executionId: string | null): InternalExecutionStreamState {
  return {
    activeExecutionId: executionId,
    executionStatus: 'idle',
    nodeStates: {},
    nodeOutputs: {},
    connected: false,
    debugPausedNodeId: null,
  };
}

export function useExecutionStream(executionId: string | null) {
  const [state, setState] = useState<InternalExecutionStreamState>(() => createInitialState(executionId));
  const esRef = useRef<EventSource | null>(null);

  const visibleState = useMemo(() => {
    if (state.activeExecutionId === executionId) {
      return state;
    }

    return createInitialState(executionId);
  }, [executionId, state]);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState(createInitialState(null));
  }, []);

  useEffect(() => {
    if (!executionId) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    esRef.current?.close();

    const es = new EventSource(`/api/executions/${executionId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);

        setState((prev) => {
          const base = prev.activeExecutionId === executionId ? prev : createInitialState(executionId);
          const next: InternalExecutionStreamState = {
            ...base,
            activeExecutionId: executionId,
            nodeStates: { ...base.nodeStates },
            nodeOutputs: { ...base.nodeOutputs },
          };

          switch (event.type) {
            case 'connected':
              next.connected = true;
              break;
            case 'execution:start':
              next.executionStatus = 'running';
              next.connected = true;
              next.debugPausedNodeId = null;
              break;
            case 'execution:complete':
              next.executionStatus = 'completed';
              next.debugPausedNodeId = null;
              break;
            case 'execution:error':
              next.executionStatus = 'failed';
              next.debugPausedNodeId = null;
              break;
            case 'execution:cancelled':
              next.executionStatus = 'cancelled';
              next.debugPausedNodeId = null;
              break;
            case 'node:start':
              if (event.nodeId) {
                next.debugPausedNodeId = base.debugPausedNodeId === event.nodeId ? null : base.debugPausedNodeId;
                next.nodeStates[event.nodeId] = {
                  status: 'running',
                  startedAt: event.timestamp,
                };
                next.nodeOutputs[event.nodeId] = {
                  ...base.nodeOutputs[event.nodeId],
                  input: event.input ?? base.nodeOutputs[event.nodeId]?.input,
                };
              }
              break;
            case 'node:complete':
              next.debugPausedNodeId = null;
              next.nodeStates[event.nodeId] = {
                status: 'completed',
                startedAt: base.nodeStates[event.nodeId]?.startedAt,
                completedAt: event.timestamp,
                durationMs: event.durationMs,
              };
              next.nodeOutputs[event.nodeId] = {
                ...base.nodeOutputs[event.nodeId],
                input: event.input ?? base.nodeOutputs[event.nodeId]?.input,
                output: event.output,
                error: undefined,
              };
              break;
            case 'node:error':
              next.debugPausedNodeId = null;
              next.nodeStates[event.nodeId] = {
                status: 'failed',
                startedAt: base.nodeStates[event.nodeId]?.startedAt,
                completedAt: event.timestamp,
                durationMs: event.durationMs,
                error: event.error,
              };
              next.nodeOutputs[event.nodeId] = {
                ...base.nodeOutputs[event.nodeId],
                input: event.input ?? base.nodeOutputs[event.nodeId]?.input,
                output: event.output ?? base.nodeOutputs[event.nodeId]?.output,
                error: event.error,
              };
              break;
            case 'debug:paused':
              next.debugPausedNodeId = event.nodeId;
              next.nodeOutputs[event.nodeId] = {
                ...base.nodeOutputs[event.nodeId],
                output: event.output ?? base.nodeOutputs[event.nodeId]?.output,
              };
              break;
          }

          return next;
        });

        if (event.type === 'execution:complete' || event.type === 'execution:error' || event.type === 'execution:cancelled') {
          window.setTimeout(() => es.close(), 1000);
        }
      } catch {
      }
    };

    es.onerror = () => {
      setState((prev) => {
        const base = prev.activeExecutionId === executionId ? prev : createInitialState(executionId);
        return { ...base, activeExecutionId: executionId, connected: false };
      });
    };

    return () => {
      es.close();
      if (esRef.current === es) {
        esRef.current = null;
      }
    };
  }, [executionId]);

  return {
    executionStatus: visibleState.executionStatus,
    nodeStates: visibleState.nodeStates,
    nodeOutputs: visibleState.nodeOutputs,
    connected: visibleState.connected,
    debugPausedNodeId: visibleState.debugPausedNodeId,
    reset,
  };
}
