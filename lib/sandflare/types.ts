// Sandflare Types

export interface SandboxConfig {
  language: 'python' | 'nodejs' | 'go' | 'rust' | 'bash';
  environment?: Record<string, string>;
  packages?: string[];
  timeout?: number;
  memoryLimit?: number;
  template?: string;
  size?: 'nano' | 'small' | 'medium' | 'large' | 'xlarge';
}

export interface Sandbox {
  id: string;
  status: 'creating' | 'ready' | 'running' | 'stopped' | 'failed';
  language: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ExecutionOptions {
  code: string;
  /** Explicit language — used to pick the correct API endpoint. */
  language?: 'python' | 'nodejs' | 'go' | 'rust' | 'bash' | 'ruby' | 'php' | 'java' | 'docker' | 'jupyter';
  stdin?: string;
  timeout?: number;
  environment?: Record<string, string>;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  memoryUsed?: number;
  error?: string;
}

export interface SandboxMetrics {
  executionTime: number;
  memoryUsed: number;
  cpuUsed?: number;
  networkRequests?: number;
  costUSD?: number;
}

export interface ScraperOptions {
  url: string;
  javascript?: boolean;
  waitFor?: string;
  timeout?: number;
  screenshot?: boolean;
  pdf?: boolean;
  extractionRules?: any;
}

export interface ScrapedData {
  html?: string;
  text?: string;
  screenshot?: string; // base64 or URL
  pdf?: string; // base64 or URL
  extractedData?: any;
  metadata?: {
    url: string;
    title?: string;
    timestamp: Date;
  };
}

// Abstract sandbox provider interface
export interface SandboxProvider {
  name: string;
  createSandbox(config: SandboxConfig): Promise<Sandbox>;
  executeSandbox(sandboxId: string, options: ExecutionOptions): Promise<ExecutionResult>;
  destroySandbox(sandboxId: string): Promise<void>;
  getMetrics(sandboxId: string): Promise<SandboxMetrics>;
  scrapeWebsite?(options: ScraperOptions): Promise<ScrapedData>;
}
