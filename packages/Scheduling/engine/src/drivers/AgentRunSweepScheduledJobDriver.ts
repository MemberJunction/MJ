/**
 * @fileoverview Driver for the scheduled agent-run orphan sweep
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, DatabaseProviderBase } from '@memberjunction/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { AgentRunWatchdog } from '@memberjunction/ai-agents';
import { ScheduledJobResult, NotificationContent, ScheduledJobConfiguration } from '@memberjunction/scheduling-base-types';

/**
 * Optional configuration (stored in ScheduledJob.Configuration). All fields optional —
 * the sweep runs with sensible defaults when Configuration is empty.
 */
export interface AgentRunSweepJobConfiguration extends ScheduledJobConfiguration {
    /** Overrides the stale-heartbeat threshold (minutes) past which a Running run is force-failed. */
    StaleThresholdMinutes?: number;
}

/**
 * Audit/observability layer over {@link AgentRunWatchdog.SweepOrphanedRuns}.
 *
 * The watchdog already runs an always-on in-process sweep (see `AgentRunWatchdog` — that timer is
 * the reliability floor and runs regardless of whether scheduled jobs are enabled). This driver
 * lets an operator ALSO drive the *same idempotent sweep* through MJ's scheduler, so each run is
 * recorded as a `MJ: Scheduled Job Run` with the orphan count and can raise notifications. It is
 * deliberately opt-in: shipping the job *type* doesn't activate anything until someone creates a
 * `MJ: Scheduled Job` of this type with a cron expression. Running both is harmless — the sweep is
 * a `Status='Running' AND <stale>` UPDATE, atomic and idempotent.
 */
@RegisterClass(BaseScheduledJob, 'AgentRunSweepScheduledJobDriver')
export class AgentRunSweepScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        // A scheduled maintenance sweep is a server-global task, so the global default provider is
        // the correct source here (not a per-request/per-tenant provider).
        const provider = Metadata.Provider; // global-provider-ok: scheduled maintenance sweep is a server-global task, not per-request/per-tenant
        if (!(provider instanceof DatabaseProviderBase)) {
            return { Success: false, ErrorMessage: 'AgentRunSweep: no database provider available' };
        }

        const config = this.parseSweepConfiguration(context.Schedule);
        const sweepConfig = config.StaleThresholdMinutes != null
            ? { staleThresholdMinutes: config.StaleThresholdMinutes }
            : undefined;

        const runsFailed = await AgentRunWatchdog.SweepOrphanedRuns(provider, context.ContextUser, sweepConfig);
        return { Success: true, Details: { RunsFailed: runsFailed } };
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        const config = this.parseSweepConfiguration(schedule);
        const threshold = config.StaleThresholdMinutes;
        if (threshold != null && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0)) {
            result.Errors.push(new ValidationErrorInfo(
                'Configuration.StaleThresholdMinutes',
                'StaleThresholdMinutes must be a positive number when provided',
                threshold,
                ValidationErrorType.Failure,
            ));
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const runsFailed = (result.Details?.['RunsFailed'] as number) ?? 0;
        if (!result.Success) {
            return {
                Subject: `Agent-run sweep failed: ${context.Schedule.Name}`,
                Body: `The scheduled agent-run sweep "${context.Schedule.Name}" failed.\n\nError: ${result.ErrorMessage ?? 'unknown'}`,
                Priority: 'High',
                Metadata: { RunsFailed: runsFailed },
            };
        }
        return {
            Subject: `Agent-run sweep: ${runsFailed} orphaned run(s) force-failed`,
            Body: `The scheduled agent-run sweep "${context.Schedule.Name}" completed and force-failed `
                + `${runsFailed} orphaned run(s) whose owning process had gone silent.`,
            Priority: runsFailed > 0 ? 'Normal' : 'Low',
            Metadata: { RunsFailed: runsFailed },
        };
    }

    /** Tolerant parse — the sweep needs no configuration, so empty/missing JSON yields defaults. */
    private parseSweepConfiguration(schedule: MJScheduledJobEntity): AgentRunSweepJobConfiguration {
        if (!schedule.Configuration) {
            return {};
        }
        try {
            return JSON.parse(schedule.Configuration) as AgentRunSweepJobConfiguration;
        } catch {
            return {};
        }
    }
}
