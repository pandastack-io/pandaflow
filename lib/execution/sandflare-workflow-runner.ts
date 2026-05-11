import { WorkflowDefinition, NodeType } from '@/types/nodes';
import { Sandbox } from '@sandflare/sdk';
import { executionEmitter } from './execution-emitter';
import { WORKFLOW_PYTHON_RUNTIME } from './workflow-python-runtime';
import { db } from '@/lib/db';
import { credentials, executionLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/secrets/crypto';

const ORG_ID = '00000000-0000-0000-0000-000000000000'; // seed org — only used in dev (SKIP_AUTH=true)

/** Node types that require the browser-agent template (has Playwright). */
const BROWSER_NODE_TYPES = new Set<string>([
  NodeType.SANDFLARE_PLAYWRIGHT,
  NodeType.SANDFLARE_SCRAPE,
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
 * Picks the right Sandflare template for the workflow.
 *
 * Strategy:
 *   browser-agent → workflows with Playwright/browser-scraping nodes (has chromium pre-installed)
 *   ai-agent      → everything else (has openai, anthropic, langchain, pandas, numpy, requests, etc.)
 */
function pickTemplate(nodeTypes: string[]): 'browser-agent' | 'ai-agent' {
  return nodeTypes.some((t) => BROWSER_NODE_TYPES.has(t)) ? 'browser-agent' : 'ai-agent';
}

/**
 * Base64-encode a JSON value for safe transport as an env var.
 */
function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}


/**
 * Runs an entire workflow inside a Sandflare microVM sandbox.
 *
 * Flow:
 *   1. Pick template (browser-agent or ai-agent)
 *   2. Create sandbox with secrets/vars injected as base64 env vars
 *   3. Write the Python runtime script to /tmp/workflow_runtime.py
 *   4. Stream execution via execStream() — each stdout line is parsed immediately
 *   5. Each parsed event is fed into executionEmitter in real-time for per-node SSE delivery
 *   6. Destroy sandbox in finally block
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

  const apiKey = process.env.SANDFLARE_API_KEY!;

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

  try {
    sandbox = await Sandbox.create(`workflow-${executionId.slice(0, 8)}`, {
      templateId: template,
      ttlHours: 1,
      ephemeral: true,
      apiKey,
      env: {
        WORKFLOW_DEFINITION: b64json(definition),
        WORKFLOW_INPUT: b64json(input),
        WORKFLOW_SECRETS: b64json(secrets),
        WORKFLOW_VARIABLES: b64json(variables),
        WORKFLOW_ENV_VARS: b64json(envVars),
        PYTHONUNBUFFERED: '1',
      },
    });

    // Write the Python runtime script to a file so execStream can run it
    await sandbox.writeFile('/tmp/workflow_runtime.py', WORKFLOW_PYTHON_RUNTIME);

    for await (const chunk of sandbox.execStream('python3 /tmp/workflow_runtime.py')) {

      if (chunk.event !== 'stdout') continue;

      let ev: Record<string, unknown>;
      if (typeof chunk.data === 'object' && chunk.data !== null) {
        const d = chunk.data as Record<string, unknown>;
        if (typeof d.line === 'string') {
          // Sandflare SDK wraps stdout lines as { line: "<json string>" }
          const line = d.line.trim();
          if (!line.startsWith('{')) continue;
          try {
            ev = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
        } else {
          // Already a parsed event object
          ev = d;
        }
      } else {
        const line = String(chunk.data ?? '').trim();
        if (!line.startsWith('{')) continue;
        try {
          ev = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
      }

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
        console.error('[Sandflare] Failed to persist execution logs:', logErr);
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
        await sandbox.delete();
      } catch (err) {
        console.error(`[SandflareRunner] Failed to delete sandbox:`, err);
      }
    }
  }
}

/**
 * Returns true when a real (non-mock) Sandflare API key is configured.
 */
export function isSandflareEnabled(): boolean {
  const key = process.env.SANDFLARE_API_KEY;
  return Boolean(key && !key.startsWith('mock-') && key !== 'mock-api-key');
}
