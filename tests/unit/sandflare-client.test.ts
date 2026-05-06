import { describe, it, expect, beforeEach } from 'vitest';
import { MockSandboxProvider } from '@/lib/sandflare/providers/mock';
import { SandboxManager } from '@/lib/sandflare/manager';

describe('Sandflare Mock Provider', () => {
  let provider: MockSandboxProvider;

  beforeEach(() => {
    provider = new MockSandboxProvider();
  });

  describe('createSandbox', () => {
    it('should create a sandbox', async () => {
      const sandbox = await provider.createSandbox({
        language: 'python',
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^mock-/);
      expect(sandbox.language).toBe('python');
      expect(sandbox.status).toBe('ready');
      expect(sandbox.createdAt).toBeInstanceOf(Date);
    });

    it('should create sandbox with different languages', async () => {
      const languages = ['python', 'nodejs', 'go', 'rust', 'bash'] as const;

      for (const language of languages) {
        const sandbox = await provider.createSandbox({ language });
        expect(sandbox.language).toBe(language);
      }
    });
  });

  describe('executeSandbox', () => {
    it('should execute code successfully', async () => {
      const sandbox = await provider.createSandbox({ language: 'python' });

      const result = await provider.executeSandbox(sandbox.id, {
        code: 'print("hello world")',
      });

      expect(result).toBeDefined();
      expect(result.stdout).toContain('Mock');
      expect(result.exitCode).toBe(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should simulate errors', async () => {
      const sandbox = await provider.createSandbox({ language: 'python' });

      const result = await provider.executeSandbox(sandbox.id, {
        code: 'raise Exception("error")',
      });

      expect(result.stderr).toBeTruthy();
      expect(result.exitCode).toBe(1);
    });

    it('should fail for non-existent sandbox', async () => {
      await expect(
        provider.executeSandbox('invalid-id', { code: 'print("test")' })
      ).rejects.toThrow();
    });
  });

  describe('destroySandbox', () => {
    it('should destroy existing sandbox', async () => {
      const sandbox = await provider.createSandbox({ language: 'python' });

      await provider.destroySandbox(sandbox.id);

      // Subsequent execution should fail
      await expect(
        provider.executeSandbox(sandbox.id, { code: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for sandbox', async () => {
      const sandbox = await provider.createSandbox({ language: 'python' });

      const metrics = await provider.getMetrics(sandbox.id);

      expect(metrics).toBeDefined();
      expect(metrics.executionTime).toBeGreaterThan(0);
      expect(metrics.memoryUsed).toBeGreaterThan(0);
      expect(metrics.costUSD).toBeGreaterThan(0);
    });
  });

  describe('scrapeWebsite', () => {
    it('should scrape website', async () => {
      const result = await provider.scrapeWebsite({
        url: 'https://example.com',
      });

      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.url).toBe('https://example.com');
    });

    it('should return extracted data', async () => {
      const result = await provider.scrapeWebsite({
        url: 'https://example.com',
      });

      expect(result.extractedData).toBeDefined();
    });
  });
});

describe('SandboxManager', () => {
  let manager: SandboxManager;

  beforeEach(() => {
    manager = new SandboxManager({ provider: 'mock' });
  });

  describe('initialization', () => {
    it('should initialize with mock provider', () => {
      expect(manager).toBeDefined();
      expect(manager.getAvailableProviders()).toContain('mock');
    });

    it('should use mock provider by default', () => {
      const provider = manager.getProvider();
      expect(provider.name).toBe('mock');
    });
  });

  describe('executeCode', () => {
    it('should execute Python code', async () => {
      const result = await manager.executeCode('python', 'print("hello")');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it('should execute code with environment variables', async () => {
      const result = await manager.executeCode('python', 'import os', {
        environment: { TEST_VAR: 'test' },
      });

      expect(result).toBeDefined();
    });

    it('should handle execution errors', async () => {
      const result = await manager.executeCode('python', 'raise Error()');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBeTruthy();
    });
  });

  describe('scrapeWebsite', () => {
    it('should scrape website', async () => {
      const result = await manager.scrapeWebsite({
        url: 'https://example.com',
      });

      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
    });

    it('should scrape with JavaScript enabled', async () => {
      const result = await manager.scrapeWebsite({
        url: 'https://example.com',
        javascript: true,
      });

      expect(result).toBeDefined();
    });
  });

  describe('provider management', () => {
    it('should list available providers', () => {
      const providers = manager.getAvailableProviders();

      expect(providers).toContain('mock');
    });

    it('should check if provider exists', () => {
      expect(manager.hasProvider('mock')).toBe(true);
      expect(manager.hasProvider('invalid')).toBe(false);
    });

    it('should switch providers', () => {
      manager.switchProvider('mock');
      expect(manager.getProvider().name).toBe('mock');
    });
  });
});
