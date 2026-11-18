/**
 * @fileoverview FeatureValueCacheService — manages the dedup cache (MJ: Feature Value Caches) and the keyed Feature
 * Value upserts (MJ: Feature Values, one row per Feature Value key) for Feature Pipelines (P1-7c).
 * @module @memberjunction/feature-pipelines
 */

import { BaseSingleton, Canonicalize, ComputeContentHashAsync, EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, type RunViewParams, UserInfo } from '@memberjunction/core';
import type { ValueConstraint } from '../spec/value-constraint.js';
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
    /** `unknown`: a Feature Value of any output type (string, number, boolean, date or JSON), typed by its constraint at write time. */
    value: unknown;
    /** The output's declared constraint type; lets a string answer land in its typed column. */
    constraintType?: ValueConstraint['Type'];
    reasoning?: string | null;
    confidence?: number | null;
    /** Optional explicit text value; stored in ValueText alongside a numeric score for classification models (M3). */
    valueText?: string | null;
}

/** Parameters for upserting a record's Feature Values, one row per Feature Value key; every key part is required. */
export interface RecordFeatureValuesParams {
    /** The pipeline's Record Process; null only for a Human row on a binding scored with no Record Process. */
    recordProcessID: string | null;
    /** The scoring binding a Human row overrides; set exactly when `recordProcessID` is null. */
    mlModelScoringBindingID?: string | null;
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
    /** The ML Model that computed the values for an 'ML Model' process; null for prompt/human values (B1). */
    mlModelID?: string | null;
    /** The pin's parameters hash; null for a human value. */
    parametersHash: string | null;
    /** SHA-256 of the record's normalised inputs (the cache key hash); null when there is none. */
    inputHash: string | null;
    source: FeatureValueSource;
    /** The rows are history (a decision an escalation superseded), never made the feature's latest value again. */
    historyOnly?: boolean;
    contextUser: UserInfo;
    /** The caller's provider (on the server, the request's own connection); the rows are read and written through it. */
    provider: IMetadataProvider;
}

/**
 * One record's Feature Values of one feature, and the user and provider to read or write them with. The rows are scoped
 * by the pipeline's Record Process, or — for a Human row on a binding scored with no Record Process — by the binding.
 */
export interface FeatureValueRecordRef {
    /** The pipeline's Record Process; null only for a Human row on a binding scored with no Record Process. */
    RecordProcessID: string | null;
    /** The scoring binding a Human row overrides; set exactly when RecordProcessID is null. */
    MLModelScoringBindingID?: string;
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

/** One record's prediction in a {@link FeatureValueCacheService.RecordModelValues} batch. */
export interface ModelValueRow {
    /** The bare record id (F-L3-6). */
    RecordID: string;
    /** The prediction in its typed columns (§5.8.1's mapping: score, class, probabilities and drivers JSON). */
    Value: TypedFeatureValue;
    /** The predicted class's probability for a classification; null for a regression. */
    Confidence: number | null;
    /** Whether the record was in the model's training snapshot. */
    InTraining: boolean;
}

/** A batch of one binding's predictions as of one instant, written as `Source = 'Model'` Feature Values. */
export interface RecordModelValuesParams {
    /** The binding that defines the prediction feature. */
    MLModelScoringBindingID: string;
    /** The binding's target entity. */
    EntityID: string;
    /** The binding's feature name. */
    FeatureName: string;
    /** `Champion` for the binding's model; `Challenger` for the live challenger mirror. */
    Role: NonNullable<MJFeatureValueEntity['Role']>;
    /** The exact model version that scored the batch. */
    MLModelID: string;
    /** The `MJ: ML Scoring Runs` row of the run (one per role). */
    MLScoringRunID: string;
    /** The scoring as-of instant (00:00 UTC of the run's as-of date): part of the row key, so a same-date re-run replaces. */
    EffectiveAsOf: Date;
    /** The Record Process run when that path scored the batch; null otherwise. */
    ProcessRunID: string | null;
    /** One prediction per record; a record appears at most once. */
    Rows: readonly ModelValueRow[];
    /** The user the rows are read and saved as. */
    ContextUser: UserInfo;
    /** The caller's provider; the rows are read and saved through it, in the caller's transaction. */
    Provider: IMetadataProvider;
}

/** What {@link FeatureValueCacheService.RecordModelValues} did: rows new on their key, and rows replaced in place. */
export interface RecordModelValuesOutcome {
    /** Rows written on a key that held no row. */
    Inserted: number;
    /** Rows already on their key (a same as-of date re-run), replaced in place. */
    Replaced: number;
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

/** The key field a {@link FeatureValueKeyError} names. */
export type FeatureValueKeyField = keyof Pick<MJFeatureValueEntity, 'RecordProcessID' | 'MLModelScoringBindingID' | 'Source' | 'RecordID'>;

/** A Feature Value read or write whose key is malformed, refused before any row is read or saved. */
export class FeatureValueKeyError extends Error {
    /**
     * @param Field - The key field that is missing, misplaced or repeated.
     * @param Reason - What is wrong with it.
     */
    constructor(
        public readonly Field: FeatureValueKeyField,
        public readonly Reason: string,
    ) {
        super(`FeatureValueCacheService: invalid Feature Value key (${Field}): ${Reason}`);
        this.name = 'FeatureValueKeyError';
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
                // fire-and-forget: a failed hit count must not fail the lookup
                void this.recordHitCount(entry);
            }

