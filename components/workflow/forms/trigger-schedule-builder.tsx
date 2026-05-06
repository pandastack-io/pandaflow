'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import cronstrue from 'cronstrue';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { buildCronExpression, COMMON_TIMEZONES, cronForPreset, getNextRunFromCron, inferSchedulePreset, type SchedulePreset } from '@/lib/scheduling/cron';
import type { NodeFormProps } from './types';

const presetOptions: Array<{ label: string; value: SchedulePreset }> = [
  { label: 'Every 5 min', value: 'every-5-min' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Daily at midnight', value: 'daily-midnight' },
  { label: 'Weekly on Monday', value: 'weekly-monday' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Custom', value: 'custom' },
];

const dayOptions = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

type ScheduleRecord = {
  id: string;
  cronExpression: string;
  timezone: string | null;
  isActive: boolean | null;
  nextRunAt?: string | null;
};

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function PresetButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm transition ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}
    >
      {label}
    </button>
  );
}

export function TriggerScheduleBuilder({ config, onChange }: NodeFormProps) {
  const params = useParams<{ id: string }>();
  const workflowId = String(params.id ?? '');
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<ScheduleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const preset = (config.schedulePreset as SchedulePreset | undefined) ?? inferSchedulePreset(config.cron);
  const frequencyValue = Number(config.frequencyValue ?? 1);
  const frequencyUnit = config.frequencyUnit ?? 'hours';
  const timeOfDay = config.timeOfDay ?? '00:00';
  const dayOfWeek = config.dayOfWeek ?? 'monday';
  const timezone = config.timezone || 'UTC';
  const enabled = config.enabled !== false;

  const generatedCron = useMemo(() => {
    if (preset !== 'custom') {
      return cronForPreset(preset);
    }

    return buildCronExpression({
      preset,
      frequencyValue,
      frequencyUnit,
      timeOfDay,
      dayOfWeek,
    });
  }, [dayOfWeek, frequencyUnit, frequencyValue, preset, timeOfDay]);

  const nextRunDate = useMemo(() => getNextRunFromCron(generatedCron), [generatedCron]);
  const cronDescription = useMemo(() => {
    try {
      return cronstrue.toString(generatedCron);
    } catch {
      return 'Invalid cron expression';
    }
  }, [generatedCron]);

  useEffect(() => {
    if (config.cron !== generatedCron) {
      updateConfig(config, onChange, 'cron', generatedCron);
    }
  }, [config, generatedCron, onChange]);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const response = await fetch(`/api/schedules?workflowId=${workflowId}`);
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error);
        }

        const existing = data.data?.[0] as ScheduleRecord | undefined;
        if (existing) {
          setSchedule(existing);
          onChange({
            ...config,
            scheduleId: existing.id,
            cron: existing.cronExpression,
            timezone: existing.timezone || 'UTC',
            enabled: existing.isActive !== false,
            schedulePreset: inferSchedulePreset(existing.cronExpression),
          });
        }
      } catch (error) {
        toast({
          title: 'Failed to load schedule',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const persistSchedule = async () => {
    setSaving(true);
    try {
      const payload = {
        workflowId,
        cronExpression: generatedCron,
        timezone,
        isActive: enabled,
      };

      const response = await fetch(schedule?.id ? `/api/schedules/${schedule.id}` : '/api/schedules', {
        method: schedule?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setSchedule(data.data);
      onChange({ ...config, scheduleId: data.data.id, cron: generatedCron, timezone, enabled });
      toast({ title: schedule?.id ? 'Schedule updated' : 'Schedule created', description: cronDescription });
    } catch (error) {
      toast({
        title: 'Failed to save schedule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updatePreset = (value: SchedulePreset) => {
    onChange({
      ...config,
      schedulePreset: value,
      cron: value === 'custom' ? generatedCron : cronForPreset(value),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Trigger payload</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Provides scheduledAt, cron, timezone, and scheduler metadata.</li>
          <li>Use the visual builder below to generate the cron expression.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          {presetOptions.map((option) => (
            <PresetButton key={option.value} label={option.label} active={preset === option.value} onClick={() => updatePreset(option.value)} />
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-[1fr_120px_1fr] items-end gap-2">
            <div>
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span>Every</span>
                <Input
                  id="schedule-frequency"
                  type="number"
                  min={1}
                  value={frequencyValue}
                  onChange={(event) => updateConfig(config, onChange, 'frequencyValue', Number(event.target.value) || 1)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="schedule-unit">Unit</Label>
              <Select value={frequencyUnit} onValueChange={(value) => updateConfig(config, onChange, 'frequencyUnit', value)}>
                <SelectTrigger id="schedule-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">minutes</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="days">days</SelectItem>
                  <SelectItem value="weeks">weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {frequencyUnit !== 'minutes' && (
              <div>
                <Label htmlFor="schedule-time">Time</Label>
                <Input id="schedule-time" type="time" value={timeOfDay} onChange={(event) => updateConfig(config, onChange, 'timeOfDay', event.target.value)} />
              </div>
            )}
          </div>

          {frequencyUnit === 'weeks' && (
            <div>
              <Label htmlFor="schedule-day">Day</Label>
              <Select value={dayOfWeek} onValueChange={(value) => updateConfig(config, onChange, 'dayOfWeek', value)}>
                <SelectTrigger id="schedule-day"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dayOptions.map((day) => (
                    <SelectItem key={day} value={day}>{day[0].toUpperCase() + day.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="schedule-timezone">Timezone</Label>
        <Select value={timezone} onValueChange={(value) => updateConfig(config, onChange, 'timezone', value)}>
          <SelectTrigger id="schedule-timezone"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
        <div><span className="font-medium">Cron:</span> <code className="rounded bg-background px-1.5 py-0.5 text-xs">{generatedCron}</code></div>
        <div className="mt-2 text-muted-foreground">{cronDescription}</div>
        <div className="mt-2 text-muted-foreground">
          Next run:{' '}
          {nextRunDate ? `${formatDistanceToNow(nextRunDate, { addSuffix: true })}` : 'Unable to calculate'}
        </div>
        {schedule?.nextRunAt && (
          <div className="mt-1 text-xs text-muted-foreground">Server next run: {new Date(schedule.nextRunAt).toLocaleString()}</div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <div className="text-sm font-medium">Enable schedule</div>
          <div className="text-xs text-muted-foreground">Pause the schedule without deleting it.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={(checked) => updateConfig(config, onChange, 'enabled', checked)} />
      </div>

      <Button type="button" onClick={() => void persistSchedule()} disabled={saving || loading} className="w-full">
        {saving ? 'Saving…' : schedule?.id ? 'Update Schedule' : 'Create Schedule'}
      </Button>
    </div>
  );
}
