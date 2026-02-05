import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, UserInfo, RunView } from '@memberjunction/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import cronParser from 'cron-parser';

/**
 * Base class for all Scheduled Job-related actions.
 * Provides common functionality for job operations including validation,
 * filtering, and entity loading.
 */
@RegisterClass(BaseAction, 'Base Job Action')
export abstract class BaseJobAction extends BaseAction {
    /**
     * Validate cron expression format
     *
     * @param cronExpression - The cron expression to validate
     * @returns Object with valid flag and optional error message
     */
    protected validateCronExpression(cronExpression: string): { valid: boolean; error?: string } {
        if (!cronExpression || cronExpression.trim().length === 0) {
            return {
                valid: false,
                error: 'Cron expression cannot be empty'
            };
        }

        try {
            cronParser.parseExpression(cronExpression);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Load a scheduled job entity by ID with error handling
     *
     * @param jobId - The ID of the job to load
     * @param contextUser - The user context for the operation
     * @returns Object with either the loaded job or an error result
     */
    protected async loadJob(
        jobId: string,
        contextUser: UserInfo
    ): Promise<{ job?: ScheduledJobEntity; error?: ActionResultSimple }> {
        if (!jobId) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'JobID parameter is required'
                }
            };
        }

        const md = new Metadata();
        const job = await md.GetEntityObject<ScheduledJobEntity>('MJ: Scheduled Jobs', contextUser);

        const loadResult = await job.Load(jobId);

        if (!loadResult) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Scheduled job with ID ${jobId} not found`
                }
            };
        }

        return { job };
    }

    /**
     * Validate job status value
     *
     * @param status - The status value to validate
     * @returns True if the status is valid
     */
    protected isValidStatus(status: string): boolean {
        const validStatuses = ['Active', 'Disabled', 'Expired', 'Paused', 'Pending'];
        return validStatuses.includes(status);
    }

    /**
     * Build filter expression for job queries
     *
     * @param filters - Object containing optional filter criteria
     * @returns SQL WHERE clause string
     */
    protected buildJobFilter(filters: {
        status?: string;
        jobTypeId?: string;
        isActive?: boolean;
        createdAfter?: Date;
        createdBefore?: Date;
    }): string {
        const conditions: string[] = [];

        if (filters.status) {
            conditions.push(`Status = '${filters.status}'`);
        }

        if (filters.jobTypeId) {
            conditions.push(`JobTypeID = '${filters.jobTypeId}'`);
        }

        if (filters.createdAfter) {
            conditions.push(`__mj_CreatedAt >= '${filters.createdAfter.toISOString()}'`);
        }

        if (filters.createdBefore) {
            conditions.push(`__mj_CreatedAt <= '${filters.createdBefore.toISOString()}'`);
        }

        return conditions.join(' AND ');
    }

    /**
     * Get parameter value by name (case-insensitive)
     *
     * @param params - The action parameters
     * @param name - Parameter name to find
     * @returns The parameter value or undefined
     */
    protected getParamValue(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    /**
     * Get numeric parameter with default value
     *
     * @param params - The action parameters
     * @param name - Parameter name to find
     * @param defaultValue - Default value if parameter is missing or invalid
     * @returns The numeric parameter value or default
     */
    protected getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) {
            return defaultValue;
        }
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Get boolean parameter with default value
     *
     * @param params - The action parameters
     * @param name - Parameter name to find
     * @param defaultValue - Default value if parameter is missing
     * @returns The boolean parameter value or default
     */
    protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        const strValue = String(value).toLowerCase();
        return strValue === 'true' || strValue === '1' || strValue === 'yes';
    }

    /**
     * Get date parameter
     *
     * @param params - The action parameters
     * @param name - Parameter name to find
     * @returns The date value or undefined
     */
    protected getDateParam(params: RunActionParams, name: string): Date | undefined {
        const value = this.getParamValue(params, name);
        if (!value) {
            return undefined;
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? undefined : date;
    }

    /**
     * Add an output parameter to the result
     *
     * @param params - The action parameters
     * @param name - Output parameter name
     * @param value - Output parameter value
     */
    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Value: value,
            Type: 'Output'
        });
    }
}

/**
 * Loader function to prevent tree shaking
 */
export function LoadBaseJobAction() {
    // Stub function - ensures class is included in bundle
}
