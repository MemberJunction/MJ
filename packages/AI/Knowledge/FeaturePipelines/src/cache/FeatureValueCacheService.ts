/**
 * @fileoverview FeatureValueCacheService — manages the dedup cache (MJ: Feature Value Caches) and the keyed Feature
 * Value upserts (MJ: Feature Values, one row per Feature Value key) for Feature Pipelines.
 * @module @memberjunction/feature-pipelines
 */

import { BaseSingleton, Canonicalize, ComputeContentHashAsync, EscapeSQLString } from '@memberjunction/global';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { FeatureValueKey, type FeatureValueSource } from '../spec/feature-value-key.js';
import type { MJFeatureValueCacheEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';

/** Compute cache key params. */
export interface ComputeCacheKeyParams {
    KeyFields?: string[];
    RecordData: Record<string, unknown>;
    RenderedContext?: string;
}

/** Result of computing a cache key. */
export interface CacheKeyResult {
    KeyHash: string;
    KeyJSON: string;
    KeyDisplay: string;
}

/** The cache scope and pin every cache call is made in: which rows of `MJ: Feature Value Caches` it may read or write. */
export interface FeatureValueCacheScope {
    /** The pipeline (`MJ: Record Processes` ID); ignored when `Scope` is `prompt`. */
    RecordProcessID?: string | null;
    /** `pipeline` (default): rows of this pipeline; `prompt`: rows shared by every pipeline running the prompt. */
    Scope?: 'pipeline' | 'prompt';
    /** The `MJ: AI Prompts` ID. */
    PromptID: string;
    /** The pin's prompt version hash. */
    PromptVersionHash: string;
    /** The hash of the pipeline's output constraints. */
    ConstraintHash: string;
    /** The pin's primary AI model (null when the prompt has no Active model). */
    AIModelID: string | null;
    /** The pin's parameters hash. */
    ParametersHash: string;
    /** The user the reads and writes run as. */
    ContextUser: UserInfo;
    /** The provider the reads and writes run on — the caller's, never the process-wide default. */
    Provider: IMetadataProvider;
}

/** Cache lookup parameters. */
export interface CacheLookupParams extends FeatureValueCacheScope {
    KeyHash: string;
}

/** Batch cache lookup parameters. */
export interface BatchCacheLookupParams extends FeatureValueCacheScope {
    KeyHashes: string[];
    /** Whether a hit increments the entry's HitCount and LastHitAt (default true). */
    RecordHit?: boolean;
}

/** Parameters for storing a newly computed value into the cache. */
export interface CacheStoreParams extends FeatureValueCacheScope {
    KeyHash: string;
    KeyDisplay: string;
    KeyJSON: string;
    OutputsJSON: string;
    Reasoning?: string | null;
    AIPromptRunID?: string | null;
    TtlSeconds?: number;
}

/** One output's value for `MJ: Feature Values`. */
export interface FeatureValueOutputItem {
    FeatureName: string;
    Value: unknown;
    Reasoning?: string | null;
    Confidence?: number | null;
}

/**
 * Parameters for upserting a record's Feature Values (`MJ: Feature Values`), one row per Feature Value key. Every key
 * component is required, so a caller that drops one fails to compile instead of writing a different (null) key.
 */
export interface RecordFeatureValuesParams {
    RecordProcessID: string;
    EntityID: string;
    RecordID: string;
    Outputs: FeatureValueOutputItem[];
    PromptID?: string | null;
    /** The pin's prompt version hash; part of the key. Null for a value no prompt computed. */
    PromptVersionHash: string | null;
    ConstraintHash?: string | null;
    ProcessRunID?: string | null;
    ProcessRunDetailID?: string | null;
    AIPromptRunID?: string | null;
    FeatureValueCacheID?: string | null;
    /** The pipeline version (`MJ: Feature Pipeline Versions.Version`) that computed the values; null when unversioned. */
    PipelineVersion: number | null;
    /** The pin's primary AI model; null when the prompt has no Active model, or for a human value. */
    AIModelID: string | null;
    /** The pin's parameters hash; null for a human value (no pin). */
    ParametersHash: string | null;
    /** SHA-256 of the record's normalised inputs (the cache key hash); null when there is none. */
    InputHash: string | null;
    /** Who produced the values. */
    Source: FeatureValueSource;
    ContextUser: UserInfo;
    /** The provider the reads and writes run on — the caller's, never the process-wide default. */
    Provider: IMetadataProvider;
}

/** The typed value columns of a Feature Value. */
export type TypedFeatureValue = Pick<MJFeatureValueEntity, 'ValueText' | 'ValueNumeric' | 'ValueBoolean' | 'ValueDate' | 'ValueJSON'>;

/** What {@link FeatureValueCacheService.RecordFeatureValues} did with each output. */
export interface RecordFeatureValuesOutcome {
    /** Outputs inserted or updated. */
    Upserted: number;
    /** Outputs whose key already held the same value, reasoning and confidence. */
    Unchanged: number;
    /**
     * Each output's latest `Source='Pipeline'` value for the record and feature before this call — on any key (another
     * pipeline version, model, parameters or input) — by feature name; null when the pipeline never wrote the feature.
     * Captured before anything is saved, so it is what an earlier run wrote even when this call updates that row in place.
     */
    Previous: Record<string, TypedFeatureValue | null>;
}

/** What one output's write did. `RecordWriteOutcome` in `@memberjunction/record-set-processor-base` mirrors it. */
export type FeatureValueWriteResult = Exclude<keyof RecordFeatureValuesOutcome, 'Previous'>;

/**
 * A Feature Value that could not be saved (after the one race retry, when there was a race). Carries the feature, the
 * record and the provider's message as fields, so a caller can classify it with `instanceof` instead of reading text.
 */
export class FeatureValueSaveError extends Error {
    constructor(
        public readonly FeatureName: string,
        public readonly RecordID: string,
        public readonly ProviderMessage: string,
    ) {
        super(`FeatureValueCacheService: failed saving Feature Value '${FeatureName}' on record '${RecordID}': ${ProviderMessage}`);
        this.name = 'FeatureValueSaveError';
    }
}

/** One write attempt: what it did, or the provider's message when the save failed. */
type FeatureValueWriteAttempt = { Result: FeatureValueWriteResult } | { Message: string };

/** The columns {@link FeatureValueCacheService.LoadLatestPipelineValues} reads. */
type LatestFeatureValueRow = TypedFeatureValue & Pick<MJFeatureValueEntity, 'FeatureName'>;

/**
 * Service managing the dedup cache (MJ: Feature Value Caches) and the keyed Feature Value upserts (MJ: Feature Values,
 * one row per Feature Value key; a row's earlier values are in Record Changes).
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
    public async ComputeCacheKey(params: ComputeCacheKeyParams): Promise<CacheKeyResult> {
        if (params.KeyFields && params.KeyFields.length > 0) {
            const keyObj: Record<string, unknown> = {};
            const displayParts: string[] = [];
            for (const field of params.KeyFields) {
                const val = FeatureValueCacheService.ReadFieldCaseInsensitive(params.RecordData, field);
                keyObj[field] = val === undefined ? null : FeatureValueCacheService.NormalizeKeyInput(val);
                if (val !== null && val !== undefined && String(val).trim().length > 0) {
                    displayParts.push(String(val).trim());
                }
            }
            const keyJSON = Canonicalize(keyObj);
            const keyHash = await ComputeContentHashAsync(keyObj);
            const keyDisplay = displayParts.join(' | ') || keyHash.substring(0, 16);
            return { KeyHash: keyHash, KeyJSON: keyJSON, KeyDisplay: keyDisplay };
        }

        const basis: Record<string, unknown> = params.RenderedContext
            ? { context: FeatureValueKey.NormalizeValue(params.RenderedContext) }
            : FeatureValueCacheService.NormalizeRecord(params.RecordData);
        const keyJSON = Canonicalize(basis);
        const keyHash = await ComputeContentHashAsync(basis);
        const keyDisplay = params.RenderedContext
            ? params.RenderedContext.length > 80 ? `${params.RenderedContext.substring(0, 77)}...` : params.RenderedContext
            : keyHash.substring(0, 16);
        return { KeyHash: keyHash, KeyJSON: keyJSON, KeyDisplay: keyDisplay };
    }

    /** @deprecated Use {@link ComputeCacheKey}. */
    public async computeCacheKey(params: ComputeCacheKeyParams): Promise<CacheKeyResult> {
        return this.ComputeCacheKey(params);
    }

    /**
     * Looks up an existing cache entry. Returns null on miss or when expired.
     * Increments HitCount and updates LastHitAt on a hit.
     */
    public async Lookup(params: CacheLookupParams): Promise<MJFeatureValueCacheEntity | null> {
        const batchMap = await this.BatchLookup({
            ...params,
            KeyHashes: [params.KeyHash],
        });
        return batchMap.get(params.KeyHash) || null;
    }

    /**
     * Performs a single batch lookup for multiple key hashes.
     * Filters out expired entries and, unless `RecordHit` is false, records a hit on each valid entry before returning.
     */
    public async BatchLookup(params: BatchCacheLookupParams): Promise<Map<string, MJFeatureValueCacheEntity>> {
        const results = new Map<string, MJFeatureValueCacheEntity>();
        if (params.KeyHashes.length === 0) {
            return results;
        }

        const quotedKeys = params.KeyHashes.map((k) => `'${EscapeSQLString(k)}'`).join(', ');
        const filter = `${FeatureValueCacheService.CacheScopeFilter(params)} AND KeyHash IN (${quotedKeys})`;

        const res = await RunView.FromMetadataProvider(params.Provider).RunView<MJFeatureValueCacheEntity>(
            {
                EntityName: 'MJ: Feature Value Caches',
                ExtraFilter: filter,
                ResultType: 'entity_object',
            },
            params.ContextUser
        );

        if (!res.Success) {
            LogError(`FeatureValueCacheService.BatchLookup: RunView failed: ${res.ErrorMessage}`);
            return results;
        }

        const now = Date.now();
        for (const entry of res.Results ?? []) {
            if (entry.ExpiresAt != null && new Date(entry.ExpiresAt).getTime() <= now) {
                continue;
            }
            results.set(entry.KeyHash, entry);
        }
        if (params.RecordHit !== false) {
            await this.RecordHits([...results.values()]);
        }
        return results;
    }

    /**
     * Records a hit on each entry (HitCount + 1, LastHitAt now), all saves at once, and logs each save that fails. A
     * failed hit count does not fail the lookup: the entry is still a valid answer, only its statistics are behind.
     */
    protected async RecordHits(entries: MJFeatureValueCacheEntity[]): Promise<void> {
        await Promise.all(entries.map(async (entry) => {
            // `??` because 0 is a valid HitCount
            entry.HitCount = (entry.HitCount ?? 0) + 1;
            entry.LastHitAt = new Date();
            try {
                if (!(await entry.Save())) {
                    LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${entry.LatestResult?.CompleteMessage || 'unknown error'}`);
                }
            } catch (err) {
                LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${err instanceof Error ? err.message : String(err)}`);
            }
        }));
    }

    /**
     * Stores a computed result on its cache key. An existing row for the key — expired or not — is updated in place
     * (its expiry pushed forward, its hit count reset), so an expired entry is refreshed rather than duplicated.
     * @throws Error naming the key and the provider's message when the save fails.
     */
    public async Store(params: CacheStoreParams): Promise<MJFeatureValueCacheEntity> {
        const existing = await this.FindByKey(params);
        const entry = existing || (await params.Provider.GetEntityObject<MJFeatureValueCacheEntity>('MJ: Feature Value Caches', params.ContextUser));
        if (!existing) {
            entry.NewRecord();
            entry.RecordProcessID = params.Scope === 'prompt' ? null : (params.RecordProcessID || null);
            entry.PromptID = params.PromptID;
            entry.PromptVersionHash = params.PromptVersionHash;
            entry.ConstraintHash = params.ConstraintHash;
            entry.AIModelID = params.AIModelID;
            entry.ParametersHash = params.ParametersHash;
            entry.KeyHash = params.KeyHash;
        }
        entry.KeyDisplay = params.KeyDisplay;
        entry.KeyJSON = params.KeyJSON;
        entry.OutputsJSON = params.OutputsJSON;
        entry.Reasoning = params.Reasoning || null;
        entry.AIPromptRunID = params.AIPromptRunID || null;
        entry.HitCount = 0;
        entry.ComputedAt = new Date();
        entry.ExpiresAt = params.TtlSeconds && params.TtlSeconds > 0 ? new Date(Date.now() + params.TtlSeconds * 1000) : null;

        const saved = await entry.Save();
        if (!saved) {
            throw new Error(`FeatureValueCacheService: failed to save cache entry for keyHash '${params.KeyHash}': ${entry.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        return entry;
    }

    /** The row on a store's key, expired or not; null when there is none. */
    protected async FindByKey(params: CacheStoreParams): Promise<MJFeatureValueCacheEntity | null> {
        const res = await RunView.FromMetadataProvider(params.Provider).RunView<MJFeatureValueCacheEntity>({
            EntityName: 'MJ: Feature Value Caches',
            ExtraFilter: `${FeatureValueCacheService.CacheScopeFilter(params)} AND KeyHash = '${EscapeSQLString(params.KeyHash)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
            BypassCache: true,
        }, params.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: looking up cache key '${params.KeyHash}' failed: ${res.ErrorMessage}`);
        }
        return res.Results?.[0] || null;
    }

    /**
     * Upserts one Feature Value per output on its key (record, feature, pipeline version, prompt version hash, primary
     * model, parameters hash, input hash, source). A key that already holds the same value, reasoning and confidence is
     * left untouched; a changed one is updated in place; a new one is inserted. The outputs are distinct keys, so they
     * are written in parallel. An insert that loses a race on the key's unique index (another run inserted it first)
     * reloads the row and applies the same rule to it, once.
     * @returns How many outputs were upserted or unchanged, and each feature's latest pipeline value before the call.
     * @throws Error when a row cannot be read or saved (the record must then fail; nothing is swallowed).
     */
    public async RecordFeatureValues(params: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> {
        const keyed = await Promise.all(params.Outputs.map(async (out) => ({
            out,
            keyHash: await FeatureValueKey.ComputeHash({
                EntityID: params.EntityID, RecordID: params.RecordID, FeatureName: out.FeatureName,
                PipelineVersion: params.PipelineVersion, PromptVersionHash: params.PromptVersionHash,
                AIModelID: params.AIModelID, ParametersHash: params.ParametersHash,
                InputHash: params.InputHash, Source: params.Source,
            }),
        })));
        const previous = await this.LoadLatestPipelineValues(params);
        const existing = await this.LoadByKeyHashes(params, keyed.map((k) => k.keyHash));
        const results = await Promise.all(keyed.map(({ out, keyHash }) => this.UpsertOne(params, out, keyHash, existing.get(keyHash))));

        const outcome: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Previous: {} };
        keyed.forEach(({ out }, i) => {
            outcome.Previous[out.FeatureName] = previous.get(out.FeatureName.toLowerCase()) || null;
            outcome[results[i]]++;
        });
        return outcome;
    }

    /**
     * Writes one output on its key: unchanged, updated in place, or inserted. A failed insert re-reads the key: when a
     * row now exists, another run inserted it first (the race on the key's unique index), and the output is applied to
     * that row. The race is recognised by the row, never by the provider's error text, which differs by platform.
     * @throws Error with the provider's message when the write (or its one retry) fails.
     */
    protected async UpsertOne(
        params: RecordFeatureValuesParams,
        out: FeatureValueOutputItem,
        keyHash: string,
        row: MJFeatureValueEntity | undefined
    ): Promise<FeatureValueWriteResult> {
        const attempt = await this.WriteOne(params, out, keyHash, row);
        if ('Result' in attempt) {
            return attempt.Result;
        }
        if (!row) {
            const raced = (await this.LoadByKeyHashes(params, [keyHash])).get(keyHash);
            if (raced) {
                const retry = await this.WriteOne(params, out, keyHash, raced);
                if ('Result' in retry) {
                    return retry.Result;
                }
                throw this.SaveError(out, params, retry.Message);
            }
        }
        throw this.SaveError(out, params, attempt.Message);
    }

    /**
     * One write of an output onto `row` (or a new row when absent); returns the provider's message instead of throwing
     * when the save fails, so {@link UpsertOne} can check for a race.
     */
    protected async WriteOne(
        params: RecordFeatureValuesParams,
        out: FeatureValueOutputItem,
        keyHash: string,
        row: MJFeatureValueEntity | undefined
    ): Promise<FeatureValueWriteAttempt> {
        const typed = FeatureValueCacheService.ToTypedValue(out.Value);
        if (row && this.IsUnchanged(row, typed, out)) {
            return { Result: 'Unchanged' };
        }
        const fv = row || (await params.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.ContextUser));
        if (!row) {
            fv.NewRecord();
            this.AssignKeyColumns(fv, params, out, keyHash);
        }
        this.AssignValueColumns(fv, params, out, typed);
        if (await fv.Save()) {
            return { Result: 'Upserted' };
        }
        return { Message: fv.LatestResult?.CompleteMessage || 'unknown error' };
    }

    /** Whether `row` already holds this output: the same typed value, reasoning and confidence. */
    protected IsUnchanged(row: MJFeatureValueEntity, typed: TypedFeatureValue, out: FeatureValueOutputItem): boolean {
        // `??` because 0 is a valid Confidence; Reasoning '' and null are both "no reasoning"
        return FeatureValueCacheService.SameTypedValue(row, typed)
            && (row.Reasoning || null) === (out.Reasoning || null)
            && (row.Confidence ?? null) === (out.Confidence ?? null);
    }

    /** Sets a new row's key columns (record, feature, pin, input, source) and its key hash. */
    protected AssignKeyColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, keyHash: string): void {
        fv.RecordProcessID = params.RecordProcessID;
        fv.EntityID = params.EntityID;
        fv.RecordID = params.RecordID;
        fv.FeatureName = out.FeatureName;
        fv.PipelineVersion = params.PipelineVersion;
        fv.PromptID = params.PromptID || null;
        fv.PromptVersionHash = params.PromptVersionHash;
        fv.ConstraintHash = params.ConstraintHash || null;
        fv.AIModelID = params.AIModelID;
        fv.ParametersHash = params.ParametersHash;
        fv.InputHash = params.InputHash;
        fv.ValueKeyHash = keyHash;
        fv.Source = params.Source;
    }

    /** Sets a row's value, reasoning, confidence, run links and ComputedAt. */
    protected AssignValueColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, typed: TypedFeatureValue): void {
        fv.ValueText = typed.ValueText;
        fv.ValueNumeric = typed.ValueNumeric;
        fv.ValueBoolean = typed.ValueBoolean;
        fv.ValueDate = typed.ValueDate;
        fv.ValueJSON = typed.ValueJSON;
        fv.Reasoning = out.Reasoning || null;
        // `??` because 0 is a valid confidence
        fv.Confidence = out.Confidence ?? null;
        fv.ProcessRunID = params.ProcessRunID || null;
        fv.ProcessRunDetailID = params.ProcessRunDetailID || null;
        fv.AIPromptRunID = params.AIPromptRunID || null;
        fv.FeatureValueCacheID = params.FeatureValueCacheID || null;
        fv.ComputedAt = new Date();
    }

    /** The error a failed Feature Value save throws. */
    protected SaveError(out: FeatureValueOutputItem, params: RecordFeatureValuesParams, message: string): FeatureValueSaveError {
        return new FeatureValueSaveError(out.FeatureName, params.RecordID, message);
    }

    /**
     * Each output feature's latest `Source='Pipeline'` value for the record, on any key, by lower-cased feature name.
     * One batched round trip with one view per feature, each reading only its newest row and only the value columns.
     */
    protected async LoadLatestPipelineValues(params: RecordFeatureValuesParams): Promise<Map<string, TypedFeatureValue>> {
        const latest = new Map<string, TypedFeatureValue>();
        const names = [...new Set(params.Outputs.map((o) => o.FeatureName))];
        if (names.length === 0) {
            return latest;
        }
        const recordFilter = `RecordProcessID = '${EscapeSQLString(params.RecordProcessID)}' AND EntityID = '${EscapeSQLString(params.EntityID)}'`
            + ` AND RecordID = '${EscapeSQLString(params.RecordID)}' AND Source = 'Pipeline'`;
        const results = await RunView.FromMetadataProvider(params.Provider).RunViews<LatestFeatureValueRow>(names.map((name) => ({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${recordFilter} AND FeatureName = '${EscapeSQLString(name)}'`,
            OrderBy: 'ComputedAt DESC',
            Fields: ['FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON'],
            MaxRows: 1,
            BypassCache: true,
        })), params.ContextUser);
        results.forEach((res, i) => {
            if (!res.Success) {
                throw new Error(`FeatureValueCacheService: reading the latest Feature Value '${names[i]}' of record '${params.RecordID}' failed: ${res.ErrorMessage}`);
            }
            const row = res.Results?.[0];
            if (row) {
                latest.set(names[i].toLowerCase(), FeatureValueCacheService.TypedValueOf(row));
            }
        });
        return latest;
    }

    /** The keyed rows of a pipeline, by ValueKeyHash. */
    protected async LoadByKeyHashes(params: RecordFeatureValuesParams, keyHashes: string[]): Promise<Map<string, MJFeatureValueEntity>> {
        const map = new Map<string, MJFeatureValueEntity>();
        if (keyHashes.length === 0) {
            return map;
        }
        const res = await RunView.FromMetadataProvider(params.Provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(params.RecordProcessID)}' AND ValueKeyHash IN (${keyHashes.map((k) => `'${EscapeSQLString(k)}'`).join(', ')})`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, params.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading Feature Values failed: ${res.ErrorMessage}`);
        }
        for (const row of res.Results ?? []) {
            if (row.ValueKeyHash) {
                map.set(row.ValueKeyHash, row);
            }
        }
        return map;
    }

    /**
     * A value in the typed column its JavaScript type maps to.
     * @param val an output's value: whatever the pipeline's payload holds at the output's Ref (`unknown` at that boundary)
     */
    public static ToTypedValue(val: FeatureValueOutputItem['Value']): TypedFeatureValue {
        return {
            ValueText: typeof val === 'string' ? val : null,
            ValueNumeric: typeof val === 'number' ? val : null,
            ValueBoolean: typeof val === 'boolean' ? val : null,
            ValueDate: val instanceof Date ? val : null,
            ValueJSON: val !== null && typeof val === 'object' && !(val instanceof Date) ? JSON.stringify(val) : null,
        };
    }

    /** A copy of a row's typed value columns. */
    public static TypedValueOf(row: TypedFeatureValue): TypedFeatureValue {
        // `??` on the numeric and boolean columns because 0 and false are values; '' text is kept as written
        return {
            ValueText: row.ValueText ?? null,
            ValueNumeric: row.ValueNumeric ?? null,
            ValueBoolean: row.ValueBoolean ?? null,
            ValueDate: row.ValueDate ? new Date(row.ValueDate) : null,
            ValueJSON: row.ValueJSON ?? null,
        };
    }

    /** Whether a row holds exactly this typed value. */
    protected static SameTypedValue(row: TypedFeatureValue, v: TypedFeatureValue): boolean {
        const current = FeatureValueCacheService.TypedValueOf(row);
        return current.ValueText === v.ValueText && current.ValueNumeric === v.ValueNumeric
            && current.ValueBoolean === v.ValueBoolean
            && (current.ValueDate ? current.ValueDate.getTime() : null) === (v.ValueDate ? v.ValueDate.getTime() : null)
            && current.ValueJSON === v.ValueJSON;
    }

    /** The SQL filter selecting a cache scope and pin; `KeyHash` conditions are appended by the caller. */
    protected static CacheScopeFilter(p: FeatureValueCacheScope): string {
        const scope = p.Scope === 'prompt' || !p.RecordProcessID
            ? 'RecordProcessID IS NULL'
            : `RecordProcessID = '${EscapeSQLString(p.RecordProcessID)}'`;
        const model = p.AIModelID ? `AIModelID = '${EscapeSQLString(p.AIModelID)}'` : 'AIModelID IS NULL';
        return `${scope} AND PromptID = '${EscapeSQLString(p.PromptID)}' AND PromptVersionHash = '${EscapeSQLString(p.PromptVersionHash)}'`
            + ` AND ConstraintHash = '${EscapeSQLString(p.ConstraintHash)}' AND ${model} AND ParametersHash = '${EscapeSQLString(p.ParametersHash)}'`;
    }

    /**
     * Reads a field by name, matching the name case-insensitively when there is no exact match.
     * @returns the field's value: record data is untyped at this boundary, so `unknown`; undefined when absent
     */
    protected static ReadFieldCaseInsensitive(data: Record<string, unknown>, field: string): unknown {
        if (field in data) {
            return data[field];
        }
        const wanted = field.toLowerCase();
        const actual = Object.keys(data).find((k) => k.toLowerCase() === wanted);
        return actual === undefined ? undefined : data[actual];
    }

    /**
     * A key input as hashed: text normalised by {@link FeatureValueKey.NormalizeValue}, anything else as it is.
     * @param value a record field's value — untyped record data at this boundary, so `unknown`
     */
    protected static NormalizeKeyInput(value: unknown): unknown {
        return typeof value === 'string' ? FeatureValueKey.NormalizeValue(value) : value;
    }

    /** A copy of a record with every value normalised by {@link NormalizeKeyInput}. */
    protected static NormalizeRecord(data: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
            out[k] = FeatureValueCacheService.NormalizeKeyInput(v);
        }
        return out;
    }
}
