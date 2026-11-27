/**
 * @fileoverview The single-flight lease of a Feature Pipeline's re-derivation slice (PR 5 §5.2.4, D5-28, D5-41, D5-42,
 * D5-44).
 *
 * One run of a Record Process at a time re-derives its stale values: the run whose `ProcessRunID` holds the process's
 * `MJ: Feature Pipeline Rederivation Leases` row. Every read and write of the row runs in one transaction, on its own
 * provider instance, after the stored lock Query `Predictive Studio: Lock Rederivation Lease` (`UPDLOCK, HOLDLOCK,
 * NOWAIT`, through {@link FeatureValueLocks.Acquire}'s retry): two runs that start together read and take the lease one
 * after the other, so exactly one holds it. The lock Query returns the database clock (`DbNow`); every lease time is
 * written from it and every expiry is measured on it, never this host's clock, so a skewed host cannot take a live
 * lease (D5-44). A lease is free when there is no row, it was released, it was not renewed for {@link
 * RederivationLease.TTL_MINUTES} (database time), or its holder's Process Run has ended.
 *
 * The constants live here, not in the Predictive Studio engine (which depends on this package, D5-42).
 * @module @memberjunction/feature-pipelines
 */
import { RunInEntityTransaction, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeaturePipelineRederivationLeaseEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { MetadataProviderCapabilities } from '@memberjunction/record-set-processor-base';
import { FEATURE_VALUE_LOCK_SYSTEM_CLOCK, FeatureValueLocks, type FeatureValueLockClock, type FeatureValueLockRow } from '../cache/feature-value-locks.js';

/** The outcome of {@link RederivationLease.Acquire}. */
export type RederivationLeaseAcquisition = { Held: true; LeaseID: string } | { Held: false; HolderRunID: string };

/** The lease row as the lock Query returns it, with the database clock. */
interface LockedLease {
    DbNow: Date;
    ID: string | null;
    ProcessRunID: string | null;
    RenewedAt: Date | null;
    ReleasedAt: Date | null;
}

/** The Process Run statuses of a run that is still working (its lease is live while renewed). */
const LIVE_RUN_STATUSES: ReadonlyArray<MJProcessRunEntity['Status']> = ['Running', 'Pending'];

/** The re-derivation lease: taken, renewed and released under the lock Query, on the database clock. */
export class RederivationLease {
    /** A lease not renewed for this long (database time) has expired: 15 renewals missed (D5-41). */
    public static readonly TTL_MINUTES = 15;
    /** How often the holder renews, in seconds, besides before each batch (D5-41). */
    public static readonly RENEW_SECONDS = 60;
    /** The stored Query that locks a Record Process's lease row and returns the database clock. */
    public static readonly LOCK_QUERY = 'Predictive Studio: Lock Rederivation Lease';

    /**
     * Takes `recordProcessId`'s lease for `processRunId` when it is free (or already this run's), else names its holder.
     * @param clock the clock the lock wait sleeps on (tests pass one that does not wait); the lease never reads it
     * @throws FeatureValueLockTimeoutError when the lock is not acquired within the lock wait; Error when a read or save fails
     */
    public static async Acquire(recordProcessId: string, processRunId: string, provider: IMetadataProvider, contextUser: UserInfo,
        clock: FeatureValueLockClock = FEATURE_VALUE_LOCK_SYSTEM_CLOCK): Promise<RederivationLeaseAcquisition> {
        return RederivationLease.inTransaction(provider, async (unit) => {
            const lease = await RederivationLease.lock(recordProcessId, unit, contextUser, clock);
            if (lease.ID !== null && lease.ProcessRunID !== null && !(await RederivationLease.isFree(lease, processRunId, unit, contextUser))) {
                return { Held: false, HolderRunID: lease.ProcessRunID };
            }
            const id = await RederivationLease.take(recordProcessId, processRunId, lease, unit, contextUser);
            return { Held: true, LeaseID: id };
        });
    }

    /**
     * Renews the lease for `processRunId` when it still holds it (`RenewedAt` = the database clock); false when another
     * run took it or it was released (`lease-lost`: the caller makes no further call).
     * @throws FeatureValueLockTimeoutError when the lock is not acquired within the lock wait; Error when a save fails
     */
    public static async Renew(leaseId: string, processRunId: string, provider: IMetadataProvider, contextUser: UserInfo,
        clock: FeatureValueLockClock = FEATURE_VALUE_LOCK_SYSTEM_CLOCK): Promise<boolean> {
        return RederivationLease.updateHeld(leaseId, processRunId, provider, contextUser, clock, (row, dbNow) => { row.RenewedAt = dbNow; });
    }

    /**
     * Releases the lease at the end of `processRunId`'s run (`ReleasedAt` = the database clock); false when the run no
     * longer held it.
     * @throws FeatureValueLockTimeoutError when the lock is not acquired within the lock wait; Error when a save fails
     */
    public static async Release(leaseId: string, processRunId: string, provider: IMetadataProvider, contextUser: UserInfo,
        clock: FeatureValueLockClock = FEATURE_VALUE_LOCK_SYSTEM_CLOCK): Promise<boolean> {
        return RederivationLease.updateHeld(leaseId, processRunId, provider, contextUser, clock, (row, dbNow) => { row.ReleasedAt = dbNow; });
    }

    /** True when a held lease row may be taken by `processRunId` (measured on the database clock). */
    private static async isFree(lease: LockedLease, processRunId: string, unit: IMetadataProvider, contextUser: UserInfo): Promise<boolean> {
        if (lease.ProcessRunID === null || UUIDsEqual(lease.ProcessRunID, processRunId) || lease.ReleasedAt !== null) return true;
        const renewedAt = lease.RenewedAt ? lease.RenewedAt.getTime() : Number.NEGATIVE_INFINITY;
        if (lease.DbNow.getTime() - renewedAt >= RederivationLease.TTL_MINUTES * 60_000) return true;
        return !(await RederivationLease.holderIsLive(lease.ProcessRunID, unit, contextUser));
    }

    /** True while the holder's Process Run is still working (a run that ended cannot hold the slice). */
    private static async holderIsLive(holderRunId: string, unit: IMetadataProvider, contextUser: UserInfo): Promise<boolean> {
        const r = await RunView.FromMetadataProvider(unit).RunView<Pick<MJProcessRunEntity, 'ID' | 'Status'>>({
            EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${EscapeSQLString(holderRunId)}'`, Fields: ['ID', 'Status'], ResultType: 'simple', BypassCache: true,
        }, contextUser);
        if (!r.Success) throw new Error(`RederivationLease: reading the holder run '${holderRunId}' failed: ${r.ErrorMessage || 'unknown error'}`);
        const run = (r.Results || [])[0];
        return run !== undefined && LIVE_RUN_STATUSES.includes(run.Status);
    }

    /** Writes the lease for `processRunId` from the database clock: a new row, or the locked one taken over. */
    private static async take(recordProcessId: string, processRunId: string, lease: LockedLease, unit: IMetadataProvider, contextUser: UserInfo): Promise<string> {
        const row = await unit.GetEntityObject<MJFeaturePipelineRederivationLeaseEntity>('MJ: Feature Pipeline Rederivation Leases', contextUser);
        if (lease.ID !== null) {
            if (!(await row.Load(lease.ID))) throw new Error(`RederivationLease: the lease row '${lease.ID}' could not be loaded: ${row.LatestResult?.CompleteMessage ?? 'not found'}`);
        } else {
            row.NewRecord();
            row.RecordProcessID = recordProcessId;
        }
        row.ProcessRunID = processRunId;
        row.AcquiredAt = lease.DbNow;
        row.RenewedAt = lease.DbNow;
        row.ReleasedAt = null;
        if (!(await row.Save())) throw new Error(`RederivationLease: taking the lease of Record Process '${recordProcessId}' failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return row.ID;
    }

    /** Under the lock: applies `change` to the lease when `processRunId` still holds it; false when it does not. */
    private static async updateHeld(leaseId: string, processRunId: string, provider: IMetadataProvider, contextUser: UserInfo, clock: FeatureValueLockClock,
        change: (row: MJFeaturePipelineRederivationLeaseEntity, dbNow: Date) => void): Promise<boolean> {
        return RederivationLease.inTransaction(provider, async (unit) => {
            const row = await unit.GetEntityObject<MJFeaturePipelineRederivationLeaseEntity>('MJ: Feature Pipeline Rederivation Leases', contextUser);
            if (!(await row.Load(leaseId))) return false;
            const lease = await RederivationLease.lock(row.RecordProcessID, unit, contextUser, clock);
            // the row read under the lock decides: another run may have taken it between this run's renewals
            if (lease.ID === null || !UUIDsEqual(lease.ID, leaseId) || lease.ProcessRunID === null || !UUIDsEqual(lease.ProcessRunID, processRunId) || lease.ReleasedAt !== null) return false;
            if (!(await row.Load(leaseId))) return false;
            change(row, lease.DbNow);
            if (!(await row.Save())) throw new Error(`RederivationLease: updating the lease '${leaseId}' failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return true;
        });
    }

    /** Takes the lock and reads the lease row with the database clock. */
    private static async lock(recordProcessId: string, unit: IMetadataProvider, contextUser: UserInfo, clock: FeatureValueLockClock): Promise<LockedLease> {
        const rows = await FeatureValueLocks.Acquire(RederivationLease.LOCK_QUERY, { RecordProcessID: recordProcessId }, unit, contextUser, clock);
        const row: FeatureValueLockRow | undefined = rows[0];
        if (!row || row['DbNow'] === null || row['DbNow'] === undefined) {
            throw new Error(`RederivationLease: the lock Query '${RederivationLease.LOCK_QUERY}' returned no database clock for Record Process '${recordProcessId}'`);
        }
        return {
            DbNow: RederivationLease.dateOf(row['DbNow']) ?? new Date(Number.NaN),
            ID: RederivationLease.textOf(row['ID']),
            ProcessRunID: RederivationLease.textOf(row['ProcessRunID']),
            RenewedAt: RederivationLease.dateOf(row['RenewedAt']),
            ReleasedAt: RederivationLease.dateOf(row['ReleasedAt']),
        };
    }

    /** Runs `work` in one entity transaction on its own provider instance (the lock is held until it ends). */
    private static async inTransaction<T>(provider: IMetadataProvider, work: (unit: IMetadataProvider) => Promise<T>): Promise<T> {
        return MetadataProviderCapabilities.RunIsolated(provider, (unit) =>
            RunInEntityTransaction(MetadataProviderCapabilities.IsTransactionalProvider(unit) ? unit : null, () => work(unit)));
    }

    private static textOf(v: string | number | Date | null | undefined): string | null {
        return v === null || v === undefined || v === '' ? null : String(v);
    }

    private static dateOf(v: string | number | Date | null | undefined): Date | null {
        if (v === null || v === undefined || v === '') return null;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    }
}
