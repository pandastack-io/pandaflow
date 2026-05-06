import { describe, expect, it } from 'vitest';
import {
  getAgentSchedule,
  getMatchingCronPreset,
  getNextCronRuns,
  isAgentScheduleDue,
  mergeAgentScheduleIntoConfig,
  validateAgentSchedule,
} from '@/lib/agents/schedule';

describe('agent schedule helpers', () => {
  it('returns disabled defaults when config has no schedule', () => {
    expect(getAgentSchedule({})).toEqual({
      enabled: false,
      cron: '0 * * * *',
      timezone: 'UTC',
    });
  });

  it('validates five-field cron expressions', () => {
    expect(validateAgentSchedule({ enabled: true, cron: '*/15 * * * *', timezone: 'UTC' }).valid).toBe(true);
    expect(validateAgentSchedule({ enabled: true, cron: '* * *', timezone: 'UTC' }).valid).toBe(false);
  });

  it('calculates upcoming runs', () => {
    const runs = getNextCronRuns('0 9 * * 1', 'UTC', 3);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBeInstanceOf(Date);
  });

  it('matches due schedules at the current minute', () => {
    expect(isAgentScheduleDue({ enabled: true, cron: '15 10 * * *', timezone: 'UTC' }, new Date('2024-01-01T10:15:42.000Z'))).toBe(true);
    expect(isAgentScheduleDue({ enabled: true, cron: '15 10 * * *', timezone: 'UTC' }, new Date('2024-01-01T10:16:00.000Z'))).toBe(false);
  });

  it('merges schedule config and recognizes presets', () => {
    expect(mergeAgentScheduleIntoConfig({ foo: 'bar' }, { enabled: true, cron: '0 * * * *', timezone: 'UTC' })).toEqual({
      foo: 'bar',
      schedule: { enabled: true, cron: '0 * * * *', timezone: 'UTC' },
    });
    expect(getMatchingCronPreset('0 * * * *')?.label).toBe('Every hour');
  });
});
