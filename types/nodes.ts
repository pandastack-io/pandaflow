import { Node, Edge } from 'reactflow';

export type SubNodeRole = 'model' | 'memory' | 'tool';

// Base node configuration
export interface BaseNodeConfig {
  label?: string;
  description?: string;
}

// Node categories
export enum NodeCategory {
  TRIGGER = 'trigger',
  SANDFLARE = 'sandflare',
  AGENT = 'agent',
  MEMORY = 'memory',
  AI = 'ai',
  PRISM = 'prism',
  TOOL = 'tool',
  ANALYTICS = 'analytics',
  RAG = 'rag',
  EMBEDDING = 'embedding',
  VECTORSTORE = 'vectorstore',
  TRANSFORM = 'transform',
  CONTROL = 'control',
  INTEGRATION = 'integration',
  LOADER = 'loader',
  OUTPUT = 'output',
  UTILITY = 'utility',
  DATA = 'data',
  VERDICT = 'verdict',
}

// Node type definitions
export enum NodeType {
  // Triggers (10 types)
  TRIGGER_MANUAL = 'trigger.manual',
  TRIGGER_SCHEDULE = 'trigger.schedule',
  TRIGGER_WEBHOOK = 'trigger.webhook',
  TRIGGER_EVENT = 'trigger.event',
  TRIGGER_EMAIL = 'trigger.email',
  TRIGGER_FILE_WATCH = 'trigger.file_watch',
  TRIGGER_DATABASE = 'trigger.database',
  TRIGGER_MQTT = 'trigger.mqtt',
  TRIGGER_WEBSOCKET = 'trigger.websocket',
  TRIGGER_KAFKA = 'trigger.kafka',

  // Sandflare/Code Execution (12 types)
  SANDFLARE_EXECUTE = 'sandflare.execute',
  SANDFLARE_SCRAPE = 'sandflare.scrape',
  SANDFLARE_PYTHON = 'sandflare.python',
  SANDFLARE_NODEJS = 'sandflare.nodejs',
  SANDFLARE_GO = 'sandflare.go',
  SANDFLARE_RUST = 'sandflare.rust',
  SANDFLARE_BASH = 'sandflare.bash',
  SANDFLARE_RUBY = 'sandflare.ruby',
  SANDFLARE_PHP = 'sandflare.php',
  SANDFLARE_JAVA = 'sandflare.java',
  SANDFLARE_DOCKER = 'sandflare.docker',
  SANDFLARE_JUPYTER = 'sandflare.jupyter',
  // Sandflare advanced features (all operate on the shared sandbox)
  SANDFLARE_FILE_WRITE = 'sandflare.file_write',
  SANDFLARE_FILE_READ = 'sandflare.file_read',
  SANDFLARE_FILE_LIST = 'sandflare.file_list',
  SANDFLARE_INSTALL = 'sandflare.install',
  SANDFLARE_SNAPSHOT = 'sandflare.snapshot',
  SANDFLARE_FORK = 'sandflare.fork',
  SANDFLARE_GIT_CLONE = 'sandflare.git_clone',
  SANDFLARE_PLAYWRIGHT = 'sandflare.playwright',
  SANDFLARE_MEMORY_ADD = 'sandflare.memory_add',
  SANDFLARE_MEMORY_SEARCH = 'sandflare.memory_search',
  SANDFLARE_METRICS = 'sandflare.metrics',

  // Agent Chain (8 types)
  AGENT_LLM = 'agent.llm',
  AGENT_REACT = 'agent.react',
  AGENT_TOOL = 'agent.tool',
  AGENT_CONDITION = 'agent.condition',
  AGENT_LOOP = 'agent.loop',
  AGENT_SUPERVISOR = 'agent.supervisor',
  AGENT_WORKER = 'agent.worker',
  AGENT_PLANNER = 'agent.planner',
  AGENT_PUBLISH = 'agent.publish',
  AGENT_SUBSCRIBE = 'agent.subscribe',
  AGENT_CALL = 'agent.call',

  // Memory
  MEMORY_BUFFER = 'memory.buffer',
  MEMORY_REDIS = 'memory.redis',
  MEMORY_POSTGRES = 'memory.postgres',
  MEMORY_SUMMARY = 'memory.summary',
  MEMORY_WINDOW = 'memory.window',
  MEMORY_AGENT_READ = 'memory.agent_read',
  MEMORY_AGENT_WRITE = 'memory.agent_write',
  MEMORY_EPISODIC_GET = 'memory.episodic_get',

