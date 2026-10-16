/**
 * @fileoverview FeatureValueCacheService — manages the dedup cache (MJ: Feature Value Caches) and the keyed Feature
 * Value upserts (MJ: Feature Values, one row per Feature Value key) for Feature Pipelines (P1-7c).
 * @module @memberjunction/feature-pipelines
 */

import { BaseSingleton, Canonicalize, ComputeContentHashAsync, EscapeSQLString } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, type RunViewParams, UserInfo } from '@memberjunction/core';
import { FeatureValueKey, type FeatureValueSource } from '../spec/feature-value-key.js';
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

/** The cache scope and pin a cache call reads or writes. */
export interface FeatureValueCacheScope {
    recordProcessID?: string | null;
    scope?: 'pipeline' | 'prompt';
    promptID: string;
    promptVersionHash: string;
    constraintHash: string;
    /** The pin's primary AI model (null when the prompt has no Active model). */
    aiModelID: string | null;
    parametersHash: string;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** Cache lookup parameters. */
export interface CacheLookupParams extends FeatureValueCacheScope {
    keyHash: string;
    /** Whether a hit increments the entry's HitCount and LastHitAt (default true; false on a dry run). */
    recordHit?: boolean;
}

/** Batch cache lookup parameters. */
export interface BatchCacheLookupParams extends FeatureValueCacheScope {
    keyHashes: string[];
    /** Whether a hit increments the entry's HitCount and LastHitAt (default true; false on a dry run). */
    recordHit?: boolean;
}

/** Parameters for storing a newly computed value into the cache. */
export interface CacheStoreParams extends FeatureValueCacheScope {
    keyHash: string;
    keyDisplay: string;
    keyJSON: string;
    outputsJSON: string;
    reasoning?: string | null;
    aiPromptRunID?: string | null;
    ttlSeconds?: number;
}

/** Feature output item for MJ: Feature Values. */
export interface FeatureValueOutputItem {
    featureName: string;
    value: unknown;
    reasoning?: string | null;
    confidence?: number | null;
}

/** Parameters for upserting a record's Feature Values, one row per Feature Value key; every key part is required. */
export interface RecordFeatureValuesParams {
    recordProcessID: string;
    entityID: string;
    recordID: string;
    outputs: FeatureValueOutputItem[];
    promptID?: string | null;
    /** The pin's prompt version hash; null for a value no prompt computed. */
    promptVersionHash: string | null;
    constraintHash?: string | null;
    processRunID?: string | null;
    processRunDetailID?: string | null;
    aiPromptRunID?: string | null;
    featureValueCacheID?: string | null;
    /** The pipeline version that computed the values; null when unversioned. */
    pipelineVersion: number | null;
    /** The pin's primary AI model; null when the prompt has no Active model, or for a human value. */
    aiModelID: string | null;
    /** The pin's parameters hash; null for a human value. */
    parametersHash: string | null;
    /** SHA-256 of the record's normalised inputs (the cache key hash); null when there is none. */
    inputHash: string | null;
    source: FeatureValueSource;
    /** The rows are history (a decision an escalation superseded), never made the feature's latest value again. */
    historyOnly?: boolean;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** One record's Feature Values of one feature in one pipeline, and the user and provider to read or write them with. */
export interface FeatureValueRecordRef {
    RecordProcessID: string;
    EntityID: string;
    RecordID: string;
    FeatureName: string;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** Parameters for reading the latest Feature Value of one record and feature from one source. */
export interface LatestFeatureValueParams extends FeatureValueRecordRef {
    Source: FeatureValueSource;
    /** Ignore values this run wrote: they are not "what the pipeline last wrote". */
    ExcludeProcessRunID?: string | null;
}

/** Parameters for recording a value a person entered on a pipeline's target. */
export interface RecordHumanValueParams extends FeatureValueRecordRef {
    /** The field's current value. `unknown` on purpose: a field value of any entity, the type `BaseEntity.Get` returns. */
    Value: unknown;
    ProcessRunID?: string | null;
}

/** The typed value columns of a Feature Value. */
export type TypedFeatureValue = Pick<MJFeatureValueEntity, 'ValueText' | 'ValueNumeric' | 'ValueBoolean' | 'ValueDate' | 'ValueJSON'>;

/** What {@link FeatureValueCacheService.RecordFeatureValues} did with each output. */
export interface RecordFeatureValuesOutcome {
    Upserted: number;
    Unchanged: number;
    /**
     * Each output's latest `Source='Pipeline'` value for the record before this call, on any key, by feature name; null
     * when the pipeline never wrote the feature.
     */
    Previous: Record<string, TypedFeatureValue | null>;
}

/** What one output's write did. `RecordWriteOutcome` in `@memberjunction/record-set-processor-base` mirrors it. */
export type FeatureValueWriteResult = Exclude<keyof RecordFeatureValuesOutcome, 'Previous'>;

/** A Feature Value that could not be saved, with the feature, the record and the provider's message as fields. */
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

/** The columns {@link FeatureValueCacheService.LoadLatestPipelineValues} and {@link FeatureValueCacheService.GetLatestValue} read. */
type LatestFeatureValueRow = TypedFeatureValue & Pick<MJFeatureValueEntity, 'FeatureName'>;

/** A feature's latest Pipeline value of a record, and the key of the row that holds it. */
export interface LatestPipelineValue {
    Value: TypedFeatureValue;
    /** The holding row's Feature Value key; null on a row written before keys existed. */
    ValueKeyHash: MJFeatureValueEntity['ValueKeyHash'];
}

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
     * Uses KeyFields when provided, or falls back to the full rendered context / record data. Field names match
     * case-insensitively and text inputs are normalised ({@link FeatureValueKey.NormalizeValue}).
     */
    public async ComputeCacheKey(params: ComputeCacheKeyParams): Promise<CacheKeyResult> {
        if (params.keyFields && params.keyFields.length > 0) {
            const keyObj: Record<string, unknown> = {};
            const displayParts: string[] = [];

            for (const field of params.keyFields) {
                const val = FeatureValueCacheService.ReadFieldCaseInsensitive(params.recordData, field);
                keyObj[field] = val !== undefined ? FeatureValueCacheService.NormalizeKeyInput(val) : null;
                if (val !== null && val !== undefined && String(val).trim().length > 0) {
                    displayParts.push(String(val).trim());
                }
            }

            const keyJSON = Canonicalize(keyObj);
            const keyHash = await ComputeContentHashAsync(keyObj);
            const keyDisplay = displayParts.join(' | ') || keyHash.substring(0, 16);

            return { keyHash, keyJSON, keyDisplay };
        }

        // Whole rendered context (or whole record data)
        const basis: Record<string, unknown> = params.renderedContext
            ? { context: FeatureValueKey.NormalizeValue(params.renderedContext) }
            : FeatureValueCacheService.NormalizeRecord(params.recordData);
        const keyJSON = Canonicalize(basis);
        const keyHash = await ComputeContentHashAsync(basis);
        const keyDisplay = params.renderedContext
            ? params.renderedContext.length > 80
                ? `${params.renderedContext.substring(0, 77)}...`
                : params.renderedContext
            : keyHash.substring(0, 16);

        return { keyHash, keyJSON, keyDisplay };
    }

