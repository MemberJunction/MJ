import { randomUUID } from 'node:crypto';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { LogErrorEx, LogStatusEx } from '@memberjunction/core';
import type { MJCompanyIntegrationRunEntity } from '@memberjunction/core-entities';

/**
 * Thrown at a batch boundary when this process discovers it no longer owns the
 * run row (lease reclaimed by a stale-sweep or another worker bumped the fence).
 * The sync loop MUST let this propagate — per-record error handling must never
 * swallow it, because continuing to write after ownership loss is exactly the
 * split-brain hazard the fence exists to prevent.
 */
export class RunOwnershipLostError extends Error {
    public readonly RunID: string;
    constructor(runID: string, detail: string) {
        super(`Ownership of CompanyIntegrationRun ${runID} lost: ${detail}`);
        this.name = 'RunOwnershipLostError';
        this.RunID = runID;
    }
}

/** Result of a lease renewal attempt. */
export interface RenewResult {
    /** True when the DB confirmed our token+fence still own the row and extended the lease. */
    Renewed: boolean;
    /** True when a cooperative cancel has been requested on the run row (only meaningful when Renewed). */
    CancelRequested: boolean;
}

/** Result of a batch-boundary ownership check. */
export interface BoundaryCheckResult {
    /** True when the row's OwnerToken + FenceToken still match ours. */
    Owned: boolean;
    /** True when CancelRequestedAt is set on the row. */
    CancelRequested: boolean;
}

/** Options for the background heartbeat started via {@link RunOwnershipService.StartHeartbeat}. */
export interface HeartbeatOptions {
    /**
     * Called (once) when a renewal discovers ownership has been lost. The engine
     * uses this to abort the in-flight sync locally; writes are additionally
     * fenced at every batch boundary, so this is fast-fail, not the safety net.
     */
    onLost?: () => void;
    /** Called (once per request) when a renewal observes CancelRequestedAt set. */
    onCancelRequested?: () => void;
    /** Supplies the latest progress JSON to piggyback on each renewal write. */
    progressSupplier?: () => string | null;
}

/** Shape of the row returned by spClaimCompanyIntegrationRun / spRenewCompanyIntegrationRunLease. */
interface LeaseRow {
    FenceToken: number;
    LeaseExpiresAt: string | Date;
    CancelRequestedAt?: string | Date | null;
}

/**
 * Per-run ownership manager for durable CompanyIntegrationRun execution
 * (GH tasks.md PR 1). One instance is created per sync run and owns:
 *
 * - **Claim**: a single atomic UPDATE...WHERE (unowned OR lease expired) via
 *   spClaimCompanyIntegrationRun — never select-then-update. Claiming bumps
 *   FenceToken, invalidating any prior holder's writes.
 * - **Renew**: timer-driven lease extension (interval ≈ lease/3) via
 *   spRenewCompanyIntegrationRunLease, token+fence-checked. The renewal result
 *   doubles as the cross-process cancel signal (returns CancelRequestedAt).
 * - **Boundary fence**: {@link CheckBoundary} — a cheap SELECT the sync loop
 *   calls before every batch's writes. Ownership lost ⇒ the loop throws
 *   {@link RunOwnershipLostError} and writes nothing further.
 * - **Release**: terminal status write + owner clear, token-checked so a stale
 *   holder's release no-ops.
 *
 * All sproc calls use the dialect-portable positional-parameter convention
 * (same pattern as ScheduledJobEngine's lock sprocs): SQL Server binds the
 * sproc's named params to positional `@pN` placeholders via EXEC; PostgreSQL
 * calls the plpgsql port via `SELECT * FROM fn($1,...)`. The SAME value array
 * serves both.
 */
export class RunOwnershipService {
    /** Default lease when the caller supplies no MaxRuntimeMinutes. */
    public static readonly DEFAULT_LEASE_MINUTES = 10;

    private readonly provider: DatabaseProviderBase;
    private readonly contextUser: UserInfo | undefined;
    private readonly runID: string;
    private readonly ownerToken: string;
    private readonly leaseMinutes: number;

    private fenceToken: number | null = null;
    private lastKnownLeaseExpiresAt: Date | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private lostNotified = false;
    private cancelNotified = false;
    private renewInFlight = false;