  // RAG Pipeline (8 types)
  RAG_PDF_LOADER = 'rag.pdf_loader',
  RAG_WEB_LOADER = 'rag.web_loader',
  RAG_TEXT_SPLITTER = 'rag.text_splitter',
  RAG_EMBEDDER = 'rag.embedder',
  RAG_VECTOR_STORE = 'rag.vector_store',
  RAG_RETRIEVER = 'rag.retriever',
  RAG_QA_CHAIN = 'rag.qa_chain',
  RAG_RERANKER = 'rag.reranker',
  RAG_KNOWLEDGE_INDEXER = 'rag.knowledge_indexer',

  // Embeddings (3 types)
  EMBEDDING_OPENAI = 'embedding.openai',
  EMBEDDING_COHERE = 'embedding.cohere',
  EMBEDDING_HUGGINGFACE = 'embedding.huggingface',

  // Vector Stores (6 types)
  VECTORSTORE_PINECONE = 'vectorstore.pinecone',
  VECTORSTORE_QDRANT = 'vectorstore.qdrant',
  VECTORSTORE_CHROMA = 'vectorstore.chroma',
  VECTORSTORE_WEAVIATE = 'vectorstore.weaviate',
  VECTORSTORE_PGVECTOR = 'vectorstore.pgvector',
  VECTORSTORE_REDIS = 'vectorstore.redis',

  // AI/LLM (17 types)
  AI_LLM = 'ai.llm',
  AI_ANTHROPIC = 'ai.anthropic',
  AI_MISTRAL = 'ai.mistral',
  AI_GROQ = 'ai.groq',
  AI_OLLAMA = 'ai.ollama',
  AI_CHAT = 'ai.chat',
  AI_COMPLETION = 'ai.completion',
  AI_EMBEDDING = 'ai.embedding',
  AI_VECTOR_SEARCH = 'ai.vector_search',
  AI_CLASSIFICATION = 'ai.classification',
  AI_SENTIMENT = 'ai.sentiment',
  AI_SUMMARIZATION = 'ai.summarization',
  AI_TRANSLATION = 'ai.translation',
  AI_IMAGE_GEN = 'ai.image_generation',
  AI_IMAGE_ANALYZE = 'ai.image_analysis',
  AI_SPEECH_TO_TEXT = 'ai.speech_to_text',
  AI_TEXT_TO_SPEECH = 'ai.text_to_speech',
  AI_OCR = 'ai.ocr',
  AI_MODERATION = 'ai.moderation',
  AI_PARAMETER_EXTRACTOR = 'ai.parameter_extractor',
  AI_QUESTION_CLASSIFIER = 'ai.question_classifier',

  // Data Transform (15 types)
  TRANSFORM_DATA = 'transform.data',
  TRANSFORM_FILTER = 'transform.filter',
  TRANSFORM_MAP = 'transform.map',
  TRANSFORM_REDUCE = 'transform.reduce',
  TRANSFORM_AGGREGATE = 'transform.aggregate',
  TRANSFORM_SPLIT = 'transform.split',
  TRANSFORM_MERGE = 'transform.merge',
  TRANSFORM_SORT = 'transform.sort',
  TRANSFORM_DEDUPE = 'transform.dedupe',
  TRANSFORM_JSON = 'transform.json',
  TRANSFORM_XML = 'transform.xml',
  TRANSFORM_CSV = 'transform.csv',
  TRANSFORM_YAML = 'transform.yaml',
  TRANSFORM_HTML = 'transform.html',
  TRANSFORM_REGEX = 'transform.regex',

  // Control Flow (10 types)
  CONTROL_CONDITION = 'control.condition',
  CONTROL_SWITCH = 'control.switch',
  CONTROL_LOOP = 'control.loop',
  CONTROL_FOREACH = 'control.foreach',
  CONTROL_WHILE = 'control.while',
  CONTROL_PARALLEL = 'control.parallel',
  CONTROL_SEQUENCE = 'control.sequence',
  CONTROL_ERROR = 'control.error',
  CONTROL_RETRY = 'control.retry',
  CONTROL_TIMEOUT = 'control.timeout',
  HUMAN_APPROVAL = 'human.approval',
  CONTROL_SUB_WORKFLOW = 'control.sub_workflow',

