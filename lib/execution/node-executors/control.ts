/* eslint-disable @typescript-eslint/no-explicit-any */
import { Edge, Node } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { redis } from '@/lib/redis';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  fetchWithTimeout,
  interpolate,
  interpolateValue,
  interpolateDeep,
  withRetry,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type GenericConfig = Record<string, any>;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getResolvedInput(config: GenericConfig, context: ExecutorContext): any {
  const value = resolveNodeInput(context, config.inputVariable);
  if (value !== undefined) return value;
  return config.input;
}

function normalizeInput(value: any): any {
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function normalizeArrayInput(value: any): any[] {
  const normalized = normalizeInput(value);
  if (normalized === undefined || normalized === null) return [];
  return Array.isArray(normalized) ? normalized : [normalized];
}

function createScope(context: ExecutorContext, input: any, extra: Record<string, any> = {}): Record<string, any> {
  return {
    input,
    data: input,
    variables: context.variables,
    nodes: context.nodeOutputs,
    context,
    ...extra,
  };
}

function compileExpression(expression: string, scope: Record<string, any>): any {
  const trimmed = expression.trim();
  const keys = Object.keys(scope);
  const values = Object.values(scope);

  try {
    return new Function(...keys, `'use strict'; return (${trimmed});`)(...values);
  } catch {
    const body = trimmed.includes('return') ? trimmed : `return (${trimmed});`;
    return new Function(...keys, `'use strict'; ${body}`)(...values);
  }
}

function executeExpression(expression: string, scope: Record<string, any>, args: any[] = []): any {
  const compiled = compileExpression(expression, scope);
  if (typeof compiled === 'function') return compiled(...args);
  return compiled;
}

async function safeLog(
  deps: ExecutorDeps,
  node: WorkflowNode,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(node.id, node.data.config?.label || node.id, level, message, data, context);
  } catch {
    // Logging should never block execution.
  }
}

function createExecutor(name: string, handler: NodeExecutorFn): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} executor`, context);

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await safeLog(deps, node, 'error', error instanceof Error ? error.message : `${name} executor failed`, context, {
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}

function getDownstreamEdges(node: WorkflowNode, definition: WorkflowDefinition): Edge[] {
  return definition.edges.filter((edge) => edge.source === node.id);
}

function getHumanApprovalKey(executionId: string, nodeId: string) {
  return `hitl:${executionId}:${nodeId}`;
}

function parseApprovalState(raw: string | null): { status: string; title?: string; message?: string; comment?: string } | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { status: string; title?: string; message?: string; comment?: string };
  } catch {
    return { status: raw };
  }
}

function normalizeBranchKey(value: any, index: number): string {
  const normalized = String(value ?? `case_${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return normalized || `case_${index + 1}`;
}

function getInternalApiBaseUrl() {
  const configuredBaseUrl =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return configuredBaseUrl ?? 'http://127.0.0.1:3000';
}

async function pollSubWorkflowExecution(executionId: string) {
  const startedAt = Date.now();
  const timeoutMs = 30_000;
  const statusUrl = `${getInternalApiBaseUrl()}/api/executions/${executionId}`;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetchWithTimeout(statusUrl, { timeout: 10_000 });
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to poll sub-workflow execution');
    }

    const execution = payload.data as {
      status: string;
      output?: unknown;
      error?: string | null;
    };

    if (execution.status === 'completed') {
      return execution;
    }

    if (execution.status === 'failed') {
      throw new Error(execution.error || 'Sub-workflow execution failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Sub-workflow execution timed out after 30 seconds');
}

const conditionExecutor = createExecutor('Control Condition', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const condition = interpolate(String(config.condition ?? config.expression ?? 'Boolean(input)'), context);
  const matched = Boolean(executeExpression(condition, createScope(context, input), [input]));

  return {
    output: input,
    metadata: {
      matched,
      branch: matched ? 'true' : 'false',
      condition,
    },
  };
});

