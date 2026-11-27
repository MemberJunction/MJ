/**
 * @fileoverview The cost estimate of a Feature Pipeline's re-derivation after a version change (PR 5 §5.2.4, F-DOC-10).
 *
 * After a template, prompt, model, parameter or spec change the pipeline computes under a new version, and every open
 * value written under another version is stale. Before its first prompt call a run estimates what re-deriving them
 * costs: how many values and records are affected, how many distinct inputs are already in the Dedup Cache under the
 * new pin (no call), how many calls remain, and their projected cost at the mean `Cost` of the pipeline prompt's newest
 * {@link RederivationEstimator.COST_SAMPLE_SIZE} priced `MJ: AI Prompt Runs`. Every read runs on the caller's provider as
 * the caller. The estimate is stored once, in the run's own `MJ: Process Runs.ResultSummary` (D5-31).
 * @module @memberjunction/feature-pipelines
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJFeatureValueCacheEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';

/** The version a pipeline now computes under, with the Dedup Cache key parts of its pin (what a cache hit must match). */
export interface RederivationChange {
    /** The pipeline version the run writes under; open values of any other version are stale. */
    ToVersion: number;
    PromptID: string;
    PromptVersionHash: string;
    ConstraintHash: string;
    AIModelID: string | null;
    ParametersHash: string | null;
}

/** What re-deriving a pipeline's stale values is projected to cost (stored as JSON in the run's `ResultSummary`). */
export interface RederivationEstimate {
    /** Open Pipeline Champion values under another version (one per record and feature). */
    affectedValues: number;  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key (§5.2.4)
    /** Records holding at least one such value: the units one call re-derives. */
    affectedRecords: number;  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key
    /** Distinct inputs whose answer under the new pin is already in the Dedup Cache. */
    expectedCacheHits: number;  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key (§5.2.4)
    /** Prompt calls the re-derivation needs: one per distinct input not in the cache. */
    projectedCalls: number;  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key (§5.2.4)
    /** `projectedCalls` × `basis.meanCostPerCall`. */
    projectedUsd: number;  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key (§5.2.4)
    /** The prompt runs the mean cost was taken over. */
    basis: { meanCostPerCall: number; sampleSize: number };  // case-violation-ok-legacy-back-compat: stored ResultSummary JSON key (§5.2.4)
}

/** One stale value's identity, as the estimate reads it. */
type StaleValueRow = Pick<MJFeatureValueEntity, 'RecordID' | 'InputHash'>;

/** Estimates the cost of re-deriving a pipeline's stale values. */
export class RederivationEstimator {
    /** How many of the prompt's newest priced runs the mean cost is taken over (§5.2.4: the newest 200). */
    public static readonly COST_SAMPLE_SIZE = 200;
    /** How many input hashes one Dedup Cache read names (an `IN` list kept well under SQL Server's parameter ceiling). */
    public static readonly CACHE_READ_CHUNK = 500;

    /**
     * The estimate for re-deriving `recordProcessId`'s stale values under `change`.
     * @throws Error when a read fails (a failed read is not an empty one)
     */
    public static async Estimate(recordProcessId: string, change: RederivationChange, provider: IMetadataProvider, contextUser: UserInfo): Promise<RederivationEstimate> {
        const stale = await RederivationEstimator.readStaleValues(recordProcessId, change.ToVersion, provider, contextUser);
        const records = new Set(stale.map((v) => v.RecordID.toLowerCase()));
        const inputs = RederivationEstimator.distinctInputs(stale);
        const hits = inputs.Hashes.length === 0 ? 0 : await RederivationEstimator.countCacheHits(recordProcessId, change, inputs.Hashes, provider, contextUser);
        const basis = stale.length === 0 ? { meanCostPerCall: 0, sampleSize: 0 } : await RederivationEstimator.meanCost(change.PromptID, provider, contextUser);
        const projectedCalls = inputs.Hashes.length - hits + inputs.Unhashed;
        return {
            affectedValues: stale.length,
            affectedRecords: records.size,
            expectedCacheHits: hits,
            projectedCalls,
            projectedUsd: projectedCalls * basis.meanCostPerCall,
            basis,
        };
    }

