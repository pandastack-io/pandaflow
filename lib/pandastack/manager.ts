import { SandboxProvider, ExecutionOptions, ExecutionResult, ScraperOptions, ScrapedData } from './types';
import { PandaStackClient } from './client';
import { MockSandboxProvider } from './providers/mock';

type ProviderType = 'pandastack' | 'mock' | 'auto';

interface SandboxManagerConfig {
  provider?: ProviderType;
  pandastackApiKey?: string;
  fallbackToMock?: boolean;
}

/**
 * Sandbox Manager
 *
 * Manages multiple sandbox providers with automatic fallback.
 * Intelligently selects the best provider based on availability and configuration.
 */
export class SandboxManager {
  private providers: Map<string, SandboxProvider>;
  private activeProvider: string;
  private fallbackToMock: boolean;

  constructor(config: SandboxManagerConfig = {}) {
    this.providers = new Map();
    this.fallbackToMock = config.fallbackToMock ?? true;

    // Initialize providers based on configuration
    const providerType = config.provider || 'auto';

    // Always add mock provider for development
    this.providers.set('mock', new MockSandboxProvider());

    // Add PandaStack provider if API key is available (and not a mock key)
    const apiKey = config.pandastackApiKey || process.env.PANDASTACK_API_KEY;
    if (apiKey && apiKey !== 'mock-api-key' && !apiKey.startsWith('mock-')) {
      try {
        this.providers.set('pandastack', new PandaStackClient({ apiKey }));
      } catch (error) {
        console.warn('Failed to initialize PandaStack provider:', error);
      }
    }

    // Select active provider
    if (providerType === 'auto') {
      // Use PandaStack if available, otherwise mock
      this.activeProvider = this.providers.has('pandastack') ? 'pandastack' : 'mock';
    } else if (providerType === 'mock') {
      this.activeProvider = 'mock';
    } else if (providerType === 'pandastack') {
      if (!this.providers.has('pandastack')) {
        throw new Error('PandaStack provider requested but API key not configured');
      }
      this.activeProvider = 'pandastack';
    } else {
      this.activeProvider = 'mock';
    }

    console.log(`[SandboxManager] Using provider: ${this.activeProvider}`);
  }

  /**
   * Get the current active provider
   */
  getProvider(): SandboxProvider {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`Provider ${this.activeProvider} not found`);
    }
    return provider;
  }

  /**
   * Execute code with automatic fallback
   */
  async executeCode(
    language: 'python' | 'nodejs' | 'go' | 'rust' | 'bash',
    code: string,
    options?: {
      environment?: Record<string, string>;
      packages?: string[];
      timeout?: number;
    }
  ): Promise<ExecutionResult> {
    try {
      const provider = this.getProvider();

      // Create sandbox
      const sandbox = await provider.createSandbox({
        language,
        environment: options?.environment,
        packages: options?.packages,
        timeout: options?.timeout,
      });

      try {
        // Execute code
        const result = await provider.executeSandbox(sandbox.id, {
          code,
          timeout: options?.timeout,
          environment: options?.environment,
        });

        return result;
      } finally {
        // Cleanup
        try {
          await provider.destroySandbox(sandbox.id);
        } catch (error) {
          console.error('Failed to cleanup sandbox:', error);
        }
      }
    } catch (error) {
      // Fallback to mock if enabled
      if (this.fallbackToMock && this.activeProvider !== 'mock') {
        console.warn('Primary provider failed, falling back to mock:', error);
        const mockProvider = this.providers.get('mock')!;

        const sandbox = await mockProvider.createSandbox({
          language,
          environment: options?.environment,
          packages: options?.packages,
          timeout: options?.timeout,
        });

        try {
          return await mockProvider.executeSandbox(sandbox.id, {
            code,
            timeout: options?.timeout,
            environment: options?.environment,
          });
        } finally {
          await mockProvider.destroySandbox(sandbox.id);
        }
      }

      throw error;
    }
  }

  /**
   * Scrape website with automatic fallback
   */
  async scrapeWebsite(options: ScraperOptions): Promise<ScrapedData> {
    try {
      const provider = this.getProvider();

      if (!provider.scrapeWebsite) {
        throw new Error('Scraping not supported by current provider');
      }

      return await provider.scrapeWebsite(options);
    } catch (error) {
      // Fallback to mock if enabled
      if (this.fallbackToMock && this.activeProvider !== 'mock') {
        console.warn('Primary provider failed, falling back to mock:', error);
        const mockProvider = this.providers.get('mock')!;

        if (mockProvider.scrapeWebsite) {
          return await mockProvider.scrapeWebsite(options);
        }
      }

      throw error;
    }
  }

  /**
   * Switch active provider
   */
  switchProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not available`);
    }
    this.activeProvider = providerName;
    console.log(`[SandboxManager] Switched to provider: ${providerName}`);
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is available
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }
}

// Singleton instance
let managerInstance: SandboxManager | null = null;

export function getSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  if (!managerInstance) {
    managerInstance = new SandboxManager(config);
  }
  return managerInstance;
}

// Export convenience function
export async function executeCode(
  language: 'python' | 'nodejs' | 'go' | 'rust' | 'bash',
  code: string,
  options?: {
    environment?: Record<string, string>;
    packages?: string[];
    timeout?: number;
  }
): Promise<ExecutionResult> {
  const manager = getSandboxManager();
  return manager.executeCode(language, code, options);
}

export async function scrapeWebsite(options: ScraperOptions): Promise<ScrapedData> {
  const manager = getSandboxManager();
  return manager.scrapeWebsite(options);
}
