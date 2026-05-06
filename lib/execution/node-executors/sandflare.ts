/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NodeType } from '@/types/nodes';
import { SandboxManager } from '@/lib/sandflare/manager';
import { SandboxProvider } from '@/lib/sandflare/types';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps, SharedSandbox } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
  buildAuthHeaders,
} from './utils';

type RetryableError = Error & {
  status?: number;
  retryAfterMs?: number;
};

type SandflareLanguage =
  | 'python'
  | 'nodejs'
  | 'go'
  | 'rust'
  | 'bash'
  | 'ruby'
  | 'php'
  | 'java'
  | 'docker'
  | 'jupyter';

type ExecutorHandlerArgs = {
  config: Record<string, any>;
  context: ExecutorContext;
  deps: ExecutorDeps;
  input: any;
};

const DEFAULT_TIMEOUT = 30000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getConfig(node: Parameters<NodeExecutorFn>[0], context: ExecutorContext): Record<string, any> {
  return interpolateDeep(node.data?.config ?? {}, context) ?? {};
}

function stringifyValue(value: any): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseStatusFromError(error: Error): number | undefined {
  const retryableError = error as RetryableError;
  if (retryableError.status) return retryableError.status;
  const match = error.message.match(/HTTP\s+(\d{3})|\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1] || match[2]) : undefined;
}

function shouldRetryError(error: Error): boolean {
  const status = parseStatusFromError(error);
  return status === undefined || status === 429 || status >= 500;
}

async function logExecution(
  deps: ExecutorDeps,
  nodeId: string,
  nodeName: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
): Promise<void> {
  try {
    await deps.logNodeExecution(nodeId, nodeName, level, message, data, context);
  } catch {
    // Ignore logging failures.
  }
}

function createSandflareExecutor(
  label: string,
  handler: (args: ExecutorHandlerArgs) => Promise<Record<string, any>>
): NodeExecutorFn {
  return async (node, _definition, context, deps) => {
    const config = getConfig(node, context);
    const input = resolveNodeInput(context, config.inputVariable);
    const nodeName = node.data?.config?.label || node.data?.type || label;
    const startedAt = Date.now();

    await logExecution(deps, node.id, nodeName, 'info', `${label} started`, context, {
      sandboxId: context.sandbox?.id,
      usingSharedSandbox: !!context.sandbox,
    });

    try {
      const result = await handler({ config, context, deps, input });
      const finalResult = { ...result, duration: Date.now() - startedAt };
      await logExecution(deps, node.id, nodeName, 'info', `${label} completed`, context, {
        duration: finalResult.duration,
      });
      return finalResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logExecution(deps, node.id, nodeName, 'error', `${label} failed`, context, { message });
      throw error;
    }
  };
}

function getTimeout(config: Record<string, any>): number {
  return Number(config.timeout) || DEFAULT_TIMEOUT;
}