    /** @deprecated Use {@link ComputeCacheKey}. */
    public async computeCacheKey(params: ComputeCacheKeyParams): Promise<CacheKeyResult> {
        return this.ComputeCacheKey(params);
    }

    /**
     * Looks up an existing cache entry. Returns null on miss or when expired.
     * Automatically increments HitCount and updates LastHitAt on hit, unless `recordHit` is false.
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
     * Filters out expired entries and increments HitCount on valid hits, unless `recordHit` is false.
     */
    public async BatchLookup(params: BatchCacheLookupParams): Promise<Map<string, MJFeatureValueCacheEntity>> {
        const results = new Map<string, MJFeatureValueCacheEntity>();
        if (params.keyHashes.length === 0) {
            return results;
        }

        const quotedKeys = params.keyHashes.map((k) => `'${EscapeSQLString(k)}'`).join(', ');
        const filter = `${FeatureValueCacheService.CacheScopeFilter(params)} AND KeyHash IN (${quotedKeys})`;

        const rv = RunView.FromMetadataProvider(params.provider ?? Metadata.Provider);
        const res = await rv.RunView<MJFeatureValueCacheEntity>(
            {
                EntityName: 'MJ: Feature Value Caches',
                ExtraFilter: filter,
                ResultType: 'entity_object',
            },
            params.contextUser
        );

        if (!res.Success) {
            LogError(`FeatureValueCacheService.BatchLookup: RunView failed: ${res.ErrorMessage}`);
            return results;
        }

        if (!res.Results) {
            return results;
        }

        const now = Date.now();
        for (const entry of res.Results) {
            // Check expiration
            if (entry.ExpiresAt != null && new Date(entry.ExpiresAt).getTime() <= now) {
                continue;
            }

            if (params.recordHit !== false) {
                entry.HitCount = (entry.HitCount ?? 0) + 1;
                entry.LastHitAt = new Date();
                void entry.Save().then((saved) => {
                    if (!saved) {
                        LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${entry.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                }).catch((err) => {
                    LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${err instanceof Error ? err.message : String(err)}`);
                });
            }

            results.set(entry.KeyHash, entry);
        }

        return results;
    }

    /**
     * Stores a computed result on its cache key. An existing row for the key — expired or not — is updated in place,
     * so an expired entry is refreshed rather than duplicated.
     * @throws Error naming the key and the provider's message when the save fails.
     */
    public async Store(params: CacheStoreParams): Promise<MJFeatureValueCacheEntity> {
        const provider = params.provider ?? Metadata.Provider;
        const existing = await this.FindByKey(params, provider);
        const entry = existing || (await provider.GetEntityObject<MJFeatureValueCacheEntity>('MJ: Feature Value Caches', params.contextUser));
        if (!existing) {
            entry.NewRecord();
            entry.RecordProcessID = params.scope === 'prompt' ? null : (params.recordProcessID ?? null);
            entry.PromptID = params.promptID;
            entry.PromptVersionHash = params.promptVersionHash;
            entry.ConstraintHash = params.constraintHash;
            entry.AIModelID = params.aiModelID;
            entry.ParametersHash = params.parametersHash;
            entry.KeyHash = params.keyHash;
        }
        entry.KeyDisplay = params.keyDisplay;
        entry.KeyJSON = params.keyJSON;
        entry.OutputsJSON = params.outputsJSON;
        entry.Reasoning = params.reasoning ?? null;
        entry.AIPromptRunID = params.aiPromptRunID ?? null;
        entry.HitCount = 0;
        entry.ComputedAt = new Date();
        entry.ExpiresAt = params.ttlSeconds && params.ttlSeconds > 0 ? new Date(Date.now() + params.ttlSeconds * 1000) : null;

        const saved = await entry.Save();
        if (!saved) {
            throw new Error(`FeatureValueCacheService: failed to save cache entry for keyHash '${params.keyHash}': ${entry.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        return entry;
    }

    /** The row on a store's key, expired or not; null when there is none. */
    protected async FindByKey(params: CacheStoreParams, provider: IMetadataProvider): Promise<MJFeatureValueCacheEntity | null> {
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueCacheEntity>({
            EntityName: 'MJ: Feature Value Caches',
            ExtraFilter: `${FeatureValueCacheService.CacheScopeFilter(params)} AND KeyHash = '${EscapeSQLString(params.keyHash)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
            BypassCache: true,
        }, params.contextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: looking up cache key '${params.keyHash}' failed: ${res.ErrorMessage}`);
        }
        return res.Results?.[0] || null;
    }

    /**
     * Upserts one Feature Value per output on its key (record, feature, pipeline version, prompt version hash, primary
     * model, parameters hash, input hash, source). A key that already holds the same value, reasoning and confidence is
     * left untouched while it is the feature's latest Pipeline value; when another key holds the latest one (a version
     * that becomes Active again), its `ComputedAt` and run links are refreshed so it is the latest again (counted
     * Unchanged). A `historyOnly` row is never refreshed. A changed row is updated in place; a new one is inserted.
     * @returns How many outputs were upserted or unchanged, and each feature's latest pipeline value before the call.
     * @throws FeatureValueSaveError when a row cannot be saved; Error when the rows cannot be read.
     */
    public async RecordFeatureValues(params: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> {
        const provider = params.provider ?? Metadata.Provider;
        const keyed = await Promise.all(params.outputs.map(async (out) => ({
            out,
            keyHash: await FeatureValueKey.ComputeHash({
                EntityID: params.entityID, RecordID: params.recordID, FeatureName: out.featureName,
                PipelineVersion: params.pipelineVersion, PromptVersionHash: params.promptVersionHash,
                AIModelID: params.aiModelID, ParametersHash: params.parametersHash,
                InputHash: params.inputHash, Source: params.source,
            }),
        })));
        const previous = await this.LoadLatestPipelineValues(params, provider);
        const existing = await this.LoadByKeyHashes(params, provider, keyed.map((k) => k.keyHash));
        const results = await Promise.all(keyed.map(({ out, keyHash }) => {
            const latest = previous.get(out.featureName.toLowerCase());
            const supersededByAnotherKey = params.historyOnly !== true && !!latest && latest.ValueKeyHash !== keyHash;
            return this.WriteOne(params, provider, out, keyHash, existing.get(keyHash), supersededByAnotherKey);
        }));

        const outcome: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Previous: {} };
        keyed.forEach(({ out }, i) => {
            outcome.Previous[out.featureName] = previous.get(out.featureName.toLowerCase())?.Value || null;
            outcome[results[i]]++;
        });
        return outcome;
    }

    /**
     * Writes one output on its key: unchanged, updated in place, or inserted. An unchanged row is saved only when
     * another key holds the feature's latest value (`supersededByAnotherKey`), to make it the latest again.
     * @throws FeatureValueSaveError when the save fails.
     */
    protected async WriteOne(
        params: RecordFeatureValuesParams,
        provider: IMetadataProvider,
        out: FeatureValueOutputItem,
        keyHash: string,
        row: MJFeatureValueEntity | undefined,
        supersededByAnotherKey: boolean
    ): Promise<FeatureValueWriteResult> {
        const typed = FeatureValueCacheService.ToTypedValue(out.value);
        const unchanged = !!row && this.IsUnchanged(row, typed, out);
        if (unchanged && !supersededByAnotherKey) {
            return 'Unchanged';
        }
        const fv = row || (await provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.contextUser));
        if (!row) {
            fv.NewRecord();
            this.AssignKeyColumns(fv, params, out, keyHash);
        }
        this.AssignValueColumns(fv, params, out, typed);
        if (!(await fv.Save())) {
            throw new FeatureValueSaveError(out.featureName, params.recordID, fv.LatestResult?.CompleteMessage || 'unknown error');
        }
        return unchanged ? 'Unchanged' : 'Upserted';
    }

    /** Whether `row` already holds this output: the same typed value, reasoning and confidence. */
    protected IsUnchanged(row: MJFeatureValueEntity, typed: TypedFeatureValue, out: FeatureValueOutputItem): boolean {
        return FeatureValueCacheService.SameTypedValue(row, typed)
            && (row.Reasoning || null) === (out.reasoning || null)
            && (row.Confidence ?? null) === (out.confidence ?? null);
    }

    /** Sets a new row's key columns (record, feature, pin, input, source) and its key hash. */
    protected AssignKeyColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, keyHash: string): void {
        fv.RecordProcessID = params.recordProcessID;
        fv.EntityID = params.entityID;
        fv.RecordID = params.recordID;
        fv.FeatureName = out.featureName;
        fv.PipelineVersion = params.pipelineVersion;
        fv.PromptID = params.promptID ?? null;
        fv.PromptVersionHash = params.promptVersionHash;
        fv.ConstraintHash = params.constraintHash ?? null;
        fv.AIModelID = params.aiModelID;
        fv.ParametersHash = params.parametersHash;
        fv.InputHash = params.inputHash;
        fv.ValueKeyHash = keyHash;
        fv.Source = params.source;
    }

    /** Sets a row's value, reasoning, confidence, run links and ComputedAt. */
    protected AssignValueColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, typed: TypedFeatureValue): void {
        fv.ValueText = typed.ValueText;
        fv.ValueNumeric = typed.ValueNumeric;
        fv.ValueBoolean = typed.ValueBoolean;
        fv.ValueDate = typed.ValueDate;
        fv.ValueJSON = typed.ValueJSON;
        fv.Reasoning = out.reasoning ?? null;
        fv.Confidence = out.confidence ?? null;
        fv.ProcessRunID = params.processRunID ?? null;
        fv.ProcessRunDetailID = params.processRunDetailID ?? null;
        fv.AIPromptRunID = params.aiPromptRunID ?? null;
        fv.FeatureValueCacheID = params.featureValueCacheID ?? null;
        fv.ComputedAt = new Date();
    }

    /**
     * Each output feature's latest `Source='Pipeline'` value for the record, on any key, by lower-cased feature name,
     * with the key of the row holding it. One batched round trip, one view per feature.
     */
    protected async LoadLatestPipelineValues(params: RecordFeatureValuesParams, provider: IMetadataProvider): Promise<Map<string, LatestPipelineValue>> {
        const latest = new Map<string, LatestPipelineValue>();
        const names = [...new Set(params.outputs.map((o) => o.featureName))];
        if (names.length === 0) {
            return latest;
        }
        const recordFilter = `RecordProcessID = '${EscapeSQLString(params.recordProcessID)}' AND EntityID = '${EscapeSQLString(params.entityID)}'`
            + ` AND RecordID = '${EscapeSQLString(params.recordID)}'${FeatureValueCacheService.SourceFilter('Pipeline')}`;
        const shape = FeatureValueCacheService.LatestValueViewShape();
        const results = await RunView.FromMetadataProvider(provider).RunViews<LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ValueKeyHash'>>(names.map((name) => ({
            ...shape,
            Fields: [...(shape.Fields || []), 'ValueKeyHash'],
            ExtraFilter: `${recordFilter} AND FeatureName = '${EscapeSQLString(name)}'`,
            MaxRows: 1,
        })), params.contextUser);
        results.forEach((res, i) => {
            if (!res.Success) {
                throw new Error(`FeatureValueCacheService: reading the latest Feature Value '${names[i]}' of record '${params.recordID}' failed: ${res.ErrorMessage}`);
            }
            const row = res.Results?.[0];
            if (row) {
                latest.set(names[i].toLowerCase(), { Value: FeatureValueCacheService.TypedValueOf(row), ValueKeyHash: row.ValueKeyHash || null });
            }
        });
        return latest;
    }

