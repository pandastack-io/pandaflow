import { NodeCategory, NodeType, type WorkflowDefinition, type WorkflowEnvVar, type WorkflowNode } from '@/types/nodes';

export interface WorkflowTemplateDefinition {
  nodes: unknown[];
  edges: unknown[];
  variables?: WorkflowDefinition['variables'];
  envVars?: WorkflowEnvVar[];
  metadata?: WorkflowDefinition['metadata'];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  icon: string;
  color: string;
  featured?: boolean;
  requirements?: string[];
  definition: WorkflowTemplateDefinition | null;
}

const defaultEdgeStyle = { stroke: '#0ea5e9', strokeWidth: 2 };

function getNodeCategory(type: NodeType): NodeCategory {
  return type.split('.')[0] as NodeCategory;
}

function createNode(
  id: string,
  type: NodeType,
  x: number,
  y: number,
  config: Record<string, unknown> = {}
): WorkflowNode {
  return {
    id,
    type: 'custom',
    position: { x, y },
    data: {
      type,
      category: getNodeCategory(type),
      config,
      status: 'idle',
    },
  } as WorkflowNode;
}

function createEdge(id: string, source: string, target: string, sourceHandle?: string) {
  return {
    id,
    source,
    target,
    animated: true,
    style: defaultEdgeStyle,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

function createEnvVar(name: string): WorkflowEnvVar {
  return { name, value: '', isSecret: true };
}

function createDefinition(
  name: string,
  description: string,
  nodes: WorkflowNode[],
  edges: ReturnType<typeof createEdge>[],
  envVars: WorkflowEnvVar[] = []
): WorkflowTemplateDefinition {
  return {
    nodes,
    edges,
    variables: [],
    envVars,
    metadata: {
      name,
      description,
      version: '1.0.0',
    },
  };
}

const richWorkflowTemplates: WorkflowTemplate[] = [
  {
    id: 'web-scraper-pipeline',
    name: 'Web Scraper Pipeline',
    description: 'Scrape a live page, normalize the payload, and forward structured results to a downstream webhook for enrichment or storage.',
    category: 'Automation',
    tags: ['scraping', 'webhook', 'json', 'automation'],
    difficulty: 'intermediate',
    estimatedTime: '10 min setup',
    icon: 'Globe',
    color: '#8b5cf6',
    definition: createDefinition(
      'Web Scraper Pipeline',
      'Scrape a page and push normalized results to a webhook.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Manual Run',
          description: 'Provide a target URL and optional CSS extraction rules.',
          inputSchema: {
            url: 'string',
            selectors: 'object',
          },
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 360, 220, {
          label: 'Scrape Target Page',
          url: '{{input.url}}',
          javascript: true,
          waitFor: 'networkidle',
          extractionRules: {
            title: 'h1',
            price: '.price, [data-price]',
            body: 'article, main',
          },
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 640, 220, {
          label: 'Normalize JSON',
          operation: 'stringify',
          schemaHint: 'Flatten page metadata, extracted fields, and scrape timestamp.',
        }),
        createNode('node-webhook', NodeType.OUTPUT_WEBHOOK, 920, 220, {
          label: 'Send to Webhook',
          url: '{{env.RESULTS_WEBHOOK_URL}}',
          method: 'POST',
        }),
      ],
      [
        createEdge('e-trigger-scrape', 'node-trigger', 'node-scrape'),
        createEdge('e-scrape-json', 'node-scrape', 'node-json'),
        createEdge('e-json-webhook', 'node-json', 'node-webhook'),
      ],
      [createEnvVar('RESULTS_WEBHOOK_URL')]
    ),
    requirements: ['Results webhook URL'],
  },
  {
    id: 'daily-report-emailer',
    name: 'Daily Report Emailer',
    description: 'Fetch daily KPI data, summarize trends with an LLM, and email a concise executive report to stakeholders every morning.',
    category: 'Automation',
    tags: ['email', 'reporting', 'http', 'openai'],
    difficulty: 'beginner',
    estimatedTime: '8 min setup',
    icon: 'Mail',
    color: '#f59e0b',
    featured: true,
    definition: createDefinition(
      'Daily Report Emailer',
      'Fetch operational data, summarize it, and email a daily brief.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 80, 220, {
          label: 'Weekday Schedule',
          cron: '0 9 * * 1-5',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 360, 220, {
          label: 'Fetch KPI Snapshot',
          url: '{{env.REPORT_SOURCE_URL}}',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{env.REPORT_SOURCE_TOKEN}}',
          },
        }),
        createNode('node-llm', NodeType.AI_LLM, 640, 220, {
          label: 'Summarize Metrics',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.3,
          prompt: "Summarize today's metrics, highlight anomalies, and recommend next actions.",
          systemPrompt: 'You are an operations analyst writing crisp daily performance updates.',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 920, 220, {
          label: 'Send Executive Email',
          to: '{{env.REPORT_RECIPIENTS}}',
          subject: 'Daily Operations Report',
        }),
      ],
      [
        createEdge('e-trigger-http', 'node-trigger', 'node-http'),
        createEdge('e-http-llm', 'node-http', 'node-llm'),
        createEdge('e-llm-email', 'node-llm', 'node-email'),
      ],
      [createEnvVar('REPORT_SOURCE_URL'), createEnvVar('REPORT_SOURCE_TOKEN'), createEnvVar('OPENAI_API_KEY'), createEnvVar('EMAIL_API_KEY'), createEnvVar('REPORT_RECIPIENTS')]
    ),
    requirements: ['OpenAI API key', 'Report API token', 'Email provider credentials'],
  },
  {
    id: 'github-pr-summarizer',
    name: 'GitHub PR Summarizer',
    description: 'Capture pull request events, fetch PR details from GitHub, generate a reviewer-ready summary, and post it into Slack.',
    category: 'Automation',
    tags: ['github', 'slack', 'pull-request', 'review'],
    difficulty: 'intermediate',
    estimatedTime: '12 min setup',
    icon: 'Github',
    color: '#ec4899',
    featured: true,
    definition: createDefinition(
      'GitHub PR Summarizer',
      'Summarize pull requests and notify a review channel.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'PR Webhook',
          method: 'POST',
          authType: 'hmac',
        }),
        createNode('node-github', NodeType.INTEGRATION_GITHUB, 360, 220, {
          label: 'Fetch PR Context',
          operation: 'get_pull_request',
          includeFiles: true,
          includeDiff: true,
        }),
        createNode('node-llm', NodeType.AI_LLM, 640, 220, {
          label: 'Create Review Summary',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          prompt: 'Summarize the pull request, identify risky files, and suggest review focus areas.',
          systemPrompt: 'You are a senior engineering manager triaging code reviews.',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 920, 220, {
          label: 'Notify Slack Reviewers',
          channel: '{{env.SLACK_REVIEW_CHANNEL}}',
        }),
      ],
      [
        createEdge('e-trigger-github', 'node-trigger', 'node-github'),
        createEdge('e-github-llm', 'node-github', 'node-llm'),
        createEdge('e-llm-slack', 'node-llm', 'node-slack'),
      ],
      [createEnvVar('GITHUB_TOKEN'), createEnvVar('OPENAI_API_KEY'), createEnvVar('SLACK_BOT_TOKEN'), createEnvVar('SLACK_REVIEW_CHANNEL'), createEnvVar('GITHUB_WEBHOOK_SECRET')]
    ),
    requirements: ['GitHub token', 'GitHub webhook secret', 'OpenAI API key', 'Slack bot token'],
  },
  {
    id: 'data-etl-pipeline',
    name: 'Data ETL Pipeline',
    description: 'Extract records from Postgres, reshape them into an analytics-ready schema, filter out noisy rows, and write curated results back.',
    category: 'Data',
    tags: ['etl', 'postgres', 'mapping', 'filtering'],
    difficulty: 'intermediate',
    estimatedTime: '15 min setup',
    icon: 'Database',
    color: '#3b82f6',
    definition: createDefinition(
      'Data ETL Pipeline',
      'Run a repeatable ETL flow against a transactional Postgres source.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Run ETL Job',
          inputSchema: {
            startDate: 'string',
            endDate: 'string',
          },
        }),
        createNode('node-source', NodeType.INTEGRATION_POSTGRES, 360, 220, {
          label: 'Extract Source Rows',
          connectionId: '{{env.SOURCE_DB_CONNECTION}}',
          queryType: 'select',
          query: 'select * from orders where created_at between :startDate and :endDate',
        }),
        createNode('node-map', NodeType.TRANSFORM_MAP, 640, 220, {
          label: 'Map Analytics Fields',
          mapping: {
            customerId: 'customer_id',
            orderValue: 'total_amount',
            region: 'shipping_region',
          },
        }),
        createNode('node-filter', NodeType.TRANSFORM_FILTER, 920, 220, {
          label: 'Filter High-Signal Rows',
          logic: 'AND',
          conditions: [
            { field: 'orderValue', operator: 'gte', value: 50 },
            { field: 'region', operator: 'neq', value: 'test' },
          ],
        }),
        createNode('node-destination', NodeType.INTEGRATION_POSTGRES, 1200, 220, {
          label: 'Load Curated Table',
          connectionId: '{{env.DESTINATION_DB_CONNECTION}}',
          queryType: 'insert',
          query: 'insert into analytics_orders (customer_id, order_value, region) values (:customerId, :orderValue, :region)',
        }),
      ],
      [
        createEdge('e-trigger-source', 'node-trigger', 'node-source'),
        createEdge('e-source-map', 'node-source', 'node-map'),
        createEdge('e-map-filter', 'node-map', 'node-filter'),
        createEdge('e-filter-destination', 'node-filter', 'node-destination'),
      ],
      [createEnvVar('SOURCE_DB_CONNECTION'), createEnvVar('DESTINATION_DB_CONNECTION')]
    ),
    requirements: ['Source database connection', 'Destination database connection'],
  },
  {
    id: 'api-health-monitor',
    name: 'API Health Monitor',
    description: 'Check multiple endpoints on a schedule, evaluate failures, and fan out alerts only when latency or status thresholds are breached.',
    category: 'Automation',
    tags: ['monitoring', 'http', 'alerts', 'ops'],
    difficulty: 'intermediate',
    estimatedTime: '10 min setup',
    icon: 'Activity',
    color: '#6366f1',
    definition: createDefinition(
      'API Health Monitor',
      'Probe critical endpoints and notify responders on failures.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 80, 220, {
          label: 'Health Check Schedule',
          cron: '*/5 * * * *',
          timezone: 'UTC',
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 360, 220, {
          label: 'Iterate Endpoints',
          items: ['https://api.example.com/health', 'https://api.example.com/billing/health'],
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 640, 220, {
          label: 'Probe Endpoint',
          method: 'GET',
          timeout: 5000,
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 920, 220, {
          label: 'Check SLA',
          condition: 'input.status >= 500 || input.latencyMs > 1200',
          evaluationType: 'expression',
        }),
        createNode('node-notify', NodeType.OUTPUT_NOTIFICATION, 1200, 70, {
          label: 'Notify On-Call',
          channel: 'ops',
          severity: 'high',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1200, 370, {
          label: 'Log Healthy Checks',
          level: 'info',
        }),
      ],
      [
        createEdge('e-trigger-foreach', 'node-trigger', 'node-foreach'),
        createEdge('e-foreach-http', 'node-foreach', 'node-http'),
        createEdge('e-http-condition', 'node-http', 'node-condition'),
        createEdge('e-condition-notify', 'node-condition', 'node-notify'),
        createEdge('e-condition-log', 'node-condition', 'node-log'),
      ]
    ),
    requirements: ['Notification channel credentials if using PagerDuty, Slack, or email'],
  },
  {
    id: 'customer-support-bot',
    name: 'Customer Support Bot',
    description: 'Run a support assistant with short-term memory so it can answer customer questions, preserve context, and hand off consistent responses.',
    category: 'AI & Chat',
    tags: ['support', 'chat', 'memory', 'openai'],
    difficulty: 'beginner',
    estimatedTime: '5 min setup',
    icon: 'Headphones',
    color: '#22c55e',
    featured: true,
    definition: createDefinition(
      'Customer Support Bot',
      'Conversational support assistant with memory and response output.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Customer Message',
          inputSchema: {
            message: 'string',
            orderId: 'string',
          },
        }),
        createNode('node-memory', NodeType.MEMORY_BUFFER, 360, 220, {
          label: 'Conversation Memory',
          maxMessages: 12,
          sessionKey: '{{input.customerId || executionId}}',
        }),
        createNode('node-chat', NodeType.AI_CHAT, 640, 220, {
          label: 'Support Assistant',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.4,
          systemPrompt: 'You are a SaaS customer support specialist. Be empathetic, concise, and ask clarifying questions only when needed. Escalate billing or outage issues when confidence is low.',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 920, 220, {
          label: 'Return Reply',
        }),
      ],
      [
        createEdge('e-trigger-memory', 'node-trigger', 'node-memory'),
        createEdge('e-memory-chat', 'node-memory', 'node-chat'),
        createEdge('e-chat-response', 'node-chat', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'document-qa',
    name: 'Document Q&A',
    description: 'Ingest PDF documents, split and embed them, store vectors, retrieve the best chunks, and answer questions against grounded context.',
    category: 'AI & Chat',
    tags: ['rag', 'pdf', 'embeddings', 'search'],
    difficulty: 'advanced',
    estimatedTime: '18 min setup',
    icon: 'BookOpen',
    color: '#f59e0b',
    definition: createDefinition(
      'Document Q&A',
      'Load PDFs into a lightweight RAG pipeline and answer questions with context.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Ask a Question',
          inputSchema: {
            pdfUrl: 'string',
            question: 'string',
          },
        }),
        createNode('node-loader', NodeType.RAG_PDF_LOADER, 360, 220, {
          label: 'Load PDF',
          source: 'url',
          url: '{{input.pdfUrl}}',
          splitPages: true,
        }),
        createNode('node-splitter', NodeType.RAG_TEXT_SPLITTER, 640, 220, {
          label: 'Chunk Document',
          strategy: 'recursive',
          chunkSize: 1200,
          chunkOverlap: 150,
        }),
        createNode('node-embedder', NodeType.RAG_EMBEDDER, 920, 220, {
          label: 'Embed Chunks',
          provider: 'openai',
          model: 'text-embedding-3-small',
        }),
        createNode('node-store', NodeType.RAG_VECTOR_STORE, 1200, 220, {
          label: 'Store Embeddings',
          backend: 'memory',
          operation: 'upsert',
          indexName: 'document-qa',
        }),
        createNode('node-retriever', NodeType.RAG_RETRIEVER, 1480, 220, {
          label: 'Retrieve Context',
          strategy: 'similarity',
          topK: 5,
          indexName: 'document-qa',
        }),
        createNode('node-llm', NodeType.AI_LLM, 1760, 220, {
          label: 'Answer Question',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          prompt: 'Use the retrieved document chunks to answer the user question with citations.',
          systemPrompt: 'Answer only from the provided context and clearly say when the answer is not present.',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 2040, 220, {
          label: 'Return Answer',
        }),
      ],
      [
        createEdge('e-trigger-loader', 'node-trigger', 'node-loader'),
        createEdge('e-loader-splitter', 'node-loader', 'node-splitter'),
        createEdge('e-splitter-embedder', 'node-splitter', 'node-embedder'),
        createEdge('e-embedder-store', 'node-embedder', 'node-store'),
        createEdge('e-store-retriever', 'node-store', 'node-retriever'),
        createEdge('e-retriever-llm', 'node-retriever', 'node-llm'),
        createEdge('e-llm-response', 'node-llm', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'multi-language-translator',
    name: 'Multi-language Translator',
    description: 'Detect the input language, route it through switch-based branches, and produce high-quality translations for localized customer experiences.',
    category: 'AI & Chat',
    tags: ['translation', 'localization', 'switch', 'llm'],
    difficulty: 'intermediate',
    estimatedTime: '8 min setup',
    icon: 'Languages',
    color: '#22c55e',
    definition: createDefinition(
      'Multi-language Translator',
      'Detect language and route translation requests through language-specific branches.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Text Input',
          inputSchema: {
            text: 'string',
            targetLanguage: 'string',
          },
        }),
        createNode('node-detect', NodeType.AI_LLM, 360, 220, {
          label: 'Detect Language',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0,
          outputFormat: 'json',
          prompt: 'Detect the source language and return an ISO language code.',
          systemPrompt: 'Respond with a short JSON payload containing sourceLanguage and confidence.',
        }),
        createNode('node-switch', NodeType.CONTROL_SWITCH, 640, 220, {
          label: 'Route by Language',
          expression: 'input.sourceLanguage',
          cases: [
            { branchKey: 'english', label: 'English', value: 'en' },
            { branchKey: 'spanish', label: 'Spanish', value: 'es' },
            { branchKey: 'other', label: 'Other', value: 'other' },
          ],
        }),
        createNode('node-translate-en', NodeType.AI_TRANSLATION, 920, 70, {
          label: 'Translate English',
          targetLanguage: '{{input.targetLanguage}}',
          style: 'natural',
        }),
        createNode('node-translate-es', NodeType.AI_TRANSLATION, 920, 220, {
          label: 'Translate Spanish',
          targetLanguage: '{{input.targetLanguage}}',
          style: 'natural',
        }),
        createNode('node-translate-other', NodeType.AI_TRANSLATION, 920, 370, {
          label: 'Translate Other Languages',
          targetLanguage: '{{input.targetLanguage}}',
          style: 'literal-with-context',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1200, 220, {
          label: 'Return Translation',
        }),
      ],
      [
        createEdge('e-trigger-detect', 'node-trigger', 'node-detect'),
        createEdge('e-detect-switch', 'node-detect', 'node-switch'),
        createEdge('e-switch-en', 'node-switch', 'node-translate-en'),
        createEdge('e-switch-es', 'node-switch', 'node-translate-es'),
        createEdge('e-switch-other', 'node-switch', 'node-translate-other'),
        createEdge('e-en-response', 'node-translate-en', 'node-response'),
        createEdge('e-es-response', 'node-translate-es', 'node-response'),
        createEdge('e-other-response', 'node-translate-other', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'code-review-assistant',
    name: 'Code Review Assistant',
    description: 'React to pull request webhooks, analyze the proposed change set with an LLM, and publish actionable review feedback back into GitHub.',
    category: 'AI & Chat',
    tags: ['code-review', 'github', 'automation', 'quality'],
    difficulty: 'advanced',
    estimatedTime: '14 min setup',
    icon: 'GitPullRequest',
    color: '#ec4899',
    definition: createDefinition(
      'Code Review Assistant',
      'Generate structured review notes and publish them to the originating pull request.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'PR Event',
          method: 'POST',
          authType: 'hmac',
        }),
        createNode('node-review', NodeType.AI_LLM, 360, 220, {
          label: 'Review Code Changes',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.1,
          outputFormat: 'markdown',
          prompt: 'Review the pull request diff, identify bugs, risks, and missing tests, then draft a concise review comment.',
          systemPrompt: 'You are a principal engineer focused on correctness, security, and maintainability.',
        }),
        createNode('node-github', NodeType.INTEGRATION_GITHUB, 640, 220, {
          label: 'Post Review Comment',
          operation: 'create_review_comment',
        }),
      ],
      [
        createEdge('e-trigger-review', 'node-trigger', 'node-review'),
        createEdge('e-review-github', 'node-review', 'node-github'),
      ],
      [createEnvVar('GITHUB_TOKEN'), createEnvVar('GITHUB_WEBHOOK_SECRET'), createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['GitHub token', 'GitHub webhook secret', 'OpenAI API key'],
  },
  {
    id: 'meeting-notes-summarizer',
    name: 'Meeting Notes Summarizer',
    description: 'Extract usable text from meeting notes or transcripts, summarize the conversation, and then generate crisp follow-up action items.',
    category: 'AI & Chat',
    tags: ['meeting-notes', 'summarization', 'action-items'],
    difficulty: 'beginner',
    estimatedTime: '6 min setup',
    icon: 'FileText',
    color: '#22c55e',
    definition: createDefinition(
      'Meeting Notes Summarizer',
      'Extract clean note content, summarize it, and propose action items.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Paste Notes',
          inputSchema: {
            notes: 'string',
          },
        }),
        createNode('node-extract', NodeType.UTILITY_PARSER, 360, 220, {
          label: 'Extract Note Sections',
          format: 'markdown',
          mode: 'text_extract',
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 640, 220, {
          label: 'Summarize Meeting',
          provider: 'openai',
          model: 'gpt-4o-mini',
          format: 'bullet-points',
        }),
        createNode('node-actions', NodeType.AI_LLM, 920, 220, {
          label: 'Generate Action Items',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          prompt: 'Convert the meeting summary into clear action items with owner suggestions and due dates.',
          systemPrompt: 'You turn ambiguous notes into accountable follow-up tasks.',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1200, 220, {
          label: 'Return Summary',
        }),
      ],
      [
        createEdge('e-trigger-extract', 'node-trigger', 'node-extract'),
        createEdge('e-extract-summary', 'node-extract', 'node-summary'),
        createEdge('e-summary-actions', 'node-summary', 'node-actions'),
        createEdge('e-actions-response', 'node-actions', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    description: 'A research-oriented ReAct agent that can query the web, run lightweight code, remember conversation context, and return cited findings.',
    category: 'Agents',
    tags: ['agent', 'research', 'tools', 'react'],
    difficulty: 'advanced',
    estimatedTime: '20 min setup',
    icon: 'Search',
    color: '#8b5cf6',
    definition: createDefinition(
      'Research Agent',
      'Reason over web and code execution tools before returning a synthesized answer.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Research Prompt',
          inputSchema: {
            topic: 'string',
          },
        }),
        createNode('node-web-tool', NodeType.AGENT_TOOL, 360, 70, {
          label: 'Web Search Tool',
          name: 'web_search',
          description: 'Search the public web and return summarized result snippets.',
          language: 'nodejs',
          code: 'return { query: args.query, results: [] };',
        }),
        createNode('node-code-tool', NodeType.AGENT_TOOL, 360, 370, {
          label: 'Code Execution Tool',
          name: 'code_runner',
          description: 'Run quick calculations or data shaping logic during research.',
          language: 'nodejs',
          code: 'return { executed: true, input: args };',
        }),
        createNode('node-agent', NodeType.AGENT_REACT, 640, 220, {
          label: 'Research ReAct Agent',
          provider: 'openai',
          model: 'gpt-4o',
          maxIterations: 6,
          verbose: true,
          systemPrompt: 'You are a research analyst. Use tools when needed, verify claims, and summarize with citations and caveats.',
        }),
        createNode('node-memory', NodeType.MEMORY_BUFFER, 920, 220, {
          label: 'Session Memory',
          maxMessages: 8,
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1200, 220, {
          label: 'Return Findings',
        }),
      ],
      [
        createEdge('e-trigger-agent', 'node-trigger', 'node-agent'),
        createEdge('e-webtool-agent', 'node-web-tool', 'node-agent'),
        createEdge('e-codetool-agent', 'node-code-tool', 'node-agent'),
        createEdge('e-agent-memory', 'node-agent', 'node-memory'),
        createEdge('e-memory-response', 'node-memory', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('SEARCH_API_KEY')]
    ),
    requirements: ['OpenAI API key', 'Search API key'],
  },
  {
    id: 'data-analysis-agent',
    name: 'Data Analysis Agent',
    description: 'Interpret a business question with an agent, run Python analysis in Sandflare, and return polished insights for analysts or operators.',
    category: 'Agents',
    tags: ['agent', 'python', 'analysis', 'pandas'],
    difficulty: 'advanced',
    estimatedTime: '16 min setup',
    icon: 'BarChart3',
    color: '#8b5cf6',
    definition: createDefinition(
      'Data Analysis Agent',
      'Analyze structured data with an agent plus Python execution step.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Analysis Request',
          inputSchema: {
            question: 'string',
            datasetUrl: 'string',
          },
        }),
        createNode('node-agent', NodeType.AGENT_LLM, 360, 220, {
          label: 'Plan Analysis',
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a data analyst. Translate the question into an analysis plan and specify the calculations needed.',
          temperature: 0.2,
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 640, 220, {
          label: 'Run Pandas Analysis',
          code: 'import pandas as pd\n# Load input dataset and compute requested metrics\n',
          packages: ['pandas', 'numpy'],
          timeout: 120,
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 920, 220, {
          label: 'Return Insights',
        }),
      ],
      [
        createEdge('e-trigger-agent', 'node-trigger', 'node-agent'),
        createEdge('e-agent-python', 'node-agent', 'node-python'),
        createEdge('e-python-response', 'node-python', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'team-of-agents',
    name: 'Team of Agents',
    description: 'Enterprise-grade multi-agent team with built-in LLM-as-judge feedback loops: Planner drafts a solution, Challenger evaluates it, Coder implements it, and Tester validates the result — each with automatic revision cycles.',
    category: 'Agents',
    tags: ['multi-agent', 'evaluator', 'team', 'feedback-loop', 'llm-as-judge', 'planning', 'coding'],
    difficulty: 'advanced',
    estimatedTime: '20 min setup',
    icon: 'Users',
    color: '#8b5cf6',
    featured: true,
    definition: createDefinition(
      'Team of Agents',
      'Planner → Challenger → Coder → Tester with automatic revision loops.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 300, {
          label: 'Define Task',
          description: 'Provide the task for the agent team to solve.',
          inputSchema: {
            task: 'string',
            context: 'string',
          },
        }),

        // ── Planning phase ───────────────────────────────────────────────────
        createNode('node-planner', NodeType.AGENT_LLM, 380, 300, {
          label: 'Planner',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          systemPrompt: [
            'You are a senior software architect and planner.',
            'Your job is to produce a clear, structured, step-by-step plan to solve the given task.',
            'Include: approach rationale, key steps, edge cases to handle, and success criteria.',
            'Be specific and actionable. Output a well-structured plan in markdown.',
          ].join('\n'),
        }),

        createNode('node-challenger', NodeType.AGENT_EVALUATOR, 680, 300, {
          label: 'Challenger',
          provider: 'openai',
          model: 'gpt-4o',
          rubric: 'Is the plan complete, feasible, specific enough to implement, and does it handle the key edge cases? Does it clearly define success criteria?',
          strictness: 7,
          maxRevisions: 3,
          outputFormat: 'detailed',
        }),

        createNode('node-plan-gate', NodeType.CONTROL_CONDITION, 980, 300, {
          label: 'Plan Approved?',
          condition: 'input.verdict === "pass"',
          expression: 'input.verdict === "pass"',
          evaluationType: 'expression',
        }),

        // ── Coding phase ─────────────────────────────────────────────────────
        createNode('node-coder', NodeType.AGENT_LLM, 1280, 300, {
          label: 'Coder',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.1,
          systemPrompt: [
            'You are a senior software engineer.',
            'You will receive a plan. Implement it fully — write clean, working code with comments.',
            'Follow the plan exactly. Handle all edge cases mentioned. Include error handling.',
            'Output only the implementation with brief inline documentation.',
          ].join('\n'),
        }),

        createNode('node-tester', NodeType.AGENT_EVALUATOR, 1580, 300, {
          label: 'Tester',
          provider: 'openai',
          model: 'gpt-4o',
          rubric: 'Is the implementation correct, complete, well-structured, and does it fully satisfy the plan? Are edge cases handled? Is error handling present?',
          strictness: 8,
          maxRevisions: 3,
          outputFormat: 'detailed',
        }),

        createNode('node-test-gate', NodeType.CONTROL_CONDITION, 1880, 300, {
          label: 'Tests Pass?',
          condition: 'input.verdict === "pass"',
          expression: 'input.verdict === "pass"',
          evaluationType: 'expression',
        }),

        // ── Output ───────────────────────────────────────────────────────────
        createNode('node-output', NodeType.OUTPUT_RESPONSE, 2180, 300, {
          label: 'Final Result',
        }),
      ],
      [
        // Main flow
        createEdge('e-trigger-planner', 'node-trigger', 'node-planner'),
        createEdge('e-planner-challenger', 'node-planner', 'node-challenger'),
        createEdge('e-challenger-plan-gate', 'node-challenger', 'node-plan-gate'),

        // Plan gate: pass → coder, fail → planner (revision loop)
        createEdge('e-plan-gate-coder', 'node-plan-gate', 'node-coder', 'true'),
        createEdge('e-plan-gate-revise', 'node-plan-gate', 'node-planner', 'false'),

        // Code phase
        createEdge('e-coder-tester', 'node-coder', 'node-tester'),
        createEdge('e-tester-test-gate', 'node-tester', 'node-test-gate'),

        // Test gate: pass → output, fail → coder (revision loop)
        createEdge('e-test-gate-output', 'node-test-gate', 'node-output', 'true'),
        createEdge('e-test-gate-revise', 'node-test-gate', 'node-coder', 'false'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'multi-agent-customer-pipeline',
    name: 'Multi-Agent Customer Pipeline',
    description: 'Use a supervisor agent to route inbound customer requests to specialized sales and support workers, then consolidate memory and responses.',
    category: 'Agents',
    tags: ['multi-agent', 'supervisor', 'sales', 'support'],
    difficulty: 'advanced',
    estimatedTime: '18 min setup',
    icon: 'Users',
    color: '#8b5cf6',
    definition: createDefinition(
      'Multi-Agent Customer Pipeline',
      'Route customer work between specialized workers coordinated by a supervisor.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Customer Intake',
          inputSchema: {
            customerMessage: 'string',
          },
        }),
        createNode('node-supervisor', NodeType.AGENT_SUPERVISOR, 360, 220, {
          label: 'Route Request',
          provider: 'openai',
          model: 'gpt-4o',
          routingStrategy: 'llm',
          workers: ['node-sales-worker', 'node-support-worker'],
          systemPrompt: 'Route the customer request to the most relevant worker and synthesize the final answer.',
          maxRounds: 3,
        }),
        createNode('node-sales-worker', NodeType.AGENT_WORKER, 640, 70, {
          label: 'Sales Worker',
          name: 'sales_worker',
          description: 'Handles upgrades, pricing, demos, and expansion opportunities.',
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a consultative sales assistant focused on product fit and upsell opportunities.',
        }),
        createNode('node-support-worker', NodeType.AGENT_WORKER, 640, 370, {
          label: 'Support Worker',
          name: 'support_worker',
          description: 'Handles troubleshooting, billing issues, and account questions.',
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a technical support specialist focused on resolving customer issues quickly.',
        }),
        createNode('node-memory', NodeType.MEMORY_BUFFER, 920, 220, {
          label: 'Store Shared Context',
          maxMessages: 10,
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1200, 220, {
          label: 'Send Unified Reply',
        }),
      ],
      [
        createEdge('e-trigger-supervisor', 'node-trigger', 'node-supervisor'),
        createEdge('e-supervisor-sales', 'node-supervisor', 'node-sales-worker'),
        createEdge('e-supervisor-support', 'node-supervisor', 'node-support-worker'),
        createEdge('e-sales-memory', 'node-sales-worker', 'node-memory'),
        createEdge('e-support-memory', 'node-support-worker', 'node-memory'),
        createEdge('e-memory-response', 'node-memory', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'rag-agent-with-memory',
    name: 'RAG Agent with Memory',
    description: 'Blend conversation memory with retrieval so an agent can answer ongoing questions while staying grounded in indexed knowledge.',
    category: 'Agents',
    tags: ['rag', 'memory', 'agent', 'knowledge-base'],
    difficulty: 'advanced',
    estimatedTime: '12 min setup',
    icon: 'BrainCircuit',
    color: '#8b5cf6',
    definition: createDefinition(
      'RAG Agent with Memory',
      'Combine conversation memory with retrieval-backed agent reasoning.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Ask Knowledge Question',
          inputSchema: {
            question: 'string',
          },
        }),
        createNode('node-memory', NodeType.MEMORY_WINDOW, 360, 220, {
          label: 'Window Memory',
          windowSize: 6,
        }),
        createNode('node-retriever', NodeType.RAG_RETRIEVER, 640, 220, {
          label: 'Retrieve Documents',
          strategy: 'similarity',
          topK: 6,
          indexName: 'knowledge-base',
        }),
        createNode('node-agent', NodeType.AGENT_LLM, 920, 220, {
          label: 'Answer with Context',
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'Use retrieved documents and recent conversation memory to answer accurately. Cite uncertainty clearly.',
          temperature: 0.2,
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1200, 220, {
          label: 'Return Grounded Answer',
        }),
      ],
      [
        createEdge('e-trigger-memory', 'node-trigger', 'node-memory'),
        createEdge('e-memory-retriever', 'node-memory', 'node-retriever'),
        createEdge('e-retriever-agent', 'node-retriever', 'node-agent'),
        createEdge('e-agent-response', 'node-agent', 'node-response'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key', 'Configured vector index'],
  },
  {
    id: 'lead-qualification-agent',
    name: 'Lead Qualification Agent',
    description: 'Score inbound leads from form or webhook traffic, route hot leads to Slack instantly, and send nurture emails for everyone else.',
    category: 'Agents',
    tags: ['leads', 'qualification', 'sales', 'routing'],
    difficulty: 'intermediate',
    estimatedTime: '9 min setup',
    icon: 'UserCheck',
    color: '#8b5cf6',
    definition: createDefinition(
      'Lead Qualification Agent',
      'Assess inbound leads and split outreach based on lead score.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'Lead Webhook',
          method: 'POST',
          authType: 'api_key',
        }),
        createNode('node-agent', NodeType.AGENT_LLM, 360, 220, {
          label: 'Score Lead',
          provider: 'openai',
          model: 'gpt-4o-mini',
          outputFormat: 'json',
          systemPrompt: 'You are a revenue operations analyst. Score lead quality from 0-100 and explain the score.',
          temperature: 0.1,
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 640, 220, {
          label: 'Hot Lead?',
          condition: 'input.score >= 80',
          evaluationType: 'expression',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 920, 70, {
          label: 'Alert Sales Team',
          channel: '{{env.SLACK_LEADS_CHANNEL}}',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 920, 370, {
          label: 'Send Nurture Email',
          subject: 'Thanks for your interest',
          to: '{{input.email}}',
        }),
      ],
      [
        createEdge('e-trigger-agent', 'node-trigger', 'node-agent'),
        createEdge('e-agent-condition', 'node-agent', 'node-condition'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-email', 'node-condition', 'node-email'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('SLACK_BOT_TOKEN'), createEnvVar('SLACK_LEADS_CHANNEL'), createEnvVar('EMAIL_API_KEY')]
    ),
    requirements: ['OpenAI API key', 'Slack bot token', 'Email provider credentials'],
  },
];

const legacyWorkflowTemplates: WorkflowTemplate[] = [
  // ============ DATA PROCESSING (20 templates) ============
  {
    id: 'csv-to-json-converter',
    name: 'CSV to JSON Converter',
    description: 'Convert CSV files to JSON format with data validation',
    category: 'Data Processing',
    tags: ['csv', 'json', 'conversion', 'data-transform'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'FileText',
    color: '#3b82f6',
    definition: {
      nodes: [
        createNode('1', NodeType.DATA_CSV_READ, 100, 100),
        createNode('2', NodeType.TRANSFORM_DATA, 300, 100),
        createNode('3', NodeType.UTILITY_VALIDATOR, 500, 100),
        createNode('4', NodeType.OUTPUT_JSON, 700, 100),
      ],
      edges: [
        createEdge('e1-2', '1', '2'),
        createEdge('e2-3', '2', '3'),
        createEdge('e3-4', '3', '4'),
      ],
    },
  },

  {
    id: 'data-deduplication',
    name: 'Data Deduplication Pipeline',
    description: 'Remove duplicate entries from large datasets',
    category: 'Data Processing',
    tags: ['dedupe', 'cleanup', 'data-quality'],
    difficulty: 'beginner',
    estimatedTime: '3 min',
    icon: 'Copy',
    color: '#3b82f6',
    definition: {
      nodes: [
        createNode('1', NodeType.TRIGGER_MANUAL, 100, 100),
        createNode('2', NodeType.TRANSFORM_DEDUPE, 300, 100),
        createNode('3', NodeType.OUTPUT_FILE, 500, 100),
      ],
      edges: [createEdge('e1-2', '1', '2'), createEdge('e2-3', '2', '3')],
    },
  },

  {
    id: 'json-schema-validator',
    name: 'JSON Schema Validator',
    description: 'Validate JSON data against defined schemas',
    category: 'Data Processing',
    tags: ['validation', 'json', 'schema'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
    icon: 'CheckCircle',
    color: '#3b82f6',
    definition: createDefinition(
      'JSON Schema Validator',
      'Validate inbound JSON documents, format the payload, and return a clean validated response.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Upload JSON Payload',
          inputSchema: { sourcePath: 'string' },
        }),
        createNode('read', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/customer-profile.json',
          mode: 'document',
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 660, 220, {
          schemaType: 'json-schema',
          schema:
            '{"type":"object","required":["id","email","status"],"properties":{"id":{"type":"string"},"email":{"type":"string","format":"email"},"status":{"type":"string","enum":["active","inactive"]},"score":{"type":"number"}}}',
          stopOnError: true,
        }),
        createNode('format', NodeType.TRANSFORM_JSON, 940, 220, {
          operation: 'format',
          pretty: true,
          sortKeys: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
          includeValidationSummary: true,
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read'),
        createEdge('e2', 'read', 'validate'),
        createEdge('e3', 'validate', 'format'),
        createEdge('e4', 'format', 'result'),
      ]
    ),
  },

  {
    id: 'xml-to-json',
    name: 'XML to JSON Transformer',
    description: 'Parse and convert XML documents to JSON',
    category: 'Data Processing',
    tags: ['xml', 'json', 'parsing'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'Code',
    color: '#3b82f6',
    definition: createDefinition(
      'XML to JSON Transformer',
      'Read an XML document, normalize attributes, and emit clean JSON output.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Select XML File',
        }),
        createNode('read-xml', NodeType.DATA_XML_READ, 380, 220, {
          path: 'data/inventory.xml',
          preserveNamespaces: false,
        }),
        createNode('convert', NodeType.TRANSFORM_XML, 660, 220, {
          operation: 'xml-to-json',
          preserveAttributes: true,
          attributePrefix: '@',
        }),
        createNode('clean', NodeType.TRANSFORM_JSON, 940, 220, {
          operation: 'format',
          pretty: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-xml'),
        createEdge('e2', 'read-xml', 'convert'),
        createEdge('e3', 'convert', 'clean'),
        createEdge('e4', 'clean', 'result'),
      ]
    ),
  },

  {
    id: 'data-aggregation',
    name: 'Data Aggregation & Grouping',
    description: 'Group and aggregate data with custom functions',
    category: 'Data Processing',
    tags: ['aggregate', 'groupby', 'analytics'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'BarChart',
    color: '#3b82f6',
    definition: createDefinition(
      'Data Aggregation & Grouping',
      'Filter transactional rows, aggregate by region and month, then sort the summary output.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Run Sales Summary',
        }),
        createNode('read-csv', NodeType.DATA_CSV_READ, 380, 220, {
          path: 'data/monthly-sales.csv',
          hasHeaders: true,
        }),
        createNode('filter', NodeType.TRANSFORM_FILTER, 660, 220, {
          condition: 'amount > 0 && status === "paid"',
        }),
        createNode('aggregate', NodeType.TRANSFORM_AGGREGATE, 940, 220, {
          groupBy: ['region', 'month'],
          metrics: [
            { field: 'amount', op: 'sum', as: 'totalRevenue' },
            { field: 'orderId', op: 'count', as: 'orders' },
            { field: 'amount', op: 'avg', as: 'avgOrderValue' },
          ],
        }),
        createNode('sort', NodeType.TRANSFORM_SORT, 1220, 220, {
          fields: [
            { field: 'totalRevenue', direction: 'desc' },
            { field: 'region', direction: 'asc' },
          ],
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1500, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-csv'),
        createEdge('e2', 'read-csv', 'filter'),
        createEdge('e3', 'filter', 'aggregate'),
        createEdge('e4', 'aggregate', 'sort'),
        createEdge('e5', 'sort', 'result'),
      ]
    ),
  },

  {
    id: 'excel-parser',
    name: 'Excel Data Extractor',
    description: 'Extract and process data from Excel spreadsheets',
    category: 'Data Processing',
    tags: ['excel', 'spreadsheet', 'extraction'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'FileSpreadsheet',
    color: '#3b82f6',
    definition: createDefinition(
      'Excel Data Extractor',
      'Extract a worksheet, map the important columns, and return normalized records.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Choose Workbook',
        }),
        createNode('read-excel', NodeType.DATA_EXCEL_READ, 380, 220, {
          path: 'data/orders.xlsx',
          sheetName: 'Orders',
          headerRow: 1,
        }),
        createNode('map-fields', NodeType.TRANSFORM_MAP, 660, 220, {
          mappings: {
            orderId: 'Order ID',
            customer: 'Customer Name',
            total: 'Total Amount',
            orderDate: 'Order Date',
          },
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 940, 220, {
          requiredFields: ['orderId', 'customer', 'total'],
          stopOnError: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'table',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-excel'),
        createEdge('e2', 'read-excel', 'map-fields'),
        createEdge('e3', 'map-fields', 'validate'),
        createEdge('e4', 'validate', 'result'),
      ]
    ),
  },

  {
    id: 'data-merge',
    name: 'Multi-Source Data Merger',
    description: 'Merge data from multiple sources with conflict resolution',
    category: 'Data Processing',
    tags: ['merge', 'integration', 'etl'],
    difficulty: 'advanced',
    estimatedTime: '20 min',
    icon: 'Merge',
    color: '#3b82f6',
    definition: createDefinition(
      'Multi-Source Data Merger',
      'Combine CRM exports and API payloads, resolve duplicates, and create a master dataset.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Start Merge',
        }),
        createNode('crm-csv', NodeType.DATA_CSV_READ, 380, 60, {
          path: 'data/crm-export.csv',
          hasHeaders: true,
        }),
        createNode('api-json', NodeType.DATA_JSON_READ, 380, 380, {
          path: 'data/customer-api.json',
        }),
        createNode('merge', NodeType.TRANSFORM_MERGE, 660, 220, {
          strategy: 'upsert',
          keyField: 'customerId',
          conflictResolution: 'prefer-latest',
        }),
        createNode('dedupe', NodeType.TRANSFORM_DEDUPE, 940, 220, {
          keyFields: ['customerId', 'email'],
        }),
        createNode('sort', NodeType.TRANSFORM_SORT, 1220, 220, {
          fields: [{ field: 'updatedAt', direction: 'desc' }],
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1500, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'crm-csv'),
        createEdge('e2', 'trigger', 'api-json'),
        createEdge('e3', 'crm-csv', 'merge'),
        createEdge('e4', 'api-json', 'merge'),
        createEdge('e5', 'merge', 'dedupe'),
        createEdge('e6', 'dedupe', 'sort'),
        createEdge('e7', 'sort', 'result'),
      ]
    ),
  },

  {
    id: 'yaml-config-parser',
    name: 'YAML Configuration Parser',
    description: 'Parse and validate YAML configuration files',
    category: 'Data Processing',
    tags: ['yaml', 'config', 'parsing'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'FileCode',
    color: '#3b82f6',
    definition: createDefinition(
      'YAML Configuration Parser',
      'Read a YAML deployment config, validate required keys, and return JSON for downstream workflows.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Load Config',
        }),
        createNode('read-yaml', NodeType.DATA_YAML_READ, 380, 220, {
          path: 'config/deployment.yaml',
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 660, 220, {
          requiredFields: ['service.name', 'service.port', 'database.url'],
          stopOnError: true,
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 940, 220, {
          mappings: {
            serviceName: 'service.name',
            port: 'service.port',
            databaseUrl: 'database.url',
            featureFlags: 'features',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-yaml'),
        createEdge('e2', 'read-yaml', 'validate'),
        createEdge('e3', 'validate', 'map'),
        createEdge('e4', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'data-sorting',
    name: 'Advanced Data Sorting',
    description: 'Sort datasets with multi-field criteria',
    category: 'Data Processing',
    tags: ['sort', 'ordering', 'data-transform'],
    difficulty: 'beginner',
    estimatedTime: '3 min',
    icon: 'ArrowUpDown',
    color: '#3b82f6',
    definition: createDefinition(
      'Advanced Data Sorting',
      'Apply multi-column sort rules to a dataset and export the ordered results.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Sort Dataset',
        }),
        createNode('read-csv', NodeType.DATA_CSV_READ, 380, 220, {
          path: 'data/support-tickets.csv',
          hasHeaders: true,
        }),
        createNode('sort', NodeType.TRANSFORM_SORT, 660, 220, {
          fields: [
            { field: 'priority', direction: 'desc' },
            { field: 'createdAt', direction: 'asc' },
            { field: 'customer', direction: 'asc' },
          ],
        }),
        createNode('result', NodeType.OUTPUT_FILE, 940, 220, {
          path: 'output/sorted-support-tickets.json',
          format: 'json',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-csv'),
        createEdge('e2', 'read-csv', 'sort'),
        createEdge('e3', 'sort', 'result'),
      ]
    ),
  },

  {
    id: 'data-filtering',
    name: 'Dynamic Data Filter',
    description: 'Filter data based on complex conditions',
    category: 'Data Processing',
    tags: ['filter', 'query', 'selection'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
    icon: 'Filter',
    color: '#3b82f6',
    definition: createDefinition(
      'Dynamic Data Filter',
      'Build a runtime filter expression, apply it to records, and return matching rows only.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Set Filter Inputs',
          inputSchema: { minSpend: 'number', region: 'string' },
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/customers.json',
        }),
        createNode('template', NodeType.UTILITY_TEMPLATE, 660, 220, {
          template: 'amount >= {{input.minSpend}} && region === "{{input.region}}" && active === true',
        }),
        createNode('filter', NodeType.TRANSFORM_FILTER, 940, 220, {
          condition: '{{template.output}}',
          keepMatchesOnly: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'template'),
        createEdge('e3', 'template', 'filter'),
        createEdge('e4', 'filter', 'result'),
      ]
    ),
  },

  {
    id: 'csv-splitter',
    name: 'CSV File Splitter',
    description: 'Split large CSV files into smaller chunks',
    category: 'Data Processing',
    tags: ['csv', 'split', 'batch'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'Split',
    color: '#3b82f6',
    definition: createDefinition(
      'CSV File Splitter',
      'Split a large CSV into manageable row batches and write each chunk to disk.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Split Large File',
        }),
        createNode('read-csv', NodeType.DATA_CSV_READ, 380, 220, {
          path: 'data/transactions-large.csv',
          hasHeaders: true,
        }),
        createNode('split', NodeType.TRANSFORM_SPLIT, 660, 220, {
          strategy: 'rows',
          chunkSize: 1000,
          preserveHeaders: true,
        }),
        createNode('result', NodeType.OUTPUT_FILE, 940, 220, {
          path: 'output/transactions-chunks/',
          format: 'csv',
          filePattern: 'transactions-part-{{index}}.csv',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-csv'),
        createEdge('e2', 'read-csv', 'split'),
        createEdge('e3', 'split', 'result'),
      ]
    ),
  },

  {
    id: 'json-flattener',
    name: 'JSON Flattener',
    description: 'Flatten nested JSON structures',
    category: 'Data Processing',
    tags: ['json', 'flatten', 'transform'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
    icon: 'Braces',
    color: '#3b82f6',
    definition: createDefinition(
      'JSON Flattener',
      'Flatten nested API payloads into analytics-friendly key-value pairs.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Flatten Payload',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/nested-orders.json',
        }),
        createNode('flatten', NodeType.TRANSFORM_JSON, 660, 220, {
          operation: 'flatten',
          separator: '.',
          maxDepth: 5,
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 940, 220, {
          mappings: {
            orderId: 'order.id',
            customerEmail: 'customer.email',
            billingCity: 'billing.address.city',
            total: 'pricing.total',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'flatten'),
        createEdge('e3', 'flatten', 'map'),
        createEdge('e4', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'data-enrichment',
    name: 'Data Enrichment Pipeline',
    description: 'Enrich data with external API lookups',
    category: 'Data Processing',
    tags: ['enrichment', 'api', 'enhancement'],
    difficulty: 'advanced',
    estimatedTime: '25 min',
    icon: 'Plus',
    color: '#3b82f6',
    definition: createDefinition(
      'Data Enrichment Pipeline',
      'Loop through source records, call an external enrichment API, and merge the results back into the dataset.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Enrich Contacts',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/leads.json',
        }),
        createNode('foreach', NodeType.CONTROL_FOREACH, 660, 220, {
          itemsPath: '$.records',
          concurrency: 5,
        }),
        createNode('lookup', NodeType.INTEGRATION_HTTP, 940, 220, {
          method: 'GET',
          url: 'https://api.enrichment.example/v1/company?domain={{item.domain}}',
          headers: { Authorization: 'Bearer {{env.CRM_API_KEY}}' },
        }),
        createNode('merge', NodeType.TRANSFORM_MERGE, 1220, 220, {
          strategy: 'merge-by-key',
          keyField: 'domain',
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 1500, 220, {
          mappings: {
            company: 'company.name',
            employeeCount: 'company.employeeCount',
            industry: 'company.industry',
            domain: 'domain',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1780, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'foreach'),
        createEdge('e3', 'foreach', 'lookup'),
        createEdge('e4', 'lookup', 'merge'),
        createEdge('e5', 'merge', 'map'),
        createEdge('e6', 'map', 'result'),
      ],
      [createEnvVar('CRM_API_KEY')]
    ),
  },

  {
    id: 'regex-extractor',
    name: 'Regex Pattern Extractor',
    description: 'Extract data using regular expressions',
    category: 'Data Processing',
    tags: ['regex', 'extraction', 'parsing'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'SearchCode',
    color: '#3b82f6',
    definition: createDefinition(
      'Regex Pattern Extractor',
      'Download raw text, extract structured values with regex, and output a normalized JSON payload.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Run Pattern Extraction',
        }),
        createNode('fetch-text', NodeType.INTEGRATION_HTTP, 380, 220, {
          method: 'GET',
          url: 'https://example.com/reports/daily.txt',
          responseType: 'text',
        }),
        createNode('extract', NodeType.TRANSFORM_REGEX, 660, 220, {
          pattern: 'Order\\s+#(?<orderId>\\d+)\\s+Total:\\s+\\$(?<total>\\d+\\.\\d{2})',
          flags: 'g',
          namedGroups: true,
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 940, 220, {
          mappings: {
            orderId: 'groups.orderId',
            total: 'groups.total',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'fetch-text'),
        createEdge('e2', 'fetch-text', 'extract'),
        createEdge('e3', 'extract', 'map'),
        createEdge('e4', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'html-table-parser',
    name: 'HTML Table Parser',
    description: 'Extract tables from HTML documents',
    category: 'Data Processing',
    tags: ['html', 'table', 'scraping'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
    icon: 'Table',
    color: '#3b82f6',
    definition: createDefinition(
      'HTML Table Parser',
      'Fetch an HTML page, isolate a table, and convert its rows into structured JSON objects.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Parse HTML Table',
        }),
        createNode('fetch-page', NodeType.INTEGRATION_HTTP, 380, 220, {
          method: 'GET',
          url: 'https://example.com/reports/quarterly-results.html',
          responseType: 'html',
        }),
        createNode('parse-table', NodeType.UTILITY_PARSER, 660, 220, {
          parser: 'html-table',
          selector: 'table.results',
          headerRow: true,
        }),
        createNode('normalize', NodeType.TRANSFORM_JSON, 940, 220, {
          operation: 'format',
          pretty: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'table',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'fetch-page'),
        createEdge('e2', 'fetch-page', 'parse-table'),
        createEdge('e3', 'parse-table', 'normalize'),
        createEdge('e4', 'normalize', 'result'),
      ]
    ),
  },

  {
    id: 'data-type-converter',
    name: 'Data Type Converter',
    description: 'Convert data types with validation',
    category: 'Data Processing',
    tags: ['conversion', 'types', 'validation'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'Repeat',
    color: '#3b82f6',
    definition: createDefinition(
      'Data Type Converter',
      'Convert incoming string-heavy records into validated typed data ready for downstream systems.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Convert Types',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/raw-form-submissions.json',
        }),
        createNode('convert', NodeType.TRANSFORM_DATA, 660, 220, {
          conversions: {
            amount: 'number',
            subscribed: 'boolean',
            submittedAt: 'date',
            age: 'integer',
          },
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 940, 220, {
          requiredFields: ['amount', 'submittedAt', 'subscribed'],
          stopOnError: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'convert'),
        createEdge('e3', 'convert', 'validate'),
        createEdge('e4', 'validate', 'result'),
      ]
    ),
  },

  {
    id: 'array-reducer',
    name: 'Array Reducer',
    description: 'Reduce arrays with custom logic',
    category: 'Data Processing',
    tags: ['reduce', 'array', 'aggregate'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
    icon: 'Minimize2',
    color: '#3b82f6',
    definition: createDefinition(
      'Array Reducer',
      'Extract numeric values from a collection and reduce them into a compact summary object.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Reduce Array',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/order-items.json',
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 660, 220, {
          mappings: {
            lineTotal: 'price',
            quantity: 'qty',
          },
        }),
        createNode('reduce', NodeType.TRANSFORM_REDUCE, 940, 220, {
          initialValue: { totalRevenue: 0, totalUnits: 0 },
          reducer:
            'acc.totalRevenue += current.lineTotal * current.quantity; acc.totalUnits += current.quantity; return acc;',
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'map'),
        createEdge('e3', 'map', 'reduce'),
        createEdge('e4', 'reduce', 'result'),
      ]
    ),
  },

  {
    id: 'batch-processor',
    name: 'Batch Data Processor',
    description: 'Process data in configurable batches',
    category: 'Data Processing',
    tags: ['batch', 'chunking', 'processing'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'Layers',
    color: '#3b82f6',
    definition: createDefinition(
      'Batch Data Processor',
      'Chunk a dataset into batches, process each batch, and write grouped results to a file.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Process Batches',
        }),
        createNode('read-csv', NodeType.DATA_CSV_READ, 380, 220, {
          path: 'data/events.csv',
          hasHeaders: true,
        }),
        createNode('split', NodeType.TRANSFORM_SPLIT, 660, 220, {
          strategy: 'rows',
          chunkSize: 500,
        }),
        createNode('foreach', NodeType.CONTROL_FOREACH, 940, 220, {
          itemsPath: '$.chunks',
          concurrency: 3,
        }),
        createNode('process', NodeType.TRANSFORM_MAP, 1220, 220, {
          mappings: {
            batchId: 'meta.index',
            rows: 'items',
            rowCount: 'meta.count',
          },
        }),
        createNode('result', NodeType.OUTPUT_FILE, 1500, 220, {
          path: 'output/batch-results.json',
          format: 'json',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-csv'),
        createEdge('e2', 'read-csv', 'split'),
        createEdge('e3', 'split', 'foreach'),
        createEdge('e4', 'foreach', 'process'),
        createEdge('e5', 'process', 'result'),
      ]
    ),
  },

  {
    id: 'data-mapper',
    name: 'Field Mapping Tool',
    description: 'Map fields between different data schemas',
    category: 'Data Processing',
    tags: ['mapping', 'schema', 'transformation'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'ArrowRightLeft',
    color: '#3b82f6',
    definition: createDefinition(
      'Field Mapping Tool',
      'Map source system fields into a destination schema and validate the transformed records.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Map Records',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/source-contacts.json',
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 660, 220, {
          mappings: {
            externalId: 'contact_id',
            firstName: 'profile.first_name',
            lastName: 'profile.last_name',
            email: 'profile.email_address',
            lifecycleStage: 'status.stage',
          },
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 940, 220, {
          requiredFields: ['externalId', 'email'],
          stopOnError: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'map'),
        createEdge('e3', 'map', 'validate'),
        createEdge('e4', 'validate', 'result'),
      ]
    ),
  },

  {
    id: 'timestamp-normalizer',
    name: 'Timestamp Normalizer',
    description: 'Normalize timestamps across timezones',
    category: 'Data Processing',
    tags: ['timestamp', 'date', 'timezone'],
    difficulty: 'beginner',
    estimatedTime: '5 min',
    icon: 'Clock',
    color: '#3b82f6',
    definition: createDefinition(
      'Timestamp Normalizer',
      'Standardize mixed timestamp formats, convert everything to UTC, and sort chronologically.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Normalize Dates',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/activity-log.json',
        }),
        createNode('normalize', NodeType.TRANSFORM_DATA, 660, 220, {
          dateFields: ['createdAt', 'updatedAt', 'processedAt'],
          outputTimezone: 'UTC',
          inputFormats: ['iso8601', 'unix', 'MM/DD/YYYY HH:mm:ss Z'],
        }),
        createNode('sort', NodeType.TRANSFORM_SORT, 940, 220, {
          fields: [{ field: 'createdAt', direction: 'asc' }],
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'normalize'),
        createEdge('e3', 'normalize', 'sort'),
        createEdge('e4', 'sort', 'result'),
      ]
    ),
  },

  // ============ WEB SCRAPING (15 templates) ============
  {
    id: 'basic-web-scraper',
    name: 'Basic Web Scraper',
    description: 'Scrape web pages with CSS selectors',
    category: 'Web Scraping',
    tags: ['scraping', 'web', 'extraction'],
    difficulty: 'beginner',
    estimatedTime: '10 min',
    icon: 'Globe',
    color: '#8b5cf6',
    definition: createDefinition(
      'Basic Web Scraper',
      'Scrape a page with CSS selectors and emit normalized JSON output.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Manual Scrape Trigger',
          inputSchema: {
            url: 'string',
            selectors: 'object',
          },
          sampleInput: {
            url: 'https://example.com/blog',
            selectors: {
              title: 'h1.title',
              summary: 'article p.lead',
              links: 'article a',
            },
          },
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 380, 220, {
          label: 'Scrape Target Page',
          url: '{{input.url}}',
          waitFor: 'networkidle',
          selectors: '{{input.selectors}}',
          extractionRules: {
            title: 'h1.title, h1',
            summary: 'article p.lead, main p:first-of-type',
            links: 'article a',
          },
        }),
        createNode('node-transform', NodeType.TRANSFORM_JSON, 660, 220, {
          label: 'Normalize Payload',
          operation: 'map',
          mapping: {
            pageTitle: 'title',
            excerpt: 'summary',
            discoveredLinks: 'links',
            sourceUrl: '{{input.url}}',
          },
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 940, 220, {
          label: 'Return JSON Result',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-scrape', 'node-trigger', 'node-scrape'),
        createEdge('e-scrape-transform', 'node-scrape', 'node-transform'),
        createEdge('e-transform-output', 'node-transform', 'node-output'),
      ]
    ),
  },

  {
    id: 'e-commerce-scraper',
    name: 'E-Commerce Product Scraper',
    description: 'Extract product details from e-commerce sites',
    category: 'Web Scraping',
    tags: ['ecommerce', 'products', 'pricing'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'ShoppingCart',
    color: '#8b5cf6',
    definition: createDefinition(
      'E-Commerce Product Scraper',
      'Log into a storefront, scrape product data, save changes, and notify on price drops.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Hourly Product Check',
          cron: '0 * * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 380, 220, {
          label: 'Retry Protected Pages',
          maxAttempts: 3,
          delayMs: 3000,
          backoff: 'exponential',
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 660, 220, {
          label: 'Login and Scrape Products',
          url: 'https://shop.example.com/login',
          actions: [
            'fill input[name="email"] with {{env.ECOMMERCE_LOGIN_EMAIL}}',
            'fill input[name="password"] with {{env.ECOMMERCE_LOGIN_PASSWORD}}',
            'click button[type="submit"]',
            'goto https://shop.example.com/products',
          ],
          extractionRules: {
            title: '.product-card h2',
            price: '.product-card .price',
            originalPrice: '.product-card .price--compare',
            sku: '.product-card [data-sku]',
            url: '.product-card a',
          },
        }),
        createNode('node-filter', NodeType.TRANSFORM_FILTER, 940, 220, {
          label: 'Keep Changed Prices',
          logic: 'OR',
          conditions: [
            { field: 'priceChanged', operator: 'eq', value: true },
            { field: 'discountPercent', operator: 'gte', value: 10 },
          ],
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1220, 220, {
          label: 'Check Alert Threshold',
          condition: 'input.discountPercent >= 15 || input.priceDropAmount >= 20',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1500, 60, {
          label: 'Send Price Alert',
          title: 'E-Commerce Price Drop Detected',
          message: 'A monitored product dropped below the configured threshold.',
          severity: 'info',
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 1500, 380, {
          label: 'Persist Product Snapshot',
          connectionId: '{{env.SCRAPER_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into product_prices (sku, title, price, source_url, scraped_at) values (:sku, :title, :price, :url, now())',
        }),
      ],
      [
        createEdge('e-trigger-retry', 'node-trigger', 'node-retry'),
        createEdge('e-retry-playwright', 'node-retry', 'node-playwright'),
        createEdge('e-playwright-filter', 'node-playwright', 'node-filter'),
        createEdge('e-filter-condition', 'node-filter', 'node-condition'),
        createEdge('e-filter-postgres', 'node-filter', 'node-postgres'),
        createEdge('e-condition-notification', 'node-condition', 'node-notification'),
      ],
      [createEnvVar('ECOMMERCE_LOGIN_EMAIL'), createEnvVar('ECOMMERCE_LOGIN_PASSWORD'), createEnvVar('SCRAPER_DB_CONNECTION')]
    ),
  },

  {
    id: 'news-aggregator',
    name: 'News Article Aggregator',
    description: 'Collect and aggregate news from multiple sources',
    category: 'Web Scraping',
    tags: ['news', 'rss', 'content'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Newspaper',
    color: '#8b5cf6',
    definition: createDefinition(
      'News Article Aggregator',
      'Scrape multiple publishers, deduplicate overlapping headlines, summarize them, and store the digest.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Morning News Run',
          cron: '0 7 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 380, 220, {
          label: 'Iterate News Sources',
          items: ['https://news.ycombinator.com/', 'https://www.theverge.com/tech', 'https://techcrunch.com/'],
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 660, 220, {
          label: 'Scrape Headlines',
          url: '{{item}}',
          extractionRules: {
            title: 'article h2 a, .titleline a',
            summary: 'article p, .subline',
            publishedAt: 'time',
            url: 'article h2 a, .titleline a',
          },
        }),
        createNode('node-dedupe', NodeType.TRANSFORM_DEDUPE, 940, 220, {
          label: 'Remove Duplicate Stories',
          keys: ['title', 'url'],
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 1220, 220, {
          label: 'Summarize Articles',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Summarize the article in 2 sentences and highlight why it matters today.',
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 1500, 220, {
          label: 'Save News Digest',
          connectionId: '{{env.NEWS_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into news_articles (title, summary, source_url, published_at) values (:title, :summary, :url, :publishedAt)',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1780, 220, {
          label: 'Emit Daily Digest',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-foreach', 'node-trigger', 'node-foreach'),
        createEdge('e-foreach-scrape', 'node-foreach', 'node-scrape'),
        createEdge('e-scrape-dedupe', 'node-scrape', 'node-dedupe'),
        createEdge('e-dedupe-summary', 'node-dedupe', 'node-summary'),
        createEdge('e-summary-postgres', 'node-summary', 'node-postgres'),
        createEdge('e-postgres-output', 'node-postgres', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('NEWS_DB_CONNECTION')]
    ),
  },

  {
    id: 'social-media-monitor',
    name: 'Social Media Monitor',
    description: 'Monitor social media posts and mentions',
    category: 'Web Scraping',
    tags: ['social', 'monitoring', 'scraping'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'Share2',
    color: '#8b5cf6',
    definition: createDefinition(
      'Social Media Monitor',
      'Watch social feeds, score sentiment, log all mentions, and alert on negative spikes.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Every 15 Minutes',
          cron: '*/15 * * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 380, 220, {
          label: 'Retry Rate-Limited Requests',
          maxAttempts: 4,
          delayMs: 5000,
          backoff: 'linear',
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 660, 220, {
          label: 'Scrape Social Mentions',
          url: 'https://social.example.com/search?q=%23acme',
          extractionRules: {
            author: '[data-testid="User-Name"]',
            post: '[data-testid="tweetText"]',
            timestamp: 'time',
            permalink: 'article a[href*="/status/"]',
          },
          waitUntil: 'networkidle',
        }),
        createNode('node-sentiment', NodeType.AI_SENTIMENT, 940, 220, {
          label: 'Score Sentiment',
          provider: 'openai',
          model: 'gpt-4o-mini',
          threshold: 0.65,
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1220, 220, {
          label: 'Negative Spike?',
          condition: 'input.sentiment === "negative" || input.score <= -0.5',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1500, 60, {
          label: 'Alert Brand Team',
          title: 'Negative Mention Detected',
          message: 'A high-risk social media mention requires review.',
          severity: 'warning',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1500, 380, {
          label: 'Log Monitored Mentions',
          level: 'info',
          message: 'Processed social mention batch with sentiment scoring.',
        }),
      ],
      [
        createEdge('e-trigger-retry', 'node-trigger', 'node-retry'),
        createEdge('e-retry-playwright', 'node-retry', 'node-playwright'),
        createEdge('e-playwright-sentiment', 'node-playwright', 'node-sentiment'),
        createEdge('e-sentiment-condition', 'node-sentiment', 'node-condition'),
        createEdge('e-sentiment-log', 'node-sentiment', 'node-log'),
        createEdge('e-condition-notification', 'node-condition', 'node-notification'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
  },

  {
    id: 'job-posting-scraper',
    name: 'Job Posting Scraper',
    description: 'Scrape job postings from multiple job boards',
    category: 'Web Scraping',
    tags: ['jobs', 'recruitment', 'listings'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Briefcase',
    color: '#8b5cf6',
    definition: createDefinition(
      'Job Posting Scraper',
      'Collect fresh job listings, remove duplicates, store them, and notify a recruiting channel.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Daily Job Crawl',
          cron: '0 6 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 380, 220, {
          label: 'Retry Board Fetches',
          maxAttempts: 3,
          delayMs: 2500,
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 660, 220, {
          label: 'Scrape Job Boards',
          url: 'https://jobs.example.com/engineering',
          extractionRules: {
            title: '.job-card h2',
            company: '.job-card .company',
            location: '.job-card .location',
            url: '.job-card a',
          },
          pagination: {
            nextSelector: 'a.next',
            maxPages: 5,
          },
        }),
        createNode('node-filter', NodeType.TRANSFORM_FILTER, 940, 220, {
          label: 'Keep Relevant Roles',
          logic: 'AND',
          conditions: [
            { field: 'title', operator: 'contains', value: 'Engineer' },
            { field: 'location', operator: 'neq', value: 'Worldwide' },
          ],
        }),
        createNode('node-dedupe', NodeType.TRANSFORM_DEDUPE, 1220, 220, {
          label: 'Remove Duplicate Jobs',
          keys: ['title', 'company', 'location'],
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 1500, 220, {
          label: 'Save Job Listings',
          connectionId: '{{env.JOBS_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into job_postings (title, company, location, source_url) values (:title, :company, :location, :url)',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1780, 220, {
          label: 'Notify Recruiting Slack',
          channel: '{{env.JOB_ALERT_CHANNEL}}',
          message: 'New job postings were added to the recruiting pipeline.',
        }),
      ],
      [
        createEdge('e-trigger-retry', 'node-trigger', 'node-retry'),
        createEdge('e-retry-scrape', 'node-retry', 'node-scrape'),
        createEdge('e-scrape-filter', 'node-scrape', 'node-filter'),
        createEdge('e-filter-dedupe', 'node-filter', 'node-dedupe'),
        createEdge('e-dedupe-postgres', 'node-dedupe', 'node-postgres'),
        createEdge('e-postgres-slack', 'node-postgres', 'node-slack'),
      ],
      [createEnvVar('JOBS_DB_CONNECTION'), createEnvVar('SLACK_BOT_TOKEN'), createEnvVar('JOB_ALERT_CHANNEL')]
    ),
  },

  {
    id: 'price-tracker',
    name: 'Price Comparison Tracker',
    description: 'Track prices across multiple retailers',
    category: 'Web Scraping',
    tags: ['price', 'tracking', 'comparison'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'TrendingDown',
    color: '#8b5cf6',
    definition: createDefinition(
      'Price Comparison Tracker',
      'Check product pages across retailers, compare prices, and notify when a better offer appears.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Track Twice Daily',
          cron: '0 8,20 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 380, 220, {
          label: 'Iterate Products',
          items: ['wireless-headphones', 'gaming-monitor', 'mechanical-keyboard'],
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 660, 220, {
          label: 'Retry Retailer Fetch',
          maxAttempts: 3,
          delayMs: 2000,
          backoff: 'exponential',
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 940, 220, {
          label: 'Scrape Retailer Prices',
          url: 'https://prices.example.com/{{item}}',
          extractionRules: {
            retailer: '.offer-card .store-name',
            product: 'h1.product-title',
            price: '.offer-card .price',
            availability: '.offer-card .stock-status',
          },
        }),
        createNode('node-aggregate', NodeType.TRANSFORM_AGGREGATE, 1220, 220, {
          label: 'Find Lowest Price',
          groupBy: 'product',
          metrics: [{ field: 'price', operation: 'min', as: 'bestPrice' }],
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1500, 220, {
          label: 'Price Drop Alert',
          condition: 'input.bestPrice < input.previousBestPrice',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1780, 220, {
          label: 'Send Comparison Alert',
          title: 'Better Price Available',
          message: 'A tracked product has a new lowest price.',
          severity: 'info',
        }),
      ],
      [
        createEdge('e-trigger-foreach', 'node-trigger', 'node-foreach'),
        createEdge('e-foreach-retry', 'node-foreach', 'node-retry'),
        createEdge('e-retry-scrape', 'node-retry', 'node-scrape'),
        createEdge('e-scrape-aggregate', 'node-scrape', 'node-aggregate'),
        createEdge('e-aggregate-condition', 'node-aggregate', 'node-condition'),
        createEdge('e-condition-notification', 'node-condition', 'node-notification'),
      ]
    ),
  },

  {
    id: 'real-estate-scraper',
    name: 'Real Estate Listings Scraper',
    description: 'Extract real estate property listings',
    category: 'Web Scraping',
    tags: ['realestate', 'properties', 'listings'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Home',
    color: '#8b5cf6',
    definition: createDefinition(
      'Real Estate Listings Scraper',
      'Collect active listings, filter for desirable properties, and save them for analysis.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Nightly Listing Sync',
          cron: '0 2 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 380, 220, {
          label: 'Retry Listing Pages',
          maxAttempts: 3,
          delayMs: 4000,
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 660, 220, {
          label: 'Scrape Listing Details',
          url: 'https://homes.example.com/search?city=austin&status=for-sale',
          extractionRules: {
            address: '.listing-card .address',
            price: '.listing-card .price',
            bedrooms: '.listing-card .beds',
            url: '.listing-card a',
          },
          waitUntil: 'domcontentloaded',
        }),
        createNode('node-filter', NodeType.TRANSFORM_FILTER, 940, 220, {
          label: 'Filter Target Properties',
          logic: 'AND',
          conditions: [
            { field: 'price', operator: 'lte', value: 750000 },
            { field: 'bedrooms', operator: 'gte', value: 3 },
          ],
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 1220, 220, {
          label: 'Save Property Listings',
          connectionId: '{{env.REAL_ESTATE_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into property_listings (address, price, bedrooms, source_url) values (:address, :price, :bedrooms, :url)',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1500, 220, {
          label: 'Return Listings Feed',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-retry', 'node-trigger', 'node-retry'),
        createEdge('e-retry-playwright', 'node-retry', 'node-playwright'),
        createEdge('e-playwright-filter', 'node-playwright', 'node-filter'),
        createEdge('e-filter-postgres', 'node-filter', 'node-postgres'),
        createEdge('e-postgres-output', 'node-postgres', 'node-output'),
      ],
      [createEnvVar('REAL_ESTATE_DB_CONNECTION')]
    ),
  },

  {
    id: 'review-scraper',
    name: 'Customer Review Scraper',
    description: 'Collect customer reviews from multiple platforms',
    category: 'Web Scraping',
    tags: ['reviews', 'sentiment', 'feedback'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Star',
    color: '#8b5cf6',
    definition: createDefinition(
      'Customer Review Scraper',
      'Gather reviews, remove duplicates, score sentiment, and summarize overall customer feedback.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Daily Review Import',
          cron: '0 5 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 380, 220, {
          label: 'Scrape Review Sources',
          url: 'https://reviews.example.com/acme-widget',
          extractionRules: {
            author: '.review .author',
            rating: '.review .rating',
            reviewText: '.review .content',
            sourceUrl: '.review a.permalink',
          },
        }),
        createNode('node-dedupe', NodeType.TRANSFORM_DEDUPE, 660, 220, {
          label: 'Remove Duplicate Reviews',
          keys: ['author', 'reviewText'],
        }),
        createNode('node-sentiment', NodeType.AI_SENTIMENT, 940, 220, {
          label: 'Analyze Review Sentiment',
          provider: 'openai',
          model: 'gpt-4o-mini',
        }),
        createNode('node-aggregate', NodeType.TRANSFORM_AGGREGATE, 1220, 220, {
          label: 'Aggregate Review Trends',
          groupBy: 'rating',
          metrics: [{ field: 'score', operation: 'avg', as: 'averageSentimentScore' }],
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1500, 220, {
          label: 'Export Review Summary',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-scrape', 'node-trigger', 'node-scrape'),
        createEdge('e-scrape-dedupe', 'node-scrape', 'node-dedupe'),
        createEdge('e-dedupe-sentiment', 'node-dedupe', 'node-sentiment'),
        createEdge('e-sentiment-aggregate', 'node-sentiment', 'node-aggregate'),
        createEdge('e-aggregate-output', 'node-aggregate', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
  },

  {
    id: 'stock-data-scraper',
    name: 'Stock Market Data Scraper',
    description: 'Collect real-time stock market data',
    category: 'Web Scraping',
    tags: ['stocks', 'finance', 'market-data'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'TrendingUp',
    color: '#8b5cf6',
    definition: createDefinition(
      'Stock Market Data Scraper',
      'Fetch quote data from a market API, store snapshots, and alert when watchlist thresholds are hit.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Market Hours Polling',
          cron: '*/10 13-20 * * 1-5',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-retry', NodeType.CONTROL_RETRY, 380, 220, {
          label: 'Retry Quote Request',
          maxAttempts: 3,
          delayMs: 1500,
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 660, 220, {
          label: 'Fetch Market Quotes',
          url: 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,NVDA',
          method: 'GET',
          headers: {
            'x-api-key': '{{env.STOCK_API_KEY}}',
          },
        }),
        createNode('node-transform', NodeType.TRANSFORM_JSON, 940, 220, {
          label: 'Normalize Quote Payload',
          path: 'quoteResponse.result',
          mapping: {
            symbol: 'symbol',
            price: 'regularMarketPrice',
            changePercent: 'regularMarketChangePercent',
          },
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 1220, 220, {
          label: 'Store Quote Snapshot',
          connectionId: '{{env.MARKET_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into stock_quotes (symbol, price, change_percent, captured_at) values (:symbol, :price, :changePercent, now())',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1500, 220, {
          label: 'Check Alert Rule',
          condition: 'Math.abs(input.changePercent) >= 5',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1780, 220, {
          label: 'Send Market Alert',
          title: 'Stock Watchlist Alert',
          message: 'A tracked stock moved more than 5% during the latest poll.',
          severity: 'warning',
        }),
      ],
      [
        createEdge('e-trigger-retry', 'node-trigger', 'node-retry'),
        createEdge('e-retry-http', 'node-retry', 'node-http'),
        createEdge('e-http-transform', 'node-http', 'node-transform'),
        createEdge('e-transform-postgres', 'node-transform', 'node-postgres'),
        createEdge('e-postgres-condition', 'node-postgres', 'node-condition'),
        createEdge('e-condition-notification', 'node-condition', 'node-notification'),
      ],
      [createEnvVar('STOCK_API_KEY'), createEnvVar('MARKET_DB_CONNECTION')]
    ),
  },

  {
    id: 'weather-scraper',
    name: 'Weather Data Collector',
    description: 'Aggregate weather data from various sources',
    category: 'Web Scraping',
    tags: ['weather', 'climate', 'data'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Cloud',
    color: '#8b5cf6',
    definition: createDefinition(
      'Weather Data Collector',
      'Fetch weather conditions from an API, store the normalized payload, and return the latest observation.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Hourly Weather Pull',
          cron: '0 * * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 380, 220, {
          label: 'Fetch OpenWeather Data',
          url: 'https://api.openweathermap.org/data/2.5/weather?q=Austin,US&units=metric&appid={{env.OPENWEATHER_API_KEY}}',
          method: 'GET',
        }),
        createNode('node-transform', NodeType.TRANSFORM_JSON, 660, 220, {
          label: 'Normalize Weather Response',
          mapping: {
            city: 'name',
            temperature: 'main.temp',
            humidity: 'main.humidity',
            conditions: 'weather.0.description',
          },
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 940, 220, {
          label: 'Store Weather Snapshot',
          connectionId: '{{env.WEATHER_DB_CONNECTION}}',
          queryType: 'insert',
          query:
            'insert into weather_observations (city, temperature, humidity, conditions, observed_at) values (:city, :temperature, :humidity, :conditions, now())',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1220, 220, {
          label: 'Return Weather JSON',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-http', 'node-trigger', 'node-http'),
        createEdge('e-http-transform', 'node-http', 'node-transform'),
        createEdge('e-transform-postgres', 'node-transform', 'node-postgres'),
        createEdge('e-postgres-output', 'node-postgres', 'node-output'),
      ],
      [createEnvVar('OPENWEATHER_API_KEY'), createEnvVar('WEATHER_DB_CONNECTION')]
    ),
  },

  {
    id: 'image-scraper',
    name: 'Image Collection Scraper',
    description: 'Download images from websites',
    category: 'Web Scraping',
    tags: ['images', 'download', 'media'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Image',
    color: '#8b5cf6',
    definition: createDefinition(
      'Image Collection Scraper',
      'Scrape a gallery, iterate image URLs, process the files, and export them to storage.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Start Gallery Import',
          inputSchema: {
            galleryUrl: 'string',
          },
          sampleInput: {
            galleryUrl: 'https://example.com/gallery',
          },
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 380, 220, {
          label: 'Scrape Gallery Images',
          url: '{{input.galleryUrl}}',
          extractionRules: {
            title: 'h1',
            imageUrl: '.gallery img',
            caption: '.gallery figcaption',
          },
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 660, 220, {
          label: 'Iterate Images',
          items: '{{node-playwright.imageUrl}}',
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 940, 220, {
          label: 'Download and Resize',
          script:
            'import requests\nfrom PIL import Image\nfrom io import BytesIO\nurl = item\nimg = Image.open(BytesIO(requests.get(url, timeout=30).content))\nimg.thumbnail((1600, 1600))\nprint({"source": url, "status": "processed"})',
        }),
        createNode('node-file', NodeType.OUTPUT_FILE, 1220, 220, {
          label: 'Write Image Archive',
          format: 'zip',
          filename: 'gallery-images.zip',
        }),
      ],
      [
        createEdge('e-trigger-playwright', 'node-trigger', 'node-playwright'),
        createEdge('e-playwright-foreach', 'node-playwright', 'node-foreach'),
        createEdge('e-foreach-python', 'node-foreach', 'node-python'),
        createEdge('e-python-file', 'node-python', 'node-file'),
      ]
    ),
  },

  {
    id: 'sitemap-crawler',
    name: 'Sitemap Crawler',
    description: 'Crawl entire websites using sitemaps',
    category: 'Web Scraping',
    tags: ['crawler', 'sitemap', 'seo'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'Map',
    color: '#8b5cf6',
    definition: createDefinition(
      'Sitemap Crawler',
      'Fetch a sitemap XML file, expand URLs, crawl pages, and return a structured page inventory.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Manual Sitemap Crawl',
          inputSchema: {
            sitemapUrl: 'string',
          },
          sampleInput: {
            sitemapUrl: 'https://example.com/sitemap.xml',
          },
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 380, 220, {
          label: 'Fetch Sitemap XML',
          script:
            'import requests\nresponse = requests.get(inputs["sitemapUrl"], timeout=30)\nresponse.raise_for_status()\nprint(response.text)',
        }),
        createNode('node-xml', NodeType.TRANSFORM_XML, 660, 220, {
          label: 'Parse Sitemap URLs',
          path: 'urlset.url',
          mapping: {
            url: 'loc',
            lastModified: 'lastmod',
          },
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 940, 220, {
          label: 'Iterate Sitemap Entries',
          items: '{{node-xml.url}}',
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 1220, 220, {
          label: 'Scrape Page Metadata',
          url: '{{item}}',
          extractionRules: {
            title: 'title',
            canonical: 'link[rel="canonical"]',
            description: 'meta[name="description"]',
          },
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1500, 220, {
          label: 'Return Crawl Inventory',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-python', 'node-trigger', 'node-python'),
        createEdge('e-python-xml', 'node-python', 'node-xml'),
        createEdge('e-xml-foreach', 'node-xml', 'node-foreach'),
        createEdge('e-foreach-scrape', 'node-foreach', 'node-scrape'),
        createEdge('e-scrape-output', 'node-scrape', 'node-output'),
      ]
    ),
  },

  {
    id: 'pdf-scraper',
    name: 'PDF Document Scraper',
    description: 'Extract text and data from PDF documents',
    category: 'Web Scraping',
    tags: ['pdf', 'extraction', 'ocr'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'FileText',
    color: '#8b5cf6',
    definition: createDefinition(
      'PDF Document Scraper',
      'Download a PDF, extract text with Python, summarize the contents, and return structured output.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Manual PDF Input',
          inputSchema: {
            pdfUrl: 'string',
          },
          sampleInput: {
            pdfUrl: 'https://example.com/reports/q1-report.pdf',
          },
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 380, 220, {
          label: 'Extract PDF Text',
          script:
            'import io\nimport requests\nfrom pypdf import PdfReader\ncontent = requests.get(inputs["pdfUrl"], timeout=30).content\nreader = PdfReader(io.BytesIO(content))\ntext = "\n".join(page.extract_text() or "" for page in reader.pages)\nprint(text)',
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 660, 220, {
          label: 'Summarize Document',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Summarize this PDF in bullet points and capture key figures.',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 940, 220, {
          label: 'Return PDF Summary',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-python', 'node-trigger', 'node-python'),
        createEdge('e-python-summary', 'node-python', 'node-summary'),
        createEdge('e-summary-output', 'node-summary', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
  },

  {
    id: 'api-endpoint-discovery',
    name: 'API Endpoint Discovery',
    description: 'Discover and document API endpoints',
    category: 'Web Scraping',
    tags: ['api', 'discovery', 'documentation'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'Search',
    color: '#8b5cf6',
    definition: createDefinition(
      'API Endpoint Discovery',
      'Crawl a web app, extract network calls, deduplicate discovered endpoints, and export the catalog.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Manual Discovery Run',
          inputSchema: {
            appUrl: 'string',
          },
          sampleInput: {
            appUrl: 'https://app.example.com',
          },
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 380, 220, {
          label: 'Crawl Application',
          url: '{{input.appUrl}}',
          recordNetwork: true,
          actions: ['wait for network idle', 'click nav links', 'open settings page'],
        }),
        createNode('node-regex', NodeType.TRANSFORM_REGEX, 660, 220, {
          label: 'Extract API Calls',
          pattern: "https?://[^\"'\\s]+/api/[^\"'\\s]+",

          global: true,
        }),
        createNode('node-dedupe', NodeType.TRANSFORM_DEDUPE, 940, 220, {
          label: 'Deduplicate Endpoints',
          keys: ['match'],
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1220, 220, {
          label: 'Export Endpoint Catalog',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-playwright', 'node-trigger', 'node-playwright'),
        createEdge('e-playwright-regex', 'node-playwright', 'node-regex'),
        createEdge('e-regex-dedupe', 'node-regex', 'node-dedupe'),
        createEdge('e-dedupe-output', 'node-dedupe', 'node-output'),
      ]
    ),
  },

  {
    id: 'screenshot-generator',
    name: 'Website Screenshot Generator',
    description: 'Generate screenshots of websites',
    category: 'Web Scraping',
    tags: ['screenshot', 'visual', 'testing'],
    difficulty: 'beginner',
    estimatedTime: '10 min',
    icon: 'Camera',
    color: '#8b5cf6',
    definition: createDefinition(
      'Website Screenshot Generator',
      'Open a target page in Playwright, capture a full-page screenshot, and export the file.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Manual Screenshot Trigger',
          inputSchema: {
            targetUrl: 'string',
          },
          sampleInput: {
            targetUrl: 'https://example.com',
          },
        }),
        createNode('node-playwright', NodeType.SANDFLARE_PLAYWRIGHT, 380, 220, {
          label: 'Capture Screenshot',
          url: '{{input.targetUrl}}',
          screenshot: {
            fullPage: true,
            type: 'png',
            filename: 'website-capture.png',
          },
          viewport: {
            width: 1440,
            height: 1024,
          },
        }),
        createNode('node-file', NodeType.OUTPUT_FILE, 660, 220, {
          label: 'Export Screenshot File',
          format: 'png',
          filename: 'website-capture.png',
        }),
      ],
      [
        createEdge('e-trigger-playwright', 'node-trigger', 'node-playwright'),
        createEdge('e-playwright-file', 'node-playwright', 'node-file'),
      ]
    ),
  },

  // ============ AI/ML WORKFLOWS (20 templates) ============
  {
    id: 'text-summarization',
    name: 'Document Summarizer',
    description: 'Summarize long documents using AI',
    category: 'AI & ML',
    tags: ['ai', 'summarization', 'nlp'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'FileText',
    color: '#22c55e',
    definition: createDefinition(
      'Document Summarizer',
      'Load long-form text, generate a concise executive summary, and return a formatted response.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Summarize Document',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/research-report.json',
        }),
        createNode('summarize', NodeType.AI_SUMMARIZATION, 660, 220, {
          model: 'gpt-4o-mini',
          maxLength: 'short',
          style: 'executive-summary',
        }),
        createNode('format', NodeType.UTILITY_TEMPLATE, 940, 220, {
          template: 'Summary:\n{{summary}}\n\nKey themes:\n{{bullets}}',
        }),
        createNode('result', NodeType.OUTPUT_RESPONSE, 1220, 220, {
          format: 'markdown',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'summarize'),
        createEdge('e3', 'summarize', 'format'),
        createEdge('e4', 'format', 'result'),
      ]
    ),
  },

  {
    id: 'sentiment-analysis',
    name: 'Sentiment Analysis Pipeline',
    description: 'Analyze sentiment from text data',
    category: 'AI & ML',
    tags: ['sentiment', 'nlp', 'analysis'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'Smile',
    color: '#22c55e',
    definition: createDefinition(
      'Sentiment Analysis Pipeline',
      'Accept inbound text, score sentiment, and map the result into a structured output.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/sentiment-analysis',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          field: 'text',
        }),
        createNode('sentiment', NodeType.AI_SENTIMENT, 660, 220, {
          model: 'gpt-4o-mini',
          includeScore: true,
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 940, 220, {
          mappings: {
            sentiment: 'label',
            confidence: 'score',
            originalText: 'input.text',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'sentiment'),
        createEdge('e3', 'sentiment', 'map'),
        createEdge('e4', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'chatbot-agent',
    name: 'AI Chatbot Agent',
    description: 'Build conversational AI chatbots',
    category: 'AI & ML',
    tags: ['chatbot', 'conversation', 'ai'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'MessageSquare',
    color: '#22c55e',
    definition: createDefinition(
      'AI Chatbot Agent',
      'Receive chat messages, maintain conversation memory, and generate grounded assistant replies.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/chatbot',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          fields: ['sessionId', 'message'],
        }),
        createNode('memory', NodeType.MEMORY_BUFFER, 660, 220, {
          sessionKey: '{{input.sessionId}}',
          maxMessages: 12,
        }),
        createNode('prompt', NodeType.UTILITY_TEMPLATE, 940, 220, {
          template:
            'You are a helpful support assistant. Use the conversation memory and answer the user clearly. Latest user message: {{input.message}}',
        }),
        createNode('agent', NodeType.AGENT_LLM, 1220, 220, {
          model: 'gpt-4o',
          systemPrompt: 'Answer succinctly, ask clarifying questions only when necessary, and stay factual.',
        }),
        createNode('response', NodeType.OUTPUT_RESPONSE, 1500, 220, {
          format: 'chat',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'memory'),
        createEdge('e3', 'memory', 'prompt'),
        createEdge('e4', 'prompt', 'agent'),
        createEdge('e5', 'agent', 'response'),
      ],
      [createEnvVar('LLM_API_KEY')]
    ),
  },

  {
    id: 'content-generator',
    name: 'AI Content Generator',
    description: 'Generate content using language models',
    category: 'AI & ML',
    tags: ['content', 'generation', 'gpt'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Pen Tool',
    color: '#22c55e',
    definition: createDefinition(
      'AI Content Generator',
      'Build a prompt from campaign inputs and generate ready-to-publish marketing content.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Generate Campaign Copy',
          inputSchema: { topic: 'string', audience: 'string', tone: 'string' },
        }),
        createNode('template', NodeType.UTILITY_TEMPLATE, 380, 220, {
          template:
            'Write a launch announcement about {{input.topic}} for {{input.audience}} in a {{input.tone}} tone. Include headline, body copy, and CTA.',
        }),
        createNode('completion', NodeType.AI_COMPLETION, 660, 220, {
          model: 'gpt-4o-mini',
          temperature: 0.8,
          maxTokens: 700,
        }),
        createNode('result', NodeType.OUTPUT_RESPONSE, 940, 220, {
          format: 'markdown',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'template'),
        createEdge('e2', 'template', 'completion'),
        createEdge('e3', 'completion', 'result'),
      ]
    ),
  },

  {
    id: 'translation-service',
    name: 'Multi-Language Translator',
    description: 'Translate text between multiple languages',
    category: 'AI & ML',
    tags: ['translation', 'languages', 'i18n'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'Languages',
    color: '#22c55e',
    definition: createDefinition(
      'Multi-Language Translator',
      'Receive multilingual content, translate it into a target locale, and return the translated result.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/translation',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          fields: ['text', 'sourceLanguage', 'targetLanguage'],
        }),
        createNode('translate', NodeType.AI_TRANSLATION, 660, 220, {
          preserveFormatting: true,
          glossary: ['product names', 'brand terms'],
        }),
        createNode('result', NodeType.OUTPUT_RESPONSE, 940, 220, {
          format: 'text',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'translate'),
        createEdge('e3', 'translate', 'result'),
      ]
    ),
  },

  {
    id: 'image-classification',
    name: 'Image Classification',
    description: 'Classify images using AI models',
    category: 'AI & ML',
    tags: ['images', 'classification', 'vision'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'Image',
    color: '#22c55e',
    definition: createDefinition(
      'Image Classification',
      'Analyze an image, infer labels, then classify it into a business-ready category.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Analyze Image',
          inputSchema: { imageUrl: 'string' },
        }),
        createNode('analyze', NodeType.AI_IMAGE_ANALYZE, 380, 220, {
          imageUrl: '{{input.imageUrl}}',
          tasks: ['objects', 'scene', 'caption'],
        }),
        createNode('classify', NodeType.AI_CLASSIFICATION, 660, 220, {
          categories: ['product-photo', 'receipt', 'profile-picture', 'document-scan'],
          mode: 'single-label',
        }),
        createNode('format', NodeType.UTILITY_TEMPLATE, 940, 220, {
          template: 'Primary class: {{label}}\nConfidence: {{confidence}}\nDetected objects: {{objects}}',
        }),
        createNode('result', NodeType.OUTPUT_RESPONSE, 1220, 220, {
          format: 'markdown',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'analyze'),
        createEdge('e2', 'analyze', 'classify'),
        createEdge('e3', 'classify', 'format'),
        createEdge('e4', 'format', 'result'),
      ]
    ),
  },

  {
    id: 'text-classification',
    name: 'Text Categorization',
    description: 'Categorize text into predefined categories',
    category: 'AI & ML',
    tags: ['classification', 'nlp', 'categorization'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Tags',
    color: '#22c55e',
    definition: createDefinition(
      'Text Categorization',
      'Classify text into operational buckets and return the category with metadata.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/text-classification',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          field: 'content',
        }),
        createNode('classify', NodeType.AI_CLASSIFICATION, 660, 220, {
          categories: ['support', 'sales', 'billing', 'bug-report', 'feedback'],
          mode: 'single-label',
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 940, 220, {
          mappings: {
            category: 'label',
            confidence: 'confidence',
            text: 'input.content',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'classify'),
        createEdge('e3', 'classify', 'map'),
        createEdge('e4', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'ocr-pipeline',
    name: 'OCR Text Extraction',
    description: 'Extract text from images using OCR',
    category: 'AI & ML',
    tags: ['ocr', 'vision', 'extraction'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'ScanText',
    color: '#22c55e',
    definition: createDefinition(
      'OCR Text Extraction',
      'Extract text from an uploaded image, normalize the content, and return structured results.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Extract Text from Image',
          inputSchema: { imageUrl: 'string' },
        }),
        createNode('ocr', NodeType.AI_OCR, 380, 220, {
          imageUrl: '{{input.imageUrl}}',
          languageHints: ['en'],
        }),
        createNode('format', NodeType.TRANSFORM_JSON, 660, 220, {
          operation: 'format',
          pretty: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 940, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'ocr'),
        createEdge('e2', 'ocr', 'format'),
        createEdge('e3', 'format', 'result'),
      ]
    ),
  },

  {
    id: 'speech-to-text',
    name: 'Audio Transcription',
    description: 'Transcribe audio to text',
    category: 'AI & ML',
    tags: ['audio', 'transcription', 'speech'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Mic',
    color: '#22c55e',
    definition: createDefinition(
      'Audio Transcription',
      'Convert recorded audio into text and return a transcript with a short summary.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Transcribe Audio',
          inputSchema: { audioUrl: 'string' },
        }),
        createNode('transcribe', NodeType.AI_SPEECH_TO_TEXT, 380, 220, {
          audioUrl: '{{input.audioUrl}}',
          speakerDiarization: true,
        }),
        createNode('summarize', NodeType.AI_SUMMARIZATION, 660, 220, {
          model: 'gpt-4o-mini',
          maxLength: 'short',
        }),
        createNode('result', NodeType.OUTPUT_JSON, 940, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'transcribe'),
        createEdge('e2', 'transcribe', 'summarize'),
        createEdge('e3', 'summarize', 'result'),
      ]
    ),
  },

  {
    id: 'text-to-speech',
    name: 'Text to Speech Generator',
    description: 'Convert text to natural speech',
    category: 'AI & ML',
    tags: ['tts', 'audio', 'voice'],
    difficulty: 'intermediate',
    estimatedTime: '15 min',
    icon: 'Volume2',
    color: '#22c55e',
    definition: createDefinition(
      'Text to Speech Generator',
      'Accept text content, synthesize speech with a selected voice, and save the resulting audio file.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/text-to-speech',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          fields: ['text', 'voice'],
        }),
        createNode('tts', NodeType.AI_TEXT_TO_SPEECH, 660, 220, {
          voice: '{{input.voice}}',
          format: 'mp3',
        }),
        createNode('result', NodeType.OUTPUT_FILE, 940, 220, {
          path: 'output/generated-speech.mp3',
          format: 'binary',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'tts'),
        createEdge('e3', 'tts', 'result'),
      ]
    ),
  },

  {
    id: 'entity-extraction',
    name: 'Named Entity Recognition',
    description: 'Extract entities from text',
    category: 'AI & ML',
    tags: ['ner', 'entities', 'extraction'],
    difficulty: 'advanced',
    estimatedTime: '25 min',
    icon: 'Target',
    color: '#22c55e',
    definition: createDefinition(
      'Named Entity Recognition',
      'Prompt an LLM to extract entities from raw text, validate the response schema, and return structured JSON.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Extract Entities',
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/contracts.json',
        }),
        createNode('llm', NodeType.AI_LLM, 660, 220, {
          model: 'gpt-4o',
          prompt:
            'Extract people, companies, dates, and monetary values from the input. Return JSON with keys people, organizations, dates, and amounts.',
          outputFormat: 'json',
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 940, 220, {
          requiredFields: ['people', 'organizations', 'dates', 'amounts'],
          stopOnError: true,
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'llm'),
        createEdge('e3', 'llm', 'validate'),
        createEdge('e4', 'validate', 'result'),
      ]
    ),
  },

  {
    id: 'question-answering',
    name: 'Q&A System',
    description: 'Build question-answering systems',
    category: 'AI & ML',
    tags: ['qa', 'questions', 'answers'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'HelpCircle',
    color: '#22c55e',
    definition: createDefinition(
      'Q&A System',
      'Ingest PDF knowledge, split and embed the text, retrieve relevant chunks, and answer user questions.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Ask a Question',
          inputSchema: { question: 'string' },
        }),
        createNode('pdf', NodeType.RAG_PDF_LOADER, 380, 220, {
          path: 'docs/product-handbook.pdf',
        }),
        createNode('splitter', NodeType.RAG_TEXT_SPLITTER, 660, 220, {
          chunkSize: 800,
          chunkOverlap: 120,
        }),
        createNode('embedder', NodeType.RAG_EMBEDDER, 940, 220, {
          model: 'text-embedding-3-small',
        }),
        createNode('store', NodeType.RAG_VECTOR_STORE, 1220, 220, {
          indexName: 'product-handbook',
        }),
        createNode('retriever', NodeType.RAG_RETRIEVER, 1500, 220, {
          topK: 4,
          query: '{{input.question}}',
        }),
        createNode('qa', NodeType.RAG_QA_CHAIN, 1780, 220, {
          model: 'gpt-4o',
          question: '{{input.question}}',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'pdf'),
        createEdge('e2', 'pdf', 'splitter'),
        createEdge('e3', 'splitter', 'embedder'),
        createEdge('e4', 'embedder', 'store'),
        createEdge('e5', 'store', 'retriever'),
        createEdge('e6', 'retriever', 'qa'),
      ]
    ),
  },

  {
    id: 'code-generator',
    name: 'AI Code Generator',
    description: 'Generate code from natural language',
    category: 'AI & ML',
    tags: ['code', 'generation', 'ai'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'Code',
    color: '#22c55e',
    definition: createDefinition(
      'AI Code Generator',
      'Turn product requirements into code scaffolding, validate the structure, and write it to a source file.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Generate Code',
          inputSchema: { language: 'string', requirements: 'string' },
        }),
        createNode('prompt', NodeType.UTILITY_TEMPLATE, 380, 220, {
          template:
            'Write {{input.language}} code that satisfies these requirements: {{input.requirements}}. Include comments only when useful and return only code.',
        }),
        createNode('completion', NodeType.AI_COMPLETION, 660, 220, {
          model: 'gpt-4o',
          temperature: 0.2,
          maxTokens: 1200,
        }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 940, 220, {
          validationMode: 'code-block',
          requireFencedCode: false,
        }),
        createNode('result', NodeType.OUTPUT_FILE, 1220, 220, {
          path: 'output/generated-code.ts',
          format: 'text',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'prompt'),
        createEdge('e2', 'prompt', 'completion'),
        createEdge('e3', 'completion', 'validate'),
        createEdge('e4', 'validate', 'result'),
      ]
    ),
  },

  {
    id: 'content-moderation',
    name: 'Content Moderation',
    description: 'Moderate content for safety',
    category: 'AI & ML',
    tags: ['moderation', 'safety', 'filtering'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Shield',
    color: '#22c55e',
    definition: createDefinition(
      'Content Moderation',
      'Check incoming text for policy issues, route flagged content for review, and pass safe content onward.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/moderation',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'json',
          field: 'content',
        }),
        createNode('moderate', NodeType.AI_MODERATION, 660, 220, {
          categories: ['violence', 'hate', 'self-harm', 'sexual'],
        }),
        createNode('route', NodeType.CONTROL_CONDITION, 940, 220, {
          condition: 'flagged === true',
        }),
        createNode('notify', NodeType.OUTPUT_NOTIFICATION, 1220, 60, {
          channel: 'safety-review',
          message: 'Flagged content requires human review.',
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1220, 380, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'moderate'),
        createEdge('e3', 'moderate', 'route'),
        createEdge('e4', 'route', 'notify'),
        createEdge('e5', 'route', 'result'),
      ]
    ),
  },

  {
    id: 'email-classifier',
    name: 'Email Classification',
    description: 'Classify emails by type and priority',
    category: 'AI & ML',
    tags: ['email', 'classification', 'automation'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Mail',
    color: '#22c55e',
    definition: createDefinition(
      'Email Classification',
      'Parse inbound email content, classify the request type, score sentiment, and output a routing payload.',
      [
        createNode('trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          path: '/webhooks/email-classification',
          method: 'POST',
        }),
        createNode('parse', NodeType.UTILITY_PARSER, 380, 220, {
          format: 'email',
          fields: ['subject', 'body', 'from'],
        }),
        createNode('classify', NodeType.AI_CLASSIFICATION, 660, 220, {
          categories: ['sales', 'support', 'billing', 'spam', 'urgent'],
        }),
        createNode('sentiment', NodeType.AI_SENTIMENT, 940, 220, {
          includeScore: true,
        }),
        createNode('map', NodeType.TRANSFORM_MAP, 1220, 220, {
          mappings: {
            category: 'classification.label',
            confidence: 'classification.confidence',
            sentiment: 'sentiment.label',
            sender: 'input.from',
          },
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1500, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'parse'),
        createEdge('e2', 'parse', 'classify'),
        createEdge('e3', 'classify', 'sentiment'),
        createEdge('e4', 'sentiment', 'map'),
        createEdge('e5', 'map', 'result'),
      ]
    ),
  },

  {
    id: 'product-recommendation',
    name: 'Product Recommender',
    description: 'Generate product recommendations',
    category: 'AI & ML',
    tags: ['recommendation', 'ml', 'personalization'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'ThumbsUp',
    color: '#22c55e',
    definition: createDefinition(
      'Product Recommender',
      'Embed a product catalog, run semantic similarity search for a shopper profile, and explain the top picks.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Recommend Products',
          inputSchema: { shopperProfile: 'string' },
        }),
        createNode('catalog', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/product-catalog.json',
        }),
        createNode('embed', NodeType.AI_EMBEDDING, 660, 220, {
          model: 'text-embedding-3-small',
          inputField: 'description',
        }),
        createNode('search', NodeType.AI_VECTOR_SEARCH, 940, 220, {
          topK: 5,
          query: '{{input.shopperProfile}}',
        }),
        createNode('explain', NodeType.AI_LLM, 1220, 220, {
          model: 'gpt-4o-mini',
          prompt: 'Explain why each recommended product matches the shopper profile. Return JSON.',
          outputFormat: 'json',
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1500, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'catalog'),
        createEdge('e2', 'catalog', 'embed'),
        createEdge('e3', 'embed', 'search'),
        createEdge('e4', 'search', 'explain'),
        createEdge('e5', 'explain', 'result'),
      ]
    ),
  },

  {
    id: 'anomaly-detection',
    name: 'Anomaly Detection',
    description: 'Detect anomalies in data',
    category: 'AI & ML',
    tags: ['anomaly', 'detection', 'monitoring'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'AlertTriangle',
    color: '#22c55e',
    definition: createDefinition(
      'Anomaly Detection',
      'Score incoming metrics with Python, explain suspicious results with an LLM, and notify operators.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Detect Anomalies',
        }),
        createNode('read-csv', NodeType.DATA_CSV_READ, 380, 220, {
          path: 'data/metrics.csv',
          hasHeaders: true,
        }),
        createNode('detect', NodeType.SANDFLARE_PYTHON, 660, 220, {
          code:
            'import json\nrows = input_data.get("rows", [])\nfor row in rows:\n    value = float(row.get("value", 0))\n    row["is_anomaly"] = value > 3.5\noutput = {"rows": rows}',
          runtime: 'python3.11',
        }),
        createNode('explain', NodeType.AI_LLM, 940, 220, {
          model: 'gpt-4o-mini',
          prompt: 'Explain the likely cause of each anomaly and provide next-step recommendations.',
        }),
        createNode('notify', NodeType.OUTPUT_NOTIFICATION, 1220, 220, {
          channel: 'ops-alerts',
          message: 'Anomaly detection workflow found unusual metrics.',
        }),
        createNode('result', NodeType.OUTPUT_JSON, 1500, 220, {
          format: 'pretty',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-csv'),
        createEdge('e2', 'read-csv', 'detect'),
        createEdge('e3', 'detect', 'explain'),
        createEdge('e4', 'explain', 'notify'),
        createEdge('e5', 'notify', 'result'),
      ]
    ),
  },

  {
    id: 'image-generation',
    name: 'AI Image Generator',
    description: 'Generate images from text prompts',
    category: 'AI & ML',
    tags: ['images', 'generation', 'dalle'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Sparkles',
    color: '#22c55e',
    definition: createDefinition(
      'AI Image Generator',
      'Build a high-quality prompt from user inputs, generate an image, and save the artifact.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Generate Image',
          inputSchema: { concept: 'string', style: 'string' },
        }),
        createNode('prompt', NodeType.UTILITY_TEMPLATE, 380, 220, {
          template: '{{input.concept}}, in {{input.style}} style, studio lighting, high detail, 4k',
        }),
        createNode('generate', NodeType.AI_IMAGE_GEN, 660, 220, {
          size: '1024x1024',
          quality: 'high',
        }),
        createNode('result', NodeType.OUTPUT_FILE, 940, 220, {
          path: 'output/generated-image.png',
          format: 'binary',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'prompt'),
        createEdge('e2', 'prompt', 'generate'),
        createEdge('e3', 'generate', 'result'),
      ]
    ),
  },

  {
    id: 'vector-search',
    name: 'Semantic Search Engine',
    description: 'Build semantic search with embeddings',
    category: 'AI & ML',
    tags: ['search', 'embeddings', 'vectors'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'Search',
    color: '#22c55e',
    definition: createDefinition(
      'Semantic Search Engine',
      'Embed a document collection, search by meaning, and summarize the most relevant matches.',
      [
        createNode('trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Run Semantic Search',
          inputSchema: { query: 'string' },
        }),
        createNode('read-json', NodeType.DATA_JSON_READ, 380, 220, {
          path: 'data/knowledge-base.json',
        }),
        createNode('embed', NodeType.AI_EMBEDDING, 660, 220, {
          model: 'text-embedding-3-small',
          inputField: 'content',
        }),
        createNode('search', NodeType.AI_VECTOR_SEARCH, 940, 220, {
          topK: 5,
          query: '{{input.query}}',
        }),
        createNode('answer', NodeType.AI_LLM, 1220, 220, {
          model: 'gpt-4o-mini',
          prompt: 'Summarize the search hits and explain why they are relevant.',
        }),
        createNode('result', NodeType.OUTPUT_RESPONSE, 1500, 220, {
          format: 'markdown',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'read-json'),
        createEdge('e2', 'read-json', 'embed'),
        createEdge('e3', 'embed', 'search'),
        createEdge('e4', 'search', 'answer'),
        createEdge('e5', 'answer', 'result'),
      ]
    ),
  },

  {
    id: 'rag-pipeline',
    name: 'RAG Knowledge Base',
    description: 'Retrieval-Augmented Generation system',
    category: 'AI & ML',
    tags: ['rag', 'knowledge', 'llm'],
    difficulty: 'advanced',
    estimatedTime: '45 min',
    icon: 'BookOpen',
    color: '#22c55e',
    definition: createDefinition(
      'RAG Knowledge Base',
      'Ingest PDF knowledge, create a vector index, retrieve context, and answer live questions with grounded responses.',
      [
        createNode('trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          cron: '0 */6 * * *',
          label: 'Refresh Knowledge Base',
        }),
        createNode('pdf', NodeType.RAG_PDF_LOADER, 380, 220, {
          path: 'docs/customer-faq.pdf',
        }),
        createNode('splitter', NodeType.RAG_TEXT_SPLITTER, 660, 220, {
          chunkSize: 1000,
          chunkOverlap: 150,
        }),
        createNode('embedder', NodeType.RAG_EMBEDDER, 940, 220, {
          model: 'text-embedding-3-small',
        }),
        createNode('store', NodeType.RAG_VECTOR_STORE, 1220, 220, {
          indexName: 'customer-faq',
          upsert: true,
        }),
        createNode('retriever', NodeType.RAG_RETRIEVER, 1500, 220, {
          topK: 4,
          query: 'How do I upgrade my plan?',
        }),
        createNode('qa', NodeType.RAG_QA_CHAIN, 1780, 220, {
          model: 'gpt-4o',
          question: 'How do I upgrade my plan?',
        }),
      ],
      [
        createEdge('e1', 'trigger', 'pdf'),
        createEdge('e2', 'pdf', 'splitter'),
        createEdge('e3', 'splitter', 'embedder'),
        createEdge('e4', 'embedder', 'store'),
        createEdge('e5', 'store', 'retriever'),
        createEdge('e6', 'retriever', 'qa'),
      ]
    ),
  },

  // ============ AUTOMATION (15 templates) ============
  {
    id: 'email-automation',
    name: 'Email Automation',
    description: 'Automate email sending and responses',
    category: 'Automation',
    tags: ['email', 'automation', 'communication'],
    difficulty: 'beginner',
    estimatedTime: '10 min',
    icon: 'Mail',
    color: '#f59e0b',
    definition: createDefinition(
      'Email Automation',
      'Trigger on schedule, fetch recipient list from DB, compose personalised emails via template, and dispatch via SendGrid.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '0 9 * * 1', timezone: 'UTC' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 380, 220, { queryType: 'select', query: 'SELECT email, name FROM subscribers WHERE active = true' }),
        createNode('loop', NodeType.CONTROL_FOREACH, 660, 220, { iterateOver: 'rows' }),
        createNode('tmpl', NodeType.UTILITY_TEMPLATE, 940, 220, { template: 'Hi {{item.name}}, here is your weekly update...' }),
        createNode('send', NodeType.INTEGRATION_SENDGRID, 1220, 220, { fromEmail: 'hello@company.com', subject: 'Weekly Update' }),
        createNode('log', NodeType.OUTPUT_LOG, 1500, 220, { level: 'info', message: 'Email campaign complete' }),
      ],
      [
        createEdge('e1', 't', 'db'), createEdge('e2', 'db', 'loop'),
        createEdge('e3', 'loop', 'tmpl'), createEdge('e4', 'tmpl', 'send'), createEdge('e5', 'send', 'log'),
      ],
      [createEnvVar('SENDGRID_API_KEY'), createEnvVar('DATABASE_URL')]
    ),
  },

  {
    id: 'slack-notifications',
    name: 'Slack Notification Bot',
    description: 'Send automated Slack notifications',
    category: 'Automation',
    tags: ['slack', 'notifications', 'alerts'],
    difficulty: 'beginner',
    estimatedTime: '10 min',
    icon: 'MessageSquare',
    color: '#f59e0b',
    definition: createDefinition(
      'Slack Notification Bot',
      'Watch for webhook events, classify their severity, and post formatted alerts to the appropriate Slack channel.',
      [
        createNode('t', NodeType.TRIGGER_WEBHOOK, 100, 220, { path: '/hooks/notify', method: 'POST' }),
        createNode('json', NodeType.TRANSFORM_JSON, 380, 220, { operation: 'parse' }),
        createNode('cond', NodeType.CONTROL_CONDITION, 660, 220, { condition: 'input.severity === "critical"', evaluationType: 'expression' }),
        createNode('slack-crit', NodeType.INTEGRATION_SLACK, 940, 80, { channel: '#incidents', message: '🚨 CRITICAL: {{input.message}}' }),
        createNode('slack-info', NodeType.INTEGRATION_SLACK, 940, 360, { channel: '#general', message: 'ℹ️ {{input.message}}' }),
        createNode('log', NodeType.OUTPUT_LOG, 1220, 220, { level: 'info' }),
      ],
      [
        createEdge('e1', 't', 'json'), createEdge('e2', 'json', 'cond'),
        createEdge('e3', 'cond', 'slack-crit'), createEdge('e4', 'cond', 'slack-info'),
        createEdge('e5', 'slack-crit', 'log'), createEdge('e6', 'slack-info', 'log'),
      ],
      [createEnvVar('SLACK_BOT_TOKEN')]
    ),
  },

  {
    id: 'backup-automation',
    name: 'Automated Backup System',
    description: 'Schedule and automate data backups',
    category: 'Automation',
    tags: ['backup', 'storage', 'scheduling'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Archive',
    color: '#f59e0b',
    definition: createDefinition(
      'Automated Backup System',
      'Nightly backup: dump Postgres data, compress with Python, upload to S3, and notify on completion or failure.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '0 2 * * *', timezone: 'UTC' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 380, 220, { queryType: 'select', query: 'SELECT * FROM critical_data' }),
        createNode('compress', NodeType.SANDFLARE_PYTHON, 660, 220, { entrypoint: 'main.py', code: 'import json, gzip\noutput = {"compressed": True, "size": len(json.dumps(input_data))}' }),
        createNode('s3', NodeType.INTEGRATION_AWS_S3, 940, 220, { bucket: '{{env.BACKUP_BUCKET}}', key: 'backups/{{date}}/data.json.gz', operation: 'put' }),
        createNode('cond', NodeType.CONTROL_CONDITION, 1220, 220, { condition: 'input.success === true', evaluationType: 'expression' }),
        createNode('ok', NodeType.INTEGRATION_SLACK, 1500, 80, { channel: '#ops', message: '✅ Backup complete: {{input.key}}' }),
        createNode('err', NodeType.OUTPUT_NOTIFICATION, 1500, 360, { severity: 'high', message: 'Backup failed!' }),
      ],
      [
        createEdge('e1', 't', 'db'), createEdge('e2', 'db', 'compress'),
        createEdge('e3', 'compress', 's3'), createEdge('e4', 's3', 'cond'),
        createEdge('e5', 'cond', 'ok'), createEdge('e6', 'cond', 'err'),
      ],
      [createEnvVar('DATABASE_URL'), createEnvVar('AWS_ACCESS_KEY_ID'), createEnvVar('AWS_SECRET_ACCESS_KEY'), createEnvVar('BACKUP_BUCKET')]
    ),
  },

  {
    id: 'file-organizer',
    name: 'File Organizer',
    description: 'Automatically organize files by type',
    category: 'Automation',
    tags: ['files', 'organization', 'automation'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'FolderTree',
    color: '#f59e0b',
    definition: createDefinition(
      'File Organizer',
      'Watch an S3 prefix for new uploads, classify each file by MIME type using Python, and move it to the correct folder.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '*/15 * * * *' }),
        createNode('list', NodeType.SANDFLARE_FILE_LIST, 380, 220, { path: '/uploads/inbox', recursive: false }),
        createNode('loop', NodeType.CONTROL_FOREACH, 660, 220, { iterateOver: 'files' }),
        createNode('classify', NodeType.SANDFLARE_PYTHON, 940, 220, { entrypoint: 'main.py', code: 'ext = input_data.get("name","").split(".")[-1].lower()\noutput = {"file": input_data, "folder": {"jpg":"images","png":"images","pdf":"documents","csv":"data"}.get(ext,"misc")}' }),
        createNode('move', NodeType.SANDFLARE_BASH, 1220, 220, { command: 'mv /uploads/inbox/{{item.name}} /uploads/{{folder}}/{{item.name}}' }),
        createNode('log', NodeType.OUTPUT_LOG, 1500, 220, { level: 'info', message: 'File organised: {{item.name}}' }),
      ],
      [
        createEdge('e1', 't', 'list'), createEdge('e2', 'list', 'loop'),
        createEdge('e3', 'loop', 'classify'), createEdge('e4', 'classify', 'move'), createEdge('e5', 'move', 'log'),
      ]
    ),
  },

  {
    id: 'report-generator',
    name: 'Automated Report Generator',
    description: 'Generate and send periodic reports',
    category: 'Automation',
    tags: ['reports', 'analytics', 'scheduling'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'FileBarChart',
    color: '#f59e0b',
    definition: createDefinition(
      'Automated Report Generator',
      'Weekly: query Postgres for KPIs, summarise with AI, render an HTML report, and email it to stakeholders.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '0 8 * * 1', timezone: 'UTC' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 380, 220, { queryType: 'select', query: 'SELECT metric, value, week FROM weekly_kpis ORDER BY week DESC LIMIT 50' }),
        createNode('agg', NodeType.TRANSFORM_AGGREGATE, 660, 220, { groupBy: 'metric', aggregation: 'avg' }),
        createNode('ai', NodeType.AI_SUMMARIZATION, 940, 220, { provider: 'openai', model: 'gpt-4o-mini', format: 'bullet-points' }),
        createNode('tmpl', NodeType.UTILITY_TEMPLATE, 1220, 220, { template: '<h1>Weekly Report</h1><p>{{summary}}</p>' }),
        createNode('email', NodeType.OUTPUT_EMAIL, 1500, 220, { to: '{{env.REPORT_RECIPIENTS}}', subject: 'Weekly KPI Report' }),
      ],
      [
        createEdge('e1', 't', 'db'), createEdge('e2', 'db', 'agg'),
        createEdge('e3', 'agg', 'ai'), createEdge('e4', 'ai', 'tmpl'), createEdge('e5', 'tmpl', 'email'),
      ],
      [createEnvVar('DATABASE_URL'), createEnvVar('OPENAI_API_KEY'), createEnvVar('REPORT_RECIPIENTS')]
    ),
  },

  {
    id: 'invoice-processor',
    name: 'Invoice Processor',
    description: 'Process and track invoices automatically',
    category: 'Automation',
    tags: ['invoices', 'finance', 'automation'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'Receipt',
    color: '#f59e0b',
    definition: createDefinition(
      'Invoice Processor',
      'Receive invoice PDFs via webhook, extract data with OCR, validate amounts, save to DB, and notify finance team.',
      [
        createNode('t', NodeType.TRIGGER_WEBHOOK, 100, 220, { path: '/hooks/invoices', method: 'POST' }),
        createNode('ocr', NodeType.AI_OCR, 380, 220, { provider: 'openai', model: 'gpt-4o', extractFields: ['vendor', 'amount', 'dueDate', 'invoiceNumber'] }),
        createNode('validate', NodeType.UTILITY_VALIDATOR, 660, 220, { rules: [{ field: 'amount', type: 'number', min: 0 }, { field: 'dueDate', type: 'date' }] }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 940, 220, { queryType: 'insert', table: 'invoices' }),
        createNode('cond', NodeType.CONTROL_CONDITION, 1220, 220, { condition: 'input.amount > 10000', evaluationType: 'expression' }),
        createNode('slack', NodeType.INTEGRATION_SLACK, 1500, 80, { channel: '#finance', message: '💰 Large invoice: ${{input.amount}} from {{input.vendor}}' }),
        createNode('log', NodeType.OUTPUT_LOG, 1500, 360, { level: 'info' }),
      ],
      [
        createEdge('e1', 't', 'ocr'), createEdge('e2', 'ocr', 'validate'),
        createEdge('e3', 'validate', 'db'), createEdge('e4', 'db', 'cond'),
        createEdge('e5', 'cond', 'slack'), createEdge('e6', 'cond', 'log'),
      ],
      [createEnvVar('DATABASE_URL'), createEnvVar('OPENAI_API_KEY'), createEnvVar('SLACK_BOT_TOKEN')]
    ),
  },

  {
    id: 'social-media-poster',
    name: 'Social Media Scheduler',
    description: 'Schedule and post to social media',
    category: 'Automation',
    tags: ['social', 'scheduling', 'marketing'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Calendar',
    color: '#f59e0b',
    definition: createDefinition(
      'Social Media Scheduler',
      'Hourly: fetch approved posts from DB, generate platform-specific copy with AI, and publish via APIs.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '0 * * * *' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 380, 220, { queryType: 'select', query: 'SELECT * FROM scheduled_posts WHERE publish_at <= NOW() AND published = false LIMIT 5' }),
        createNode('loop', NodeType.CONTROL_FOREACH, 660, 220, { iterateOver: 'rows' }),
        createNode('ai', NodeType.AI_LLM, 940, 220, { provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'Adapt the post for Twitter (280 chars), LinkedIn, and a webhook. Return JSON with twitter, linkedin keys.' }),
        createNode('par', NodeType.CONTROL_PARALLEL, 1220, 220, { branches: ['twitter-api', 'linkedin-api'] }),
        createNode('tw', NodeType.INTEGRATION_HTTP, 1500, 80, { url: 'https://api.twitter.com/2/tweets', method: 'POST' }),
        createNode('li', NodeType.INTEGRATION_HTTP, 1500, 360, { url: 'https://api.linkedin.com/v2/ugcPosts', method: 'POST' }),
        createNode('mark', NodeType.INTEGRATION_POSTGRES, 1780, 220, { queryType: 'update', table: 'scheduled_posts', set: { published: true } }),
      ],
      [
        createEdge('e1', 't', 'db'), createEdge('e2', 'db', 'loop'),
        createEdge('e3', 'loop', 'ai'), createEdge('e4', 'ai', 'par'),
        createEdge('e5', 'par', 'tw'), createEdge('e6', 'par', 'li'),
        createEdge('e7', 'tw', 'mark'), createEdge('e8', 'li', 'mark'),
      ],
      [createEnvVar('DATABASE_URL'), createEnvVar('OPENAI_API_KEY'), createEnvVar('TWITTER_BEARER_TOKEN'), createEnvVar('LINKEDIN_ACCESS_TOKEN')]
    ),
  },

  {
    id: 'lead-nurturing',
    name: 'Lead Nurturing Workflow',
    description: 'Automate lead follow-up and nurturing',
    category: 'Automation',
    tags: ['leads', 'crm', 'sales'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'Users',
    color: '#f59e0b',
    definition: createDefinition(
      'Lead Nurturing Workflow',
      'Webhook triggers on new lead; score with AI, route by score tier, enrol in email sequence or assign to sales rep, and track in DB.',
      [
        createNode('t', NodeType.TRIGGER_WEBHOOK, 100, 220, { path: '/hooks/leads', method: 'POST' }),
        createNode('json', NodeType.TRANSFORM_JSON, 380, 220, { operation: 'parse' }),
        createNode('score', NodeType.AI_LLM, 660, 220, { provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'Score this lead 1-100 based on company size, job title, and intent signals. Return JSON: {score, tier, reason}.' }),
        createNode('sw', NodeType.CONTROL_SWITCH, 940, 220, { field: 'tier', cases: ['hot', 'warm', 'cold'] }),
        createNode('assign', NodeType.INTEGRATION_HTTP, 1220, 60, { url: 'https://api.hubspot.com/crm/v3/objects/contacts', method: 'POST' }),
        createNode('email-warm', NodeType.INTEGRATION_SENDGRID, 1220, 220, { templateId: 'warm-sequence-1', fromEmail: 'sales@company.com' }),
        createNode('drip', NodeType.INTEGRATION_SENDGRID, 1220, 380, { templateId: 'nurture-drip-1', fromEmail: 'hello@company.com' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 1500, 220, { queryType: 'insert', table: 'lead_events' }),
      ],
      [
        createEdge('e1', 't', 'json'), createEdge('e2', 'json', 'score'),
        createEdge('e3', 'score', 'sw'),
        createEdge('e4', 'sw', 'assign'), createEdge('e5', 'sw', 'email-warm'), createEdge('e6', 'sw', 'drip'),
        createEdge('e7', 'assign', 'db'), createEdge('e8', 'email-warm', 'db'), createEdge('e9', 'drip', 'db'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('SENDGRID_API_KEY'), createEnvVar('HUBSPOT_API_KEY'), createEnvVar('DATABASE_URL')]
    ),
  },

  {
    id: 'data-sync',
    name: 'Multi-Platform Data Sync',
    description: 'Sync data between multiple platforms',
    category: 'Automation',
    tags: ['sync', 'integration', 'data'],
    difficulty: 'advanced',
    estimatedTime: '30 min',
    icon: 'RefreshCw',
    color: '#f59e0b',
    definition: createDefinition(
      'Multi-Platform Data Sync',
      'Hourly sync: fetch records from Airtable, deduplicate, upsert into Postgres, and push deltas to Google Sheets.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '0 * * * *' }),
        createNode('airtable', NodeType.INTEGRATION_AIRTABLE, 380, 220, { baseId: '{{env.AIRTABLE_BASE_ID}}', tableId: 'Contacts', operation: 'list' }),
        createNode('sheets', NodeType.INTEGRATION_GOOGLE_SHEETS, 380, 400, { spreadsheetId: '{{env.SHEETS_ID}}', range: 'Contacts!A:Z', operation: 'get' }),
        createNode('merge', NodeType.TRANSFORM_MERGE, 660, 300, { strategy: 'union', keyField: 'email' }),
        createNode('dedupe', NodeType.TRANSFORM_DEDUPE, 940, 300, { keys: ['email'] }),
        createNode('pg', NodeType.INTEGRATION_POSTGRES, 1220, 160, { queryType: 'upsert', table: 'contacts', conflictTarget: 'email' }),
        createNode('write', NodeType.INTEGRATION_GOOGLE_SHEETS, 1220, 380, { spreadsheetId: '{{env.SHEETS_ID}}', range: 'Synced!A1', operation: 'update' }),
        createNode('log', NodeType.OUTPUT_LOG, 1500, 300, { level: 'info', message: 'Sync complete: {{count}} records' }),
      ],
      [
        createEdge('e1', 't', 'airtable'), createEdge('e2', 't', 'sheets'),
        createEdge('e3', 'airtable', 'merge'), createEdge('e4', 'sheets', 'merge'),
        createEdge('e5', 'merge', 'dedupe'),
        createEdge('e6', 'dedupe', 'pg'), createEdge('e7', 'dedupe', 'write'),
        createEdge('e8', 'pg', 'log'), createEdge('e9', 'write', 'log'),
      ],
      [createEnvVar('AIRTABLE_API_KEY'), createEnvVar('AIRTABLE_BASE_ID'), createEnvVar('GOOGLE_SHEETS_CREDENTIALS'), createEnvVar('SHEETS_ID'), createEnvVar('DATABASE_URL')]
    ),
  },

  {
    id: 'alert-system',
    name: 'Alert & Monitoring System',
    description: 'Monitor conditions and send alerts',
    category: 'Automation',
    tags: ['monitoring', 'alerts', 'notifications'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Bell',
    color: '#f59e0b',
    definition: createDefinition(
      'Alert & Monitoring System',
      'Every 5 minutes: ping health endpoints in parallel, aggregate results, and fire Slack + PagerDuty alerts on failures.',
      [
        createNode('t', NodeType.TRIGGER_SCHEDULE, 100, 220, { cron: '*/5 * * * *' }),
        createNode('par', NodeType.CONTROL_PARALLEL, 380, 220, { branches: ['api', 'db', 'worker'] }),
        createNode('api', NodeType.INTEGRATION_HTTP, 660, 60, { url: '{{env.API_HEALTH_URL}}', method: 'GET', timeout: 5000 }),
        createNode('db', NodeType.INTEGRATION_HTTP, 660, 220, { url: '{{env.DB_HEALTH_URL}}', method: 'GET', timeout: 5000 }),
        createNode('worker', NodeType.INTEGRATION_HTTP, 660, 380, { url: '{{env.WORKER_HEALTH_URL}}', method: 'GET', timeout: 5000 }),
        createNode('agg', NodeType.TRANSFORM_AGGREGATE, 940, 220, { operation: 'collect' }),
        createNode('cond', NodeType.CONTROL_CONDITION, 1220, 220, { condition: 'input.some(r => r.status !== 200)', evaluationType: 'expression' }),
        createNode('slack', NodeType.INTEGRATION_SLACK, 1500, 80, { channel: '#incidents', message: '🔴 Health check FAILED: {{input.failures}}' }),
        createNode('log', NodeType.OUTPUT_LOG, 1500, 360, { level: 'info', message: 'All systems healthy' }),
      ],
      [
        createEdge('e1', 't', 'par'),
        createEdge('e2', 'par', 'api'), createEdge('e3', 'par', 'db'), createEdge('e4', 'par', 'worker'),
        createEdge('e5', 'api', 'agg'), createEdge('e6', 'db', 'agg'), createEdge('e7', 'worker', 'agg'),
        createEdge('e8', 'agg', 'cond'),
        createEdge('e9', 'cond', 'slack'), createEdge('e10', 'cond', 'log'),
      ],
      [createEnvVar('API_HEALTH_URL'), createEnvVar('DB_HEALTH_URL'), createEnvVar('WORKER_HEALTH_URL'), createEnvVar('SLACK_BOT_TOKEN')]
    ),
  },

  {
    id: 'onboarding-automation',
    name: 'User Onboarding Flow',
    description: 'Automate new user onboarding process',
    category: 'Automation',
    tags: ['onboarding', 'users', 'workflow'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'UserPlus',
    color: '#f59e0b',
    definition: createDefinition(
      'User Onboarding Flow',
      'New user signup webhook triggers: send welcome email, create workspace in DB, notify Slack, then schedule follow-up drip.',
      [
        createNode('t', NodeType.TRIGGER_WEBHOOK, 100, 220, { path: '/hooks/signup', method: 'POST' }),
        createNode('json', NodeType.TRANSFORM_JSON, 380, 220, { operation: 'parse' }),
        createNode('db', NodeType.INTEGRATION_POSTGRES, 660, 220, { queryType: 'insert', table: 'user_onboarding', returning: true }),
        createNode('par', NodeType.CONTROL_PARALLEL, 940, 220, { branches: ['welcome-email', 'slack-notify'] }),
        createNode('email', NodeType.INTEGRATION_SENDGRID, 1220, 80, { templateId: 'welcome-template', fromEmail: 'welcome@company.com', subject: 'Welcome to the platform!' }),
        createNode('slack', NodeType.INTEGRATION_SLACK, 1220, 360, { channel: '#signups', message: '🎉 New user: {{input.email}} ({{input.plan}} plan)' }),
        createNode('delay', NodeType.UTILITY_DELAY, 1500, 220, { duration: 86400000, unit: 'ms' }),
        createNode('drip', NodeType.INTEGRATION_SENDGRID, 1780, 220, { templateId: 'day-1-tips', fromEmail: 'tips@company.com', subject: 'Getting started tips' }),
      ],
      [
        createEdge('e1', 't', 'json'), createEdge('e2', 'json', 'db'), createEdge('e3', 'db', 'par'),
        createEdge('e4', 'par', 'email'), createEdge('e5', 'par', 'slack'),
        createEdge('e6', 'email', 'delay'), createEdge('e7', 'delay', 'drip'),
      ],
      [createEnvVar('DATABASE_URL'), createEnvVar('SENDGRID_API_KEY'), createEnvVar('SLACK_BOT_TOKEN')]
    ),
  },

  {
    id: 'ticket-routing',
    name: 'Support Ticket Router',
    description: 'Automatically route support tickets',
    category: 'Automation',
    tags: ['support', 'tickets', 'routing'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Ticket',
    color: '#f59e0b',
    definition: createDefinition(
      'Support Ticket Router',
      'Classify inbound support tickets and route urgent cases to Slack while sending normal requests to email triage.',
      [
        createNode('ticket-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Receive Ticket',
          method: 'POST',
          authType: 'hmac',
          path: '/webhooks/support/tickets',
        }),
        createNode('ticket-classify', NodeType.AI_CLASSIFICATION, 380, 220, {
          label: 'Classify Priority',
          provider: 'openai',
          model: 'gpt-4o-mini',
          labels: ['urgent', 'normal'],
          prompt: 'Classify each support ticket by priority using severity, customer impact, and outage signals.',
        }),
        createNode('ticket-switch', NodeType.CONTROL_SWITCH, 660, 220, {
          label: 'Route by Priority',
          expression: 'input.label',
          cases: [
            { branchKey: 'urgent', label: 'Urgent', value: 'urgent' },
            { branchKey: 'normal', label: 'Normal', value: 'normal' },
          ],
        }),
        createNode('ticket-slack', NodeType.INTEGRATION_SLACK, 940, 60, {
          label: 'Alert Urgent Queue',
          channel: '{{env.SLACK_URGENT_CHANNEL}}',
          message: 'Urgent support ticket from {{input.customer.email}}: {{input.subject}}',
        }),
        createNode('ticket-email', NodeType.INTEGRATION_EMAIL, 940, 380, {
          label: 'Send to Email Triage',
          to: '{{env.SUPPORT_TRIAGE_EMAIL}}',
          subject: 'New support ticket: {{input.subject}}',
        }),
      ],
      [
        createEdge('e-ticket-webhook-classify', 'ticket-webhook', 'ticket-classify'),
        createEdge('e-ticket-classify-switch', 'ticket-classify', 'ticket-switch'),
        createEdge('e-ticket-switch-slack', 'ticket-switch', 'ticket-slack'),
        createEdge('e-ticket-switch-email', 'ticket-switch', 'ticket-email'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_URGENT_CHANNEL'),
        createEnvVar('EMAIL_API_KEY'),
        createEnvVar('SUPPORT_TRIAGE_EMAIL'),
        createEnvVar('SUPPORT_WEBHOOK_SECRET'),
      ]
    ),
  },

  {
    id: 'compliance-checker',
    name: 'Compliance Checker',
    description: 'Automate compliance checks and reporting',
    category: 'Automation',
    tags: ['compliance', 'audit', 'reporting'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'ShieldCheck',
    color: '#f59e0b',
    definition: createDefinition(
      'Compliance Checker',
      'Run scheduled compliance checks against regulated records and branch the results into alerts or audit logs.',
      [
        createNode('compliance-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Nightly Audit',
          cron: '0 2 * * *',
          timezone: 'UTC',
        }),
        createNode('compliance-db', NodeType.INTEGRATION_POSTGRES, 380, 220, {
          label: 'Fetch Records',
          connectionId: '{{env.COMPLIANCE_DB_CONNECTION}}',
          queryType: 'select',
          query: 'select id, customer_id, status, last_reviewed_at, country_code from compliance_records where archived = false',
        }),
        createNode('compliance-python', NodeType.SANDFLARE_PYTHON, 660, 220, {
          label: 'Run Compliance Rules',
          code:
            "from datetime import datetime, timezone\nrecords = input.get('rows', [])\nviolations = [r for r in records if r.get('status') != 'approved' or not r.get('last_reviewed_at')]\nresult = {'passed': len(violations) == 0, 'violations': violations, 'checkedAt': datetime.now(timezone.utc).isoformat()}\n",
          packages: ['python-dateutil'],
          timeout: 120,
        }),
        createNode('compliance-condition', NodeType.CONTROL_CONDITION, 940, 220, {
          label: 'Any Violations?',
          evaluationType: 'expression',
          condition: 'input.passed === false',
        }),
        createNode('compliance-notify', NodeType.OUTPUT_NOTIFICATION, 1220, 60, {
          label: 'Notify Compliance Team',
          channel: 'compliance-alerts',
          severity: 'high',
          title: 'Compliance check failed',
        }),
        createNode('compliance-log', NodeType.OUTPUT_LOG, 1220, 380, {
          label: 'Write Audit Log',
          level: 'info',
          message: 'Compliance checks passed for {{input.checkedAt}}',
        }),
      ],
      [
        createEdge('e-compliance-trigger-db', 'compliance-trigger', 'compliance-db'),
        createEdge('e-compliance-db-python', 'compliance-db', 'compliance-python'),
        createEdge('e-compliance-python-condition', 'compliance-python', 'compliance-condition'),
        createEdge('e-compliance-condition-notify', 'compliance-condition', 'compliance-notify'),
        createEdge('e-compliance-condition-log', 'compliance-condition', 'compliance-log'),
      ],
      [createEnvVar('COMPLIANCE_DB_CONNECTION')]
    ),
  },

  {
    id: 'deployment-pipeline',
    name: 'CI/CD Deployment Pipeline',
    description: 'Automated deployment workflow',
    category: 'Automation',
    tags: ['cicd', 'deployment', 'devops'],
    difficulty: 'advanced',
    estimatedTime: '45 min',
    icon: 'Rocket',
    color: '#f59e0b',
    definition: createDefinition(
      'CI/CD Deployment Pipeline',
      'Clone application code, install dependencies, run tests, and deploy only when the validation stage passes.',
      [
        createNode('deploy-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Deployment Webhook',
          method: 'POST',
          authType: 'hmac',
          path: '/webhooks/deploy',
        }),
        createNode('deploy-clone', NodeType.SANDFLARE_GIT_CLONE, 380, 220, {
          label: 'Clone Repository',
          repository: '{{input.repository.clone_url}}',
          branch: '{{input.ref || "refs/heads/main"}}',
        }),
        createNode('deploy-install', NodeType.SANDFLARE_INSTALL, 660, 220, {
          label: 'Install Dependencies',
          command: 'npm ci',
          workingDirectory: '/workspace/repo',
        }),
        createNode('deploy-tests', NodeType.SANDFLARE_BASH, 940, 220, {
          label: 'Run Test Suite',
          command: 'cd /workspace/repo && npm test && npm run build',
          timeout: 900,
        }),
        createNode('deploy-condition', NodeType.CONTROL_CONDITION, 1220, 220, {
          label: 'Tests Passed?',
          evaluationType: 'expression',
          condition: 'input.exitCode === 0',
        }),
        createNode('deploy-docker', NodeType.SANDFLARE_DOCKER, 1500, 60, {
          label: 'Build and Deploy Image',
          image: '{{env.DEPLOY_IMAGE}}',
          dockerfile: 'Dockerfile',
          push: true,
        }),
        createNode('deploy-notify', NodeType.OUTPUT_NOTIFICATION, 1500, 380, {
          label: 'Notify Failed Build',
          channel: 'deployments',
          severity: 'high',
          title: 'Deployment failed validation',
        }),
      ],
      [
        createEdge('e-deploy-webhook-clone', 'deploy-webhook', 'deploy-clone'),
        createEdge('e-deploy-clone-install', 'deploy-clone', 'deploy-install'),
        createEdge('e-deploy-install-tests', 'deploy-install', 'deploy-tests'),
        createEdge('e-deploy-tests-condition', 'deploy-tests', 'deploy-condition'),
        createEdge('e-deploy-condition-docker', 'deploy-condition', 'deploy-docker'),
        createEdge('e-deploy-condition-notify', 'deploy-condition', 'deploy-notify'),
      ],
      [
        createEnvVar('DEPLOY_IMAGE'),
        createEnvVar('DOCKER_REGISTRY_TOKEN'),
        createEnvVar('DEPLOY_WEBHOOK_SECRET'),
      ]
    ),
  },

  {
    id: 'database-migration',
    name: 'Database Migration Tool',
    description: 'Automate database migrations',
    category: 'Automation',
    tags: ['database', 'migration', 'devops'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'Database',
    color: '#f59e0b',
    definition: createDefinition(
      'Database Migration Tool',
      'Inspect the current schema, generate a migration script, apply it to Postgres, and log the outcome.',
      [
        createNode('migration-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Start Migration',
          inputSchema: {
            changeRequest: 'string',
          },
        }),
        createNode('migration-read', NodeType.INTEGRATION_POSTGRES, 380, 220, {
          label: 'Read Current Schema',
          connectionId: '{{env.MIGRATION_DB_CONNECTION}}',
          queryType: 'select',
          query: "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position",
        }),
        createNode('migration-generate', NodeType.SANDFLARE_PYTHON, 660, 220, {
          label: 'Generate Migration SQL',
          code:
            "change_request = input.get('changeRequest', '')\nresult = {'migrationSql': f'-- Generated migration for: {change_request}\\n-- Review before applying\\n'}\n",
          timeout: 120,
        }),
        createNode('migration-apply', NodeType.INTEGRATION_POSTGRES, 940, 220, {
          label: 'Apply Migration',
          connectionId: '{{env.MIGRATION_DB_CONNECTION}}',
          queryType: 'execute',
          query: '{{input.migrationSql}}',
        }),
        createNode('migration-log', NodeType.OUTPUT_LOG, 1220, 220, {
          label: 'Log Migration Result',
          level: 'info',
          message: 'Migration applied successfully at {{execution.startedAt}}',
        }),
      ],
      [
        createEdge('e-migration-trigger-read', 'migration-trigger', 'migration-read'),
        createEdge('e-migration-read-generate', 'migration-read', 'migration-generate'),
        createEdge('e-migration-generate-apply', 'migration-generate', 'migration-apply'),
        createEdge('e-migration-apply-log', 'migration-apply', 'migration-log'),
      ],
      [createEnvVar('MIGRATION_DB_CONNECTION')]
    ),
  },

  // ============ INTEGRATION (20 templates) ============
  {
    id: 'stripe-payment',
    name: 'Stripe Payment Integration',
    description: 'Process payments with Stripe',
    category: 'Integration',
    tags: ['stripe', 'payments', 'ecommerce'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'CreditCard',
    color: '#ec4899',
    definition: createDefinition(
      'Stripe Payment Integration',
      'Parse Stripe webhook events and route payment records into storage or receipt delivery flows.',
      [
        createNode('stripe-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Stripe Webhook',
          method: 'POST',
          authType: 'hmac',
          path: '/webhooks/stripe',
        }),
        createNode('stripe-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse Event Payload',
          operation: 'parse',
        }),
        createNode('stripe-switch', NodeType.CONTROL_SWITCH, 660, 220, {
          label: 'Route Event Type',
          expression: 'input.type',
          cases: [
            { branchKey: 'save', label: 'Save Payment', value: 'checkout.session.completed' },
            { branchKey: 'receipt', label: 'Send Receipt', value: 'payment_intent.succeeded' },
          ],
        }),
        createNode('stripe-postgres', NodeType.INTEGRATION_POSTGRES, 940, 60, {
          label: 'Save Payment Record',
          connectionId: '{{env.PAYMENTS_DB_CONNECTION}}',
          queryType: 'insert',
          query: 'insert into stripe_events (event_id, event_type, customer_email, amount) values (:id, :type, :data.object.customer_details.email, :data.object.amount_total)',
        }),
        createNode('stripe-email', NodeType.INTEGRATION_EMAIL, 940, 380, {
          label: 'Email Receipt',
          to: '{{input.data.object.receipt_email || input.data.object.customer_details.email}}',
          subject: 'Your payment receipt',
        }),
      ],
      [
        createEdge('e-stripe-webhook-json', 'stripe-webhook', 'stripe-json'),
        createEdge('e-stripe-json-switch', 'stripe-json', 'stripe-switch'),
        createEdge('e-stripe-switch-postgres', 'stripe-switch', 'stripe-postgres'),
        createEdge('e-stripe-switch-email', 'stripe-switch', 'stripe-email'),
      ],
      [
        createEnvVar('STRIPE_WEBHOOK_SECRET'),
        createEnvVar('PAYMENTS_DB_CONNECTION'),
        createEnvVar('EMAIL_API_KEY'),
      ]
    ),
  },

  {
    id: 'github-webhook',
    name: 'GitHub Webhook Handler',
    description: 'Handle GitHub webhook events',
    category: 'Integration',
    tags: ['github', 'webhooks', 'git'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Github',
    color: '#ec4899',
    definition: createDefinition(
      'GitHub Webhook Handler',
      'Normalize GitHub webhook events and branch them into collaboration notifications or issue tracking actions.',
      [
        createNode('github-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'GitHub Event',
          method: 'POST',
          authType: 'hmac',
          path: '/webhooks/github',
        }),
        createNode('github-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse GitHub Payload',
          operation: 'parse',
        }),
        createNode('github-switch', NodeType.CONTROL_SWITCH, 660, 220, {
          label: 'Route Event',
          expression: 'input.event',
          cases: [
            { branchKey: 'push', label: 'Push', value: 'push' },
            { branchKey: 'work', label: 'PR or Issue', value: 'pull_request' },
          ],
        }),
        createNode('github-slack', NodeType.INTEGRATION_SLACK, 940, 60, {
          label: 'Notify Engineering Slack',
          channel: '{{env.SLACK_GITHUB_CHANNEL}}',
          message: 'Repository activity detected: {{input.repository.full_name}} ({{input.event}})',
        }),
        createNode('github-jira', NodeType.INTEGRATION_JIRA, 940, 380, {
          label: 'Create Jira Ticket',
          operation: 'create_issue',
          projectKey: '{{env.JIRA_PROJECT_KEY}}',
          issueType: 'Task',
        }),
      ],
      [
        createEdge('e-github-webhook-json', 'github-webhook', 'github-json'),
        createEdge('e-github-json-switch', 'github-json', 'github-switch'),
        createEdge('e-github-switch-slack', 'github-switch', 'github-slack'),
        createEdge('e-github-switch-jira', 'github-switch', 'github-jira'),
      ],
      [
        createEnvVar('GITHUB_WEBHOOK_SECRET'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_GITHUB_CHANNEL'),
        createEnvVar('JIRA_API_TOKEN'),
        createEnvVar('JIRA_PROJECT_KEY'),
      ]
    ),
  },

  {
    id: 'airtable-sync',
    name: 'Airtable Data Sync',
    description: 'Sync data with Airtable',
    category: 'Integration',
    tags: ['airtable', 'database', 'sync'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Table',
    color: '#ec4899',
    definition: createDefinition(
      'Airtable Data Sync',
      'Fetch Airtable records on a schedule, remap them into a relational shape, and upsert them into Postgres.',
      [
        createNode('airtable-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Sync Schedule',
          cron: '0 * * * *',
          timezone: 'UTC',
        }),
        createNode('airtable-fetch', NodeType.INTEGRATION_AIRTABLE, 380, 220, {
          label: 'Fetch Airtable Rows',
          operation: 'list_records',
          baseId: '{{env.AIRTABLE_BASE_ID}}',
          table: '{{env.AIRTABLE_TABLE_NAME}}',
          view: 'Grid view',
        }),
        createNode('airtable-map', NodeType.TRANSFORM_MAP, 660, 220, {
          label: 'Map Columns',
          mapping: {
            externalId: 'id',
            name: 'fields.Name',
            status: 'fields.Status',
            updatedAt: 'fields.Last Modified',
          },
        }),
        createNode('airtable-postgres', NodeType.INTEGRATION_POSTGRES, 940, 220, {
          label: 'Upsert to Postgres',
          connectionId: '{{env.AIRTABLE_SYNC_DB_CONNECTION}}',
          queryType: 'execute',
          query: 'insert into airtable_sync (external_id, name, status, updated_at) values (:externalId, :name, :status, :updatedAt) on conflict (external_id) do update set name = excluded.name, status = excluded.status, updated_at = excluded.updated_at',
        }),
        createNode('airtable-log', NodeType.OUTPUT_LOG, 1220, 220, {
          label: 'Log Sync Result',
          level: 'info',
          message: 'Airtable sync completed successfully',
        }),
      ],
      [
        createEdge('e-airtable-trigger-fetch', 'airtable-trigger', 'airtable-fetch'),
        createEdge('e-airtable-fetch-map', 'airtable-fetch', 'airtable-map'),
        createEdge('e-airtable-map-postgres', 'airtable-map', 'airtable-postgres'),
        createEdge('e-airtable-postgres-log', 'airtable-postgres', 'airtable-log'),
      ],
      [
        createEnvVar('AIRTABLE_API_KEY'),
        createEnvVar('AIRTABLE_BASE_ID'),
        createEnvVar('AIRTABLE_TABLE_NAME'),
        createEnvVar('AIRTABLE_SYNC_DB_CONNECTION'),
      ]
    ),
  },

  {
    id: 'google-sheets',
    name: 'Google Sheets Integration',
    description: 'Read and write to Google Sheets',
    category: 'Integration',
    tags: ['sheets', 'google', 'data'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Sheet',
    color: '#ec4899',
    definition: createDefinition(
      'Google Sheets Integration',
      'Read scheduled spreadsheet data, filter the rows, process them in Python, and write clean output back to Sheets.',
      [
        createNode('sheets-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Daily Sheet Sync',
          cron: '0 6 * * *',
          timezone: 'UTC',
        }),
        createNode('sheets-read', NodeType.INTEGRATION_GOOGLE_SHEETS, 380, 220, {
          label: 'Read Source Sheet',
          operation: 'read_range',
          spreadsheetId: '{{env.SOURCE_SHEET_ID}}',
          range: 'Leads!A:F',
        }),
        createNode('sheets-filter', NodeType.TRANSFORM_FILTER, 660, 220, {
          label: 'Keep Qualified Rows',
          logic: 'AND',
          conditions: [
            { field: 'status', operator: 'eq', value: 'qualified' },
            { field: 'email', operator: 'neq', value: '' },
          ],
        }),
        createNode('sheets-python', NodeType.SANDFLARE_PYTHON, 940, 220, {
          label: 'Process Rows',
          code:
            "rows = input.get('items', [])\nprocessed = [{'email': row.get('email', '').lower(), 'score': row.get('score', 0), 'owner': row.get('owner', 'unassigned')} for row in rows]\nresult = {'rows': processed}\n",
          timeout: 120,
        }),
        createNode('sheets-write', NodeType.INTEGRATION_GOOGLE_SHEETS, 1220, 220, {
          label: 'Write Output Sheet',
          operation: 'append_rows',
          spreadsheetId: '{{env.DESTINATION_SHEET_ID}}',
          range: 'Processed!A:C',
        }),
      ],
      [
        createEdge('e-sheets-trigger-read', 'sheets-trigger', 'sheets-read'),
        createEdge('e-sheets-read-filter', 'sheets-read', 'sheets-filter'),
        createEdge('e-sheets-filter-python', 'sheets-filter', 'sheets-python'),
        createEdge('e-sheets-python-write', 'sheets-python', 'sheets-write'),
      ],
      [
        createEnvVar('GOOGLE_SHEETS_CREDENTIALS_JSON'),
        createEnvVar('SOURCE_SHEET_ID'),
        createEnvVar('DESTINATION_SHEET_ID'),
      ]
    ),
  },

  {
    id: 'notion-database',
    name: 'Notion Database Manager',
    description: 'Manage Notion databases',
    category: 'Integration',
    tags: ['notion', 'database', 'productivity'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'BookOpen',
    color: '#ec4899',
    definition: createDefinition(
      'Notion Database Manager',
      'Create Notion database entries from webhook payloads, normalize the created record response, and notify the team in Slack.',
      [
        createNode('notion-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Receive Request',
          method: 'POST',
          path: '/webhooks/notion/database',
        }),
        createNode('notion-create', NodeType.INTEGRATION_NOTION, 380, 220, {
          label: 'Create Notion Record',
          operation: 'create_page',
          databaseId: '{{env.NOTION_DATABASE_ID}}',
        }),
        createNode('notion-json', NodeType.TRANSFORM_JSON, 660, 220, {
          label: 'Format Response',
          operation: 'stringify',
          schemaHint: 'Summarize the created Notion page id, url, and title.',
        }),
        createNode('notion-slack', NodeType.INTEGRATION_SLACK, 940, 220, {
          label: 'Notify Team',
          channel: '{{env.SLACK_NOTION_CHANNEL}}',
          message: 'Created Notion page: {{input}}',
        }),
      ],
      [
        createEdge('e-notion-webhook-create', 'notion-webhook', 'notion-create'),
        createEdge('e-notion-create-json', 'notion-create', 'notion-json'),
        createEdge('e-notion-json-slack', 'notion-json', 'notion-slack'),
      ],
      [
        createEnvVar('NOTION_API_KEY'),
        createEnvVar('NOTION_DATABASE_ID'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_NOTION_CHANNEL'),
      ]
    ),
  },

  {
    id: 'aws-s3-upload',
    name: 'AWS S3 File Uploader',
    description: 'Upload files to AWS S3',
    category: 'Integration',
    tags: ['aws', 's3', 'storage'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Cloud',
    color: '#ec4899',
    definition: createDefinition(
      'AWS S3 File Uploader',
      'Watch for inbound files, process them with Python, store the results in S3, and publish a completion notification.',
      [
        createNode('s3-watch', NodeType.TRIGGER_FILE_WATCH, 100, 220, {
          label: 'Watch Upload Directory',
          path: '/data/incoming',
          pattern: '*.csv',
        }),
        createNode('s3-python', NodeType.SANDFLARE_PYTHON, 380, 220, {
          label: 'Process File',
          code:
            "file_path = input.get('path')\nresult = {'sourcePath': file_path, 'targetKey': f\"processed/{file_path.split('/')[-1]}\"}\n",
          timeout: 120,
        }),
        createNode('s3-upload', NodeType.INTEGRATION_AWS_S3, 660, 220, {
          label: 'Upload to S3',
          operation: 'put_object',
          bucket: '{{env.AWS_S3_BUCKET}}',
          key: '{{input.targetKey}}',
        }),
        createNode('s3-notify', NodeType.OUTPUT_NOTIFICATION, 940, 220, {
          label: 'Notify Upload Complete',
          channel: 'storage-events',
          severity: 'info',
          title: 'File uploaded to S3',
        }),
      ],
      [
        createEdge('e-s3-watch-python', 's3-watch', 's3-python'),
        createEdge('e-s3-python-upload', 's3-python', 's3-upload'),
        createEdge('e-s3-upload-notify', 's3-upload', 's3-notify'),
      ],
      [
        createEnvVar('AWS_ACCESS_KEY_ID'),
        createEnvVar('AWS_SECRET_ACCESS_KEY'),
        createEnvVar('AWS_S3_BUCKET'),
      ]
    ),
  },

  {
    id: 'twilio-sms',
    name: 'Twilio SMS Sender',
    description: 'Send SMS via Twilio',
    category: 'Integration',
    tags: ['twilio', 'sms', 'communication'],
    difficulty: 'beginner',
    estimatedTime: '10 min',
    icon: 'Smartphone',
    color: '#ec4899',
    definition: createDefinition(
      'Twilio SMS Sender',
      'Validate inbound SMS automation requests and either send the message through Twilio or log the invalid payload.',
      [
        createNode('twilio-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'SMS Request Webhook',
          method: 'POST',
          path: '/webhooks/twilio/sms',
        }),
        createNode('twilio-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse SMS Payload',
          operation: 'parse',
        }),
        createNode('twilio-condition', NodeType.CONTROL_CONDITION, 660, 220, {
          label: 'Payload Valid?',
          evaluationType: 'expression',
          condition: 'Boolean(input.to && input.body)',
        }),
        createNode('twilio-send', NodeType.INTEGRATION_TWILIO, 940, 60, {
          label: 'Send SMS',
          from: '{{env.TWILIO_FROM_NUMBER}}',
          to: '{{input.to}}',
          body: '{{input.body}}',
        }),
        createNode('twilio-log', NodeType.OUTPUT_LOG, 940, 380, {
          label: 'Log Invalid Request',
          level: 'warn',
          message: 'Skipped Twilio send because required fields were missing',
        }),
      ],
      [
        createEdge('e-twilio-webhook-json', 'twilio-webhook', 'twilio-json'),
        createEdge('e-twilio-json-condition', 'twilio-json', 'twilio-condition'),
        createEdge('e-twilio-condition-send', 'twilio-condition', 'twilio-send'),
        createEdge('e-twilio-condition-log', 'twilio-condition', 'twilio-log'),
      ],
      [
        createEnvVar('TWILIO_ACCOUNT_SID'),
        createEnvVar('TWILIO_AUTH_TOKEN'),
        createEnvVar('TWILIO_FROM_NUMBER'),
      ]
    ),
  },

  {
    id: 'sendgrid-email',
    name: 'SendGrid Email Campaign',
    description: 'Send emails via SendGrid',
    category: 'Integration',
    tags: ['sendgrid', 'email', 'marketing'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Mail',
    color: '#ec4899',
    definition: createDefinition(
      'SendGrid Email Campaign',
      'Load campaign contacts from Postgres, iterate through each recipient, compose a personalized message, and send it via SendGrid.',
      [
        createNode('sendgrid-trigger', NodeType.TRIGGER_MANUAL, 100, 220, {
          label: 'Start Campaign',
          inputSchema: {
            campaignName: 'string',
          },
        }),
        createNode('sendgrid-postgres', NodeType.INTEGRATION_POSTGRES, 380, 220, {
          label: 'Get Contacts',
          connectionId: '{{env.MARKETING_DB_CONNECTION}}',
          queryType: 'select',
          query: 'select email, first_name, segment from campaign_contacts where active = true order by created_at desc limit 500',
        }),
        createNode('sendgrid-foreach', NodeType.CONTROL_FOREACH, 660, 220, {
          label: 'Iterate Contacts',
          items: '{{input.rows}}',
        }),
        createNode('sendgrid-template', NodeType.UTILITY_TEMPLATE, 940, 220, {
          label: 'Compose Email',
          template:
            'Hi {{item.first_name}},\n\nWe are sending you the latest {{input.campaignName}} update for the {{item.segment}} segment.\n\nBest,\nMarketing Team',
        }),
        createNode('sendgrid-send', NodeType.INTEGRATION_SENDGRID, 1220, 220, {
          label: 'Send Campaign Email',
          from: '{{env.SENDGRID_FROM_EMAIL}}',
          to: '{{item.email}}',
          subject: '{{input.campaignName}} update',
        }),
      ],
      [
        createEdge('e-sendgrid-trigger-postgres', 'sendgrid-trigger', 'sendgrid-postgres'),
        createEdge('e-sendgrid-postgres-foreach', 'sendgrid-postgres', 'sendgrid-foreach'),
        createEdge('e-sendgrid-foreach-template', 'sendgrid-foreach', 'sendgrid-template'),
        createEdge('e-sendgrid-template-send', 'sendgrid-template', 'sendgrid-send'),
      ],
      [
        createEnvVar('MARKETING_DB_CONNECTION'),
        createEnvVar('SENDGRID_API_KEY'),
        createEnvVar('SENDGRID_FROM_EMAIL'),
      ]
    ),
  },

  {
    id: 'discord-bot',
    name: 'Discord Bot Integration',
    description: 'Build Discord bot workflows',
    category: 'Integration',
    tags: ['discord', 'bot', 'chat'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'MessageCircle',
    color: '#ec4899',
    definition: createDefinition(
      'Discord Bot Integration',
      'Respond to Discord webhook messages with an LLM-generated reply and post the answer back into the channel.',
      [
        createNode('discord-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Discord Event',
          method: 'POST',
          path: '/webhooks/discord/messages',
        }),
        createNode('discord-llm', NodeType.AI_LLM, 380, 220, {
          label: 'Generate Reply',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.6,
          prompt: 'Write a helpful Discord bot response to the incoming message.',
          systemPrompt: 'You are a friendly community manager bot. Keep responses short and useful.',
        }),
        createNode('discord-post', NodeType.INTEGRATION_DISCORD, 660, 220, {
          label: 'Post Reply',
          channelId: '{{input.channel_id}}',
          message: '{{input.text || input.reply}}',
        }),
      ],
      [
        createEdge('e-discord-webhook-llm', 'discord-webhook', 'discord-llm'),
        createEdge('e-discord-llm-post', 'discord-llm', 'discord-post'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('DISCORD_BOT_TOKEN'),
      ]
    ),
  },

  {
    id: 'telegram-bot',
    name: 'Telegram Bot',
    description: 'Create Telegram bot workflows',
    category: 'Integration',
    tags: ['telegram', 'bot', 'messaging'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Send',
    color: '#ec4899',
    definition: createDefinition(
      'Telegram Bot',
      'Receive Telegram bot messages, generate a reply with an LLM, and send the response back to Telegram.',
      [
        createNode('telegram-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Telegram Update',
          method: 'POST',
          path: '/webhooks/telegram',
        }),
        createNode('telegram-llm', NodeType.AI_LLM, 380, 220, {
          label: 'Draft Telegram Reply',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.5,
          prompt: 'Respond to the Telegram message with concise, helpful guidance.',
          systemPrompt: 'You are a Telegram bot assistant that answers quickly and clearly.',
        }),
        createNode('telegram-send', NodeType.INTEGRATION_TELEGRAM, 660, 220, {
          label: 'Send Telegram Message',
          chatId: '{{input.message.chat.id}}',
          text: '{{input.reply}}',
        }),
      ],
      [
        createEdge('e-telegram-webhook-llm', 'telegram-webhook', 'telegram-llm'),
        createEdge('e-telegram-llm-send', 'telegram-llm', 'telegram-send'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('TELEGRAM_BOT_TOKEN'),
      ]
    ),
  },

  {
    id: 'jira-issue-tracker',
    name: 'Jira Issue Automation',
    description: 'Automate Jira issue management',
    category: 'Integration',
    tags: ['jira', 'issues', 'project-management'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'Bug',
    color: '#ec4899',
    definition: createDefinition(
      'Jira Issue Automation',
      'Inspect inbound issue events, create Jira work for high-priority incidents, and notify Slack for the remaining events.',
      [
        createNode('jira-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Issue Event Webhook',
          method: 'POST',
          path: '/webhooks/jira/issues',
        }),
        createNode('jira-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Issue Event',
          operation: 'parse',
        }),
        createNode('jira-condition', NodeType.CONTROL_CONDITION, 660, 220, {
          label: 'Needs Jira Ticket?',
          evaluationType: 'expression',
          condition: "['critical', 'high'].includes(input.priority)",
        }),
        createNode('jira-create', NodeType.INTEGRATION_JIRA, 940, 60, {
          label: 'Create Jira Issue',
          operation: 'create_issue',
          projectKey: '{{env.JIRA_PROJECT_KEY}}',
          issueType: 'Bug',
        }),
        createNode('jira-slack', NodeType.INTEGRATION_SLACK, 940, 380, {
          label: 'Notify Slack',
          channel: '{{env.SLACK_INCIDENT_CHANNEL}}',
          message: 'New issue received: {{input.title}} (priority: {{input.priority}})',
        }),
      ],
      [
        createEdge('e-jira-webhook-json', 'jira-webhook', 'jira-json'),
        createEdge('e-jira-json-condition', 'jira-json', 'jira-condition'),
        createEdge('e-jira-condition-create', 'jira-condition', 'jira-create'),
        createEdge('e-jira-condition-slack', 'jira-condition', 'jira-slack'),
      ],
      [
        createEnvVar('JIRA_API_TOKEN'),
        createEnvVar('JIRA_PROJECT_KEY'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_INCIDENT_CHANNEL'),
      ]
    ),
  },

  {
    id: 'salesforce-integration',
    name: 'Salesforce CRM Integration',
    description: 'Integrate with Salesforce CRM',
    category: 'Integration',
    tags: ['salesforce', 'crm', 'sales'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'Building',
    color: '#ec4899',
    definition: createDefinition(
      'Salesforce CRM Integration',
      'Pull recent CRM records from Salesforce on a schedule, normalize the response, and persist it into Postgres.',
      [
        createNode('salesforce-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'CRM Sync Schedule',
          cron: '0 */6 * * *',
          timezone: 'UTC',
        }),
        createNode('salesforce-http', NodeType.INTEGRATION_HTTP, 380, 220, {
          label: 'Fetch Salesforce Data',
          url: '{{env.SALESFORCE_INSTANCE_URL}}/services/data/v59.0/query/?q=SELECT+Id,Name,Email,LastModifiedDate+FROM+Contact+WHERE+LastModifiedDate=TODAY',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{env.SALESFORCE_ACCESS_TOKEN}}',
          },
        }),
        createNode('salesforce-json', NodeType.TRANSFORM_JSON, 660, 220, {
          label: 'Parse Salesforce Response',
          operation: 'parse',
        }),
        createNode('salesforce-postgres', NodeType.INTEGRATION_POSTGRES, 940, 220, {
          label: 'Store CRM Contacts',
          connectionId: '{{env.CRM_SYNC_DB_CONNECTION}}',
          queryType: 'execute',
          query: 'insert into salesforce_contacts (external_id, full_name, email, synced_at) values (:Id, :Name, :Email, now()) on conflict (external_id) do update set full_name = excluded.full_name, email = excluded.email, synced_at = excluded.synced_at',
        }),
      ],
      [
        createEdge('e-salesforce-trigger-http', 'salesforce-trigger', 'salesforce-http'),
        createEdge('e-salesforce-http-json', 'salesforce-http', 'salesforce-json'),
        createEdge('e-salesforce-json-postgres', 'salesforce-json', 'salesforce-postgres'),
      ],
      [
        createEnvVar('SALESFORCE_INSTANCE_URL'),
        createEnvVar('SALESFORCE_ACCESS_TOKEN'),
        createEnvVar('CRM_SYNC_DB_CONNECTION'),
      ]
    ),
  },

  {
    id: 'hubspot-crm',
    name: 'HubSpot CRM Connector',
    description: 'Connect to HubSpot CRM',
    category: 'Integration',
    tags: ['hubspot', 'crm', 'marketing'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'Users',
    color: '#ec4899',
    definition: createDefinition(
      'HubSpot CRM Connector',
      'Parse inbound CRM events, sync the contact to HubSpot, and publish a sales notification to Slack.',
      [
        createNode('hubspot-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Lead Webhook',
          method: 'POST',
          path: '/webhooks/hubspot/leads',
        }),
        createNode('hubspot-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Lead Data',
          operation: 'parse',
        }),
        createNode('hubspot-http', NodeType.INTEGRATION_HTTP, 660, 220, {
          label: 'Upsert HubSpot Contact',
          url: 'https://api.hubapi.com/crm/v3/objects/contacts',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{env.HUBSPOT_ACCESS_TOKEN}}',
            'Content-Type': 'application/json',
          },
        }),
        createNode('hubspot-slack', NodeType.INTEGRATION_SLACK, 940, 220, {
          label: 'Notify Sales Team',
          channel: '{{env.SLACK_SALES_CHANNEL}}',
          message: 'Synced HubSpot lead: {{input.email}}',
        }),
      ],
      [
        createEdge('e-hubspot-webhook-json', 'hubspot-webhook', 'hubspot-json'),
        createEdge('e-hubspot-json-http', 'hubspot-json', 'hubspot-http'),
        createEdge('e-hubspot-http-slack', 'hubspot-http', 'hubspot-slack'),
      ],
      [
        createEnvVar('HUBSPOT_ACCESS_TOKEN'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_SALES_CHANNEL'),
      ]
    ),
  },

  {
    id: 'shopify-orders',
    name: 'Shopify Order Processor',
    description: 'Process Shopify orders',
    category: 'Integration',
    tags: ['shopify', 'ecommerce', 'orders'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'ShoppingBag',
    color: '#ec4899',
    definition: createDefinition(
      'Shopify Order Processor',
      'Interpret Shopify order events and branch them into confirmation, fraud alerting, or order recording paths.',
      [
        createNode('shopify-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Shopify Order Webhook',
          method: 'POST',
          authType: 'hmac',
          path: '/webhooks/shopify/orders',
        }),
        createNode('shopify-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse Order Event',
          operation: 'parse',
        }),
        createNode('shopify-switch', NodeType.CONTROL_SWITCH, 660, 220, {
          label: 'Route Order Status',
          expression: 'input.financial_status',
          cases: [
            { branchKey: 'paid', label: 'Paid', value: 'paid' },
            { branchKey: 'review', label: 'Needs Review', value: 'pending' },
            { branchKey: 'record', label: 'Record Only', value: 'authorized' },
          ],
        }),
        createNode('shopify-sendgrid', NodeType.INTEGRATION_SENDGRID, 940, 60, {
          label: 'Send Order Confirmation',
          from: '{{env.SENDGRID_FROM_EMAIL}}',
          to: '{{input.customer.email}}',
          subject: 'Your Shopify order is confirmed',
        }),
        createNode('shopify-slack', NodeType.INTEGRATION_SLACK, 940, 220, {
          label: 'Alert Operations',
          channel: '{{env.SLACK_ORDERS_CHANNEL}}',
          message: 'Order {{input.name}} requires review before fulfillment.',
        }),
        createNode('shopify-postgres', NodeType.INTEGRATION_POSTGRES, 940, 380, {
          label: 'Record Order',
          connectionId: '{{env.SHOPIFY_DB_CONNECTION}}',
          queryType: 'insert',
          query: 'insert into shopify_orders (order_id, order_name, financial_status, customer_email) values (:id, :name, :financial_status, :customer.email)',
        }),
      ],
      [
        createEdge('e-shopify-webhook-json', 'shopify-webhook', 'shopify-json'),
        createEdge('e-shopify-json-switch', 'shopify-json', 'shopify-switch'),
        createEdge('e-shopify-switch-sendgrid', 'shopify-switch', 'shopify-sendgrid'),
        createEdge('e-shopify-switch-slack', 'shopify-switch', 'shopify-slack'),
        createEdge('e-shopify-switch-postgres', 'shopify-switch', 'shopify-postgres'),
      ],
      [
        createEnvVar('SHOPIFY_WEBHOOK_SECRET'),
        createEnvVar('SENDGRID_API_KEY'),
        createEnvVar('SENDGRID_FROM_EMAIL'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_ORDERS_CHANNEL'),
        createEnvVar('SHOPIFY_DB_CONNECTION'),
      ]
    ),
  },

  {
    id: 'mailchimp-campaigns',
    name: 'Mailchimp Campaign Manager',
    description: 'Manage Mailchimp campaigns',
    category: 'Integration',
    tags: ['mailchimp', 'email', 'marketing'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Mail',
    color: '#ec4899',
    definition: createDefinition(
      'Mailchimp Campaign Manager',
      'Fetch campaign audiences from Postgres, loop through each campaign batch, and trigger Mailchimp sends through the HTTP API.',
      [
        createNode('mailchimp-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Campaign Schedule',
          cron: '0 14 * * 1',
          timezone: 'UTC',
        }),
        createNode('mailchimp-postgres', NodeType.INTEGRATION_POSTGRES, 380, 220, {
          label: 'Load Campaign Queue',
          connectionId: '{{env.MARKETING_DB_CONNECTION}}',
          queryType: 'select',
          query: "select campaign_id, audience_segment from scheduled_campaigns where send_at <= now() and status = 'ready'",
        }),
        createNode('mailchimp-foreach', NodeType.CONTROL_FOREACH, 660, 220, {
          label: 'Iterate Campaigns',
          items: '{{input.rows}}',
        }),
        createNode('mailchimp-http', NodeType.INTEGRATION_HTTP, 940, 220, {
          label: 'Trigger Mailchimp Send',
          url: 'https://{{env.MAILCHIMP_SERVER_PREFIX}}.api.mailchimp.com/3.0/campaigns/{{item.campaign_id}}/actions/send',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{env.MAILCHIMP_API_KEY}}',
          },
        }),
      ],
      [
        createEdge('e-mailchimp-trigger-postgres', 'mailchimp-trigger', 'mailchimp-postgres'),
        createEdge('e-mailchimp-postgres-foreach', 'mailchimp-postgres', 'mailchimp-foreach'),
        createEdge('e-mailchimp-foreach-http', 'mailchimp-foreach', 'mailchimp-http'),
      ],
      [
        createEnvVar('MARKETING_DB_CONNECTION'),
        createEnvVar('MAILCHIMP_API_KEY'),
        createEnvVar('MAILCHIMP_SERVER_PREFIX'),
      ]
    ),
  },

  {
    id: 'zendesk-tickets',
    name: 'Zendesk Ticket Manager',
    description: 'Manage Zendesk support tickets',
    category: 'Integration',
    tags: ['zendesk', 'support', 'tickets'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'Headphones',
    color: '#ec4899',
    definition: createDefinition(
      'Zendesk Ticket Manager',
      'Classify inbound support tickets and route urgent issues to Zendesk assignment while escalating bug reports to Slack.',
      [
        createNode('zendesk-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Support Ticket Webhook',
          method: 'POST',
          path: '/webhooks/zendesk/tickets',
        }),
        createNode('zendesk-classify', NodeType.AI_CLASSIFICATION, 380, 220, {
          label: 'Classify Ticket Type',
          provider: 'openai',
          model: 'gpt-4o-mini',
          labels: ['urgent', 'bug'],
          prompt: 'Classify whether the incoming support request is urgent or a product bug.',
        }),
        createNode('zendesk-switch', NodeType.CONTROL_SWITCH, 660, 220, {
          label: 'Route Ticket',
          expression: 'input.label',
          cases: [
            { branchKey: 'urgent', label: 'Urgent', value: 'urgent' },
            { branchKey: 'bug', label: 'Bug', value: 'bug' },
          ],
        }),
        createNode('zendesk-http', NodeType.INTEGRATION_HTTP, 940, 60, {
          label: 'Assign in Zendesk',
          url: '{{env.ZENDESK_BASE_URL}}/api/v2/tickets/{{input.ticket.id}}.json',
          method: 'PUT',
          headers: {
            Authorization: 'Bearer {{env.ZENDESK_API_TOKEN}}',
            'Content-Type': 'application/json',
          },
        }),
        createNode('zendesk-slack', NodeType.INTEGRATION_SLACK, 940, 380, {
          label: 'Escalate to Slack',
          channel: '{{env.SLACK_SUPPORT_CHANNEL}}',
          message: 'Bug ticket received: {{input.ticket.subject}}',
        }),
      ],
      [
        createEdge('e-zendesk-webhook-classify', 'zendesk-webhook', 'zendesk-classify'),
        createEdge('e-zendesk-classify-switch', 'zendesk-classify', 'zendesk-switch'),
        createEdge('e-zendesk-switch-http', 'zendesk-switch', 'zendesk-http'),
        createEdge('e-zendesk-switch-slack', 'zendesk-switch', 'zendesk-slack'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('ZENDESK_BASE_URL'),
        createEnvVar('ZENDESK_API_TOKEN'),
        createEnvVar('SLACK_BOT_TOKEN'),
        createEnvVar('SLACK_SUPPORT_CHANNEL'),
      ]
    ),
  },

  {
    id: 'quickbooks-sync',
    name: 'QuickBooks Accounting Sync',
    description: 'Sync accounting data with QuickBooks',
    category: 'Integration',
    tags: ['quickbooks', 'accounting', 'finance'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'Calculator',
    color: '#ec4899',
    definition: createDefinition(
      'QuickBooks Accounting Sync',
      'Parse accounting events, sync the transaction into QuickBooks, and send a finance confirmation email.',
      [
        createNode('quickbooks-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Accounting Webhook',
          method: 'POST',
          path: '/webhooks/quickbooks',
        }),
        createNode('quickbooks-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse Transaction',
          operation: 'parse',
        }),
        createNode('quickbooks-sync-node', NodeType.INTEGRATION_QUICKBOOKS, 660, 220, {
          label: 'Sync QuickBooks Entry',
          operation: 'create_invoice',
          companyId: '{{env.QUICKBOOKS_COMPANY_ID}}',
        }),
        createNode('quickbooks-email', NodeType.INTEGRATION_EMAIL, 940, 220, {
          label: 'Notify Finance',
          to: '{{env.FINANCE_TEAM_EMAIL}}',
          subject: 'QuickBooks sync completed',
        }),
      ],
      [
        createEdge('e-quickbooks-webhook-json', 'quickbooks-webhook', 'quickbooks-json'),
        createEdge('e-quickbooks-json-sync', 'quickbooks-json', 'quickbooks-sync-node'),
        createEdge('e-quickbooks-sync-email', 'quickbooks-sync-node', 'quickbooks-email'),
      ],
      [
        createEnvVar('QUICKBOOKS_CLIENT_ID'),
        createEnvVar('QUICKBOOKS_CLIENT_SECRET'),
        createEnvVar('QUICKBOOKS_COMPANY_ID'),
        createEnvVar('EMAIL_API_KEY'),
        createEnvVar('FINANCE_TEAM_EMAIL'),
      ]
    ),
  },

  {
    id: 'google-calendar',
    name: 'Google Calendar Integration',
    description: 'Manage Google Calendar events',
    category: 'Integration',
    tags: ['calendar', 'google', 'scheduling'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Calendar',
    color: '#ec4899',
    definition: createDefinition(
      'Google Calendar Integration',
      'Create Google Calendar events from webhook requests and email the event details to attendees.',
      [
        createNode('calendar-webhook', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Meeting Request Webhook',
          method: 'POST',
          path: '/webhooks/calendar/events',
        }),
        createNode('calendar-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse Event Request',
          operation: 'parse',
        }),
        createNode('calendar-http', NodeType.INTEGRATION_HTTP, 660, 220, {
          label: 'Create Calendar Event',
          url: 'https://www.googleapis.com/calendar/v3/calendars/{{env.GOOGLE_CALENDAR_ID}}/events',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{env.GOOGLE_CALENDAR_ACCESS_TOKEN}}',
            'Content-Type': 'application/json',
          },
        }),
        createNode('calendar-email', NodeType.INTEGRATION_EMAIL, 940, 220, {
          label: 'Send Invite Summary',
          to: '{{input.attendees}}',
          subject: 'Calendar event created: {{input.summary}}',
        }),
      ],
      [
        createEdge('e-calendar-webhook-json', 'calendar-webhook', 'calendar-json'),
        createEdge('e-calendar-json-http', 'calendar-json', 'calendar-http'),
        createEdge('e-calendar-http-email', 'calendar-http', 'calendar-email'),
      ],
      [
        createEnvVar('GOOGLE_CALENDAR_ACCESS_TOKEN'),
        createEnvVar('GOOGLE_CALENDAR_ID'),
        createEnvVar('EMAIL_API_KEY'),
      ]
    ),
  },

  {
    id: 'zoom-meetings',
    name: 'Zoom Meeting Automation',
    description: 'Automate Zoom meeting creation',
    category: 'Integration',
    tags: ['zoom', 'meetings', 'video'],
    difficulty: 'intermediate',
    estimatedTime: '20 min',
    icon: 'Video',
    color: '#ec4899',
    definition: createDefinition(
      'Zoom Meeting Automation',
      'Create Zoom meetings from inbound scheduling requests and return the generated meeting details.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Meeting Request Webhook',
          method: 'POST',
          path: '/webhooks/zoom/meetings',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Meeting Request',
          operation: 'parse',
          schemaHint: 'Extract host email, topic, agenda, start time, and duration.',
        }),
        createNode('node-template', NodeType.UTILITY_TEMPLATE, 660, 220, {
          label: 'Build Zoom Payload',
          template:
            '{"topic":"{{input.topic}}","agenda":"{{input.agenda}}","type":2,"start_time":"{{input.startTime}}","duration":{{input.durationMinutes}},"timezone":"UTC","settings":{"join_before_host":false,"waiting_room":true}}',
          outputFormat: 'json',
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 940, 220, {
          label: 'Create Zoom Meeting',
          method: 'POST',
          url: 'https://api.zoom.us/v2/users/{{input.hostEmail}}/meetings',
          authType: 'bearer',
          token: '{{env.ZOOM_API_TOKEN}}',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1220, 220, {
          label: 'Return Meeting Link',
          statusCode: 201,
          format: 'json',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-template', 'node-json', 'node-template'),
        createEdge('e-template-http', 'node-template', 'node-http'),
        createEdge('e-http-response', 'node-http', 'node-response'),
      ],
      [createEnvVar('ZOOM_API_TOKEN')]
    ),
    requirements: ['Zoom API token'],
  },

  {
    id: 'trello-boards',
    name: 'Trello Board Automation',
    description: 'Automate Trello board management',
    category: 'Integration',
    tags: ['trello', 'kanban', 'project-management'],
    difficulty: 'beginner',
    estimatedTime: '20 min',
    icon: 'Trello',
    color: '#ec4899',
    definition: createDefinition(
      'Trello Board Automation',
      'Create a Trello board from inbound project requests and return the created board details.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Project Request Webhook',
          method: 'POST',
          path: '/webhooks/trello/boards',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Board Request',
          operation: 'parse',
          schemaHint: 'Extract board name, description, default lists, and requester metadata.',
        }),
        createNode('node-template', NodeType.UTILITY_TEMPLATE, 660, 220, {
          label: 'Build Trello Payload',
          template:
            '{"name":"{{input.boardName}}","desc":"{{input.description}}","defaultLists":{{input.defaultLists ?? true}},"idOrganization":"{{env.TRELLO_WORKSPACE_ID}}"}',
          outputFormat: 'json',
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 940, 220, {
          label: 'Create Trello Board',
          method: 'POST',
          url: 'https://api.trello.com/1/boards',
          authType: 'query',
          query: {
            key: '{{env.TRELLO_API_KEY}}',
            token: '{{env.TRELLO_TOKEN}}',
          },
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1220, 220, {
          label: 'Return Board Details',
          statusCode: 201,
          format: 'json',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-template', 'node-json', 'node-template'),
        createEdge('e-template-http', 'node-template', 'node-http'),
        createEdge('e-http-response', 'node-http', 'node-response'),
      ],
      [createEnvVar('TRELLO_API_KEY'), createEnvVar('TRELLO_TOKEN'), createEnvVar('TRELLO_WORKSPACE_ID')]
    ),
    requirements: ['Trello API key', 'Trello token', 'Trello workspace ID'],
  },

  // ============ ANALYTICS & MONITORING (10 templates) ============
  {
    id: 'website-analytics',
    name: 'Website Analytics Dashboard',
    description: 'Track website metrics and analytics',
    category: 'Analytics',
    tags: ['analytics', 'metrics', 'dashboard'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'BarChart',
    color: '#6366f1',
    definition: createDefinition(
      'Website Analytics Dashboard',
      'Pull Google Analytics metrics, aggregate KPIs, and render a dashboard snapshot for stakeholders.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Daily Dashboard Refresh',
          cron: '0 7 * * *',
          timezone: 'UTC',
        }),
        createNode('node-ga', NodeType.INTEGRATION_GOOGLE_ANALYTICS, 380, 220, {
          label: 'Fetch Analytics Metrics',
          propertyId: '{{env.GA_PROPERTY_ID}}',
          metrics: ['activeUsers', 'sessions', 'conversions', 'bounceRate'],
          dimensions: ['date', 'deviceCategory', 'channelGroup'],
          dateRange: 'yesterday',
        }),
        createNode('node-aggregate', NodeType.TRANSFORM_AGGREGATE, 660, 220, {
          label: 'Aggregate KPI Summary',
          groupBy: ['channelGroup'],
          metrics: ['sessions', 'conversions', 'activeUsers'],
          includeTotals: true,
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 940, 220, {
          label: 'Render Dashboard Chart',
          entrypoint: 'main.py',
          code: [
            'import json',
            'summary = input_data if isinstance(input_data, dict) else {"data": input_data}',
            'output = {"report": "website-analytics-dashboard", "panels": summary}',
          ].join('\n'),
        }),
        createNode('node-file', NodeType.OUTPUT_FILE, 1220, 220, {
          label: 'Export Dashboard File',
          filename: 'website-analytics-dashboard.json',
          format: 'json',
        }),
      ],
      [
        createEdge('e-trigger-ga', 'node-trigger', 'node-ga'),
        createEdge('e-ga-aggregate', 'node-ga', 'node-aggregate'),
        createEdge('e-aggregate-python', 'node-aggregate', 'node-python'),
        createEdge('e-python-file', 'node-python', 'node-file'),
      ],
      [createEnvVar('GA_PROPERTY_ID'), createEnvVar('GOOGLE_ANALYTICS_CREDENTIALS')]
    ),
    requirements: ['Google Analytics property ID', 'Google Analytics credentials'],
  },

  {
    id: 'error-tracking',
    name: 'Error Tracking System',
    description: 'Track and report application errors',
    category: 'Analytics',
    tags: ['errors', 'monitoring', 'logging'],
    difficulty: 'intermediate',
    estimatedTime: '25 min',
    icon: 'AlertCircle',
    color: '#6366f1',
    definition: createDefinition(
      'Error Tracking System',
      'Classify inbound errors by severity and route them to the right escalation channel.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Application Error Webhook',
          method: 'POST',
          path: '/webhooks/errors',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Parse Error Payload',
          operation: 'parse',
          schemaHint: 'Normalize service, stack trace, user impact, and request context.',
        }),
        createNode('node-classify', NodeType.AI_CLASSIFICATION, 660, 220, {
          label: 'Classify Severity',
          provider: 'openai',
          model: 'gpt-4o-mini',
          classes: ['critical', 'high', 'medium', 'low'],
          prompt: 'Classify the incident severity based on customer impact, service degradation, and error frequency.',
        }),
        createNode('node-switch', NodeType.CONTROL_SWITCH, 940, 220, {
          label: 'Route By Severity',
          expression: 'input.label',
          cases: ['critical', 'high', 'medium'],
          defaultCase: 'low',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1220, 60, {
          label: 'Alert Engineering',
          channel: '{{env.SLACK_ALERT_CHANNEL}}',
          severity: 'high',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 1220, 220, {
          label: 'Email On-Call',
          to: '{{env.ONCALL_EMAIL}}',
          subject: 'Critical production incident detected',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1220, 380, {
          label: 'Log Lower Severity',
          level: 'warn',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-classify', 'node-json', 'node-classify'),
        createEdge('e-classify-switch', 'node-classify', 'node-switch'),
        createEdge('e-switch-slack', 'node-switch', 'node-slack'),
        createEdge('e-switch-email', 'node-switch', 'node-email'),
        createEdge('e-switch-log', 'node-switch', 'node-log'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('SLACK_BOT_TOKEN'), createEnvVar('SLACK_ALERT_CHANNEL'), createEnvVar('EMAIL_API_KEY'), createEnvVar('ONCALL_EMAIL')]
    ),
    requirements: ['OpenAI API key', 'Slack bot token', 'Email provider credentials'],
  },

  {
    id: 'performance-monitor',
    name: 'Performance Monitor',
    description: 'Monitor application performance',
    category: 'Analytics',
    tags: ['performance', 'monitoring', 'apm'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'Activity',
    color: '#6366f1',
    definition: createDefinition(
      'Performance Monitor',
      'Run parallel latency and infrastructure checks, then alert when performance drifts beyond thresholds.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Performance Check Schedule',
          cron: '*/10 * * * *',
          timezone: 'UTC',
        }),
        createNode('node-parallel', NodeType.CONTROL_PARALLEL, 380, 220, {
          label: 'Run Parallel Checks',
          branches: ['api-latency', 'host-metrics'],
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 660, 60, {
          label: 'Measure API Latency',
          method: 'GET',
          url: '{{env.PERFORMANCE_API_URL}}',
          timeout: 8000,
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 660, 380, {
          label: 'Collect CPU & Memory',
          entrypoint: 'main.py',
          code: ['output = {"cpuPct": 68, "memoryPct": 74, "host": "app-server-1"}'].join('\n'),
        }),
        createNode('node-aggregate', NodeType.TRANSFORM_AGGREGATE, 940, 220, {
          label: 'Combine Performance Signals',
          metrics: ['latencyMs', 'cpuPct', 'memoryPct'],
          includeTotals: true,
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1220, 220, {
          label: 'Check Thresholds',
          condition: 'input.latencyMs > 1200 || input.cpuPct > 85 || input.memoryPct > 90',
          evaluationType: 'expression',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1500, 60, {
          label: 'Send Performance Alert',
          channel: 'ops',
          severity: 'medium',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1500, 380, {
          label: 'Record Healthy Snapshot',
          level: 'info',
        }),
      ],
      [
        createEdge('e-trigger-parallel', 'node-trigger', 'node-parallel'),
        createEdge('e-parallel-http', 'node-parallel', 'node-http'),
        createEdge('e-parallel-python', 'node-parallel', 'node-python'),
        createEdge('e-http-aggregate', 'node-http', 'node-aggregate'),
        createEdge('e-python-aggregate', 'node-python', 'node-aggregate'),
        createEdge('e-aggregate-condition', 'node-aggregate', 'node-condition'),
        createEdge('e-condition-notification', 'node-condition', 'node-notification'),
        createEdge('e-condition-log', 'node-condition', 'node-log'),
      ],
      [createEnvVar('PERFORMANCE_API_URL')]
    ),
  },

  {
    id: 'uptime-monitor',
    name: 'Uptime Monitor',
    description: 'Monitor website uptime and availability',
    category: 'Analytics',
    tags: ['uptime', 'monitoring', 'availability'],
    difficulty: 'beginner',
    estimatedTime: '15 min',
    icon: 'Globe',
    color: '#6366f1',
    definition: createDefinition(
      'Uptime Monitor',
      'Check a list of endpoints on a schedule and notify the team when any endpoint goes down.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Five Minute Schedule',
          cron: '*/5 * * * *',
          timezone: 'UTC',
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 380, 220, {
          label: 'Loop Through Endpoints',
          items: ['https://app.example.com/health', 'https://api.example.com/health', 'https://status.example.com/ping'],
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 660, 220, {
          label: 'Ping Endpoint',
          method: 'GET',
          timeout: 5000,
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 940, 220, {
          label: 'Is Endpoint Down?',
          condition: 'input.status >= 400 || input.error != null',
          evaluationType: 'expression',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1220, 60, {
          label: 'Alert Slack',
          channel: '{{env.UPTIME_ALERT_CHANNEL}}',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1220, 380, {
          label: 'Log Healthy Endpoint',
          level: 'info',
        }),
      ],
      [
        createEdge('e-trigger-foreach', 'node-trigger', 'node-foreach'),
        createEdge('e-foreach-http', 'node-foreach', 'node-http'),
        createEdge('e-http-condition', 'node-http', 'node-condition'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-log', 'node-condition', 'node-log'),
      ],
      [createEnvVar('SLACK_BOT_TOKEN'), createEnvVar('UPTIME_ALERT_CHANNEL')]
    ),
    requirements: ['Slack bot token'],
  },

  {
    id: 'log-aggregator',
    name: 'Log Aggregation System',
    description: 'Aggregate logs from multiple sources',
    category: 'Analytics',
    tags: ['logs', 'aggregation', 'monitoring'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'FileText',
    color: '#6366f1',
    definition: createDefinition(
      'Log Aggregation System',
      'Normalize inbound logs, index them in Elasticsearch, and generate a concise summary for operators.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Log Ingestion Webhook',
          method: 'POST',
          path: '/webhooks/logs',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Log Payload',
          operation: 'parse',
          schemaHint: 'Flatten timestamp, service, level, correlationId, and message fields.',
        }),
        createNode('node-elastic', NodeType.INTEGRATION_ELASTICSEARCH, 660, 220, {
          label: 'Index in Elasticsearch',
          index: 'application-logs',
          operation: 'index',
          endpoint: '{{env.ELASTICSEARCH_URL}}',
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 940, 220, {
          label: 'Summarize Error Trends',
          provider: 'openai',
          model: 'gpt-4o-mini',
          maxTokens: 180,
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 1220, 220, {
          label: 'Write Ops Summary',
          level: 'info',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-elastic', 'node-json', 'node-elastic'),
        createEdge('e-elastic-summary', 'node-elastic', 'node-summary'),
        createEdge('e-summary-log', 'node-summary', 'node-log'),
      ],
      [createEnvVar('ELASTICSEARCH_URL'), createEnvVar('ELASTICSEARCH_API_KEY'), createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['Elasticsearch credentials', 'OpenAI API key'],
  },

  {
    id: 'user-behavior-tracker',
    name: 'User Behavior Tracking',
    description: 'Track user behavior and interactions',
    category: 'Analytics',
    tags: ['tracking', 'users', 'behavior'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'MousePointer',
    color: '#6366f1',
    definition: createDefinition(
      'User Behavior Tracking',
      'Normalize product events and fan them out to analytics tools for downstream reporting.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Behavior Event Webhook',
          method: 'POST',
          path: '/webhooks/product-events',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Event Schema',
          operation: 'parse',
          schemaHint: 'Map anonymousId, userId, event, properties, and context fields.',
        }),
        createNode('node-posthog', NodeType.INTEGRATION_POSTHOG, 660, 60, {
          label: 'Track in PostHog',
          eventName: '{{input.event}}',
        }),
        createNode('node-segment', NodeType.INTEGRATION_SEGMENT, 660, 380, {
          label: 'Forward to Segment',
          operation: 'track',
        }),
        createNode('node-log', NodeType.OUTPUT_LOG, 940, 220, {
          label: 'Log Analytics Dispatch',
          level: 'info',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-posthog', 'node-json', 'node-posthog'),
        createEdge('e-json-segment', 'node-json', 'node-segment'),
        createEdge('e-posthog-log', 'node-posthog', 'node-log'),
        createEdge('e-segment-log', 'node-segment', 'node-log'),
      ],
      [createEnvVar('POSTHOG_API_KEY'), createEnvVar('SEGMENT_WRITE_KEY')]
    ),
    requirements: ['PostHog API key', 'Segment write key'],
  },

  {
    id: 'conversion-funnel',
    name: 'Conversion Funnel Analysis',
    description: 'Analyze conversion funnels',
    category: 'Analytics',
    tags: ['conversion', 'funnel', 'analytics'],
    difficulty: 'advanced',
    estimatedTime: '35 min',
    icon: 'TrendingUp',
    color: '#6366f1',
    definition: createDefinition(
      'Conversion Funnel Analysis',
      'Query funnel data from Postgres, calculate stage conversions, and publish summary metrics to Amplitude.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Daily Funnel Refresh',
          cron: '30 6 * * *',
          timezone: 'UTC',
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 380, 220, {
          label: 'Query Funnel Events',
          connectionId: '{{env.ANALYTICS_DB_CONNECTION}}',
          queryType: 'select',
          query: "select stage_name, user_count, completed_at from funnel_stage_daily where completed_at >= current_date - interval '7 days'", 
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 660, 220, {
          label: 'Calculate Funnel Rates',
          entrypoint: 'main.py',
          code: [
            'rows = input_data.get("rows", input_data if isinstance(input_data, list) else [])',
            'output = {"stages": rows, "conversionRate": 0.42, "dropOffStage": "checkout"}',
          ].join('\n'),
        }),
        createNode('node-amplitude', NodeType.INTEGRATION_AMPLITUDE, 940, 220, {
          label: 'Publish Funnel Metrics',
          eventType: 'conversion_funnel_snapshot',
        }),
        createNode('node-json-output', NodeType.OUTPUT_JSON, 1220, 220, {
          label: 'Return Funnel Snapshot',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-postgres', 'node-trigger', 'node-postgres'),
        createEdge('e-postgres-python', 'node-postgres', 'node-python'),
        createEdge('e-python-amplitude', 'node-python', 'node-amplitude'),
        createEdge('e-amplitude-output', 'node-amplitude', 'node-json-output'),
      ],
      [createEnvVar('ANALYTICS_DB_CONNECTION'), createEnvVar('AMPLITUDE_API_KEY')]
    ),
    requirements: ['Analytics database connection', 'Amplitude API key'],
  },

  {
    id: 'ab-testing',
    name: 'A/B Testing Framework',
    description: 'Run A/B tests on features',
    category: 'Analytics',
    tags: ['ab-testing', 'experiments', 'optimization'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'Split',
    color: '#6366f1',
    definition: createDefinition(
      'A/B Testing Framework',
      'Evaluate inbound experiment requests, assign a variant for eligible users, and record the assignment in Mixpanel.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 100, 220, {
          label: 'Experiment Assignment Webhook',
          method: 'POST',
          path: '/webhooks/experiments/assign',
        }),
        createNode('node-json', NodeType.TRANSFORM_JSON, 380, 220, {
          label: 'Normalize Experiment Context',
          operation: 'parse',
          schemaHint: 'Extract userId, experimentKey, country, device, and eligibility attributes.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 660, 220, {
          label: 'Check Eligibility',
          condition: 'input.isEligible === true',
          evaluationType: 'expression',
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 940, 60, {
          label: 'Assign Variant',
          entrypoint: 'main.py',
          code: [
            'user_id = str(input_data.get("userId", "anonymous"))',
            'variant = "A" if sum(ord(c) for c in user_id) % 2 == 0 else "B"',
            'output = {"variant": variant, "experimentKey": input_data.get("experimentKey")}',
          ].join('\n'),
        }),
        createNode('node-mixpanel', NodeType.INTEGRATION_MIXPANEL, 1220, 60, {
          label: 'Track Assignment',
          eventName: 'experiment_variant_assigned',
        }),
        createNode('node-response', NodeType.OUTPUT_RESPONSE, 1500, 220, {
          label: 'Return Variant Response',
          statusCode: 200,
          format: 'json',
        }),
      ],
      [
        createEdge('e-trigger-json', 'node-trigger', 'node-json'),
        createEdge('e-json-condition', 'node-json', 'node-condition'),
        createEdge('e-condition-python', 'node-condition', 'node-python'),
        createEdge('e-python-mixpanel', 'node-python', 'node-mixpanel'),
        createEdge('e-mixpanel-response', 'node-mixpanel', 'node-response'),
        createEdge('e-condition-response', 'node-condition', 'node-response'),
      ],
      [createEnvVar('MIXPANEL_PROJECT_TOKEN')]
    ),
    requirements: ['Mixpanel project token'],
  },

  {
    id: 'seo-monitor',
    name: 'SEO Performance Monitor',
    description: 'Track SEO metrics and rankings',
    category: 'Analytics',
    tags: ['seo', 'rankings', 'search'],
    difficulty: 'intermediate',
    estimatedTime: '30 min',
    icon: 'Search',
    color: '#6366f1',
    definition: createDefinition(
      'SEO Performance Monitor',
      'Scrape a target page, analyze SEO health with an LLM, and push the findings into Google Analytics and notifications.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Weekly SEO Audit',
          cron: '0 8 * * 1',
          timezone: 'UTC',
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 380, 220, {
          label: 'Scrape Target Page',
          url: '{{env.SEO_TARGET_URL}}',
          javascript: true,
          extractionRules: {
            title: 'title',
            description: 'meta[name="description"]',
            headings: 'h1, h2',
            canonical: 'link[rel="canonical"]',
          },
        }),
        createNode('node-llm', NodeType.AI_LLM, 660, 220, {
          label: 'Analyze SEO Health',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          prompt: 'Review the scraped page metadata and content structure, then summarize SEO issues and opportunities.',
        }),
        createNode('node-ga', NodeType.INTEGRATION_GOOGLE_ANALYTICS, 940, 220, {
          label: 'Record SEO Snapshot',
          propertyId: '{{env.GA_PROPERTY_ID}}',
          eventName: 'seo_monitor_snapshot',
        }),
        createNode('node-notification', NodeType.OUTPUT_NOTIFICATION, 1220, 220, {
          label: 'Notify Marketing Team',
          channel: 'marketing',
          severity: 'low',
        }),
      ],
      [
        createEdge('e-trigger-scrape', 'node-trigger', 'node-scrape'),
        createEdge('e-scrape-llm', 'node-scrape', 'node-llm'),
        createEdge('e-llm-ga', 'node-llm', 'node-ga'),
        createEdge('e-ga-notification', 'node-ga', 'node-notification'),
      ],
      [createEnvVar('SEO_TARGET_URL'), createEnvVar('OPENAI_API_KEY'), createEnvVar('GA_PROPERTY_ID'), createEnvVar('GOOGLE_ANALYTICS_CREDENTIALS')]
    ),
    requirements: ['Target URL', 'OpenAI API key', 'Google Analytics credentials'],
  },

  {
    id: 'custom-metrics',
    name: 'Custom Metrics Dashboard',
    description: 'Build custom metrics dashboards',
    category: 'Analytics',
    tags: ['metrics', 'dashboard', 'custom'],
    difficulty: 'advanced',
    estimatedTime: '40 min',
    icon: 'PieChart',
    color: '#6366f1',
    definition: createDefinition(
      'Custom Metrics Dashboard',
      'Collect calculated service metrics and database KPIs in parallel, merge them, and expose a dashboard payload.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 100, 220, {
          label: 'Hourly Metrics Refresh',
          cron: '0 * * * *',
          timezone: 'UTC',
        }),
        createNode('node-parallel', NodeType.CONTROL_PARALLEL, 380, 220, {
          label: 'Run Metric Sources',
          branches: ['computed-metrics', 'database-kpis'],
        }),
        createNode('node-python', NodeType.SANDFLARE_PYTHON, 660, 60, {
          label: 'Calculate Service Metrics',
          entrypoint: 'main.py',
          code: ['output = {"errorRate": 0.012, "p95Latency": 420, "queueDepth": 7}'].join('\n'),
        }),
        createNode('node-postgres', NodeType.INTEGRATION_POSTGRES, 660, 380, {
          label: 'Query Business KPIs',
          connectionId: '{{env.METRICS_DB_CONNECTION}}',
          queryType: 'select',
          query: 'select active_users, mrr, trial_conversions from dashboard_kpis limit 1',
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 940, 220, {
          label: 'Merge Dashboard Metrics',
          strategy: 'deep',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1220, 220, {
          label: 'Emit Dashboard JSON',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-parallel', 'node-trigger', 'node-parallel'),
        createEdge('e-parallel-python', 'node-parallel', 'node-python'),
        createEdge('e-parallel-postgres', 'node-parallel', 'node-postgres'),
        createEdge('e-python-merge', 'node-python', 'node-merge'),
        createEdge('e-postgres-merge', 'node-postgres', 'node-merge'),
        createEdge('e-merge-output', 'node-merge', 'node-output'),
      ],
      [createEnvVar('METRICS_DB_CONNECTION')]
    ),
    requirements: ['Metrics database connection'],
  },
  {
    id: 'competitor-intelligence-agent',
    name: 'Competitor Intelligence Agent',
    description: 'Monitor competitor sites weekly, compare what changed, and alert the team when notable market shifts appear.',
    category: 'agent',
    tags: ['competitive-intel', 'scraping', 'monitoring', 'email'],
    difficulty: 'advanced',
    estimatedTime: '25 min setup',
    icon: 'Radar',
    color: '#7c3aed',
    featured: true,
    definition: createDefinition(
      'Competitor Intelligence Agent',
      'Scrape competitor pages on a weekly cadence, summarize changes, store findings, and notify stakeholders when major shifts occur.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 80, 220, {
          label: 'Weekly Schedule',
          cron: '0 8 * * 1',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-urls', NodeType.TRANSFORM_SPLIT, 330, 220, {
          label: 'Split Competitor URLs',
          description: 'Expand the tracked competitor list into one item per URL.',
          sourceField: 'competitors',
          items: [
            'https://competitor-a.example/pricing',
            'https://competitor-b.example/product-updates',
            'https://competitor-c.example/blog',
          ],
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 580, 220, {
          label: 'Iterate Competitors',
          itemVariable: 'competitorUrl',
        }),
        createNode('node-scrape', NodeType.SANDFLARE_SCRAPE, 830, 220, {
          label: 'Scrape Competitor Page',
          url: '{{item.competitorUrl}}',
          javascript: true,
          waitFor: 'networkidle',
          timeout: 45000,
          fallbackToMock: true,
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 1080, 220, {
          label: 'Summarize Page',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          prompt: 'Summarize this competitor page with a focus on launches, pricing, positioning, integrations, and messaging changes.',
        }),
        createNode('node-extract', NodeType.TRANSFORM_DATA, 1330, 220, {
          label: 'Extract Key Signals',
          description: 'Capture product updates, pricing changes, customer segments, and evidence links.',
          outputShape: '{ competitor, highlights, pricingChanges, launches, targetSegments, evidence }',
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 1580, 220, {
          label: 'Merge Findings',
          strategy: 'append-array',
        }),
        createNode('node-compare', NodeType.AI_LLM, 1830, 220, {
          label: 'Compare Results',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          outputFormat: 'json',
          prompt: 'Compare all competitor findings against the previous run. Return JSON with strategic shifts, severity, opportunities, and a boolean significantChanges.',
          systemPrompt: 'You are a market intelligence analyst producing concise but actionable competitor reports.',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 2080, 220, {
          label: 'Store Findings',
          key: 'competitor-intelligence/latest',
          value: '{{input}}',
          metadata: {
            cadence: 'weekly',
            source: 'competitor-monitoring',
          },
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 2330, 220, {
          label: 'Significant Changes?',
          expression: 'input.significantChanges === true',
          evaluationType: 'javascript',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 2580, 80, {
          label: 'Notify Strategy Team',
          to: '{{env.COMPETITOR_ALERT_RECIPIENTS}}',
          subject: 'Weekly Competitor Intelligence Alert',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2830, 220, {
          label: 'Output Findings',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-urls', 'node-trigger', 'node-urls'),
        createEdge('e-urls-foreach', 'node-urls', 'node-foreach'),
        createEdge('e-foreach-scrape', 'node-foreach', 'node-scrape'),
        createEdge('e-scrape-summary', 'node-scrape', 'node-summary'),
        createEdge('e-summary-extract', 'node-summary', 'node-extract'),
        createEdge('e-extract-merge', 'node-extract', 'node-merge'),
        createEdge('e-merge-compare', 'node-merge', 'node-compare'),
        createEdge('e-compare-memory', 'node-compare', 'node-memory'),
        createEdge('e-memory-condition', 'node-memory', 'node-condition'),
        createEdge('e-condition-email', 'node-condition', 'node-email'),
        createEdge('e-condition-output', 'node-condition', 'node-output'),
        createEdge('e-email-output', 'node-email', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('COMPETITOR_ALERT_RECIPIENTS')]
    ),
    requirements: ['OpenAI API key', 'Email delivery provider'],
  },
  {
    id: 'document-intelligence-pipeline',
    name: 'Document Intelligence Pipeline',
    description: 'Download inbound documents, extract structured data, route by document type, and emit normalized JSON for downstream systems.',
    category: 'ai',
    tags: ['documents', 'classification', 'extraction', 'webhook'],
    difficulty: 'advanced',
    estimatedTime: '30 min setup',
    icon: 'FileSearch',
    color: '#8b5cf6',
    featured: true,
    definition: createDefinition(
      'Document Intelligence Pipeline',
      'Extract text, parameters, and business fields from uploaded documents and branch processing by document class.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'Document Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-download', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Download Document',
          url: '{{input.documentUrl}}',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{env.DOCUMENT_SOURCE_TOKEN}}',
          },
        }),
        createNode('node-extract-text', NodeType.AI_LLM, 580, 220, {
          label: 'Extract Clean Text',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0,
          prompt: 'Extract all readable text from the downloaded document, preserve section headers, and remove scanner noise.',
          systemPrompt: 'You convert raw business documents into clean machine-readable text.',
        }),
        createNode('node-parameters', NodeType.AI_LLM, 830, 220, {
          label: 'Extract Parameters',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Return JSON with documentId, parties, dates, totals, obligations, confidence, and key metadata.',
        }),
        createNode('node-classify', NodeType.AI_CLASSIFICATION, 1080, 220, {
          label: 'Classify Document Type',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Classify the document as invoice, contract, or report. Return the winning class and confidence.',
        }),
        createNode('node-switch', NodeType.CONTROL_SWITCH, 1330, 220, {
          label: 'Route by Type',
          expression: 'input.type',
          cases: [
            { branchKey: 'invoice', label: 'Invoice', value: 'invoice' },
            { branchKey: 'contract', label: 'Contract', value: 'contract' },
            { branchKey: 'report', label: 'Report', value: 'report' },
          ],
        }),
        createNode('node-invoice', NodeType.AI_LLM, 1580, 60, {
          label: 'Extract Invoice Fields',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0,
          outputFormat: 'json',
          prompt: 'Extract invoiceNumber, vendor, lineItems, tax, subtotal, total, currency, dueDate, and paymentTerms as JSON.',
        }),
        createNode('node-contract', NodeType.AI_LLM, 1580, 220, {
          label: 'Extract Contract Clauses',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Extract renewal terms, termination clauses, liabilities, SLAs, pricing commitments, and named obligations as JSON.',
        }),
        createNode('node-report', NodeType.AI_SUMMARIZATION, 1580, 380, {
          label: 'Summarize Report',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Summarize the report, key findings, KPIs, risks, and action items in structured bullet form.',
        }),
        createNode('node-normalize', NodeType.TRANSFORM_MERGE, 1830, 220, {
          label: 'Normalize Output',
          strategy: 'deep',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2080, 220, {
          label: 'Emit Document JSON',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-download', 'node-trigger', 'node-download'),
        createEdge('e-download-extract', 'node-download', 'node-extract-text'),
        createEdge('e-extract-parameters', 'node-extract-text', 'node-parameters'),
        createEdge('e-parameters-classify', 'node-parameters', 'node-classify'),
        createEdge('e-classify-switch', 'node-classify', 'node-switch'),
        createEdge('e-switch-invoice', 'node-switch', 'node-invoice'),
        createEdge('e-switch-contract', 'node-switch', 'node-contract'),
        createEdge('e-switch-report', 'node-switch', 'node-report'),
        createEdge('e-invoice-normalize', 'node-invoice', 'node-normalize'),
        createEdge('e-contract-normalize', 'node-contract', 'node-normalize'),
        createEdge('e-report-normalize', 'node-report', 'node-normalize'),
        createEdge('e-normalize-output', 'node-normalize', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('DOCUMENT_SOURCE_TOKEN')]
    ),
    requirements: ['OpenAI API key', 'Document source token'],
  },
  {
    id: 'multi-stage-content-factory',
    name: 'Multi-Stage Content Factory',
    description: 'Turn a topic brief into a full long-form article with polished sections, SEO improvements, and ready-to-post social content.',
    category: 'ai',
    tags: ['content', 'seo', 'iteration', 'social'],
    difficulty: 'advanced',
    estimatedTime: '28 min setup',
    icon: 'PenSquare',
    color: '#a855f7',
    featured: true,
    definition: createDefinition(
      'Multi-Stage Content Factory',
      'Generate an outline, iterate section drafts, assemble the article, optimize it, and produce social assets.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Content Brief',
          inputSchema: {
            topic: 'string',
            audience: 'string',
            keywords: 'string[]',
            tone: 'string',
          },
        }),
        createNode('node-outline', NodeType.AI_LLM, 330, 220, {
          label: 'Generate Outline',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.5,
          outputFormat: 'json',
          prompt: 'Create a compelling article outline with title options, intro angle, 5-7 sections, examples, and CTA ideas.',
          systemPrompt: 'You are a senior content strategist building editorial outlines for enterprise audiences.',
        }),
        createNode('node-split', NodeType.TRANSFORM_SPLIT, 580, 220, {
          label: 'Split Sections',
          description: 'Break the outline into section-level work items.',
          sourceField: 'sections',
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 830, 220, {
          label: 'Iterate Sections',
          itemVariable: 'section',
        }),
        createNode('node-write-section', NodeType.AI_LLM, 1080, 220, {
          label: 'Write Section',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.7,
          prompt: 'Write this article section with examples, smooth transitions, and credible enterprise detail.',
        }),
        createNode('node-improve-section', NodeType.AI_LLM, 1330, 220, {
          label: 'Improve Section',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.4,
          prompt: 'Improve clarity, tighten phrasing, remove repetition, and ensure each section advances the argument.',
        }),
        createNode('node-assemble', NodeType.TRANSFORM_MERGE, 1580, 220, {
          label: 'Assemble Draft',
          strategy: 'append-array',
        }),
        createNode('node-combine', NodeType.AI_LLM, 1830, 220, {
          label: 'Combine All Sections',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.4,
          prompt: 'Combine the improved sections into one cohesive article with intro, conclusion, and smooth section transitions.',
        }),
        createNode('node-seo', NodeType.AI_LLM, 2080, 220, {
          label: 'SEO Optimize',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.3,
          outputFormat: 'json',
          prompt: 'Optimize the article for SEO. Return JSON with optimized article, meta title, meta description, slug, and internal link suggestions.',
        }),
        createNode('node-social', NodeType.AI_LLM, 2330, 220, {
          label: 'Generate Social Posts',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.6,
          outputFormat: 'json',
          prompt: 'Create LinkedIn, X/Twitter, and newsletter promo posts for the article. Include hooks and CTA variants.',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2580, 220, {
          label: 'Output Article Package',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-outline', 'node-trigger', 'node-outline'),
        createEdge('e-outline-split', 'node-outline', 'node-split'),
        createEdge('e-split-foreach', 'node-split', 'node-foreach'),
        createEdge('e-foreach-write', 'node-foreach', 'node-write-section'),
        createEdge('e-write-improve', 'node-write-section', 'node-improve-section'),
        createEdge('e-improve-assemble', 'node-improve-section', 'node-assemble'),
        createEdge('e-assemble-combine', 'node-assemble', 'node-combine'),
        createEdge('e-combine-seo', 'node-combine', 'node-seo'),
        createEdge('e-seo-social', 'node-seo', 'node-social'),
        createEdge('e-social-output', 'node-social', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'customer-360-pipeline',
    name: 'Customer 360 Pipeline',
    description: 'Merge CRM, billing, and support context into a single health assessment and trigger the right retention workflow.',
    category: 'automation',
    tags: ['customer-success', 'crm', 'churn', 'slack'],
    difficulty: 'advanced',
    estimatedTime: '26 min setup',
    icon: 'Users',
    color: '#2563eb',
    definition: createDefinition(
      'Customer 360 Pipeline',
      'Enrich customer events with multi-source context, assess churn risk, and route the account to urgent or routine follow-up.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'Customer Event Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-parallel', NodeType.CONTROL_PARALLEL, 330, 220, {
          label: 'Fetch Customer Sources',
          branches: ['crm', 'purchases', 'support'],
        }),
        createNode('node-crm', NodeType.INTEGRATION_HTTP, 580, 60, {
          label: 'Fetch CRM Data',
          url: '{{env.CRM_API_URL}}/customers/{{input.customerId}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.CRM_API_TOKEN}}' },
        }),
        createNode('node-purchases', NodeType.INTEGRATION_HTTP, 580, 220, {
          label: 'Fetch Purchase History',
          url: '{{env.BILLING_API_URL}}/customers/{{input.customerId}}/orders',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.BILLING_API_TOKEN}}' },
        }),
        createNode('node-support', NodeType.INTEGRATION_HTTP, 580, 380, {
          label: 'Fetch Support Tickets',
          url: '{{env.SUPPORT_API_URL}}/tickets?customerId={{input.customerId}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.SUPPORT_API_TOKEN}}' },
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 830, 220, {
          label: 'Merge Customer Data',
          strategy: 'deep',
        }),
        createNode('node-health', NodeType.AI_LLM, 1080, 220, {
          label: 'Analyze Customer Health',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Assess customer health, churn risk, renewal risk, upsell potential, and the next best action. Return JSON including churnRisk and rationale.',
          systemPrompt: 'You are a customer success strategist for enterprise SaaS accounts.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1330, 220, {
          label: 'High Churn Risk?',
          expression: "['high', 'critical'].includes(input.churnRisk)",
          evaluationType: 'javascript',
        }),
        createNode('node-jira', NodeType.INTEGRATION_JIRA, 1580, 60, {
          label: 'Create Urgent Ticket',
          projectKey: 'CS',
          issueType: 'Task',
          priority: 'Highest',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1580, 220, {
          label: 'Alert Retention Team',
          channel: '{{env.SLACK_SUCCESS_CHANNEL}}',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 1580, 380, {
          label: 'Write Customer Snapshot',
          key: 'customer-360/{{input.customerId}}',
          value: '{{input}}',
          metadata: { workflow: 'customer-360' },
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1830, 220, {
          label: 'Emit Customer 360 Record',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-parallel', 'node-trigger', 'node-parallel'),
        createEdge('e-parallel-crm', 'node-parallel', 'node-crm'),
        createEdge('e-parallel-purchases', 'node-parallel', 'node-purchases'),
        createEdge('e-parallel-support', 'node-parallel', 'node-support'),
        createEdge('e-crm-merge', 'node-crm', 'node-merge'),
        createEdge('e-purchases-merge', 'node-purchases', 'node-merge'),
        createEdge('e-support-merge', 'node-support', 'node-merge'),
        createEdge('e-merge-health', 'node-merge', 'node-health'),
        createEdge('e-health-condition', 'node-health', 'node-condition'),
        createEdge('e-condition-jira', 'node-condition', 'node-jira'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-memory', 'node-condition', 'node-memory'),
        createEdge('e-jira-output', 'node-jira', 'node-output'),
        createEdge('e-slack-output', 'node-slack', 'node-output'),
        createEdge('e-memory-output', 'node-memory', 'node-output'),
      ],
      [
        createEnvVar('CRM_API_URL'),
        createEnvVar('CRM_API_TOKEN'),
        createEnvVar('BILLING_API_URL'),
        createEnvVar('BILLING_API_TOKEN'),
        createEnvVar('SUPPORT_API_URL'),
        createEnvVar('SUPPORT_API_TOKEN'),
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('SLACK_SUCCESS_CHANNEL'),
      ]
    ),
    requirements: ['CRM, billing, and support API access', 'OpenAI API key', 'Slack bot token'],
  },
  {
    id: 'autonomous-research-agent',
    name: 'Autonomous Research Agent',
    description: 'Plan a research strategy, inspect multiple sources in parallel, identify gaps, and deliver a source-backed final report.',
    category: 'agent',
    tags: ['research', 'scraping', 'analysis', 'memory'],
    difficulty: 'advanced',
    estimatedTime: '30 min setup',
    icon: 'SearchCheck',
    color: '#4f46e5',
    featured: true,
    definition: createDefinition(
      'Autonomous Research Agent',
      'Generate search angles, collect evidence from multiple sources, iterate when gaps remain, and produce a durable research memo.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Research Topic',
          inputSchema: {
            topic: 'string',
            depth: 'string',
            outputFormat: 'string',
          },
        }),
        createNode('node-queries', NodeType.AI_LLM, 330, 220, {
          label: 'Generate Search Queries',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.5,
          outputFormat: 'json',
          prompt: 'Generate 3-5 high-quality research queries, source types to inspect, and evaluation criteria for this topic.',
          systemPrompt: 'You are a principal analyst planning multi-source research.',
        }),
        createNode('node-parallel', NodeType.CONTROL_PARALLEL, 580, 220, {
          label: 'Search Sources in Parallel',
          branches: ['source-1', 'source-2', 'source-3'],
        }),
        createNode('node-source-1', NodeType.SANDFLARE_SCRAPE, 830, 60, {
          label: 'Scrape Source 1',
          url: '{{input.queries[0].url || env.RESEARCH_SOURCE_1}}',
          javascript: true,
          waitFor: 'networkidle',
          timeout: 45000,
        }),
        createNode('node-source-2', NodeType.SANDFLARE_SCRAPE, 830, 220, {
          label: 'Scrape Source 2',
          url: '{{input.queries[1].url || env.RESEARCH_SOURCE_2}}',
          javascript: true,
          waitFor: 'networkidle',
          timeout: 45000,
        }),
        createNode('node-source-3', NodeType.SANDFLARE_SCRAPE, 830, 380, {
          label: 'Scrape Source 3',
          url: '{{input.queries[2].url || env.RESEARCH_SOURCE_3}}',
          javascript: true,
          waitFor: 'networkidle',
          timeout: 45000,
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 1080, 220, {
          label: 'Merge Source Notes',
          strategy: 'append-array',
        }),
        createNode('node-synthesize', NodeType.AI_LLM, 1330, 220, {
          label: 'Synthesize Findings',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          outputFormat: 'json',
          prompt: 'Synthesize the research into themes, evidence, consensus, disagreements, and confidence scores.',
        }),
        createNode('node-gaps', NodeType.AI_LLM, 1580, 220, {
          label: 'Identify Gaps',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Identify unanswered questions, evidence gaps, and whether another research pass is needed. Return gapsFound as a boolean.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1830, 220, {
          label: 'Gaps Found?',
          expression: 'input.gapsFound === true',
          evaluationType: 'javascript',
        }),
        createNode('node-loop', NodeType.AGENT_LOOP, 2080, 80, {
          label: 'Iterative Follow-up Search',
          maxIterations: 2,
          exitConditionType: 'expression',
          conditionExpression: 'input.gapsFound === false',
          aggregateResults: true,
        }),
        createNode('node-report', NodeType.AI_LLM, 2080, 220, {
          label: 'Write Final Report',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          prompt: 'Write a final research report with executive summary, findings, risks, citations, and recommended next steps.',
          systemPrompt: 'You write executive-ready research briefs with traceable evidence.',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 2330, 220, {
          label: 'Store Research',
          key: 'research/{{input.topic}}',
          value: '{{input}}',
          metadata: { type: 'research-report' },
        }),
        createNode('node-output', NodeType.OUTPUT_RESPONSE, 2580, 220, {
          label: 'Return Final Report',
        }),
      ],
      [
        createEdge('e-trigger-queries', 'node-trigger', 'node-queries'),
        createEdge('e-queries-parallel', 'node-queries', 'node-parallel'),
        createEdge('e-parallel-source-1', 'node-parallel', 'node-source-1'),
        createEdge('e-parallel-source-2', 'node-parallel', 'node-source-2'),
        createEdge('e-parallel-source-3', 'node-parallel', 'node-source-3'),
        createEdge('e-source-1-merge', 'node-source-1', 'node-merge'),
        createEdge('e-source-2-merge', 'node-source-2', 'node-merge'),
        createEdge('e-source-3-merge', 'node-source-3', 'node-merge'),
        createEdge('e-merge-synthesize', 'node-merge', 'node-synthesize'),
        createEdge('e-synthesize-gaps', 'node-synthesize', 'node-gaps'),
        createEdge('e-gaps-condition', 'node-gaps', 'node-condition'),
        createEdge('e-condition-loop', 'node-condition', 'node-loop'),
        createEdge('e-condition-report', 'node-condition', 'node-report'),
        createEdge('e-loop-report', 'node-loop', 'node-report'),
        createEdge('e-report-memory', 'node-report', 'node-memory'),
        createEdge('e-memory-output', 'node-memory', 'node-output'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('RESEARCH_SOURCE_1'),
        createEnvVar('RESEARCH_SOURCE_2'),
        createEnvVar('RESEARCH_SOURCE_3'),
      ]
    ),
    requirements: ['OpenAI API key', 'Preferred source URLs'],
  },
  {
    id: 'rag-knowledge-base-builder',
    name: 'RAG Knowledge Base Builder',
    description: 'Ingest documents from a URL, clean and chunk them, embed each chunk, and write the resulting index into a vector store.',
    category: 'rag',
    tags: ['rag', 'embeddings', 'vector-store', 'knowledge-base'],
    difficulty: 'advanced',
    estimatedTime: '22 min setup',
    icon: 'DatabaseZap',
    color: '#d97706',
    featured: true,
    definition: createDefinition(
      'RAG Knowledge Base Builder',
      'Download a document, prepare clean chunks, generate embeddings, and persist them for retrieval workloads.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'Document URL Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-download', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Download Source Document',
          url: '{{input.documentUrl}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.CONTENT_SOURCE_TOKEN}}' },
        }),
        createNode('node-clean', NodeType.AI_LLM, 580, 220, {
          label: 'Extract and Clean Text',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0,
          prompt: 'Extract the useful text, normalize formatting, remove noise, and preserve headings and structure for chunking.',
        }),
        createNode('node-splitter', NodeType.RAG_TEXT_SPLITTER, 830, 220, {
          label: 'Chunk Text',
          strategy: 'recursive',
          chunkSize: 1200,
          chunkOverlap: 150,
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 1080, 220, {
          label: 'Iterate Chunks',
          itemVariable: 'chunk',
        }),
        createNode('node-embedder', NodeType.RAG_EMBEDDER, 1330, 220, {
          label: 'Generate Embeddings',
          provider: 'openai',
          model: 'text-embedding-3-small',
          batchSize: 50,
          timeout: 30000,
        }),
        createNode('node-vector-store', NodeType.RAG_VECTOR_STORE, 1580, 220, {
          label: 'Write Vector Store',
          backend: 'pgvector',
          operation: 'upsert',
          indexName: 'knowledge-base',
          namespace: '{{input.collection || "default"}}',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 1830, 220, {
          label: 'Index Metadata',
          key: 'kb-index/{{input.collection || "default"}}',
          value: '{{input}}',
          metadata: { type: 'rag-index' },
        }),
        createNode('node-output', NodeType.OUTPUT_RESPONSE, 2080, 220, {
          label: 'Indexed Chunk Count',
          responseTemplate: 'Indexed {{input.chunkCount}} chunks successfully.',
        }),
      ],
      [
        createEdge('e-trigger-download', 'node-trigger', 'node-download'),
        createEdge('e-download-clean', 'node-download', 'node-clean'),
        createEdge('e-clean-splitter', 'node-clean', 'node-splitter'),
        createEdge('e-splitter-foreach', 'node-splitter', 'node-foreach'),
        createEdge('e-foreach-embedder', 'node-foreach', 'node-embedder'),
        createEdge('e-embedder-vector', 'node-embedder', 'node-vector-store'),
        createEdge('e-vector-memory', 'node-vector-store', 'node-memory'),
        createEdge('e-memory-output', 'node-memory', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('CONTENT_SOURCE_TOKEN'), createEnvVar('PGVECTOR_CONNECTION')]
    ),
    requirements: ['OpenAI embeddings access', 'Vector store backend'],
  },
  {
    id: 'ai-code-review-pipeline',
    name: 'AI Code Review Pipeline',
    description: 'Analyze incoming pull requests from multiple angles, consolidate findings, and post a structured review back to GitHub.',
    category: 'ai',
    tags: ['code-review', 'github', 'security', 'performance'],
    difficulty: 'advanced',
    estimatedTime: '24 min setup',
    icon: 'ShieldCheck',
    color: '#db2777',
    definition: createDefinition(
      'AI Code Review Pipeline',
      'Fetch a PR diff, run multiple specialized review passes, combine the results, and publish a consolidated review comment.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'GitHub PR Webhook',
          method: 'POST',
          authType: 'hmac',
        }),
        createNode('node-diff', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Fetch PR Diff',
          url: '{{input.pull_request.diff_url}}',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{env.GITHUB_TOKEN}}',
            Accept: 'application/vnd.github.v3.diff',
          },
        }),
        createNode('node-parallel', NodeType.CONTROL_PARALLEL, 580, 220, {
          label: 'Run Review Lenses',
          branches: ['security', 'performance', 'best-practices'],
        }),
        createNode('node-security', NodeType.AI_LLM, 830, 60, {
          label: 'Analyze Security Issues',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Review this diff for security vulnerabilities, auth mistakes, data exposure, secrets, and injection risks. Return severity levels.',
        }),
        createNode('node-performance', NodeType.AI_LLM, 830, 220, {
          label: 'Analyze Performance',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Review this diff for performance regressions, redundant work, N+1 patterns, and scalability concerns.',
        }),
        createNode('node-practices', NodeType.AI_LLM, 830, 380, {
          label: 'Check Best Practices',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Review this diff for maintainability, testing gaps, error handling, and code quality best practices.',
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 1080, 220, {
          label: 'Merge Review Findings',
          strategy: 'append-array',
        }),
        createNode('node-consolidate', NodeType.AI_LLM, 1330, 220, {
          label: 'Write Consolidated Review',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Write a concise GitHub review summary with blocking issues, warnings, praise, and actionable comments. Return blockingIssues boolean.',
          systemPrompt: 'You are a staff engineer writing high-signal pull request reviews.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1580, 220, {
          label: 'Blocking Issues?',
          expression: 'input.blockingIssues === true',
          evaluationType: 'javascript',
        }),
        createNode('node-comment', NodeType.INTEGRATION_HTTP, 1830, 220, {
          label: 'Post GitHub Comment',
          url: '{{input.pull_request.comments_url}}',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{env.GITHUB_TOKEN}}',
            Accept: 'application/vnd.github+json',
          },
          bodyTemplate: '{"body":"{{input.reviewComment}}"}',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2080, 220, {
          label: 'Emit Review Result',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-diff', 'node-trigger', 'node-diff'),
        createEdge('e-diff-parallel', 'node-diff', 'node-parallel'),
        createEdge('e-parallel-security', 'node-parallel', 'node-security'),
        createEdge('e-parallel-performance', 'node-parallel', 'node-performance'),
        createEdge('e-parallel-practices', 'node-parallel', 'node-practices'),
        createEdge('e-security-merge', 'node-security', 'node-merge'),
        createEdge('e-performance-merge', 'node-performance', 'node-merge'),
        createEdge('e-practices-merge', 'node-practices', 'node-merge'),
        createEdge('e-merge-consolidate', 'node-merge', 'node-consolidate'),
        createEdge('e-consolidate-condition', 'node-consolidate', 'node-condition'),
        createEdge('e-condition-comment', 'node-condition', 'node-comment'),
        createEdge('e-comment-output', 'node-comment', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY'), createEnvVar('GITHUB_TOKEN'), createEnvVar('GITHUB_WEBHOOK_SECRET')]
    ),
    requirements: ['OpenAI API key', 'GitHub token', 'GitHub webhook secret'],
  },
  {
    id: 'support-ticket-triage',
    name: 'Support Ticket Triage',
    description: 'Classify support urgency, fetch similar incidents from the knowledge base, and route high-priority tickets immediately.',
    category: 'automation',
    tags: ['support', 'triage', 'rag', 'zendesk'],
    difficulty: 'advanced',
    estimatedTime: '24 min setup',
    icon: 'LifeBuoy',
    color: '#0f766e',
    definition: createDefinition(
      'Support Ticket Triage',
      'Score urgency, extract ticket context, retrieve similar cases, and update the support platform with the right routing and guidance.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'New Ticket Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-urgency', NodeType.AI_CLASSIFICATION, 330, 220, {
          label: 'Classify Urgency',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Classify the ticket urgency as P1, P2, P3, or P4 with confidence and rationale.',
        }),
        createNode('node-extract', NodeType.AI_LLM, 580, 220, {
          label: 'Extract Key Info',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Extract product area, customer tier, issue summary, suspected root cause, impacted workflows, and desired outcome as JSON.',
        }),
        createNode('node-rag', NodeType.RAG_RETRIEVER, 830, 220, {
          label: 'Find Similar Past Tickets',
          backend: 'pgvector',
          strategy: 'similarity',
          indexName: 'support-knowledge',
          topK: 5,
        }),
        createNode('node-solution', NodeType.AI_LLM, 1080, 220, {
          label: 'Suggest Solution',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          outputFormat: 'json',
          prompt: 'Suggest the likely fix, next diagnostic steps, customer-safe response guidance, and escalation notes using the retrieved similar tickets.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1330, 220, {
          label: 'P1 Ticket?',
          expression: "input.priority === 'P1'",
          evaluationType: 'javascript',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1580, 60, {
          label: 'Slack Urgent Alert',
          channel: '{{env.SLACK_INCIDENT_CHANNEL}}',
        }),
        createNode('node-jira', NodeType.INTEGRATION_JIRA, 1580, 220, {
          label: 'Assign Senior Engineer',
          projectKey: 'SUP',
          issueType: 'Incident',
          priority: 'Highest',
        }),
        createNode('node-standard', NodeType.INTEGRATION_HTTP, 1580, 380, {
          label: 'Route to Standard Queue',
          url: '{{env.ZENDESK_API_URL}}/tickets/{{input.ticketId}}/queue',
          method: 'PUT',
          headers: { Authorization: 'Bearer {{env.ZENDESK_API_TOKEN}}' },
        }),
        createNode('node-update', NodeType.INTEGRATION_HTTP, 1830, 220, {
          label: 'Update Zendesk Ticket',
          url: '{{env.ZENDESK_API_URL}}/tickets/{{input.ticketId}}',
          method: 'PUT',
          headers: { Authorization: 'Bearer {{env.ZENDESK_API_TOKEN}}' },
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 2080, 220, {
          label: 'Notify Customer',
          to: '{{input.requester.email}}',
          subject: 'We are working on your support request',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2330, 220, {
          label: 'Emit Triage Summary',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-urgency', 'node-trigger', 'node-urgency'),
        createEdge('e-urgency-extract', 'node-urgency', 'node-extract'),
        createEdge('e-extract-rag', 'node-extract', 'node-rag'),
        createEdge('e-rag-solution', 'node-rag', 'node-solution'),
        createEdge('e-solution-condition', 'node-solution', 'node-condition'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-jira', 'node-condition', 'node-jira'),
        createEdge('e-condition-standard', 'node-condition', 'node-standard'),
        createEdge('e-slack-update', 'node-slack', 'node-update'),
        createEdge('e-jira-update', 'node-jira', 'node-update'),
        createEdge('e-standard-update', 'node-standard', 'node-update'),
        createEdge('e-update-email', 'node-update', 'node-email'),
        createEdge('e-email-output', 'node-email', 'node-output'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('ZENDESK_API_URL'),
        createEnvVar('ZENDESK_API_TOKEN'),
        createEnvVar('SLACK_INCIDENT_CHANNEL'),
      ]
    ),
    requirements: ['OpenAI API key', 'Zendesk API token', 'Support vector index', 'Slack bot token'],
  },
  {
    id: 'financial-report-generator',
    name: 'Financial Report Generator',
    description: 'Collect monthly financial data, calculate KPIs, generate an executive narrative, and distribute the finished report.',
    category: 'automation',
    tags: ['finance', 'reporting', 'email', 'slack'],
    difficulty: 'advanced',
    estimatedTime: '22 min setup',
    icon: 'BarChart3',
    color: '#1d4ed8',
    definition: createDefinition(
      'Financial Report Generator',
      'Run a scheduled finance reporting workflow that blends KPIs, analysis, recommendations, and stakeholder notifications.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 80, 220, {
          label: 'Monthly Schedule',
          cron: '0 7 1 * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-http', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Fetch Financial APIs',
          url: '{{env.FINANCE_API_URL}}/monthly-close?period={{date.previousMonth}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.FINANCE_API_TOKEN}}' },
        }),
        createNode('node-kpis', NodeType.TRANSFORM_DATA, 580, 220, {
          label: 'Calculate KPIs',
          description: 'Compute revenue growth, gross margin, burn, runway, CAC, and payback period.',
        }),
        createNode('node-trends', NodeType.AI_LLM, 830, 220, {
          label: 'Analyze Trends',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Analyze the KPI trends month over month, identify anomalies, and highlight leading indicators for the leadership team.',
        }),
        createNode('node-summary', NodeType.AI_LLM, 1080, 220, {
          label: 'Write Executive Summary',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.3,
          prompt: 'Write a concise executive summary for the monthly finance report with key wins, risks, and callouts.',
        }),
        createNode('node-recommendations', NodeType.AI_LLM, 1330, 220, {
          label: 'Generate Recommendations',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.4,
          prompt: 'Generate 3-5 finance and operations recommendations based on the KPI and trend analysis.',
        }),
        createNode('node-format', NodeType.TRANSFORM_MERGE, 1580, 220, {
          label: 'Format Report Payload',
          strategy: 'deep',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 1830, 60, {
          label: 'Send Stakeholder Email',
          to: '{{env.FINANCE_REPORT_RECIPIENTS}}',
          subject: 'Monthly Financial Report',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1830, 220, {
          label: 'Post Slack Summary',
          channel: '{{env.FINANCE_SLACK_CHANNEL}}',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 1830, 380, {
          label: 'Archive Report',
          key: 'finance-reports/{{date.previousMonth}}',
          value: '{{input}}',
          metadata: { type: 'monthly-report' },
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2080, 220, {
          label: 'Emit Report JSON',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-http', 'node-trigger', 'node-http'),
        createEdge('e-http-kpis', 'node-http', 'node-kpis'),
        createEdge('e-kpis-trends', 'node-kpis', 'node-trends'),
        createEdge('e-trends-summary', 'node-trends', 'node-summary'),
        createEdge('e-summary-recommendations', 'node-summary', 'node-recommendations'),
        createEdge('e-recommendations-format', 'node-recommendations', 'node-format'),
        createEdge('e-format-email', 'node-format', 'node-email'),
        createEdge('e-format-slack', 'node-format', 'node-slack'),
        createEdge('e-format-memory', 'node-format', 'node-memory'),
        createEdge('e-email-output', 'node-email', 'node-output'),
        createEdge('e-slack-output', 'node-slack', 'node-output'),
        createEdge('e-memory-output', 'node-memory', 'node-output'),
      ],
      [
        createEnvVar('FINANCE_API_URL'),
        createEnvVar('FINANCE_API_TOKEN'),
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('FINANCE_REPORT_RECIPIENTS'),
        createEnvVar('FINANCE_SLACK_CHANNEL'),
      ]
    ),
    requirements: ['Finance API access', 'OpenAI API key', 'Email and Slack credentials'],
  },
  {
    id: 'multi-language-content-localizer',
    name: 'Multi-Language Content Localizer',
    description: 'Translate and culturally localize content across multiple languages while preserving the original voice and quality.',
    category: 'ai',
    tags: ['translation', 'localization', 'content', 'qa'],
    difficulty: 'advanced',
    estimatedTime: '20 min setup',
    icon: 'Languages',
    color: '#9333ea',
    definition: createDefinition(
      'Multi-Language Content Localizer',
      'Normalize a content request, evaluate tone, iterate across target languages, and output a complete localized package.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'Content + Languages',
          inputSchema: {
            content: 'string',
            sourceLanguage: 'string',
            targetLanguages: 'string[]',
            brandVoice: 'string',
          },
        }),
        createNode('node-normalize', NodeType.TRANSFORM_DATA, 330, 220, {
          label: 'Normalize Request',
          description: 'Prepare the source content, constraints, glossary, and language list.',
        }),
        createNode('node-tone', NodeType.AI_LLM, 580, 220, {
          label: 'Analyze Tone & Style',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Analyze the tone, reading level, brand style, prohibited phrases, and localization constraints. Return a style guide JSON.',
        }),
        createNode('node-split', NodeType.TRANSFORM_SPLIT, 830, 220, {
          label: 'Split Target Languages',
          sourceField: 'targetLanguages',
        }),
        createNode('node-foreach', NodeType.CONTROL_FOREACH, 1080, 220, {
          label: 'Iterate Languages',
          itemVariable: 'language',
        }),
        createNode('node-translate', NodeType.AI_TRANSLATION, 1330, 220, {
          label: 'Translate Content',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Translate the content accurately into the target language while preserving meaning and brand voice.',
        }),
        createNode('node-localize', NodeType.AI_LLM, 1580, 220, {
          label: 'Localize Idioms',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.4,
          prompt: 'Adjust idioms, examples, calls to action, and cultural references for the target market without changing intent.',
        }),
        createNode('node-qa', NodeType.AI_LLM, 1830, 220, {
          label: 'QA Check',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Check the localized version for fluency, factual accuracy, brand consistency, forbidden terms, and completeness. Return pass/fail with edits.',
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 2080, 220, {
          label: 'Merge Translations',
          strategy: 'deep',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2330, 220, {
          label: 'Output Translation JSON',
          pretty: true,
          expectedShape: '{ en, es, fr, de, ja, zh }',
        }),
      ],
      [
        createEdge('e-trigger-normalize', 'node-trigger', 'node-normalize'),
        createEdge('e-normalize-tone', 'node-normalize', 'node-tone'),
        createEdge('e-tone-split', 'node-tone', 'node-split'),
        createEdge('e-split-foreach', 'node-split', 'node-foreach'),
        createEdge('e-foreach-translate', 'node-foreach', 'node-translate'),
        createEdge('e-translate-localize', 'node-translate', 'node-localize'),
        createEdge('e-localize-qa', 'node-localize', 'node-qa'),
        createEdge('e-qa-merge', 'node-qa', 'node-merge'),
        createEdge('e-merge-output', 'node-merge', 'node-output'),
      ],
      [createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['OpenAI API key'],
  },
  {
    id: 'incident-response-automation',
    name: 'Incident Response Automation',
    description: 'Classify incoming alerts, launch the correct escalation path, generate runbook guidance, and schedule a follow-up check.',
    category: 'automation',
    tags: ['incident-response', 'pagerduty', 'jira', 'slack'],
    difficulty: 'advanced',
    estimatedTime: '24 min setup',
    icon: 'Siren',
    color: '#dc2626',
    definition: createDefinition(
      'Incident Response Automation',
      'Route alerts by severity, trigger communications, produce runbook steps, log the incident, and schedule follow-up work.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'PagerDuty / Alert Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-severity', NodeType.AI_CLASSIFICATION, 330, 220, {
          label: 'Classify Severity',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Classify this incident as P1, P2, or P3 based on business impact, blast radius, and urgency.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 580, 220, {
          label: 'P1 Incident?',
          expression: "input.severity === 'P1'",
          evaluationType: 'javascript',
        }),
        createNode('node-war-room', NodeType.INTEGRATION_SLACK, 830, 60, {
          label: 'Open Slack War Room',
          channel: '{{env.SLACK_WAR_ROOM_CHANNEL}}',
        }),
        createNode('node-page', NodeType.INTEGRATION_SMS, 830, 160, {
          label: 'Page On-Call',
          to: '{{env.ONCALL_PHONE}}',
        }),
        createNode('node-jira-p1', NodeType.INTEGRATION_JIRA, 830, 260, {
          label: 'Create Jira P1',
          projectKey: 'OPS',
          issueType: 'Incident',
          priority: 'Highest',
        }),
        createNode('node-slack-p2', NodeType.INTEGRATION_SLACK, 830, 360, {
          label: 'Notify Slack',
          channel: '{{env.SLACK_INCIDENT_CHANNEL}}',
        }),
        createNode('node-jira-p2', NodeType.INTEGRATION_JIRA, 830, 460, {
          label: 'Create Jira P2',
          projectKey: 'OPS',
          issueType: 'Incident',
          priority: 'High',
        }),
        createNode('node-runbook', NodeType.AI_LLM, 1080, 220, {
          label: 'Generate Runbook Steps',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.2,
          prompt: 'Generate concrete incident response steps, rollback guidance, checks, owners, and communication points for this alert.',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 1330, 220, {
          label: 'Write Incident Log',
          key: 'incidents/{{input.incidentId}}',
          value: '{{input}}',
          metadata: { type: 'incident-log' },
        }),
        createNode('node-followup', NodeType.UTILITY_DELAY, 1580, 220, {
          label: 'Schedule Follow-up Check',
          delayMs: 1800000,
          description: 'Wait 30 minutes before the next incident review checkpoint.',
        }),
        createNode('node-output', NodeType.OUTPUT_RESPONSE, 1830, 220, {
          label: 'Return Incident Plan',
        }),
      ],
      [
        createEdge('e-trigger-severity', 'node-trigger', 'node-severity'),
        createEdge('e-severity-condition', 'node-severity', 'node-condition'),
        createEdge('e-condition-war-room', 'node-condition', 'node-war-room'),
        createEdge('e-condition-page', 'node-condition', 'node-page'),
        createEdge('e-condition-jira-p1', 'node-condition', 'node-jira-p1'),
        createEdge('e-condition-slack-p2', 'node-condition', 'node-slack-p2'),
        createEdge('e-condition-jira-p2', 'node-condition', 'node-jira-p2'),
        createEdge('e-war-room-runbook', 'node-war-room', 'node-runbook'),
        createEdge('e-page-runbook', 'node-page', 'node-runbook'),
        createEdge('e-jira-p1-runbook', 'node-jira-p1', 'node-runbook'),
        createEdge('e-slack-p2-runbook', 'node-slack-p2', 'node-runbook'),
        createEdge('e-jira-p2-runbook', 'node-jira-p2', 'node-runbook'),
        createEdge('e-runbook-memory', 'node-runbook', 'node-memory'),
        createEdge('e-memory-followup', 'node-memory', 'node-followup'),
        createEdge('e-followup-output', 'node-followup', 'node-output'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('SLACK_WAR_ROOM_CHANNEL'),
        createEnvVar('SLACK_INCIDENT_CHANNEL'),
        createEnvVar('ONCALL_PHONE'),
      ]
    ),
    requirements: ['OpenAI API key', 'Slack bot token', 'Jira credentials', 'SMS provider'],
  },
  {
    id: 'lead-scoring-enrichment',
    name: 'Lead Scoring & Enrichment',
    description: 'Enrich inbound leads, score their quality, draft outreach, and route hot leads directly to sales.',
    category: 'automation',
    tags: ['leads', 'sales', 'enrichment', 'outreach'],
    difficulty: 'advanced',
    estimatedTime: '21 min setup',
    icon: 'UserRoundPlus',
    color: '#0891b2',
    definition: createDefinition(
      'Lead Scoring & Enrichment',
      'Combine third-party enrichment data with AI scoring and personalized outreach to automate lead routing.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'New Lead Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-enrich', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Clearbit / Hunter Enrichment',
          url: '{{env.ENRICHMENT_API_URL}}/person?email={{input.email}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.ENRICHMENT_API_TOKEN}}' },
        }),
        createNode('node-linkedin', NodeType.INTEGRATION_HTTP, 580, 220, {
          label: 'LinkedIn Lookup',
          url: '{{env.LINKEDIN_LOOKUP_URL}}?company={{input.company}}&name={{input.fullName}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.LINKEDIN_LOOKUP_TOKEN}}' },
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 830, 220, {
          label: 'Merge Lead Context',
          strategy: 'deep',
        }),
        createNode('node-score', NodeType.AI_LLM, 1080, 220, {
          label: 'Score Lead 0-100',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Score this lead from 0 to 100 based on ICP fit, role seniority, buying intent, company size, and timing. Return score and rationale.',
        }),
        createNode('node-outreach', NodeType.AI_LLM, 1330, 220, {
          label: 'Draft Personalized Outreach',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.6,
          prompt: "Draft a personalized outreach message referencing the lead's company, role, likely pain points, and desired outcome.",
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1580, 220, {
          label: 'Score > 70?',
          expression: 'input.score > 70',
          evaluationType: 'javascript',
        }),
        createNode('node-crm', NodeType.INTEGRATION_HTTP, 1830, 60, {
          label: 'Create CRM Opportunity',
          url: '{{env.CRM_API_URL}}/leads',
          method: 'POST',
          headers: { Authorization: 'Bearer {{env.CRM_API_TOKEN}}' },
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1830, 220, {
          label: 'Notify Sales Team',
          channel: '{{env.SALES_SLACK_CHANNEL}}',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 1830, 380, {
          label: 'Send Nurture Email',
          to: '{{input.email}}',
          subject: 'Resources tailored to your goals',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2080, 220, {
          label: 'Emit Lead Package',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-enrich', 'node-trigger', 'node-enrich'),
        createEdge('e-enrich-linkedin', 'node-enrich', 'node-linkedin'),
        createEdge('e-linkedin-merge', 'node-linkedin', 'node-merge'),
        createEdge('e-merge-score', 'node-merge', 'node-score'),
        createEdge('e-score-outreach', 'node-score', 'node-outreach'),
        createEdge('e-outreach-condition', 'node-outreach', 'node-condition'),
        createEdge('e-condition-crm', 'node-condition', 'node-crm'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-email', 'node-condition', 'node-email'),
        createEdge('e-crm-output', 'node-crm', 'node-output'),
        createEdge('e-slack-output', 'node-slack', 'node-output'),
        createEdge('e-email-output', 'node-email', 'node-output'),
      ],
      [
        createEnvVar('ENRICHMENT_API_URL'),
        createEnvVar('ENRICHMENT_API_TOKEN'),
        createEnvVar('LINKEDIN_LOOKUP_URL'),
        createEnvVar('LINKEDIN_LOOKUP_TOKEN'),
        createEnvVar('CRM_API_URL'),
        createEnvVar('CRM_API_TOKEN'),
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('SALES_SLACK_CHANNEL'),
      ]
    ),
    requirements: ['Enrichment API access', 'CRM token', 'OpenAI API key', 'Slack bot token'],
  },
  {
    id: 'video-content-processor',
    name: 'Video Content Processor',
    description: 'Transform an uploaded video or transcript feed into a summary, article, and social-ready content package.',
    category: 'ai',
    tags: ['video', 'transcript', 'blog', 'social'],
    difficulty: 'advanced',
    estimatedTime: '20 min setup',
    icon: 'Clapperboard',
    color: '#7c2d12',
    definition: createDefinition(
      'Video Content Processor',
      'Fetch transcript data, extract the important moments, and generate multi-format written content from the source video.',
      [
        createNode('node-trigger', NodeType.TRIGGER_WEBHOOK, 80, 220, {
          label: 'Video URL Webhook',
          method: 'POST',
          authType: 'bearer',
        }),
        createNode('node-transcript', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Fetch Transcript / Captions',
          url: '{{env.TRANSCRIPT_API_URL}}?videoUrl={{input.videoUrl}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.TRANSCRIPT_API_TOKEN}}' },
        }),
        createNode('node-normalize', NodeType.TRANSFORM_DATA, 580, 220, {
          label: 'Normalize Transcript',
          description: 'Standardize timestamps, speaker labels, and cleaned transcript blocks.',
        }),
        createNode('node-summary', NodeType.AI_SUMMARIZATION, 830, 220, {
          label: 'Summarize Video',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Summarize the video with key themes, notable quotes, audience takeaways, and CTA ideas.',
        }),
        createNode('node-key-points', NodeType.AI_LLM, 1080, 220, {
          label: 'Extract Key Points',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
          outputFormat: 'json',
          prompt: 'Extract the top 10 key points, timestamps, memorable quotes, and reusable snippets as JSON.',
        }),
        createNode('node-blog', NodeType.AI_LLM, 1330, 60, {
          label: 'Generate Blog Post',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.5,
          prompt: 'Turn the transcript into a polished blog post with a strong intro, headings, examples, and conclusion.',
        }),
        createNode('node-twitter', NodeType.AI_LLM, 1330, 220, {
          label: 'Create Twitter Thread',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          prompt: 'Create an engaging 10-post X/Twitter thread from the video summary and key points.',
        }),
        createNode('node-linkedin', NodeType.AI_LLM, 1330, 380, {
          label: 'Write LinkedIn Post',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.6,
          prompt: 'Write a LinkedIn post that repackages the video for professional readers with a strong hook and CTA.',
        }),
        createNode('node-merge', NodeType.TRANSFORM_MERGE, 1580, 220, {
          label: 'Merge Content Outputs',
          strategy: 'deep',
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 1830, 220, {
          label: 'Output Content Bundle',
          pretty: true,
          expectedShape: '{ summary, blog, twitter, linkedin }',
        }),
      ],
      [
        createEdge('e-trigger-transcript', 'node-trigger', 'node-transcript'),
        createEdge('e-transcript-normalize', 'node-transcript', 'node-normalize'),
        createEdge('e-normalize-summary', 'node-normalize', 'node-summary'),
        createEdge('e-summary-key-points', 'node-summary', 'node-key-points'),
        createEdge('e-key-points-blog', 'node-key-points', 'node-blog'),
        createEdge('e-key-points-twitter', 'node-key-points', 'node-twitter'),
        createEdge('e-key-points-linkedin', 'node-key-points', 'node-linkedin'),
        createEdge('e-blog-merge', 'node-blog', 'node-merge'),
        createEdge('e-twitter-merge', 'node-twitter', 'node-merge'),
        createEdge('e-linkedin-merge', 'node-linkedin', 'node-merge'),
        createEdge('e-merge-output', 'node-merge', 'node-output'),
      ],
      [createEnvVar('TRANSCRIPT_API_URL'), createEnvVar('TRANSCRIPT_API_TOKEN'), createEnvVar('OPENAI_API_KEY')]
    ),
    requirements: ['Transcript provider access', 'OpenAI API key'],
  },
  {
    id: 'data-quality-monitor',
    name: 'Data Quality Monitor',
    description: 'Watch a critical dataset daily, identify anomalies, route severe issues to responders, and update quality dashboards automatically.',
    category: 'automation',
    tags: ['data-quality', 'anomaly-detection', 'jira', 'monitoring'],
    difficulty: 'advanced',
    estimatedTime: '22 min setup',
    icon: 'Activity',
    color: '#16a34a',
    definition: createDefinition(
      'Data Quality Monitor',
      'Compute baseline statistics, detect anomalies with AI, and notify operators or quietly log minor issues.',
      [
        createNode('node-trigger', NodeType.TRIGGER_SCHEDULE, 80, 220, {
          label: 'Daily Schedule',
          cron: '0 6 * * *',
          timezone: 'UTC',
          enabled: true,
        }),
        createNode('node-dataset', NodeType.INTEGRATION_HTTP, 330, 220, {
          label: 'Fetch Dataset',
          url: '{{env.DATASET_API_URL}}/quality-snapshot',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.DATASET_API_TOKEN}}' },
        }),
        createNode('node-stats', NodeType.TRANSFORM_DATA, 580, 220, {
          label: 'Compute Stats',
          description: 'Calculate null rates, uniqueness, row counts, distribution shifts, and freshness metrics.',
        }),
        createNode('node-anomalies', NodeType.AI_LLM, 830, 220, {
          label: 'Identify Anomalies',
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          outputFormat: 'json',
          prompt: 'Identify anomalous patterns, suspicious metric changes, and likely root causes. Return a structured anomaly summary.',
        }),
        createNode('node-classify', NodeType.AI_CLASSIFICATION, 1080, 220, {
          label: 'Classify Issues',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Classify the quality state as critical, major, minor, or healthy based on the anomaly summary.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1330, 220, {
          label: 'Critical Issues?',
          expression: "['critical', 'major'].includes(input.level)",
          evaluationType: 'javascript',
        }),
        createNode('node-slack', NodeType.INTEGRATION_SLACK, 1580, 60, {
          label: 'Slack Alert',
          channel: '{{env.DATA_QUALITY_SLACK_CHANNEL}}',
        }),
        createNode('node-email', NodeType.INTEGRATION_EMAIL, 1580, 180, {
          label: 'Email Data Team',
          to: '{{env.DATA_QUALITY_EMAILS}}',
          subject: 'Critical data quality issue detected',
        }),
        createNode('node-jira', NodeType.INTEGRATION_JIRA, 1580, 300, {
          label: 'Create Jira Issue',
          projectKey: 'DATA',
          issueType: 'Bug',
          priority: 'High',
        }),
        createNode('node-memory', NodeType.MEMORY_AGENT_WRITE, 1580, 420, {
          label: 'Log Minor Issues',
          key: 'data-quality/{{date.today}}',
          value: '{{input}}',
          metadata: { workflow: 'data-quality-monitor' },
        }),
        createNode('node-dashboard', NodeType.INTEGRATION_HTTP, 1830, 220, {
          label: 'Update Dashboard',
          url: '{{env.QUALITY_DASHBOARD_URL}}/api/incidents',
          method: 'POST',
          headers: { Authorization: 'Bearer {{env.QUALITY_DASHBOARD_TOKEN}}' },
        }),
        createNode('node-output', NodeType.OUTPUT_JSON, 2080, 220, {
          label: 'Output Quality Report',
          pretty: true,
        }),
      ],
      [
        createEdge('e-trigger-dataset', 'node-trigger', 'node-dataset'),
        createEdge('e-dataset-stats', 'node-dataset', 'node-stats'),
        createEdge('e-stats-anomalies', 'node-stats', 'node-anomalies'),
        createEdge('e-anomalies-classify', 'node-anomalies', 'node-classify'),
        createEdge('e-classify-condition', 'node-classify', 'node-condition'),
        createEdge('e-condition-slack', 'node-condition', 'node-slack'),
        createEdge('e-condition-email', 'node-condition', 'node-email'),
        createEdge('e-condition-jira', 'node-condition', 'node-jira'),
        createEdge('e-condition-memory', 'node-condition', 'node-memory'),
        createEdge('e-slack-dashboard', 'node-slack', 'node-dashboard'),
        createEdge('e-email-dashboard', 'node-email', 'node-dashboard'),
        createEdge('e-jira-dashboard', 'node-jira', 'node-dashboard'),
        createEdge('e-memory-dashboard', 'node-memory', 'node-dashboard'),
        createEdge('e-dashboard-output', 'node-dashboard', 'node-output'),
      ],
      [
        createEnvVar('DATASET_API_URL'),
        createEnvVar('DATASET_API_TOKEN'),
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('DATA_QUALITY_SLACK_CHANNEL'),
        createEnvVar('DATA_QUALITY_EMAILS'),
        createEnvVar('QUALITY_DASHBOARD_URL'),
        createEnvVar('QUALITY_DASHBOARD_TOKEN'),
      ]
    ),
    requirements: ['Dataset API access', 'OpenAI API key', 'Slack, email, and dashboard credentials'],
  },
  {
    id: 'personal-ai-assistant',
    name: 'Personal AI Assistant',
    description: 'Combine conversation history, knowledge retrieval, and optional tool usage to answer requests like a context-aware executive assistant.',
    category: 'agent',
    tags: ['assistant', 'memory', 'rag', 'tools'],
    difficulty: 'advanced',
    estimatedTime: '25 min setup',
    icon: 'Bot',
    color: '#6366f1',
    featured: true,
    definition: createDefinition(
      'Personal AI Assistant',
      'Load user memory and knowledge context, decide if tools are needed, execute them, and store the updated conversation state.',
      [
        createNode('node-trigger', NodeType.TRIGGER_MANUAL, 80, 220, {
          label: 'User Message',
          inputSchema: {
            message: 'string',
            sessionId: 'string',
          },
        }),
        createNode('node-memory-read', NodeType.MEMORY_AGENT_READ, 330, 120, {
          label: 'Read Conversation History',
          key: 'assistant-history/{{input.sessionId}}',
          defaultValue: [],
        }),
        createNode('node-rag', NodeType.RAG_RETRIEVER, 330, 320, {
          label: 'Retrieve Knowledge Base',
          backend: 'pgvector',
          strategy: 'similarity',
          indexName: 'personal-assistant-kb',
          topK: 6,
        }),
        createNode('node-context', NodeType.TRANSFORM_MERGE, 580, 220, {
          label: 'Merge Full Context',
          strategy: 'deep',
        }),
        createNode('node-agent', NodeType.AI_CHAT, 830, 220, {
          label: 'Process Request with Context',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.4,
          systemPrompt: 'You are a proactive personal AI assistant. Use memory, retrieved context, and the latest message to answer clearly and decide when tools are necessary.',
          prompt: 'Answer the user request. If tools are needed, explain what information is required from web search, calculation, or code execution.',
        }),
        createNode('node-condition', NodeType.CONTROL_CONDITION, 1080, 220, {
          label: 'Needs Tools?',
          expression: 'input.needsTools === true',
          evaluationType: 'javascript',
        }),
        createNode('node-search', NodeType.INTEGRATION_HTTP, 1330, 60, {
          label: 'Web Search',
          url: '{{env.SEARCH_API_URL}}?q={{input.searchQuery}}',
          method: 'GET',
          headers: { Authorization: 'Bearer {{env.SEARCH_API_TOKEN}}' },
        }),
        createNode('node-calculator', NodeType.UTILITY_MATH, 1330, 220, {
          label: 'Calculator',
          expression: '{{input.calculation}}',
        }),
        createNode('node-code', NodeType.SANDFLARE_EXECUTE, 1330, 380, {
          label: 'Code Runner',
          language: 'python',
          parseJsonOutput: true,
          fallbackToMock: true,
          code: `import json
result = {"answer": "computed", "details": "tool execution result"}
print(json.dumps(result))`,
        }),
        createNode('node-synthesize', NodeType.AI_LLM, 1580, 220, {
          label: 'Synthesize Tool Results',
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          prompt: 'Combine the assistant draft with any tool outputs into one final user response, citing tool findings only when relevant.',
        }),
        createNode('node-memory-write', NodeType.MEMORY_AGENT_WRITE, 1830, 220, {
          label: 'Update History',
          key: 'assistant-history/{{input.sessionId}}',
          value: '{{input}}',
          metadata: { source: 'personal-ai-assistant' },
        }),
        createNode('node-output', NodeType.OUTPUT_RESPONSE, 2080, 220, {
          label: 'Return Assistant Reply',
        }),
      ],
      [
        createEdge('e-trigger-memory-read', 'node-trigger', 'node-memory-read'),
        createEdge('e-trigger-rag', 'node-trigger', 'node-rag'),
        createEdge('e-memory-read-context', 'node-memory-read', 'node-context'),
        createEdge('e-rag-context', 'node-rag', 'node-context'),
        createEdge('e-context-agent', 'node-context', 'node-agent'),
        createEdge('e-agent-condition', 'node-agent', 'node-condition'),
        createEdge('e-condition-search', 'node-condition', 'node-search'),
        createEdge('e-condition-calculator', 'node-condition', 'node-calculator'),
        createEdge('e-condition-code', 'node-condition', 'node-code'),
        createEdge('e-condition-synthesize', 'node-condition', 'node-synthesize'),
        createEdge('e-search-synthesize', 'node-search', 'node-synthesize'),
        createEdge('e-calculator-synthesize', 'node-calculator', 'node-synthesize'),
        createEdge('e-code-synthesize', 'node-code', 'node-synthesize'),
        createEdge('e-synthesize-memory-write', 'node-synthesize', 'node-memory-write'),
        createEdge('e-memory-write-output', 'node-memory-write', 'node-output'),
      ],
      [
        createEnvVar('OPENAI_API_KEY'),
        createEnvVar('SEARCH_API_URL'),
        createEnvVar('SEARCH_API_TOKEN'),
      ]
    ),
    requirements: ['OpenAI API key', 'Search API access', 'Vector store for personal knowledge base'],
  }
];

export const workflowTemplates: WorkflowTemplate[] = [...richWorkflowTemplates, ...legacyWorkflowTemplates];

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter((t) => t.category === category);
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find((t) => t.id === id);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(workflowTemplates.map((t) => t.category)));
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return workflowTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