function resolveConfiguredValue(
  config: Record<string, any>,
  context: ExecutorContext,
  configKeys: string[],
  envKeys: string[]
): string {
  for (const key of configKeys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  for (const key of envKeys) {
    const value = context.secrets?.[key] || context.envVars?.[key] || process.env[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function getSandflareApiKey(config: Record<string, any>, context: ExecutorContext): string {
  return resolveConfiguredValue(config, context, ['apiKey'], ['SANDFLARE_API_KEY']);
}

function getSandflareBaseUrl(config: Record<string, any>, context: ExecutorContext): string {
  return resolveConfiguredValue(config, context, ['baseUrl'], ['SANDFLARE_BASE_URL']) || 'https://api.sandflare.io';
}

function getManager(config: Record<string, any>, context: ExecutorContext): SandboxManager {
  return new SandboxManager({
    provider: config.provider || 'auto',
    sandflareApiKey: getSandflareApiKey(config, context),
    fallbackToMock: config.fallbackToMock ?? true,
  });
}

/** Resolve the shared sandbox from context, or create an ad-hoc one. */
function resolveProvider(config: Record<string, any>, context: ExecutorContext): SandboxProvider {
  if (context.sandbox) return context.sandbox.provider;
  return getManager(config, context).getProvider();
}

function normalizeEnvironment(
  config: Record<string, any>,
  input: any,
  context: ExecutorContext
): Record<string, string> {
  const environment = typeof config.environment === 'string' ? safeJsonParse(config.environment) : config.environment;
  const envObject = environment && typeof environment === 'object' && !Array.isArray(environment) ? environment : {};
  const baseEntries = Object.fromEntries(
    Object.entries(envObject).map(([key, value]) => [key, stringifyValue(value)])
  );
  return {
    ...(context.envVars ?? {}),
    ...(context.secrets ?? {}),
    ...baseEntries,
    ...(config.exposeInputAsEnv === false
      ? {}
      : {
          WORKFLOW_INPUT: stringifyValue(input),
          WORKFLOW_INPUT_JSON: stringifyValue(input),
        }),
  };
}

function normalizePackages(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseOutput(stdout: string, config: Record<string, any>): any {
  return config.parseJsonOutput === false ? stdout : safeJsonParse(stdout);
}

function buildCode(config: Record<string, any>, input: any, language: SandflareLanguage): string {
  const sections = [config.prelude, config.code, config.command].filter(Boolean).map((value) => String(value));
  if (sections.length > 0) return sections.join('\n\n');
  if (typeof input === 'string' && input.trim()) return input;
  if (input?.code) return stringifyValue(input.code);
  throw new Error(`Sandflare ${language} execution requires config.code, config.command, or string input`);
}

async function retryable<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    retryOn: shouldRetryError,
  }).catch((error) => {
    throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/**
 * Core code execution helper.
 *
 * If context.sandbox exists (Option B — shared sandbox) the sandbox is reused
 * and NOT destroyed after the call. Otherwise a temporary sandbox is created
 * and cleaned up, preserving backward-compatible behaviour.
 */
async function executeSandboxLifecycle(
  config: Record<string, any>,
  language: SandflareLanguage,
  code: string,
  input: any,
  context: ExecutorContext,
  stdinOverride?: string
): Promise<Record<string, any>> {
  const timeout = getTimeout(config);
  const environment = normalizeEnvironment(config, input, context);
  const packages = normalizePackages(config.packages);

  const useShared = !!context.sandbox;
  const provider = resolveProvider(config, context);

  // Install any node-level packages into the shared sandbox before running.
  if (useShared && packages.length > 0) {
    const runtime = language === 'nodejs' ? 'npm' : 'pip';
    for (const pkg of packages) {
      await retryable(`Install ${pkg}`, () =>
        provider.executeSandbox(context.sandbox!.id, {
          code: runtime === 'npm' ? `npm install ${pkg}` : `pip install ${pkg}`,
          language: 'bash',
          timeout,
        })
      ).catch(() => undefined); // best-effort
    }
  }

  let sandboxId: string;
  let owned = false; // true when we created it and must destroy it

  if (useShared) {
    sandboxId = context.sandbox!.id;
  } else {
    const sandbox = await retryable('Sandflare sandbox creation', () =>
      provider.createSandbox({
        language: language === 'jupyter' ? ('python' as any) : (language as any),
        environment,
        packages,
        timeout,
        memoryLimit: config.memoryLimit,
        template: config.template,
        size: config.size,
      } as any)
    );
    sandboxId = sandbox.id;
    owned = true;
  }

  try {
    const execution = await retryable('Sandflare code execution', () =>
      provider.executeSandbox(sandboxId, {
        code,
        language,
        stdin: stdinOverride,
        timeout,
        environment,
      })
    );

    const metrics = await provider.getMetrics(sandboxId).catch(() => undefined);

    if (execution.exitCode !== 0 && config.failOnNonZeroExit !== false) {
      throw new Error(
        `Sandflare ${language} execution failed: exit code ${execution.exitCode}${execution.stderr ? ` - ${execution.stderr}` : ''}`
      );
    }

    return {
      output: parseOutput(execution.stdout, config),
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      executionTime: execution.executionTime,
      memoryUsed: execution.memoryUsed,
      metrics,
      language,
      provider: provider.name,
      sandboxId,
    };
  } finally {
    if (owned) {
      await provider.destroySandbox(sandboxId).catch(() => undefined);
    }
  }
}

function buildJupyterCells(config: Record<string, any>, input: any): string[] {
  if (Array.isArray(config.cells)) {
    return config.cells.map((cell: any) => stringifyValue(cell.code ?? cell)).filter(Boolean);
  }
  if (typeof config.cells === 'string') {
    const parsed = safeJsonParse(config.cells);
    if (Array.isArray(parsed)) return parsed.map((cell: any) => stringifyValue(cell.code ?? cell)).filter(Boolean);
  }
  if (typeof config.notebook === 'string') {
    const parsed = safeJsonParse(config.notebook);
    const cells = parsed?.cells;
    if (Array.isArray(cells)) return cells.map((cell: any) => stringifyValue(cell?.source || cell?.code || cell)).filter(Boolean);
  }
  const fallbackCode = config.code || (typeof input === 'string' ? input : input?.code);
  return fallbackCode ? [String(fallbackCode)] : [];
}

async function executeJupyter(
  config: Record<string, any>,
  input: any,
  context: ExecutorContext
): Promise<Record<string, any>> {
  const timeout = getTimeout(config);
  const environment = normalizeEnvironment(config, input, context);
  const packages = normalizePackages(config.packages);
  const cells = buildJupyterCells(config, input);

  if (cells.length === 0) {
    throw new Error('Sandflare jupyter execution requires config.cells, config.notebook, config.code, or code input');
  }

  const useShared = !!context.sandbox;
  const provider = resolveProvider(config, context);

  let sandboxId: string;
  let owned = false;

  if (useShared) {
    sandboxId = context.sandbox!.id;
  } else {
    const sandbox = await retryable('Jupyter sandbox creation', () =>
      provider.createSandbox({
        language: 'python' as any,
        environment,
        packages,
        timeout,
        memoryLimit: config.memoryLimit,
        template: config.template || 'code-interpreter',
        size: config.size,
      } as any)
    );
    sandboxId = sandbox.id;
    owned = true;
  }

  const outputs: Array<Record<string, any>> = [];

  try {
    for (let index = 0; index < cells.length; index += 1) {
      const code = cells[index];
      try {
        const result = await retryable(`Jupyter cell ${index + 1} execution`, () =>
          provider.executeSandbox(sandboxId, {
            code,
            language: 'python',
            timeout,
            environment,
            stdin: typeof config.stdin === 'string' ? config.stdin : undefined,
          })
        );
        outputs.push({
          index,
          code,
          output: parseOutput(result.stdout, config),
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTime: result.executionTime,
          memoryUsed: result.memoryUsed,
        });
        if (result.exitCode !== 0 && config.continueOnError !== true) {
          throw new Error(`Jupyter cell ${index + 1} failed with exit code ${result.exitCode}: ${result.stderr}`);
        }
      } catch (error) {
        outputs.push({
          index, code, output: null, stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        });
        if (config.continueOnError !== true) throw error;
      }
    }

    const metrics = await provider.getMetrics(sandboxId).catch(() => undefined);
    return {
      output: outputs[outputs.length - 1]?.output ?? null,
      cells: outputs,
      stdout: outputs.map((cell) => cell.stdout || '').join('\n'),
      stderr: outputs.map((cell) => cell.stderr || '').filter(Boolean).join('\n'),
      metrics,
      language: 'jupyter',
      provider: provider.name,
      sandboxId,
    };
  } finally {
    if (owned) await provider.destroySandbox(sandboxId).catch(() => undefined);
  }
}

function createLanguageExecutor(language: SandflareLanguage): NodeExecutorFn {
  return createSandflareExecutor(`Sandflare ${language}`, async ({ config, input, context }) => {
    const code = buildCode(config, input, language);
    const stdinSource = typeof config.stdin === 'string' ? config.stdin : undefined;
    return executeSandboxLifecycle(config, language, code, input, context, stdinSource);
  });
}

const sandflareExecuteExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare execute',
  async ({ config, input, context }) => {
    const requestedLanguage = String(config.language || input?.language || 'python').toLowerCase() as SandflareLanguage;
    if (!['python', 'nodejs', 'go', 'rust', 'bash', 'ruby', 'php', 'java', 'docker', 'jupyter'].includes(requestedLanguage)) {
      throw new Error(`Unsupported Sandflare language: ${requestedLanguage}`);
    }
    if (requestedLanguage === 'jupyter') {
      return executeJupyter({ ...config, language: requestedLanguage }, input, context);
    }
    const code = buildCode({ ...config, language: requestedLanguage }, input, requestedLanguage);
    return executeSandboxLifecycle(
      { ...config, language: requestedLanguage },
      requestedLanguage,
      code,
      input,
      context,
      typeof config.stdin === 'string' ? config.stdin : undefined
    );
  }
);

const sandflareScrapeExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare scrape',
  async ({ config, input, context }) => {
    const url = String(config.url || input?.url || '').trim();
    if (!url) throw new Error('Sandflare scrape requires a URL');
    const manager = getManager(config, context);
    const result = await retryable('Sandflare scrape', () =>
      manager.scrapeWebsite({
        url,
        javascript: config.javascript !== false,
        waitFor: config.waitFor,
        timeout: getTimeout(config),
      })
    );
    return {
      output: result.extractedData ?? result.text ?? result.html,
      url: result.metadata?.url || url,
      title: result.metadata?.title,
      html: result.html,
      text: result.text,
      extractedData: result.extractedData,
      metadata: result.metadata,
    };
  }
);

// ─── Advanced Sandflare feature executors ───────────────────────────────────

const sandflareFileWriteExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare file write',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.file_write requires a shared sandbox (add a Sandflare code node earlier in the workflow)');
    const { provider, id: sandboxId } = context.sandbox;
    const path = config.path || (typeof input?.path === 'string' ? input.path : '/home/user/file.txt');
    const content = config.content ?? input?.content ?? stringifyValue(input);
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for shared file write');
    const url = `${baseUrl}/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey || '', 'Content-Type': 'application/octet-stream' },
      body: typeof content === 'string' ? content : JSON.stringify(content),
    });
    if (!res.ok) throw new Error(`File write failed: ${res.status} ${await res.text()}`);
    return { success: true, path, sandboxId, bytesWritten: typeof content === 'string' ? content.length : JSON.stringify(content).length };
  }
);

const sandflareFileReadExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare file read',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.file_read requires a shared sandbox');
    const { id: sandboxId } = context.sandbox;
    const path = config.path || (typeof input?.path === 'string' ? input.path : '/home/user/file.txt');
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for shared file read');
    const url = `${baseUrl}/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`;
    const res = await fetchWithTimeout(url, { headers: { 'X-API-Key': apiKey || '' } });
    if (!res.ok) throw new Error(`File read failed: ${res.status} ${await res.text()}`);
    const text = await res.text();
    const content = config.encoding === 'base64' ? Buffer.from(text).toString('base64') : text;
    return { content, path, sandboxId, size: text.length };
  }
);

const sandflareFileListExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare file list',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.file_list requires a shared sandbox');
    const { id: sandboxId } = context.sandbox;
    const path = config.path || '/home/user';
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for shared file list');
    const url = `${baseUrl}/sandboxes/${sandboxId}/ls?path=${encodeURIComponent(path)}`;
    const res = await fetchWithTimeout(url, { headers: { 'X-API-Key': apiKey || '' } });
    if (!res.ok) throw new Error(`File list failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return { entries: data.entries || [], path, sandboxId, count: (data.entries || []).length };
  }
);

const sandflareInstallExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare install',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.install requires a shared sandbox');
    const { provider, id: sandboxId } = context.sandbox;
    const packages = normalizePackages(config.packages || input?.packages);
    const runtime: string = config.runtime || 'pip';
    if (packages.length === 0) throw new Error('sandflare.install: no packages specified');

    const installed: string[] = [];
    const failed: string[] = [];

    for (const pkg of packages) {
      const cmd = runtime === 'npm' ? `npm install ${pkg}` : runtime === 'apt' ? `apt-get install -y ${pkg}` : `pip install ${pkg}`;
      const result = await retryable(`Install ${pkg}`, () =>
        provider.executeSandbox(sandboxId, { code: cmd, language: 'bash', timeout: 60000 })
      ).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message, executionTime: 0 }));

      if ((result as any).exitCode === 0) installed.push(pkg);
      else failed.push(pkg);
    }

    if (failed.length > 0 && config.failOnError !== false) {
      throw new Error(`Failed to install: ${failed.join(', ')}`);
    }
    return { installed, failed, runtime, sandboxId };
  }
);

const sandflareSnapshotExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare snapshot',
  async ({ config, context }) => {
    if (!context.sandbox) throw new Error('sandflare.snapshot requires a shared sandbox');
    const { id: sandboxId } = context.sandbox;
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    const body: Record<string, any> = {};
    if (config.name) body.name = config.name;
    if (config.description) body.description = config.description;
    if (config.tags) body.tags = Array.isArray(config.tags) ? config.tags : [config.tags];

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for sandbox snapshots');
    const res = await fetchWithTimeout(`${baseUrl}/sandboxes/${sandboxId}/snapshot`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey || '', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Snapshot failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return {
      snapshotId: data.snapshot_id || data.id || data.build_id,
      status: data.status,
      name: data.name,
      sandboxId,
    };
  }
);

const sandflareGitCloneExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare git clone',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.git_clone requires a shared sandbox');
    const { provider, id: sandboxId } = context.sandbox;
    const repoUrl = config.repoUrl || input?.repoUrl;
    if (!repoUrl) throw new Error('sandflare.git_clone: repoUrl is required');
    const branch = config.branch || 'main';
    const path = config.path || '/repo';
    const depth = config.depth ? `--depth=${config.depth}` : '--depth=1';
    const token = config.token ? config.token : '';
    // Embed token in URL if provided (standard git credential format)
    const authenticatedUrl = token ? repoUrl.replace('https://', `https://x-access-token:${token}@`) : repoUrl;

    const cloneCmd = `git clone ${depth} -b ${branch} ${authenticatedUrl} ${path}`;
    const result = await retryable('git clone', () =>
      provider.executeSandbox(sandboxId, { code: cloneCmd, language: 'bash', timeout: 120000 })
    );
    if (result.exitCode !== 0) throw new Error(`git clone failed: ${result.stderr}`);
    return { success: true, path, branch, repoUrl: repoUrl.replace(token, '***'), sandboxId };
  }
);

const sandflarePlaywrightExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare Playwright',
  async ({ config, input, context }) => {
    if (!context.sandbox) throw new Error('sandflare.playwright requires a shared sandbox');
    const { provider, id: sandboxId } = context.sandbox;

    // Install playwright if not already done
    await provider.executeSandbox(sandboxId, {
      code: 'pip install playwright && python -m playwright install chromium 2>&1 | tail -1',
      language: 'bash',
      timeout: 120000,
    }).catch(() => undefined);

    const url = config.url || input?.url || '';
    const action = config.action || 'screenshot';
    let script = config.script;

    if (!script) {
      if (action === 'screenshot') {
        script = `
from playwright.sync_api import sync_playwright
import base64
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("${url}", wait_until="networkidle", timeout=30000)
    screenshot = page.screenshot()
    print(base64.b64encode(screenshot).decode())
    browser.close()
`;
      } else if (action === 'scrape') {
        script = `
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("${url}", wait_until="networkidle", timeout=30000)
    result = {
        "title": page.title(),
        "url": page.url,
        "text": page.inner_text("body")[:5000],
        "links": [a.get_attribute("href") for a in page.query_selector_all("a[href]")][:20],
    }
    print(json.dumps(result))
    browser.close()
`;
      } else {
        throw new Error(`Unknown Playwright action: ${action}. Use 'screenshot', 'scrape', or provide a custom script`);
      }
    }

    const result = await retryable('Playwright execution', () =>
      provider.executeSandbox(sandboxId, { code: script, language: 'python', timeout: 60000 })
    );
    if (result.exitCode !== 0) throw new Error(`Playwright failed: ${result.stderr}`);

    const parsed = safeJsonParse(result.stdout);
    return {
      output: parsed || result.stdout,
      stdout: result.stdout,
      stderr: result.stderr,
      action,
      url,
      sandboxId,
    };
  }
);

const sandflareMemoryAddExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare memory add',
  async ({ config, input, context }) => {
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);
    const content = config.content || (typeof input === 'string' ? input : stringifyValue(input));
    if (!content) throw new Error('sandflare.memory_add: content is required');

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for Sandflare memory');
    const res = await fetchWithTimeout(`${baseUrl}/memory`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category: config.category || 'general' }),
    });
    if (!res.ok) throw new Error(`Memory add failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return { memoryId: data.id, content, category: config.category || 'general' };
  }
);

const sandflareMemorySearchExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare memory search',
  async ({ config, input, context }) => {
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);
    const query = config.query || (typeof input === 'string' ? input : input?.query);
    if (!query) throw new Error('sandflare.memory_search: query is required');

    const params = new URLSearchParams({ q: query });
    if (config.limit) params.set('limit', String(config.limit));
    if (config.category) params.set('category', config.category);

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for Sandflare memory');
    const res = await fetchWithTimeout(`${baseUrl}/memory?${params}`, {
      headers: { 'X-API-Key': apiKey || '' },
    });
    if (!res.ok) throw new Error(`Memory search failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return { memories: data.memories || data.results || data, query };
  }
);

const sandflareMetricsExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare metrics',
  async ({ config, context }) => {
    if (!context.sandbox) throw new Error('sandflare.metrics requires a shared sandbox');
    const { provider, id: sandboxId } = context.sandbox;
    const metrics = await provider.getMetrics(sandboxId);
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    // Also fetch process list
    if (!apiKey) {
      return { ...metrics, processes: [], sandboxId, warning: 'SANDFLARE_API_KEY not configured for process metrics' };
    }

    const procRes = await fetchWithTimeout(`${baseUrl}/sandboxes/${sandboxId}/agent/processes`, {
      headers: { 'X-API-Key': apiKey || '' },
    }).catch(() => null);
    const processes = procRes?.ok ? await procRes.json().catch(() => []) : [];

    return { ...metrics, processes, sandboxId };
  }
);