const switchExecutor = createExecutor('Control Switch', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const cases = Array.isArray(config.cases) ? config.cases : [];
  const switchValue = config.expression
    ? executeExpression(interpolate(String(config.expression), context), createScope(context, input), [input])
    : input;

  let matchedIndex = -1;
  let matchedCase: any = null;

  for (const [index, entry] of cases.entries()) {
    if (entry.condition) {
      const matched = Boolean(
        executeExpression(
          interpolate(String(entry.condition), context),
          createScope(context, input, { value: switchValue }),
          [switchValue, input]
        )
      );
      if (matched) {
        matchedIndex = index;
        matchedCase = entry;
        break;
      }
      continue;
    }

    const expected = typeof entry.value === 'string' ? safeJsonParse(interpolate(entry.value, context)) : entry.value;
    if (switchValue === expected) {
      matchedIndex = index;
      matchedCase = entry;
      break;
    }
  }

  const branch = matchedIndex === -1
    ? 'default'
    : normalizeBranchKey(matchedCase?.branchKey ?? matchedCase?.label ?? `case_${matchedIndex + 1}`, matchedIndex);

  return {
    output: input,
    metadata: {
      matchedCase,
      matchedIndex,
      defaultBranch: matchedIndex === -1,
      value: switchValue,
      branch,
    },
  };
});

const loopExecutor = createExecutor('Control Loop', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const loopType = String(config.loopType ?? 'forEach');

  if (loopType === 'while') {
    return whileExecutor(node, definition, context, deps);
  }

  const resolvedInput = normalizeInput(getResolvedInput(config, context));
  const itemVariable = String(config.itemVariable ?? 'item');
  const configuredIterations = Math.max(0, Number(config.iterations ?? config.count ?? config.maxIterations ?? 0));
  const items = Array.isArray(resolvedInput)
    ? resolvedInput
    : configuredIterations > 0
      ? Array.from({ length: configuredIterations }, (_, index) => index)
      : resolvedInput === undefined || resolvedInput === null
        ? []
        : [resolvedInput];

  return {
    output: items,
    metadata: {
      loopType: 'for',
      iterations: items.length,
      itemVariable,
      items: items.map((item, index) => ({ index, item })),
      controlFlow: {
        type: 'loop',
        itemVariable,
        parallel: Boolean(config.parallel),
        iterations: items.map((item, index) => ({ index, input: item })),
      },
    },
  };
});

const foreachExecutor = createExecutor('Control ForEach', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context));
  const itemVariable = String(config.itemVariable ?? 'item');
  const parallel = Boolean(config.parallel);
  const batchSize = Math.max(1, Number(config.batchSize ?? (input.length || 1)));
  const expression = config.expression ? interpolate(String(config.expression), context) : undefined;
  const results: any[] = [];

  for (let offset = 0; offset < input.length; offset += batchSize) {
    const batch = input.slice(offset, offset + batchSize);
    const executeItem = async (item: any, batchIndex: number) => {
      const index = offset + batchIndex;
      if (!expression) return { index, [itemVariable]: item };
      return executeExpression(
        expression,
        createScope(context, input, { item, index, array: input, [itemVariable]: item }),
        [item, index, input]
      );
    };

    const batchResults = parallel
      ? await Promise.all(batch.map((item, batchIndex) => executeItem(item, batchIndex)))
      : await batch.reduce<Promise<any[]>>(async (promise, item, batchIndex) => {
          const collected = await promise;
          collected.push(await executeItem(item, batchIndex));
          return collected;
        }, Promise.resolve([]));

    results.push(...batchResults);
  }

  return {
    output: expression ? results : input,
    metadata: {
      items: input.length,
      iterations: input.length,
      itemVariable,
      parallel,
      batchSize,
      batches: Math.ceil(input.length / batchSize),
      controlFlow: {
        type: 'loop',
        itemVariable,
        parallel,
        iterations: input.map((item, index) => ({
          index,
          input: expression ? results[index] : item,
          variables: { sourceItem: item },
        })),
      },
    },
  };
});

