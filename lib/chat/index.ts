export type WorkflowType = 'automation' | 'chat' | 'agent';
export type ChatProvider = 'openai' | 'anthropic';
export type ChatTheme = 'dark' | 'midnight' | 'aurora';

export type ChatMessage = {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export type ChatSettings = {
  title?: string;
  welcomeMessage?: string;
  systemPrompt?: string;
  theme?: ChatTheme;
  placeholder?: string;
  model?: string;
  provider?: ChatProvider;
  temperature?: number;
};

export type ResolvedChatSettings = Required<
  Pick<ChatSettings, 'title' | 'welcomeMessage' | 'systemPrompt' | 'theme' | 'placeholder' | 'model' | 'provider' | 'temperature'>
>;

export const defaultChatSettings: ResolvedChatSettings = {
  title: 'AI Assistant',
  welcomeMessage: '👋 Welcome! How can I help you today?',
  systemPrompt: 'You are a helpful, polished AI assistant embedded inside an AI workflow builder. Be concise, warm, and actionable.',
  theme: 'dark',
  placeholder: 'Type your message...',
  model: 'gpt-4o',
  provider: 'openai',
  temperature: 0.7,
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function generatePublicChatId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function generateSessionTitle(message: string) {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

export function resolveChatSettings(raw: unknown, fallbackTitle?: string): ResolvedChatSettings {
  const settings = raw && typeof raw === 'object' ? raw as ChatSettings : {};
  const title = settings.title?.trim() || fallbackTitle?.trim() || defaultChatSettings.title;
  const provider = settings.provider === 'anthropic' ? 'anthropic' : defaultChatSettings.provider;
  const temperature = typeof settings.temperature === 'number'
    ? Math.max(0, Math.min(2, settings.temperature))
    : defaultChatSettings.temperature;

  return {
    title,
    welcomeMessage: settings.welcomeMessage?.trim() || defaultChatSettings.welcomeMessage,
    systemPrompt: settings.systemPrompt?.trim() || defaultChatSettings.systemPrompt,
    theme: settings.theme || defaultChatSettings.theme,
    placeholder: settings.placeholder?.trim() || defaultChatSettings.placeholder,
    model: settings.model?.trim() || defaultChatSettings.model,
    provider,
    temperature,
  };
}

export function sanitizeChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as ChatMessage;
    if (!candidate.content || typeof candidate.content !== 'string') {
      return [];
    }

    if (!['system', 'user', 'assistant'].includes(candidate.role)) {
      return [];
    }

    return [{
      id: candidate.id,
      role: candidate.role,
      content: candidate.content,
      timestamp: candidate.timestamp,
      metadata: candidate.metadata,
    }];
  });
}

export function buildMockChatResponse(message: string, settings: Pick<ResolvedChatSettings, 'title'>) {
  return [
    `✨ Demo mode for ${settings.title}.`,
    `I received: “${message.trim()}”.`,
    'Add an OPENAI_API_KEY or ANTHROPIC_API_KEY to stream live model responses.',
    'This polished embedded chat is fully functional for previews, sharing, and demos.',
  ].join(' ');
}
