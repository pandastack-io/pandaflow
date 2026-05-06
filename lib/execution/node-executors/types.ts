import { Node, Edge } from 'reactflow';
import { WorkflowNodeData } from '@/types/nodes';
import type { SandboxProvider } from '@/lib/sandflare/types';

export interface SharedSandbox {
  /** Sandflare sandbox ID, e.g. "sb-xk9m2p" */
  id: string;
  /** The provider instance that created this sandbox */
  provider: SandboxProvider;
  /** Primary language this sandbox was created for */
  language: string;
}

export interface ExecutorContext {
  variables: Record<string, any>;
  nodeOutputs: Record<string, any>;
  executionId?: string;
  organizationId?: string;
  workflowId?: string;
  agentId?: string;
  agentName?: string;
  agentNamespace?: string;
  userId?: string;
  secrets?: Record<string, string>;
  envVars?: Record<string, string>;
  /**
   * Shared sandbox for the current workflow execution.
   * All Sandflare code-execution nodes reuse this instead of
   * creating/destroying their own — preserving installed packages,
   * written files, and environment state across nodes.
   */
  sandbox?: SharedSandbox;
}

export interface ExecutorDeps {
  logNodeExecution: (
    nodeId: string,
    nodeName: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any,
    context?: ExecutorContext
  ) => Promise<void>;
}

export type NodeExecutorFn = (
  node: Node<WorkflowNodeData>,
  definition: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] },
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

export interface ExecutorResult {
  output: any;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}
