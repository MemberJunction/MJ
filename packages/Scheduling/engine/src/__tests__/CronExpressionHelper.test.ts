import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronExpressionHelper } from '../CronExpressionHelper';

describe('CronExpressionHelper', () => {
    describe('ValidateExpression', () => {
        it('should return success for a valid cron expression', () => {
            const result = CronExpressionHelper.ValidateExpression('*/5 * * * *');
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should return success for a complex valid expression', () => {
            const result = CronExpressionHelper.ValidateExpression('0 0 1 1 *');
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should return success for every-minute expression', () => {
            const result = CronExpressionHelper.ValidateExpression('* * * * *');
            expect(result.Success).toBe(true);
        });

        it('should return failure for an empty string', () => {
            const result = CronExpressionHelper.ValidateExpression('');
            expect(result.Success).toBeFalsy();
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('CronExpression');
            expect(result.Errors[0].Message).toBe('Cron expression is required');
        });

        it('should return failure for whitespace-only string', () => {
            const result = CronExpressionHelper.ValidateExpression('   ');
            expect(result.Success).toBeFalsy();
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should return failure for an invalid cron expression', () => {
            const result = CronExpressionHelper.ValidateExpression('invalid cron');
            expect(result.Success).toBeFalsy();
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should return failure for out-of-range values', () => {
            const result = CronExpressionHelper.ValidateExpression('99 99 99 99 99');
            expect(result.Success).toBeFalsy();
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should validate expressions with ranges', () => {
            const result = CronExpressionHelper.ValidateExpression('0 9-17 * * 1-5');
            expect(result.Success).toBe(true);
        });

        it('should validate expressions with lists', () => {
            const result = CronExpressionHelper.ValidateExpression('0 0 1,15 * *');
            expect(result.Success).toBe(true);
        });
    });

    describe('GetNextRunTime', () => {
        it('should return a Date object', () => {
            const result = CronExpressionHelper.GetNextRunTime('*/5 * * * *', 'UTC');
            expect(result).toBeInstanceOf(Date);
        });

        it('should return a future date when no fromDate is provided', () => {
            const now = new Date();
            const result = CronExpressionHelper.GetNextRunTime('*/5 * * * *', 'UTC');
            expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime());
        });

        it('should calculate from a specific date', () => {
            const fromDate = new Date('2025-01-15T10:00:00Z');
            const result = CronExpressionHelper.GetNextRunTime('0 12 * * *', 'UTC', fromDate);
            // Next noon after 10:00 should be 12:00 the same day
            expect(result.getUTCHours()).toBe(12);
            expect(result.getUTCMinutes()).toBe(0);
        });

        it('should respect timezone parameter', () => {
            const fromDate = new Date('2025-01-15T10:00:00Z');
            const utcResult = CronExpressionHelper.GetNextRunTime('0 12 * * *', 'UTC', fromDate);
            const chicagoResult = CronExpressionHelper.GetNextRunTime('0 12 * * *', 'America/Chicago', fromDate);
            // They should be different times since Chicago is behind UTC
            expect(utcResult.getTime()).not.toBe(chicagoResult.getTime());
        });

        it('should throw for an invalid cron expression', () => {
            expect(() => {
                CronExpressionHelper.GetNextRunTime('invalid', 'UTC');
            }).toThrow('Failed to calculate next run time');
        });

        it('should throw with a meaningful error message', () => {
            expect(() => {
                CronExpressionHelper.GetNextRunTime('not valid', 'UTC');
            }).toThrow(/Failed to calculate next run time/);
        });

        it('should handle every-minute cron expression', () => {
            const fromDate = new Date('2025-01-15T10:30:00Z');
            const result = CronExpressionHelper.GetNextRunTime('* * * * *', 'UTC', fromDate);
            // Next execution should be within the next minute
            const diffMs = result.getTime() - fromDate.getTime();
            expect(diffMs).toBeLessThanOrEqual(60000);
        });

        it('should handle monthly expressions', () => {
            const fromDate = new Date('2025-01-15T10:00:00Z');
            const result = CronExpressionHelper.GetNextRunTime('0 0 1 * *', 'UTC', fromDate);
            // Next first-of-month at midnight should be Feb 1
            expect(result.getUTCDate()).toBe(1);
            expect(result.getUTCMonth()).toBe(1); // February (0-indexed)
        });
    });

    describe('IsExpressionDue', () => {
        it('should return false for an invalid expression', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const result = CronExpressionHelper.IsExpressionDue('invalid', 'UTC', new Date());
            expect(result).toBe(false);
            consoleSpy.mockRestore();
        });

        it('should return a boolean', () => {
            const result = CronExpressionHelper.IsExpressionDue(
                '* * * * *',
                'UTC',
                new Date()
            );
            expect(typeof result).toBe('boolean');
        });

        it('should handle timezone-aware evaluation', () => {
            const evalTime = new Date('2025-01-15T12:00:00Z');
            // This should not throw and should return a boolean
            const result = CronExpressionHelper.IsExpressionDue(
                '0 12 * * *',
                'America/New_York',
                evalTime
            );
            expect(typeof result).toBe('boolean');
        });

        it('should handle edge case at midnight', () => {
            const midnight = new Date('2025-01-15T00:00:00Z');
            const result = CronExpressionHelper.IsExpressionDue(
                '0 0 * * *',
                'UTC',
                midnight
            );
            expect(typeof result).toBe('boolean');
        });
    });
});
