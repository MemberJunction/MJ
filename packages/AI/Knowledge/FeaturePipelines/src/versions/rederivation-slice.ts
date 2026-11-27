/**
 * @fileoverview The budgeted re-derivation slice of a Feature Pipeline run (PR 5 §5.2.4, D5-14, D5-28, D5-41).
 *
 * After a version change a run re-derives at most `maxValuesPerRun` stale values and spends at most `maxUsdPerRun` on
 * them, the values whose open row is oldest (`EffectiveAsOf`) first; each later run continues until none remain. Only
 * the run that holds the Record Process's re-derivation lease ({@link RederivationLease}) re-derives; another one
 * re-derives none and records `Yielded`. Each call first reserves its estimated cost and value ({@link
 * RederivationSlice.Reserve}), replaced by its real cost on return ({@link RederivationSlice.Settle}), so with
 * `MaxConcurrency` calls in flight a run overspends only by what those calls cost above their estimate.
 *
 * {@link RederivationRun} is one run's slice: the stale records, the slice it may re-derive, its budget, its lease and
 * the result stored on the run. `InferProcessor` drives it from its run loop (owner-batch item 2, D5-21).
 * @module @memberjunction/feature-pipelines
 */
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsPlainObject, SafeJSONParse } from '@memberjunction/global';
import { RederivationEstimator, type RederivationChange, type RederivationEstimate } from './rederivation-estimator.js';
import { RederivationLease } from './rederivation-lease.js';
import type { FeaturePipelineRederivationResult } from './feature-pipeline-run-results.js';

/** The per-run budget of a pipeline's re-derivation (`rederivation` in the Record Process configuration, D5-14). */
export interface RederivationConfig {
    /** The most a run spends on re-derivation calls, in USD. */
    maxUsdPerRun: number;  // case-violation-ok-legacy-back-compat: the Record Process configuration's own JSON key (D5-14)
    /** The most stale values a run re-derives. */
    maxValuesPerRun: number;  // case-violation-ok-legacy-back-compat: the Record Process configuration's own JSON key (D5-14)
}

/** A run's budget as it reserves and spends it. */
export interface RederivationBudgetState {
    readonly MaxUsd: number;
    readonly MaxValues: number;
    /** What settled calls cost. */
    SpentUsd: number;
    /** What calls in flight reserved. */
    ReservedUsd: number;
    /** Values settled calls re-derived. */
    Values: number;
    /** Values calls in flight reserved. */
    ReservedValues: number;
}

/** A stale record: its open value's `EffectiveAsOf` (the oldest of its features'), oldest first. */
export interface StaleRederivationRecord {
    RecordID: string;
    EffectiveAsOf: Date | null;
}

/** What a run of the slice needs to begin. */
export interface RederivationRunOptions {
    RecordProcessID: string;
    ProcessRunID: string;
    Change: RederivationChange;
    Config: RederivationConfig;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
}

/** The slice's budget, its reservation rule and its reads. */
export class RederivationSlice {
    /** The default per-run spend ceiling, USD (D5-14). */
    public static readonly DEFAULT_MAX_USD_PER_RUN = 5;
    /** The default per-run value ceiling (D5-14). */
    public static readonly DEFAULT_MAX_VALUES_PER_RUN = 10_000;

    /** The budget a Record Process's `Configuration` JSON carries (`rederivation`), each member defaulted when absent or invalid. */
    public static ConfigOf(configuration: string | null | undefined): RederivationConfig {
        const parsed: unknown = configuration ? SafeJSONParse<Record<string, unknown>>(configuration) : null;
        const part: unknown = IsPlainObject(parsed) ? parsed['rederivation'] : null;
        const usd: unknown = IsPlainObject(part) ? part['maxUsdPerRun'] : undefined;
        const values: unknown = IsPlainObject(part) ? part['maxValuesPerRun'] : undefined;
        return {
            maxUsdPerRun: typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? usd : RederivationSlice.DEFAULT_MAX_USD_PER_RUN,
            maxValuesPerRun: typeof values === 'number' && Number.isInteger(values) && values >= 0 ? values : RederivationSlice.DEFAULT_MAX_VALUES_PER_RUN,
        };
    }

    /** A fresh budget for `config`. Pure. */
    public static NewBudget(config: RederivationConfig): RederivationBudgetState {
        return { MaxUsd: config.maxUsdPerRun, MaxValues: config.maxValuesPerRun, SpentUsd: 0, ReservedUsd: 0, Values: 0, ReservedValues: 0 };
    }

