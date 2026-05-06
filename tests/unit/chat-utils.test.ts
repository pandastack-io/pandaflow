import { describe, expect, it } from 'vitest';
import {
  buildMockChatResponse,
  generatePublicChatId,
  generateSessionTitle,
  isUuid,
  resolveChatSettings,
  sanitizeChatMessages,
} from '@/lib/chat';

describe('chat utils', () => {
  it('resolves default chat settings with fallback title', () => {
    const settings = resolveChatSettings({}, 'Support Copilot');

    expect(settings.title).toBe('Support Copilot');
    expect(settings.provider).toBe('openai');
    expect(settings.temperature).toBe(0.7);
  });

  it('sanitizes malformed chat messages', () => {
    const messages = sanitizeChatMessages([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'invalid', content: 'nope' },
      { role: 'user' },
      'bad',
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('hello');
  });

  it('builds short, shareable identifiers', () => {
    const id = generatePublicChatId();

    expect(id).toHaveLength(12);
    expect(isUuid(id)).toBe(false);
  });

  it('creates sensible session titles and mock responses', () => {
    expect(generateSessionTitle('   How do I upgrade my plan?   ')).toBe('How do I upgrade my plan?');
    expect(buildMockChatResponse('Hello world', { title: 'Demo Bot' })).toContain('Demo Bot');
  });

  it('detects valid UUIDs', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
