export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, backoffMs: number) => void;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMs: 1000,
  maxBackoffMs: 30000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {},
  label = 'operation'
): Promise<T> {
  const p = { ...DEFAULT_RETRY_POLICY, ...policy };
  let lastError: Error | undefined;
  let backoff = p.backoffMs;

  for (let attempt = 0; attempt <= p.maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === p.maxRetries) {
        break;
      }

      if (p.retryableErrors && p.retryableErrors.length > 0) {
        const message = lastError.message.toLowerCase();
        const isRetryable = p.retryableErrors.some((pattern) =>
          message.includes(pattern.toLowerCase())
        );
        if (!isRetryable) {
          break;
        }
      }

      p.onRetry?.(attempt + 1, lastError, backoff);
      console.warn(
        `[Retry] ${label} failed (attempt ${attempt + 1}/${p.maxRetries}): ${lastError.message}. Retrying in ${backoff}ms`
      );

      await sleep(backoff);
      backoff = Math.min(backoff * 2, p.maxBackoffMs);
    }
  }

  throw lastError ?? new Error(`${label} failed`);
}
