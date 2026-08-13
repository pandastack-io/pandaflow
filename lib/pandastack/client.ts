import { Sandbox as PandaSandbox } from '@pandastack/sdk';
import {
  SandboxProvider,
  SandboxConfig,
  Sandbox,
  ExecutionOptions,
  ExecutionResult,
  SandboxMetrics,
  ScraperOptions,
  ScrapedData,
} from './types';

interface PandaStackConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Map PandaFlow's logical template/size hints onto the PandaStack template
 * catalog. PandaStack bakes CPU/RAM into the template snapshot, so `size` is
 * advisory only.
 */
function resolveTemplate(config: SandboxConfig): string {
  const t = config.template;
  if (!t) return 'code-interpreter';
  if (t === 'browser-agent' || t === 'browser') return 'browser';
  if (t === 'ai-agent' || t === 'code-interpreter') return 'code-interpreter';
  return t;
}

/** Base64-encode a JSON value for safe transport into a guest interpreter. */
function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

/** POSIX single-quote a string for safe inclusion in a shell command. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * PandaStack sandbox provider.
 *
 * Wraps the official `@pandastack/sdk` and adapts it to PandaFlow's
 * provider-agnostic {@link SandboxProvider} interface. Each created sandbox's
 * SDK handle is retained so later `executeSandbox`/`destroySandbox` calls can
 * reach it.
 *
 * API reference: https://docs.pandastack.ai
 * Base URL: https://api.pandastack.ai
 */
export class PandaStackClient implements SandboxProvider {
  readonly name = 'pandastack';
  private apiKey: string;
  private baseUrl: string;
  private sandboxes = new Map<string, PandaSandbox>();

  constructor(config: PandaStackConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || process.env.PANDASTACK_API || 'https://api.pandastack.ai';
  }

  private sdkConfig() {
    return { apiKey: this.apiKey, apiUrl: this.baseUrl };
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const template = resolveTemplate(config);
    const ttlSeconds = config.timeout ? Math.max(60, Math.ceil(config.timeout / 1000)) : 2 * 3600;

    const sb = await PandaSandbox.create({ template, ttlSeconds }, this.sdkConfig());
    this.sandboxes.set(sb.id, sb);

    return {
      id: sb.id,
      status: sb.status === 'running' ? 'running' : 'creating',
      language: config.language,
      createdAt: new Date(),
    };
  }

  private async resolve(sandboxId: string): Promise<PandaSandbox> {
    const cached = this.sandboxes.get(sandboxId);
    if (cached) return cached;
    const sb = await PandaSandbox.get(sandboxId, this.sdkConfig());
    this.sandboxes.set(sandboxId, sb);
    return sb;
  }

  async executeSandbox(sandboxId: string, options: ExecutionOptions): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sb = await this.resolve(sandboxId);
    const env = options.environment ?? {};
    const hasEnv = Object.keys(env).length > 0;
    const lang = options.language;

