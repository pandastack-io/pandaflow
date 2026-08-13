import { WorkflowDefinition, NodeType } from '@/types/nodes';
import { Sandbox } from '@pandastack/sdk';
import { executionEmitter } from './execution-emitter';
import { WORKFLOW_PYTHON_RUNTIME } from './workflow-python-runtime';
import { db } from '@/lib/db';
import { credentials, executionLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/secrets/crypto';

const ORG_ID = '00000000-0000-0000-0000-000000000000'; // seed org — only used in dev (SKIP_AUTH=true)

/** Node types that require the browser template (has Playwright). */
const BROWSER_NODE_TYPES = new Set<string>([
  NodeType.PANDASTACK_PLAYWRIGHT,
  NodeType.PANDASTACK_SCRAPE,
]);

interface RunnerOptions {
  executionId: string;
  organizationId?: string;
  secrets?: Record<string, string>;
  variables?: Record<string, unknown>;
  envVars?: Record<string, string>;
}

async function loadSecrets(organizationId: string): Promise<Record<string, string>> {
  const secretRows = await db
    .select({ name: credentials.name, encryptedData: credentials.encryptedData, encryptionKeyId: credentials.encryptionKeyId })
    .from(credentials)
    .where(eq(credentials.organizationId, organizationId));

  const resolved: Record<string, string> = {};
  for (const row of secretRows) {
    try {
      resolved[row.name] = await decrypt(row.encryptedData, row.encryptionKeyId);
    } catch {
      // Skip undecryptable secrets
    }
  }
  return resolved;
}

interface RunnerResult {
  output: unknown;
  error?: string;
  duration: number;
  nodeResults: Record<string, unknown>;
  sandboxId?: string;
}

/**
 * Picks the right PandaStack template for the workflow.
 *
 * Strategy:
 *   browser         → workflows with Playwright/browser-scraping nodes (chromium pre-installed)
 *   code-interpreter → everything else (openai, anthropic, langchain, pandas, numpy, requests, etc.)
 */
function pickTemplate(nodeTypes: string[]): 'browser' | 'code-interpreter' {
  return nodeTypes.some((t) => BROWSER_NODE_TYPES.has(t)) ? 'browser' : 'code-interpreter';
}

/**
 * Base64-encode a JSON value for safe transport as an env var.
 */
function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

/**
 * Build a shell script that exports the workflow env vars. Values are base64
 * (no shell metacharacters), so single-quoting is safe. Sourced before the
 * Python runtime runs — PandaStack does not inject env at sandbox-create time.
 */
function buildEnvScript(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `export ${k}='${v}'`);
  return lines.join('\n') + '\n';
}


/**
 * Runs an entire workflow inside a PandaStack microVM sandbox.
 *
 * Flow:
 *   1. Pick template (browser or code-interpreter)
 *   2. Create sandbox (via @pandastack/sdk)
 *   3. Write the Python runtime + a sourced env script (secrets/vars as base64 env vars)
 *   4. Stream execution via execStream() callbacks — stdout is buffered into
 *      lines and each JSON line is parsed immediately
 *   5. Each parsed event is fed into executionEmitter in real-time for per-node SSE delivery
 *   6. Kill the sandbox in the finally block
 *   7. Return execution result
 */
