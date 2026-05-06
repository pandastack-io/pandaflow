'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type NodeConfig = Record<string, any>;

interface RetryConfigProps {
  config: NodeConfig;
  onChange: (config: NodeConfig) => void;
}

const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  backoffMs: 1000,
  retryableErrors: [],
};

export function RetryConfig({ config, onChange }: RetryConfigProps) {
  const [open, setOpen] = useState(Boolean(config.retryPolicy));
  const retryPolicy = useMemo(
    () => ({ ...DEFAULT_RETRY_POLICY, ...(config.retryPolicy ?? {}) }),
    [config.retryPolicy]
  );

  const updateRetryPolicy = (partial: Record<string, any>) => {
    onChange({
      ...config,
      retryPolicy: {
        ...retryPolicy,
        ...partial,
      },
    });
  };

  const enabled = Boolean(config.retryPolicy);

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="h-auto p-0 text-sm font-medium" onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
          <Zap className="mr-1.5 h-4 w-4 text-amber-500" />
          Retry Policy
        </Button>
        <div className="flex items-center gap-2">
          <Label htmlFor="node-retry-enabled" className="text-xs text-muted-foreground">Enabled</Label>
          <Switch
            id="node-retry-enabled"
            checked={enabled}
            onCheckedChange={(checked) => {
              if (checked) {
                onChange({ ...config, retryPolicy });
                setOpen(true);
                return;
              }

              const nextConfig = { ...config };
              delete nextConfig.retryPolicy;
              onChange(nextConfig);
            }}
          />
        </div>
      </div>

      {open && enabled && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="node-max-retries" className="mb-1 block text-xs">Max retries</Label>
              <Input
                id="node-max-retries"
                type="number"
                min={0}
                max={10}
                value={retryPolicy.maxRetries}
                onChange={(event) => updateRetryPolicy({ maxRetries: Math.max(0, Math.min(10, Number(event.target.value) || 0)) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="node-backoff-ms" className="mb-1 block text-xs">Backoff (ms)</Label>
              <Input
                id="node-backoff-ms"
                type="number"
                min={100}
                max={60000}
                step={100}
                value={retryPolicy.backoffMs}
                onChange={(event) => updateRetryPolicy({ backoffMs: Math.max(100, Math.min(60000, Number(event.target.value) || 1000)) })}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="node-retry-errors" className="mb-1 block text-xs">Retry on error patterns</Label>
            <Input
              id="node-retry-errors"
              value={Array.isArray(retryPolicy.retryableErrors) ? retryPolicy.retryableErrors.join(', ') : ''}
              onChange={(event) =>
                updateRetryPolicy({
                  retryableErrors: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="timeout, rate limit, 503"
              className="h-8 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="node-fallback-model" className="mb-1 block text-xs">Fallback model</Label>
            <Input
              id="node-fallback-model"
              value={retryPolicy.fallbackModel || ''}
              onChange={(event) => updateRetryPolicy({ fallbackModel: event.target.value.trim() || undefined })}
              placeholder="gpt-4o-mini"
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
