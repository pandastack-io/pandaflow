import { NodeType, NodeCategory } from '../types/nodes';
import fs from 'fs';
import path from 'path';

// Define all nodes with minimal configuration
const allNodes = [
  // Triggers
  { type: NodeType.TRIGGER_MANUAL, category: NodeCategory.TRIGGER, name: 'Manual Trigger', description: 'Start workflow manually', icon: 'Play' },
  { type: NodeType.TRIGGER_SCHEDULE, category: NodeCategory.TRIGGER, name: 'Schedule', description: 'Run on schedule', icon: 'Clock' },
  { type: NodeType.TRIGGER_WEBHOOK, category: NodeCategory.TRIGGER, name: 'Webhook', description: 'HTTP webhook trigger', icon: 'Webhook' },
  { type: NodeType.TRIGGER_EMAIL, category: NodeCategory.TRIGGER, name: 'Email Trigger', description: 'Trigger on email', icon: 'Mail' },
  { type: NodeType.TRIGGER_FILE_WATCH, category: NodeCategory.TRIGGER, name: 'File Watch', description: 'Watch file changes', icon: 'FolderSearch' },
  { type: NodeType.TRIGGER_DATABASE, category: NodeCategory.TRIGGER, name: 'Database Trigger', description: 'Database changes', icon: 'Database' },
  { type: NodeType.TRIGGER_MQTT, category: NodeCategory.TRIGGER, name: 'MQTT', description: 'MQTT messages', icon: 'Radio' },
  { type: NodeType.TRIGGER_WEBSOCKET, category: NodeCategory.TRIGGER, name: 'WebSocket', description: 'WebSocket messages', icon: 'WifiZero' },
  { type: NodeType.TRIGGER_KAFKA, category: NodeCategory.TRIGGER, name: 'Kafka', description: 'Kafka messages', icon: 'MessageSquareMore' },
  { type: NodeType.TRIGGER_EVENT, category: NodeCategory.TRIGGER, name: 'Event', description: 'Generic event', icon: 'Zap' },

  // Sandflare (12)
  { type: NodeType.SANDFLARE_PYTHON, category: NodeCategory.SANDFLARE, name: 'Python', description: 'Execute Python code', icon: 'Code' },
  { type: NodeType.SANDFLARE_NODEJS, category: NodeCategory.SANDFLARE, name: 'Node.js', description: 'Execute Node.js code', icon: 'Code' },
  { type: NodeType.SANDFLARE_GO, category: NodeCategory.SANDFLARE, name: 'Go', description: 'Execute Go code', icon: 'Code' },
  { type: NodeType.SANDFLARE_RUST, category: NodeCategory.SANDFLARE, name: 'Rust', description: 'Execute Rust code', icon: 'Code' },
  { type: NodeType.SANDFLARE_BASH, category: NodeCategory.SANDFLARE, name: 'Bash', description: 'Execute Bash scripts', icon: 'Terminal' },
  { type: NodeType.SANDFLARE_RUBY, category: NodeCategory.SANDFLARE, name: 'Ruby', description: 'Execute Ruby code', icon: 'Code' },
  { type: NodeType.SANDFLARE_PHP, category: NodeCategory.SANDFLARE, name: 'PHP', description: 'Execute PHP code', icon: 'Code' },
  { type: NodeType.SANDFLARE_JAVA, category: NodeCategory.SANDFLARE, name: 'Java', description: 'Execute Java code', icon: 'Code' },
  { type: NodeType.SANDFLARE_DOCKER, category: NodeCategory.SANDFLARE, name: 'Docker', description: 'Run Docker container', icon: 'Container' },
  { type: NodeType.SANDFLARE_JUPYTER, category: NodeCategory.SANDFLARE, name: 'Jupyter', description: 'Jupyter notebook', icon: 'BookOpen' },
  { type: NodeType.SANDFLARE_EXECUTE, category: NodeCategory.SANDFLARE, name: 'Code Execute', description: 'Generic code execution', icon: 'Code2' },
  { type: NodeType.SANDFLARE_SCRAPE, category: NodeCategory.SANDFLARE, name: 'Web Scraper', description: 'Scrape websites', icon: 'Globe' },

  // AI/LLM (15)
  { type: NodeType.AI_LLM, category: NodeCategory.AI, name: 'LLM', description: 'Language model processing', icon: 'Brain' },
  { type: NodeType.AI_CHAT, category: NodeCategory.AI, name: 'Chat', description: 'Conversational AI', icon: 'MessageSquare' },
  { type: NodeType.AI_COMPLETION, category: NodeCategory.AI, name: 'Completion', description: 'Text completion', icon: 'Type' },
  { type: NodeType.AI_EMBEDDING, category: NodeCategory.AI, name: 'Embeddings', description: 'Generate embeddings', icon: 'Binary' },
  { type: NodeType.AI_VECTOR_SEARCH, category: NodeCategory.AI, name: 'Vector Search', description: 'Semantic search', icon: 'Search' },
  { type: NodeType.AI_CLASSIFICATION, category: NodeCategory.AI, name: 'Classification', description: 'Classify text', icon: 'Tags' },
  { type: NodeType.AI_SENTIMENT, category: NodeCategory.AI, name: 'Sentiment', description: 'Analyze sentiment', icon: 'Smile' },
  { type: NodeType.AI_SUMMARIZATION, category: NodeCategory.AI, name: 'Summarize', description: 'Summarize text', icon: 'FileText' },
  { type: NodeType.AI_TRANSLATION, category: NodeCategory.AI, name: 'Translate', description: 'Translate text', icon: 'Languages' },
  { type: NodeType.AI_IMAGE_GEN, category: NodeCategory.AI, name: 'Image Generation', description: 'Generate images', icon: 'Image' },
  { type: NodeType.AI_IMAGE_ANALYZE, category: NodeCategory.AI, name: 'Image Analysis', description: 'Analyze images', icon: 'ScanSearch' },
  { type: NodeType.AI_SPEECH_TO_TEXT, category: NodeCategory.AI, name: 'Speech to Text', description: 'Transcribe audio', icon: 'Mic' },
  { type: NodeType.AI_TEXT_TO_SPEECH, category: NodeCategory.AI, name: 'Text to Speech', description: 'Generate speech', icon: 'Volume2' },
  { type: NodeType.AI_OCR, category: NodeCategory.AI, name: 'OCR', description: 'Extract text from images', icon: 'ScanText' },
  { type: NodeType.AI_MODERATION, category: NodeCategory.AI, name: 'Moderation', description: 'Content moderation', icon: 'Shield' },

  // Transform (15)
  { type: NodeType.TRANSFORM_DATA, category: NodeCategory.TRANSFORM, name: 'Transform', description: 'Transform data', icon: 'Repeat' },
  { type: NodeType.TRANSFORM_FILTER, category: NodeCategory.TRANSFORM, name: 'Filter', description: 'Filter data', icon: 'Filter' },
  { type: NodeType.TRANSFORM_MAP, category: NodeCategory.TRANSFORM, name: 'Map', description: 'Map array items', icon: 'List' },
  { type: NodeType.TRANSFORM_REDUCE, category: NodeCategory.TRANSFORM, name: 'Reduce', description: 'Reduce array', icon: 'Minimize2' },
  { type: NodeType.TRANSFORM_AGGREGATE, category: NodeCategory.TRANSFORM, name: 'Aggregate', description: 'Aggregate data', icon: 'BarChart' },
  { type: NodeType.TRANSFORM_SPLIT, category: NodeCategory.TRANSFORM, name: 'Split', description: 'Split data', icon: 'Split' },
  { type: NodeType.TRANSFORM_MERGE, category: NodeCategory.TRANSFORM, name: 'Merge', description: 'Merge data', icon: 'Merge' },
  { type: NodeType.TRANSFORM_SORT, category: NodeCategory.TRANSFORM, name: 'Sort', description: 'Sort data', icon: 'ArrowUpDown' },
  { type: NodeType.TRANSFORM_DEDUPE, category: NodeCategory.TRANSFORM, name: 'Dedupe', description: 'Remove duplicates', icon: 'Copy' },
  { type: NodeType.TRANSFORM_JSON, category: NodeCategory.TRANSFORM, name: 'JSON', description: 'Parse/stringify JSON', icon: 'Braces' },
  { type: NodeType.TRANSFORM_XML, category: NodeCategory.TRANSFORM, name: 'XML', description: 'Parse/generate XML', icon: 'Code' },
  { type: NodeType.TRANSFORM_CSV, category: NodeCategory.TRANSFORM, name: 'CSV', description: 'Parse/generate CSV', icon: 'Table' },
  { type: NodeType.TRANSFORM_YAML, category: NodeCategory.TRANSFORM, name: 'YAML', description: 'Parse/generate YAML', icon: 'FileCode' },
  { type: NodeType.TRANSFORM_HTML, category: NodeCategory.TRANSFORM, name: 'HTML', description: 'Parse/generate HTML', icon: 'FileText' },
  { type: NodeType.TRANSFORM_REGEX, category: NodeCategory.TRANSFORM, name: 'Regex', description: 'Pattern matching', icon: 'SearchCode' },

  // Control Flow (10)
  { type: NodeType.CONTROL_CONDITION, category: NodeCategory.CONTROL, name: 'If Condition', description: 'Branch on condition', icon: 'GitBranch' },
  { type: NodeType.CONTROL_SWITCH, category: NodeCategory.CONTROL, name: 'Switch', description: 'Multi-way branch', icon: 'GitMerge' },
  { type: NodeType.CONTROL_LOOP, category: NodeCategory.CONTROL, name: 'Loop', description: 'Loop iteration', icon: 'RotateCw' },
  { type: NodeType.CONTROL_FOREACH, category: NodeCategory.CONTROL, name: 'For Each', description: 'Iterate array', icon: 'List' },
  { type: NodeType.CONTROL_WHILE, category: NodeCategory.CONTROL, name: 'While', description: 'While loop', icon: 'RefreshCw' },
  { type: NodeType.CONTROL_PARALLEL, category: NodeCategory.CONTROL, name: 'Parallel', description: 'Parallel execution', icon: 'Layers' },
  { type: NodeType.CONTROL_SEQUENCE, category: NodeCategory.CONTROL, name: 'Sequence', description: 'Sequential execution', icon: 'ArrowRight' },
  { type: NodeType.CONTROL_ERROR, category: NodeCategory.CONTROL, name: 'Try/Catch', description: 'Error handling', icon: 'AlertTriangle' },
  { type: NodeType.CONTROL_RETRY, category: NodeCategory.CONTROL, name: 'Retry', description: 'Retry on failure', icon: 'RotateCcw' },
  { type: NodeType.CONTROL_TIMEOUT, category: NodeCategory.CONTROL, name: 'Timeout', description: 'Execution timeout', icon: 'Timer' },

  // Integration - APIs (10)
  { type: NodeType.INTEGRATION_HTTP, category: NodeCategory.INTEGRATION, name: 'HTTP Request', description: 'Make HTTP calls', icon: 'Network' },
  { type: NodeType.INTEGRATION_GRAPHQL, category: NodeCategory.INTEGRATION, name: 'GraphQL', description: 'GraphQL queries', icon: 'Hexagon' },
  { type: NodeType.INTEGRATION_REST, category: NodeCategory.INTEGRATION, name: 'REST API', description: 'RESTful API calls', icon: 'Network' },
  { type: NodeType.INTEGRATION_SOAP, category: NodeCategory.INTEGRATION, name: 'SOAP', description: 'SOAP web services', icon: 'Box' },
  { type: NodeType.INTEGRATION_WEBHOOK, category: NodeCategory.INTEGRATION, name: 'Webhook', description: 'Send webhooks', icon: 'Send' },
  { type: NodeType.INTEGRATION_GRPC, category: NodeCategory.INTEGRATION, name: 'gRPC', description: 'gRPC calls', icon: 'Zap' },
  { type: NodeType.INTEGRATION_WEBSOCKET_CLIENT, category: NodeCategory.INTEGRATION, name: 'WebSocket', description: 'WebSocket client', icon: 'Radio' },
  { type: NodeType.INTEGRATION_SSE, category: NodeCategory.INTEGRATION, name: 'Server-Sent Events', description: 'SSE stream', icon: 'Activity' },
  { type: NodeType.INTEGRATION_OAUTH, category: NodeCategory.INTEGRATION, name: 'OAuth', description: 'OAuth authentication', icon: 'Key' },
  { type: NodeType.INTEGRATION_API_KEY, category: NodeCategory.INTEGRATION, name: 'API Key Auth', description: 'API key authentication', icon: 'KeyRound' },

  // Integration - Databases (10)
  { type: NodeType.INTEGRATION_DATABASE, category: NodeCategory.INTEGRATION, name: 'Database', description: 'Generic database', icon: 'Database' },
  { type: NodeType.INTEGRATION_POSTGRES, category: NodeCategory.INTEGRATION, name: 'PostgreSQL', description: 'PostgreSQL database', icon: 'Database' },
  { type: NodeType.INTEGRATION_MYSQL, category: NodeCategory.INTEGRATION, name: 'MySQL', description: 'MySQL database', icon: 'Database' },
  { type: NodeType.INTEGRATION_MONGODB, category: NodeCategory.INTEGRATION, name: 'MongoDB', description: 'MongoDB database', icon: 'Database' },
  { type: NodeType.INTEGRATION_REDIS, category: NodeCategory.INTEGRATION, name: 'Redis', description: 'Redis cache', icon: 'Zap' },
  { type: NodeType.INTEGRATION_ELASTICSEARCH, category: NodeCategory.INTEGRATION, name: 'Elasticsearch', description: 'Elasticsearch search', icon: 'Search' },
  { type: NodeType.INTEGRATION_DYNAMODB, category: NodeCategory.INTEGRATION, name: 'DynamoDB', description: 'AWS DynamoDB', icon: 'Database' },
  { type: NodeType.INTEGRATION_CASSANDRA, category: NodeCategory.INTEGRATION, name: 'Cassandra', description: 'Apache Cassandra', icon: 'Database' },
  { type: NodeType.INTEGRATION_FIRESTORE, category: NodeCategory.INTEGRATION, name: 'Firestore', description: 'Google Firestore', icon: 'Database' },
  { type: NodeType.INTEGRATION_SUPABASE, category: NodeCategory.INTEGRATION, name: 'Supabase', description: 'Supabase database', icon: 'Database' },

  // Integration - Cloud Services (15)
  { type: NodeType.INTEGRATION_AWS_S3, category: NodeCategory.INTEGRATION, name: 'AWS S3', description: 'S3 storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_AWS_LAMBDA, category: NodeCategory.INTEGRATION, name: 'AWS Lambda', description: 'Invoke Lambda', icon: 'Zap' },
  { type: NodeType.INTEGRATION_AWS_SQS, category: NodeCategory.INTEGRATION, name: 'AWS SQS', description: 'SQS queue', icon: 'MessageSquare' },
  { type: NodeType.INTEGRATION_AWS_SNS, category: NodeCategory.INTEGRATION, name: 'AWS SNS', description: 'SNS notifications', icon: 'Bell' },
  { type: NodeType.INTEGRATION_GCP_STORAGE, category: NodeCategory.INTEGRATION, name: 'GCP Storage', description: 'Google Cloud Storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_GCP_PUBSUB, category: NodeCategory.INTEGRATION, name: 'GCP Pub/Sub', description: 'Google Pub/Sub', icon: 'MessageSquare' },
  { type: NodeType.INTEGRATION_AZURE_BLOB, category: NodeCategory.INTEGRATION, name: 'Azure Blob', description: 'Azure Blob Storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_AZURE_QUEUE, category: NodeCategory.INTEGRATION, name: 'Azure Queue', description: 'Azure Queue Storage', icon: 'MessageSquare' },
  { type: NodeType.INTEGRATION_CLOUDFLARE_KV, category: NodeCategory.INTEGRATION, name: 'Cloudflare KV', description: 'Cloudflare KV storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_CLOUDFLARE_R2, category: NodeCategory.INTEGRATION, name: 'Cloudflare R2', description: 'Cloudflare R2 storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_CLOUDFLARE_D1, category: NodeCategory.INTEGRATION, name: 'Cloudflare D1', description: 'Cloudflare D1 database', icon: 'Database' },
  { type: NodeType.INTEGRATION_VERCEL_KV, category: NodeCategory.INTEGRATION, name: 'Vercel KV', description: 'Vercel KV storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_VERCEL_BLOB, category: NodeCategory.INTEGRATION, name: 'Vercel Blob', description: 'Vercel Blob storage', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_NETLIFY, category: NodeCategory.INTEGRATION, name: 'Netlify', description: 'Netlify deployment', icon: 'Cloud' },
  { type: NodeType.INTEGRATION_RAILWAY, category: NodeCategory.INTEGRATION, name: 'Railway', description: 'Railway deployment', icon: 'Train' },

  // Integration - Communication (10)
  { type: NodeType.INTEGRATION_EMAIL, category: NodeCategory.INTEGRATION, name: 'Email', description: 'Send email', icon: 'Mail' },
  { type: NodeType.INTEGRATION_SMTP, category: NodeCategory.INTEGRATION, name: 'SMTP', description: 'SMTP email', icon: 'Mail' },
  { type: NodeType.INTEGRATION_SENDGRID, category: NodeCategory.INTEGRATION, name: 'SendGrid', description: 'SendGrid email', icon: 'Mail' },
  { type: NodeType.INTEGRATION_MAILGUN, category: NodeCategory.INTEGRATION, name: 'Mailgun', description: 'Mailgun email', icon: 'Mail' },
  { type: NodeType.INTEGRATION_SLACK, category: NodeCategory.INTEGRATION, name: 'Slack', description: 'Slack messages', icon: 'MessageSquare' },
  { type: NodeType.INTEGRATION_DISCORD, category: NodeCategory.INTEGRATION, name: 'Discord', description: 'Discord messages', icon: 'MessageCircle' },
  { type: NodeType.INTEGRATION_TELEGRAM, category: NodeCategory.INTEGRATION, name: 'Telegram', description: 'Telegram bot', icon: 'Send' },
  { type: NodeType.INTEGRATION_WHATSAPP, category: NodeCategory.INTEGRATION, name: 'WhatsApp', description: 'WhatsApp messages', icon: 'MessageSquare' },
  { type: NodeType.INTEGRATION_TWILIO, category: NodeCategory.INTEGRATION, name: 'Twilio', description: 'Twilio SMS/Voice', icon: 'Phone' },
  { type: NodeType.INTEGRATION_SMS, category: NodeCategory.INTEGRATION, name: 'SMS', description: 'Send SMS', icon: 'Smartphone' },

  // Integration - Dev Tools (10)
  { type: NodeType.INTEGRATION_GITHUB, category: NodeCategory.INTEGRATION, name: 'GitHub', description: 'GitHub API', icon: 'Github' },
  { type: NodeType.INTEGRATION_GITLAB, category: NodeCategory.INTEGRATION, name: 'GitLab', description: 'GitLab API', icon: 'GitBranch' },
  { type: NodeType.INTEGRATION_BITBUCKET, category: NodeCategory.INTEGRATION, name: 'Bitbucket', description: 'Bitbucket API', icon: 'GitBranch' },
  { type: NodeType.INTEGRATION_JIRA, category: NodeCategory.INTEGRATION, name: 'Jira', description: 'Jira issues', icon: 'Bug' },
  { type: NodeType.INTEGRATION_LINEAR, category: NodeCategory.INTEGRATION, name: 'Linear', description: 'Linear issues', icon: 'ListTodo' },
  { type: NodeType.INTEGRATION_ASANA, category: NodeCategory.INTEGRATION, name: 'Asana', description: 'Asana tasks', icon: 'CheckSquare' },
  { type: NodeType.INTEGRATION_NOTION, category: NodeCategory.INTEGRATION, name: 'Notion', description: 'Notion API', icon: 'BookOpen' },
  { type: NodeType.INTEGRATION_AIRTABLE, category: NodeCategory.INTEGRATION, name: 'Airtable', description: 'Airtable API', icon: 'Table' },
  { type: NodeType.INTEGRATION_GOOGLE_SHEETS, category: NodeCategory.INTEGRATION, name: 'Google Sheets', description: 'Google Sheets API', icon: 'Sheet' },
  { type: NodeType.INTEGRATION_EXCEL, category: NodeCategory.INTEGRATION, name: 'Excel', description: 'Microsoft Excel', icon: 'FileSpreadsheet' },

  // Integration - Payment/Finance (5)
  { type: NodeType.INTEGRATION_STRIPE, category: NodeCategory.INTEGRATION, name: 'Stripe', description: 'Stripe payments', icon: 'CreditCard' },
  { type: NodeType.INTEGRATION_PAYPAL, category: NodeCategory.INTEGRATION, name: 'PayPal', description: 'PayPal payments', icon: 'CreditCard' },
  { type: NodeType.INTEGRATION_SQUARE, category: NodeCategory.INTEGRATION, name: 'Square', description: 'Square payments', icon: 'CreditCard' },
  { type: NodeType.INTEGRATION_PLAID, category: NodeCategory.INTEGRATION, name: 'Plaid', description: 'Plaid banking', icon: 'Building' },
  { type: NodeType.INTEGRATION_QUICKBOOKS, category: NodeCategory.INTEGRATION, name: 'QuickBooks', description: 'QuickBooks accounting', icon: 'Calculator' },

  // Integration - Analytics (5)
  { type: NodeType.INTEGRATION_GOOGLE_ANALYTICS, category: NodeCategory.INTEGRATION, name: 'Google Analytics', description: 'Google Analytics', icon: 'BarChart' },
  { type: NodeType.INTEGRATION_MIXPANEL, category: NodeCategory.INTEGRATION, name: 'Mixpanel', description: 'Mixpanel analytics', icon: 'TrendingUp' },
  { type: NodeType.INTEGRATION_SEGMENT, category: NodeCategory.INTEGRATION, name: 'Segment', description: 'Segment CDP', icon: 'Activity' },
  { type: NodeType.INTEGRATION_AMPLITUDE, category: NodeCategory.INTEGRATION, name: 'Amplitude', description: 'Amplitude analytics', icon: 'BarChart2' },
  { type: NodeType.INTEGRATION_POSTHOG, category: NodeCategory.INTEGRATION, name: 'PostHog', description: 'PostHog analytics', icon: 'LineChart' },

  // Loader (10)
  { type: NodeType.LOADER_CSV, category: NodeCategory.LOADER, name: 'CSV Loader', description: 'Load CSV data', icon: 'FileSpreadsheet' },
  { type: NodeType.LOADER_JSON, category: NodeCategory.LOADER, name: 'JSON Loader', description: 'Load JSON data', icon: 'Braces' },
  { type: NodeType.LOADER_PDF, category: NodeCategory.LOADER, name: 'PDF Loader', description: 'Extract text from PDFs', icon: 'FileText' },
  { type: NodeType.LOADER_WEBPAGE, category: NodeCategory.LOADER, name: 'Webpage Loader', description: 'Load webpage content', icon: 'Globe' },
  { type: NodeType.LOADER_GITHUB, category: NodeCategory.LOADER, name: 'GitHub Loader', description: 'Load repository files', icon: 'Github' },
  { type: NodeType.LOADER_NOTION, category: NodeCategory.LOADER, name: 'Notion Loader', description: 'Load Notion content', icon: 'BookOpen' },
  { type: NodeType.LOADER_GOOGLE_DRIVE, category: NodeCategory.LOADER, name: 'Google Drive Loader', description: 'Load Drive files', icon: 'HardDriveDownload' },
  { type: NodeType.LOADER_AIRTABLE, category: NodeCategory.LOADER, name: 'Airtable Loader', description: 'Load Airtable rows', icon: 'Table' },
  { type: NodeType.LOADER_RSS, category: NodeCategory.LOADER, name: 'RSS Loader', description: 'Parse RSS and Atom feeds', icon: 'Rss' },
  { type: NodeType.LOADER_SITEMAP, category: NodeCategory.LOADER, name: 'Sitemap Loader', description: 'Parse sitemap URLs', icon: 'Map' },

  // Output (10)
  { type: NodeType.OUTPUT_RESPONSE, category: NodeCategory.OUTPUT, name: 'Response', description: 'Return response', icon: 'CheckCircle' },
  { type: NodeType.OUTPUT_JSON, category: NodeCategory.OUTPUT, name: 'JSON Output', description: 'Output JSON', icon: 'Braces' },
  { type: NodeType.OUTPUT_FILE, category: NodeCategory.OUTPUT, name: 'File Output', description: 'Save to file', icon: 'FileOutput' },
  { type: NodeType.OUTPUT_NOTIFICATION, category: NodeCategory.OUTPUT, name: 'Notification', description: 'Send notification', icon: 'Bell' },
  { type: NodeType.OUTPUT_EXPORT, category: NodeCategory.OUTPUT, name: 'Export', description: 'Export data', icon: 'Download' },
  { type: NodeType.OUTPUT_LOG, category: NodeCategory.OUTPUT, name: 'Log', description: 'Log output', icon: 'FileText' },
  { type: NodeType.OUTPUT_WEBHOOK, category: NodeCategory.OUTPUT, name: 'Webhook Output', description: 'Send to webhook', icon: 'Send' },
  { type: NodeType.OUTPUT_EMAIL, category: NodeCategory.OUTPUT, name: 'Email Output', description: 'Email results', icon: 'Mail' },
  { type: NodeType.OUTPUT_STORAGE, category: NodeCategory.OUTPUT, name: 'Storage', description: 'Store data', icon: 'HardDrive' },
  { type: NodeType.OUTPUT_STREAM, category: NodeCategory.OUTPUT, name: 'Stream', description: 'Stream output', icon: 'Radio' },

  // Utility (15)
  { type: NodeType.UTILITY_DELAY, category: NodeCategory.UTILITY, name: 'Delay', description: 'Add delay', icon: 'Timer' },
  { type: NodeType.UTILITY_LOG, category: NodeCategory.UTILITY, name: 'Log', description: 'Log message', icon: 'FileText' },
  { type: NodeType.UTILITY_VARIABLE, category: NodeCategory.UTILITY, name: 'Variable', description: 'Set variable', icon: 'Variable' },
  { type: NodeType.UTILITY_CACHE, category: NodeCategory.UTILITY, name: 'Cache', description: 'Cache data', icon: 'Archive' },
  { type: NodeType.UTILITY_QUEUE, category: NodeCategory.UTILITY, name: 'Queue', description: 'Queue operations', icon: 'List' },
  { type: NodeType.UTILITY_CRYPTO, category: NodeCategory.UTILITY, name: 'Encrypt/Decrypt', description: 'Cryptography', icon: 'Lock' },
  { type: NodeType.UTILITY_HASH, category: NodeCategory.UTILITY, name: 'Hash', description: 'Hash data', icon: 'Hash' },
  { type: NodeType.UTILITY_UUID, category: NodeCategory.UTILITY, name: 'UUID', description: 'Generate UUID', icon: 'Fingerprint' },
  { type: NodeType.UTILITY_DATE, category: NodeCategory.UTILITY, name: 'Date/Time', description: 'Date operations', icon: 'Calendar' },
  { type: NodeType.UTILITY_MATH, category: NodeCategory.UTILITY, name: 'Math', description: 'Math operations', icon: 'Calculator' },
  { type: NodeType.UTILITY_STRING, category: NodeCategory.UTILITY, name: 'String', description: 'String operations', icon: 'Type' },
  { type: NodeType.UTILITY_VALIDATOR, category: NodeCategory.UTILITY, name: 'Validate', description: 'Data validation', icon: 'CheckCircle' },
  { type: NodeType.UTILITY_PARSER, category: NodeCategory.UTILITY, name: 'Parser', description: 'Parse data', icon: 'FileCode' },
  { type: NodeType.UTILITY_TEMPLATE, category: NodeCategory.UTILITY, name: 'Template', description: 'Template engine', icon: 'FileText' },
  { type: NodeType.UTILITY_RANDOM, category: NodeCategory.UTILITY, name: 'Random', description: 'Random data', icon: 'Shuffle' },

  // Verdict (8)
  { type: NodeType.VERDICT_FAITHFULNESS, category: NodeCategory.VERDICT, name: 'Faithfulness', description: 'Score whether an answer stays grounded in the provided context', icon: 'Scale' },
  { type: NodeType.VERDICT_CORRECTNESS, category: NodeCategory.VERDICT, name: 'Correctness', description: 'Compare an answer against ground truth facts', icon: 'CheckCircle' },
  { type: NodeType.VERDICT_RELEVANCE, category: NodeCategory.VERDICT, name: 'Relevance', description: 'Judge how directly the answer addresses the question', icon: 'Target' },
  { type: NodeType.VERDICT_CONTEXT_PRECISION, category: NodeCategory.VERDICT, name: 'Context Precision', description: 'Measure how much retrieved context was actually useful', icon: 'Filter' },
  { type: NodeType.VERDICT_CONTEXT_RECALL, category: NodeCategory.VERDICT, name: 'Context Recall', description: 'Measure whether retrieval found all needed information', icon: 'Search' },
  { type: NodeType.VERDICT_HALLUCINATION, category: NodeCategory.VERDICT, name: 'Hallucination Detector', description: 'Find unsupported claims in an answer', icon: 'AlertTriangle' },
  { type: NodeType.VERDICT_TOXICITY, category: NodeCategory.VERDICT, name: 'Toxicity', description: 'Score whether generated text is safe and non-toxic', icon: 'Shield' },
  { type: NodeType.VERDICT_BATCH, category: NodeCategory.VERDICT, name: 'Batch Verdict', description: 'Run multiple answer quality evaluations in one node', icon: 'LayoutList' },

  // Data Sources (5)
  { type: NodeType.DATA_CSV_READ, category: NodeCategory.DATA, name: 'Read CSV', description: 'Read CSV file', icon: 'FileText' },
  { type: NodeType.DATA_JSON_READ, category: NodeCategory.DATA, name: 'Read JSON', description: 'Read JSON file', icon: 'Braces' },
  { type: NodeType.DATA_XML_READ, category: NodeCategory.DATA, name: 'Read XML', description: 'Read XML file', icon: 'Code' },
  { type: NodeType.DATA_YAML_READ, category: NodeCategory.DATA, name: 'Read YAML', description: 'Read YAML file', icon: 'FileCode' },
  { type: NodeType.DATA_EXCEL_READ, category: NodeCategory.DATA, name: 'Read Excel', description: 'Read Excel file', icon: 'FileSpreadsheet' },
];

// Generate registry code
function generateRegistry() {
  const colors = {
    [NodeCategory.TRIGGER]: '#10b981',
    [NodeCategory.SANDFLARE]: '#0ea5e9',
    [NodeCategory.AGENT]: '#8b5cf6',
    [NodeCategory.MEMORY]: '#14b8a6',
    [NodeCategory.AI]: '#8b5cf6',
    [NodeCategory.TOOL]: '#14b8a6',
    [NodeCategory.ANALYTICS]: '#f97316',
    [NodeCategory.RAG]: '#f59e0b',
    [NodeCategory.EMBEDDING]: '#8b5cf6',
    [NodeCategory.VECTORSTORE]: '#14b8a6',
    [NodeCategory.TRANSFORM]: '#6366f1',
    [NodeCategory.CONTROL]: '#f59e0b',
    [NodeCategory.INTEGRATION]: '#ec4899',
    [NodeCategory.LOADER]: '#06b6d4',
    [NodeCategory.OUTPUT]: '#84cc16',
    [NodeCategory.UTILITY]: '#94a3b8',
    [NodeCategory.DATA]: '#f97316',
    [NodeCategory.VERDICT]: '#10b981',
  };

  let code = `import { z } from 'zod';
import { NodeType, NodeCategory, NodeRegistryEntry } from '@/types/nodes';

const baseSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
});

export const nodeRegistry: Record<string, NodeRegistryEntry> = {\n`;

  allNodes.forEach((node) => {
    code += `  ['${node.type}']: {
    type: '${node.type}' as NodeType,
    category: '${node.category}' as NodeCategory,
    name: '${node.name}',
    description: '${node.description}',
    icon: '${node.icon}',
    color: '${colors[node.category as NodeCategory]}',
    configSchema: baseSchema,
    defaultConfig: {},
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [{ name: 'output', type: 'any' }],
  },\n\n`;
  });

  code += `};

export function getNodesByCategory(category: NodeCategory): NodeRegistryEntry[] {
  return Object.values(nodeRegistry).filter(node => node.category === category);
}

export function getNodeByType(type: NodeType): NodeRegistryEntry | undefined {
  return nodeRegistry[type as any];
}

export function getAllNodes(): NodeRegistryEntry[] {
  return Object.values(nodeRegistry);
}
`;

  return code;
}

// Write the file
const registryCode = generateRegistry();
const outputPath = path.join(__dirname, '../lib/nodes/registry.ts');
fs.writeFileSync(outputPath, registryCode, 'utf-8');

console.log(`Generated ${allNodes.length} nodes in registry.ts`);
console.log(`Total nodes: ${allNodes.length}`);
