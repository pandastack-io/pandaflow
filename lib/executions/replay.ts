export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ReplayStepStatus = 'completed' | 'failed' | 'running';

export interface ExecutionLogEntry {
  id: string;
  executionId?: string;
  nodeId: string | null;
  nodeName: string | null;
  level: ExecutionLogLevel;
  message: string;
  data: unknown;
  timestamp: string | Date | null;
  durationMs?: number | null;
}

export interface NodeExecutionSummary {
  nodeId: string;
  nodeName: string;
  status: ReplayStepStatus;
  timestamp: string | null;
  duration: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
}

export interface ExecutionReplayStep {
  nodeId: string;
  nodeName: string;
  status: ReplayStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
  logCount: number;
  logs: ExecutionLogEntry[];
  raw: {
    nodeId: string;
    nodeName: string;
    status: ReplayStepStatus;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    input: unknown;
    output: unknown;
    error: string | null;
    logs: ExecutionLogEntry[];
  };
}

type GroupedLog = {
  nodeId: string;
  nodeName: string;
  logs: ExecutionLogEntry[];
};

function normalizeTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function timestampValue(value: string | Date | null | undefined): number {
  const normalized = normalizeTimestamp(value);
  return normalized ? new Date(normalized).getTime() : Number.MAX_SAFE_INTEGER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDataValue(data: unknown, keys: string[]): unknown {
  if (!isRecord(data)) return undefined;

  for (const key of keys) {
    if (key in data) {
      return data[key];
    }
  }

  return undefined;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toErrorString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value == null) return null;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function groupLogsByNode(logs: ExecutionLogEntry[]): GroupedLog[] {
  const groups = new Map<string, GroupedLog>();

  for (const log of logs) {
    if (!log.nodeId) continue;

    const normalizedLog: ExecutionLogEntry = {
      ...log,
      timestamp: normalizeTimestamp(log.timestamp),
    };

    const existing = groups.get(log.nodeId);
    if (existing) {
      existing.logs.push(normalizedLog);
      if (!existing.nodeName && log.nodeName) {
        existing.nodeName = log.nodeName;
      }
      continue;
    }

    groups.set(log.nodeId, {
      nodeId: log.nodeId,
      nodeName: log.nodeName || log.nodeId,
      logs: [normalizedLog],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      logs: [...group.logs].sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp)),
    }))
    .sort((a, b) => timestampValue(a.logs[0]?.timestamp) - timestampValue(b.logs[0]?.timestamp));
}

export function buildExecutionReplaySteps(
  logs: ExecutionLogEntry[],
  executionStatus: ExecutionStatus = 'completed'
): ExecutionReplayStep[] {
  const groupedLogs = groupLogsByNode(logs);

  const stepDrafts = groupedLogs.map((group) => {
    let input: unknown = undefined;
    let output: unknown = undefined;
    let error: string | null = null;
    let durationMs: number | null = null;
    let hasCompletionSignal = false;

    for (const log of group.logs) {
      const nextInput = getDataValue(log.data, ['input', 'inputs', 'prompt']);
      const nextOutput = getDataValue(log.data, ['output', 'result', 'response']);
      const nextDuration = log.durationMs ?? toNumber(getDataValue(log.data, ['durationMs', 'duration']));
      const nextError = log.level === 'error'
        ? log.message
        : toErrorString(getDataValue(log.data, ['error']));

      if (input === undefined && nextInput !== undefined) {
        input = nextInput;
      }

      if (nextOutput !== undefined) {
        output = nextOutput;
      }

      if (nextDuration !== null) {
        durationMs = nextDuration;
      }

      if (nextError && log.level === 'error') {
        error = nextError;
      }

      if (/completed|finished|generated/i.test(log.message) || nextOutput !== undefined || nextDuration !== null) {
        hasCompletionSignal = true;
      }
    }

    const startedAt = normalizeTimestamp(group.logs[0]?.timestamp);
    const completedAt = normalizeTimestamp(group.logs[group.logs.length - 1]?.timestamp);
    const hasError = group.logs.some((log) => log.level === 'error');

    return {
      nodeId: group.nodeId,
      nodeName: group.nodeName,
      logs: group.logs,
      input,
      output,
      error,
      durationMs,
      startedAt,
      completedAt,
      hasError,
      hasCompletionSignal,
    };
  });

  let runningIndex = -1;
  if (executionStatus === 'running' || executionStatus === 'pending') {
    for (let index = stepDrafts.length - 1; index >= 0; index -= 1) {
      if (!stepDrafts[index].hasError && !stepDrafts[index].hasCompletionSignal) {
        runningIndex = index;
        break;
      }
    }

    if (runningIndex === -1 && stepDrafts.length > 0) {
      runningIndex = stepDrafts.length - 1;
    }
  }

  return stepDrafts.map((draft, index) => {
    const status: ReplayStepStatus = draft.hasError
      ? 'failed'
      : index == runningIndex
        ? 'running'
        : 'completed';

    return {
      nodeId: draft.nodeId,
      nodeName: draft.nodeName,
      status,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      durationMs: draft.durationMs,
      input: draft.input,
      output: draft.output,
      error: draft.error,
      logCount: draft.logs.length,
      logs: draft.logs,
      raw: {
        nodeId: draft.nodeId,
        nodeName: draft.nodeName,
        status,
        startedAt: draft.startedAt,
        completedAt: draft.completedAt,
        durationMs: draft.durationMs,
        input: draft.input,
        output: draft.output,
        error: draft.error,
        logs: draft.logs,
      },
    };
  });
}

export function buildNodeExecutionSummaries(
  logs: ExecutionLogEntry[],
  executionStatus: ExecutionStatus = 'completed'
): NodeExecutionSummary[] {
  return buildExecutionReplaySteps(logs, executionStatus).map((step) => ({
    nodeId: step.nodeId,
    nodeName: step.nodeName,
    status: step.status,
    timestamp: step.startedAt,
    duration: step.durationMs,
    input: step.input,
    output: step.output,
    error: step.error,
  }));
}

export function getPreferredStepIndex(steps: ExecutionReplayStep[]): number {
  if (steps.length === 0) return 0;

  const runningIndex = steps.findIndex((step) => step.status === 'running');
  if (runningIndex >= 0) return runningIndex;

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].status === 'failed') {
      return index;
    }
  }

  return 0;
}

export function formatDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
