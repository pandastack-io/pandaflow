import { z } from 'zod';
import { NodeType, NodeCategory, NodeRegistryEntry } from '@/types/nodes';

const baseSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
});

const agentProviderSchema = z.enum(['openai', 'anthropic', 'google', 'custom']).optional();
const memorySessionSchema = z.string().optional();

const agentLlmSchema = baseSchema.extend({
  provider: agentProviderSchema,
  model: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  streaming: z.boolean().optional(),
  memoryNodeId: z.string().optional(),
});

const agentReactSchema = baseSchema.extend({
  provider: agentProviderSchema,
  model: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  maxIterations: z.number().int().min(1).max(20).optional(),
  verbose: z.boolean().optional(),
});

const agentToolSchema = baseSchema.extend({
  name: z.string().min(1),
  description: z.string().min(1),
  language: z.enum(['python', 'nodejs']).optional(),
  code: z.string().min(1),
  parameters: z.any().optional(),
});

const agentConditionSchema = baseSchema.extend({
  conditionType: z.enum(['llm', 'expression']).optional(),
  prompt: z.string().optional(),
  expression: z.string().optional(),
  provider: agentProviderSchema,
  model: z.string().optional(),
});

const agentLoopSchema = baseSchema.extend({
  maxIterations: z.number().int().min(1).max(100).optional(),
  exitConditionType: z.enum(['expression', 'manual']).optional(),
  conditionExpression: z.string().optional(),
  stepExpression: z.string().optional(),
  aggregateResults: z.boolean().optional(),
});

const agentSupervisorSchema = baseSchema.extend({
  provider: agentProviderSchema,
  model: z.string().optional(),
  routingStrategy: z.enum(['llm', 'first-match']).optional(),
  systemPrompt: z.string().optional(),
  maxRounds: z.number().int().min(1).max(10).optional(),
});

const agentWorkerSchema = baseSchema.extend({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: agentProviderSchema,
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  memoryNodeId: z.string().optional(),
});

const agentPlannerSchema = baseSchema.extend({
  provider: agentProviderSchema,
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxSteps: z.number().int().min(1).max(20).optional(),
  preferJson: z.boolean().optional(),
});

const agentPublishSchema = baseSchema.extend({
  topic: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
  includeContext: z.boolean().optional(),
});

const agentSubscribeSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  topic: z.string().min(1),
  filter: z.string().optional(),
});

const agentCallSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  method: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  args: z.record(z.string(), z.any()).optional(),
});

const memoryBufferSchema = baseSchema.extend({
  sessionKey: memorySessionSchema,
  maxMessages: z.number().int().min(1).max(500).optional(),
});

const memoryRedisSchema = baseSchema.extend({
  sessionKey: memorySessionSchema,
  ttlSeconds: z.number().int().positive().optional(),
  maxMessages: z.number().int().min(1).max(500).optional(),
});

const memoryPostgresSchema = baseSchema.extend({
  sessionKey: memorySessionSchema,
  maxMessages: z.number().int().min(1).max(500).optional(),
  workflowId: z.string().uuid().optional(),
  tableHint: z.string().optional(),
});

const memorySummarySchema = baseSchema.extend({
  provider: agentProviderSchema,
  model: z.string().optional(),
  maxTokensBeforeSummary: z.number().int().positive().optional(),
  keepRecentMessages: z.number().int().min(1).max(50).optional(),
});

const memoryWindowSchema = baseSchema.extend({
  sessionKey: memorySessionSchema,
  windowSize: z.number().int().min(1).max(100).optional(),
});

const memoryAgentReadSchema = baseSchema.extend({
  key: z.string().min(1),
  defaultValue: z.any().optional(),
});

const memoryAgentWriteSchema = baseSchema.extend({
  key: z.string().min(1),
  value: z.any().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const memoryEpisodicGetSchema = baseSchema.extend({
  limit: z.number().int().min(1).max(20).optional(),
});

const ragPdfLoaderSchema = baseSchema.extend({
  source: z.enum(['url', 'variable']).optional(),
  url: z.string().optional(),
  variableName: z.string().optional(),
  inputVariable: z.string().optional(),
  splitPages: z.boolean().optional(),
  extractImages: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
});

const ragWebLoaderSchema = baseSchema.extend({
  url: z.string().optional(),
  selector: z.string().optional(),
  recursive: z.boolean().optional(),
  maxDepth: z.number().int().min(0).max(5).optional(),
  timeout: z.number().int().positive().optional(),
});

const ragTextSplitterSchema = baseSchema.extend({
  strategy: z.enum(['recursive', 'character', 'token', 'markdown']).optional(),
  chunkSize: z.number().int().min(100).max(4000).optional(),
  chunkOverlap: z.number().int().min(0).max(500).optional(),
});

const ragEmbedderSchema = baseSchema.extend({
  provider: z.enum(['openai', 'cohere']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  batchSize: z.number().int().min(1).max(500).optional(),
  timeout: z.number().int().positive().optional(),
});

const ragVectorStoreSchema = baseSchema.extend({
  backend: z.enum(['memory', 'pgvector']).optional(),
  operation: z.enum(['upsert', 'query']).optional(),
  indexName: z.string().min(1).optional(),
  namespace: z.string().optional(),
  provider: z.enum(['openai', 'cohere']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  topK: z.number().int().min(1).max(50).optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
  timeout: z.number().int().positive().optional(),
});

const embeddingOpenAISchema = baseSchema.extend({
  model: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).default('text-embedding-3-small'),
  input: z.string().optional(),
});

const embeddingCohereSchema = baseSchema.extend({
  model: z.enum(['embed-english-v3.0', 'embed-multilingual-v3.0']).default('embed-english-v3.0'),
  inputType: z.enum(['search_document', 'search_query']).default('search_document'),
});

const embeddingHuggingFaceSchema = baseSchema.extend({
  model: z.string().min(1).default('sentence-transformers/all-MiniLM-L6-v2'),
});

const vectorstorePineconeSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query', 'delete']).default('upsert'),
  indexName: z.string().min(1),
  namespace: z.string().optional(),
  topK: z.number().int().min(1).max(100).default(5),
  includeMetadata: z.boolean().default(true),
});

const vectorstoreQdrantSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query', 'delete']).default('upsert'),
  collectionName: z.string().min(1),
  topK: z.number().int().min(1).max(100).default(5),
});

const vectorstoreChromaSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query', 'delete']).default('upsert'),
  collectionName: z.string().min(1),
  topK: z.number().int().min(1).max(100).default(5),
});

const vectorstoreWeaviateSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query']).default('upsert'),
  className: z.string().min(1),
  topK: z.number().int().min(1).max(100).default(5),
});

const vectorstorePgvectorSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query']).default('upsert'),
  tableName: z.string().min(1).default('vector_documents'),
  topK: z.number().int().min(1).max(100).default(5),
});

const vectorstoreRedisSchema = baseSchema.extend({
  operation: z.enum(['upsert', 'query']).default('upsert'),
  keyPrefix: z.string().min(1).default('vec'),
  topK: z.number().int().min(1).max(100).default(5),
});

const ragRetrieverSchema = baseSchema.extend({
  backend: z.enum(['memory', 'pgvector']).optional(),
  strategy: z.enum(['similarity', 'mmr', 'threshold']).optional(),
  indexName: z.string().min(1).optional(),
  namespace: z.string().optional(),
  provider: z.enum(['openai', 'cohere']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
  fetchK: z.number().int().min(1).max(50).optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
  mmrLambda: z.number().min(0).max(1).optional(),
  timeout: z.number().int().positive().optional(),
});

const ragQaChainSchema = baseSchema.extend({
  provider: z.enum(['openai', 'anthropic', 'google', 'cohere', 'mistral']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  systemPrompt: z.string().optional(),
  contextTemplate: z.string().optional(),
  returnSources: z.boolean().optional(),
  maxContextTokens: z.number().int().min(256).max(32000).optional(),
  timeout: z.number().int().positive().optional(),
});

const ragRerankerSchema = baseSchema.extend({
  provider: z.enum(['cohere', 'keyword']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  topN: z.number().int().min(1).max(50).optional(),
  timeout: z.number().int().positive().optional(),
});

const triggerBaseSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

const manualTriggerSchema = triggerBaseSchema.extend({
  inputSchema: z.record(z.string(), z.any()).optional(),
});

const scheduleTriggerSchema = triggerBaseSchema.extend({
  cron: z.string().min(1).optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
});

const webhookTriggerSchema = triggerBaseSchema.extend({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  authType: z.enum(['none', 'bearer', 'api_key', 'hmac']).optional(),
});

const eventTriggerSchema = triggerBaseSchema.extend({
  eventName: z.string().optional(),
  source: z.string().optional(),
  payloadFilters: z.any().optional(),
});

const emailTriggerSchema = triggerBaseSchema.extend({
  emailAddress: z.string().optional(),
  filterRules: z.any().optional(),
});

const fileWatchTriggerSchema = triggerBaseSchema.extend({
  path: z.string().optional(),
  pattern: z.string().optional(),
  events: z.any().optional(),
});

const databaseTriggerSchema = triggerBaseSchema.extend({
  table: z.string().optional(),
  operation: z.string().optional(),
  query: z.string().optional(),
});

const mqttTriggerSchema = triggerBaseSchema.extend({
  topic: z.string().optional(),
  qos: z.union([z.string(), z.number()]).optional(),
  brokerUrl: z.string().optional(),
});

const websocketTriggerSchema = triggerBaseSchema.extend({
  path: z.string().optional(),
  event: z.string().optional(),
});

const kafkaTriggerSchema = triggerBaseSchema.extend({
  topic: z.string().optional(),
  brokers: z.any().optional(),
  consumerGroup: z.string().optional(),
});

const sandflareRuntimeSchema = baseSchema.extend({
  provider: z.enum(['auto', 'sandflare', 'mock']).optional(),
  apiKey: z.string().optional(),
  inputVariable: z.string().optional(),
  code: z.string().optional(),
  command: z.string().optional(),
  stdin: z.string().optional(),
  packages: z.union([z.string(), z.array(z.string())]).optional(),
  environment: z.any().optional(),
  template: z.string().optional(),
  size: z.enum(['nano', 'small', 'medium', 'large', 'xlarge']).optional(),
  timeout: z.number().int().positive().optional(),
  memoryLimit: z.number().int().positive().optional(),
  failOnNonZeroExit: z.boolean().optional(),
  exposeInputAsEnv: z.boolean().optional(),
  fallbackToMock: z.boolean().optional(),
  parseJsonOutput: z.boolean().optional(),
  language: z.enum(['python', 'nodejs', 'go', 'rust', 'bash', 'ruby', 'php', 'java', 'docker', 'jupyter']).optional(),
});

const sandflareScrapeSchema = baseSchema.extend({
  provider: z.enum(['auto', 'sandflare', 'mock']).optional(),
  apiKey: z.string().optional(),
  inputVariable: z.string().optional(),
  url: z.string().optional(),
  javascript: z.boolean().optional(),
  waitFor: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  fallbackToMock: z.boolean().optional(),
});

const aiNodeSchema = baseSchema.extend({
  provider: z.enum(['openai', 'anthropic', 'google', 'gemini', 'cohere', 'mistral', 'custom']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  prompt: z.string().optional(),
  systemPrompt: z.string().optional(),
  inputVariable: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  timeout: z.number().int().positive().optional(),
  outputFormat: z.enum(['text', 'json']).optional(),
});

const parameterDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'array']),
  description: z.string().min(1),
  required: z.boolean().default(false),
});

const questionClassSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

const aiParameterExtractorSchema = baseSchema.extend({
  model: z.string().optional(),
  parameters: z.array(parameterDefinitionSchema).default([]),
  instruction: z.string().optional(),
});

const aiQuestionClassifierSchema = baseSchema.extend({
  model: z.string().optional(),
  classes: z.array(questionClassSchema).default([]),
  instruction: z.string().optional(),
});

const ragKnowledgeIndexerSchema = baseSchema.extend({
  collectionName: z.string().min(1),
  embeddingModel: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).default('text-embedding-3-small'),
  chunkSize: z.number().int().min(1).default(1000),
  chunkOverlap: z.number().int().min(0).default(200),
  metadata: z.record(z.string(), z.string()).default({}),
});

const dataDocumentExtractorSchema = baseSchema.extend({
  model: z.string().optional(),
  schema: z.string().min(1),
  instruction: z.string().optional(),
});

const dataListOperatorSchema = baseSchema.extend({
  operation: z.enum(['filter', 'map', 'sort', 'slice', 'unique', 'count']).default('filter'),
  filterExpression: z.string().optional(),
  mapExpression: z.string().optional(),
  sortKey: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sliceStart: z.number().int().optional(),
  sliceEnd: z.number().int().optional(),
});

const dataVariableAggregatorSchema = baseSchema.extend({
  mode: z.enum(['object', 'array', 'merge']).default('object'),
  keys: z.array(z.string()).optional(),
});

