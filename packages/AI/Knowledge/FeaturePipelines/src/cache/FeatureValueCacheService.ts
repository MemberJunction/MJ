/**
 * @fileoverview FeatureValueCacheService — manages the dedup cache (MJ: Feature Value Caches)
 * and feature value history auditing (MJ: Feature Values) for Feature Pipelines (P1-7c).
 * @module @memberjunction/feature-pipelines
 */

import { BaseSingleton, canonicalize, computeContentHashAsync } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type { MJFeatureValueCacheEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';

/** Compute cache key params. */
export interface ComputeCacheKeyParams {
    keyFields?: string[];
    recordData: Record<string, unknown>;
    renderedContext?: string;
}

/** Result of computing a cache key. */
export interface CacheKeyResult {
    keyHash: string;
    keyJSON: string;
    keyDisplay: string;
}

/** Cache lookup parameters. */
export interface CacheLookupParams {
    recordProcessID?: string | null;
    scope?: 'pipeline' | 'prompt';
    promptID: string;
    promptVersionHash: string;
    constraintHash: string;
    keyHash: string;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** Batch cache lookup parameters. */
export interface BatchCacheLookupParams {
    recordProcessID?: string | null;
    scope?: 'pipeline' | 'prompt';
    promptID: string;
    promptVersionHash: string;
    constraintHash: string;
    keyHashes: string[];
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** Parameters for storing a newly computed value into the cache. */
export interface CacheStoreParams {
    recordProcessID?: string | null;
    scope?: 'pipeline' | 'prompt';
    promptID: string;
    promptVersionHash: string;
    constraintHash: string;
    keyHash: string;
    keyDisplay: string;
    keyJSON: string;
    outputsJSON: string;
    reasoning?: string | null;
    aiPromptRunID?: string | null;
    ttlSeconds?: number;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** Feature output item for auditing in MJ: Feature Values. */
export interface FeatureValueOutputItem {
    featureName: string;
    value: unknown;
    reasoning?: string | null;
    confidence?: number | null;
}

/** Parameters for recording historical audit entries in MJ: Feature Values. */
export interface RecordFeatureValuesParams {
    recordProcessID: string;
    entityID: string;
    recordID: string;
    outputs: FeatureValueOutputItem[];
    promptID?: string | null;
    promptVersionHash?: string | null;
    constraintHash?: string | null;
    processRunID?: string | null;
    processRunDetailID?: string | null;
    aiPromptRunID?: string | null;
    featureValueCacheID?: string | null;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/**
 * Service managing dedup caching (MJ: Feature Value Caches) and history tracking (MJ: Feature Values).
 */
export class FeatureValueCacheService extends BaseSingleton<FeatureValueCacheService> {
    public static get Instance(): FeatureValueCacheService {
        return super.getInstance<FeatureValueCacheService>();
    }

    protected constructor() {
        super();
    }

    /**
     * Computes the deterministic SHA-256 key hash, canonical JSON, and display string.
     * Uses KeyFields when provided, or falls back to the full rendered context / record data.
     */
    public async computeCacheKey(params: ComputeCacheKeyParams): Promise<CacheKeyResult> {
        if (params.keyFields && params.keyFields.length > 0) {
            const keyObj: Record<string, unknown> = {};
            const displayParts: string[] = [];

            for (const field of params.keyFields) {
                const val = params.recordData[field];
                keyObj[field] = val !== undefined ? val : null;
                if (val !== null && val !== undefined && String(val).trim().length > 0) {
                    displayParts.push(String(val).trim());
                }
            }

            const canonical = canonicalize(keyObj);
            const keyJSON = canonical;
            const keyHash = await computeContentHashAsync(keyObj);
            const keyDisplay = displayParts.join(' | ') || keyHash.substring(0, 16);

            return { keyHash, keyJSON, keyDisplay };
        }

        // Whole rendered context (or whole record data)
        const basis = params.renderedContext ? { context: params.renderedContext } : params.recordData;
        const canonical = canonicalize(basis);
        const keyJSON = canonical;
        const keyHash = await computeContentHashAsync(basis);
        const keyDisplay = params.renderedContext
            ? params.renderedContext.length > 80
                ? `${params.renderedContext.substring(0, 77)}...`
                : params.renderedContext
            : keyHash.substring(0, 16);

        return { keyHash, keyJSON, keyDisplay };
    }

    /**
     * Looks up an existing cache entry. Returns null on miss or when expired.
     * Automatically increments HitCount and updates LastHitAt on hit.
     */
    public async Lookup(params: CacheLookupParams): Promise<MJFeatureValueCacheEntity | null> {
        const batchMap = await this.BatchLookup({
            ...params,
            keyHashes: [params.keyHash],
        });
        return batchMap.get(params.keyHash) ?? null;
    }

    /**
     * Performs a single batch lookup for multiple key hashes.
     * Filters out expired entries and increments HitCount on valid hits.
     */
    public async BatchLookup(params: BatchCacheLookupParams): Promise<Map<string, MJFeatureValueCacheEntity>> {
        const results = new Map<string, MJFeatureValueCacheEntity>();
        if (params.keyHashes.length === 0) {
            return results;
        }

        const quotedKeys = params.keyHashes.map((k) => `'${k.replace(/'/g, "''")}'`).join(', ');
        const scopeFilter =
            params.scope === 'prompt' || !params.recordProcessID
                ? 'RecordProcessID IS NULL'
                : `RecordProcessID = '${params.recordProcessID}'`;

        const filter = `${scopeFilter} AND PromptID = '${params.promptID}' AND PromptVersionHash = '${params.promptVersionHash}' AND ConstraintHash = '${params.constraintHash}' AND KeyHash IN (${quotedKeys})`;

        const rv = new RunView();
        const res = await rv.RunView<MJFeatureValueCacheEntity>(
            {
                EntityName: 'MJ: Feature Value Caches',
                ExtraFilter: filter,
                ResultType: 'entity_object',
            },
            params.contextUser
        );

        if (!res.Success || !res.Results) {
            return results;
        }

        const now = Date.now();
        for (const entry of res.Results) {
            // Check expiration
            if (entry.ExpiresAt != null && new Date(entry.ExpiresAt).getTime() <= now) {
                continue;
            }

            // Record hit
            entry.HitCount = (entry.HitCount ?? 0) + 1;
            entry.LastHitAt = new Date();
            void entry.Save().catch((err) => {
                LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${err instanceof Error ? err.message : String(err)}`);
            });

            results.set(entry.KeyHash, entry);
        }

        return results;
    }

    /**
     * Stores a new result into the cache.
     */
    public async Store(params: CacheStoreParams): Promise<MJFeatureValueCacheEntity> {
        const provider = params.provider ?? Metadata.Provider;
        const entry = await provider.GetEntityObject<MJFeatureValueCacheEntity>('MJ: Feature Value Caches', params.contextUser);
        entry.NewRecord();

        entry.RecordProcessID = params.scope === 'prompt' ? null : (params.recordProcessID ?? null);
        entry.PromptID = params.promptID;
        entry.PromptVersionHash = params.promptVersionHash;
        entry.ConstraintHash = params.constraintHash;
        entry.KeyHash = params.keyHash;
        entry.KeyDisplay = params.keyDisplay;
        entry.KeyJSON = params.keyJSON;
        entry.OutputsJSON = params.outputsJSON;
        entry.Reasoning = params.reasoning ?? null;
        entry.AIPromptRunID = params.aiPromptRunID ?? null;
        entry.HitCount = 0;
        entry.ComputedAt = new Date();

        if (params.ttlSeconds && params.ttlSeconds > 0) {
            entry.ExpiresAt = new Date(Date.now() + params.ttlSeconds * 1000);
        }

        const saved = await entry.Save();
        if (!saved) {
            throw new Error(`FeatureValueCacheService: failed to save cache entry for keyHash '${params.keyHash}'`);
        }

        return entry;
    }

    /**
     * Creates historical audit rows in MJ: Feature Values for all feature outputs produced on a record.
     */
    public async RecordFeatureValues(params: RecordFeatureValuesParams): Promise<void> {
        const provider = params.provider ?? Metadata.Provider;

        for (const out of params.outputs) {
            try {
                const fv = await provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.contextUser);
                fv.NewRecord();

                fv.RecordProcessID = params.recordProcessID;
                fv.EntityID = params.entityID;
                fv.RecordID = params.recordID;
                fv.FeatureName = out.featureName;

                // Format typed value column
                const val = out.value;
                if (typeof val === 'string') {
                    fv.ValueText = val;
                } else if (typeof val === 'number') {
                    fv.ValueNumeric = val;
                } else if (typeof val === 'boolean') {
                    fv.ValueBoolean = val;
                } else if (val instanceof Date) {
                    fv.ValueDate = val;
                } else if (val !== null && typeof val === 'object') {
                    fv.ValueJSON = JSON.stringify(val);
                }

                fv.Reasoning = out.reasoning ?? null;
                fv.Confidence = out.confidence ?? null;
                fv.PromptID = params.promptID ?? null;
                fv.PromptVersionHash = params.promptVersionHash ?? null;
                fv.ConstraintHash = params.constraintHash ?? null;
                fv.ProcessRunID = params.processRunID ?? null;
                fv.ProcessRunDetailID = params.processRunDetailID ?? null;
                fv.AIPromptRunID = params.aiPromptRunID ?? null;
                fv.FeatureValueCacheID = params.featureValueCacheID ?? null;
                fv.ComputedAt = new Date();

                const saved = await fv.Save();
                if (!saved) {
                    LogError(`FeatureValueCacheService: failed saving FeatureValue for '${out.featureName}' on record '${params.recordID}'`);
                }
            } catch (e) {
                LogError(`FeatureValueCacheService: error saving FeatureValue: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
}
