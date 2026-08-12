/**
 * @fileoverview Driver for the bounded action-execution-log purge.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import {
    LogError,
    Metadata,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJActionExecutionLogEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import { NotificationContent, ScheduledJobConfiguration, ScheduledJobResult } from '@memberjunction/scheduling-base-types';

/** How many rows one run will delete before stopping, when the job does not say. */
export const DEFAULT_MAX_DELETES_PER_RUN = 5000;

/** Optional configuration (stored in `ScheduledJob.Configuration`). Every field is optional. */
export interface ActionLogRetentionJobConfiguration extends ScheduledJobConfiguration {
    /**
     * Lifetime, in days, for log rows that carry no retention of their own.
     *
     * Omitted means those rows are kept indefinitely. That is the deliberate default: a NULL
     * retention is what the schema calls "indefinite", and a purge job that silently supplied a
     * number would delete history nobody agreed to lose.
     */
    DefaultRetentionDays?: number;
    /** Ceiling on rows deleted per run. Defaults to {@link DEFAULT_MAX_DELETES_PER_RUN}. */
    MaxDeletesPerRun?: number;
}

/** One retention bucket: every log row with this lifetime expires before {@link Cutoff}. */
export type RetentionBucket = { RetentionDays: number; Cutoff: Date };

/**
 * Turns the distinct retention values present into the buckets a purge query needs.
 *
 * Bucketing rather than per-row date math is what keeps this a small number of indexable range
 * queries instead of a scan: retention is stamped from the action, so the distinct set is roughly
 * "one per configured action", not one per log row. Pure and exported so the arithmetic is testable
 * without a clock or a database.
 *
 * @param now the reference instant, passed in rather than read, so a test can pin it.
 */
export function BuildRetentionBuckets(retentionDays: readonly number[], now: Date): RetentionBucket[] {
    const distinct = [...new Set(retentionDays.filter((d) => Number.isFinite(d) && d > 0))].sort((a, b) => a - b);
    return distinct.map((RetentionDays) => ({
        RetentionDays,
        Cutoff: new Date(now.getTime() - RetentionDays * 24 * 60 * 60 * 1000),
    }));
}

/**
 * Purges expired `MJ: Action Execution Logs` rows, bounded per run.
 *
 * **Retention is decided at write time, not here.** `StartActionLog` stamps each row's
 * `RetentionPeriod` from its action's, so this job reads only the row's own value — which is what
 * makes an edit to `Action.RetentionPeriod` a going-forward change rather than a retroactive
 * deletion of history written under the previous policy. A row with NULL retention is kept forever
 * unless the job is explicitly configured with `DefaultRetentionDays`.
 *
 * **Deletion goes through `BaseEntity.Delete()`, one row at a time.** A `DELETE` statement would be
 * faster and is a sanctioned use of raw DML in principle — but only for an entity that has opted in
 * via `AllowDirectSQLDelete`, and this one has not. Honouring the platform's own gate matters more
 * here than throughput, because the job is bounded anyway: the cap exists so a first run against a
 * long-neglected table cannot become an unbounded transaction, and raising it is a configuration
 * change rather than a code change.
 *
 * Opt-in like every other maintenance driver: shipping the job type activates nothing until someone
 * creates a `MJ: Scheduled Job` of this type with a cron expression.
 */
