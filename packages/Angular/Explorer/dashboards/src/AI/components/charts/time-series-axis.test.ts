import { describe, it, expect, afterEach } from 'vitest';
import { AxisTickFormat, CreateTimeScale, DAY_MS, IsDailyBucketSeries, TooltipTimeFormat } from './time-series-axis';

/**
 * The time-series chart's axis rules, run in real non-UTC zones. Daily buckets are UTC days, so
 * every tick must sit on a bucket and carry that bucket's own date, whatever the viewer's zone.
 * Node re-reads process.env.TZ on assignment, so each case genuinely runs in the named zone.
 */

const utcDays = (first: string, count: number): Date[] =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(first) + i * DAY_MS));

describe('time-series axis', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  const expectDailyTicksOnTheBuckets = () => {
    const days = utcDays('2026-09-18T00:00:00Z', 7);
    const daily = IsDailyBucketSeries(days, DAY_MS);
    const scale = CreateTimeScale(daily).domain([days[0], days[days.length - 1]]);
    const ticks = scale.ticks(7);
    const format = AxisTickFormat(days, daily);

    // Every tick is a bucket (not a local midnight hours away from one)...
    expect(ticks.map(t => t.getTime())).toEqual(days.map(d => d.getTime()));
    // ...labelled with that bucket's own date, including the newest.
    expect(ticks.map(format)).toEqual(['09/18', '09/19', '09/20', '09/21', '09/22', '09/23', '09/24']);
  };

  it('puts daily ticks on the buckets, labelled with their own date, east of UTC (Europe/Berlin)', () => {
    process.env.TZ = 'Europe/Berlin';
    expect(new Date('2026-09-18T00:00:00Z').getHours()).toBe(2); // proves the zone took effect
    expectDailyTicksOnTheBuckets();
  });

  it('puts daily ticks on the buckets, labelled with their own date, far east of UTC (Asia/Tokyo)', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date('2026-09-18T00:00:00Z').getHours()).toBe(9);
    expectDailyTicksOnTheBuckets();
  });

  it('puts daily ticks on the buckets west of UTC too (America/New_York)', () => {
    process.env.TZ = 'America/New_York';
    expectDailyTicksOnTheBuckets();
  });

  it('labels a one-bucket daily series with its UTC day, not the previous evening (America/New_York)', () => {
    process.env.TZ = 'America/New_York';
    const bucket = new Date('2026-09-24T00:00:00Z');

    // One point has no gap to measure, so only the caller's bucket width can classify it.
    expect(IsDailyBucketSeries([bucket])).toBe(false);
    const daily = IsDailyBucketSeries([bucket], DAY_MS);
    expect(daily).toBe(true);

    expect(TooltipTimeFormat(daily)(bucket)).toBe('Thu Sep 24, 2026');
    expect(AxisTickFormat([bucket], daily)(bucket)).toBe('09/24');
  });

  it('keeps sub-daily series on the local clock (Europe/Berlin)', () => {
    process.env.TZ = 'Europe/Berlin';
    const hours = [new Date('2026-09-24T10:00:00Z'), new Date('2026-09-24T11:00:00Z')];
    const daily = IsDailyBucketSeries(hours, 60 * 60 * 1000);
    expect(daily).toBe(false);
    expect(AxisTickFormat(hours, daily)(hours[0])).toBe('12:00');
    expect(TooltipTimeFormat(daily)(hours[0])).toBe('Thu Sep 24, 12:00');
  });

  it('falls back to the gap between the first two points when no bucket width is given', () => {
    expect(IsDailyBucketSeries(utcDays('2026-09-18T00:00:00Z', 3))).toBe(true);
    expect(IsDailyBucketSeries([new Date('2026-09-24T10:00:00Z'), new Date('2026-09-24T14:00:00Z')])).toBe(false);
  });
});
