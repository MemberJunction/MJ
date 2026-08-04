/**
 * @fileoverview Server-side `MJ: Record Processes` entity — reconciles the process's recurrence
 * trigger. When a Record Process is saved with `ScheduleEnabled` + a `CronExpression` (and Status
 * Active), this owns a matching `MJ: Scheduled Jobs` row of the "Run Record Process" type; when the
 * schedule is turned off (or the process is not Active), it disables that owned job. The process
 * definition is the single source of truth — editing it keeps its schedule in sync, no separate
 * Scheduled Job management.
 *
 * (On-change reconciliation — owning an Entity Action — is a separate follow-up; see the plan §18.)
 * @module @memberjunction/core-entities-server
 */

import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJRecordProcessEntity, MJScheduledJobEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';

/** The `MJ: Scheduled Job Types.Name` seeded for record-process recurrence (metadata-driven). */
const RUN_RECORD_PROCESS_JOB_TYPE = 'Run Record Process';

/** Fields whose change can affect the owned Scheduled Job — reconcile only when one is dirty. */
const SCHEDULE_RELEVANT_FIELDS = ['ScheduleEnabled', 'CronExpression', 'Timezone', 'Status', 'Name'] as const;

/** Whether the owned Scheduled Job should be active or disabled, given the process's schedule state. */
export type ScheduleAction = 'upsert' | 'disable';

/**
 * PURE decision (exported for tests): a process owns an *active* recurrence job only when it is
 * `Active`, has `ScheduleEnabled`, and carries a non-empty `CronExpression`; otherwise the owned
 * job (if any) is disabled.
 */
export function decideScheduleAction(p: { status: string; scheduleEnabled: boolean; cronExpression: string | null }): ScheduleAction {
    return p.status === 'Active' && p.scheduleEnabled && !!p.cronExpression ? 'upsert' : 'disable';
}

/** PURE mapping (exported for tests): the Scheduled Job field values for an active recurrence. */
export function buildScheduledJobFields(p: {
    jobTypeID: string;
    recordProcessName: string;
    cronExpression: string;
    timezone: string | null;
    recordProcessID: string;
}): { JobTypeID: string; Name: string; CronExpression: string; Timezone: string; Configuration: string; Status: 'Active' } {
    return {
        JobTypeID: p.jobTypeID,
        Name: `Record Process: ${p.recordProcessName}`,
        CronExpression: p.cronExpression,
        Timezone: p.timezone ?? 'UTC',
        Configuration: JSON.stringify({ RecordProcessID: p.recordProcessID }),
        Status: 'Active',
    };
}

@RegisterClass(BaseEntity, 'MJ: Record Processes')
export class MJRecordProcessEntityServer extends MJRecordProcessEntity {
    /**
     * Persists the record, then (best-effort) reconciles the owned Scheduled Job. Reconciliation
     * runs only when a schedule-relevant field changed (or on first save), and never fails the
     * save — the record itself is valid; a reconciliation error is logged for the operator.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const shouldReconcile = !this.IsSaved || this.scheduleFieldsDirty();
        const saved = await super.Save(options);
        if (saved && shouldReconcile) {
            try {
                await this.reconcileScheduledJob();
            } catch (e) {
                LogError(`MJRecordProcessEntityServer: schedule reconciliation failed for '${this.Name}' (${this.ID}): ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return saved;
    }

    /** True when any field affecting the owned Scheduled Job is dirty (fast-path before save). */
    private scheduleFieldsDirty(): boolean {
        return SCHEDULE_RELEVANT_FIELDS.some((f) => this.GetFieldByName(f)?.Dirty ?? false);
    }

    /** Ensures the owned Scheduled Job matches the process's current schedule state. */
    private async reconcileScheduledJob(): Promise<void> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;
        const typeID = await this.resolveJobTypeID(user);
        const existing = await this.findOwnedJob(typeID, user);

        const action = decideScheduleAction({ status: this.Status, scheduleEnabled: this.ScheduleEnabled, cronExpression: this.CronExpression });
        if (action === 'disable') {
            await this.disableJobIfPresent(existing);
            return;
        }
        await this.upsertActiveJob(typeID, existing, md, user);
    }

    /** Resolves the "Run Record Process" Scheduled Job Type ID, or throws if the seed is absent. */
    private async resolveJobTypeID(user: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<MJScheduledJobTypeEntity>({
            EntityName: 'MJ: Scheduled Job Types',
            ExtraFilter: `Name='${RUN_RECORD_PROCESS_JOB_TYPE}'`,
            ResultType: 'simple',
        }, user);
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Scheduled Job Type '${RUN_RECORD_PROCESS_JOB_TYPE}' not found — has the metadata seed been pushed?`);
        }
        return result.Results[0].ID;
    }

    /** Finds the Scheduled Job this process owns (matched by Configuration.RecordProcessID). */
    private async findOwnedJob(typeID: string, user: UserInfo): Promise<MJScheduledJobEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJScheduledJobEntity>({
            EntityName: 'MJ: Scheduled Jobs',
            ExtraFilter: `JobTypeID='${typeID}'`,
            ResultType: 'entity_object',
        }, user);
        if (!result.Success) {
            return null;
        }
        return result.Results.find((job) => {
            const cfg = SafeJSONParse<{ RecordProcessID?: string }>(job.Configuration ?? '');
            return !!cfg?.RecordProcessID && UUIDsEqual(cfg.RecordProcessID, this.ID);
        }) ?? null;
    }

    /** Creates or updates the owned Scheduled Job to match the process's active schedule. */
    private async upsertActiveJob(typeID: string, existing: MJScheduledJobEntity | null, md: IMetadataProvider, user: UserInfo): Promise<void> {
        const job = existing ?? await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
        if (!existing) {
            job.NewRecord();
            if (this.ContextCurrentUser?.ID) {
                job.OwnerUserID = this.ContextCurrentUser.ID;
            }
        }
        const fields = buildScheduledJobFields({
            jobTypeID: typeID,
            recordProcessName: this.Name,
            cronExpression: this.CronExpression as string,
            timezone: this.Timezone,
            recordProcessID: this.ID,
        });
        job.JobTypeID = fields.JobTypeID;
        job.Name = fields.Name;
        job.CronExpression = fields.CronExpression;
        job.Timezone = fields.Timezone;
        job.Configuration = fields.Configuration;
        job.Status = fields.Status;

        const saved = await job.Save();
        if (!saved) {
            throw new Error(`failed saving Scheduled Job for record process '${this.Name}': ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /** Disables the owned Scheduled Job if one exists and isn't already disabled. */
    private async disableJobIfPresent(existing: MJScheduledJobEntity | null): Promise<void> {
        if (!existing || existing.Status === 'Disabled') {
            return;
        }
        existing.Status = 'Disabled';
        const saved = await existing.Save();
        if (!saved) {
            throw new Error(`failed disabling Scheduled Job for record process '${this.Name}': ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
}