const whileExecutor = createExecutor('Control While', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const condition = interpolate(String(config.condition ?? 'false'), context);
  const stepExpression = config.stepExpression ? interpolate(String(config.stepExpression), context) : undefined;
  const maxIterations = Math.max(1, Number(config.maxIterations ?? 100));
  const history: any[] = [];
  let current = input;
  let iterations = 0;

  while (Boolean(executeExpression(condition, createScope(context, current, { current, iteration: iterations }), [current, iterations]))) {
    history.push(current);
    iterations += 1;

    if (iterations > maxIterations) {
      throw new Error(`While loop exceeded maxIterations (${maxIterations}).`);
    }

    if (!stepExpression) continue;
    current = executeExpression(
      stepExpression,
      createScope(context, current, { current, iteration: iterations }),
      [current, iterations]
    );
  }

  return {
    output: current,
    metadata: {
      iterations,
      maxIterations,
      history,
      controlFlow: {
        type: 'loop',
        itemVariable: String(config.itemVariable ?? 'current'),
        parallel: false,
        iterations: history.map((item, index) => ({ index, input: item })),
      },
    },
  };
});

const parallelExecutor = createExecutor('Control Parallel', async (node, definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const downstreamEdges = getDownstreamEdges(node, definition);

  return {
    parallel: true,
    branches: downstreamEdges.length,
    output: input,
    metadata: {
      targets: downstreamEdges.map((edge) => edge.target),
      controlFlow: {
        type: 'parallel',
      },
    },
  };
});

const sequenceExecutor = createExecutor('Control Sequence', async (node, definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const downstreamEdges = getDownstreamEdges(node, definition);

  return {
    output: input,
    metadata: {
      parallel: false,
      sequence: downstreamEdges.map((edge) => edge.target),
    },
  };
});

const errorExecutor = createExecutor('Control Error', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const tryExpression = config.tryExpression
    ? interpolate(String(config.tryExpression), context)
    : config.expression
      ? interpolate(String(config.expression), context)
      : undefined;

  try {
    const output = tryExpression
      ? await Promise.resolve(executeExpression(tryExpression, createScope(context, input), [input]))
      : input;

    return {
      output,
      metadata: {
        handled: false,
      },
    };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const errorVariable = String(config.errorVariable ?? 'lastError');
    const errorPayload = {
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
    };

    context.variables[errorVariable] = errorPayload;

    if (config.rethrow) throw normalized;

    return {
      output: config.fallback !== undefined ? config.fallback : { error: normalized.message, input },
      metadata: {
        handled: true,
        error: errorPayload,
      },
    };
  }
});

const retryExecutor = createExecutor('Control Retry', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const expression = config.expression ? interpolate(String(config.expression), context) : undefined;
  let attempts = 0;

  const output = await withRetry(
    async () => {
      attempts += 1;
      if (!expression) return input;
      return Promise.resolve(
        executeExpression(expression, createScope(context, input, { attempt: attempts }), [input, attempts])
      );
    },
    {
      maxAttempts: Math.max(1, Number(config.maxAttempts ?? config.attempts ?? 3)),
      initialDelayMs: Math.max(0, Number(config.initialDelayMs ?? config.delayMs ?? 500)),
      maxDelayMs: Math.max(0, Number(config.maxDelayMs ?? config.maxBackoffMs ?? 10000)),
      retryOn: (error) => {
        if (!config.retryOnMessage) return true;
        return error.message.includes(String(config.retryOnMessage));
      },
    }
  );

  return {
    output,
    metadata: {
      attempts,
      retried: attempts > 1,
    },
  };
});

