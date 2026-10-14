/**
 * @fileoverview Scheduled-job driver for the Feature Pipeline Version Steward.
 * Configuration (optional): { "RecordProcessIDs": ["<id>", ...] } limits the pass.
 * @module @memberjunction/scheduling-engine
 */
import { RegisterClass } from '@memberjunction/global';
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { ScheduledJobResult, NotificationContent, ScheduledJobConfiguration } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { FeaturePipelineVersionSteward } from '../FeaturePipelineVersionSteward';

/** The steward job's Configuration. */
export interface StewardJobConfiguration extends ScheduledJobConfiguration {
    /** Limit each pass to these Record Processes (default: every Active Infer Record Process). */
    RecordProcessIDs?: string[];
}

/** Runs one steward pass per scheduled run; the outcomes are the run's `Details.Outcomes`. */
@RegisterClass(BaseScheduledJob, 'FeaturePipelineVersionStewardDriver')
export class FeaturePipelineVersionStewardDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.ReadConfiguration(context.Schedule);
        const outcomes = await FeaturePipelineVersionSteward.Instance.RunOnce({
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            RecordProcessIDs: config.RecordProcessIDs,
            ScheduledJobRunID: context.Run?.ID,
            Heartbeat: () => { void context.heartbeat?.(); },
        });
        const errors = outcomes.filter((o) => o.Action === 'error');
        return {
            Success: errors.length === 0,
            ErrorMessage: errors.length > 0 ? errors.map((e) => `${e.Name}: ${e.Detail}`).join('; ') : undefined,
            Details: { Outcomes: outcomes },
        };
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        try {
            const ids = this.ReadConfiguration(schedule).RecordProcessIDs;
            if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))) {
                result.Errors.push(new ValidationErrorInfo('Configuration.RecordProcessIDs', 'RecordProcessIDs must be an array of IDs', ids, ValidationErrorType.Failure));
            }
        } catch (error) {
            result.Errors.push(new ValidationErrorInfo('Configuration', error instanceof Error ? error.message : 'Invalid configuration', schedule.Configuration, ValidationErrorType.Failure));
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const outcomes = FeaturePipelineVersionSteward.OutcomesFromDetails(result.Details).filter((o) => o.Action !== 'none');
        return {
            Subject: result.Success ? `Feature Pipeline Version Steward: ${outcomes.length} action(s)` : 'Feature Pipeline Version Steward: errors',
            Body: outcomes.map((o) => `${o.Name} v${o.Version || '?'}: ${o.Action} — ${o.Detail}`).join('\n') || 'No version changes.',
            Priority: result.Success ? 'Low' : 'High',
        };
    }

    /** The job's Configuration; optional for this job, so an empty one means every pipeline. */
    protected ReadConfiguration(schedule: MJScheduledJobEntity): StewardJobConfiguration {
        return schedule.Configuration ? this.parseConfiguration<StewardJobConfiguration>(schedule) : {};
    }
}