  // Integration - APIs (10 types)
  INTEGRATION_HTTP = 'integration.http',
  INTEGRATION_GRAPHQL = 'integration.graphql',
  INTEGRATION_REST = 'integration.rest',
  INTEGRATION_SOAP = 'integration.soap',
  INTEGRATION_WEBHOOK = 'integration.webhook',
  INTEGRATION_GRPC = 'integration.grpc',
  INTEGRATION_WEBSOCKET_CLIENT = 'integration.websocket',
  INTEGRATION_SSE = 'integration.sse',
  INTEGRATION_OAUTH = 'integration.oauth',
  INTEGRATION_API_KEY = 'integration.api_key',

  // Integration - Databases (10 types)
  INTEGRATION_DATABASE = 'integration.database',
  INTEGRATION_POSTGRES = 'integration.postgres',
  INTEGRATION_MYSQL = 'integration.mysql',
  INTEGRATION_MONGODB = 'integration.mongodb',
  INTEGRATION_REDIS = 'integration.redis',
  INTEGRATION_ELASTICSEARCH = 'integration.elasticsearch',
  INTEGRATION_DYNAMODB = 'integration.dynamodb',
  INTEGRATION_CASSANDRA = 'integration.cassandra',
  INTEGRATION_FIRESTORE = 'integration.firestore',
  INTEGRATION_SUPABASE = 'integration.supabase',

  // Integration - Cloud Services (15 types)
  INTEGRATION_AWS_S3 = 'integration.aws_s3',
  INTEGRATION_AWS_LAMBDA = 'integration.aws_lambda',
  INTEGRATION_AWS_SQS = 'integration.aws_sqs',
  INTEGRATION_AWS_SNS = 'integration.aws_sns',
  INTEGRATION_GCP_STORAGE = 'integration.gcp_storage',
  INTEGRATION_GCP_PUBSUB = 'integration.gcp_pubsub',
  INTEGRATION_AZURE_BLOB = 'integration.azure_blob',
  INTEGRATION_AZURE_QUEUE = 'integration.azure_queue',
  INTEGRATION_CLOUDFLARE_KV = 'integration.cloudflare_kv',
  INTEGRATION_CLOUDFLARE_R2 = 'integration.cloudflare_r2',
  INTEGRATION_CLOUDFLARE_D1 = 'integration.cloudflare_d1',
  INTEGRATION_VERCEL_KV = 'integration.vercel_kv',
  INTEGRATION_VERCEL_BLOB = 'integration.vercel_blob',
  INTEGRATION_NETLIFY = 'integration.netlify',
  INTEGRATION_RAILWAY = 'integration.railway',

  // Integration - Communication (10 types)
  INTEGRATION_EMAIL = 'integration.email',
  INTEGRATION_SMTP = 'integration.smtp',
  INTEGRATION_SENDGRID = 'integration.sendgrid',
  INTEGRATION_MAILGUN = 'integration.mailgun',
  INTEGRATION_SLACK = 'integration.slack',
  INTEGRATION_DISCORD = 'integration.discord',
  INTEGRATION_TELEGRAM = 'integration.telegram',
  INTEGRATION_WHATSAPP = 'integration.whatsapp',
  INTEGRATION_TWILIO = 'integration.twilio',
  INTEGRATION_SMS = 'integration.sms',

  // Integration - Dev Tools (10 types)
  INTEGRATION_GITHUB = 'integration.github',
  INTEGRATION_GITLAB = 'integration.gitlab',
  INTEGRATION_BITBUCKET = 'integration.bitbucket',
  INTEGRATION_JIRA = 'integration.jira',
  INTEGRATION_LINEAR = 'integration.linear',
  INTEGRATION_ASANA = 'integration.asana',
  INTEGRATION_NOTION = 'integration.notion',
  INTEGRATION_AIRTABLE = 'integration.airtable',
  INTEGRATION_GOOGLE_SHEETS = 'integration.google_sheets',
  INTEGRATION_EXCEL = 'integration.excel',

  // Integration - Payment/Finance (5 types)
  INTEGRATION_STRIPE = 'integration.stripe',
  INTEGRATION_PAYPAL = 'integration.paypal',
  INTEGRATION_SQUARE = 'integration.square',
  INTEGRATION_PLAID = 'integration.plaid',
  INTEGRATION_QUICKBOOKS = 'integration.quickbooks',