    /**
     * @param provider the run's OWN provider connection (per-run, never a shared
     *        engine-level provider — see the per-run-connection requirement).
     * @param runID CompanyIntegrationRun.ID this service governs.
     * @param leaseMinutes lease length; callers pass
     *        max(DEFAULT_LEASE_MINUTES, options.MaxRuntimeMinutes ?? 0) so a
     *        long-batch override only ever EXTENDS protection.
     */
    constructor(provider: DatabaseProviderBase, runID: string, leaseMinutes?: number, contextUser?: UserInfo) {
        this.provider = provider;
        this.runID = runID;
        this.contextUser = contextUser;
        // Cryptographic UUID — token identity IS execution identity; a collision
        // between concurrent workers would defeat the fence.
        this.ownerToken = randomUUID();
        this.leaseMinutes = Math.max(RunOwnershipService.DEFAULT_LEASE_MINUTES, leaseMinutes ?? 0);
    }

    /** The CompanyIntegrationRun ID this service governs. */
    public get RunID(): string {
        return this.runID;
    }

    /** The opaque owner token minted for this execution. */
    public get OwnerToken(): string {
        return this.ownerToken;
    }

    /** The fence token returned by the successful claim (null before claim). */
    public get FenceToken(): number | null {
        return this.fenceToken;
    }

    /** Last lease expiry the DB confirmed for us (null before claim). */
    public get LeaseExpiresAt(): Date | null {
        return this.lastKnownLeaseExpiresAt;
    }

    /** Lease length in minutes this service renews with. */
    public get LeaseMinutes(): number {
        return this.leaseMinutes;
    }

    /**
     * Atomically claim the run row. Returns true iff WE now own it (the sproc's
     * single UPDATE succeeded because the row was unowned or its lease had
     * expired). On success the DB-assigned FenceToken (bumped by the claim) and
     * lease expiry are cached for renewals and boundary checks.
     */
    public async Claim(): Promise<boolean> {
        const rows = await this.provider.ExecuteSQL<LeaseRow>(
            this.buildSprocCall('spClaimCompanyIntegrationRun', ['RunID', 'OwnerToken', 'LeaseMinutes']),
            [this.runID, this.ownerToken, this.leaseMinutes],
            { isMutation: true, description: 'spClaimCompanyIntegrationRun' },
            this.contextUser
        );
        const row = rows?.[0];
        if (!row) {
            return false; // someone else holds a live lease
        }
        this.fenceToken = Number(row.FenceToken);
        this.lastKnownLeaseExpiresAt = new Date(row.LeaseExpiresAt);
        return true;
    }

    /**
     * Renew the lease (token+fence-checked). Zero rows back ⇒ ownership lost.
     * Optionally piggybacks a progress snapshot onto the same write, and always
     * surfaces the row's CancelRequestedAt so the heartbeat doubles as the
     * cross-process cancel poll.
     */
    public async Renew(progressJSON?: string | null): Promise<RenewResult> {
        if (this.fenceToken == null) {
            return { Renewed: false, CancelRequested: false };
        }
        const rows = await this.provider.ExecuteSQL<LeaseRow>(
            this.buildSprocCall('spRenewCompanyIntegrationRunLease',
                ['RunID', 'OwnerToken', 'FenceToken', 'LeaseMinutes', 'ProgressJSON']),
            [this.runID, this.ownerToken, this.fenceToken, this.leaseMinutes, progressJSON ?? null],
            { isMutation: true, description: 'spRenewCompanyIntegrationRunLease' },
            this.contextUser
        );
        const row = rows?.[0];
        if (!row) {
            return { Renewed: false, CancelRequested: false };
        }
        this.lastKnownLeaseExpiresAt = new Date(row.LeaseExpiresAt);
        return { Renewed: true, CancelRequested: row.CancelRequestedAt != null };
    }

