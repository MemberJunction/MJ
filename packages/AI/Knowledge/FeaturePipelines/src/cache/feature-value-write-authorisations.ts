/**
 * @fileoverview The one-shot authorisations that make the effective range of `MJ: Feature Values` writable only by the
 * Feature Pipelines write path (PR 5 D5-30, PR 4's `PublishRecordWriteAuthorisations` pattern).
 *
 * `FeatureValueCacheService` (and the shadow write of `InferProcessor`) authorises the exact entity instance it is about
 * to save; the PS Engine's `FeatureValueEffectiveRangeGuard` (a `PreSave` hook, server-only) takes the entry during that
 * save and refuses a create of a `Pipeline`/`Human` row, or a change of its `EffectiveAsOf`, `EffectiveTo` or
 * `SourceUserID`, without one — so a GraphQL write, an Action, an agent or any other server save is refused. The entry
 * is keyed by the instance, so a save of another instance in flight at the same time is never admitted by it (F-018),
 * and it is revoked when the save returns.
 *
 * Pure: this module registers no hook, so loading `@memberjunction/feature-pipelines` in a browser bundle registers
 * nothing (F-007). A `WeakMap` keyed by the instance keeps a dropped entity collectable; the `BaseSingleton` keeps one
 * map per process even when the module is loaded twice. The map lives in the server process: an API caller cannot
 * fill it.
 * @module @memberjunction/feature-pipelines
 */
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** The process-wide set of pending Feature Value write authorisations. */
export class FeatureValueWriteAuthorisations extends BaseSingleton<FeatureValueWriteAuthorisations> {
    private readonly pending = new WeakSet<MJFeatureValueEntity>();

    protected constructor() {
        super();
    }

    /** The process-wide instance. */
    public static get Instance(): FeatureValueWriteAuthorisations {
        return super.getInstance<FeatureValueWriteAuthorisations>();
    }

    /**
     * Saves `row` under a one-shot authorisation, revoking whatever the save left. The only way the write path saves a
     * `Pipeline` or `Human` Feature Value.
     * @returns the save's result (false with the reason in `LatestResult`)
     */
    public static async Save(row: MJFeatureValueEntity): Promise<boolean> {
        const auth = FeatureValueWriteAuthorisations.Instance;
        auth.Authorise(row);
        try {
            return await row.Save();
        } finally {
            auth.Revoke(row);
        }
    }

    /** Authorises the next save of `row`. */
    public Authorise(row: MJFeatureValueEntity): void {
        this.pending.add(row);
    }

    /** True when `row`'s save was authorised, removing the entry: a second call returns false. The guard calls this. */
    public Take(row: MJFeatureValueEntity): boolean {
        return this.pending.delete(row);
    }

    /** Drops `row`'s entry when its save did not take it (a save refused before the guard ran). */
    public Revoke(row: MJFeatureValueEntity): void {
        this.pending.delete(row);
    }
}