export async function runWorkflowInSandbox(
  definition: WorkflowDefinition,
  input: unknown,
  options: RunnerOptions
): Promise<RunnerResult> {
  const { executionId, organizationId = ORG_ID, variables = {}, envVars = {} } = options;
  const startTime = Date.now();

  const secrets = options.secrets ?? (await loadSecrets(organizationId));

  const apiKey = process.env.PANDASTACK_API_KEY!;
  const apiUrl = process.env.PANDASTACK_API || 'https://api.pandastack.ai';

  const nodeTypes = (definition.nodes ?? []).map(
    (n) => (n.data as { type?: string })?.type ?? ''
  );
  const template = pickTemplate(nodeTypes);

  const nodeResults: Record<string, unknown> = {};
  const nodeStartTimes: Record<string, number> = {};
  type PendingLog = {
    nodeId: string;
    nodeName: string;
    level: 'info' | 'error';
    message: string;
    data: unknown;
    timestamp: Date;
    durationMs?: number;
  };
  const pendingLogs: PendingLog[] = [];
  let sandbox: Sandbox | undefined;
  let finalOutput: unknown = null;
  let finalError: string | undefined;

  /** Handle one parsed runtime event (emitted as one JSON object per stdout line). */
  const dispatchEvent = (ev: Record<string, unknown>) => {
    const ts = Number(ev.timestamp ?? Date.now());

    switch (ev.type) {
      case 'node:start': {
        const nodeId = String(ev.nodeId ?? '');
        nodeStartTimes[nodeId] = ts;
        executionEmitter.emit(executionId, {
          type: 'node:start',
          executionId,
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          timestamp: ts,
        });
        pendingLogs.push({
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          level: 'info',
          message: `Node started: ${String(ev.nodeName ?? nodeId)}`,
          data: { type: 'node:start' },
          timestamp: new Date(ts),
        });
        break;
      }

      case 'node:complete': {
        const nodeId = String(ev.nodeId ?? '');
        nodeResults[nodeId] = ev.output;
        finalOutput = ev.output;
        const dur = Number(ev.durationMs ?? (nodeStartTimes[nodeId] ? ts - nodeStartTimes[nodeId] : 0));
        executionEmitter.emit(executionId, {
          type: 'node:complete',
          executionId,
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          timestamp: ts,
          durationMs: Number(ev.durationMs ?? 0),
          output: ev.output,
        });
        pendingLogs.push({
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          level: 'info',
          message: `Node completed: ${String(ev.nodeName ?? nodeId)}`,
          data: { type: 'node:complete', output: ev.output },
          timestamp: new Date(ts),
          durationMs: dur,
        });
        break;
      }

      case 'node:error': {
        const nodeId = String(ev.nodeId ?? '');
        const dur = Number(ev.durationMs ?? (nodeStartTimes[nodeId] ? ts - nodeStartTimes[nodeId] : 0));
        executionEmitter.emit(executionId, {
          type: 'node:error',
          executionId,
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          timestamp: ts,
          durationMs: Number(ev.durationMs ?? 0),
          error: String(ev.error ?? 'Unknown error'),
        });
        pendingLogs.push({
          nodeId,
          nodeName: String(ev.nodeName ?? ''),
          level: 'error',
          message: `Node error: ${String(ev.error ?? 'Unknown error')}`,
          data: { type: 'node:error', error: ev.error },
          timestamp: new Date(ts),
          durationMs: dur,
        });
        break;
      }

      case 'execution:complete':
        executionEmitter.emit(executionId, {
          type: 'execution:complete',
          executionId,
          timestamp: ts,
        });
        break;

      case 'execution:error':
        finalError = String(ev.error ?? 'Workflow execution failed');
        executionEmitter.emit(executionId, {
          type: 'execution:error',
          executionId,
          timestamp: ts,
          error: finalError,
        });
        break;
    }
  };

  // Buffer raw stdout chunks into whole lines, then parse each JSON line.
  let stdoutBuffer = '';
  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }
    dispatchEvent(ev);
  };
  const onStdout = (chunk: string) => {
    stdoutBuffer += chunk;
    let nl: number;
    while ((nl = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, nl);
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      consumeLine(line);
    }
  };

  try {
    sandbox = await Sandbox.create(
      { template, ttlSeconds: 3600, metadata: { pandaflow_execution: executionId.slice(0, 8) } },
      { apiKey, apiUrl }
    );

    // Write the Python runtime + a sourced env script carrying the workflow payload.
    const envScript = buildEnvScript({
      WORKFLOW_DEFINITION: b64json(definition),
      WORKFLOW_INPUT: b64json(input),
      WORKFLOW_SECRETS: b64json(secrets),
      WORKFLOW_VARIABLES: b64json(variables),
      WORKFLOW_ENV_VARS: b64json(envVars),
      PYTHONUNBUFFERED: '1',
    });
    await sandbox.filesystem.write('/tmp/workflow_runtime.py', WORKFLOW_PYTHON_RUNTIME);
    await sandbox.filesystem.write('/tmp/workflow_env.sh', envScript);

    // execStream resolves with the exit code once the command finishes; events
    // are delivered incrementally through the onStdout callback above.
    await sandbox.execStream(
      "sh -lc '. /tmp/workflow_env.sh && python3 -u /tmp/workflow_runtime.py'",
      { onStdout }
    );

    // Flush any trailing partial line without a terminating newline.
    if (stdoutBuffer.length > 0) {
      consumeLine(stdoutBuffer);
      stdoutBuffer = '';
    }

    if (pendingLogs.length > 0) {
      try {
        await db.insert(executionLogs).values(
          pendingLogs.map((log) => ({
            executionId,
            nodeId: log.nodeId,
            nodeName: log.nodeName,
            level: log.level,
            message: log.message,
            data: log.data,
            timestamp: log.timestamp,
            durationMs: log.durationMs ?? null,
          }))
        );
      } catch (logErr) {
        console.error('[PandaStack] Failed to persist execution logs:', logErr);
      }
    }

    return {
      output: finalOutput,
      error: finalError,
      duration: Date.now() - startTime,
      nodeResults,
      sandboxId: sandbox.id,
    };
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch (err) {
        console.error(`[PandaStackRunner] Failed to delete sandbox:`, err);
      }
    }
  }
}

/**
 * Returns true when a real (non-mock) PandaStack API key is configured.
 */
export function isPandaStackEnabled(): boolean {
  const key = process.env.PANDASTACK_API_KEY;
  return Boolean(key && !key.startsWith('mock-') && key !== 'mock-api-key');
}