    /**
     * Reserves one call's estimated cost and one value, when `SpentUsd + ReservedUsd + meanCostPerCall ≤ MaxUsd` and the
     * values likewise; false (nothing reserved) when the call would pass either. Synchronous, so concurrent calls of one
     * process reserve one after the other.
     */
    public static Reserve(budget: RederivationBudgetState, meanCostPerCall: number): boolean {
        const cost = Math.max(0, meanCostPerCall);
        if (budget.Values + budget.ReservedValues + 1 > budget.MaxValues) return false;
        if (budget.SpentUsd + budget.ReservedUsd + cost > budget.MaxUsd) return false;
        budget.ReservedUsd += cost;
        budget.ReservedValues += 1;
        return true;
    }

    /** Replaces a call's reservation with its real cost (`actual`), counting its value. */
    public static Settle(budget: RederivationBudgetState, reserved: number, actual: number): void {
        const held = budget.ReservedValues > 0;
        budget.ReservedUsd = Math.max(0, budget.ReservedUsd - Math.max(0, reserved));
        budget.ReservedValues = Math.max(0, budget.ReservedValues - 1);
        if (!held) return;
        budget.SpentUsd += Math.max(0, actual);
        budget.Values += 1;
    }

    /** Releases a reservation whose call never ran (it failed before the prompt, or was not needed). */
    public static Cancel(budget: RederivationBudgetState, reserved: number): void {
        budget.ReservedUsd = Math.max(0, budget.ReservedUsd - Math.max(0, reserved));
        budget.ReservedValues = Math.max(0, budget.ReservedValues - 1);
    }

