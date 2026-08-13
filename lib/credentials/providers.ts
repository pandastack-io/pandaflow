export type FieldType = 'password' | 'text' | 'url' | 'select';

export interface CredentialField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: string[];
}

export type CredentialCategory =
  | 'AI & LLM'
  | 'Vector Database'
  | 'Database'
  | 'Communication'
  | 'Cloud'
  | 'Developer Tools'
  | 'Payment'
  | 'Search'
  | 'Productivity'
  | 'Other';

export interface CredentialProvider {
  id: string;
  name: string;
  category: CredentialCategory;
  icon: string;
  simpleIconId?: string;
  description: string;
  docsUrl?: string;
  fields: CredentialField[];
}

export const credentialCategories: CredentialCategory[] = [
  'AI & LLM',
  'Vector Database',
  'Database',
  'Communication',
  'Cloud',
  'Developer Tools',
  'Payment',
  'Search',
  'Productivity',
  'Other',
];

export const credentialProviders: CredentialProvider[] = [
  {
    id: 'pandastack',
    name: 'PandaStack',
    category: 'Cloud',
    icon: '⚡',
    description: 'Required for executing code in isolated microVMs.',
    docsUrl: 'https://pandastack.ai',
    fields: [
      {
        key: 'PANDASTACK_API_KEY',
        label: 'PandaStack API Key',
        type: 'password',
        placeholder: 'sf_...',
        helpText: 'Required for executing code in isolated microVMs. Get your key at pandastack.ai',
      },
    ],
  },
  {
    id: 'pandastack',
    name: 'PandaStack',
    category: 'Cloud',
    icon: '▲',
    description: 'Deploy and manage projects, cronjobs, databases, and managed apps on PandaStack.',
    docsUrl: 'https://pandastack.io/docs',
    fields: [
      {
        key: 'PANDASTACK_API_TOKEN',
        label: 'API Token',
        type: 'password',
        placeholder: 'psk_...',
        helpText: 'Generate an API token from your PandaStack dashboard under Settings → API Tokens.',
      },
      {
        key: 'PANDASTACK_API_URL',
        label: 'API Base URL',
        type: 'url',
        placeholder: 'https://api.pandastack.io',
        helpText: 'The base URL of your PandaStack backend API (without trailing slash).',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'AI & LLM',
    icon: '◆',
    description: 'Chat, reasoning, embeddings, and multimodal models.',
    docsUrl: 'https://platform.openai.com/api-keys',
    fields: [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', type: 'password', placeholder: 'sk-...' },
      { key: 'OPENAI_BASE_URL', label: 'Base URL', type: 'url', placeholder: 'https://api.openai.com/v1', required: false },
      { key: 'OPENAI_ORG_ID', label: 'Organization ID', type: 'text', placeholder: 'org-...', required: false },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'AI & LLM',
    icon: '🧠',
    description: 'Claude API credentials for text and tool use.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    fields: [{ key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', type: 'password', placeholder: 'sk-ant-...' }],
  },
  {
    id: 'google_ai',
    name: 'Google AI / Gemini',
    category: 'AI & LLM',
    icon: '✨',
    description: 'Gemini API access for chat, tools, and multimodal workflows.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    fields: [{ key: 'GOOGLE_AI_API_KEY', label: 'Google AI API Key', type: 'password', placeholder: 'AIza...' }],
  },
  {
    id: 'stability',
    name: 'Stability AI',
    category: 'AI & LLM',
    icon: '🎨',
    description: 'Image generation credentials for Stability AI models.',
    docsUrl: 'https://platform.stability.ai/account/keys',
    fields: [{ key: 'STABILITY_API_KEY', label: 'Stability API Key', type: 'password', placeholder: 'sk-...' }],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'AI & LLM',
    icon: '🎙️',
    description: 'Voice synthesis credentials for ElevenLabs speech generation.',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    fields: [
      { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key', type: 'password', placeholder: '...' },
      { key: 'ELEVENLABS_VOICE_ID', label: 'Default Voice ID', type: 'text', placeholder: 'voice-id', required: false },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    category: 'AI & LLM',
    icon: '⚙️',
    description: 'Ultra-fast inference for LLM-powered workflows.',
    docsUrl: 'https://console.groq.com/keys',
    fields: [{ key: 'GROQ_API_KEY', label: 'Groq API Key', type: 'password', placeholder: 'gsk_...' }],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    category: 'AI & LLM',
    icon: '🌪️',
    description: 'Mistral API credentials for chat and embeddings.',
    docsUrl: 'https://console.mistral.ai/api-keys',
    fields: [{ key: 'MISTRAL_API_KEY', label: 'Mistral API Key', type: 'password', placeholder: '...' }],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    category: 'AI & LLM',
    icon: '🟣',
    description: 'Language models, rerank, and embedding services.',
    docsUrl: 'https://dashboard.cohere.com/api-keys',
    fields: [{ key: 'COHERE_API_KEY', label: 'Cohere API Key', type: 'password', placeholder: '...' }],
  },
  {
    id: 'together_ai',
    name: 'Together AI',
    category: 'AI & LLM',
    icon: '🧩',
    description: 'Hosted open-source models and inference APIs.',
    docsUrl: 'https://api.together.xyz/settings/api-keys',
    fields: [{ key: 'TOGETHER_API_KEY', label: 'Together API Key', type: 'password', placeholder: '...' }],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    category: 'AI & LLM',
    icon: '🧬',
    description: 'Run and integrate ML models through Replicate.',
    docsUrl: 'https://replicate.com/account/api-tokens',
    fields: [{ key: 'REPLICATE_API_TOKEN', label: 'Replicate API Token', type: 'password', placeholder: 'r8_...' }],
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    category: 'AI & LLM',
    icon: '🤗',
    description: 'Model hub, inference endpoints, and hosted APIs.',
    docsUrl: 'https://huggingface.co/settings/tokens',
    fields: [{ key: 'HUGGINGFACE_API_KEY', label: 'HuggingFace API Key', type: 'password', placeholder: 'hf_...' }],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    category: 'AI & LLM',
    icon: '🔎',
    description: 'Search-grounded reasoning and answer APIs.',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    fields: [{ key: 'PERPLEXITY_API_KEY', label: 'Perplexity API Key', type: 'password', placeholder: 'pplx-...' }],
  },
  {
    id: 'xai',
    name: 'xAI / Grok',
    category: 'AI & LLM',
    icon: '🚀',
    description: 'xAI API credentials for Grok models.',
    docsUrl: 'https://console.x.ai',
    fields: [{ key: 'XAI_API_KEY', label: 'xAI API Key', type: 'password', placeholder: 'xai-...' }],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'AI & LLM',
    icon: '🌊',
    description: 'DeepSeek inference credentials for coding and reasoning.',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    fields: [{ key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', type: 'password', placeholder: 'sk-...' }],
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    category: 'Vector Database',
    icon: '📌',
    description: 'Managed vector database for semantic search.',
    docsUrl: 'https://app.pinecone.io',
    fields: [
      { key: 'PINECONE_API_KEY', label: 'Pinecone API Key', type: 'password', placeholder: 'pcsk_...' },
      { key: 'PINECONE_ENVIRONMENT', label: 'Environment', type: 'text', placeholder: 'us-east-1-aws' },
    ],
  },
  {
    id: 'weaviate',
    name: 'Weaviate',
    category: 'Vector Database',
    icon: '🕸️',
    description: 'Open-source vector search with optional API key auth.',
    docsUrl: 'https://console.weaviate.cloud',
    fields: [
      { key: 'WEAVIATE_URL', label: 'Weaviate URL', type: 'url', placeholder: 'https://cluster.weaviate.network' },
      { key: 'WEAVIATE_API_KEY', label: 'API Key', type: 'password', placeholder: '...', required: false },
    ],
  },
  {
    id: 'qdrant',
    name: 'Qdrant',
    category: 'Vector Database',
    icon: '🎯',
    description: 'Vector store for embeddings and retrieval.',
    docsUrl: 'https://cloud.qdrant.io',
    fields: [
      { key: 'QDRANT_URL', label: 'Qdrant URL', type: 'url', placeholder: 'https://...' },
      { key: 'QDRANT_API_KEY', label: 'API Key', type: 'password', placeholder: '...', required: false },
    ],
  },
  {
    id: 'chroma',
    name: 'ChromaDB',
    category: 'Vector Database',
    icon: '🫧',
    description: 'Simple vector store for retrieval workflows.',
    docsUrl: 'https://docs.trychroma.com',
    fields: [{ key: 'CHROMA_URL', label: 'Chroma URL', type: 'url', placeholder: 'http://localhost:8000' }],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'Vector Database',
    icon: '▲',
    description: 'Postgres platform with vector support and edge APIs.',
    docsUrl: 'https://supabase.com/dashboard/account/tokens',
    fields: [
      { key: 'SUPABASE_URL', label: 'Supabase URL', type: 'url', placeholder: 'https://project.supabase.co' },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Service Role Key', type: 'password', placeholder: 'eyJ...' },
    ],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'Database',
    icon: '🐘',
    description: 'Connection string for Postgres-backed tools.',
    docsUrl: 'https://www.postgresql.org/docs/',
    fields: [{ key: 'POSTGRES_URL', label: 'Postgres URL', type: 'url', placeholder: 'postgresql://user:pass@host:5432/db' }],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    category: 'Database',
    icon: '🐬',
    description: 'Connection string for MySQL databases.',
    docsUrl: 'https://dev.mysql.com/doc/',
    fields: [{ key: 'MYSQL_URL', label: 'MySQL URL', type: 'url', placeholder: 'mysql://user:pass@host:3306/db' }],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    category: 'Database',
    icon: '🍃',
    description: 'MongoDB connection string for document workflows.',
    docsUrl: 'https://www.mongodb.com/docs/',
    fields: [{ key: 'MONGODB_URL', label: 'MongoDB URL', type: 'url', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/db' }],
  },
  {
    id: 'redis',
    name: 'Redis',
    category: 'Database',
    icon: '🟥',
    description: 'Redis connection string for cache and queues.',
    docsUrl: 'https://redis.io/docs/latest/',
    fields: [{ key: 'REDIS_URL', label: 'Redis URL', type: 'url', placeholder: 'redis://localhost:6379' }],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communication',
    icon: '💬',
    description: 'Bot and signing credentials for Slack automation.',
    docsUrl: 'https://api.slack.com/apps',
    fields: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
      { key: 'SLACK_SIGNING_SECRET', label: 'Signing Secret', type: 'password', placeholder: '...' },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'Communication',
    icon: '🎮',
    description: 'Bot token for Discord notifications and bots.',
    docsUrl: 'https://discord.com/developers/applications',
    fields: [{ key: 'DISCORD_BOT_TOKEN', label: 'Discord Bot Token', type: 'password', placeholder: '...' }],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    category: 'Communication',
    icon: '📨',
    description: 'Transactional email delivery credentials.',
    docsUrl: 'https://app.sendgrid.com/settings/api_keys',
    fields: [{ key: 'SENDGRID_API_KEY', label: 'SendGrid API Key', type: 'password', placeholder: 'SG....' }],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'Communication',
    icon: '📞',
    description: 'SMS, voice, and messaging credentials.',
    docsUrl: 'https://console.twilio.com',
    fields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', type: 'text', placeholder: 'AC...' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', type: 'password', placeholder: '...' },
    ],
  },
  {
    id: 'smtp',
    name: 'SMTP Email',
    category: 'Communication',
    icon: '✉️',
    description: 'SMTP credentials for outbound email nodes.',
    docsUrl: 'https://nodemailer.com/smtp/',
    fields: [
      { key: 'SMTP_HOST', label: 'Host', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'SMTP_PORT', label: 'Port', type: 'text', placeholder: '587' },
      { key: 'SMTP_USER', label: 'Username', type: 'text', placeholder: 'user@example.com' },
      { key: 'SMTP_PASSWORD', label: 'Password', type: 'password', placeholder: '...' },
    ],
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    category: 'Communication',
    icon: '📮',
    description: 'Mailgun API credentials for transactional email.',
    docsUrl: 'https://app.mailgun.com/app/account/security/api_keys',
    fields: [
      { key: 'MAILGUN_DOMAIN', label: 'Domain', type: 'text', placeholder: 'mg.example.com' },
      { key: 'MAILGUN_API_KEY', label: 'API Key', type: 'password', placeholder: 'key-...' },
      { key: 'MAILGUN_API_BASE_URL', label: 'API Base URL', type: 'url', placeholder: 'https://api.mailgun.net', required: false },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'Communication',
    icon: '📨',
    description: 'Telegram bot token and chat configuration.',
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    fields: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...' },
      { key: 'TELEGRAM_CHAT_ID', label: 'Chat ID', type: 'text', placeholder: '-1001234567890', required: false },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud',
    category: 'Communication',
    icon: '🟢',
    description: 'Meta WhatsApp Cloud API credentials.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      { key: 'WHATSAPP_ACCESS_TOKEN', label: 'Access Token', type: 'password', placeholder: 'EAA...' },
      { key: 'WHATSAPP_PHONE_NUMBER_ID', label: 'Phone Number ID', type: 'text', placeholder: '123456789012345', required: false },
    ],
  },
  {
    id: 'aws',
    name: 'AWS',
    category: 'Cloud',
    icon: '☁️',
    description: 'Access keys for AWS services and infrastructure.',
    docsUrl: 'https://console.aws.amazon.com/iam/',
    fields: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', type: 'password', placeholder: '...' },
      { key: 'AWS_REGION', label: 'Region', type: 'text', placeholder: 'us-east-1', helpText: 'Default: us-east-1' },
    ],
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    category: 'Cloud',
    icon: '🌐',
    description: 'Project and service account credentials for GCP.',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'GCP_PROJECT_ID', label: 'Project ID', type: 'text', placeholder: 'my-project' },
      {
        key: 'GCP_SERVICE_ACCOUNT_JSON',
        label: 'Service Account JSON',
        type: 'password',
        placeholder: '{"type":"service_account",...}',
        helpText: 'Paste the JSON key.',
      },
    ],
  },
  {
    id: 'azure',
    name: 'Azure',
    category: 'Cloud',
    icon: '🔷',
    description: 'Service principal credentials for Azure workloads.',
    docsUrl: 'https://portal.azure.com',
    fields: [
      { key: 'AZURE_SUBSCRIPTION_ID', label: 'Subscription ID', type: 'text', placeholder: '...' },
      { key: 'AZURE_CLIENT_ID', label: 'Client ID', type: 'text', placeholder: '...' },
      { key: 'AZURE_CLIENT_SECRET', label: 'Client Secret', type: 'password', placeholder: '...' },
      { key: 'AZURE_TENANT_ID', label: 'Tenant ID', type: 'text', placeholder: '...' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Developer Tools',
    icon: '🐙',
    description: 'PAT for GitHub API access and repository automation.',
    docsUrl: 'https://github.com/settings/tokens',
    fields: [{ key: 'GITHUB_TOKEN', label: 'GitHub Token', type: 'password', placeholder: 'ghp_...' }],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    category: 'Developer Tools',
    icon: '🦊',
    description: 'GitLab API credentials and self-hosted URL support.',
    docsUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    fields: [
      { key: 'GITLAB_TOKEN', label: 'GitLab Token', type: 'password', placeholder: 'glpat-...' },
      { key: 'GITLAB_URL', label: 'GitLab URL', type: 'url', placeholder: 'https://gitlab.com', required: false },
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    category: 'Developer Tools',
    icon: '📋',
    description: 'Connect Jira cloud projects and automation.',
    docsUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    fields: [
      { key: 'JIRA_URL', label: 'Jira URL', type: 'url', placeholder: 'https://your-team.atlassian.net' },
      { key: 'JIRA_EMAIL', label: 'Jira Email', type: 'text', placeholder: 'you@example.com' },
      { key: 'JIRA_API_TOKEN', label: 'API Token', type: 'password', placeholder: '...' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Developer Tools',
    icon: '📝',
    description: 'Internal integration token for Notion content.',
    docsUrl: 'https://www.notion.so/my-integrations',
    fields: [{ key: 'NOTION_API_KEY', label: 'Notion API Key', type: 'password', placeholder: 'secret_...' }],
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'Developer Tools',
    icon: '📐',
    description: 'Linear API access for issue-driven automation.',
    docsUrl: 'https://linear.app/settings/api',
    fields: [{ key: 'LINEAR_API_KEY', label: 'Linear API Key', type: 'password', placeholder: 'lin_api_...' }],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payment',
    icon: '💳',
    description: 'Billing, payments, and webhook credentials.',
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    fields: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret Key', type: 'password', placeholder: 'sk_live_...' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook Secret', type: 'password', placeholder: 'whsec_...', required: false },
    ],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'Payment',
    icon: '💰',
    description: 'Client credentials for PayPal Orders and Capture APIs.',
    docsUrl: 'https://developer.paypal.com/api/rest/',
    fields: [
      { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', type: 'text', placeholder: 'Abc123...' },
      { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret', type: 'password', placeholder: '...' },
      { key: 'PAYPAL_ACCESS_TOKEN', label: 'Access Token', type: 'password', placeholder: '...', required: false },
    ],
  },
  {
    id: 'square',
    name: 'Square',
    category: 'Payment',
    icon: '◼️',
    description: 'Square access token for payments and customers.',
    docsUrl: 'https://developer.squareup.com/apps',
    fields: [
      { key: 'SQUARE_ACCESS_TOKEN', label: 'Access Token', type: 'password', placeholder: 'sq0atp-...' },
      { key: 'SQUARE_VERSION', label: 'Square Version', type: 'text', placeholder: '2024-01-18', required: false },
    ],
  },
  {
    id: 'plaid',
    name: 'Plaid',
    category: 'Payment',
    icon: '🏦',
    description: 'Plaid client credentials for banking integrations.',
    docsUrl: 'https://dashboard.plaid.com/team/keys',
    fields: [
      { key: 'PLAID_CLIENT_ID', label: 'Client ID', type: 'text', placeholder: '...' },
      { key: 'PLAID_SECRET', label: 'Secret', type: 'password', placeholder: '...' },
      { key: 'PLAID_ACCESS_TOKEN', label: 'Access Token', type: 'password', placeholder: '...', required: false },
    ],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'Payment',
    icon: '📒',
    description: 'QuickBooks Online API access token and realm details.',
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/get-started',
    fields: [
      { key: 'QUICKBOOKS_ACCESS_TOKEN', label: 'Access Token', type: 'password', placeholder: '...' },
      { key: 'QUICKBOOKS_REALM_ID', label: 'Realm ID', type: 'text', placeholder: '12314567890' },
    ],
  },
  {
    id: 'serpapi',
    name: 'SerpAPI',
    category: 'Search',
    icon: '🔍',
    description: 'Search engine results API for web data workflows.',
    docsUrl: 'https://serpapi.com/manage-api-key',
    fields: [{ key: 'SERPAPI_API_KEY', label: 'SerpAPI API Key', type: 'password', placeholder: '...' }],
  },
  {
    id: 'tavily',
    name: 'Tavily',
    category: 'Search',
    icon: '🧭',
    description: 'Search API built for AI agents and research.',
    docsUrl: 'https://app.tavily.com/home',
    fields: [{ key: 'TAVILY_API_KEY', label: 'Tavily API Key', type: 'password', placeholder: 'tvly-...' }],
  },
  {
    id: 'brave_search',
    name: 'Brave Search',
    category: 'Search',
    icon: '🦁',
    description: 'Independent search API for web-enabled agents.',
    docsUrl: 'https://api.search.brave.com/app/keys',
    fields: [{ key: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search API Key', type: 'password', placeholder: 'BSA...' }],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    category: 'Productivity',
    icon: '🗂️',
    description: 'Airtable API credentials for records and automation.',
    docsUrl: 'https://airtable.com/create/tokens',
    fields: [
      { key: 'AIRTABLE_API_KEY', label: 'Airtable API Key', type: 'password', placeholder: 'pat...' },
      { key: 'AIRTABLE_BASE_ID', label: 'Base ID', type: 'text', placeholder: 'app...' },
    ],
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    category: 'Productivity',
    icon: '📗',
    description: 'Service account credentials for Sheets automation.',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      {
        key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
        label: 'Service Account JSON',
        type: 'password',
        placeholder: '{"type":"service_account",...}',
      },
    ],
  },
];

export const credentialProviderMap: Record<string, CredentialProvider> = Object.fromEntries(
  credentialProviders.map((provider) => [provider.id, provider])
);

export const pandastackProvider = credentialProviderMap.pandastack;
