import { Cron } from 'croner';
import { COMMON_TIMEZONES } from '@/lib/scheduling/cron';

export const DEFAULT_AGENT_CRON = '0 * * * *';
export const DEFAULT_AGENT_TIMEZONE = 'UTC';

export type AgentScheduleConfig = {
  enabled: boolean;
  cron: string;
  timezone: string;
};

export const AGENT_CRON_PRESETS = [
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
  { label: 'Every weekday', value: '0 9 * * 1-5' },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getAgentTimezoneOptions(preferredTimezone?: string) {
  return Array.from(new Set([preferredTimezone, ...COMMON_TIMEZONES].filter((value): value is string => Boolean(value))));
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeAgentSchedule(schedule: Partial<AgentScheduleConfig> | null | undefined): AgentScheduleConfig {
  return {
    enabled: Boolean(schedule?.enabled),
    cron: typeof schedule?.cron === 'string' && schedule.cron.trim() ? schedule.cron.trim() : DEFAULT_AGENT_CRON,
    timezone:
      typeof schedule?.timezone === 'string' && schedule.timezone.trim() && isValidTimezone(schedule.timezone.trim())
        ? schedule.timezone.trim()
        : DEFAULT_AGENT_TIMEZONE,
  };
}

export function getAgentSchedule(config: unknown): AgentScheduleConfig {
  if (!isRecord(config) || !isRecord(config.schedule)) {
    return normalizeAgentSchedule({ enabled: false });
  }

  return normalizeAgentSchedule(config.schedule as Partial<AgentScheduleConfig>);
}

export function validateAgentSchedule(schedule: Partial<AgentScheduleConfig>) {
  const normalized = normalizeAgentSchedule(schedule);

  if (!schedule.cron || !schedule.cron.trim()) {
    return { valid: false as const, error: 'Cron expression is required' };
  }

  if (schedule.cron.trim().split(/\s+/).length !== 5) {
    return { valid: false as const, error: 'Cron expression must use 5 fields' };
  }

  if (!isValidTimezone(normalized.timezone)) {
    return { valid: false as const, error: 'Timezone is invalid' };
  }

  try {
    new Cron(normalized.cron, { timezone: normalized.timezone, mode: '5-part' });
    return { valid: true as const, schedule: normalized };
  } catch (error) {
    return {
      valid: false as const,
      error: error instanceof Error ? error.message : 'Invalid cron expression',
    };
  }
}

export function getNextCronRuns(cronExpression: string, timezone = DEFAULT_AGENT_TIMEZONE, count = 3) {
  const validation = validateAgentSchedule({ enabled: true, cron: cronExpression, timezone });
  if (!validation.valid) {
    return [] as Date[];
  }

  return new Cron(validation.schedule.cron, {
    timezone: validation.schedule.timezone,
    mode: '5-part',
  }).nextRuns(count);
}

export function isAgentScheduleDue(schedule: AgentScheduleConfig, referenceDate = new Date()) {
  const validation = validateAgentSchedule(schedule);
  if (!validation.valid || !validation.schedule.enabled) {
    return false;
  }

  const minute = new Date(referenceDate);
  minute.setSeconds(0, 0);

  return new Cron(validation.schedule.cron, {
    timezone: validation.schedule.timezone,
    mode: '5-part',
  }).match(minute);
}

export function mergeAgentScheduleIntoConfig(config: unknown, schedule: AgentScheduleConfig) {
  const baseConfig = isRecord(config) ? config : {};
  return {
    ...baseConfig,
    schedule,
  };
}

export function getMatchingCronPreset(cronExpression: string) {
  return AGENT_CRON_PRESETS.find((preset) => preset.value === cronExpression.trim()) ?? null;
}

export function serializeRuns(runs: Date[]) {
  return runs.map((run) => run.toISOString());
}
