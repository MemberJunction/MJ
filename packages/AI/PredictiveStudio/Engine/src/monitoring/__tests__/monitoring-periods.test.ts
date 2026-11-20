import { describe, expect, it } from 'vitest';

import { MonitoringPeriods } from '../monitoring-periods';

/** Task M6.3 / D4-237 — the monitoring calendar (UTC), including the year grain a pooled window uses. */
const D = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe('MonitoringPeriods', () => {
  it('finds the week (Monday start), month and quarter containing a day', () => {
    const day = D('2026-05-14');
    expect([iso(MonitoringPeriods.Containing(day, 'week').Start), iso(MonitoringPeriods.Containing(day, 'week').End)]).toEqual(['2026-05-11', '2026-05-18']);
    expect([iso(MonitoringPeriods.Containing(day, 'month').Start), iso(MonitoringPeriods.Containing(day, 'month').End)]).toEqual(['2026-05-01', '2026-06-01']);
    expect([iso(MonitoringPeriods.Containing(day, 'quarter').Start), iso(MonitoringPeriods.Containing(day, 'quarter').End)]).toEqual(['2026-04-01', '2026-07-01']);
  });

  it('a year runs from January 1st to the next January 1st, and the last complete year is the one before (D4-237)', () => {
    const year = MonitoringPeriods.Containing(D('2024-08-31'), 'year');
    expect([iso(year.Start), iso(year.End), year.Grain]).toEqual(['2024-01-01', '2025-01-01', 'year']);
    expect(iso(MonitoringPeriods.LastComplete(D('2025-03-01'), 'year').Start)).toBe('2024-01-01');
    expect(iso(MonitoringPeriods.LastDay(year))).toBe('2024-12-31');
  });

  it('Starting refuses a day that does not open a period of the grain, naming where it starts', () => {
    expect(iso(MonitoringPeriods.Starting(D('2024-01-01'), 'year').End)).toBe('2025-01-01');
    expect(() => MonitoringPeriods.Starting(D('2024-02-01'), 'year')).toThrow('2024-02-01 is not the first day of a year (that year starts 2024-01-01)');
  });
});