const timeoutExecutor = createExecutor('Control Timeout', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const expression = config.expression ? interpolate(String(config.expression), context) : undefined;
  const timeoutMs = Math.max(1, Number(config.timeoutMs ?? config.duration ?? 30000));

  const operation = async () => {
    if (!expression) return input;
    return Promise.resolve(executeExpression(expression, createScope(context, input), [input]));
  };

  try {
    const output = await Promise.race([
      operation(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);

    return {
      output,
      metadata: {
        timeoutMs,
        timedOut: false,
      },
    };
  } catch (error) {
    if (config.throwOnTimeout !== false) throw error;

    return {
      output: config.fallback !== undefined ? config.fallback : input,
      metadata: {
        timeoutMs,
        timedOut: true,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
});

const humanApprovalExecutor = createExecutor('Human Approval', async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const executionId = context.executionId;

  if (!executionId) {
    throw new Error('Human approval nodes require an active execution ID');
  }

  const title = String(config.title ?? 'Approval Required');
  const message = String(config.message ?? 'Please review and approve or reject this step.');
  const timeoutMinutes = Math.max(1, Number(config.timeoutMinutes ?? 60));
  const timeoutSeconds = Math.max(1, Math.round(timeoutMinutes * 60));
  const timeoutMs = timeoutSeconds * 1000;
  const key = getHumanApprovalKey(executionId, node.id);

  await redis.set(
    key,
    JSON.stringify({
      status: 'pending',
      executionId,
      nodeId: node.id,
      title,
      message,
      createdAt: new Date().toISOString(),
    }),
    'EX',
    timeoutSeconds
  );

  await safeLog(deps, node, 'info', 'Waiting for human approval', context, { title, timeoutMinutes });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const approval = parseApprovalState(await redis.get(key));
    const status = approval?.status;

    if (status === 'approved' || status === 'rejected') {
      await redis.del(key);
      return {
        approved: status === 'approved',
        output: {
          decision: status,
          comment: approval?.comment,
          input,
        },
        metadata: {
          branch: status,
          decision: status,
          comment: approval?.comment,
        },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  await redis.del(key);
  throw new Error(`Approval timed out after ${timeoutMinutes} minutes`);
});

const subWorkflowExecutor = createExecutor('Control Sub Workflow', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const workflowId = String(config.workflowId ?? '').trim();
  const input = getResolvedInput(config, context);
  const mapping = (config.inputMapping ?? {}) as Record<string, string>;

  if (!workflowId) {
    throw new Error('workflowId is required for sub-workflow execution');
  }

  const mappedInput = Object.keys(mapping).length === 0
    ? input
    : Object.fromEntries(
        Object.entries(mapping).map(([key, value]) => [key, interpolateValue(value, context)])
      );

  const executeResponse = await fetchWithTimeout(`${getInternalApiBaseUrl()}/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: mappedInput }),
    timeout: 15_000,
  });
  const executePayload = await executeResponse.json();

  if (!executeResponse.ok || !executePayload.success) {
    throw new Error(executePayload.error || 'Failed to start sub-workflow');
  }

  const executionId = String(executePayload.data?.executionId ?? '');
  if (!executionId) {
    throw new Error('Sub-workflow execution did not return an execution ID');
  }

  const execution = await pollSubWorkflowExecution(executionId);

  return {
    output: execution.output,
    metadata: {
      workflowId,
      executionId,
      status: execution.status,
    },
  };
});

export const controlExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.CONTROL_CONDITION]: conditionExecutor,
  [NodeType.CONTROL_SWITCH]: switchExecutor,
  [NodeType.CONTROL_LOOP]: loopExecutor,
  [NodeType.CONTROL_FOREACH]: foreachExecutor,
  [NodeType.CONTROL_WHILE]: whileExecutor,
  [NodeType.CONTROL_PARALLEL]: parallelExecutor,
  [NodeType.CONTROL_SEQUENCE]: sequenceExecutor,
  [NodeType.CONTROL_ERROR]: errorExecutor,
  [NodeType.CONTROL_RETRY]: retryExecutor,
  [NodeType.CONTROL_TIMEOUT]: timeoutExecutor,
  [NodeType.HUMAN_APPROVAL]: humanApprovalExecutor,
  [NodeType.CONTROL_SUB_WORKFLOW]: subWorkflowExecutor,
};