@RegisterClass(BaseScheduledJob, 'ActionLogRetentionScheduledJobDriver')
export class ActionLogRetentionScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.readConfiguration(context.Schedule);
        const maxDeletes = config.MaxDeletesPerRun ?? DEFAULT_MAX_DELETES_PER_RUN;

        try {
            const expired = await this.findExpiredLogs(config, maxDeletes, context.ContextUser);
            const { Deleted, Failed } = await this.deleteBounded(expired);
            return {
                Success: true,
                Details: {
                    Deleted,
                    Failed,
                    Examined: expired.length,
                    // Says plainly that the run stopped at its ceiling rather than because it was
                    // finished — otherwise "Deleted: 5000" reads as "all clean" when it is not.
                    ReachedCap: expired.length >= maxDeletes,
                },
            };
        } catch (e) {
            return { Success: false, ErrorMessage: `Action-log purge failed: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    /**
     * The expired rows, oldest first, capped at `maxDeletes`.
     *
     * Oldest-first is not cosmetic: a capped run that took an arbitrary slice would leave the same
     * ancient rows behind every night while deleting newer ones, so the backlog would never drain.
     */
    protected async findExpiredLogs(
        config: ActionLogRetentionJobConfiguration,
        maxDeletes: number,
        user: UserInfo,
    ): Promise<MJActionExecutionLogEntity[]> {
        const filter = await this.buildExpiredFilter(config, user);
        if (!filter) {
            return [];
        }

        // A scheduled maintenance sweep is a server-global task, so the global default provider is
        // the correct source here (not a per-request/per-tenant provider).
        const rv = RunView.FromMetadataProvider(Metadata.Provider); // global-provider-ok: scheduled maintenance sweep is a server-global task, not per-request/per-tenant
        const result = await rv.RunView<MJActionExecutionLogEntity>(
            {
                EntityName: 'MJ: Action Execution Logs',
                ExtraFilter: filter,
                OrderBy: 'StartedAt ASC',
                MaxRows: maxDeletes,
                ResultType: 'entity_object',
            },
            user,
        );
        if (!result.Success) {
            throw new Error(result.ErrorMessage ?? 'could not read the action execution log');
        }
        return result.Results ?? [];
    }

    /**
     * The WHERE clause selecting expired rows, or null when nothing can expire.
     *
     * Returning null rather than a clause that matches nothing is deliberate — it lets the caller
     * skip the query entirely on an instance where no action has ever configured retention, which is
     * the common case and should cost nothing nightly.
     */
    protected async buildExpiredFilter(config: ActionLogRetentionJobConfiguration, user: UserInfo): Promise<string | null> {
        const now = new Date();
        const clauses: string[] = [];

        const buckets = BuildRetentionBuckets(await this.distinctRetentionDays(user), now);
        for (const bucket of buckets) {
            clauses.push(`(RetentionPeriod = ${bucket.RetentionDays} AND StartedAt < '${bucket.Cutoff.toISOString()}')`);
        }

        const fallback = config.DefaultRetentionDays;
        if (fallback != null && Number.isFinite(fallback) && fallback > 0) {
            const cutoff = new Date(now.getTime() - fallback * 24 * 60 * 60 * 1000);
            clauses.push(`(RetentionPeriod IS NULL AND StartedAt < '${cutoff.toISOString()}')`);
        }

        return clauses.length > 0 ? clauses.join(' OR ') : null;
    }

    /**
     * The retention lifetimes actually in use, read from the actions that stamped them.
     *
     * Read from `MJ: Actions` rather than by scanning the log for distinct values, because the log
     * is the large table and the actions table is not — and the two agree by construction, since the
     * stamp comes from here.
     */
    protected async distinctRetentionDays(user: UserInfo): Promise<number[]> {
        const rv = RunView.FromMetadataProvider(Metadata.Provider); // global-provider-ok: scheduled maintenance sweep is a server-global task, not per-request/per-tenant
        const result = await rv.RunView<{ RetentionPeriod: number | null }>(
            {
                EntityName: 'MJ: Actions',
                ExtraFilter: 'RetentionPeriod IS NOT NULL',
                Fields: ['RetentionPeriod'],
                ResultType: 'simple',
            },
            user,
        );
        if (!result.Success) {
            throw new Error(result.ErrorMessage ?? 'could not read action retention settings');
        }
        return (result.Results ?? []).map((r) => Number(r.RetentionPeriod)).filter((d) => Number.isFinite(d));
    }

    /**
     * Deletes the given rows, counting rather than aborting on a failure.
     *
     * One bad row — a FK an extension added, a permission gap — must not strand the rest of the
     * purge behind it every night. The count is reported so the failure is visible.
     */
    protected async deleteBounded(rows: MJActionExecutionLogEntity[]): Promise<{ Deleted: number; Failed: number }> {
        let Deleted = 0;
        let Failed = 0;
        for (const row of rows) {
            if (await row.Delete()) {
                Deleted++;
            } else {
                Failed++;
                LogError(
                    `ActionLogRetention: could not delete action execution log ${row.ID}: ` +
                    `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        return { Deleted, Failed };
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        const config = this.readConfiguration(schedule);
        for (const [field, value] of [
            ['DefaultRetentionDays', config.DefaultRetentionDays],
            ['MaxDeletesPerRun', config.MaxDeletesPerRun],
        ] as const) {
            if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
                result.Errors.push(new ValidationErrorInfo(
                    `Configuration.${field}`,
                    `${field} must be a positive number when provided`,
                    value,
                    ValidationErrorType.Failure,
                ));
            }
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const deleted = (result.Details?.['Deleted'] as number) ?? 0;
        const failed = (result.Details?.['Failed'] as number) ?? 0;
        const reachedCap = (result.Details?.['ReachedCap'] as boolean) ?? false;
        if (!result.Success) {
            return {
                Subject: `Action-log purge failed: ${context.Schedule.Name}`,
                Body: `The scheduled action-log purge "${context.Schedule.Name}" failed.\n\nError: ${result.ErrorMessage ?? 'unknown'}`,
                Priority: 'High',
                Metadata: { Deleted: deleted, Failed: failed },
            };
        }
        const capNote = reachedCap
            ? '\n\nThe run stopped at its per-run ceiling, so expired rows remain — it will continue on the next run.'
            : '';
        return {
            Subject: `Action-log purge: ${deleted} expired row(s) removed`,
            Body: `The scheduled action-log purge "${context.Schedule.Name}" removed ${deleted} expired log row(s)`
                + `${failed > 0 ? `, and could not remove ${failed}` : ''}.${capNote}`,
            Priority: failed > 0 ? 'High' : deleted > 0 ? 'Normal' : 'Low',
            Metadata: { Deleted: deleted, Failed: failed, ReachedCap: reachedCap },
        };
    }

    /**
     * Tolerant parse — the purge needs no configuration, so empty/missing JSON yields defaults.
     *
     * Named apart from the base's `parseConfiguration`, which throws on an empty Configuration
     * because most job types genuinely require one. This job's every setting is optional, and a job
     * that refused to run because nobody filled in a box would be a retention policy that quietly
     * never applies.
     */
    private readConfiguration(schedule: MJScheduledJobEntity): ActionLogRetentionJobConfiguration {
        if (!schedule.Configuration) {
            return {};
        }
        try {
            return JSON.parse(schedule.Configuration) as ActionLogRetentionJobConfiguration;
        } catch {
            return {};
        }
    }
}
