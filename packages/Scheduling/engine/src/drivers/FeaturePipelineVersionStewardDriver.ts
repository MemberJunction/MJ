/**
 * @fileoverview Scheduled-job driver for the Feature Pipeline Version Steward.
 * @module @memberjunction/scheduling-engine
 */
import { RegisterClass } from '@memberjunction/global';
import { ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { FeaturePipelineVersionSteward, type StewardOutcome } from '../FeaturePipelineVersionSteward';

/** Runs one steward pass per scheduled run; the outcomes are the run's `Details.Outcomes`. */
@RegisterClass(BaseScheduledJob, 'FeaturePipelineVersionStewardDriver')
export class FeaturePipelineVersionStewardDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const outcomes = await FeaturePipelineVersionSteward.Instance.RunOnce({
            ContextUser: context.ContextUser,
            Provider: context.Provider,
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

    /** The job takes no configuration. */
    public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const outcomes: StewardOutcome[] = result.Details?.Outcomes || [];
        const actions = outcomes.filter((o) => o.Action !== 'none');
        return {
            Subject: result.Success ? `Feature Pipeline Version Steward: ${actions.length} action(s)` : 'Feature Pipeline Version Steward: errors',
            Body: actions.map((o) => `${o.Name} v${o.Version || '?'}: ${o.Action} — ${o.Detail}`).join('\n') || 'No version changes.',
            Priority: result.Success ? 'Low' : 'High',
        };
    }
}