    /**
     * Batch-boundary fence: a cheap SELECT of the ownership columns. The sync
     * loop calls this BEFORE each batch's writes; if we no longer own the row,
     * the caller must throw {@link RunOwnershipLostError} and stop writing.
     * Deliberately a plain read (no lease extension) — renewal belongs to the
     * heartbeat timer, and a boundary check must stay cheap enough to run
     * every batch.
     */
    public async CheckBoundary(): Promise<BoundaryCheckResult> {
        const d = this.provider.Dialect;
        const schema = d.QuoteIdentifier(this.provider.MJCoreSchemaName);
        const table = d.QuoteIdentifier('CompanyIntegrationRun');
        const placeholder = this.provider.BuildParameterPlaceholder(0);
        const rows = await this.provider.ExecuteSQL<{ OwnerToken: string | null; FenceToken: number; CancelRequestedAt: string | Date | null }>(
            `SELECT ${d.QuoteIdentifier('OwnerToken')} AS OwnerToken, ` +
            `${d.QuoteIdentifier('FenceToken')} AS FenceToken, ` +
            `${d.QuoteIdentifier('CancelRequestedAt')} AS CancelRequestedAt ` +
            `FROM ${schema}.${table} WHERE ${d.QuoteIdentifier('ID')} = ${placeholder}`,
            [this.runID],
            { isMutation: false, description: 'CompanyIntegrationRun ownership boundary check' },
            this.contextUser
        );
        const row = rows?.[0];
        if (!row) {
            return { Owned: false, CancelRequested: false }; // row gone ⇒ definitely not ours
        }
        const owned = row.OwnerToken != null
            && row.OwnerToken.toLowerCase() === this.ownerToken.toLowerCase()
            && Number(row.FenceToken) === this.fenceToken;
        return { Owned: owned, CancelRequested: row.CancelRequestedAt != null };
    }

    /**
     * Terminal release: set the final status, clear OwnerToken/LeaseExpiresAt,
     * stamp EndedAt if unset. Token- AND fence-checked — a stale holder (lease
     * reclaimed) releasing late is a harmless no-op (returns false).
     *
     * The fence is sent for the same reason Renew() sends it: the owner token proves
     * only that *some* context using this token owns the row, not that THIS context
     * still does. Each instance mints its own token and claims once, so the two are
     * equivalent today — but Claim() is re-callable and overwrites the fence, so
     * passing it keeps the guarantee in the procedure rather than in call-site
     * discipline.
     */
    public async Release(finalStatus: 'Success' | 'Failed'): Promise<boolean> {
        this.StopHeartbeat();
        const rows = await this.provider.ExecuteSQL<{ ID: string }>(
            this.buildSprocCall('spReleaseCompanyIntegrationRun', ['RunID', 'OwnerToken', 'FinalStatus', 'FenceToken']),
            [this.runID, this.ownerToken, finalStatus, this.fenceToken],
            { isMutation: true, description: 'spReleaseCompanyIntegrationRun' },
            this.contextUser
        );
        return (rows?.length ?? 0) > 0;
    }

    /**
     * Start the background renewal timer at interval ≈ lease/3 (so a renewal
     * must fail ~3 consecutive times before the lease can lapse). The timer
     * body is best-effort and never throws; renewal failures surface through
     * opts.onLost exactly once. Idempotent — restarting replaces the timer.
     */
    public StartHeartbeat(opts?: HeartbeatOptions): void {
        this.StopHeartbeat();
        const intervalMs = Math.max(5_000, Math.floor((this.leaseMinutes * 60_000) / 3));
        this.heartbeatTimer = setInterval(() => {
            void this.heartbeatOnce(opts);
        }, intervalMs);
        // Never keep the process alive just to renew a lease.
        this.heartbeatTimer.unref?.();
    }

    /** Stop the renewal timer (idempotent). */
    public StopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Sync the entity's in-memory ownership columns to the service's last-known
     * authoritative values before ANY full-row `run.Save()`. The generated
     * spUpdate writes every column from the entity's in-memory state, so a
     * terminal Save without this sync would clobber the DB's live
     * FenceToken/OwnerToken/LeaseExpiresAt with the stale values the entity was
     * loaded with (typically pre-claim). Call this immediately before each
     * Save on the run row; Release() then clears ownership atomically.
     */
    public SyncEntityOwnershipFields(run: MJCompanyIntegrationRunEntity): void {
        run.OwnerToken = this.ownerToken;
        run.LeaseExpiresAt = this.lastKnownLeaseExpiresAt;
        run.HeartbeatAt = new Date();
        if (this.fenceToken != null) {
            run.FenceToken = this.fenceToken;
        }
    }