    try {
      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      if (lang === 'python' || lang === 'jupyter') {
        // Inject env by patching os.environ before running the user's code —
        // avoids shell-quoting entirely.
        const prelude = hasEnv
          ? `import os as _os, json as _json, base64 as _b64\n` +
            `_os.environ.update(_json.loads(_b64.b64decode("${b64json(env)}").decode()))\n`
          : '';
        const res = await sb.runCode(prelude + options.code, 'python');
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
        exitCode = res.exit_code ?? res.exitCode ?? 0;
      } else if (lang === 'nodejs') {
        // Write the script to a file, then run it under node with env exported.
        const prelude = hasEnv
          ? `Object.assign(process.env, JSON.parse(Buffer.from("${b64json(env)}", "base64").toString()));\n`
          : '';
        await sb.filesystem.write('/tmp/_pandaflow_node.js', prelude + options.code);
        const res = await sb.exec('node /tmp/_pandaflow_node.js');
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
        exitCode = res.exit_code ?? res.exitCode ?? 0;
      } else {
        // bash, go, rust, ruby, php, java, docker, or unspecified → shell exec.
        const exports = hasEnv
          ? Object.entries(env)
              .map(([k, v]) => `export ${k}=${shQuote(String(v))}; `)
              .join('')
          : '';
        const res = await sb.exec(`${exports}${options.code || 'echo "No command provided"'}`);
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
        exitCode = res.exit_code ?? res.exitCode ?? 0;
      }

      return {
        stdout,
        stderr,
        exitCode,
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
      };
    } catch (error) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
      };
    }
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    try {
      const sb = await this.resolve(sandboxId);
      await sb.kill();
    } finally {
      this.sandboxes.delete(sandboxId);
    }
  }

  async getMetrics(sandboxId: string): Promise<SandboxMetrics> {
    // PandaStack does not expose per-sandbox resource metrics via the SDK;
    // return a zeroed record so callers can still compute derived values.
    void sandboxId;
    return {
      executionTime: 0,
      memoryUsed: 0,
      networkRequests: 0,
      costUSD: 0,
    };
  }

  async scrapeWebsite(options: ScraperOptions): Promise<ScrapedData> {
    // PandaStack has no dedicated scraping endpoint — run a scraping script in
    // an ephemeral code-interpreter sandbox and tear it down afterwards.
    const created = await this.createSandbox({
      language: 'python',
      template: 'code-interpreter',
      timeout: options.timeout || 30000,
    });

    try {
      const result = await this.executeSandbox(created.id, {
        code: this.generateScrapingCode(options),
        language: 'python',
      });

      let scraped: Record<string, unknown>;
      try {
        scraped = JSON.parse(result.stdout || '{}');
      } catch {
        scraped = { html: result.stdout || '', text: result.stdout || '' };
      }

      return {
        html: (scraped.html as string) || '',
        text: (scraped.text as string) || '',
        screenshot: scraped.screenshot as string | undefined,
        pdf: scraped.pdf as string | undefined,
        extractedData: scraped.extracted_data ?? scraped.data,
        metadata: {
          url: options.url,
          title: (scraped.title as string) || '',
          timestamp: new Date(),
        },
      };
    } finally {
      try {
        await this.destroySandbox(created.id);
      } catch (error) {
        console.error('Failed to cleanup sandbox:', error);
      }
    }
  }

  private generateScrapingCode(options: ScraperOptions): string {
    return `
import requests
from bs4 import BeautifulSoup
import json

try:
    response = requests.get("${options.url}", timeout=${(options.timeout || 30000) / 1000})
    response.raise_for_status()

    html = response.text
    soup = BeautifulSoup(html, 'html.parser')

    text = soup.get_text(separator='\\n', strip=True)
    title = soup.title.string if soup.title else ''

    links = [a.get('href') for a in soup.find_all('a', href=True)][:10]
    headings = [h.get_text(strip=True) for h in soup.find_all(['h1', 'h2', 'h3'])][:10]

    result = {
        "html": html,
        "text": text[:10000],
        "title": title,
        "extracted_data": {
            "title": title,
            "headings": headings,
            "links": links,
            "meta_description": soup.find('meta', attrs={'name': 'description'})['content'] if soup.find('meta', attrs={'name': 'description'}) else ''
        }
    }

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e), "html": "", "text": ""}))
`;
  }

  /**
   * Quick execution helper — creates a sandbox, executes code, and cleans up.
   */
  async quickExecute(
    language: SandboxConfig['language'],
    code: string,
    options?: {
      environment?: Record<string, string>;
      packages?: string[];
      timeout?: number;
    }
  ): Promise<ExecutionResult> {
    const created = await this.createSandbox({
      language,
      environment: options?.environment,
      packages: options?.packages,
      timeout: options?.timeout,
    });

    try {
      return await this.executeSandbox(created.id, {
        code,
        language,
        timeout: options?.timeout,
        environment: options?.environment,
      });
    } finally {
      await this.destroySandbox(created.id);
    }
  }
}