  // Integration - Analytics (5 types)
  INTEGRATION_GOOGLE_ANALYTICS = 'integration.google_analytics',
  INTEGRATION_MIXPANEL = 'integration.mixpanel',
  INTEGRATION_SEGMENT = 'integration.segment',
  INTEGRATION_AMPLITUDE = 'integration.amplitude',
  INTEGRATION_POSTHOG = 'integration.posthog',

  // Loader (10 types)
  LOADER_CSV = 'loader.csv',
  LOADER_JSON = 'loader.json',
  LOADER_PDF = 'loader.pdf',
  LOADER_WEBPAGE = 'loader.webpage',
  LOADER_GITHUB = 'loader.github',
  LOADER_NOTION = 'loader.notion',
  LOADER_GOOGLE_DRIVE = 'loader.google_drive',
  LOADER_AIRTABLE = 'loader.airtable',
  LOADER_RSS = 'loader.rss',
  LOADER_SITEMAP = 'loader.sitemap',

  // Output (10 types)
  OUTPUT_RESPONSE = 'output.response',
  OUTPUT_JSON = 'output.json',
  OUTPUT_FILE = 'output.file',
  OUTPUT_NOTIFICATION = 'output.notification',
  OUTPUT_EXPORT = 'output.export',
  OUTPUT_LOG = 'output.log',
  OUTPUT_WEBHOOK = 'output.webhook',
  OUTPUT_EMAIL = 'output.email',
  OUTPUT_STORAGE = 'output.storage',
  OUTPUT_STREAM = 'output.stream',

  // Tooling & Observability
  TOOL_CALCULATOR = 'tool.calculator',
  TOOL_WEB_SEARCH = 'tool.web_search',
  TOOL_WEB_BROWSER = 'tool.web_browser',
  TOOL_DATETIME = 'tool.datetime',
  ANALYTICS_LANGFUSE = 'analytics.langfuse',
  ANALYTICS_LOG = 'analytics.log',

  // Utility (15 types)
  UTILITY_DELAY = 'utility.delay',
  UTILITY_LOG = 'utility.log',
  UTILITY_VARIABLE = 'utility.variable',
  UTILITY_GET_VARIABLE = 'utility.get_variable',
  UTILITY_CACHE = 'utility.cache',
  UTILITY_QUEUE = 'utility.queue',
  UTILITY_CRYPTO = 'utility.crypto',
  UTILITY_HASH = 'utility.hash',
  UTILITY_UUID = 'utility.uuid',
  UTILITY_DATE = 'utility.date',
  UTILITY_MATH = 'utility.math',
  UTILITY_STRING = 'utility.string',
  UTILITY_VALIDATOR = 'utility.validator',
  UTILITY_PARSER = 'utility.parser',
  UTILITY_TEMPLATE = 'utility.template',
  UTILITY_RANDOM = 'utility.random',

  // Verdict - AI Evaluation Framework
  VERDICT_FAITHFULNESS = 'verdict.faithfulness',
  VERDICT_CORRECTNESS = 'verdict.correctness',
  VERDICT_RELEVANCE = 'verdict.relevance',
  VERDICT_CONTEXT_PRECISION = 'verdict.context_precision',
  VERDICT_CONTEXT_RECALL = 'verdict.context_recall',
  VERDICT_HALLUCINATION = 'verdict.hallucination',
  VERDICT_TOXICITY = 'verdict.toxicity',
  VERDICT_BATCH = 'verdict.batch',

  // Prism - Universal LLM Gateway
  PRISM_LLM = 'prism.llm',
  // Data Sources (5 types)
  DATA_CSV_READ = 'data.csv_read',
  DATA_JSON_READ = 'data.json_read',
  DATA_XML_READ = 'data.xml_read',
  DATA_YAML_READ = 'data.yaml_read',
  DATA_EXCEL_READ = 'data.excel_read',
  DATA_DOCUMENT_EXTRACTOR = 'data.document_extractor',
  DATA_LIST_OPERATOR = 'data.list_operator',
  DATA_VARIABLE_AGGREGATOR = 'data.variable_aggregator',
}

export const PRISM_PROVIDER_KEYS = [
  'openai',
  'anthropic',
  'google',
  'groq',
  'deepseek',
  'perplexity',
  'together',
  'fireworks',
  'openrouter',
  'ollama',
  'lmstudio',
  'azure',
  'mistral',
  'cohere',
  'xai',
  'sambanova',
] as const;