    protected async LoadByKeyHashes(params: RecordFeatureValuesParams, provider: IMetadataProvider, keyHashes: string[]): Promise<Map<string, MJFeatureValueEntity>> {
        const map = new Map<string, MJFeatureValueEntity>();
        if (keyHashes.length === 0) {
            return map;
        }
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(params.recordProcessID)}' AND ValueKeyHash IN (${keyHashes.map((k) => `'${EscapeSQLString(k)}'`).join(', ')})`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, params.contextUser);
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
     * The most recent Feature Value of a record and feature from one source, as its typed columns; null when there is
     * none. Read fresh: the human-value guard decides from it whether a field may be overwritten.
     * @throws Error when the read fails (a guard that cannot read must not guess "pipeline-owned").
     */
    public async GetLatestValue(p: LatestFeatureValueParams): Promise<TypedFeatureValue | null> {
        const exclude = p.ExcludeProcessRunID
            ? ` AND (ProcessRunID IS NULL OR ProcessRunID <> '${EscapeSQLString(p.ExcludeProcessRunID)}')`
            : '';
        const res = await RunView.FromMetadataProvider(p.Provider).RunView<LatestFeatureValueRow>({
            ...FeatureValueCacheService.LatestValueViewShape(),
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter(p)}${FeatureValueCacheService.SourceFilter(p.Source)}${exclude}`,
            MaxRows: 1,
        }, p.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading the latest '${p.FeatureName}' value of record '${p.RecordID}' failed: ${res.ErrorMessage}`);
        }
        const row = res.Results?.[0];
        return row ? FeatureValueCacheService.TypedValueOf(row) : null;
    }

