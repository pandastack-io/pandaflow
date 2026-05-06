export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

const WEEKDAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type SchedulePreset = 'every-5-min' | 'hourly' | 'daily-midnight' | 'weekly-monday' | 'monthly' | 'custom';
export type FrequencyUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export interface ScheduleBuilderConfig {
  preset?: SchedulePreset;
  frequencyValue?: number;
  frequencyUnit?: FrequencyUnit;
  timeOfDay?: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
}

export function cronForPreset(preset: SchedulePreset): string {
  switch (preset) {
    case 'every-5-min':
      return '*/5 * * * *';
    case 'hourly':
      return '0 * * * *';
    case 'daily-midnight':
      return '0 0 * * *';
    case 'weekly-monday':
      return '0 0 * * 1';
    case 'monthly':
      return '0 0 1 * *';
    default:
      return '0 * * * *';
  }
}

function parseTimeOfDay(timeOfDay?: string) {
  const [hourRaw = '0', minuteRaw = '0'] = (timeOfDay ?? '00:00').split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  return {
    hour: Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 0,
    minute: Number.isFinite(minute) ? Math.min(Math.max(minute, 0), 59) : 0,
  };
}

export function buildCronExpression(config: ScheduleBuilderConfig): string {
  if (config.preset && config.preset !== 'custom') {
    return cronForPreset(config.preset);
  }

  const frequencyValue = Math.max(1, Number(config.frequencyValue ?? 1));
  const frequencyUnit = config.frequencyUnit ?? 'hours';
  const { hour, minute } = parseTimeOfDay(config.timeOfDay);
  const dayOfWeek = WEEKDAY_TO_CRON[(config.dayOfWeek ?? 'monday').toLowerCase()] ?? 1;

  switch (frequencyUnit) {
    case 'minutes':
      return `*/${frequencyValue} * * * *`;
    case 'hours':
      return `${minute} */${frequencyValue} * * *`;
    case 'days':
      return `${minute} ${hour} */${frequencyValue} * *`;
    case 'weeks':
      return `${minute} ${hour} * * ${dayOfWeek}`;
    default:
      return '0 * * * *';
  }
}

export function inferSchedulePreset(cronExpression?: string): SchedulePreset {
  switch ((cronExpression ?? '').trim()) {
    case '*/5 * * * *':
      return 'every-5-min';
    case '0 * * * *':
      return 'hourly';
    case '0 0 * * *':
      return 'daily-midnight';
    case '0 0 * * 1':
      return 'weekly-monday';
    case '0 0 1 * *':
      return 'monthly';
    default:
      return 'custom';
  }
}

function matches(value: number, field: string, min: number, max: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = Number.parseInt(field.slice(2), 10);
    return step > 0 && value % step === 0;
  }
  if (field.includes(',')) {
    return field.split(',').some((part) => matches(value, part.trim(), min, max));
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map((part) => Number.parseInt(part, 10));
    return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
  }
  const numeric = Number.parseInt(field, 10);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max && value === numeric;
}

export function getNextRunFromCron(cronExpression: string, fromDate = new Date()): Date | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = parts;
  const cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);

  for (let i = 0; i < 60 * 24 * 366; i += 1) {
    cursor.setMinutes(cursor.getMinutes() + 1);

    if (
      matches(cursor.getMinutes(), minuteField, 0, 59) &&
      matches(cursor.getHours(), hourField, 0, 23) &&
      matches(cursor.getDate(), dayField, 1, 31) &&
      matches(cursor.getMonth() + 1, monthField, 1, 12) &&
      matches(cursor.getDay(), weekdayField, 0, 6)
    ) {
      return new Date(cursor.getTime());
    }
  }

  return null;
}