export const PRISM_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: null,
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  google: {
    label: 'Google Gemini',
    baseUrl: null,
    envKey: 'GEMINI_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    envKey: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  perplexity: {
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    envKey: 'PERPLEXITY_API_KEY',
    models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-huge-128k-online'],
  },
  together: {
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    envKey: 'TOGETHER_API_KEY',
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'google/gemma-2-27b-it'],
  },
  fireworks: {
    label: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    envKey: 'FIREWORKS_API_KEY',
    models: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/mixtral-8x7b-instruct'],
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro-1.5', 'meta-llama/llama-3.1-405b-instruct'],
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    envKey: 'OLLAMA_API_KEY',
    models: ['llama3', 'mistral', 'codellama'],
  },
  lmstudio: {
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    envKey: 'LMSTUDIO_API_KEY',
    models: ['local-model'],
  },
  azure: {
    label: 'Azure OpenAI',
    baseUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-01',
    envKey: 'AZURE_OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini'],
  },
  mistral: {
    label: 'Mistral',
    baseUrl: null,
    envKey: 'MISTRAL_API_KEY',
    models: ['mistral-large-latest', 'mistral-small-latest', 'open-mixtral-8x7b'],
  },
  cohere: {
    label: 'Cohere',
    baseUrl: null,
    envKey: 'COHERE_API_KEY',
    models: ['command-r-plus', 'command-r'],
  },
  xai: {
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    models: ['grok-beta', 'grok-2'],
  },
  sambanova: {
    label: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    envKey: 'SAMBANOVA_API_KEY',
    models: ['Meta-Llama-3.1-405B-Instruct', 'Meta-Llama-3.3-70B-Instruct'],
  },
} as const;

export type PrismProvider = keyof typeof PRISM_PROVIDERS;

// Trigger Nodes
export interface ManualTriggerConfig extends BaseNodeConfig {
  inputSchema?: Record<string, any>;
}

export interface ScheduleTriggerConfig extends BaseNodeConfig {
  cron: string;
  timezone?: string;
  enabled?: boolean;
}

export interface WebhookTriggerConfig extends BaseNodeConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  authType?: 'none' | 'bearer' | 'api_key' | 'hmac';
  authConfig?: Record<string, any>;
  requestSchema?: Record<string, any>;
}

// Agent Chain Node Configs
export interface AgentLLMConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere';
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];       // tool node IDs connected to this agent
  memoryNodeId?: string;  // optional connected memory node
  outputFormat?: 'text' | 'json';
  streaming?: boolean;
}

export interface AgentReActConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  systemPrompt: string;
  maxIterations?: number;
  tools?: string[];
  memoryNodeId?: string;
  temperature?: number;
  verbose?: boolean;
}

export interface AgentToolConfig extends BaseNodeConfig {
  name: string;
  description: string;
  language: 'python' | 'nodejs';
  code: string;
  parameters?: { name: string; type: string; description: string; required?: boolean }[];
  returnType?: 'string' | 'json' | 'number';
}

export interface AgentConditionConfig extends BaseNodeConfig {
  conditionType: 'llm' | 'expression';
  prompt?: string;         // for LLM-based routing
  expression?: string;     // for expression-based routing
  provider?: string;
  model?: string;
  trueBranch?: string;
  falseBranch?: string;
}

export interface AgentLoopConfig extends BaseNodeConfig {
  maxIterations: number;
  exitCondition: 'llm' | 'expression' | 'count';
  conditionPrompt?: string;
  conditionExpression?: string;
  aggregateResults?: boolean;
}

export interface AgentSupervisorConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  systemPrompt: string;
  workers: string[];        // worker node IDs
  routingStrategy: 'llm' | 'round_robin' | 'keyword';
  maxRounds?: number;
}

export interface AgentWorkerConfig extends BaseNodeConfig {
  name: string;
  description: string;     // tells supervisor what this worker does
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  systemPrompt: string;
  tools?: string[];
}

// Memory Node Configs
export interface MemoryBufferConfig extends BaseNodeConfig {
  maxMessages?: number;    // default 10 — last N messages kept
  sessionKey?: string;     // defaults to executionId
}

