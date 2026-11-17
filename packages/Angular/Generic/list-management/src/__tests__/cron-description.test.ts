import { describe, expect, it } from 'vitest';

import { DescribeCron, FormatClockTime } from '../lib/utils/cron-description';

describe('DescribeCron', () => {
  it.each([
    ['0 2 * * *', 'Daily at 2:00 am'],
    ['30 20 * * *', 'Daily at 8:30 pm'],
    ['0 0 * * *', 'Daily at 12:00 am'],
    ['15 * * * *', 'Every hour at :15'],
    ['0 8 * * 1-5', 'Weekdays at 8:00 am'],
    ['30 6 * * 1', 'Mondays at 6:30 am'],
    ['0 9 * * 0', 'Sundays at 9:00 am'],
    ['0 9 * * 7', 'Sundays at 9:00 am'],
  ])('describes %s as "%s"', (cron, expected) => {
    expect(DescribeCron(cron)).toBe(expected);
  });

  it('returns anything it cannot describe unchanged', () => {
    expect(DescribeCron('*/5 * * * *')).toBe('*/5 * * * *');
    expect(DescribeCron('0 2 1 * *')).toBe('0 2 1 * *');
    expect(DescribeCron('0 2 * * 1,3')).toBe('0 2 * * 1,3');
  });

  it('says when there is no schedule', () => {
    expect(DescribeCron(null)).toBe('No schedule');
    expect(DescribeCron('  ')).toBe('No schedule');
  });
});

describe('FormatClockTime', () => {
  it('formats noon and midnight', () => {
    expect(FormatClockTime(12, 0)).toBe('12:00 pm');
    expect(FormatClockTime(0, 5)).toBe('12:05 am');
  });
});
