/**
 * @fileoverview Server-side `MJ: Record Processes` entity — reconciles the process's recurrence
 * trigger. When a Record Process is saved with `ScheduleEnabled` + a `CronExpression` (and Status
 * Active), this owns a matching `MJ: Scheduled Jobs` row of the "Run Record Process" type; when the
 * schedule is turned off (or the process is not Active), it disables that owned job. The process
 * definition is the single source of truth — editing it keeps its schedule in sync, no separate
 * Scheduled Job management.
 *
 * It also owns the **on-change** trigger the same way: `OnChangeEnabled` reconciles an Entity Action
 * binding on the process's target entity, and `OnChangeFilter` compiles into that binding's Action
 * Filter — which is what those two columns have always claimed to do. The substrate work lives in
 * `RecordProcessOnChangeReconciler` so this class stays a dispatcher rather than growing a second
 * hundred-line reconciler inside `Save()`.
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
import { ReconcileRecordProcessOnChange } from './RecordProcessOnChangeReconciler';

/** The `MJ: Scheduled Job Types.Name` seeded for record-process recurrence (metadata-driven). */
const RUN_RECORD_PROCESS_JOB_TYPE = 'Run Record Process';

/** Fields whose change can affect the owned Scheduled Job — reconcile only when one is dirty. */
const SCHEDULE_RELEVANT_FIELDS = ['ScheduleEnabled', 'CronExpression', 'Timezone', 'Status', 'Name'] as const;

/**
 * Fields whose change can affect the owned Entity Action binding.
 *
 * `EntityID` is in the list because the binding is anchored to it: repointing a process at a
 * different entity while its old binding still fires would leave the process running against
 * records it no longer describes.
 */
const ON_CHANGE_RELEVANT_FIELDS = ['OnChangeEnabled', 'OnChangeInvocationType', 'OnChangeFilter', 'Status', 'EntityID'] as const;

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
        // Both reads happen BEFORE the save, because saving resets every dirty flag — asking
        // afterwards would report that nothing changed and reconcile nothing, forever.
        const isNew = !this.IsSaved;
        const reconcileSchedule = isNew || this.anyFieldDirty(SCHEDULE_RELEVANT_FIELDS);
        const reconcileOnChange = isNew || this.anyFieldDirty(ON_CHANGE_RELEVANT_FIELDS);

        const saved = await super.Save(options);
        if (!saved) return saved;

        if (reconcileSchedule) {
            await this.reconcileSafely('schedule', () => this.reconcileScheduledJob());
        }
        if (reconcileOnChange) {
            await this.reconcileSafely('on-change', () => this.reconcileOnChangeBinding());
        }
        return saved;
    }

    /**
     * Runs one reconciliation without letting it fail the save.
     *
     * The record itself is valid and already persisted; a substrate error is an operator problem,
     * not a reason to reject the user's edit. Each trigger is wrapped separately so a failure in one
     * cannot skip the other — a process whose schedule reconciliation broke should still get its
     * on-change binding.
     */
    private async reconcileSafely(label: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (e) {
            LogError(
                `MJRecordProcessEntityServer: ${label} reconciliation failed for '${this.Name}' (${this.ID}): ` +
                `${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    /** True when any of the named fields is dirty (fast-path, read before the save clears them). */
    private anyFieldDirty(fields: readonly string[]): boolean {
        return fields.some((f) => this.GetFieldByName(f)?.Dirty ?? false);
    }

    /** Ensures the owned Entity Action binding matches the process's on-change settings. */
    private async reconcileOnChangeBinding(): Promise<void> {
        await ReconcileRecordProcessOnChange(this, {
            Provider: this.ProviderToUse as unknown as IMetadataProvider,
            ContextUser: this.ContextCurrentUser,
        });
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
