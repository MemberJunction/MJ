/**
 * @fileoverview Driver for executing scheduled Integration Sync jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { IntegrationEngine } from '@memberjunction/integration-engine';
import type { SyncResult, IntegrationSyncOptions } from '@memberjunction/integration-engine';
import {
    ScheduledJobResult,
    NotificationContent,
    IntegrationSyncJobConfiguration
} from '@memberjunction/scheduling-base-types';

/**
 * Driver for executing scheduled Integration Sync jobs.
 *
 * Configuration schema (stored in ScheduledJob.Configuration):
 * {
 *   CompanyIntegrationID: string,
 *   EntityMapIDs?: string[],
 *   FullSync?: boolean
 * }
 *
 * Execution result details (stored in ScheduledJobRun.Details):
 * {
 *   CompanyIntegrationRunID: string,
 *   CompanyIntegrationID: string,
 *   RecordsProcessed: number,
 *   RecordsCreated: number,
 *   RecordsUpdated: number,
 *   RecordsDeleted: number,
 *   RecordsErrored: number,
 *   RecordsSkipped: number,
 *   EntityMapResults: EntityMapSyncResult[],
 *   Duration: number
 * }
 */
@RegisterClass(BaseScheduledJob, 'IntegrationSyncScheduledJobDriver')
export class IntegrationSyncScheduledJobDriver extends BaseScheduledJob {

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<IntegrationSyncJobConfiguration>(context.Schedule);

        this.log(`Starting integration sync for CompanyIntegration: ${config.CompanyIntegrationID}`);

        // Ensure the integration engine metadata is loaded
        await IntegrationEngine.Instance.Config(false, context.ContextUser);

        const options: IntegrationSyncOptions = {
            EntityMapIDs: config.EntityMapIDs,
            FullSync: config.FullSync,
            ScheduledJobRunID: context.Run.ID,
        };

        const result = await IntegrationEngine.Instance.RunSync(
            config.CompanyIntegrationID,
            context.ContextUser,
            'Scheduled',
            undefined, // onProgress
            undefined, // onNotification
            options
        );

        this.log(
            `Integration sync completed: ${result.RecordsProcessed} processed, ` +
            `${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ` +
            `${result.RecordsErrored} errors`
        );

        return this.buildResult(config, result);
    }

    public ValidateConfiguration(schedule: { Configuration?: string }): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<IntegrationSyncJobConfiguration>(schedule as Parameters<typeof this.parseConfiguration>[0]);

            if (!config.CompanyIntegrationID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.CompanyIntegrationID',
                    'CompanyIntegrationID is required',
                    config.CompanyIntegrationID,
                    ValidationErrorType.Failure
                ));
            }

            if (config.EntityMapIDs && !Array.isArray(config.EntityMapIDs)) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.EntityMapIDs',
                    'EntityMapIDs must be an array of strings',
                    config.EntityMapIDs,
                    ValidationErrorType.Failure
                ));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                errorMessage,
                schedule.Configuration,
                ValidationErrorType.Failure
            ));
        }

        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent {
        const details = result.Details;

        const subject = result.Success
            ? `Scheduled Integration Sync Completed: ${context.Schedule.Name}`
            : `Scheduled Integration Sync Failed: ${context.Schedule.Name}`;

        const body = result.Success
            ? this.buildSuccessBody(context, details)
            : this.buildFailureBody(context, result);

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'IntegrationSync',
                CompanyIntegrationID: details?.CompanyIntegrationID,
                CompanyIntegrationRunID: details?.CompanyIntegrationRunID,
            }
        };
    }

    private buildResult(
        config: IntegrationSyncJobConfiguration,
        syncResult: SyncResult
    ): ScheduledJobResult {
        return {
            Success: syncResult.Success,
            ErrorMessage: syncResult.ErrorMessage,
            Details: {
                CompanyIntegrationRunID: syncResult.RunID,
                CompanyIntegrationID: config.CompanyIntegrationID,
                RecordsProcessed: syncResult.RecordsProcessed,
                RecordsCreated: syncResult.RecordsCreated,
                RecordsUpdated: syncResult.RecordsUpdated,
                RecordsDeleted: syncResult.RecordsDeleted,
                RecordsErrored: syncResult.RecordsErrored,
                RecordsSkipped: syncResult.RecordsSkipped,
                EntityMapResults: syncResult.EntityMapResults,
                Duration: syncResult.Duration,
            }
        };
    }

    private buildSuccessBody(
        context: ScheduledJobExecutionContext,
        details: Record<string, unknown> | undefined
    ): string {
        const durationMs = details?.Duration as number | undefined;
        const durationStr = durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : 'N/A';

        return [
            `The scheduled integration sync "${context.Schedule.Name}" completed successfully.`,
            '',
            `Records Processed: ${details?.RecordsProcessed ?? 'N/A'}`,
            `  Created: ${details?.RecordsCreated ?? 'N/A'}`,
            `  Updated: ${details?.RecordsUpdated ?? 'N/A'}`,
            `  Deleted: ${details?.RecordsDeleted ?? 'N/A'}`,
            `  Skipped: ${details?.RecordsSkipped ?? 'N/A'}`,
            `  Errors:  ${details?.RecordsErrored ?? 'N/A'}`,
            '',
            `Duration: ${durationStr}`,
        ].join('\n');
    }

    private buildFailureBody(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): string {
        return [
            `The scheduled integration sync "${context.Schedule.Name}" failed.`,
            '',
            `Error: ${result.ErrorMessage ?? 'Unknown error'}`,
            `Records Errored: ${result.Details?.RecordsErrored ?? 'N/A'}`,
        ].join('\n');
    }
}
