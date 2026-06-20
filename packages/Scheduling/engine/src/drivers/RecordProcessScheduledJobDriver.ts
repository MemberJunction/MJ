/**
 * @fileoverview Scheduled-job driver that runs a Record Process on its cron schedule — sibling to
 * AgentScheduledJobDriver / ActionScheduledJobDriver. Delegates to the RecordProcessExecutor and
 * renews the job lease via the scheduler heartbeat each batch.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ScheduledJobResult, NotificationContent, ScheduledJobConfiguration } from '@memberjunction/scheduling-base-types';

/** Configuration stored in `ScheduledJob.Configuration` for this driver. */
interface RecordProcessJobConfiguration extends ScheduledJobConfiguration {
    RecordProcessID: string;
}

/**
 * Driver for executing a scheduled Record Process.
 *
 * Configuration schema: `{ "RecordProcessID": "<id>" }`
 */
@RegisterClass(BaseScheduledJob, 'RecordProcessScheduledJobDriver')
export class RecordProcessScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<RecordProcessJobConfiguration>(context.Schedule);
        if (!config.RecordProcessID) {
            throw new Error('RecordProcessID is required in the scheduled job configuration');
        }

        void context.heartbeat?.();
        const result = await new RecordProcessExecutor().RunByID(config.RecordProcessID, {
            contextUser: context.ContextUser,
            triggeredBy: 'Schedule',
            // Renew the lease as each batch reports progress.
            onProgress: () => { void context.heartbeat?.(); },
        });

        return {
            Success: result.Status === 'Completed',
            ErrorMessage: result.ErrorMessage,
            Details: {
                ProcessRunID: result.ProcessRunID,
                Status: result.Status,
                Processed: result.Processed,
                SuccessCount: result.Success,
                ErrorCount: result.Error,
                SkippedCount: result.Skipped,
            },
        };
    }

    public ValidateConfiguration(schedule: Parameters<RecordProcessScheduledJobDriver['parseConfiguration']>[0]): ValidationResult {
        const result = new ValidationResult();
        try {
            const config = this.parseConfiguration<RecordProcessJobConfiguration>(schedule);
            if (!config.RecordProcessID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.RecordProcessID',
                    'RecordProcessID is required',
                    config.RecordProcessID,
                    ValidationErrorType.Failure,
                ));
            }
        } catch (error) {
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                error instanceof Error ? error.message : 'Invalid configuration',
                schedule.Configuration,
                ValidationErrorType.Failure,
            ));
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const d = result.Details as Record<string, unknown> | undefined;
        return {
            Subject: result.Success
                ? `Record Process Completed: ${context.Schedule.Name}`
                : `Record Process Failed: ${context.Schedule.Name}`,
            Body: result.Success
                ? `Processed ${d?.Processed ?? 0} records — ${d?.SuccessCount ?? 0} succeeded, ${d?.ErrorCount ?? 0} failed, ${d?.SkippedCount ?? 0} skipped. Run ${d?.ProcessRunID ?? ''}.`
                : `Failed: ${result.ErrorMessage ?? 'unknown error'}`,
            Priority: result.Success ? 'Normal' : 'High',
        };
    }
}
