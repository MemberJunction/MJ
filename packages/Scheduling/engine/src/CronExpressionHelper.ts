/**
 * @fileoverview Helper utilities for cron expression evaluation
 * @module @memberjunction/scheduling-engine
 */

import cronParser from 'cron-parser';
import { ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';

/**
 * Utility class for cron expression parsing and evaluation
 */
export class CronExpressionHelper {
    /**
     * Determine if a cron expression is currently due
     *
     * @param cronExpression - Cron expression string
     * @param timezone - IANA timezone (e.g., 'America/Chicago')
     * @param evalTime - Time to evaluate against
     * @returns True if the expression is due at evalTime
     */
    public static IsExpressionDue(
        cronExpression: string,
        timezone: string,
        evalTime: Date
    ): boolean {
        try {
            const options = {
                currentDate: evalTime,
                tz: timezone
            };

            const interval = cronParser.parseExpression(cronExpression, options);
            const nextExecution = interval.next().toDate();

            // Job is due if next execution time is before or at current eval time
            return nextExecution <= evalTime;
        } catch (error) {
            console.error('Error evaluating cron expression:', error);
            return false;
        }
    }

    /**
     * Get the next execution time for a cron expression
     *
     * @param cronExpression - Cron expression string
     * @param timezone - IANA timezone
     * @param fromDate - Optional date to calculate from (defaults to now)
     * @returns Next execution date
     */
    public static GetNextRunTime(
        cronExpression: string,
        timezone: string,
        fromDate?: Date
    ): Date {
        try {
            const options = {
                currentDate: fromDate || new Date(),
                tz: timezone
            };

            const interval = cronParser.parseExpression(cronExpression, options);
            return interval.next().toDate();
        } catch (error) {
            throw new Error(`Failed to calculate next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validate a cron expression
     *
     * @param cronExpression - Cron expression to validate
     * @returns Validation result
     */
    public static ValidateExpression(cronExpression: string): ValidationResult {
        const result = new ValidationResult();

        if (!cronExpression || cronExpression.trim().length === 0) {
            result.Errors.push(new ValidationErrorInfo(
                'CronExpression',
                'Cron expression is required',
                cronExpression,
                ValidationErrorType.Failure
            ));
            return result;
        }

        try {
            cronParser.parseExpression(cronExpression);
            result.Success = true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid cron expression';
            result.Errors.push(new ValidationErrorInfo(
                'CronExpression',
                errorMessage,
                cronExpression,
                ValidationErrorType.Failure
            ));
        }

        return result;
    }
}
