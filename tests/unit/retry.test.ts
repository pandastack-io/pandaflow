import { describe, expect, it, vi } from 'vitest';
import { withModelFallback } from '@/lib/execution/model-fallback';
import { withRetry } from '@/lib/execution/retry';

describe('withRetry', () => {
  it('retries until the operation succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, { maxRetries: 2, backoffMs: 1, maxBackoffMs: 2 }, 'test op')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops when the error is not retryable', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('fatal'));

    await expect(
      withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 2, retryableErrors: ['timeout'] }, 'test op')
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withModelFallback', () => {
  it('falls back to the next model after a failure', async () => {
    const fn = vi.fn(async (model: string) => {
      if (model === 'gpt-4o') {
        throw new Error('provider unavailable');
      }
      return model;
    });

    await expect(withModelFallback(fn, { primaryModel: 'gpt-4o' })).resolves.toBe('gpt-4o-mini');
    expect(fn).toHaveBeenNthCalledWith(1, 'gpt-4o');
    expect(fn).toHaveBeenNthCalledWith(2, 'gpt-4o-mini');
  });
});