    /**
     * Upserts the record's Human Feature Value for a feature: one per record and feature (the key carries no pin), so a
     * later observation updates the row in place.
     * @throws FeatureValueSaveError when the row cannot be saved.
     */
    public async RecordHumanValue(p: RecordHumanValueParams): Promise<void> {
        await this.RecordFeatureValues({
            recordProcessID: p.RecordProcessID, entityID: p.EntityID, recordID: p.RecordID,
            outputs: [{ featureName: p.FeatureName, value: p.Value }], processRunID: p.ProcessRunID || null,
            promptVersionHash: null, pipelineVersion: null, aiModelID: null, parametersHash: null, inputHash: null, source: 'Human',
            contextUser: p.ContextUser, provider: p.Provider,
        });
    }

    /** Deletes the record's Human Feature Values of a feature (sequentially, in the caller's transaction); returns how many. */
    public async RetireHumanValue(p: FeatureValueRecordRef): Promise<number> {
        const res = await RunView.FromMetadataProvider(p.Provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter(p)} AND Source = 'Human'`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, p.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading the Human '${p.FeatureName}' value of record '${p.RecordID}' failed: ${res.ErrorMessage}`);
        }
        const rows = res.Results || [];
        for (const row of rows) {
            if (!(await row.Delete())) {
                throw new Error(`FeatureValueCacheService: failed retiring the Human '${p.FeatureName}' value of record '${p.RecordID}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
            }
        }
        return rows.length;
    }

    /**
     * The entity, order, columns and freshness every latest-value read shares. "Latest" is the newest `ComputedAt`, ties
     * broken by creation time, then ID, so every read picks the same row.
     */
    protected static LatestValueViewShape(): Pick<RunViewParams, 'EntityName' | 'OrderBy' | 'Fields' | 'BypassCache'> {
        return {
            EntityName: 'MJ: Feature Values',
            OrderBy: 'ComputedAt DESC, __mj_CreatedAt DESC, ID DESC',
            Fields: ['FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON'],
            BypassCache: true,
        };
    }

    /** The SQL filter fragment selecting one source's Feature Values. */
    protected static SourceFilter(source: FeatureValueSource): string {
        return ` AND Source = '${EscapeSQLString(source)}'`;
    }

    /** The SQL filter selecting one record's Feature Values of one feature in one pipeline. */
    protected static RecordFeatureFilter(p: FeatureValueRecordRef): string {
        return `RecordProcessID = '${EscapeSQLString(p.RecordProcessID)}' AND EntityID = '${EscapeSQLString(p.EntityID)}'`
            + ` AND RecordID = '${EscapeSQLString(p.RecordID)}' AND FeatureName = '${EscapeSQLString(p.FeatureName)}'`;
    }

    /** A typed Feature Value as a native value: the column that holds it (JSON parsed); null when every column is empty. */
    public static NativeValueOf(v: TypedFeatureValue): FeatureValueOutputItem['value'] {
        if (v.ValueText !== null) {
            return v.ValueText;
        }
        if (v.ValueNumeric !== null) {
            return v.ValueNumeric;
        }
        if (v.ValueBoolean !== null) {
            return v.ValueBoolean;
        }
        if (v.ValueDate !== null) {
            return v.ValueDate;
        }
        return v.ValueJSON !== null ? JSON.parse(v.ValueJSON) : null;
    }

    /** A value in the typed column its JavaScript type maps to. */
    public static ToTypedValue(val: FeatureValueOutputItem['value']): TypedFeatureValue {
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
        const scope = p.scope === 'prompt' || !p.recordProcessID
            ? 'RecordProcessID IS NULL'
            : `RecordProcessID = '${EscapeSQLString(p.recordProcessID)}'`;
        const model = p.aiModelID ? `AIModelID = '${EscapeSQLString(p.aiModelID)}'` : 'AIModelID IS NULL';
        return `${scope} AND PromptID = '${EscapeSQLString(p.promptID)}' AND PromptVersionHash = '${EscapeSQLString(p.promptVersionHash)}'`
            + ` AND ConstraintHash = '${EscapeSQLString(p.constraintHash)}' AND ${model} AND ParametersHash = '${EscapeSQLString(p.parametersHash)}'`;
    }

    /** Reads a field by name, matching the name case-insensitively when there is no exact match. */
    protected static ReadFieldCaseInsensitive(data: Record<string, unknown>, field: string): unknown {
        if (field in data) {
            return data[field];
        }
        const wanted = field.toLowerCase();
        const actual = Object.keys(data).find((k) => k.toLowerCase() === wanted);
        return actual === undefined ? undefined : data[actual];
    }

    /** A key input as hashed: text normalised by {@link FeatureValueKey.NormalizeValue}, anything else as it is. */
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
