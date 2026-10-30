import { describe, it, expect } from 'vitest';
import { MS_PER_DAY, UtcDay } from '../utc-day';

describe('UtcDay.ToUtcDay', () => {
  it('reads a string by its yyyy-mm-dd date part, ignoring any time and zone after it', () => {
    expect(UtcDay.ToUtcDay('2024-03-05')?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(UtcDay.ToUtcDay(' 2024-03-05T23:30:00-05:00 ')?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
  });
  it('reads a Date by its UTC date', () => {
    expect(UtcDay.ToUtcDay(new Date('2024-03-05T23:59:59.999Z'))?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
  });
  it('refuses a date part that names no calendar day instead of rolling it over', () => {
    expect(UtcDay.ToUtcDay('2024-02-30')).toBeNull();
    expect(UtcDay.ToUtcDay('2024-13-01')).toBeNull();
    expect(UtcDay.ToUtcDay('2023-02-29')).toBeNull();
    expect(UtcDay.ToUtcDay('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });
  it('returns null for values that denote no day', () => {
    for (const v of [null, undefined, 3, true, 'soon', '', new Date(Number.NaN)]) expect(UtcDay.ToUtcDay(v)).toBeNull();
  });
});

describe('UtcDay arithmetic and form', () => {
  it('adds whole days in both directions and prints the yyyy-mm-dd form', () => {
    const day = new Date(Date.UTC(2024, 1, 28));
    expect(UtcDay.UtcDayIso(UtcDay.AddUtcDays(day, 1))).toBe('2024-02-29');
    expect(UtcDay.UtcDayIso(UtcDay.AddUtcDays(day, -59))).toBe('2023-12-31');
    expect(MS_PER_DAY).toBe(86_400_000);
  });
});