const sandflareForkExecutor: NodeExecutorFn = createSandflareExecutor(
  'Sandflare fork',
  async ({ config, context }) => {
    if (!context.sandbox) throw new Error('sandflare.fork requires a shared sandbox');
    const { id: sandboxId } = context.sandbox;
    const count = Math.min(Number(config.count) || 2, 8); // API limit: 8
    const apiKey = getSandflareApiKey(config, context);
    const baseUrl = getSandflareBaseUrl(config, context);

    if (!apiKey) throw new Error('SANDFLARE_API_KEY not configured for sandbox fork');
    const res = await fetchWithTimeout(`${baseUrl}/sandboxes/${sandboxId}/fork`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: count }),
    });
    if (!res.ok) throw new Error(`Fork failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const forks: string[] = data.sandboxes || data.names || data.ids || [];
    return { forks, count: forks.length, sourceSandboxId: sandboxId };
  }
);

export const sandflareExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.SANDFLARE_EXECUTE]: sandflareExecuteExecutor,
  [NodeType.SANDFLARE_SCRAPE]: sandflareScrapeExecutor,
  [NodeType.SANDFLARE_PYTHON]: createLanguageExecutor('python'),
  [NodeType.SANDFLARE_NODEJS]: createLanguageExecutor('nodejs'),
  [NodeType.SANDFLARE_GO]: createLanguageExecutor('go'),
  [NodeType.SANDFLARE_RUST]: createLanguageExecutor('rust'),
  [NodeType.SANDFLARE_BASH]: createLanguageExecutor('bash'),
  [NodeType.SANDFLARE_RUBY]: createLanguageExecutor('ruby'),
  [NodeType.SANDFLARE_PHP]: createLanguageExecutor('php'),
  [NodeType.SANDFLARE_JAVA]: createLanguageExecutor('java'),
  [NodeType.SANDFLARE_DOCKER]: createSandflareExecutor('Sandflare docker', async ({ config, input, context }) => {
    const authHeaders = buildAuthHeaders(config.registryAuth);
    const inlineAuth = Object.keys(authHeaders).length > 0 ? `# registry auth configured: ${Object.keys(authHeaders).join(', ')}` : '';
    const dockerfile = config.dockerfile ? String(config.dockerfile) : '';
    const command = config.command ? String(config.command) : '';
    const code = [inlineAuth, dockerfile, command, !dockerfile && !command ? buildCode(config, input, 'docker') : '']
      .filter(Boolean).join('\n\n');
    return executeSandboxLifecycle(config, 'docker', code, input, context, typeof config.stdin === 'string' ? config.stdin : undefined);
  }),
  [NodeType.SANDFLARE_JUPYTER]: createSandflareExecutor('Sandflare jupyter', async ({ config, input, context }) =>
    executeJupyter(config, input, context)
  ),
  [NodeType.SANDFLARE_FILE_WRITE]: sandflareFileWriteExecutor,
  [NodeType.SANDFLARE_FILE_READ]: sandflareFileReadExecutor,
  [NodeType.SANDFLARE_FILE_LIST]: sandflareFileListExecutor,
  [NodeType.SANDFLARE_INSTALL]: sandflareInstallExecutor,
  [NodeType.SANDFLARE_SNAPSHOT]: sandflareSnapshotExecutor,
  [NodeType.SANDFLARE_FORK]: sandflareForkExecutor,
  [NodeType.SANDFLARE_GIT_CLONE]: sandflareGitCloneExecutor,
  [NodeType.SANDFLARE_PLAYWRIGHT]: sandflarePlaywrightExecutor,
  [NodeType.SANDFLARE_MEMORY_ADD]: sandflareMemoryAddExecutor,
  [NodeType.SANDFLARE_MEMORY_SEARCH]: sandflareMemorySearchExecutor,
  [NodeType.SANDFLARE_METRICS]: sandflareMetricsExecutor,
};
