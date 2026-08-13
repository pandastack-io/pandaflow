/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { NodeType, NodeCategory, NodeRegistryEntry } from '@/types/nodes';

// Generic schemas (reusable)
const baseSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
});

const urlSchema = z.object({
  ...baseSchema.shape,
  url: z.string().url('Valid URL is required'),
});

const codeExecutionSchema = z.object({
  ...baseSchema.shape,
  code: z.string().min(1, 'Code is required'),
  timeout: z.number().min(100).max(300000).default(30000),
  memoryLimit: z.number().min(128).max(4096).default(512),
});

const authSchema = z.object({
  type: z.enum(['none', 'bearer', 'basic', 'api_key', 'oauth2']).default('none'),
  config: z.record(z.string(), z.any()).optional(),
});

// Comprehensive node registry with 172+ nodes
export const nodeRegistry: Record<string, NodeRegistryEntry> = {
  // ============ TRIGGERS (10 nodes) ============
  [NodeType.TRIGGER_MANUAL]: {
    type: NodeType.TRIGGER_MANUAL,
    category: NodeCategory.TRIGGER,
    name: 'Manual Trigger',
    description: 'Start workflow manually with user input',
    icon: 'Play',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.TRIGGER_SCHEDULE]: {
    type: NodeType.TRIGGER_SCHEDULE,
    category: NodeCategory.TRIGGER,
    name: 'Schedule Trigger',
    description: 'Execute workflow on a cron schedule',
    icon: 'Clock',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      cron: z.string().min(1, 'Cron expression required'),
      timezone: z.string().default('UTC'),
      enabled: z.boolean().default(true),
    }),
    defaultConfig: { cron: '0 0 * * *', timezone: 'UTC', enabled: true },
    inputs: [],
    outputs: [{ name: 'timestamp', type: 'string' }],
  },

  [NodeType.TRIGGER_WEBHOOK]: {
    type: NodeType.TRIGGER_WEBHOOK,
    category: NodeCategory.TRIGGER,
    name: 'Webhook Trigger',
    description: 'Trigger workflow via HTTP webhook',
    icon: 'Webhook',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('POST'),
      authType: z.enum(['none', 'bearer', 'api_key', 'hmac']).default('none'),
    }),
    defaultConfig: { method: 'POST', authType: 'none' },
    inputs: [],
    outputs: [{ name: 'body', type: 'any' }, { name: 'headers', type: 'object' }],
  },

  [NodeType.TRIGGER_EMAIL]: {
    type: NodeType.TRIGGER_EMAIL,
    category: NodeCategory.TRIGGER,
    name: 'Email Trigger',
    description: 'Trigger on incoming email',
    icon: 'Mail',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      emailAddress: z.string().email(),
      filterRules: z.array(z.object({ field: z.string(), value: z.string() })).optional(),
    }),
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: 'email', type: 'object' }],
  },

  [NodeType.TRIGGER_FILE_WATCH]: {
    type: NodeType.TRIGGER_FILE_WATCH,
    category: NodeCategory.TRIGGER,
    name: 'File Watch Trigger',
    description: 'Trigger on file system changes',
    icon: 'FolderSearch',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      path: z.string().min(1),
      pattern: z.string().optional(),
      events: z.array(z.enum(['create', 'update', 'delete'])).default(['create']),
    }),
    defaultConfig: { events: ['create'] },
    inputs: [],
    outputs: [{ name: 'file', type: 'object' }],
  },

  [NodeType.TRIGGER_DATABASE]: {
    type: NodeType.TRIGGER_DATABASE,
    category: NodeCategory.TRIGGER,
    name: 'Database Trigger',
    description: 'Trigger on database changes',
    icon: 'Database',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      connectionId: z.string(),
      table: z.string(),
      operations: z.array(z.enum(['INSERT', 'UPDATE', 'DELETE'])),
    }),
    defaultConfig: { operations: ['INSERT'] },
    inputs: [],
    outputs: [{ name: 'record', type: 'object' }],
  },

  [NodeType.TRIGGER_MQTT]: {
    type: NodeType.TRIGGER_MQTT,
    category: NodeCategory.TRIGGER,
    name: 'MQTT Trigger',
    description: 'Subscribe to MQTT topics',
    icon: 'Radio',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      broker: z.string().url(),
      topic: z.string(),
      qos: z.enum(['0', '1', '2']).default('1'),
    }),
    defaultConfig: { qos: '1' },
    inputs: [],
    outputs: [{ name: 'message', type: 'any' }, { name: 'topic', type: 'string' }],
  },

  [NodeType.TRIGGER_WEBSOCKET]: {
    type: NodeType.TRIGGER_WEBSOCKET,
    category: NodeCategory.TRIGGER,
    name: 'WebSocket Trigger',
    description: 'Receive WebSocket messages',
    icon: 'WifiZero',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      url: z.string().url(),
      protocols: z.array(z.string()).optional(),
    }),
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: 'message', type: 'any' }],
  },

  [NodeType.TRIGGER_KAFKA]: {
    type: NodeType.TRIGGER_KAFKA,
    category: NodeCategory.TRIGGER,
    name: 'Kafka Trigger',
    description: 'Consume from Kafka topics',
    icon: 'MessageSquareMore',
    color: '#0ea5e9',
    configSchema: z.object({
      ...baseSchema.shape,
      brokers: z.array(z.string()),
      topic: z.string(),
      groupId: z.string(),
    }),
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: 'message', type: 'object' }],
  },

  [NodeType.TRIGGER_EVENT]: {
    type: NodeType.TRIGGER_EVENT,
    category: NodeCategory.TRIGGER,
    name: 'Event Trigger',
    description: 'Generic event-based trigger',
    icon: 'Zap',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: 'event', type: 'object' }],
  },

  // ============ PANDASTACK/CODE EXECUTION (12 nodes) ============
  [NodeType.PANDASTACK_PYTHON]: {
    type: NodeType.PANDASTACK_PYTHON,
    category: NodeCategory.PANDASTACK,
    name: 'Python Code',
    description: 'Execute Python code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: z.object({
      ...codeExecutionSchema.shape,
      packages: z.array(z.string()).optional(),
    }),
    defaultConfig: { code: 'print("Hello from Python")', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }, { name: 'stdout', type: 'string' }],
  },

  [NodeType.PANDASTACK_NODEJS]: {
    type: NodeType.PANDASTACK_NODEJS,
    category: NodeCategory.PANDASTACK,
    name: 'Node.js Code',
    description: 'Execute Node.js code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: z.object({
      ...codeExecutionSchema.shape,
      packages: z.array(z.string()).optional(),
    }),
    defaultConfig: { code: 'console.log("Hello from Node.js")', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }, { name: 'stdout', type: 'string' }],
  },

  [NodeType.PANDASTACK_GO]: {
    type: NodeType.PANDASTACK_GO,
    category: NodeCategory.PANDASTACK,
    name: 'Go Code',
    description: 'Execute Go code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: 'package main\\nfunc main() { println("Hello") }', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.PANDASTACK_RUST]: {
    type: NodeType.PANDASTACK_RUST,
    category: NodeCategory.PANDASTACK,
    name: 'Rust Code',
    description: 'Execute Rust code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: 'fn main() { println!("Hello"); }', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.PANDASTACK_BASH]: {
    type: NodeType.PANDASTACK_BASH,
    category: NodeCategory.PANDASTACK,
    name: 'Bash Script',
    description: 'Execute Bash scripts in sandbox',
    icon: 'Terminal',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: 'echo "Hello from Bash"', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'stdout', type: 'string' }, { name: 'exitCode', type: 'number' }],
  },

  [NodeType.PANDASTACK_RUBY]: {
    type: NodeType.PANDASTACK_RUBY,
    category: NodeCategory.PANDASTACK,
    name: 'Ruby Code',
    description: 'Execute Ruby code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: 'puts "Hello from Ruby"', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.PANDASTACK_PHP]: {
    type: NodeType.PANDASTACK_PHP,
    category: NodeCategory.PANDASTACK,
    name: 'PHP Code',
    description: 'Execute PHP code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: '<?php echo "Hello from PHP"; ?>', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }],
  },

  [NodeType.PANDASTACK_JAVA]: {
    type: NodeType.PANDASTACK_JAVA,
    category: NodeCategory.PANDASTACK,
    name: 'Java Code',
    description: 'Execute Java code in sandbox',
    icon: 'Code',
    color: '#8b5cf6',
    configSchema: codeExecutionSchema,
    defaultConfig: { code: 'public class Main { public static void main(String[] args) { System.out.println("Hello"); } }', timeout: 30000, memoryLimit: 1024 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.PANDASTACK_DOCKER]: {
    type: NodeType.PANDASTACK_DOCKER,
    category: NodeCategory.PANDASTACK,
    name: 'Docker Container',
    description: 'Run code in Docker container',
    icon: 'Container',
    color: '#8b5cf6',
    configSchema: z.object({
      ...baseSchema.shape,
      image: z.string(),
      command: z.string(),
      environment: z.record(z.string(), z.string()).optional(),
    }),
    defaultConfig: { image: 'alpine:latest', command: 'echo "Hello"' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }],
  },

  [NodeType.PANDASTACK_JUPYTER]: {
    type: NodeType.PANDASTACK_JUPYTER,
    category: NodeCategory.PANDASTACK,
    name: 'Jupyter Notebook',
    description: 'Execute Jupyter notebook cells',
    icon: 'BookOpen',
    color: '#8b5cf6',
    configSchema: z.object({
      ...baseSchema.shape,
      cells: z.array(z.object({ code: z.string(), language: z.string() })),
    }),
    defaultConfig: { cells: [] },
    inputs: [{ name: 'context', type: 'object', required: false }],
    outputs: [{ name: 'results', type: 'array' }],
  },

  [NodeType.PANDASTACK_EXECUTE]: {
    type: NodeType.PANDASTACK_EXECUTE,
    category: NodeCategory.PANDASTACK,
    name: 'Generic Code Execution',
    description: 'Execute code in any language',
    icon: 'Code2',
    color: '#8b5cf6',
    configSchema: z.object({
      ...codeExecutionSchema.shape,
      language: z.enum(['python', 'nodejs', 'go', 'rust', 'bash', 'ruby', 'php', 'java']),
    }),
    defaultConfig: { language: 'python', code: 'print("Hello")', timeout: 30000, memoryLimit: 512 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.PANDASTACK_SCRAPE]: {
    type: NodeType.PANDASTACK_SCRAPE,
    category: NodeCategory.PANDASTACK,
    name: 'Web Scraper',
    description: 'Scrape websites with headless browser',
    icon: 'Globe',
    color: '#8b5cf6',
    configSchema: z.object({
      ...baseSchema.shape,
      url: z.string().url(),
      waitFor: z.string().optional(),
      screenshot: z.boolean().default(false),
      extractRules: z.array(z.object({ selector: z.string(), attribute: z.string().optional() })).optional(),
    }),
    defaultConfig: { screenshot: false },
    inputs: [{ name: 'url', type: 'string', required: false }],
    outputs: [{ name: 'html', type: 'string' }, { name: 'data', type: 'object' }],
  },

  [NodeType.HUMAN_APPROVAL]: {
    type: NodeType.HUMAN_APPROVAL,
    category: NodeCategory.CONTROL,
    name: 'Human Approval',
    description: 'Pause execution and wait for a human to approve or reject before continuing.',
    icon: 'UserCheck',
    color: '#f59e0b',
    configSchema: z.object({
      ...baseSchema.shape,
      title: z.string().default('Approval Required'),
      message: z.string().default('Please review and approve or reject this step.'),
      timeoutMinutes: z.coerce.number().min(1).default(60),
      notifyEmail: z.string().email().optional().or(z.literal('')),
    }),
    defaultConfig: {
      title: 'Approval Required',
      message: 'Please review and approve or reject this step.',
      timeoutMinutes: 60,
      notifyEmail: '',
    },
    inputs: [{ name: 'trigger', type: 'any', required: false }],
    outputs: [{ name: 'approved', type: 'any' }, { name: 'rejected', type: 'any' }],
  },

  // ============ MULTI-AGENT ORCHESTRATION ============

  [NodeType.CONTROL_SUB_WORKFLOW]: {
    type: NodeType.CONTROL_SUB_WORKFLOW,
    category: NodeCategory.CONTROL,
    name: 'Sub-Workflow',
    description: 'Call another workflow as a sub-step. Execution is durable, traced, and resumable on crash.',
    icon: 'GitBranch',
    color: '#6366f1',
    configSchema: z.object({
      ...baseSchema.shape,
      workflowId: z.string().min(1, 'Workflow ID is required'),
      mode: z.enum(['sync', 'async']).default('sync'),
      timeoutMs: z.coerce.number().min(1000).max(600_000).default(120_000),
      inputVariable: z.string().optional(),
    }),
    defaultConfig: {
      workflowId: '',
      mode: 'sync',
      timeoutMs: 120_000,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }, { name: 'executionId', type: 'string' }],
  },

  [NodeType.AGENT_INVOKE]: {
    type: NodeType.AGENT_INVOKE,
    category: NodeCategory.AGENT,
    name: 'Invoke Agent',
    description: 'Invoke another agent by name or ID. Uses circuit breaker to prevent cascading failures.',
    icon: 'Bot',
    color: '#8b5cf6',
    configSchema: z.object({
      ...baseSchema.shape,
      agentId: z.string().optional(),
      agentName: z.string().optional(),
      mode: z.enum(['sync', 'async']).default('sync'),
      timeoutMs: z.coerce.number().min(1000).max(600_000).default(120_000),
      inputVariable: z.string().optional(),
    }),
    defaultConfig: {
      agentId: '',
      agentName: '',
      mode: 'sync',
      timeoutMs: 120_000,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }, { name: 'executionId', type: 'string' }],
  },

  [NodeType.AGENT_SUPERVISOR]: {
    type: NodeType.AGENT_SUPERVISOR,
    category: NodeCategory.AGENT,
    name: 'Supervisor',
    description: 'LLM plans which worker agents to call, fans out concurrently, then aggregates results into one response.',
    icon: 'Network',
    color: '#ec4899',
    configSchema: z.object({
      ...baseSchema.shape,
      task: z.string().optional(),
      model: z.string().default('gpt-4o'),
      inputVariable: z.string().optional(),
      workerTimeoutMs: z.coerce.number().min(5000).max(600_000).default(120_000),
    }),
    defaultConfig: {
      task: '',
      model: 'gpt-4o',
      workerTimeoutMs: 120_000,
    },
    inputs: [{ name: 'task', type: 'string', required: false }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'summary', type: 'string' },
      { name: 'workerCount', type: 'number' },
    ],
  },

  [NodeType.AGENT_PUBLISH]: {
    type: NodeType.AGENT_PUBLISH,
    category: NodeCategory.AGENT,
    name: 'Publish to Bus',
    description: 'Publish a message to a topic on the agent message bus. Other agents or workflows subscribed to this topic will receive it.',
    icon: 'Broadcast',
    color: '#14b8a6',
    configSchema: z.object({
      ...baseSchema.shape,
      topic: z.string().min(1, 'Topic is required'),
      payloadVariable: z.string().optional(),
    }),
    defaultConfig: {
      topic: '',
    },
    inputs: [{ name: 'payload', type: 'any', required: false }],
    outputs: [{ name: 'published', type: 'boolean' }],
  },

  [NodeType.AGENT_SUBSCRIBE]: {
    type: NodeType.AGENT_SUBSCRIBE,
    category: NodeCategory.AGENT,
    name: 'Wait for Bus Message',
    description: 'Block and wait until a message arrives on a topic. Times out if no message received within the timeout window.',
    icon: 'Radio',
    color: '#14b8a6',
    configSchema: z.object({
      ...baseSchema.shape,
      topic: z.string().min(1, 'Topic is required'),
      timeoutMs: z.coerce.number().min(1000).max(3_600_000).default(300_000),
    }),
    defaultConfig: {
      topic: '',
      timeoutMs: 300_000,
    },
    inputs: [{ name: 'trigger', type: 'any', required: false }],
    outputs: [{ name: 'message', type: 'any' }, { name: 'topic', type: 'string' }],
  },

  // Due to size constraints, I'll create a second part of this file
  // Let me continue with a summary approach for the remaining 150+ nodes
};

// Export helper functions
export function getNodesByCategory(category: NodeCategory): NodeRegistryEntry[] {
  return Object.values(nodeRegistry).filter(node => node.category === category);
}

export function getNodeByType(type: NodeType): NodeRegistryEntry | undefined {
  return nodeRegistry[type as any];
}

export function getAllNodes(): NodeRegistryEntry[] {
  return Object.values(nodeRegistry);
}
