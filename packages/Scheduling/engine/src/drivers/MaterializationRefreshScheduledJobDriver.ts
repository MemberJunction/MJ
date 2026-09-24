/**
 * @fileoverview Scheduled-job driver that refreshes due materialized results on a cron schedule —
 * sibling to RecordProcessScheduledJobDriver / ActionScheduledJobDriver. Delegates the actual
 * rebuild to the @memberjunction/materialization engine.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { ValidationResult, RunView, Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJMaterializedResultEntity } from '@memberjunction/core-entities';
import { MaterializationRefresher } from '@memberjunction/materialization';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import { CronExpressionHelper } from '../CronExpressionHelper';

/**
 * Driver for the materialization refresh sweep (materialization plan §11.1).
 *
 * Unlike most drivers, this one has **no per-job configuration** — it processes the entire due queue:
 * every non-disabled, scheduled `MJ: Materialized Results` row whose `NextRefreshAt` is at/before now
 * (or null). Each is refreshed via the engine (full rebuild + atomic wrapper-view swap) and its
 * `NextRefreshAt` is advanced from its own `RefreshSchedule` cron. Per-materialization cadence lives
 * on the rows; this job just needs to run often enough to honor the smallest cadence.
 */
@RegisterClass(BaseScheduledJob, 'MaterializationRefreshScheduledJobDriver')
export class MaterializationRefreshScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const provider = Metadata.Provider as IMetadataProvider; // global-provider-ok: scheduled job runs in the server's single default-provider context

        // Candidate queue: scheduled materializations that are neither disabled nor held for drift
        // review (§13/§17.2 — DriftHold rows stop refreshing until a human resolves the drift).
        // Due-selection is done in JS (engine.filterDue) so the date comparison stays engine-agnostic.
        const rv = new RunView();
        const candidates = await rv.RunView<MJMaterializedResultEntity>(
            {
                EntityName: 'MJ: Materialized Results',
                ExtraFilter: `Status NOT IN ('Disabled', 'DriftHold') AND RefreshSchedule IS NOT NULL`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        // RunView returns Success:false (never throws) on failure. Without this check a failed candidate
        // load yields an empty due set and the sweep reports GREEN while silently refreshing nothing —
        // masking a total refresh outage. Surface it as a job failure instead.
        if (!candidates.Success) {
            return {
                Success: false,
                ErrorMessage: `Failed to load due materializations: ${candidates.ErrorMessage ?? 'unknown error'}`,
                Details: { DueCount: 0, Refreshed: 0, Failed: 0, Items: [] },
            };
        }

        const now = new Date();
        const due = MaterializationRefresher.filterDue(candidates.Results ?? [], now);

        const refresher = new MaterializationRefresher();
        let refreshed = 0;
        let failed = 0;
        const items: Array<Record<string, unknown>> = [];

        for (const mr of due) {
            void context.heartbeat?.();

            // Advance NextRefreshAt from this row's own cron (UTC). Candidates are pre-filtered to
            // RefreshSchedule IS NOT NULL, so a throw here means a MALFORMED cron. In that case we must
            // NOT refresh: RefreshOne would set NextRefreshAt=null, which filterDue treats as due, so the
            // expensive full-rebuild-with-swap would run on EVERY sweep forever. Instead surface it as a
            // failed item and skip — the row stays selected but untouched until the cron is corrected.
            let nextRefreshAt: Date;
            try {
                nextRefreshAt = CronExpressionHelper.GetNextRunTime(mr.RefreshSchedule as string, 'UTC', now);
            } catch {
                failed++;
                items.push({ ID: mr.ID, TableName: mr.TableName, Success: false, Error: `Invalid RefreshSchedule cron "${mr.RefreshSchedule}" — skipped (not refreshed) until corrected.` });
                continue;
            }

            const result = await refresher.RefreshOne(mr, context.ContextUser, provider, { nextRefreshAt });
            if (result.Success) {
                refreshed++;
            } else {
                failed++;
            }
            items.push({ ID: mr.ID, TableName: mr.TableName, Success: result.Success, RowCount: result.RowCount, Error: result.ErrorMessage });
        }

        return {
            Success: failed === 0,
            ErrorMessage: failed > 0 ? `${failed} materialization(s) failed to refresh` : undefined,
            Details: { DueCount: due.length, Refreshed: refreshed, Failed: failed, Items: items },
        };
    }

    /** No per-job configuration — the driver always sweeps the whole due queue. */
    public ValidateConfiguration(): ValidationResult {
        return new ValidationResult();
    }

    public FormatNotification(_context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const d = result.Details ?? {};
        return {
            Subject: `Materialization refresh — ${result.Success ? 'OK' : 'errors'}`,
            Body: `Refreshed ${d.Refreshed ?? 0} of ${d.DueCount ?? 0} due materialization(s)${(d.Failed ?? 0) > 0 ? `; ${d.Failed} failed` : ''}.`,
            Priority: result.Success ? 'Normal' : 'High',
        };
    }
}
