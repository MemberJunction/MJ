import { describe, it, expect } from 'vitest';
import {
    BuildCronExpression,
    DefaultCronSchedule,
    DescribeCronExpression,
    IsPlausibleCronExpression,
    Ordinal,
    ParseCronExpression,
} from '../lib/cron-utils';

describe('cron-utils', () => {
    describe('BuildCronExpression', () => {
        it('builds hourly', () => {
            expect(BuildCronExpression({ ...DefaultCronSchedule(), Kind: 'hourly', Minute: 15 })).toBe('15 * * * *');
        });

        it('builds daily', () => {
            expect(BuildCronExpression({ ...DefaultCronSchedule(), Kind: 'daily', Minute: 30, Hour: 7 })).toBe('30 7 * * *');
        });

        it('builds weekly', () => {
            expect(BuildCronExpression({ ...DefaultCronSchedule(), Kind: 'weekly', Minute: 0, Hour: 9, DayOfWeek: 5 })).toBe('0 9 * * 5');
        });

        it('builds monthly', () => {
            expect(BuildCronExpression({ ...DefaultCronSchedule(), Kind: 'monthly', Minute: 0, Hour: 6, DayOfMonth: 15 })).toBe('0 6 15 * *');
        });

        it('passes advanced raw through trimmed', () => {
            expect(BuildCronExpression({ ...DefaultCronSchedule(), Kind: 'advanced', Raw: ' */5 * * * * ' })).toBe('*/5 * * * *');
        });
    });

    describe('ParseCronExpression', () => {
        it('round-trips each preset', () => {
            const cases: Array<{ cron: string; kind: string }> = [
                { cron: '15 * * * *', kind: 'hourly' },
                { cron: '30 7 * * *', kind: 'daily' },
                { cron: '0 9 * * 5', kind: 'weekly' },
                { cron: '0 6 15 * *', kind: 'monthly' },
            ];
            for (const { cron, kind } of cases) {
                const parsed = ParseCronExpression(cron);
                expect(parsed.Kind).toBe(kind);
                expect(BuildCronExpression(parsed)).toBe(cron);
            }
        });

        it('falls back to advanced for step / range shapes', () => {
            expect(ParseCronExpression('*/5 * * * *').Kind).toBe('advanced');
            expect(ParseCronExpression('0 9-17 * * 1-5').Kind).toBe('advanced');
            expect(ParseCronExpression('0 0 1 1 *').Kind).toBe('advanced'); // month pinned
        });

        it('preserves Raw for advanced expressions (never lossy)', () => {
            const parsed = ParseCronExpression('0 9-17 * * 1-5');
            expect(parsed.Raw).toBe('0 9-17 * * 1-5');
            expect(BuildCronExpression(parsed)).toBe('0 9-17 * * 1-5');
        });

        it('treats blank / malformed input as advanced-ish defaults without throwing', () => {
            expect(ParseCronExpression('').Kind).toBe('daily'); // fresh default schedule
            expect(ParseCronExpression('not a cron').Kind).toBe('advanced');
            expect(ParseCronExpression(null).Kind).toBe('daily');
        });
    });

    describe('DescribeCronExpression', () => {
        it('describes presets in words', () => {
            expect(DescribeCronExpression('0 * * * *')).toBe('Every hour, on the hour');
            expect(DescribeCronExpression('15 * * * *')).toBe('Every hour at :15');
            expect(DescribeCronExpression('30 7 * * *')).toBe('Daily at 7:30 AM');
            expect(DescribeCronExpression('0 13 * * 5')).toBe('Every Friday at 1:00 PM');
            expect(DescribeCronExpression('0 6 15 * *')).toBe('Monthly on the 15th at 6:00 AM');
        });

        it('describes common step shapes', () => {
            expect(DescribeCronExpression('* * * * *')).toBe('Every minute');
            expect(DescribeCronExpression('*/5 * * * *')).toBe('Every 5 minutes');
            expect(DescribeCronExpression('0 */2 * * *')).toBe('Every 2 hours at :00');
        });

        it('falls back to the raw expression rather than guessing', () => {
            expect(DescribeCronExpression('0 9-17 * * 1-5')).toBe('0 9-17 * * 1-5');
        });

        it('handles midnight and noon correctly', () => {
            expect(DescribeCronExpression('0 0 * * *')).toBe('Daily at 12:00 AM');
            expect(DescribeCronExpression('0 12 * * *')).toBe('Daily at 12:00 PM');
        });
    });

    describe('Ordinal', () => {
        it('handles the tricky teens', () => {
            expect(Ordinal(1)).toBe('1st');
            expect(Ordinal(2)).toBe('2nd');
            expect(Ordinal(3)).toBe('3rd');
            expect(Ordinal(11)).toBe('11th');
            expect(Ordinal(12)).toBe('12th');
            expect(Ordinal(13)).toBe('13th');
            expect(Ordinal(21)).toBe('21st');
            expect(Ordinal(22)).toBe('22nd');
            expect(Ordinal(23)).toBe('23rd');
        });
    });

    describe('IsPlausibleCronExpression', () => {
        it('accepts 5 and 6 field expressions', () => {
            expect(IsPlausibleCronExpression('0 9 * * *')).toBe(true);
            expect(IsPlausibleCronExpression('0 0 9 * * *')).toBe(true);
        });
        it('rejects other shapes', () => {
            expect(IsPlausibleCronExpression('')).toBe(false);
            expect(IsPlausibleCronExpression('0 9')).toBe(false);
            expect(IsPlausibleCronExpression('a b c d e f g')).toBe(false);
        });
    });
});
