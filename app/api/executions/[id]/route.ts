import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executionLogs, executions, workflows } from '@/lib/db/schema';
import { buildNodeExecutionSummaries, type ExecutionLogEntry, type ExecutionStatus } from '@/lib/executions/replay';
import { getCostForExecution } from '@/lib/execution/cost-tracker';

type ReplayStepStatus = 'completed' | 'failed' | 'running' | 'skipped';

type ReplayStep = {
  id: string;
  nodeId: string | null;
  nodeName: string | null;
  nodeType: string | null;
  status: ReplayStepStatus;
  input: unknown;
  output: unknown;
  logs: string[];
  rawLogs: ExecutionLogEntry[];
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  prompt: {
    request?: unknown;
    response?: unknown;
    messages?: unknown;
  } | null;
};

function normalizeTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickFirstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined);
}

function getDataValue(data: unknown, ...keys: string[]) {
  if (!isRecord(data)) return undefined;

  for (const key of keys) {
    if (key in data) {
      return data[key];
    }
  }

  return undefined;
}

function stringifyInline(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatLogLine(log: ExecutionLogEntry) {
  const timestamp = normalizeTimestamp(log.timestamp);
  const timeLabel = timestamp
    ? new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
    : 'No timestamp';
  const durationLabel = log.durationMs != null ? ` (${log.durationMs}ms)` : '';
  const payload = stringifyInline(log.data);
  return `[${timeLabel}] ${log.level.toUpperCase()} ${log.message}${durationLabel}${payload ? ` ${payload}` : ''}`;
}

function getPromptPayload(logs: ExecutionLogEntry[], input: unknown, output: unknown) {
  const request = pickFirstDefined(
    ...logs.map((log) => getDataValue(log.data, 'prompt', 'request', 'messages', 'systemPrompt')),
    getDataValue(output, 'prompt', 'request', 'messages', 'systemPrompt'),
    getDataValue(input, 'prompt', 'request', 'messages')
  );
  const response = pickFirstDefined(
    getDataValue(output, 'response', 'text', 'completion', 'assistantMessage', 'output'),
    typeof output === 'string' ? output : undefined,
    ...logs.map((log) => getDataValue(log.data, 'response', 'text', 'completion'))
  );
  const messages = pickFirstDefined(
    ...logs.map((log) => getDataValue(log.data, 'messages')),
    getDataValue(output, 'messages', 'history'),
    getDataValue(input, 'messages', 'history')
  );

  if (request === undefined && response === undefined && messages === undefined) {
    return null;
  }

  return { request, response, messages };
}

function buildReplaySteps(logs: ExecutionLogEntry[], executionStatus: ExecutionStatus): ReplayStep[] {
  const groups = new Map<string, ExecutionLogEntry[]>();

  for (const log of logs) {
    if (!log.nodeId) continue;
    const existing = groups.get(log.nodeId) ?? [];
    existing.push(log);
    groups.set(log.nodeId, existing);
  }

  const grouped = Array.from(groups.entries())
    .map(([nodeId, nodeLogs]) => ({
      nodeId,
      logs: [...nodeLogs].sort((a, b) => {
        const left = normalizeTimestamp(a.timestamp);
        const right = normalizeTimestamp(b.timestamp);
        return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
      }),
    }))
    .sort((a, b) => {
      const left = normalizeTimestamp(a.logs[0]?.timestamp);
      const right = normalizeTimestamp(b.logs[0]?.timestamp);
      return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
    });

  let runningNodeId: string | null = null;
  if (executionStatus === 'running' || executionStatus === 'pending') {
    for (let index = grouped.length - 1; index >= 0; index -= 1) {
      const group = grouped[index];
      const hasError = group.logs.some((log) => log.level === 'error' || getDataValue(log.data, 'error') !== undefined);
      const hasCompletionSignal = group.logs.some((log) => (
        log.durationMs != null
        || getDataValue(log.data, 'durationMs', 'duration') !== undefined
        || getDataValue(log.data, 'output', 'result', 'response') !== undefined
        || /completed|finished/i.test(log.message)
      ));

      if (!hasError && !hasCompletionSignal) {
        runningNodeId = group.nodeId;
        break;
      }
    }

    if (!runningNodeId && grouped.length > 0) {
      runningNodeId = grouped[grouped.length - 1].nodeId;
    }
  }

  return grouped.map(({ nodeId, logs: nodeLogs }) => {
    const firstLog = nodeLogs[0];
    const lastLog = nodeLogs[nodeLogs.length - 1];
    const nodeType = pickFirstDefined(...nodeLogs.map((log) => getDataValue(log.data, 'nodeType', 'type')));
    const input = pickFirstDefined(...nodeLogs.map((log) => getDataValue(log.data, 'input', 'inputs', 'upstreamInputs')));
    const output = [...nodeLogs]
      .reverse()
      .map((log) => pickFirstDefined(getDataValue(log.data, 'output', 'result', 'response'), log.level === 'error' ? undefined : undefined))
      .find((value) => value !== undefined);
    const error = pickFirstDefined(
      ...nodeLogs
        .filter((log) => log.level === 'error' || getDataValue(log.data, 'error') !== undefined)
        .map((log) => getDataValue(log.data, 'error') ?? log.message)
    );
    const duration = pickFirstDefined(
      ...[...nodeLogs].reverse().map((log) => log.durationMs ?? getDataValue(log.data, 'durationMs', 'duration'))
    );
    const skipped = nodeLogs.some((log) => /skip|skipped/i.test(log.message) || getDataValue(log.data, 'status') === 'skipped');
    const failed = nodeLogs.some((log) => log.level === 'error' || getDataValue(log.data, 'error') !== undefined);
    const status: ReplayStepStatus = skipped
      ? 'skipped'
      : failed
        ? 'failed'
        : runningNodeId === nodeId
          ? 'running'
          : 'completed';

    return {
      id: firstLog?.id ?? nodeId,
      nodeId,
      nodeName: pickFirstDefined(...nodeLogs.map((log) => log.nodeName), nodeId) as string,
      nodeType: typeof nodeType === 'string' ? nodeType : null,
      status,
      input,
      output,
      logs: nodeLogs.map(formatLogLine),
      rawLogs: nodeLogs,
      startedAt: normalizeTimestamp(firstLog?.timestamp),
      completedAt: normalizeTimestamp(lastLog?.timestamp),
      durationMs: typeof duration === 'number' ? duration : null,
      error: typeof error === 'string' ? error : error != null ? stringifyInline(error) : null,
      prompt: getPromptPayload(nodeLogs, input, output),
    };
  });
}

// GET /api/executions/[id] - Get execution status and results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;

  try {
    const { id } = await params;
    const [result] = await db
      .select({
        execution: executions,
        workflowName: workflows.name,
      })
      .from(executions)
      .leftJoin(workflows, eq(executions.workflowId, workflows.id))
      .where(eq(executions.id, id));

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Execution not found' },
        { status: 404 }
      );
    }

    const [rawLogs, costUsd] = await Promise.all([
      db
        .select()
        .from(executionLogs)
        .where(eq(executionLogs.executionId, id))
        .orderBy(asc(executionLogs.timestamp)),
      getCostForExecution(id),
    ]);

    const logs: ExecutionLogEntry[] = rawLogs.map((log) => ({
      ...log,
      timestamp: normalizeTimestamp(log.timestamp),
    }));

    const steps = buildReplaySteps(logs, result.execution.status);
    const nodeExecutions = buildNodeExecutionSummaries(logs, result.execution.status);
    const execution = {
      ...result.execution,
      workflowName: result.workflowName,
      startedAt: normalizeTimestamp(result.execution.startedAt),
      completedAt: normalizeTimestamp(result.execution.completedAt),
      costUsd,
    };

    return NextResponse.json({
      success: true,
      data: {
        execution,
        steps,
        ...execution,
        logs,
        nodeExecutions,
      },
    });
  } catch (error) {
    console.error('Error fetching execution:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch execution' },
      { status: 500 }
    );
  }
}