export interface MemoryRedisConfig extends BaseNodeConfig {
  sessionKey?: string;
  ttlSeconds?: number;     // default 3600
  maxMessages?: number;
}

export interface MemoryPostgresConfig extends BaseNodeConfig {
  sessionKey?: string;
  maxMessages?: number;
  tableName?: string;
}

export interface MemorySummaryConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  maxTokensBeforeSummary?: number;  // default 2000
  sessionKey?: string;
}

export interface MemoryWindowConfig extends BaseNodeConfig {
  windowSize: number;       // keep last N human+AI message pairs
  sessionKey?: string;
}

// RAG Pipeline Node Configs
export interface RagPdfLoaderConfig extends BaseNodeConfig {
  source: 'url' | 'base64' | 'variable';
  url?: string;
  variableName?: string;
  splitPages?: boolean;
  extractImages?: boolean;
}

export interface RagWebLoaderConfig extends BaseNodeConfig {
  url: string;
  recursive?: boolean;
  maxDepth?: number;
  selector?: string;       // CSS selector to extract specific content
  excludeSelectors?: string[];
}

export interface RagTextSplitterConfig extends BaseNodeConfig {
  strategy: 'recursive' | 'character' | 'token' | 'markdown' | 'code';
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  language?: string;       // for code splitter
}

export interface RagEmbedderConfig extends BaseNodeConfig {
  provider: 'openai' | 'cohere' | 'huggingface' | 'local';
  model: string;           // e.g. 'text-embedding-3-small'
  batchSize?: number;
  dimensions?: number;
}

export interface RagVectorStoreConfig extends BaseNodeConfig {
  backend: 'pinecone' | 'qdrant' | 'chroma' | 'pgvector' | 'memory';
  operation: 'upsert' | 'query' | 'delete';
  indexName?: string;
  namespace?: string;
  connectionString?: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface EmbeddingOpenAIConfig extends BaseNodeConfig {
  model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  input?: string;
}

export interface EmbeddingCohereConfig extends BaseNodeConfig {
  model: 'embed-english-v3.0' | 'embed-multilingual-v3.0';
  inputType: 'search_document' | 'search_query';
}

export interface EmbeddingHuggingFaceConfig extends BaseNodeConfig {
  model?: string;
}

export interface VectorStorePineconeConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query' | 'delete';
  indexName: string;
  namespace?: string;
  topK?: number;
  includeMetadata?: boolean;
}

export interface VectorStoreQdrantConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query' | 'delete';
  collectionName: string;
  topK?: number;
}

export interface VectorStoreChromaConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query' | 'delete';
  collectionName: string;
  topK?: number;
}

export interface VectorStoreWeaviateConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query';
  className: string;
  topK?: number;
}

export interface VectorStorePgVectorConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query';
  tableName?: string;
  topK?: number;
}

export interface VectorStoreRedisConfig extends BaseNodeConfig {
  operation: 'upsert' | 'query';
  keyPrefix?: string;
  topK?: number;
}

export interface RagRetrieverConfig extends BaseNodeConfig {
  strategy: 'similarity' | 'mmr' | 'threshold';
  topK: number;
  scoreThreshold?: number;
  fetchK?: number;         // for MMR — candidate pool size
  lambdaMult?: number;     // for MMR — diversity factor
}

export interface RagQaChainConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  systemPrompt?: string;
  contextTemplate?: string; // how to inject retrieved docs into prompt
  returnSources?: boolean;
  maxContextTokens?: number;
}

export interface RagRerankerConfig extends BaseNodeConfig {
  provider: 'cohere' | 'voyageai' | 'local';
  model: string;
  topN: number;
}

// Sandflare Nodes
export interface SandflareExecuteConfig extends BaseNodeConfig {
  language: 'python' | 'nodejs' | 'go' | 'rust' | 'bash';
  code: string;
  environment?: Record<string, string>;
  packages?: string[];
  timeout?: number;
  memoryLimit?: number;
}

export interface SandflareScraperConfig extends BaseNodeConfig {
  url: string;
  extractionRules?: any;
  javascript?: boolean;
  waitFor?: string;
  screenshot?: boolean;
  pdfGeneration?: boolean;
}

// AI Nodes
export interface LLMConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: 'text' | 'json';
}

export interface PrismLLMConfig extends BaseNodeConfig {
  provider: PrismProvider;
  model: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  streamOutput?: boolean;
}