    private lastProgressWriteMs = 0;

    /**
     * Persist a progress snapshot to the run row's ProgressJSON (PR 1 item 4 —
     * progress lives in the database; readers query the row). Ownership-guarded
     * (WHERE OwnerToken AND FenceToken) so a reclaimed run can never overwrite the
     * new owner's progress. Throttled internally (default once per 5s) so progress
     * never becomes its own hot path; best-effort — a progress write failure must
     * never fault the sync.
     */
    public async WriteProgress(progressJSON: string, minIntervalMs = 5_000): Promise<void> {
        if (this.fenceToken == null) return;
        const now = Date.now();
        if (now - this.lastProgressWriteMs < minIntervalMs) return;
        this.lastProgressWriteMs = now;
        try {
            const d = this.provider.Dialect;
            const schema = d.QuoteIdentifier(this.provider.MJCoreSchemaName);
            const table = d.QuoteIdentifier('CompanyIntegrationRun');
            const ph = (i: number) => this.provider.BuildParameterPlaceholder(i);
            await this.provider.ExecuteSQL(
                `UPDATE ${schema}.${table} SET ${d.QuoteIdentifier('ProgressJSON')} = ${ph(0)}, ` +
                `${d.QuoteIdentifier('HeartbeatAt')} = ${d.CurrentTimestampUTC()} ` +
                `WHERE ${d.QuoteIdentifier('ID')} = ${ph(1)} AND ${d.QuoteIdentifier('OwnerToken')} = ${ph(2)} ` +
                `AND ${d.QuoteIdentifier('FenceToken')} = ${ph(3)}`,
                [progressJSON, this.runID, this.ownerToken, this.fenceToken],
                { isMutation: true, description: 'CompanyIntegrationRun progress write (ownership-guarded)' },
                this.contextUser
            );
        } catch (error) {
            LogErrorEx({
                message: `[RunOwnership] Progress write failed for run ${this.runID.substring(0, 8)} (non-fatal)`,
                category: 'IntegrationEngine',
                error: error instanceof Error ? error : undefined,
            });
        }
    }

    /** One heartbeat tick: renew, then fan out lost/cancel notifications once each. */
    private async heartbeatOnce(opts?: HeartbeatOptions): Promise<void> {
        if (this.renewInFlight) {
            return; // never stack renewals behind a slow DB
        }
        this.renewInFlight = true;
        try {
            const progress = opts?.progressSupplier ? opts.progressSupplier() : null;
            const result = await this.Renew(progress);
            if (!result.Renewed) {
                if (!this.lostNotified) {
                    this.lostNotified = true;
                    LogStatusEx({
                        message: `[RunOwnership] Lease for run ${this.runID.substring(0, 8)} NOT renewed ` +
                            `(token/fence mismatch — reclaimed by another holder). Aborting locally.`,
                        category: 'IntegrationEngine',
                    });
                    opts?.onLost?.();
                }
                this.StopHeartbeat(); // no point renewing a lost lease
                return;
            }
            if (result.CancelRequested && !this.cancelNotified) {
                this.cancelNotified = true;
                opts?.onCancelRequested?.();
            }
        } catch (error) {
            // Best-effort: a transient renewal failure must never fault the sync.
            // The lease covers ~3 intervals, so one failed tick is survivable.
            LogErrorEx({
                message: `[RunOwnership] Lease renewal failed for run ${this.runID.substring(0, 8)} (non-fatal)`,
                category: 'IntegrationEngine',
                error: error instanceof Error ? error : undefined,
            });
        } finally {
            this.renewInFlight = false;
        }
    }

    /**
     * Dialect-portable sproc call, preserving the MJ positional-parameter-array
     * convention (same helper shape as ScheduledJobEngine.buildLockSprocCall).
     */
    private buildSprocCall(sprocName: string, paramNames: string[]): string {
        const placeholders = this.provider.PlatformKey === 'postgresql'
            ? paramNames.map((_name, i) => `$${i + 1}`)
            : paramNames.map((name, i) => `@${name}=@p${i}`);
        return this.provider.Dialect.ProcedureCallSyntax(this.provider.MJCoreSchemaName, sprocName, placeholders);
    }
}
