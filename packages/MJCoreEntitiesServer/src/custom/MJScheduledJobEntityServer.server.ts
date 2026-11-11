import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { CronExpressionHelper } from '@memberjunction/scheduling-engine';

/**
 * Server-side `MJ: Scheduled Jobs` entity. Keeps a saved job's `NextRunAt` in step with its
 * schedule.
 *
 * The scheduler only fills in a `NextRunAt` that is missing (at startup, and for jobs that
 * arrive without one while polling). An existing job whose `CronExpression` or `Timezone` is
 * edited would otherwise keep the `NextRunAt` computed from the OLD schedule, so the new
 * schedule only takes effect after one more run on the old one. That made screens set
 * `NextRunAt` by hand after every edit.
 *
 * On Save of an existing job whose cron or time zone changed, this recomputes `NextRunAt` as
 * the next occurrence of the new schedule from now. Rules:
 * - A `NextRunAt` the caller set on this save wins (dirty and non-null), as in
 *   `MJUserRoutineEntityServer`.
 * - New jobs are left alone: the scheduler seeds them, honouring `RunImmediatelyIfNeverRun`.
 * - An invalid cron or time zone leaves `NextRunAt` untouched; the save proceeds as before.
 */
@RegisterClass(BaseEntity, 'MJ: Scheduled Jobs')
export class MJScheduledJobEntityServer extends MJScheduledJobEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        this.recomputeNextRunAtIfScheduleChanged();
        return super.Save(options);
    }

    /** Recompute NextRunAt from the new schedule when an existing job's cron or time zone changed. */
    private recomputeNextRunAtIfScheduleChanged(): void {
        if (!this.IsSaved || !this.scheduleChanged() || this.nextRunAtSetByCaller()) {
            return;
        }
        try {
            this.NextRunAt = CronExpressionHelper.GetNextRunTime(this.CronExpression, this.Timezone || 'UTC', new Date());
        } catch {
            // Invalid cron or time zone: keep the stored NextRunAt rather than guess.
        }
    }

    private scheduleChanged(): boolean {
        return ['CronExpression', 'Timezone'].some(fieldName => this.GetFieldByName(fieldName)?.Dirty === true);
    }

    private nextRunAtSetByCaller(): boolean {
        return this.NextRunAt != null && this.GetFieldByName('NextRunAt')?.Dirty === true;
    }
}