export interface VectorSearchConfig extends BaseNodeConfig {
  embeddingModel: string;
  query: string;
  topK?: number;
  threshold?: number;
  collection?: string;
}

export interface ParameterExtractorConfig extends BaseNodeConfig {
  model?: string;
  parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    description: string;
    required: boolean;
  }>;
  instruction?: string;
}

export interface QuestionClassifierConfig extends BaseNodeConfig {
  model?: string;
  classes: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  instruction?: string;
}

export interface KnowledgeIndexerConfig extends BaseNodeConfig {
  collectionName: string;
  embeddingModel: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  chunkSize?: number;
  chunkOverlap?: number;
  metadata?: Record<string, string>;
}

export interface DocumentExtractorConfig extends BaseNodeConfig {
  model?: string;
  schema: string;
  instruction?: string;
}

export interface ListOperatorConfig extends BaseNodeConfig {
  operation: 'filter' | 'map' | 'sort' | 'slice' | 'unique' | 'count';
  filterExpression?: string;
  mapExpression?: string;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
  sliceStart?: number;
  sliceEnd?: number;
}

export interface VariableAggregatorConfig extends BaseNodeConfig {
  mode: 'object' | 'array' | 'merge';
  keys?: string[];
}

export interface AnthropicNodeConfig extends BaseNodeConfig {
  model: 'claude-opus-4-5' | 'claude-sonnet-4-5' | 'claude-haiku-4-5';
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface MistralNodeConfig extends BaseNodeConfig {
  model: 'mistral-large-latest' | 'mistral-small-latest' | 'open-mixtral-8x7b';
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface GroqNodeConfig extends BaseNodeConfig {
  model: 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant' | 'mixtral-8x7b-32768' | 'gemma2-9b-it';
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface OllamaNodeConfig extends BaseNodeConfig {
  model: string;
  host: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface ToolCalculatorConfig extends BaseNodeConfig {
  expression?: string;
}

export interface ToolWebSearchConfig extends BaseNodeConfig {
  provider: 'tavily' | 'serpapi' | 'brave';
  query: string;
  maxResults?: number;
}

export interface ToolWebBrowserConfig extends BaseNodeConfig {
  url: string;
  action: 'read' | 'screenshot' | 'extract';
  selector?: string;
}

export interface ToolDatetimeConfig extends BaseNodeConfig {
  format?: string;
  timezone?: string;
  operation: 'now' | 'add' | 'subtract' | 'format' | 'diff';
  amount?: number;
  unit?: 'days' | 'hours' | 'minutes' | 'seconds';
}

export interface AnalyticsLangfuseConfig extends BaseNodeConfig {
  eventName: string;
  input?: string;
  output?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface AnalyticsLogConfig extends BaseNodeConfig {
  level: 'info' | 'warn' | 'error';
  message: string;
  includeInput?: boolean;
}

// Transform Nodes
export interface DataTransformConfig extends BaseNodeConfig {
  transformType: 'jsonpath' | 'jmespath' | 'javascript';
  transformation: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
}

export interface FilterConfig extends BaseNodeConfig {
  conditions: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
    value: any;
  }>;
  logic?: 'AND' | 'OR';
}

export interface AggregateConfig extends BaseNodeConfig {
  groupBy?: string[];
  aggregations: Array<{
    field: string;
    function: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'first' | 'last';
    alias?: string;
  }>;
}

// Control Flow Nodes
export interface ConditionConfig extends BaseNodeConfig {
  condition: string;
  evaluationType: 'expression' | 'javascript';
}

export interface LoopConfig extends BaseNodeConfig {
  loopType: 'forEach' | 'while';
  array?: string;
  condition?: string;
  maxIterations?: number;
  parallel?: boolean;
  batchSize?: number;
}

// Integration Nodes
export interface HTTPRequestConfig extends BaseNodeConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'oauth2';
    config: Record<string, any>;
  };
  timeout?: number;
}

export interface DatabaseQueryConfig extends BaseNodeConfig {
  connectionId: string;
  queryType: 'select' | 'insert' | 'update' | 'delete';
  query: string;
  parameters?: Record<string, any>;
}

export interface LoaderCsvConfig extends BaseNodeConfig {
  url?: string;
  delimiter?: string;
  hasHeader?: boolean;
  columns?: string[];
}

export interface LoaderJsonConfig extends BaseNodeConfig {
  url?: string;
  path?: string;
}

export interface LoaderPdfConfig extends BaseNodeConfig {
  url: string;
  extractMetadata?: boolean;
}

export interface LoaderWebpageConfig extends BaseNodeConfig {
  url: string;
  selector?: string;
  includeLinks?: boolean;
}

export interface LoaderGithubConfig extends BaseNodeConfig {
  repo: string;
  path?: string;
  branch?: string;
  fileTypes?: string[];
}

export interface LoaderNotionConfig extends BaseNodeConfig {
  pageId?: string;
  databaseId?: string;
  recursive?: boolean;
}

export interface LoaderGoogleDriveConfig extends BaseNodeConfig {
  fileId: string;
  mimeType?: string;
}

export interface LoaderAirtableConfig extends BaseNodeConfig {
  baseId: string;
  tableId: string;
  filterFormula?: string;
  maxRecords?: number;
}

export interface LoaderRssConfig extends BaseNodeConfig {
  url: string;
  maxItems?: number;
  includeContent?: boolean;
}

export interface LoaderSitemapConfig extends BaseNodeConfig {
  url: string;
  maxUrls?: number;
  filter?: string;
}

// Node data structure
export interface WorkflowNodeData {
  type: NodeType;
  category: NodeCategory;
  config: any;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  subNodeRole?: SubNodeRole;
  status?: 'idle' | 'running' | 'completed' | 'error';
  executionStatus?: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface NodeExecutionOutput {
  input?: unknown;
  output?: unknown;
  error?: string;
}

// Workflow node type (extends React Flow Node)
export type WorkflowNode = Node<WorkflowNodeData>;

export const SUB_NODE_TYPES = {
  model: [NodeType.AGENT_LLM, NodeType.AI_LLM],
  memory: [NodeType.MEMORY_BUFFER, NodeType.MEMORY_REDIS, NodeType.MEMORY_POSTGRES, NodeType.MEMORY_AGENT_READ, NodeType.MEMORY_AGENT_WRITE],
  tool: [] as NodeType[],
} as const;

export const AGENT_NODE_TYPES = [
  NodeType.AGENT_REACT,
  NodeType.AGENT_LLM,
  NodeType.AGENT_SUPERVISOR,
  NodeType.AGENT_WORKER,
  NodeType.AGENT_PLANNER,
] as const;

export const DEPENDENCY_HANDLE_IDS = ['model', 'memory', 'tool'] as const satisfies readonly SubNodeRole[];

export function isDependencyHandleId(value?: string | null): value is SubNodeRole {
  return Boolean(value && DEPENDENCY_HANDLE_IDS.includes(value as SubNodeRole));
}

export function getSubNodeRoleForType(type: NodeType, category?: NodeCategory): SubNodeRole | undefined {
  if ((SUB_NODE_TYPES.model as readonly NodeType[]).includes(type)) {
    return 'model';
  }

  if ((SUB_NODE_TYPES.memory as readonly NodeType[]).includes(type)) {
    return 'memory';
  }

  if (type === NodeType.AGENT_TOOL || category === NodeCategory.INTEGRATION || category === NodeCategory.TOOL) {
    return 'tool';
  }

  return undefined;
}

export interface NodePortDefinition {
  name: string;
  type: string;
  required: boolean;
  label?: string;
  multiple?: boolean;
}

export interface NodeOutputDefinition {
  name: string;
  type: string;
}

// Node registry entry
export interface NodeRegistryEntry {
  type: NodeType;
  category: NodeCategory;
  name: string;
  description: string;
  icon: string;
  brandIcon?: string;
  color: string;
  configSchema: any; // Zod schema
  defaultConfig: any;
  isSubNode?: boolean;
  subNodeRole?: SubNodeRole;
  inputs: NodePortDefinition[];
  outputs: NodeOutputDefinition[];
}

export interface WorkflowVariable {
  name: string;
  defaultValue?: any;
  description?: string;
}

export interface WorkflowEnvVar {
  name: string;
  value: string;
  isSecret?: boolean;
}

export type StickyNoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: StickyNoteColor;
}

// Workflow definition
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: Edge[];
  stickyNotes?: StickyNote[];
  variables?: WorkflowVariable[];
  envVars?: WorkflowEnvVar[];
  metadata?: {
    name: string;
    description?: string;
    version?: string;
    tags?: string[];
  };
}