            results.set(entry.KeyHash, entry);
        }

        return results;
    }

    /** Counts a hit on a cache entry; a failed save is logged, never thrown (the lookup already succeeded). */
    private async recordHitCount(entry: MJFeatureValueCacheEntity): Promise<void> {
        try {
            entry.HitCount = (entry.HitCount ?? 0) + 1;
            entry.LastHitAt = new Date();
            if (!(await entry.Save())) {
                LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${entry.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            LogError(`FeatureValueCacheService: failed updating HitCount on cache '${entry.ID}': ${err instanceof Error ? err.message : String(err)}`);
        }
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
        // Lookup goes by KeyHash, so shortening the display text is safe; an over-long value would fail the save (#4917).
        entry.KeyDisplay = FeatureValueCacheService.ClampToLength(params.keyDisplay, FeatureValueCacheService.fieldMaxLength(entry, 'KeyDisplay'));
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

    /**
     * Shortens `value` to at most `maxLength` characters, ending with `…` when cut.
     * @param value - The text to fit.
     * @param maxLength - The column's character limit; 0 or less means unlimited.
     */
    public static ClampToLength(value: string, maxLength: number): string {
        if (maxLength <= 0 || value.length <= maxLength) {
            return value;
        }
        return `${value.substring(0, maxLength - 1)}…`;
    }

    /** Character limit of a field from entity metadata; 0 when unlimited or unknown. */
    private static fieldMaxLength(entry: MJFeatureValueCacheEntity, fieldName: string): number {
        return entry.EntityInfo?.Fields.find(f => f.Name === fieldName)?.MaxLength ?? 0;
    }

    /** The row on a store's key, expired or not; null when there is none. */
    protected async FindByKey(params: CacheStoreParams, provider: IMetadataProvider): Promise<MJFeatureValueCacheEntity | null> {
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueCacheEntity>({
            EntityName: 'MJ: Feature Value Caches',
            ExtraFilter: `${FeatureValueCacheService.CacheScopeFilter(params)} AND KeyHash = '${EscapeSQLString(params.keyHash)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
            SkipTotalRowCount: true,
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
     * A Human row with no Record Process is keyed by its scoring binding instead (§6.2a).
     * @throws FeatureValueKeyError when the scope is malformed (see {@link AssertKeyedWriteScope}); FeatureValueSaveError
     * when a row cannot be saved; Error when the rows cannot be read.
     */
    public async RecordFeatureValues(params: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> {
        FeatureValueCacheService.AssertKeyedWriteScope(params);
        const provider = params.provider;
        const keyed = await Promise.all(params.outputs.map(async (out) => ({
            out,
            keyHash: await FeatureValueKey.ComputeHash({
                EntityID: params.entityID, RecordID: params.recordID, FeatureName: out.featureName,
                PipelineVersion: params.pipelineVersion, PromptVersionHash: params.promptVersionHash,
                AIModelID: params.aiModelID, ParametersHash: params.parametersHash,
                InputHash: params.inputHash, Source: params.source,
                MLModelID: params.mlModelID ?? null,
                MLModelScoringBindingID: params.recordProcessID === null ? params.mlModelScoringBindingID || null : null,
            }),
        })));
        const previous = await this.LoadLatestPipelineValues(params, provider);
        const existing = await this.LoadByKeyHashes(params, provider, keyed.map((k) => k.keyHash));
        // Sequential, not Promise.all: the caller's entity transaction belongs to one async scope, so the rows are saved one at a time on its provider
        const results: Array<'Upserted' | 'Unchanged'> = [];
        for (const { out, keyHash } of keyed) {
            const latest = previous.get(out.featureName.toLowerCase());
            const supersededByAnotherKey = params.historyOnly !== true && !!latest && latest.ValueKeyHash !== keyHash;
            results.push(await this.WriteOne(params, provider, out, keyHash, existing.get(keyHash), supersededByAnotherKey));
        }

        const outcome: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Previous: {} };
        keyed.forEach(({ out }, i) => {
            outcome.Previous[out.featureName] = previous.get(out.featureName.toLowerCase())?.Value || null;
            outcome[results[i]]++;
        });
        return outcome;
    }

    /**
     * Writes a batch of one binding's predictions as `Source = 'Model'` Feature Values, one row per record on the key
     * `UQ_FeatureValue_ModelRow` (binding, entity, record, as-of instant, role): a row already on its key (a same as-of
     * date re-run) is replaced in place, value and lineage; any other is inserted. The batch's existing rows are read in
     * one query; the rows are saved one at a time in the caller's transaction. `ValueKeyHash` stays null, `ComputedAt` is
     * the write time.
     * @returns How many rows were inserted and how many replaced.
     * @throws FeatureValueKeyError when a record appears twice in the batch (nothing is written); FeatureValueSaveError
     * when a row cannot be saved; Error when the existing rows cannot be read.
     */
    public async RecordModelValues(params: RecordModelValuesParams): Promise<RecordModelValuesOutcome> {
        const outcome: RecordModelValuesOutcome = { Inserted: 0, Replaced: 0 };
        if (params.Rows.length === 0) {
            return outcome;
        }
        FeatureValueCacheService.AssertDistinctRecords(params.Rows);
        const existing = await this.LoadModelRows(params);
        // Sequential, not Promise.all: the caller's entity transaction belongs to one async scope
        for (const row of params.Rows) {
            const stored = existing.get(FeatureValueCacheService.recordKey(row.RecordID));
            await this.WriteModelRow(params, row, stored);
            outcome[stored ? 'Replaced' : 'Inserted']++;
        }
        return outcome;
    }

    /**
     * Refuses a model batch that names a record twice: two rows on one key would fail `UQ_FeatureValue_ModelRow`.
     * @throws FeatureValueKeyError naming the repeated record.
     */
    protected static AssertDistinctRecords(rows: readonly ModelValueRow[]): void {
        const seen = new Set<string>();
        for (const row of rows) {
            const key = FeatureValueCacheService.recordKey(row.RecordID);
            if (seen.has(key)) {
                throw new FeatureValueKeyError('RecordID', `record '${row.RecordID}' appears more than once in the batch`);
            }
            seen.add(key);
        }
    }

    /**
     * The batch's rows already on their model-row key (binding, entity, batch records, as-of instant, role), by record:
     * one query, read fresh.
     * @throws Error when the read fails.
     */
    protected async LoadModelRows(params: RecordModelValuesParams): Promise<Map<string, MJFeatureValueEntity>> {
        const records = params.Rows.map((r) => `'${EscapeSQLString(r.RecordID)}'`).join(', ');
        const res = await RunView.FromMetadataProvider(params.Provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `Source = 'Model' AND MLModelScoringBindingID = '${EscapeSQLString(NormalizeUUID(params.MLModelScoringBindingID))}'`
                + ` AND EntityID = '${EscapeSQLString(params.EntityID)}' AND RecordID IN (${records})`
                + ` AND EffectiveAsOf = '${params.EffectiveAsOf.toISOString()}' AND Role = '${EscapeSQLString(params.Role)}'`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, params.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading the '${params.FeatureName}' predictions of binding '${params.MLModelScoringBindingID}' failed: ${res.ErrorMessage}`);
        }
        const byRecord = new Map<string, MJFeatureValueEntity>();
        for (const row of res.Results || []) {
            byRecord.set(FeatureValueCacheService.recordKey(row.RecordID), row);
        }
        return byRecord;
    }

    /**
     * Saves one prediction: replaces `stored` in place, or inserts a new row on its key.
     * @throws FeatureValueSaveError when the save fails.
     */
    protected async WriteModelRow(params: RecordModelValuesParams, row: ModelValueRow, stored: MJFeatureValueEntity | undefined): Promise<void> {
        const fv = stored || (await params.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.ContextUser));
        if (!stored) {
            fv.NewRecord();
            this.AssignModelKeyColumns(fv, params, row);
        }
        this.AssignModelValueColumns(fv, params, row);
        const failure = await this.SaveFailure(fv);
        if (failure !== null) {
            throw new FeatureValueSaveError(params.FeatureName, row.RecordID, failure);
        }
    }

    /** Sets a new Model row's key columns (binding, entity, record, feature, as-of instant, role) and clears the pin. */
    protected AssignModelKeyColumns(fv: MJFeatureValueEntity, params: RecordModelValuesParams, row: ModelValueRow): void {
        fv.Source = 'Model';
        fv.RecordProcessID = null;
        fv.MLModelScoringBindingID = params.MLModelScoringBindingID;
        fv.EntityID = params.EntityID;
        fv.RecordID = row.RecordID;
        fv.FeatureName = params.FeatureName;
        fv.EffectiveAsOf = params.EffectiveAsOf;
        fv.Role = params.Role;
        fv.ValueKeyHash = null;
        fv.PipelineVersion = null;
        fv.PromptID = null;
        fv.PromptVersionHash = null;
        fv.ConstraintHash = null;
        fv.AIModelID = null;
        fv.ParametersHash = null;
        fv.InputHash = null;
    }

    /** Sets a Model row's value, confidence, lineage (model, run, in-training), run link and ComputedAt. */
    protected AssignModelValueColumns(fv: MJFeatureValueEntity, params: RecordModelValuesParams, row: ModelValueRow): void {
        fv.ValueText = row.Value.ValueText;
        fv.ValueNumeric = row.Value.ValueNumeric;
        fv.ValueBoolean = row.Value.ValueBoolean;
        fv.ValueDate = row.Value.ValueDate;
        fv.ValueJSON = row.Value.ValueJSON;
        fv.Reasoning = null;
        fv.Confidence = row.Confidence;
        fv.MLModelID = params.MLModelID;
        fv.MLScoringRunID = params.MLScoringRunID;
        fv.InTraining = row.InTraining;
        fv.ProcessRunID = params.ProcessRunID;
        fv.ProcessRunDetailID = null;
        fv.AIPromptRunID = null;
        fv.FeatureValueCacheID = null;
        fv.ComputedAt = new Date();
    }

    /** A record id as the store matches it: case-insensitively, as SQL Server's default collation compares `RecordID`. */
    private static recordKey(recordID: string): string {
        return recordID.toLowerCase();
    }

    /**
     * Writes one output on its key: unchanged, updated in place, or inserted. An unchanged row is saved only when
     * another key holds the feature's latest value (`supersededByAnotherKey`), to make it the latest again. An insert
     * that fails on the key's unique index because a concurrent run stored the same typed value first is Unchanged.
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
        const typed = FeatureValueCacheService.StoredValueOf(out);
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
        const failure = await this.SaveFailure(fv);
        if (failure === null) {
            return unchanged ? 'Unchanged' : 'Upserted';
        }
        if (!row && failure.includes(FeatureValueCacheService.ValueKeyIndexName)
            && (await this.ConcurrentInsertHolds(params, provider, keyHash, typed))) {
            return 'Unchanged';
        }
        throw new FeatureValueSaveError(out.featureName, params.recordID, failure);
    }

    /** The unique index on (RecordProcessID, ValueKeyHash): a second insert of a key fails on it. */
    protected static readonly ValueKeyIndexName = 'UQ_FeatureValue_ValueKey';

    /** Saves a row; null when it saved, else the provider's message (a rejected save included). */
    protected async SaveFailure(fv: MJFeatureValueEntity): Promise<string | null> {
        try {
            return (await fv.Save()) ? null : fv.LatestResult?.CompleteMessage || 'unknown error';
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /**
     * Whether a row another run inserted on the key between this write's read and its insert (two runs over the same
     * scope) already holds this typed value, so the write is satisfied. Read fresh.
     */
    protected async ConcurrentInsertHolds(params: RecordFeatureValuesParams, provider: IMetadataProvider, keyHash: string, typed: TypedFeatureValue): Promise<boolean> {
        const stored = (await this.LoadByKeyHashes(params, provider, [keyHash])).get(keyHash);
        return !!stored && FeatureValueCacheService.SameTypedValue(stored, typed);
    }

    /** Whether `row` already holds this output: the same typed value, reasoning and confidence. */
    protected IsUnchanged(row: MJFeatureValueEntity, typed: TypedFeatureValue, out: FeatureValueOutputItem): boolean {
        return FeatureValueCacheService.SameTypedValue(row, typed)
            && (row.Reasoning || null) === (out.reasoning || null)
            && (row.Confidence ?? null) === (out.confidence ?? null);
    }

    /** Sets a new row's key columns (scope, record, feature, pin, input, source, champion role) and its key hash. */
    protected AssignKeyColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, keyHash: string): void {
        fv.RecordProcessID = params.recordProcessID;
        fv.MLModelScoringBindingID = params.recordProcessID === null ? params.mlModelScoringBindingID || null : null;
        fv.EntityID = params.entityID;
        fv.RecordID = params.recordID;
        fv.FeatureName = out.featureName;
        fv.PipelineVersion = params.pipelineVersion;
        fv.PromptID = params.promptID ?? null;
        fv.PromptVersionHash = params.promptVersionHash;
        fv.ConstraintHash = params.constraintHash ?? null;
        fv.AIModelID = params.aiModelID;
        fv.MLModelID = params.mlModelID ?? null;
        fv.ParametersHash = params.parametersHash;
        fv.InputHash = params.inputHash;
        fv.ValueKeyHash = keyHash;
        fv.Source = params.source;
        fv.Role = 'Champion';
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
     * with the key of the row holding it. One batched round trip, one view per feature; empty for a binding-scoped
     * write (no Record Process, so no Pipeline row).
     */
    protected async LoadLatestPipelineValues(params: RecordFeatureValuesParams, provider: IMetadataProvider): Promise<Map<string, LatestPipelineValue>> {
        const latest = new Map<string, LatestPipelineValue>();
        if (params.recordProcessID === null) {
            // a binding-scoped Human row: Pipeline rows always carry a Record Process, so there is none to read
            return latest;
        }
        const rows = await this.readLatestPipelineRows({
            RecordProcessID: params.recordProcessID, EntityID: params.entityID, RecordID: params.recordID,
            FeatureNames: params.outputs.map((o) => o.featureName), ContextUser: params.contextUser, Provider: provider,
        });
        for (const [key, row] of rows) {
            latest.set(key, { Value: FeatureValueCacheService.TypedValueOf(row), ValueKeyHash: row.ValueKeyHash || null });
        }
        return latest;
    }

    /**
     * The newest `Source='Pipeline'` and `Role='Champion'` row of each named feature of a record, by lower-cased feature
     * name (a feature with none is absent): one batched round trip, one view per feature bounded to its newest row.
     * Shared by {@link LoadLatestPipelineValues} and {@link GetLatestPipelineValues}.
     * @throws Error naming the feature whose read failed.
     */
    private async readLatestPipelineRows(p: Omit<FeatureValueRecordRef, 'FeatureName'> & { FeatureNames: string[]; ExcludeProcessRunID?: string | null }):
        Promise<Map<string, LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ValueKeyHash'>>> {
        const rows = new Map<string, LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ValueKeyHash'>>();
        const names = [...new Set(p.FeatureNames)];
        if (names.length === 0) {
            return rows;
        }
        const exclude = p.ExcludeProcessRunID
            ? ` AND (ProcessRunID IS NULL OR ProcessRunID <> '${EscapeSQLString(p.ExcludeProcessRunID)}')`
            : '';
        const recordFilter = `${FeatureValueCacheService.RecordScopeFilter(p.RecordProcessID, p.MLModelScoringBindingID)} AND EntityID = '${EscapeSQLString(p.EntityID)}'`
            + ` AND RecordID = '${EscapeSQLString(p.RecordID)}'${FeatureValueCacheService.SourceFilter('Pipeline')} AND Role = 'Champion'${exclude}`;
        const shape = FeatureValueCacheService.LatestValueViewShape();
        const results = await RunView.FromMetadataProvider(p.Provider).RunViews<LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ValueKeyHash'>>(names.map((name) => ({
            ...shape,
            Fields: [...(shape.Fields || []), 'ValueKeyHash'],
            ExtraFilter: `${recordFilter} AND FeatureName = '${EscapeSQLString(name)}'`,
            MaxRows: 1,
            SkipTotalRowCount: true,
        })), p.ContextUser);
        results.forEach((res, i) => {
            if (!res.Success) {
                throw new Error(`FeatureValueCacheService: reading the latest Feature Value '${names[i]}' of record '${p.RecordID}' failed: ${res.ErrorMessage}`);
            }
            const row = res.Results?.[0];
            if (row) {
                rows.set(names[i].toLowerCase(), row);
            }
        });
        return rows;
    }

    /**
     * The Champion rows of a write's scope (its Record Process, or its binding when it has none) on the given Feature
     * Value keys, by key; read fresh.
     * @throws Error when the read fails.
     */
    protected async LoadByKeyHashes(params: RecordFeatureValuesParams, provider: IMetadataProvider, keyHashes: string[]): Promise<Map<string, MJFeatureValueEntity>> {
        const map = new Map<string, MJFeatureValueEntity>();
        if (keyHashes.length === 0) {
            return map;
        }
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${FeatureValueCacheService.RecordScopeFilter(params.recordProcessID, params.mlModelScoringBindingID)} AND ValueKeyHash IN (${keyHashes.map((k) => `'${EscapeSQLString(k)}'`).join(', ')}) AND Role = 'Champion'`,
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
     * The most recent Champion Feature Value of a record and feature from one source, as its typed columns; null when
     * there is none. Read fresh: the human-value guard decides from it whether a field may be overwritten.
     * @throws FeatureValueKeyError when the scope is malformed (see {@link RecordScopeFilter}); Error when the read fails
     * (a guard that cannot read must not guess "pipeline-owned").
     */
    public async GetLatestValue(p: LatestFeatureValueParams): Promise<TypedFeatureValue | null> {
        const exclude = p.ExcludeProcessRunID
            ? ` AND (ProcessRunID IS NULL OR ProcessRunID <> '${EscapeSQLString(p.ExcludeProcessRunID)}')`
            : '';
        const res = await RunView.FromMetadataProvider(p.Provider).RunView<LatestFeatureValueRow>({
            ...FeatureValueCacheService.LatestValueViewShape(),
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter(p)}${FeatureValueCacheService.SourceFilter(p.Source)} AND Role = 'Champion'${exclude}`,
            MaxRows: 1,
            SkipTotalRowCount: true,
        }, p.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading the latest '${p.FeatureName}' value of record '${p.RecordID}' failed: ${res.ErrorMessage}`);
        }
        const row = res.Results?.[0];
        return row ? FeatureValueCacheService.TypedValueOf(row) : null;
    }

    /**
     * The most recent `Source='Pipeline'` value of each named feature of a record, by lower-cased feature name (a
     * feature with none is absent). One batched round trip, each feature's view bounded to its newest row.
     * @throws Error naming the feature whose read failed.
     */
    public async GetLatestPipelineValues(p: Omit<FeatureValueRecordRef, 'FeatureName'> & { FeatureNames: string[]; ExcludeProcessRunID?: string | null }): Promise<Map<string, TypedFeatureValue>> {
        const latest = new Map<string, TypedFeatureValue>();
        for (const [key, row] of await this.readLatestPipelineRows(p)) {
            latest.set(key, FeatureValueCacheService.TypedValueOf(row));
        }
        return latest;
    }

    /**
     * Upserts the record's Human Feature Value for a feature: one per record and feature (the key carries no pin), so a
     * later observation updates the row in place. With no Record Process the row is keyed by, and carries, the scoring
     * binding it overrides.
     * @throws FeatureValueKeyError when the scope is malformed; FeatureValueSaveError when the row cannot be saved.
     */
    public async RecordHumanValue(p: RecordHumanValueParams): Promise<void> {
        await this.RecordFeatureValues({
            recordProcessID: p.RecordProcessID, mlModelScoringBindingID: p.MLModelScoringBindingID || null, entityID: p.EntityID, recordID: p.RecordID,
            outputs: [{ featureName: p.FeatureName, value: p.Value }], processRunID: p.ProcessRunID || null,
            promptVersionHash: null, pipelineVersion: null, aiModelID: null, parametersHash: null, inputHash: null, source: 'Human',
            contextUser: p.ContextUser, provider: p.Provider,
        });
    }

    /**
     * Deletes the record's Champion Human Feature Values of a feature (sequentially, in the caller's transaction) in its
     * scope — the Record Process, or the binding when there is none; returns how many.
     * @throws FeatureValueKeyError when the scope is malformed; Error when a row cannot be read or deleted.
     */
    public async RetireHumanValue(p: FeatureValueRecordRef): Promise<number> {
        const res = await RunView.FromMetadataProvider(p.Provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter(p)} AND Source = 'Human' AND Role = 'Champion'`,
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

    /** The SQL filter selecting one record's Feature Values of one feature in one scope (pipeline, or binding). */
    protected static RecordFeatureFilter(p: FeatureValueRecordRef): string {
        return `${FeatureValueCacheService.RecordScopeFilter(p.RecordProcessID, p.MLModelScoringBindingID)} AND EntityID = '${EscapeSQLString(p.EntityID)}'`
            + ` AND RecordID = '${EscapeSQLString(p.RecordID)}' AND FeatureName = '${EscapeSQLString(p.FeatureName)}'`;
    }

    /**
     * The SQL filter fragment selecting a scope's Feature Values: `RecordProcessID = '<id>'`, or — with no Record
     * Process — `RecordProcessID IS NULL AND MLModelScoringBindingID = '<id>'` (never `RecordProcessID = 'null'`).
     * @throws FeatureValueKeyError when neither or both of the two IDs is set.
     */
    protected static RecordScopeFilter(recordProcessID: string | null, bindingID: string | null | undefined): string {
        if (recordProcessID !== null) {
            if (bindingID) {
                throw new FeatureValueKeyError('MLModelScoringBindingID', 'a scoring binding ID is set only on a row with no Record Process');
            }
            return `RecordProcessID = '${EscapeSQLString(recordProcessID)}'`;
        }
        if (!bindingID) {
            throw new FeatureValueKeyError('MLModelScoringBindingID', 'a row with no Record Process must name the scoring binding it belongs to');
        }
        return `RecordProcessID IS NULL AND MLModelScoringBindingID = '${EscapeSQLString(NormalizeUUID(bindingID))}'`;
    }

    /**
     * Refuses a keyed write (`RecordFeatureValues`) whose scope the store cannot hold: a Model row (those are written by
     * {@link RecordModelValues}), a Pipeline row with no Record Process, or a scope {@link RecordScopeFilter} refuses.
     * @throws FeatureValueKeyError naming the offending field.
     */
    protected static AssertKeyedWriteScope(params: RecordFeatureValuesParams): void {
        if (params.source === 'Model') {
            throw new FeatureValueKeyError('Source', "Model rows are written by RecordModelValues, keyed by binding, record, as-of instant and role");
        }
        if (params.recordProcessID === null && params.source !== 'Human') {
            throw new FeatureValueKeyError('RecordProcessID', `a ${params.source} row must carry its Record Process`);
        }
        FeatureValueCacheService.RecordScopeFilter(params.recordProcessID, params.mlModelScoringBindingID);
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

    /**
     * A value in the typed column its JavaScript type maps to. A string answer to a numeric/money, boolean or date
     * constraint is coerced into that constraint's column when it parses; otherwise it is stored as typed.
     */
    public static ToTypedValue(val: FeatureValueOutputItem['value'], constraintType?: ValueConstraint['Type']): TypedFeatureValue {
        const coerced = FeatureValueCacheService.CoerceByConstraint(val, constraintType);
        if (coerced !== undefined) {
            return coerced;
        }
        return {
            ValueText: typeof val === 'string' ? val : null,
            ValueNumeric: typeof val === 'number' ? val : null,
            ValueBoolean: typeof val === 'boolean' ? val : null,
            ValueDate: val instanceof Date ? val : null,
            ValueJSON: val !== null && typeof val === 'object' && !(val instanceof Date) ? JSON.stringify(val) : null,
        };
    }

    /** A plain decimal number: no hex, Infinity or NaN. */
    private static readonly plainNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    /** A string that starts as an ISO calendar date. */
    private static readonly isoDatePrefix = /^\d{4}-\d{2}-\d{2}/;

    /** The typed value a string answer coerces to under its constraint type; undefined when no coercion applies. */
    protected static CoerceByConstraint(val: FeatureValueOutputItem['value'], constraintType?: ValueConstraint['Type']): TypedFeatureValue | undefined {
        if (typeof val !== 'string' || !constraintType) {
            return undefined;
        }
        const text = val.trim();
        const empty: TypedFeatureValue = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
        if ((constraintType === 'numeric' || constraintType === 'money') && FeatureValueCacheService.plainNumber.test(text)) {
            const n = Number(text);
            // a decimal that overflows (e.g. '1e400') parses to Infinity, which no numeric column holds: it stays text
            if (Number.isFinite(n)) {
                return { ...empty, ValueNumeric: n };
            }
            return undefined;
        }
        if (constraintType === 'boolean' && /^(true|false)$/i.test(text)) {
            return { ...empty, ValueBoolean: text.toLowerCase() === 'true' };
        }
        if (constraintType === 'date' && FeatureValueCacheService.isoDatePrefix.test(text) && !Number.isNaN(Date.parse(text))) {
            return { ...empty, ValueDate: new Date(text) };
        }
        return undefined;
    }

    /**
     * The typed value columns an output is stored with: its typed value, with an explicit `valueText` (an ML label
     * stored beside its score) in `ValueText`. Unchanged and concurrent-insert checks compare against this, so an
     * unchanged labelled score is Unchanged rather than rewritten.
     */
    protected static StoredValueOf(out: FeatureValueOutputItem): TypedFeatureValue {
        const typed = FeatureValueCacheService.ToTypedValue(out.value, out.constraintType);
        return out.valueText !== undefined ? { ...typed, ValueText: out.valueText } : typed;
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
