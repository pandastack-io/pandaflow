'use client';

import { useMemo } from 'react';
import cronstrue from 'cronstrue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AGENT_CRON_PRESETS, getMatchingCronPreset, getNextCronRuns } from '@/lib/agents/schedule';
import { cn } from '@/lib/utils';

type CronEditorProps = {
  value: string;
  timezone: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

function formatRun(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

export function CronEditor({ value, timezone, onChange, disabled = false, className }: CronEditorProps) {
  const normalizedValue = value.trim();
  const activePreset = useMemo(() => getMatchingCronPreset(normalizedValue), [normalizedValue]);
  const description = useMemo(() => {
    if (!normalizedValue) {
      return 'Enter a 5-field cron expression.';
    }

    try {
      return cronstrue.toString(normalizedValue, { throwExceptionOnParseError: true });
    } catch {
      return 'Invalid cron expression';
    }
  }, [normalizedValue]);
  const nextRuns = useMemo(() => getNextCronRuns(normalizedValue, timezone, 3), [normalizedValue, timezone]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label htmlFor="agent-cron-expression">Cron expression</Label>
        <Input
          id="agent-cron-expression"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="*/15 * * * *"
          disabled={disabled}
          spellCheck={false}
        />
      </div>

      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="flex flex-wrap gap-2">
          {AGENT_CRON_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              size="sm"
              variant={activePreset?.value === preset.value ? 'default' : 'outline'}
              onClick={() => onChange(preset.value)}
              disabled={disabled}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-foreground">
            {activePreset ? activePreset.label : 'Custom'}
          </Badge>
          <span className={description === 'Invalid cron expression' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}>{description}</span>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Next 3 runs</div>
          {nextRuns.length > 0 ? (
            <ul className="space-y-2 text-foreground">
              {nextRuns.map((run, index) => (
                <li key={`${run.toISOString()}-${index}`} className="rounded-md border border-border bg-muted/50 px-3 py-2">
                  {formatRun(run, timezone)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted-foreground">Unable to calculate upcoming runs.</div>
          )}
        </div>
      </div>
    </div>
  );
}
