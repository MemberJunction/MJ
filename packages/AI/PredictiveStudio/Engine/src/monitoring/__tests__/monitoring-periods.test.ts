import { describe, expect, it } from 'vitest';

import { MonitoringPeriods } from '../monitoring-periods';

/** Task M6.3 — the monitoring calendar (UTC): week, month and quarter boundaries, the last complete period, a period's start. */
const D = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe('MonitoringPeriods', () => {
  it('finds the week (Monday start), month and quarter containing a day', () => {
    const day = D('2026-05-14');
    expect([iso(MonitoringPeriods.Containing(day, 'week').Start), iso(MonitoringPeriods.Containing(day, 'week').End)]).toEqual(['2026-05-11', '2026-05-18']);
    expect([iso(MonitoringPeriods.Containing(day, 'month').Start), iso(MonitoringPeriods.Containing(day, 'month').End)]).toEqual(['2026-05-01', '2026-06-01']);
    expect([iso(MonitoringPeriods.Containing(day, 'quarter').Start), iso(MonitoringPeriods.Containing(day, 'quarter').End)]).toEqual(['2026-04-01', '2026-07-01']);
  });

  it('a Monday opens its own week and a Sunday closes it, across a year boundary', () => {
    expect(iso(MonitoringPeriods.Containing(D('2026-05-11'), 'week').Start)).toBe('2026-05-11');
    expect(iso(MonitoringPeriods.Containing(D('2026-05-17'), 'week').Start)).toBe('2026-05-11');
    const spanning = MonitoringPeriods.Containing(D('2027-01-01'), 'week');
    expect([iso(spanning.Start), iso(spanning.End)]).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('quarters start on January, April, July and October 1st, and December belongs to the fourth', () => {
    expect(['2026-01-01', '2026-03-31', '2026-04-01', '2026-09-30', '2026-10-01', '2026-12-31'].map((d) => iso(MonitoringPeriods.Containing(D(d), 'quarter').Start)))
      .toEqual(['2026-01-01', '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01', '2026-10-01']);
    expect(iso(MonitoringPeriods.Containing(D('2026-12-31'), 'quarter').End)).toBe('2027-01-01');
  });

  it('reads a non-midnight instant by its UTC day', () => {
    expect(iso(MonitoringPeriods.Containing(new Date('2026-05-31T23:59:59.999Z'), 'month').Start)).toBe('2026-05-01');
  });

  it('the last complete period is the one before the period containing now, even on its first day', () => {
    expect(iso(MonitoringPeriods.LastComplete(D('2026-07-01'), 'month').Start)).toBe('2026-06-01');
    expect(iso(MonitoringPeriods.LastComplete(D('2026-07-31'), 'month').Start)).toBe('2026-06-01');
    expect(iso(MonitoringPeriods.LastComplete(D('2026-01-15'), 'quarter').Start)).toBe('2025-10-01');
    expect(iso(MonitoringPeriods.LastComplete(D('2026-05-11'), 'week').Start)).toBe('2026-05-04');
  });

  it('a period\'s last day is the day before its end', () => {
    expect(iso(MonitoringPeriods.LastDay(MonitoringPeriods.Containing(D('2028-02-10'), 'month')))).toBe('2028-02-29');
    expect(iso(MonitoringPeriods.LastDay(MonitoringPeriods.Containing(D('2026-05-14'), 'week')))).toBe('2026-05-17');
  });

  it('Starting returns the period a first day opens and refuses any other day, naming where it starts', () => {
    expect(iso(MonitoringPeriods.Starting(D('2026-04-01'), 'quarter').End)).toBe('2026-07-01');
    expect(() => MonitoringPeriods.Starting(D('2026-05-01'), 'quarter')).toThrow('2026-05-01 is not the first day of a quarter (that quarter starts 2026-04-01)');
    expect(() => MonitoringPeriods.Starting(D('2026-05-12'), 'week')).toThrow('that week starts 2026-05-11');
  });

  it('refuses an invalid date', () => {
    expect(() => MonitoringPeriods.Containing(new Date('not a date'), 'month')).toThrow('is not a valid date');
  });
});
