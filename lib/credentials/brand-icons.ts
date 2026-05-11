import {
  SiAirtable,
  SiAnthropic,
  SiApachecassandra,
  SiBitbucket,
  SiBrave,
  SiCloudflare,
  SiDiscord,
  SiElasticsearch,
  SiFirebase,
  SiGithub,
  SiGitlab,
  SiGoogleanalytics,
  SiGooglecloud,
  SiGooglegemini,
  SiGoogledrive,
  SiGooglesheets,
  SiHuggingface,
  SiJira,
  SiLinear,
  SiMailgun,
  SiMeta,
  SiMistralai,
  SiMixpanel,
  SiMongodb,
  SiMysql,
  SiNetlify,
  SiNotion,
  SiOllama,
  SiOpenai,
  SiPaypal,
  SiPerplexity,
  SiPostgresql,
  SiPosthog,
  SiRailway,
  SiRedis,
  SiResend,
  SiSendgrid,
  SiShopify,
  SiSlack,
  SiStripe,
  SiSupabase,
  SiTelegram,
  SiTwilio,
  SiVercel,
  SiWhatsapp,
  SiZapier,
} from 'react-icons/si';
import { FaAws, FaMicrosoft, FaPaypal } from 'react-icons/fa6';
import type { IconType } from 'react-icons';
import type { SimpleIcon } from 'simple-icons';
import type { ExtendedSimpleIcon } from '@/components/ui/brand-icon';

// PandaStack/PandaFlow logo — SVG path extracted from deploy-button.svg
const siPandaStack: ExtendedSimpleIcon = {
  title: 'PandaStack',
  slug: 'pandastack',
  hex: '863bff',
  source: 'https://pandastack.io',
  svg: '',
  path: 'M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z',
  viewBox: '0 0 48 46',
};

/** Brand hex colors for react-icons (no # prefix) */
export const providerHex: Record<string, string> = {
  openai: '412991',
  anthropic: 'D4A27F',
  google_ai: '4285F4',
  mistral: 'FF7000',
  huggingface: 'FFD21E',
  perplexity: '1FB8CD',
  ollama: '000000',
  meta: '0467DF',
  postgres: '4169E1',
  mysql: '4479A1',
  mongodb: '47A248',
  redis: 'DC382D',
  elasticsearch: '005571',
  cassandra: '1287B1',
  firebase: 'DD2C00',
  supabase: '3ECF8E',
  aws: 'FF9900',
  gcp: '4285F4',
  azure: '0078D4',
  cloudflare: 'F38020',
  vercel: '000000',
  netlify: '00C7B7',
  railway: '0B0D0E',
  slack: '4A154B',
  discord: '5865F2',
  telegram: '26A5E4',
  whatsapp: '25D366',
  twilio: 'F22F46',
  sendgrid: '1A82E2',
  mailgun: 'F06B66',
  resend: '000000',
  github: '181717',
  gitlab: 'FC6D26',
  bitbucket: '0052CC',
  jira: '0052CC',
  linear: '5E6AD2',
  notion: '000000',
  airtable: '18BFFF',
  google_sheets: '34A853',
  stripe: '635BFF',
  paypal: '00457C',
  google_analytics: 'E37400',
  mixpanel: '7856FF',
  posthog: '000000',
  shopify: '7AB55C',
  zapier: 'FF4F00',
  brave_search: 'FB542B',
  pandastack: '863bff',
};

/** Map of provider key → react-icons component OR ExtendedSimpleIcon (for custom SVG paths) */
export const providerIcons: Record<string, IconType | ExtendedSimpleIcon | null> = {
  // AI providers
  openai: SiOpenai,
  anthropic: SiAnthropic,
  google_ai: SiGooglegemini,
  mistral: SiMistralai,
  huggingface: SiHuggingface,
  perplexity: SiPerplexity,
  ollama: SiOllama,
  meta: SiMeta,
  groq: null,       // not yet in any icon library
  cohere: null,
  pinecone: null,
  xai: null,
  openrouter: null,

  // Databases / storage
  postgres: SiPostgresql,
  mysql: SiMysql,
  mongodb: SiMongodb,
  redis: SiRedis,
  elasticsearch: SiElasticsearch,
  cassandra: SiApachecassandra,
  firebase: SiFirebase,
  supabase: SiSupabase,
  dynamodb: FaAws,
  firestore: SiFirebase,

  // Cloud providers
  aws: FaAws,
  gcp: SiGooglecloud,
  azure: FaMicrosoft,
  cloudflare: SiCloudflare,
  vercel: SiVercel,
  netlify: SiNetlify,
  railway: SiRailway,

  // Communication
  slack: SiSlack,
  discord: SiDiscord,
  telegram: SiTelegram,
  whatsapp: SiWhatsapp,
  twilio: SiTwilio,
  sendgrid: SiSendgrid,
  mailgun: SiMailgun,
  resend: SiResend,

  // Dev / SCM
  github: SiGithub,
  gitlab: SiGitlab,
  bitbucket: SiBitbucket,

  // Project management
  jira: SiJira,
  linear: SiLinear,
  notion: SiNotion,
  airtable: SiAirtable,
  google_sheets: SiGooglesheets,
  google_drive: SiGoogledrive,

  // Payment
  stripe: SiStripe,
  paypal: SiPaypal,

  // Analytics
  google_analytics: SiGoogleanalytics,
  mixpanel: SiMixpanel,
  posthog: SiPosthog,

  // Other integrations
  shopify: SiShopify,
  zapier: SiZapier,
  brave_search: SiBrave,

  // PandaStack
  pandastack: siPandaStack,
};

const providerAliases: Record<string, string> = {
  google: 'google_ai',
  gemini: 'google_ai',
  googlegemini: 'google_ai',
  mistralai: 'mistral',
  postgresql: 'postgres',
  pg: 'postgres',
  aws_s3: 'aws',
  aws_lambda: 'aws',
  aws_sqs: 'aws',
  aws_sns: 'aws',
  aws_dynamodb: 'dynamodb',
  gcp_storage: 'gcp',
  gcp_pubsub: 'gcp',
  azure_blob: 'azure',
  azure_queue: 'azure',
  cloudflare_kv: 'cloudflare',
  cloudflare_r2: 'cloudflare',
  cloudflare_d1: 'cloudflare',
  vercel_kv: 'vercel',
  vercel_blob: 'vercel',
  google_sheets: 'google_sheets',
  pandastack_project: 'pandastack',
  pandastack_cronjob: 'pandastack',
  pandastack_database: 'pandastack',
  pandastack_managed_app: 'pandastack',
};

export function resolveBrandIconKey(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = providerAliases[candidate] ?? candidate;
    if (normalized in providerIcons) {
      return normalized;
    }
  }
  return null;
}

export function getProviderIcon(
  ...candidates: Array<string | null | undefined>
): IconType | ExtendedSimpleIcon | SimpleIcon | null {
  const key = resolveBrandIconKey(...candidates);
  return key ? (providerIcons[key] ?? null) : null;
}

export function getProviderHex(...candidates: Array<string | null | undefined>): string | undefined {
  const key = resolveBrandIconKey(...candidates);
  return key ? providerHex[key] : undefined;
}