    /** The open Pipeline Champion values of the process written under another version than `toVersion`. */
    private static async readStaleValues(recordProcessId: string, toVersion: number, provider: IMetadataProvider, contextUser: UserInfo): Promise<StaleValueRow[]> {
        return RederivationEstimator.read<StaleValueRow>(provider, contextUser, {
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID='${EscapeSQLString(recordProcessId)}' AND EffectiveTo IS NULL AND Source='Pipeline' AND Role='Champion' AND (PipelineVersion IS NULL OR PipelineVersion<>${Math.trunc(toVersion)})`,
            Fields: ['RecordID', 'InputHash'],
        });
    }

    /** The distinct input hashes of the stale records (one per record), and the records that carry none (each its own call). */
    private static distinctInputs(stale: readonly StaleValueRow[]): { Hashes: string[]; Unhashed: number } {
        const hashByRecord = new Map<string, string | null>();
        for (const v of stale) {
            const record = v.RecordID.toLowerCase();
            if (!hashByRecord.get(record)) hashByRecord.set(record, v.InputHash || null);
        }
        const hashes = new Set<string>();
        let unhashed = 0;
        for (const hash of hashByRecord.values()) {
            if (hash) hashes.add(hash);
            else unhashed++;
        }
        return { Hashes: [...hashes], Unhashed: unhashed };
    }

    /** How many of `hashes` the Dedup Cache already answers under the new pin (unexpired, this pipeline's or unscoped). */
    private static async countCacheHits(recordProcessId: string, change: RederivationChange, hashes: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
        const hit = new Set<string>();
        const pin = [
            `PromptID='${EscapeSQLString(change.PromptID)}'`, `PromptVersionHash='${EscapeSQLString(change.PromptVersionHash)}'`, `ConstraintHash='${EscapeSQLString(change.ConstraintHash)}'`,
            change.AIModelID ? `AIModelID='${EscapeSQLString(change.AIModelID)}'` : 'AIModelID IS NULL',
            change.ParametersHash ? `ParametersHash='${EscapeSQLString(change.ParametersHash)}'` : 'ParametersHash IS NULL',
            `(RecordProcessID='${EscapeSQLString(recordProcessId)}' OR RecordProcessID IS NULL)`, '(ExpiresAt IS NULL OR ExpiresAt > GETUTCDATE())',
        ].join(' AND ');
        for (let i = 0; i < hashes.length; i += RederivationEstimator.CACHE_READ_CHUNK) {
            const chunk = hashes.slice(i, i + RederivationEstimator.CACHE_READ_CHUNK).map((h) => `'${EscapeSQLString(h)}'`).join(', ');
            const rows = await RederivationEstimator.read<Pick<MJFeatureValueCacheEntity, 'KeyHash'>>(provider, contextUser, {
                EntityName: 'MJ: Feature Value Caches', ExtraFilter: `${pin} AND KeyHash IN (${chunk})`, Fields: ['KeyHash'],
            });
            for (const r of rows) hit.add(r.KeyHash);
        }
        return hashes.filter((h) => hit.has(h)).length;
    }

    /** The mean `Cost` of the prompt's newest priced runs (0 over 0 runs). */
    private static async meanCost(promptId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<{ meanCostPerCall: number; sampleSize: number }> {
        const runs = await RederivationEstimator.read<Pick<MJAIPromptRunEntity, 'Cost'>>(provider, contextUser, {
            EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `PromptID='${EscapeSQLString(promptId)}' AND Cost IS NOT NULL`,
            Fields: ['Cost'], OrderBy: 'RunAt DESC', MaxRows: RederivationEstimator.COST_SAMPLE_SIZE,
        });
        const costs = runs.map((r) => Number(r.Cost)).filter((c) => Number.isFinite(c));
        const total = costs.reduce((sum, c) => sum + c, 0);
        return { meanCostPerCall: costs.length === 0 ? 0 : total / costs.length, sampleSize: costs.length };
    }

    /** One read as the caller, past the RunView cache; a failed read throws. */
    private static async read<T>(provider: IMetadataProvider, contextUser: UserInfo, params: { EntityName: string; ExtraFilter: string; Fields: string[]; OrderBy?: string; MaxRows?: number }): Promise<T[]> {
        const r = await RunView.FromMetadataProvider(provider).RunView<T>({
            ...params, ResultType: 'simple', BypassCache: true, ...(params.MaxRows === undefined ? { IgnoreMaxRows: true } : {}),
        }, contextUser);
        if (!r.Success) throw new Error(`RederivationEstimator: reading ${params.EntityName} failed: ${r.ErrorMessage || 'unknown error'}`);
        return r.Results || [];
    }
}
