import {
  SandboxProvider,
  SandboxConfig,
  Sandbox,
  ExecutionOptions,
  ExecutionResult,
  SandboxMetrics,
  ScraperOptions,
  ScrapedData,
} from '../types';

/**
 * Mock Sandbox Provider for Development & Testing
 *
 * This provider simulates PandaStack behavior without making actual API calls.
 * Useful for:
 * - Local development without API keys
 * - Testing workflow logic
 * - CI/CD pipeline tests
 */
export class MockSandboxProvider implements SandboxProvider {
  readonly name = 'mock';
  private sandboxes: Map<string, Sandbox> = new Map();

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const sandbox: Sandbox = {
      id,
      status: 'ready',
      language: config.language,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };

    this.sandboxes.set(id, sandbox);

    // Simulate creation delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return sandbox;
  }

  async executeSandbox(
    sandboxId: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const sandbox = this.sandboxes.get(sandboxId);

    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Mock different outputs based on code content
    const code = options.code.toLowerCase();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    if (code.includes('error') || code.includes('throw')) {
      stderr = 'Mock Error: Simulated error in code execution';
      exitCode = 1;
    } else if (code.includes('print') || code.includes('console.log')) {
      stdout = 'Mock Output: Code executed successfully\n';
      stdout += `Language: ${sandbox.language}\n`;
      stdout += `Timestamp: ${new Date().toISOString()}\n`;
    } else {
      stdout = JSON.stringify({
        message: 'Mock execution completed',
        language: sandbox.language,
        codeLength: options.code.length,
        timestamp: new Date().toISOString(),
      }, null, 2);
    }

    return {
      stdout,
      stderr,
      exitCode,
      executionTime: 150 + Math.random() * 100, // 150-250ms
      memoryUsed: 128 + Math.random() * 256, // 128-384MB
    };
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    this.sandboxes.delete(sandboxId);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async getMetrics(sandboxId: string): Promise<SandboxMetrics> {
    const sandbox = this.sandboxes.get(sandboxId);

    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    return {
      executionTime: 200,
      memoryUsed: 256,
      cpuUsed: 0.5,
      networkRequests: 0,
      costUSD: 0.0001,
    };
  }

  async scrapeWebsite(options: ScraperOptions): Promise<ScrapedData> {
    // Simulate scraping delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      html: '<html><body><h1>Mock Scraped Page</h1><p>This is mock content.</p></body></html>',
      text: 'Mock Scraped Page\n\nThis is mock content.',
      extractedData: {
        title: 'Mock Scraped Page',
        description: 'This is mock content.',
        mockField: 'Mock value from ' + options.url,
      },
      metadata: {
        url: options.url,
        title: 'Mock Scraped Page',
        timestamp: new Date(),
      },
    };
  }
}
