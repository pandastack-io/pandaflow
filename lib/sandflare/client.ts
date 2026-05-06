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

interface SandflareConfig {
  apiKey: string;
  baseUrl?: string;
}

interface SandflareAPIResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Sandflare.io API Client
 *
 * Official API documentation: https://docs.sandflare.io
 * Base URL: https://api.sandflare.io
 */
export class SandflareClient implements SandboxProvider {
  readonly name = 'sandflare';
  private apiKey: string;
  private baseUrl: string;

  constructor(config: SandflareConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || process.env.SANDFLARE_BASE_URL || 'https://api.sandflare.io';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      console.error(`Sandflare API error (${endpoint}):`, error);
      throw error;
    }
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const response = await this.request<any>('/sandboxes', {
      method: 'POST',
      body: JSON.stringify({
        label: config.language || 'sandbox',
        template_id: config.template || 'code-interpreter',
        size: config.size || 'nano',
        ttl_hours: config.timeout ? Math.ceil(config.timeout / 3600000) : 2,
        env_vars: config.environment || {},
      }),
    });

    return {
      id: response.sandbox_id || response.name,
      status: response.status === 'ready' ? 'running' : 'creating',
      language: config.language,
      createdAt: new Date(response.created_at || Date.now()),
      expiresAt: response.expires_at ? new Date(response.expires_at) : undefined,
    };
  }

  async executeSandbox(sandboxId: string, options: ExecutionOptions): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Route to the correct endpoint based on explicit language.
    // Fall back to /exec (shell) for any unrecognised or shell-based language.
    const lang = options.language;
    let endpoint: string;
    let body: Record<string, string>;

    if (lang === 'python' || lang === 'jupyter') {
      endpoint = `/sandboxes/${sandboxId}/run/python`;
      body = { code: options.code };
    } else if (lang === 'nodejs') {
      endpoint = `/sandboxes/${sandboxId}/run/node`;
      body = { code: options.code };
    } else {
      // bash, go, rust, ruby, php, java, docker, or unspecified → exec
      endpoint = `/sandboxes/${sandboxId}/exec`;
      body = { cmd: options.code || 'echo "No command provided"' };
    }

    try {
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const executionTime = Date.now() - startTime;

      return {
        stdout: response.stdout || '',
        stderr: response.stderr || '',
        exitCode: response.exit_code !== undefined ? response.exit_code : 0,
        executionTime,
        memoryUsed: 0,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        executionTime,
        memoryUsed: 0,
      };
    }
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    await this.request(`/sandboxes/${sandboxId}`, {
      method: 'DELETE',
    });
  }

  async getMetrics(sandboxId: string): Promise<SandboxMetrics> {
    const response = await this.request<any>(`/sandboxes/${sandboxId}/metrics`);

    return {
      executionTime: 0,
      memoryUsed: response.mem_used || 0,
      cpuUsed: response.cpu_used_pct,
      networkRequests: 0,
      costUSD: 0,
    };
  }

  async scrapeWebsite(options: ScraperOptions): Promise<ScrapedData> {
    // Sandflare doesn't have a dedicated scraping endpoint
    // We need to create a sandbox and run scraping code
    const sandbox = await this.createSandbox({
      language: 'python',
      template: 'code-interpreter',
      timeout: options.timeout || 30000,
    });

    try {
      // Generate Python scraping code
      const scrapingCode = this.generateScrapingCode(options);

      // Execute the scraping code
      const result = await this.request<any>(`/sandboxes/${sandbox.id}/run/python`, {
        method: 'POST',
        body: JSON.stringify({ code: scrapingCode }),
      });

      // Parse the output (it will be JSON from the Python script)
      let scrapedData;
      try {
        scrapedData = JSON.parse(result.stdout || '{}');
      } catch {
        scrapedData = {
          html: result.stdout || '',
          text: result.stdout || '',
        };
      }

      return {
        html: scrapedData.html || '',
        text: scrapedData.text || '',
        screenshot: scrapedData.screenshot,
        pdf: scrapedData.pdf,
        extractedData: scrapedData.extracted_data || scrapedData.data,
        metadata: {
          url: options.url,
          title: scrapedData.title || '',
          timestamp: new Date(),
        },
      };
    } finally {
      // Clean up sandbox
      try {
        await this.destroySandbox(sandbox.id);
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
    # Fetch the webpage
    response = requests.get("${options.url}", timeout=${(options.timeout || 30000) / 1000})
    response.raise_for_status()

    html = response.text
    soup = BeautifulSoup(html, 'html.parser')

    # Extract text content
    text = soup.get_text(separator='\\n', strip=True)

    # Extract title
    title = soup.title.string if soup.title else ''

    # Extract some useful data
    links = [a.get('href') for a in soup.find_all('a', href=True)][:10]
    headings = [h.get_text(strip=True) for h in soup.find_all(['h1', 'h2', 'h3'])][:10]

    # Return as JSON
    result = {
        "html": html,
        "text": text[:10000],  # Limit text to 10k chars
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
   * Quick execution helper - creates sandbox, executes code, and cleans up
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
    const sandbox = await this.createSandbox({
      language,
      environment: options?.environment,
      packages: options?.packages,
      timeout: options?.timeout,
    });

    try {
      return await this.executeSandbox(sandbox.id, {
        code,
        timeout: options?.timeout,
        environment: options?.environment,
      });
    } finally {
      await this.destroySandbox(sandbox.id);
    }
  }
}
