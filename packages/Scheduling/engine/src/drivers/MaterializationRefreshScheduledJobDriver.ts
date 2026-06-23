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
        const provider = Metadata.Provider as IMetadataProvider;

        // Candidate queue: non-disabled, scheduled materializations. Due-selection is done in JS
        // (engine.filterDue) so the date comparison stays engine-agnostic.
        const rv = new RunView();
        const candidates = await rv.RunView<MJMaterializedResultEntity>(
            {
                EntityName: 'MJ: Materialized Results',
                ExtraFilter: `Status <> 'Disabled' AND RefreshSchedule IS NOT NULL`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );

        const now = new Date();
        const due = MaterializationRefresher.filterDue(candidates.Results ?? [], now);

        const refresher = new MaterializationRefresher();
        let refreshed = 0;
        let failed = 0;
        const items: Array<Record<string, unknown>> = [];

        for (const mr of due) {
            void context.heartbeat?.();

            // Advance NextRefreshAt from this row's own cron (UTC). An invalid expression leaves it
            // unscheduled (logged via the item result) rather than faulting the whole sweep.
            let nextRefreshAt: Date | null = null;
            try {
                nextRefreshAt = mr.RefreshSchedule ? CronExpressionHelper.GetNextRunTime(mr.RefreshSchedule, 'UTC', now) : null;
            } catch {
                nextRefreshAt = null;
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