const anthropicNodeSchema = baseSchema.extend({
  model: z.enum(['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5']).optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const mistralNodeSchema = baseSchema.extend({
  model: z.enum(['mistral-large-latest', 'mistral-small-latest', 'open-mixtral-8x7b']).optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const groqNodeSchema = baseSchema.extend({
  model: z.enum(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']).optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const ollamaNodeSchema = baseSchema.extend({
  model: z.string().optional(),
  host: z.string().optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const toolCalculatorSchema = baseSchema.extend({
  expression: z.string().optional(),
});

const toolWebSearchSchema = baseSchema.extend({
  provider: z.enum(['tavily', 'serpapi', 'brave']).optional(),
  query: z.string().optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
});

const toolWebBrowserSchema = baseSchema.extend({
  url: z.string().optional(),
  action: z.enum(['read', 'screenshot', 'extract']).optional(),
  selector: z.string().optional(),
});

const toolDatetimeSchema = baseSchema.extend({
  format: z.string().optional(),
  timezone: z.string().optional(),
  operation: z.enum(['now', 'add', 'subtract', 'format', 'diff']).optional(),
  amount: z.number().optional(),
  unit: z.enum(['days', 'hours', 'minutes', 'seconds']).optional(),
});

const analyticsLangfuseSchema = baseSchema.extend({
  eventName: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

const analyticsLogSchema = baseSchema.extend({
  level: z.enum(['info', 'warn', 'error']).optional(),
  message: z.string().optional(),
  includeInput: z.boolean().optional(),
});

const controlConditionSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  condition: z.string().optional(),
  expression: z.string().optional(),
  evaluationType: z.enum(['expression', 'javascript']).optional(),
});

const switchCaseSchema = z.object({
  branchKey: z.string().optional(),
  label: z.string().optional(),
  condition: z.string().optional(),
  value: z.any().optional(),
});

const controlSwitchSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  expression: z.string().optional(),
  cases: z.array(switchCaseSchema).optional(),
});

const controlSubWorkflowSchema = baseSchema.extend({
  workflowId: z.string().min(1),
  inputMapping: z.record(z.string(), z.string()).optional(),
});

const humanApprovalSchema = baseSchema.extend({
  title: z.string().default('Approval Required'),
  message: z.string().default('Please review and approve or reject this step.'),
  timeoutMinutes: z.coerce.number().min(1).default(60),
  notifyEmail: z.string().email().optional().or(z.literal('')),
});

const utilityVariableSchema = baseSchema.extend({
  name: z.string().min(1),
  value: z.string().min(1),
  action: z.enum(['set', 'get', 'delete', 'increment']).optional(),
  amount: z.number().optional(),
  variableName: z.string().optional(),
});

const utilityGetVariableSchema = baseSchema.extend({
  name: z.string().min(1),
});

const dataReadSchema = baseSchema.extend({
  inputVariable: z.string().optional(),
  url: z.string().optional(),
  content: z.any().optional(),
  headers: z.any().optional(),
  sourceType: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().min(1).optional(),
  limit: z.number().int().positive().optional(),
});

const loaderCsvSchema = baseSchema.extend({
  url: z.string().optional(),
  delimiter: z.string().min(1).default(','),
  hasHeader: z.boolean().default(true),
  columns: z.array(z.string()).optional(),
});

const loaderJsonSchema = baseSchema.extend({
  url: z.string().optional(),
  path: z.string().optional(),
});

const loaderPdfSchema = baseSchema.extend({
  url: z.string().min(1),
  extractMetadata: z.boolean().default(false),
});

const loaderWebpageSchema = baseSchema.extend({
  url: z.string().min(1),
  selector: z.string().optional(),
  includeLinks: z.boolean().default(false),
});

const loaderGithubSchema = baseSchema.extend({
  repo: z.string().min(1),
  path: z.string().optional(),
  branch: z.string().default('main'),
  fileTypes: z.array(z.string()).optional(),
});

const loaderNotionSchema = baseSchema.extend({
  pageId: z.string().optional(),
  databaseId: z.string().optional(),
  recursive: z.boolean().default(false),
});

const loaderGoogleDriveSchema = baseSchema.extend({
  fileId: z.string().min(1),
  mimeType: z.string().optional(),
});

const loaderAirtableSchema = baseSchema.extend({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  filterFormula: z.string().optional(),
  maxRecords: z.number().int().min(1).max(1000).default(100),
});

const loaderRssSchema = baseSchema.extend({
  url: z.string().min(1),
  maxItems: z.number().int().min(1).max(100).default(10),
  includeContent: z.boolean().default(false),
});

const loaderSitemapSchema = baseSchema.extend({
  url: z.string().min(1),
  maxUrls: z.number().int().min(1).max(500).default(50),
  filter: z.string().optional(),
});

export const nodeRegistry: Record<string, NodeRegistryEntry> = {
  ['trigger.manual']: {
    type: 'trigger.manual' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Manual Trigger',
    description: 'Start workflow manually',
    icon: 'Play',
    color: '#10b981',
    configSchema: manualTriggerSchema,
    defaultConfig: { inputSchema: {} },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.schedule']: {
    type: 'trigger.schedule' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Schedule',
    description: 'Run on schedule',
    icon: 'Clock',
    color: '#10b981',
    configSchema: scheduleTriggerSchema,
    defaultConfig: { cron: '0 * * * *', timezone: 'UTC', enabled: true },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.webhook']: {
    type: 'trigger.webhook' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Webhook',
    description: 'HTTP webhook trigger',
    icon: 'Webhook',
    color: '#10b981',
    configSchema: webhookTriggerSchema,
    defaultConfig: { method: 'POST', authType: 'none' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.email']: {
    type: 'trigger.email' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Email Trigger',
    description: 'Trigger on email',
    icon: 'Mail',
    color: '#10b981',
    configSchema: emailTriggerSchema,
    defaultConfig: { emailAddress: '', filterRules: [] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.file_watch']: {
    type: 'trigger.file_watch' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'File Watch',
    description: 'Watch file changes',
    icon: 'FolderSearch',
    color: '#10b981',
    configSchema: fileWatchTriggerSchema,
    defaultConfig: { path: '', pattern: '**/*', events: ['update'] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.database']: {
    type: 'trigger.database' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Database Trigger',
    description: 'Database changes',
    icon: 'Database',
    color: '#10b981',
    configSchema: databaseTriggerSchema,
    defaultConfig: { table: '', operation: 'change' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.mqtt']: {
    type: 'trigger.mqtt' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'MQTT',
    description: 'MQTT messages',
    icon: 'Radio',
    color: '#10b981',
    configSchema: mqttTriggerSchema,
    defaultConfig: { topic: '', qos: 0 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.websocket']: {
    type: 'trigger.websocket' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'WebSocket',
    description: 'WebSocket messages',
    icon: 'WifiZero',
    color: '#10b981',
    configSchema: websocketTriggerSchema,
    defaultConfig: { path: '', event: 'message' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.kafka']: {
    type: 'trigger.kafka' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Kafka',
    description: 'Kafka messages',
    icon: 'MessageSquareMore',
    color: '#10b981',
    configSchema: kafkaTriggerSchema,
    defaultConfig: { topic: '', consumerGroup: 'workflow-group' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['trigger.event']: {
    type: 'trigger.event' as NodeType,
    category: 'trigger' as NodeCategory,
    name: 'Event',
    description: 'Generic event',
    icon: 'Zap',
    color: '#10b981',
    configSchema: eventTriggerSchema,
    defaultConfig: { eventName: '', source: 'event-bus', payloadFilters: [] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.python']: {
    type: 'sandflare.python' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Python',
    description: 'Execute Python code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.nodejs']: {
    type: 'sandflare.nodejs' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Node.js',
    description: 'Execute Node.js code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.go']: {
    type: 'sandflare.go' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Go',
    description: 'Execute Go code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.rust']: {
    type: 'sandflare.rust' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Rust',
    description: 'Execute Rust code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.bash']: {
    type: 'sandflare.bash' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Bash',
    description: 'Execute Bash scripts',
    icon: 'Terminal',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.ruby']: {
    type: 'sandflare.ruby' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Ruby',
    description: 'Execute Ruby code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.php']: {
    type: 'sandflare.php' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'PHP',
    description: 'Execute PHP code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.java']: {
    type: 'sandflare.java' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Java',
    description: 'Execute Java code',
    icon: 'Code',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.docker']: {
    type: 'sandflare.docker' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Docker',
    description: 'Run Docker container',
    icon: 'Container',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.jupyter']: {
    type: 'sandflare.jupyter' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Jupyter',
    description: 'Jupyter notebook',
    icon: 'BookOpen',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.execute']: {
    type: 'sandflare.execute' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Code Execute',
    description: 'Generic code execution in a Sandflare sandbox',
    icon: 'Code2',
    color: '#0ea5e9',
    configSchema: sandflareRuntimeSchema,
    defaultConfig: { language: 'python', code: '', timeout: 30000, fallbackToMock: true, parseJsonOutput: true },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.scrape']: {
    type: 'sandflare.scrape' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Web Scraper',
    description: 'Scrape websites using a Sandflare sandbox',
    icon: 'Globe',
    color: '#0ea5e9',
    configSchema: sandflareScrapeSchema,
    defaultConfig: { url: '', javascript: true, timeout: 30000, fallbackToMock: true },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.file_write']: {
    type: 'sandflare.file_write' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Write File',
    description: 'Write a file into the shared sandbox filesystem',
    icon: 'FileOutput',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { path: '/home/user/file.txt', content: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.file_read']: {
    type: 'sandflare.file_read' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Read File',
    description: 'Read a file from the shared sandbox filesystem',
    icon: 'FileInput',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { path: '/home/user/file.txt', encoding: 'utf8' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.file_list']: {
    type: 'sandflare.file_list' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'List Files',
    description: 'List directory contents inside the sandbox',
    icon: 'FolderOpen',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { path: '/home/user' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.install']: {
    type: 'sandflare.install' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Install Package',
    description: 'Install packages (pip/npm/apt) into the shared sandbox',
    icon: 'Package',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { packages: '', runtime: 'pip' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.snapshot']: {
    type: 'sandflare.snapshot' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Snapshot',
    description: 'Save the current sandbox state as a reusable snapshot',
    icon: 'Camera',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { name: '', description: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.fork']: {
    type: 'sandflare.fork' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Fork Sandbox',
    description: 'Fork the sandbox into N parallel copies for parallel exploration',
    icon: 'GitFork',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { count: 2 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.git_clone']: {
    type: 'sandflare.git_clone' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Git Clone',
    description: 'Clone a git repository into the shared sandbox',
    icon: 'GitBranch',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { repoUrl: '', branch: 'main', path: '/repo', depth: 1 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.playwright']: {
    type: 'sandflare.playwright' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Playwright Browser',
    description: 'Headless browser automation — screenshots, scraping, form filling',
    icon: 'MonitorPlay',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { script: '', url: '', action: 'screenshot' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.memory_add']: {
    type: 'sandflare.memory_add' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Add Memory',
    description: 'Store a memory that persists across workflow runs',
    icon: 'Brain',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { content: '', category: 'general' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.memory_search']: {
    type: 'sandflare.memory_search' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Search Memory',
    description: 'Search persisted memories by semantic query',
    icon: 'Search',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: { query: '', limit: 10 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['sandflare.metrics']: {
    type: 'sandflare.metrics' as NodeType,
    category: 'sandflare' as NodeCategory,
    name: 'Sandbox Metrics',
    description: 'Get CPU, memory, and process metrics from the shared sandbox',
    icon: 'Activity',
    color: '#0ea5e9',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.AGENT_LLM]: {
    type: NodeType.AGENT_LLM,
    category: NodeCategory.AGENT,
    name: 'LLM Agent',
    description: 'AI agent with tool use and memory',
    icon: 'Bot',
    color: '#8b5cf6',
    configSchema: agentLlmSchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 2000,
      streaming: false,
    },
    inputs: [
      { name: 'input', type: 'any', required: false },
      { name: 'tools', type: 'tool[]', required: false },
      { name: 'memory', type: 'messages', required: false },
    ],
    outputs: [
      { name: 'output', type: 'string' },
      { name: 'messages', type: 'messages' },
    ],
  },

  [NodeType.AGENT_REACT]: {
    type: NodeType.AGENT_REACT,
    category: NodeCategory.AGENT,
    name: 'ReAct Agent',
    description: 'Reason-and-act agent loop with tool execution',
    icon: 'BrainCircuit',
    color: '#8b5cf6',
    configSchema: agentReactSchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'You are a reasoning-and-acting agent.',
      maxIterations: 5,
      verbose: true,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'output', type: 'string' },
      { name: 'trajectory', type: 'string' },
    ],
  },

  [NodeType.AGENT_TOOL]: {
    type: NodeType.AGENT_TOOL,
    category: NodeCategory.AGENT,
    name: 'Agent Tool',
    description: 'Defines a callable tool for agent nodes',
    icon: 'Wrench',
    color: '#8b5cf6',
    configSchema: agentToolSchema,
    defaultConfig: {
      name: 'tool_name',
      description: 'Tool description',
      language: 'nodejs',
      code: 'return args;',
      parameters: { type: 'object', properties: {}, additionalProperties: true },
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'tool' }],
  },

  [NodeType.AGENT_CONDITION]: {
    type: NodeType.AGENT_CONDITION,
    category: NodeCategory.AGENT,
    name: 'Agent Condition',
    description: 'LLM or expression-based agent routing',
    icon: 'GitBranchPlus',
    color: '#8b5cf6',
    configSchema: agentConditionSchema,
    defaultConfig: {
      conditionType: 'expression',
      expression: 'Boolean(input)',
      provider: 'openai',
      model: 'gpt-4o',
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'true', type: 'any' },
      { name: 'false', type: 'any' },
    ],
  },

  [NodeType.AGENT_LOOP]: {
    type: NodeType.AGENT_LOOP,
    category: NodeCategory.AGENT,
    name: 'Agent Loop',
    description: 'Iterative loop with exit condition and aggregation',
    icon: 'Repeat',
    color: '#8b5cf6',
    configSchema: agentLoopSchema,
    defaultConfig: {
      maxIterations: 5,
      exitConditionType: 'expression',
      conditionExpression: 'false',
      aggregateResults: true,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'output', type: 'any' },
      { name: 'results', type: 'array' },
    ],
  },

  [NodeType.AGENT_SUPERVISOR]: {
    type: NodeType.AGENT_SUPERVISOR,
    category: NodeCategory.AGENT,
    name: 'Supervisor Agent',
    description: 'Routes tasks to worker agents and combines results',
    icon: 'ShieldCheck',
    color: '#8b5cf6',
    configSchema: agentSupervisorSchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o',
      routingStrategy: 'llm',
      systemPrompt: 'Route the request to the best worker and explain why.',
      maxRounds: 3,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'output', type: 'any' },
      { name: 'selectedWorker', type: 'object' },
    ],
  },

  [NodeType.AGENT_WORKER]: {
    type: NodeType.AGENT_WORKER,
    category: NodeCategory.AGENT,
    name: 'Worker Agent',
    description: 'Specialized worker callable by supervisor nodes',
    icon: 'UserRoundCog',
    color: '#8b5cf6',
    configSchema: agentWorkerSchema,
    defaultConfig: {
      name: 'Worker',
      description: 'Specialized worker agent',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'You are a specialized worker agent.',
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'output', type: 'string' },
      { name: 'worker', type: 'object' },
    ],
  },

  [NodeType.AGENT_PLANNER]: {
    type: NodeType.AGENT_PLANNER,
    category: NodeCategory.AGENT,
    name: 'Planner Agent',
    description: 'Breaks goals into structured executable plans',
    icon: 'ClipboardList',
    color: '#8b5cf6',
    configSchema: agentPlannerSchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Create a structured execution plan.',
      maxSteps: 8,
      preferJson: true,
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'output', type: 'array' },
      { name: 'plan', type: 'object' },
    ],
  },

  [NodeType.AGENT_PUBLISH]: {
    type: NodeType.AGENT_PUBLISH,
    category: NodeCategory.AGENT,
    name: 'Publish Message',
    description: 'Publish a message to a topic on the agent message bus. Other agents subscribed to this topic will receive it.',
    icon: 'Send',
    color: '#8b5cf6',
    configSchema: agentPublishSchema,
    defaultConfig: {
      topic: '',
      payload: {},
      includeContext: true,
    },
    inputs: [
      { name: 'trigger', type: 'any', required: false },
      { name: 'payload', type: 'object', required: false },
    ],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.AGENT_SUBSCRIBE]: {
    type: NodeType.AGENT_SUBSCRIBE,
    category: NodeCategory.TRIGGER,
    name: 'On Message',
    description: 'Trigger this workflow when a message is published to a topic.',
    icon: 'Inbox',
    color: '#8b5cf6',
    configSchema: agentSubscribeSchema,
    defaultConfig: {
      topic: '',
      filter: '',
    },
    inputs: [],
    outputs: [
      { name: 'output', type: 'object' },
      { name: 'payload', type: 'object' },
    ],
  },

  [NodeType.AGENT_CALL]: {
    type: NodeType.AGENT_CALL,
    category: NodeCategory.AGENT,
    name: 'Call Agent',
    description: 'Call another deployed agent and wait for its response.',
    icon: 'Zap',
    color: '#8b5cf6',
    configSchema: agentCallSchema,
    defaultConfig: {
      agentId: '',
      agentName: '',
      method: 'run',
      timeoutMs: 30000,
      args: {},
    },
    inputs: [
      { name: 'trigger', type: 'any', required: false },
      { name: 'args', type: 'object', required: false },
    ],
    outputs: [
      { name: 'output', type: 'any' },
      { name: 'error', type: 'string' },
    ],
  },

  [NodeType.MEMORY_BUFFER]: {
    type: NodeType.MEMORY_BUFFER,
    category: NodeCategory.MEMORY,
    name: 'Buffer Memory',
    description: 'In-memory chat buffer for the current execution session',
    icon: 'DatabaseZap',
    color: '#14b8a6',
    configSchema: memoryBufferSchema,
    defaultConfig: { maxMessages: 10, sessionKey: '' },
    inputs: [{ name: 'input', type: 'messages', required: false }],
    outputs: [{ name: 'output', type: 'messages' }],
  },

  [NodeType.MEMORY_REDIS]: {
    type: NodeType.MEMORY_REDIS,
    category: NodeCategory.MEMORY,
    name: 'Redis Memory',
    description: 'Persistent cross-execution memory backed by Redis',
    icon: 'DatabaseBackup',
    color: '#14b8a6',
    configSchema: memoryRedisSchema,
    defaultConfig: { maxMessages: 20, ttlSeconds: 86400, sessionKey: '' },
    inputs: [{ name: 'input', type: 'messages', required: false }],
    outputs: [{ name: 'output', type: 'messages' }],
  },

  [NodeType.MEMORY_POSTGRES]: {
    type: NodeType.MEMORY_POSTGRES,
    category: NodeCategory.MEMORY,
    name: 'Postgres Memory',
    description: 'Persistent workflow memory stored in Postgres',
    icon: 'Database',
    color: '#14b8a6',
    configSchema: memoryPostgresSchema,
    defaultConfig: { maxMessages: 20, sessionKey: '', tableHint: 'Uses memory_store table' },
    inputs: [{ name: 'input', type: 'messages', required: false }],
    outputs: [{ name: 'output', type: 'messages' }],
  },

  [NodeType.MEMORY_SUMMARY]: {
    type: NodeType.MEMORY_SUMMARY,
    category: NodeCategory.MEMORY,
    name: 'Summary Memory',
    description: 'Compresses long conversations into a durable summary',
    icon: 'ScrollText',
    color: '#14b8a6',
    configSchema: memorySummarySchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o',
      maxTokensBeforeSummary: 2000,
      keepRecentMessages: 6,
    },
    inputs: [{ name: 'input', type: 'messages', required: false }],
    outputs: [{ name: 'output', type: 'messages' }],
  },

  [NodeType.MEMORY_WINDOW]: {
    type: NodeType.MEMORY_WINDOW,
    category: NodeCategory.MEMORY,
    name: 'Window Memory',
    description: 'Sliding conversational window keeping the latest turns',
    icon: 'PanelsTopLeft',
    color: '#14b8a6',
    configSchema: memoryWindowSchema,
    defaultConfig: { windowSize: 5, sessionKey: '' },
    inputs: [{ name: 'input', type: 'messages', required: false }],
    outputs: [{ name: 'output', type: 'messages' }],
  },

  [NodeType.MEMORY_AGENT_READ]: {
    type: NodeType.MEMORY_AGENT_READ,
    category: NodeCategory.MEMORY,
    name: 'Agent Memory Read',
    description: 'Reads a key from the deployed agent memory namespace',
    icon: 'BrainCircuit',
    color: '#3b82f6',
    configSchema: memoryAgentReadSchema,
    defaultConfig: { key: '', defaultValue: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'value', type: 'any' }],
  },

  [NodeType.MEMORY_AGENT_WRITE]: {
    type: NodeType.MEMORY_AGENT_WRITE,
    category: NodeCategory.MEMORY,
    name: 'Agent Memory Write',
    description: 'Writes a key-value record into the deployed agent memory namespace',
    icon: 'Brain',
    color: '#8b5cf6',
    configSchema: memoryAgentWriteSchema,
    defaultConfig: { key: '', value: '', metadata: {} },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.MEMORY_EPISODIC_GET]: {
    type: NodeType.MEMORY_EPISODIC_GET,
    category: NodeCategory.MEMORY,
    name: 'Episodic Memory',
    description: 'Retrieves recent episodic memories for context injection',
    icon: 'History',
    color: '#2563eb',
    configSchema: memoryEpisodicGetSchema,
    defaultConfig: { limit: 5 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'memories', type: 'array' }],
  },

  [NodeType.RAG_PDF_LOADER]: {
    type: NodeType.RAG_PDF_LOADER,
    category: NodeCategory.RAG,
    name: 'PDF Loader',
    description: 'Load and extract text from PDF documents',
    icon: 'FileText',
    color: '#f59e0b',
    configSchema: ragPdfLoaderSchema,
    defaultConfig: { source: 'url', splitPages: true, extractImages: false, timeout: 30000 },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'documents', type: 'array' }],
  },

  [NodeType.RAG_WEB_LOADER]: {
    type: NodeType.RAG_WEB_LOADER,
    category: NodeCategory.RAG,
    name: 'Web Loader',
    description: 'Fetch and clean website content for retrieval',
    icon: 'Globe',
    color: '#f59e0b',
    configSchema: ragWebLoaderSchema,
    defaultConfig: { recursive: false, maxDepth: 0, timeout: 30000 },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'documents', type: 'array' }],
  },

  [NodeType.RAG_TEXT_SPLITTER]: {
    type: NodeType.RAG_TEXT_SPLITTER,
    category: NodeCategory.RAG,
    name: 'Text Splitter',
    description: 'Split documents into retrieval-ready chunks',
    icon: 'Scissors',
    color: '#f59e0b',
    configSchema: ragTextSplitterSchema,
    defaultConfig: { strategy: 'recursive', chunkSize: 1000, chunkOverlap: 200 },
    inputs: [{ name: 'documents', type: 'array', required: true }],
    outputs: [{ name: 'chunks', type: 'array' }],
  },

  [NodeType.RAG_EMBEDDER]: {
    type: NodeType.RAG_EMBEDDER,
    category: NodeCategory.RAG,
    name: 'Embedder',
    description: 'Generate embeddings for document chunks',
    icon: 'Binary',
    color: '#f59e0b',
    configSchema: ragEmbedderSchema,
    defaultConfig: { provider: 'openai', model: 'text-embedding-3-small', batchSize: 100, timeout: 30000 },
    inputs: [{ name: 'chunks', type: 'array', required: true }],
    outputs: [{ name: 'embeddings', type: 'array' }],
  },

  [NodeType.RAG_VECTOR_STORE]: {
    type: NodeType.RAG_VECTOR_STORE,
    category: NodeCategory.RAG,
    name: 'Vector Store',
    description: 'Store or query embeddings in memory or Postgres',
    icon: 'Database',
    color: '#f59e0b',
    configSchema: ragVectorStoreSchema,
    defaultConfig: { backend: 'memory', operation: 'upsert', indexName: 'default', topK: 5, scoreThreshold: 0 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'results', type: 'array' }],
  },

  [NodeType.RAG_RETRIEVER]: {
    type: NodeType.RAG_RETRIEVER,
    category: NodeCategory.RAG,
    name: 'Retriever',
    description: 'Retrieve relevant chunks from a vector store',
    icon: 'Search',
    color: '#f59e0b',
    configSchema: ragRetrieverSchema,
    defaultConfig: { backend: 'memory', strategy: 'similarity', indexName: 'default', topK: 5, fetchK: 10, scoreThreshold: 0 },
    inputs: [{ name: 'query', type: 'string', required: false }],
    outputs: [{ name: 'documents', type: 'array' }],
  },

  [NodeType.RAG_QA_CHAIN]: {
    type: NodeType.RAG_QA_CHAIN,
    category: NodeCategory.RAG,
    name: 'QA Chain',
    description: 'Answer questions using retrieved context',
    icon: 'MessageSquareQuote',
    color: '#f59e0b',
    configSchema: ragQaChainSchema,
    defaultConfig: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      returnSources: true,
      maxContextTokens: 4000,
      contextTemplate: 'Use the following context to answer the question:\n\n{context}\n\nQuestion: {question}',
    },
    inputs: [{ name: 'documents', type: 'array', required: true }],
    outputs: [{ name: 'answer', type: 'string' }],
  },

  [NodeType.RAG_RERANKER]: {
    type: NodeType.RAG_RERANKER,
    category: NodeCategory.RAG,
    name: 'Reranker',
    description: 'Reorder retrieved documents with cross-encoder style scoring',
    icon: 'ArrowUpDown',
    color: '#f59e0b',
    configSchema: ragRerankerSchema,
    defaultConfig: { provider: 'cohere', model: 'rerank-english-v3.0', topN: 5, timeout: 30000 },
    inputs: [{ name: 'documents', type: 'array', required: true }],
    outputs: [{ name: 'documents', type: 'array' }],
  },

  [NodeType.RAG_KNOWLEDGE_INDEXER]: {
    type: NodeType.RAG_KNOWLEDGE_INDEXER,
    category: NodeCategory.RAG,
    name: 'Knowledge Indexer',
    description: 'Split text, embed chunks, and store them for retrieval',
    icon: 'Database',
    color: '#f59e0b',
    configSchema: ragKnowledgeIndexerSchema,
    defaultConfig: { collectionName: 'knowledge-base', embeddingModel: 'text-embedding-3-small', chunkSize: 1000, chunkOverlap: 200, metadata: {} },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.EMBEDDING_OPENAI]: {
    type: NodeType.EMBEDDING_OPENAI,
    category: NodeCategory.EMBEDDING,
    name: 'OpenAI Embeddings',
    description: 'Generate embeddings with OpenAI models',
    icon: 'Fingerprint',
    brandIcon: 'openai',
    color: '#06b6d4',
    configSchema: embeddingOpenAISchema,
    defaultConfig: { model: 'text-embedding-3-small' },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'embedding', type: 'array' }],
  },

  [NodeType.EMBEDDING_COHERE]: {
    type: NodeType.EMBEDDING_COHERE,
    category: NodeCategory.EMBEDDING,
    name: 'Cohere Embeddings',
    description: 'Generate embeddings with Cohere',
    icon: 'Binary',
    brandIcon: 'cohere',
    color: '#06b6d4',
    configSchema: embeddingCohereSchema,
    defaultConfig: { model: 'embed-english-v3.0', inputType: 'search_document' },
    inputs: [{ name: 'input', type: 'string', required: true }],
    outputs: [{ name: 'embedding', type: 'array' }],
  },

  [NodeType.EMBEDDING_HUGGINGFACE]: {
    type: NodeType.EMBEDDING_HUGGINGFACE,
    category: NodeCategory.EMBEDDING,
    name: 'Hugging Face Embeddings',
    description: 'Generate embeddings with Hugging Face inference',
    icon: 'Bot',
    brandIcon: 'huggingface',
    color: '#06b6d4',
    configSchema: embeddingHuggingFaceSchema,
    defaultConfig: { model: 'sentence-transformers/all-MiniLM-L6-v2' },
    inputs: [{ name: 'input', type: 'string', required: true }],
    outputs: [{ name: 'embedding', type: 'array' }],
  },

  [NodeType.VECTORSTORE_PINECONE]: {
    type: NodeType.VECTORSTORE_PINECONE,
    category: NodeCategory.VECTORSTORE,
    name: 'Pinecone',
    description: 'Upsert, query, or delete vectors in Pinecone',
    icon: 'DatabaseZap',
    color: '#0f766e',
    configSchema: vectorstorePineconeSchema,
    defaultConfig: { operation: 'upsert', indexName: 'default', namespace: '', topK: 5, includeMetadata: true },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.VECTORSTORE_QDRANT]: {
    type: NodeType.VECTORSTORE_QDRANT,
    category: NodeCategory.VECTORSTORE,
    name: 'Qdrant',
    description: 'Upsert, query, or delete vectors in Qdrant',
    icon: 'Hexagon',
    color: '#0f766e',
    configSchema: vectorstoreQdrantSchema,
    defaultConfig: { operation: 'upsert', collectionName: 'default', topK: 5 },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.VECTORSTORE_CHROMA]: {
    type: NodeType.VECTORSTORE_CHROMA,
    category: NodeCategory.VECTORSTORE,
    name: 'Chroma',
    description: 'Upsert, query, or delete vectors in Chroma',
    icon: 'Layers3',
    color: '#0f766e',
    configSchema: vectorstoreChromaSchema,
    defaultConfig: { operation: 'upsert', collectionName: 'default', topK: 5 },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.VECTORSTORE_WEAVIATE]: {
    type: NodeType.VECTORSTORE_WEAVIATE,
    category: NodeCategory.VECTORSTORE,
    name: 'Weaviate',
    description: 'Upsert or query vectors in Weaviate',
    icon: 'Orbit',
    color: '#0f766e',
    configSchema: vectorstoreWeaviateSchema,
    defaultConfig: { operation: 'upsert', className: 'VectorDocument', topK: 5 },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.VECTORSTORE_PGVECTOR]: {
    type: NodeType.VECTORSTORE_PGVECTOR,
    category: NodeCategory.VECTORSTORE,
    name: 'pgvector',
    description: 'Persist vectors in Postgres and search them with cosine similarity',
    icon: 'TableProperties',
    color: '#0f766e',
    configSchema: vectorstorePgvectorSchema,
    defaultConfig: { operation: 'upsert', tableName: 'vector_documents', topK: 5 },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.VECTORSTORE_REDIS]: {
    type: NodeType.VECTORSTORE_REDIS,
    category: NodeCategory.VECTORSTORE,
    name: 'Redis Vectors',
    description: 'Store vectors in Redis REST and search with cosine similarity',
    icon: 'DatabaseBackup',
    color: '#0f766e',
    configSchema: vectorstoreRedisSchema,
    defaultConfig: { operation: 'upsert', keyPrefix: 'vec', topK: 5 },
    inputs: [{ name: 'input', type: 'object', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  ['ai.llm']: {
    type: 'ai.llm' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'LLM',
    description: 'Language model processing',
    icon: 'Brain',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.AI_ANTHROPIC]: {
    type: NodeType.AI_ANTHROPIC,
    category: NodeCategory.AI,
    name: 'Anthropic',
    description: 'Claude models via Anthropic Messages API',
    icon: 'BrainCircuit',
    brandIcon: 'anthropic',
    color: '#8b5cf6',
    configSchema: anthropicNodeSchema,
    defaultConfig: { model: 'claude-sonnet-4-5', systemPrompt: '', userPrompt: '', maxTokens: 1024, temperature: 0.7 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }, { name: 'usage', type: 'object' }],
  },

  [NodeType.AI_MISTRAL]: {
    type: NodeType.AI_MISTRAL,
    category: NodeCategory.AI,
    name: 'Mistral',
    description: 'Chat completions via Mistral API',
    icon: 'MessagesSquare',
    brandIcon: 'mistral',
    color: '#8b5cf6',
    configSchema: mistralNodeSchema,
    defaultConfig: { model: 'mistral-large-latest', systemPrompt: '', userPrompt: '', temperature: 0.7 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }, { name: 'usage', type: 'object' }],
  },

  [NodeType.AI_GROQ]: {
    type: NodeType.AI_GROQ,
    category: NodeCategory.AI,
    name: 'Groq',
    description: 'Ultra-fast chat completions via Groq',
    icon: 'Zap',
    brandIcon: 'groq',
    color: '#8b5cf6',
    configSchema: groqNodeSchema,
    defaultConfig: { model: 'llama-3.3-70b-versatile', systemPrompt: '', userPrompt: '', temperature: 0.7 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }, { name: 'usage', type: 'object' }],
  },

  [NodeType.AI_OLLAMA]: {
    type: NodeType.AI_OLLAMA,
    category: NodeCategory.AI,
    name: 'Ollama',
    description: 'Local/private LLM chat via Ollama',
    icon: 'Server',
    color: '#8b5cf6',
    configSchema: ollamaNodeSchema,
    defaultConfig: { model: 'llama3.2', host: 'http://localhost:11434', systemPrompt: '', userPrompt: '', temperature: 0.7 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'string' }, { name: 'usage', type: 'object' }],
  },

  ['ai.chat']: {
    type: 'ai.chat' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Chat',
    description: 'Conversational AI',
    icon: 'MessageSquare',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.completion']: {
    type: 'ai.completion' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Completion',
    description: 'Text completion',
    icon: 'Type',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.embedding']: {
    type: 'ai.embedding' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Embeddings',
    description: 'Generate embeddings',
    icon: 'Binary',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.vector_search']: {
    type: 'ai.vector_search' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Vector Search',
    description: 'Semantic search',
    icon: 'Search',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.classification']: {
    type: 'ai.classification' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Classification',
    description: 'Classify text',
    icon: 'Tags',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.sentiment']: {
    type: 'ai.sentiment' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Sentiment',
    description: 'Analyze sentiment',
    icon: 'Smile',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.summarization']: {
    type: 'ai.summarization' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Summarize',
    description: 'Summarize text',
    icon: 'FileText',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.translation']: {
    type: 'ai.translation' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Translate',
    description: 'Translate text',
    icon: 'Languages',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.image_generation']: {
    type: 'ai.image_generation' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Image Generation',
    description: 'Generate images',
    icon: 'Image',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.image_analysis']: {
    type: 'ai.image_analysis' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Image Analysis',
    description: 'Analyze images',
    icon: 'ScanSearch',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.speech_to_text']: {
    type: 'ai.speech_to_text' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Speech to Text',
    description: 'Transcribe audio',
    icon: 'Mic',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.text_to_speech']: {
    type: 'ai.text_to_speech' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Text to Speech',
    description: 'Generate speech',
    icon: 'Volume2',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.ocr']: {
    type: 'ai.ocr' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'OCR',
    description: 'Extract text from images',
    icon: 'ScanText',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['ai.moderation']: {
    type: 'ai.moderation' as NodeType,
    category: 'ai' as NodeCategory,
    name: 'Moderation',
    description: 'Content moderation',
    icon: 'Shield',
    color: '#8b5cf6',
    configSchema: aiNodeSchema,
    defaultConfig: { provider: 'openai', model: 'gpt-4o' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.AI_PARAMETER_EXTRACTOR]: {
    type: NodeType.AI_PARAMETER_EXTRACTOR,
    category: NodeCategory.AI,
    name: 'Parameter Extractor',
    description: 'Extract typed fields from unstructured input',
    icon: 'ScanText',
    color: '#8b5cf6',
    configSchema: aiParameterExtractorSchema,
    defaultConfig: { model: 'gpt-4o-mini', parameters: [], instruction: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.AI_QUESTION_CLASSIFIER]: {
    type: NodeType.AI_QUESTION_CLASSIFIER,
    category: NodeCategory.AI,
    name: 'Question Classifier',
    description: 'Classify input into one of several routes',
    icon: 'GitBranch',
    color: '#8b5cf6',
    configSchema: aiQuestionClassifierSchema,
    defaultConfig: { model: 'gpt-4o-mini', classes: [], instruction: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'default', type: 'object' }],
  },

  ['transform.data']: {
    type: 'transform.data' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Transform',
    description: 'Transform data',
    icon: 'Repeat',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.filter']: {
    type: 'transform.filter' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Filter',
    description: 'Filter data',
    icon: 'Filter',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.map']: {
    type: 'transform.map' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Map',
    description: 'Map array items',
    icon: 'List',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.reduce']: {
    type: 'transform.reduce' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Reduce',
    description: 'Reduce array',
    icon: 'Minimize2',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.aggregate']: {
    type: 'transform.aggregate' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Aggregate',
    description: 'Aggregate data',
    icon: 'BarChart',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.split']: {
    type: 'transform.split' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Split',
    description: 'Split data',
    icon: 'Split',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.merge']: {
    type: 'transform.merge' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Merge',
    description: 'Merge data',
    icon: 'Merge',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.sort']: {
    type: 'transform.sort' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Sort',
    description: 'Sort data',
    icon: 'ArrowUpDown',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.dedupe']: {
    type: 'transform.dedupe' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Dedupe',
    description: 'Remove duplicates',
    icon: 'Copy',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.json']: {
    type: 'transform.json' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'JSON',
    description: 'Parse/stringify JSON',
    icon: 'Braces',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.xml']: {
    type: 'transform.xml' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'XML',
    description: 'Parse/generate XML',
    icon: 'Code',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.csv']: {
    type: 'transform.csv' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'CSV',
    description: 'Parse/generate CSV',
    icon: 'Table',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.yaml']: {
    type: 'transform.yaml' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'YAML',
    description: 'Parse/generate YAML',
    icon: 'FileCode',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.html']: {
    type: 'transform.html' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'HTML',
    description: 'Parse/generate HTML',
    icon: 'FileText',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['transform.regex']: {
    type: 'transform.regex' as NodeType,
    category: 'transform' as NodeCategory,
    name: 'Regex',
    description: 'Pattern matching',
    icon: 'SearchCode',
    color: '#6366f1',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.condition']: {
    type: 'control.condition' as NodeType,
    category: 'control' as NodeCategory,
    name: 'If Condition',
    description: 'Branch on condition — connects true and false paths separately',
    icon: 'GitBranch',
    color: '#f59e0b',
    configSchema: controlConditionSchema,
    defaultConfig: { condition: 'Boolean(input)', expression: '', evaluationType: 'expression' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'true', type: 'any' },
      { name: 'false', type: 'any' },
    ],
  },

  ['control.switch']: {
    type: 'control.switch' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Switch',
    description: 'Multi-way branch',
    icon: 'GitMerge',
    color: '#f59e0b',
    configSchema: controlSwitchSchema,
    defaultConfig: {
      expression: 'input',
      cases: [
        { branchKey: 'case_1', label: 'Case 1', value: '' },
        { branchKey: 'case_2', label: 'Case 2', value: '' },
        { branchKey: 'case_3', label: 'Case 3', value: '' },
      ],
    },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'case_1', type: 'any' },
      { name: 'case_2', type: 'any' },
      { name: 'case_3', type: 'any' },
      { name: 'default', type: 'any' },
    ],
  },

  ['control.loop']: {
    type: 'control.loop' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Loop',
    description: 'Loop iteration',
    icon: 'RotateCw',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.foreach']: {
    type: 'control.foreach' as NodeType,
    category: 'control' as NodeCategory,
    name: 'For Each',
    description: 'Iterate array',
    icon: 'List',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.while']: {
    type: 'control.while' as NodeType,
    category: 'control' as NodeCategory,
    name: 'While',
    description: 'While loop',
    icon: 'RefreshCw',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.parallel']: {
    type: 'control.parallel' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Parallel',
    description: 'Parallel execution',
    icon: 'Layers',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.sequence']: {
    type: 'control.sequence' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Sequence',
    description: 'Sequential execution',
    icon: 'ArrowRight',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.error']: {
    type: 'control.error' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Try/Catch',
    description: 'Error handling',
    icon: 'AlertTriangle',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.retry']: {
    type: 'control.retry' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Retry',
    description: 'Retry on failure',
    icon: 'RotateCcw',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['control.timeout']: {
    type: 'control.timeout' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Timeout',
    description: 'Execution timeout',
    icon: 'Timer',
    color: '#f59e0b',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['human.approval']: {
    type: 'human.approval' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Human Approval',
    description: 'Pause execution and wait for a human to approve or reject before continuing.',
    icon: 'UserCheck',
    color: '#f59e0b',
    configSchema: humanApprovalSchema,
    defaultConfig: {
      title: 'Approval Required',
      message: 'Please review and approve or reject this step.',
      timeoutMinutes: 60,
      notifyEmail: '',
    },
    inputs: [{ name: 'trigger', type: 'any', required: false }],
    outputs: [
      { name: 'approved', type: 'any' },
      { name: 'rejected', type: 'any' },
    ],
  },

  ['control.sub_workflow']: {
    type: 'control.sub_workflow' as NodeType,
    category: 'control' as NodeCategory,
    name: 'Sub-Workflow',
    description: 'Execute another workflow and wait for the result',
    icon: 'GitBranch',
    color: '#F59E0B',
    configSchema: controlSubWorkflowSchema,
    defaultConfig: { workflowId: '', inputMapping: {} },
    inputs: [{ name: 'trigger', type: 'trigger', required: false }],
    outputs: [{ name: 'result', type: 'any' }],
  },

  ['integration.http']: {
    type: 'integration.http' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'HTTP Request',
    description: 'Make HTTP calls',
    icon: 'Network',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.graphql']: {
    type: 'integration.graphql' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'GraphQL',
    description: 'GraphQL queries',
    icon: 'Hexagon',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.rest']: {
    type: 'integration.rest' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'REST API',
    description: 'RESTful API calls',
    icon: 'Network',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.soap']: {
    type: 'integration.soap' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'SOAP',
    description: 'SOAP web services',
    icon: 'Box',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.webhook']: {
    type: 'integration.webhook' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Webhook',
    description: 'Send webhooks',
    icon: 'Send',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.grpc']: {
    type: 'integration.grpc' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'gRPC',
    description: 'gRPC calls',
    icon: 'Zap',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.websocket']: {
    type: 'integration.websocket' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'WebSocket',
    description: 'WebSocket client',
    icon: 'Radio',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.sse']: {
    type: 'integration.sse' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Server-Sent Events',
    description: 'SSE stream',
    icon: 'Activity',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.oauth']: {
    type: 'integration.oauth' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'OAuth',
    description: 'OAuth authentication',
    icon: 'Key',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.api_key']: {
    type: 'integration.api_key' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'API Key Auth',
    description: 'API key authentication',
    icon: 'KeyRound',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.database']: {
    type: 'integration.database' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Database',
    description: 'Generic database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.postgres']: {
    type: 'integration.postgres' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'PostgreSQL',
    description: 'PostgreSQL database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.mysql']: {
    type: 'integration.mysql' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'MySQL',
    description: 'MySQL database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.mongodb']: {
    type: 'integration.mongodb' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'MongoDB',
    description: 'MongoDB database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.redis']: {
    type: 'integration.redis' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Redis',
    description: 'Redis cache',
    icon: 'Zap',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.elasticsearch']: {
    type: 'integration.elasticsearch' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Elasticsearch',
    description: 'Elasticsearch search',
    icon: 'Search',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.dynamodb']: {
    type: 'integration.dynamodb' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'DynamoDB',
    description: 'AWS DynamoDB',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.cassandra']: {
    type: 'integration.cassandra' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Cassandra',
    description: 'Apache Cassandra',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.firestore']: {
    type: 'integration.firestore' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Firestore',
    description: 'Google Firestore',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.supabase']: {
    type: 'integration.supabase' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Supabase',
    description: 'Supabase database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.aws_s3']: {
    type: 'integration.aws_s3' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'AWS S3',
    description: 'S3 storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.aws_lambda']: {
    type: 'integration.aws_lambda' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'AWS Lambda',
    description: 'Invoke Lambda',
    icon: 'Zap',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.aws_sqs']: {
    type: 'integration.aws_sqs' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'AWS SQS',
    description: 'SQS queue',
    icon: 'MessageSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.aws_sns']: {
    type: 'integration.aws_sns' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'AWS SNS',
    description: 'SNS notifications',
    icon: 'Bell',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.gcp_storage']: {
    type: 'integration.gcp_storage' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'GCP Storage',
    description: 'Google Cloud Storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.gcp_pubsub']: {
    type: 'integration.gcp_pubsub' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'GCP Pub/Sub',
    description: 'Google Pub/Sub',
    icon: 'MessageSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.azure_blob']: {
    type: 'integration.azure_blob' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Azure Blob',
    description: 'Azure Blob Storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.azure_queue']: {
    type: 'integration.azure_queue' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Azure Queue',
    description: 'Azure Queue Storage',
    icon: 'MessageSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.cloudflare_kv']: {
    type: 'integration.cloudflare_kv' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Cloudflare KV',
    description: 'Cloudflare KV storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.cloudflare_r2']: {
    type: 'integration.cloudflare_r2' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Cloudflare R2',
    description: 'Cloudflare R2 storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.cloudflare_d1']: {
    type: 'integration.cloudflare_d1' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Cloudflare D1',
    description: 'Cloudflare D1 database',
    icon: 'Database',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.vercel_kv']: {
    type: 'integration.vercel_kv' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Vercel KV',
    description: 'Vercel KV storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.vercel_blob']: {
    type: 'integration.vercel_blob' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Vercel Blob',
    description: 'Vercel Blob storage',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.netlify']: {
    type: 'integration.netlify' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Netlify',
    description: 'Netlify deployment',
    icon: 'Cloud',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.railway']: {
    type: 'integration.railway' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Railway',
    description: 'Railway deployment',
    icon: 'Train',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.email']: {
    type: 'integration.email' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Email',
    description: 'Send email',
    icon: 'Mail',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.smtp']: {
    type: 'integration.smtp' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'SMTP',
    description: 'SMTP email',
    icon: 'Mail',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.sendgrid']: {
    type: 'integration.sendgrid' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'SendGrid',
    description: 'SendGrid email',
    icon: 'Mail',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.mailgun']: {
    type: 'integration.mailgun' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Mailgun',
    description: 'Mailgun email',
    icon: 'Mail',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.slack']: {
    type: 'integration.slack' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Slack',
    description: 'Slack messages',
    icon: 'MessageSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.discord']: {
    type: 'integration.discord' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Discord',
    description: 'Discord messages',
    icon: 'MessageCircle',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.telegram']: {
    type: 'integration.telegram' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Telegram',
    description: 'Telegram bot',
    icon: 'Send',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.whatsapp']: {
    type: 'integration.whatsapp' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'WhatsApp',
    description: 'WhatsApp messages',
    icon: 'MessageSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.twilio']: {
    type: 'integration.twilio' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Twilio',
    description: 'Twilio SMS/Voice',
    icon: 'Phone',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.sms']: {
    type: 'integration.sms' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'SMS',
    description: 'Send SMS',
    icon: 'Smartphone',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.github']: {
    type: 'integration.github' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'GitHub',
    description: 'GitHub API',
    icon: 'Github',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.gitlab']: {
    type: 'integration.gitlab' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'GitLab',
    description: 'GitLab API',
    icon: 'GitBranch',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.bitbucket']: {
    type: 'integration.bitbucket' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Bitbucket',
    description: 'Bitbucket API',
    icon: 'GitBranch',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.jira']: {
    type: 'integration.jira' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Jira',
    description: 'Jira issues',
    icon: 'Bug',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.linear']: {
    type: 'integration.linear' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Linear',
    description: 'Linear issues',
    icon: 'ListTodo',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.asana']: {
    type: 'integration.asana' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Asana',
    description: 'Asana tasks',
    icon: 'CheckSquare',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.notion']: {
    type: 'integration.notion' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Notion',
    description: 'Notion API',
    icon: 'BookOpen',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.airtable']: {
    type: 'integration.airtable' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Airtable',
    description: 'Airtable API',
    icon: 'Table',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.google_sheets']: {
    type: 'integration.google_sheets' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Google Sheets',
    description: 'Google Sheets API',
    icon: 'Sheet',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.excel']: {
    type: 'integration.excel' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Excel',
    description: 'Microsoft Excel',
    icon: 'FileSpreadsheet',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.stripe']: {
    type: 'integration.stripe' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Stripe',
    description: 'Stripe payments',
    icon: 'CreditCard',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.paypal']: {
    type: 'integration.paypal' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'PayPal',
    description: 'PayPal payments',
    icon: 'CreditCard',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.square']: {
    type: 'integration.square' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Square',
    description: 'Square payments',
    icon: 'CreditCard',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.plaid']: {
    type: 'integration.plaid' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Plaid',
    description: 'Plaid banking',
    icon: 'Building',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.quickbooks']: {
    type: 'integration.quickbooks' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'QuickBooks',
    description: 'QuickBooks accounting',
    icon: 'Calculator',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.google_analytics']: {
    type: 'integration.google_analytics' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Google Analytics',
    description: 'Google Analytics',
    icon: 'BarChart',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.mixpanel']: {
    type: 'integration.mixpanel' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Mixpanel',
    description: 'Mixpanel analytics',
    icon: 'TrendingUp',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.segment']: {
    type: 'integration.segment' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Segment',
    description: 'Segment CDP',
    icon: 'Activity',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.amplitude']: {
    type: 'integration.amplitude' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'Amplitude',
    description: 'Amplitude analytics',
    icon: 'BarChart2',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['integration.posthog']: {
    type: 'integration.posthog' as NodeType,
    category: 'integration' as NodeCategory,
    name: 'PostHog',
    description: 'PostHog analytics',
    icon: 'LineChart',
    color: '#ec4899',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.LOADER_CSV]: {
    type: NodeType.LOADER_CSV,
    category: NodeCategory.LOADER,
    name: 'CSV Loader',
    description: 'Load CSV data from a URL or workflow input',
    icon: 'FileSpreadsheet',
    color: '#06b6d4',
    configSchema: loaderCsvSchema,
    defaultConfig: { delimiter: ',', hasHeader: true, columns: [] },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'rows', type: 'array' }],
  },

  [NodeType.LOADER_JSON]: {
    type: NodeType.LOADER_JSON,
    category: NodeCategory.LOADER,
    name: 'JSON Loader',
    description: 'Load and traverse JSON from a URL or workflow input',
    icon: 'Braces',
    color: '#06b6d4',
    configSchema: loaderJsonSchema,
    defaultConfig: { path: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'data', type: 'any' }],
  },

  [NodeType.LOADER_PDF]: {
    type: NodeType.LOADER_PDF,
    category: NodeCategory.LOADER,
    name: 'PDF Loader',
    description: 'Extract text from PDF documents via URL',
    icon: 'FileText',
    color: '#06b6d4',
    configSchema: loaderPdfSchema,
    defaultConfig: { url: '', extractMetadata: false },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'text', type: 'string' }],
  },

  [NodeType.LOADER_WEBPAGE]: {
    type: NodeType.LOADER_WEBPAGE,
    category: NodeCategory.LOADER,
    name: 'Webpage Loader',
    description: 'Fetch and clean webpage content',
    icon: 'Globe',
    color: '#06b6d4',
    configSchema: loaderWebpageSchema,
    defaultConfig: { url: '', selector: '', includeLinks: false },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'text', type: 'string' }],
  },

  [NodeType.LOADER_GITHUB]: {
    type: NodeType.LOADER_GITHUB,
    category: NodeCategory.LOADER,
    name: 'GitHub Loader',
    description: 'Load repository files from the GitHub contents API',
    icon: 'Github',
    color: '#06b6d4',
    configSchema: loaderGithubSchema,
    defaultConfig: { repo: '', path: '', branch: 'main', fileTypes: [] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'files', type: 'array' }],
  },

  [NodeType.LOADER_NOTION]: {
    type: NodeType.LOADER_NOTION,
    category: NodeCategory.LOADER,
    name: 'Notion Loader',
    description: 'Load pages or databases from Notion',
    icon: 'BookOpen',
    color: '#06b6d4',
    configSchema: loaderNotionSchema,
    defaultConfig: { pageId: '', databaseId: '', recursive: false },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'content', type: 'string' }],
  },

  [NodeType.LOADER_GOOGLE_DRIVE]: {
    type: NodeType.LOADER_GOOGLE_DRIVE,
    category: NodeCategory.LOADER,
    name: 'Google Drive Loader',
    description: 'Load file contents from Google Drive',
    icon: 'HardDriveDownload',
    color: '#06b6d4',
    configSchema: loaderGoogleDriveSchema,
    defaultConfig: { fileId: '', mimeType: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'content', type: 'string' }],
  },

  [NodeType.LOADER_AIRTABLE]: {
    type: NodeType.LOADER_AIRTABLE,
    category: NodeCategory.LOADER,
    name: 'Airtable Loader',
    description: 'Load table records from Airtable',
    icon: 'Table',
    color: '#06b6d4',
    configSchema: loaderAirtableSchema,
    defaultConfig: { baseId: '', tableId: '', filterFormula: '', maxRecords: 100 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'records', type: 'array' }],
  },

  [NodeType.LOADER_RSS]: {
    type: NodeType.LOADER_RSS,
    category: NodeCategory.LOADER,
    name: 'RSS Loader',
    description: 'Parse RSS or Atom feeds',
    icon: 'Rss',
    color: '#06b6d4',
    configSchema: loaderRssSchema,
    defaultConfig: { url: '', maxItems: 10, includeContent: false },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'items', type: 'array' }],
  },

  [NodeType.LOADER_SITEMAP]: {
    type: NodeType.LOADER_SITEMAP,
    category: NodeCategory.LOADER,
    name: 'Sitemap Loader',
    description: 'Parse sitemap URLs',
    icon: 'Map',
    color: '#06b6d4',
    configSchema: loaderSitemapSchema,
    defaultConfig: { url: '', maxUrls: 50, filter: '' },
    inputs: [{ name: 'input', type: 'string', required: false }],
    outputs: [{ name: 'urls', type: 'array' }],
  },

  ['output.response']: {
    type: 'output.response' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Response',
    description: 'Return response',
    icon: 'CheckCircle',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.json']: {
    type: 'output.json' as NodeType,
    category: 'output' as NodeCategory,
    name: 'JSON Output',
    description: 'Output JSON',
    icon: 'Braces',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.file']: {
    type: 'output.file' as NodeType,
    category: 'output' as NodeCategory,
    name: 'File Output',
    description: 'Save to file',
    icon: 'FileOutput',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.notification']: {
    type: 'output.notification' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Notification',
    description: 'Send notification',
    icon: 'Bell',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.export']: {
    type: 'output.export' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Export',
    description: 'Export data',
    icon: 'Download',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.log']: {
    type: 'output.log' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Log',
    description: 'Log output',
    icon: 'FileText',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.webhook']: {
    type: 'output.webhook' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Webhook Output',
    description: 'Send to webhook',
    icon: 'Send',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.email']: {
    type: 'output.email' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Email Output',
    description: 'Email results',
    icon: 'Mail',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.storage']: {
    type: 'output.storage' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Storage',
    description: 'Store data',
    icon: 'HardDrive',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['output.stream']: {
    type: 'output.stream' as NodeType,
    category: 'output' as NodeCategory,
    name: 'Stream',
    description: 'Stream output',
    icon: 'Radio',
    color: '#84cc16',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.delay']: {
    type: 'utility.delay' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Delay',
    description: 'Add delay',
    icon: 'Timer',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.log']: {
    type: 'utility.log' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Log',
    description: 'Log message',
    icon: 'FileText',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.variable']: {
    type: 'utility.variable' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Set Variable',
    description: 'Store a workflow variable for downstream nodes',
    icon: 'Variable',
    color: '#8B5CF6',
    configSchema: utilityVariableSchema,
    defaultConfig: { name: '', value: '' },
    inputs: [{ name: 'data', type: 'any', required: false }],
    outputs: [{ name: 'data', type: 'any' }],
  },

  ['utility.get_variable']: {
    type: 'utility.get_variable' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Get Variable',
    description: 'Read a workflow variable set earlier in the flow',
    icon: 'Package',
    color: '#8B5CF6',
    configSchema: utilityGetVariableSchema,
    defaultConfig: { name: '' },
    inputs: [],
    outputs: [{ name: 'data', type: 'any' }],
  },

  ['utility.cache']: {
    type: 'utility.cache' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Cache',
    description: 'Cache data',
    icon: 'Archive',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.queue']: {
    type: 'utility.queue' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Queue',
    description: 'Queue operations',
    icon: 'List',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.crypto']: {
    type: 'utility.crypto' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Encrypt/Decrypt',
    description: 'Cryptography',
    icon: 'Lock',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.hash']: {
    type: 'utility.hash' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Hash',
    description: 'Hash data',
    icon: 'Hash',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.uuid']: {
    type: 'utility.uuid' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'UUID',
    description: 'Generate UUID',
    icon: 'Fingerprint',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.date']: {
    type: 'utility.date' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Date/Time',
    description: 'Date operations',
    icon: 'Calendar',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.math']: {
    type: 'utility.math' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Math',
    description: 'Math operations',
    icon: 'Calculator',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.TOOL_CALCULATOR]: {
    type: NodeType.TOOL_CALCULATOR,
    category: NodeCategory.TOOL,
    name: 'Calculator',
    description: 'Evaluate safe math expressions',
    icon: 'Calculator',
    color: '#14b8a6',
    configSchema: toolCalculatorSchema,
    defaultConfig: { expression: '' },
    inputs: [{ name: 'expression', type: 'string', required: false }],
    outputs: [{ name: 'result', type: 'number' }],
  },

  [NodeType.TOOL_WEB_SEARCH]: {
    type: NodeType.TOOL_WEB_SEARCH,
    category: NodeCategory.TOOL,
    name: 'Web Search',
    description: 'Search the web via Tavily, SerpAPI, or Brave',
    icon: 'Search',
    color: '#14b8a6',
    configSchema: toolWebSearchSchema,
    defaultConfig: { provider: 'tavily', query: '', maxResults: 5 },
    inputs: [{ name: 'query', type: 'string', required: false }],
    outputs: [{ name: 'results', type: 'array' }],
  },

  [NodeType.TOOL_WEB_BROWSER]: {
    type: NodeType.TOOL_WEB_BROWSER,
    category: NodeCategory.TOOL,
    name: 'Web Browser',
    description: 'Fetch and read web pages with simple extraction',
    icon: 'Globe',
    color: '#14b8a6',
    configSchema: toolWebBrowserSchema,
    defaultConfig: { url: '', action: 'read' },
    inputs: [{ name: 'url', type: 'string', required: false }],
    outputs: [{ name: 'content', type: 'string' }],
  },

  [NodeType.TOOL_DATETIME]: {
    type: NodeType.TOOL_DATETIME,
    category: NodeCategory.TOOL,
    name: 'Datetime',
    description: 'Perform common date and time operations',
    icon: 'Clock3',
    color: '#14b8a6',
    configSchema: toolDatetimeSchema,
    defaultConfig: { format: 'ISO', timezone: 'UTC', operation: 'now' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'datetime', type: 'string' }],
  },

  [NodeType.ANALYTICS_LANGFUSE]: {
    type: NodeType.ANALYTICS_LANGFUSE,
    category: NodeCategory.ANALYTICS,
    name: 'Langfuse Event',
    description: 'Log workflow events to Langfuse',
    icon: 'Activity',
    color: '#f97316',
    configSchema: analyticsLangfuseSchema,
    defaultConfig: { eventName: 'workflow.event', metadata: {}, tags: [] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'logged', type: 'boolean' }],
  },

  [NodeType.ANALYTICS_LOG]: {
    type: NodeType.ANALYTICS_LOG,
    category: NodeCategory.ANALYTICS,
    name: 'Analytics Log',
    description: 'Write structured logs during execution',
    icon: 'ScrollText',
    color: '#f97316',
    configSchema: analyticsLogSchema,
    defaultConfig: { level: 'info', message: '', includeInput: true },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'logged', type: 'boolean' }],
  },

  ['utility.string']: {
    type: 'utility.string' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'String',
    description: 'String operations',
    icon: 'Type',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.validator']: {
    type: 'utility.validator' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Validate',
    description: 'Data validation',
    icon: 'CheckCircle',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.parser']: {
    type: 'utility.parser' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Parser',
    description: 'Parse data',
    icon: 'FileCode',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.template']: {
    type: 'utility.template' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Template',
    description: 'Template engine',
    icon: 'FileText',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['utility.random']: {
    type: 'utility.random' as NodeType,
    category: 'utility' as NodeCategory,
    name: 'Random',
    description: 'Random data',
    icon: 'Shuffle',
    color: '#94a3b8',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['data.csv_read']: {
    type: 'data.csv_read' as NodeType,
    category: NodeCategory.DATA,
    name: 'Read CSV',
    description: 'Read CSV file',
    icon: 'FileText',
    color: '#f97316',
    configSchema: dataReadSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['data.json_read']: {
    type: 'data.json_read' as NodeType,
    category: NodeCategory.DATA,
    name: 'Read JSON',
    description: 'Read JSON file',
    icon: 'Braces',
    color: '#f97316',
    configSchema: dataReadSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['data.xml_read']: {
    type: 'data.xml_read' as NodeType,
    category: NodeCategory.DATA,
    name: 'Read XML',
    description: 'Read XML file',
    icon: 'Code',
    color: '#f97316',
    configSchema: dataReadSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['data.yaml_read']: {
    type: 'data.yaml_read' as NodeType,
    category: NodeCategory.DATA,
    name: 'Read YAML',
    description: 'Read YAML file',
    icon: 'FileCode',
    color: '#f97316',
    configSchema: dataReadSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  ['data.excel_read']: {
    type: 'data.excel_read' as NodeType,
    category: NodeCategory.DATA,
    name: 'Read Excel',
    description: 'Read Excel file',
    icon: 'FileSpreadsheet',
    color: '#f97316',
    configSchema: dataReadSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },

  [NodeType.DATA_DOCUMENT_EXTRACTOR]: {
    type: NodeType.DATA_DOCUMENT_EXTRACTOR,
    category: NodeCategory.DATA,
    name: 'Document Extractor',
    description: 'Use AI to extract structured data from document text',
    icon: 'FileSearch',
    color: '#f97316',
    configSchema: dataDocumentExtractorSchema,
    defaultConfig: { model: 'gpt-4o', schema: '', instruction: '' },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.DATA_LIST_OPERATOR]: {
    type: NodeType.DATA_LIST_OPERATOR,
    category: NodeCategory.DATA,
    name: 'List Operator',
    description: 'Filter, map, sort, slice, and deduplicate arrays',
    icon: 'List',
    color: '#f97316',
    configSchema: dataListOperatorSchema,
    defaultConfig: { operation: 'filter', sortOrder: 'asc', sliceStart: 0 },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

  [NodeType.DATA_VARIABLE_AGGREGATOR]: {
    type: NodeType.DATA_VARIABLE_AGGREGATOR,
    category: NodeCategory.DATA,
    name: 'Variable Aggregator',
    description: 'Combine multiple incoming values into one payload',
    icon: 'Combine',
    color: '#f97316',
    configSchema: dataVariableAggregatorSchema,
    defaultConfig: { mode: 'object', keys: [] },
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'object' }],
  },

};

export function getNodesByCategory(category: NodeCategory): NodeRegistryEntry[] {
  return Object.values(nodeRegistry).filter(node => node.category === category);
}

export function getNodeByType(type: NodeType): NodeRegistryEntry | undefined {
  return nodeRegistry[type];
}

export function getAllNodes(): NodeRegistryEntry[] {
  return Object.values(nodeRegistry);
}
