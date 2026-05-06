const FALLBACK_CHAINS: Record<string, string[]> = {
  'gpt-4o': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'gpt-4': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'gpt-4-turbo': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'claude-3-5-sonnet-20241022': ['claude-3-haiku-20240307'],
  'claude-3-opus-20240229': ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  'gemini-1.5-pro': ['gemini-1.5-flash'],
};

export function getFallbackModels(model: string): string[] {
  return FALLBACK_CHAINS[model] ?? [];
}

export interface ModelFallbackOptions {
  primaryModel: string;
  fallbackModels?: string[];
  onFallback?: (from: string, to: string, error: Error) => void;
}

export async function withModelFallback<T>(
  fn: (model: string) => Promise<T>,
  options: ModelFallbackOptions
): Promise<T> {
  const models = [
    options.primaryModel,
    ...(options.fallbackModels ?? getFallbackModels(options.primaryModel)),
  ].filter((model, index, arr) => Boolean(model) && arr.indexOf(model) === index);

  let lastError: Error | undefined;
  for (const [index, model] of models.entries()) {
    try {
      return await fn(model);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const nextModel = models[index + 1];
      if (nextModel) {
        options.onFallback?.(model, nextModel, lastError);
        console.warn(`[ModelFallback] ${model} failed, trying ${nextModel}: ${lastError.message}`);
      }
    }
  }

  throw lastError ?? new Error('Model fallback failed');
}