    /**
     * The records whose open Pipeline Champion value is under another version than `currentVersion`, oldest open value
     * first (a record's oldest feature decides).
     * @throws Error when the read fails
     */
    public static async ReadStale(recordProcessId: string, currentVersion: number, provider: IMetadataProvider, contextUser: UserInfo): Promise<StaleRederivationRecord[]> {
        const r = await RunView.FromMetadataProvider(provider).RunView<Pick<MJFeatureValueEntity, 'RecordID' | 'EffectiveAsOf'>>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID='${EscapeSQLString(recordProcessId)}' AND EffectiveTo IS NULL AND Source='Pipeline' AND Role='Champion' AND (PipelineVersion IS NULL OR PipelineVersion<>${Math.trunc(currentVersion)})`,
            Fields: ['RecordID', 'EffectiveAsOf'], OrderBy: 'EffectiveAsOf ASC, RecordID ASC', ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
        }, contextUser);
        if (!r.Success) throw new Error(`RederivationSlice: reading the stale Feature Values of Record Process '${recordProcessId}' failed: ${r.ErrorMessage || 'unknown error'}`);
        const seen = new Set<string>();
        const out: StaleRederivationRecord[] = [];
        for (const row of r.Results || []) {
            const key = row.RecordID.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ RecordID: row.RecordID, EffectiveAsOf: row.EffectiveAsOf ? new Date(row.EffectiveAsOf) : null });
        }
        return out;
    }
}

/**
 * One run's re-derivation slice. {@link Begin} estimates, takes the lease and picks the slice; the run loop asks
 * {@link Admits} per record (before the Dedup Cache), {@link TryReserve} before each call and {@link Settle} after it,
 * {@link Renew}s before each batch, and {@link End}s the run (releasing the lease).
 */
export class RederivationRun {
    private readonly stale = new Set<string>();
    private readonly slice = new Set<string>();
    private readonly budget: RederivationBudgetState;
    private rederived = 0;
    private leaseLost = false;
    private renewTimer: ReturnType<typeof setInterval> | null = null;
    private ended: Promise<void> | null = null;

    private constructor(
        private readonly options: RederivationRunOptions,
        private readonly estimate: RederivationEstimate,
        staleRecords: readonly StaleRederivationRecord[],
        private readonly leaseId: string | null,
    ) {
        this.budget = RederivationSlice.NewBudget(options.Config);
        for (const s of staleRecords) this.stale.add(s.RecordID.toLowerCase());
        if (leaseId !== null) {
            for (const s of staleRecords.slice(0, options.Config.maxValuesPerRun)) this.slice.add(s.RecordID.toLowerCase());
        }
    }

    /**
     * Estimates the re-derivation, takes the lease when anything is stale, and picks the slice: the oldest
     * `maxValuesPerRun` stale records when the lease is held, none when another run holds it. Null when nothing is stale.
     * @throws Error when a read or the lease fails
     */
    public static async Begin(options: RederivationRunOptions): Promise<RederivationRun | null> {
        const staleRecords = await RederivationSlice.ReadStale(options.RecordProcessID, options.Change.ToVersion, options.Provider, options.ContextUser);
        if (staleRecords.length === 0) return null;
        const estimate = await RederivationEstimator.Estimate(options.RecordProcessID, options.Change, options.Provider, options.ContextUser);
        const lease = await RederivationLease.Acquire(options.RecordProcessID, options.ProcessRunID, options.Provider, options.ContextUser);
        const run = new RederivationRun(options, estimate, staleRecords, lease.Held ? lease.LeaseID : null);
        run.startRenewing();
        return run;
    }

    /** True when the run holds the lease. */
    public get HoldsLease(): boolean {
        return this.leaseId !== null && !this.leaseLost;
    }

    /** True when `recordID`'s open value is stale (it is budgeted). */
    public IsStale(recordID: string): boolean {
        return this.stale.has(recordID.toLowerCase());
    }

    /** True when the run may compute `recordID`: it is not stale, or it is in the slice of a run that holds the lease. */
    public Admits(recordID: string): boolean {
        const key = recordID.toLowerCase();
        return !this.stale.has(key) || (this.HoldsLease && this.slice.has(key));
    }

    /** Reserves one call of a stale record: the reserved amount, or null when the call would pass the budget or the lease is lost. */
    public TryReserve(): number | null {
        if (!this.HoldsLease) return null;
        const mean = this.estimate.basis.meanCostPerCall;
        return RederivationSlice.Reserve(this.budget, mean) ? Math.max(0, mean) : null;
    }

    /** Settles a reserved call with its real cost (the reservation when the cost is unknown). */
    public Settle(reserved: number, actual: number | null): void {
        RederivationSlice.Settle(this.budget, reserved, actual ?? reserved);
    }

    /** Releases a reservation whose call never ran. */
    public Cancel(reserved: number): void {
        RederivationSlice.Cancel(this.budget, reserved);
    }

    /** Counts a stale record re-derived (its value written under the current version). */
    public MarkRederived(recordID: string): void {
        if (this.IsStale(recordID)) this.rederived++;
    }

    /** Renews the lease (before each batch, and every {@link RederivationLease.RENEW_SECONDS}); a lost lease stops further calls. */
    public async Renew(): Promise<void> {
        if (!this.HoldsLease || this.leaseId === null) return;
        try {
            if (!(await RederivationLease.Renew(this.leaseId, this.options.ProcessRunID, this.options.Provider, this.options.ContextUser))) {
                this.leaseLost = true;
                LogError(`RederivationRun: Process Run '${this.options.ProcessRunID}' lost the re-derivation lease of Record Process '${this.options.RecordProcessID}'; it makes no further re-derivation call`);
            }
        } catch (e) {
            // a renewal that cannot run cannot prove the lease is still ours: stop calling (lease-lost)
            this.leaseLost = true;
            LogError(`RederivationRun: renewing the re-derivation lease of Record Process '${this.options.RecordProcessID}' failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** The result stored on the run. Pure. */
    public Result(): FeaturePipelineRederivationResult {
        return {
            Estimate: this.estimate,
            Rederived: this.rederived,
            Remaining: Math.max(0, this.stale.size - this.rederived),
            ReservedUsd: this.budget.ReservedUsd,
            SpentUsd: this.budget.SpentUsd,
            Yielded: this.leaseId === null,
            LeaseLost: this.leaseLost,
            Budget: { maxUsdPerRun: this.options.Config.maxUsdPerRun, maxValuesPerRun: this.options.Config.maxValuesPerRun },
        };
    }

    /** Stops renewing and releases the lease; idempotent, never throws (an unreleased lease expires after its TTL). */
    public End(): Promise<void> {
        if (this.ended === null) this.ended = this.release();
        return this.ended;
    }

    private async release(): Promise<void> {
        if (this.renewTimer !== null) clearInterval(this.renewTimer);
        this.renewTimer = null;
        if (this.leaseId === null || this.leaseLost) return;
        try {
            await RederivationLease.Release(this.leaseId, this.options.ProcessRunID, this.options.Provider, this.options.ContextUser);
        } catch (e) {
            LogError(`RederivationRun: releasing the re-derivation lease of Record Process '${this.options.RecordProcessID}' failed (it expires after ${RederivationLease.TTL_MINUTES} minutes): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Renews every RENEW_SECONDS while the run holds the lease; the timer never keeps the process alive. */
    private startRenewing(): void {
        if (this.leaseId === null) return;
        this.renewTimer = setInterval(() => { void this.Renew(); }, RederivationLease.RENEW_SECONDS * 1000);
        this.renewTimer.unref?.();
    }
}
