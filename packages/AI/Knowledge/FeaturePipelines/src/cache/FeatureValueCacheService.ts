/**
 * @fileoverview FeatureValueCacheService — manages the dedup cache (MJ: Feature Value Caches) and the effective-dated
 * Feature Values (MJ: Feature Values) of Feature Pipelines (P1-7c; PR 5 §5.2.1): a changed value closes the open row of
 * its identity and opens a new one, in one transaction under the open-row locks, instead of updating in place.
 * @module @memberjunction/feature-pipelines
 */

import { BaseSingleton, Canonicalize, ComputeContentHashAsync, EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, LogError, Metadata, RunInEntityTransaction, RunView, type RunViewParams, UserInfo } from '@memberjunction/core';
import { MetadataProviderCapabilities } from '@memberjunction/record-set-processor-base';
import type { ValueConstraint } from '../spec/value-constraint.js';
import { FeatureValueKey, type FeatureValueSource } from '../spec/feature-value-key.js';
import type { MJFeatureValueCacheEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';
import { FeatureValueEffectiveDating } from './effective-dating.js';
import { FEATURE_VALUE_LOCK_QUERIES, FeatureValueLocks, type FeatureValueLockRow } from './feature-value-locks.js';
import { FeatureValueWriteAuthorisations } from './feature-value-write-authorisations.js';

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
    /** The pin's parameters hash; null for a human value. */
    parametersHash: string | null;
    /** SHA-256 of the record's normalised inputs (the cache key hash); null when there is none. */
    inputHash: string | null;
    source: FeatureValueSource;
    /** The rows are history (a decision an escalation superseded), never made the feature's latest value again. */
    historyOnly?: boolean;
    /**
     * The instant the record's input took its current value (its `__mj_UpdatedAt` as the run loop read it): the
     * values' `EffectiveAsOf` and `InputAsOf`. Absent or null: they are effective from the computation time.
     */
    inputAsOf?: Date | null;
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
    /** Outputs written as a new open row. */
    Upserted: number;
    /** Outputs whose open row already held the value for the same input: nothing was written. */
    Unchanged: number;
    /** Open rows closed (their `EffectiveTo` set) because a new row of their identity was opened. */
    Closed: number;
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
export type FeatureValueWriteResult = keyof Pick<RecordFeatureValuesOutcome, 'Upserted' | 'Unchanged'>;

/** One output's write: what it did, and whether it closed the identity's open row. */
export interface FeatureValueWriteOne {
    Result: FeatureValueWriteResult;
    Closed: boolean;
}

/** The instants and the person a write stamps on the rows it opens. */
export interface FeatureValueWriteStamp {
    /** When the values were computed (`ComputedAt`). */
    ComputedAt: Date;
    /** When the new values take effect: the input instant, else the computation time. */
    EffectiveAsOf: Date;
    /** The person who entered a Human value; null on a Pipeline value or when unknown. */
    SourceUserID: string | null;
}

/** A record's last edit as the write path reads it: when, and by whom (its newest Record Change). */
export interface FeatureValueRecordStamp {
    UpdatedAt: Date | null;
    UserID: string | null;
}

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
    /** The holding row. */
    ID: MJFeatureValueEntity['ID'];
    Value: TypedFeatureValue;
    /** The holding row's Feature Value key; null on a row written before keys existed. */
    ValueKeyHash: MJFeatureValueEntity['ValueKeyHash'];
}

/**
 * Service managing the dedup cache (MJ: Feature Value Caches) and the effective-dated Feature Values (MJ: Feature
 * Values): one open row per identity, closed history behind it (PR 5 §5.2.1).
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
     * Records one effective-dated Feature Value per output (PR 5 §5.2.1). Inside one entity transaction (the caller's,
     * else its own on an isolated provider instance) it locks the record's open rows — the Pipeline lock, then for a
     * Human write the Human lock — then decides each output against the open row of its identity
     * ({@link FeatureValueEffectiveDating.Decide}): the same input hash and typed value writes nothing (Unchanged; when
     * another row holds the feature's latest Pipeline value, a re-activated version, the open row's `ComputedAt` and run
     * links are refreshed so it is the latest again); a changed one closes the open row (`EffectiveTo` = the new
     * `EffectiveAsOf`) and inserts the new row; no open row inserts one. Rows of other identities — another pipeline
     * version, a Human value under a pipeline write — are never touched. A `historyOnly` row is written already closed.
     * `EffectiveAsOf` is the caller's `inputAsOf`, else the computation time. A thrown error rolls the whole call back.
     * @returns How many outputs were upserted, unchanged or closed, and each feature's latest pipeline value before the call.
     * @throws FeatureValueKeyError when the scope is malformed (see {@link AssertKeyedWriteScope}); FeatureValueSaveError
     * when a row cannot be saved; FeatureValueLockTimeoutError when the open rows stay locked past the deadline; Error
     * when the rows cannot be read.
     */
    public async RecordFeatureValues(params: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> {
        return this.WriteValues(params, null);
    }

    /**
     * {@link RecordFeatureValues} with the person a Human value is recorded for ({@link RecordHumanValue}).
     * @param sourceUserID - the user who entered a Human value; null on a Pipeline write or when unknown
     */
    protected async WriteValues(params: RecordFeatureValuesParams, sourceUserID: string | null): Promise<RecordFeatureValuesOutcome> {
        FeatureValueCacheService.AssertKeyedWriteScope(params);
        const keyed = await this.KeyOutputs(params);
        const computedAt = new Date();
        const stamp: FeatureValueWriteStamp = {
            ComputedAt: computedAt, EffectiveAsOf: FeatureValueEffectiveDating.EffectiveAsOf(params.inputAsOf || null, computedAt), SourceUserID: sourceUserID,
        };
        return this.InWriteUnit(params.provider, (unit) => this.WriteLocked({ ...params, provider: unit }, keyed, stamp));
    }

    /**
     * Runs `work` in one entity transaction on its own provider instance (or, when the caller is already in a
     * transaction on `provider`, as a savepoint of it), so the locks, the close and the insert commit or roll back together.
     */
    protected async InWriteUnit<T>(provider: IMetadataProvider, work: (unit: IMetadataProvider) => Promise<T>): Promise<T> {
        return MetadataProviderCapabilities.RunIsolated(provider, (unit) =>
            RunInEntityTransaction(MetadataProviderCapabilities.IsTransactionalProvider(unit) ? unit : null, () => work(unit)));
    }

    /** Each output with its Feature Value key hash. */
    protected async KeyOutputs(params: RecordFeatureValuesParams): Promise<Array<{ out: FeatureValueOutputItem; keyHash: string }>> {
        return Promise.all(params.outputs.map(async (out) => ({
            out,
            keyHash: await FeatureValueKey.ComputeHash({
                EntityID: params.entityID, RecordID: params.recordID, FeatureName: out.featureName,
                PipelineVersion: params.pipelineVersion, PromptVersionHash: params.promptVersionHash,
                AIModelID: params.aiModelID, ParametersHash: params.parametersHash,
                InputHash: params.inputHash, Source: params.source,
                MLModelScoringBindingID: params.recordProcessID === null ? params.mlModelScoringBindingID || null : null,
            }),
        })));
    }

    /**
     * The write under the open-row locks, on the unit's provider: lock, read the open rows and the latest Pipeline
     * values, then write each output in turn (sequentially: the unit's transaction belongs to one async scope).
     */
    protected async WriteLocked(params: RecordFeatureValuesParams, keyed: Array<{ out: FeatureValueOutputItem; keyHash: string }>, stamp: FeatureValueWriteStamp): Promise<RecordFeatureValuesOutcome> {
        const provider = params.provider;
        const names = keyed.map((k) => k.out.featureName);
        const open = await this.LockOpenRows(this.RecordRefOf(params), params.source, names);
        const previous = await this.LoadLatestPipelineValues(params, provider);
        const outcome: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Closed: 0, Previous: {} };
        for (const { out, keyHash } of keyed) {
            const identity = FeatureValueEffectiveDating.OpenIdentity(this.IdentityColumnsOf(params, out.featureName));
            const latest = previous.get(out.featureName.toLowerCase());
            const written = await this.WriteOne(params, provider, out, keyHash, open.get(identity), latest?.ID || null, stamp);
            outcome[written.Result]++;
            outcome.Closed += written.Closed ? 1 : 0;
            outcome.Previous[out.featureName] = latest?.Value || null;
        }
        return outcome;
    }

    /** The record a write's rows belong to, as a lock or a read names it. */
    protected RecordRefOf(params: RecordFeatureValuesParams): Omit<FeatureValueRecordRef, 'FeatureName'> {
        return {
            RecordProcessID: params.recordProcessID, MLModelScoringBindingID: params.recordProcessID === null ? params.mlModelScoringBindingID || undefined : undefined,
            EntityID: params.entityID, RecordID: params.recordID, ContextUser: params.contextUser, Provider: params.provider,
        };
    }

    /** The identity columns of an output's row in this write. */
    protected IdentityColumnsOf(params: RecordFeatureValuesParams, featureName: string): Pick<MJFeatureValueEntity,
        'RecordProcessID' | 'MLModelScoringBindingID' | 'EntityID' | 'RecordID' | 'FeatureName' | 'PipelineVersion' | 'Source'> {
        return {
            RecordProcessID: params.recordProcessID, MLModelScoringBindingID: params.recordProcessID === null ? params.mlModelScoringBindingID || null : null,
            EntityID: params.entityID, RecordID: params.recordID, FeatureName: featureName, PipelineVersion: params.source === 'Human' ? null : params.pipelineVersion,
            Source: params.source,
        };
    }

    /**
     * Takes the open-row locks of a record's features — the Pipeline lock whenever the record has a Record Process, then
     * for a Human write the Human lock (D5-40: never the Human lock first) — and returns the locked open rows of
     * `source`, by identity, as entity objects read on the same provider.
     * @throws FeatureValueLockTimeoutError when a lock is not acquired before the deadline; Error when the rows cannot be read
     */
    protected async LockOpenRows(ref: Omit<FeatureValueRecordRef, 'FeatureName'>, source: FeatureValueSource, featureNames: string[]): Promise<Map<string, MJFeatureValueEntity>> {
        const base = { EntityID: ref.EntityID, RecordID: ref.RecordID, FeatureNames: [...new Set(featureNames)] };
        let locked: readonly FeatureValueLockRow[] = [];
        if (ref.RecordProcessID !== null) {
            locked = await FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, { ...base, RecordProcessID: ref.RecordProcessID }, ref.Provider, ref.ContextUser);
        }
        if (source === 'Human') {
            locked = await FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman,
                { ...base, RecordProcessID: ref.RecordProcessID || '', MLModelScoringBindingID: ref.MLModelScoringBindingID || '' }, ref.Provider, ref.ContextUser);
        }
        return this.LoadOpenRowsByID(ref, locked.map((r) => String(r.ID)));
    }

    /**
     * The open rows with these IDs (the ones a lock Query returned), as entity objects by identity; read fresh on the
     * caller's provider, inside its transaction.
     * @throws Error when the read fails
     */
    protected async LoadOpenRowsByID(ref: Omit<FeatureValueRecordRef, 'FeatureName'>, ids: string[]): Promise<Map<string, MJFeatureValueEntity>> {
        const byIdentity = new Map<string, MJFeatureValueEntity>();
        if (ids.length === 0) {
            return byIdentity;
        }
        const res = await RunView.FromMetadataProvider(ref.Provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `ID IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ')}) AND EffectiveTo IS NULL`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, ref.ContextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading the open Feature Values of record '${ref.RecordID}' failed: ${res.ErrorMessage}`);
        }
        for (const row of res.Results || []) {
            byIdentity.set(FeatureValueEffectiveDating.OpenIdentity(row), row);
        }
        return byIdentity;
    }

    /**
     * Writes a batch of one binding's predictions as `Source = 'Model'` Feature Values, one row per record on the key
     * `UQ_FeatureValue_ModelRow` (binding, entity, record, as-of instant, role): a row already on its key (a same as-of
     * date re-run) is replaced in place, value and lineage; any other is inserted. The batch's existing rows are read in
     * one query; the rows are saved one at a time in the caller's transaction. `ValueKeyHash` stays null, `ComputedAt` is
     * the write time. An insert that fails on `UQ_FeatureValue_ModelRow` because another run of the binding inserted the
     * key after this batch's read (two same-day runs) replaces that row, as the later re-run it is, and counts Replaced.
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
            outcome[await this.WriteModelRow(params, row, stored)]++;
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
     * Saves one prediction: replaces `stored` in place, or inserts a new row on its key. An insert that fails on
     * `UQ_FeatureValue_ModelRow` reads the key again (fresh): a row another run inserted there since this batch's read is
     * replaced in place, as {@link WriteOne} settles the same race on its key.
     * @returns 'Replaced' when a row on the key was replaced, 'Inserted' when a new row was saved.
     * @throws FeatureValueSaveError when the save fails (an insert's, when no row holds the key on the second read).
     */
    protected async WriteModelRow(params: RecordModelValuesParams, row: ModelValueRow, stored: MJFeatureValueEntity | undefined): Promise<keyof RecordModelValuesOutcome> {
        if (stored) {
            await this.SaveModelRow(params, row, stored);
            return 'Replaced';
        }
        const fv = await params.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.ContextUser);
        fv.NewRecord();
        this.AssignModelKeyColumns(fv, params, row);
        this.AssignModelValueColumns(fv, params, row);
        const failure = await this.SaveFailure(fv);
        if (failure === null) {
            return 'Inserted';
        }
        const concurrent = failure.includes(FeatureValueCacheService.ModelRowIndexName)
            ? (await this.LoadModelRows({ ...params, Rows: [row] })).get(FeatureValueCacheService.recordKey(row.RecordID))
            : undefined;
        if (!concurrent) {
            throw new FeatureValueSaveError(params.FeatureName, row.RecordID, failure);
        }
        await this.SaveModelRow(params, row, concurrent);
        return 'Replaced';
    }

    /** The unique index on a Model row's key (binding, entity, record, as-of instant, role): a second insert fails on it. */
    protected static readonly ModelRowIndexName = 'UQ_FeatureValue_ModelRow';

    /**
     * Replaces a stored Model row's value and lineage in place.
     * @throws FeatureValueSaveError when the save fails.
     */
    protected async SaveModelRow(params: RecordModelValuesParams, row: ModelValueRow, stored: MJFeatureValueEntity): Promise<void> {
        this.AssignModelValueColumns(stored, params, row);
        const failure = await this.SaveFailure(stored);
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
     * Writes one output against its identity's locked open row (`open`): unchanged (refreshing the row's `ComputedAt`
     * and run links when `latestID`, the feature's latest Pipeline row, is another row), close-and-open, or open. A
     * `historyOnly` output is written already closed ({@link WriteHistoryOnly}).
     * @throws FeatureValueSaveError when a row cannot be saved (the caller's transaction then rolls the close back)
     */
    protected async WriteOne(
        params: RecordFeatureValuesParams,
        provider: IMetadataProvider,
        out: FeatureValueOutputItem,
        keyHash: string,
        open: MJFeatureValueEntity | undefined,
        latestID: string | null,
        stamp: FeatureValueWriteStamp
    ): Promise<FeatureValueWriteOne> {
        const typed = FeatureValueCacheService.StoredValueOf(out);
        if (params.historyOnly === true) {
            return { Result: await this.WriteHistoryOnly(params, provider, out, keyHash, typed, stamp), Closed: false };
        }
        const decision = FeatureValueEffectiveDating.Decide(open, typed, params.inputHash);
        if (decision === 'unchanged' && open) {
            await this.RefreshIfSuperseded(params, out, typed, open, latestID, stamp);
            return { Result: 'Unchanged', Closed: false };
        }
        const effectiveAsOf = FeatureValueCacheService.StartAfter(open, stamp.EffectiveAsOf);
        if (open) {
            await this.CloseRow(open, effectiveAsOf, out.featureName, params.recordID);
        }
        const result = await this.InsertOpen(params, provider, out, keyHash, typed, { ...stamp, EffectiveAsOf: effectiveAsOf });
        return { Result: result, Closed: !!open };
    }

    /**
     * The start of a new value: `wanted`, or the open row's own start when that is later (a value is never dated before
     * the row it replaces, so a closed range never ends before it begins).
     */
    protected static StartAfter(open: MJFeatureValueEntity | undefined, wanted: Date): Date {
        const openStart = open?.EffectiveAsOf ? new Date(open.EffectiveAsOf) : null;
        return openStart && openStart.getTime() > wanted.getTime() ? openStart : wanted;
    }

    /**
     * An unchanged open row that is not the feature's latest Pipeline value (another version wrote since, and this
     * version is Active again) gets this run's `ComputedAt` and run links, so it is the latest again. It touches no range column.
     */
    protected async RefreshIfSuperseded(params: RecordFeatureValuesParams, out: FeatureValueOutputItem, typed: TypedFeatureValue,
        open: MJFeatureValueEntity, latestID: string | null, stamp: FeatureValueWriteStamp): Promise<void> {
        if (params.source !== 'Pipeline' || !latestID || UUIDsEqual(latestID, open.ID)) {
            return;
        }
        this.AssignValueColumns(open, params, out, typed, stamp);
        await this.SaveOrThrow(open, out.featureName, params.recordID);
    }

    /** Closes an open row at `end`. @throws FeatureValueSaveError when the save fails */
    protected async CloseRow(row: MJFeatureValueEntity, end: Date, featureName: string, recordID: string): Promise<void> {
        row.EffectiveTo = end;
        await this.SaveOrThrow(row, featureName, recordID);
    }

    /**
     * Inserts the output as the identity's new open row. An insert that still fails on an open-row index (a writer the
     * lock did not serialise) reads the identity's open row again: the same typed value is Unchanged.
     * @throws FeatureValueSaveError when the insert fails otherwise
     */
    protected async InsertOpen(params: RecordFeatureValuesParams, provider: IMetadataProvider, out: FeatureValueOutputItem, keyHash: string,
        typed: TypedFeatureValue, stamp: FeatureValueWriteStamp): Promise<FeatureValueWriteResult> {
        const fv = await this.NewRow(params, provider, out, keyHash, typed, stamp);
        const failure = await this.SaveFailure(fv);
        if (failure === null) {
            return 'Upserted';
        }
        const onOpenIndex = FeatureValueCacheService.OpenRowIndexNames.some((name) => failure.includes(name));
        if (onOpenIndex && (await this.ConcurrentInsertHolds(params, provider, out.featureName, typed))) {
            return 'Unchanged';
        }
        throw new FeatureValueSaveError(out.featureName, params.recordID, failure);
    }

    /**
     * A `historyOnly` output (a decision an escalation superseded) is written already closed (`EffectiveTo` =
     * `EffectiveAsOf`): it never holds the open slot and is never read. A history row already on its key with the same
     * typed value is Unchanged.
     * @throws FeatureValueSaveError when the insert fails
     */
    protected async WriteHistoryOnly(params: RecordFeatureValuesParams, provider: IMetadataProvider, out: FeatureValueOutputItem, keyHash: string,
        typed: TypedFeatureValue, stamp: FeatureValueWriteStamp): Promise<FeatureValueWriteResult> {
        const history = await this.LoadHistoryOnKey(params, provider, keyHash);
        if (history.some((row) => FeatureValueCacheService.SameTypedValue(row, typed))) {
            return 'Unchanged';
        }
        const fv = await this.NewRow(params, provider, out, keyHash, typed, stamp);
        fv.EffectiveTo = stamp.EffectiveAsOf;
        const failure = await this.SaveFailure(fv);
        if (failure !== null) {
            throw new FeatureValueSaveError(out.featureName, params.recordID, failure);
        }
        return 'Upserted';
    }

    /** A new, unsaved row of the output with its key, value and range columns. */
    protected async NewRow(params: RecordFeatureValuesParams, provider: IMetadataProvider, out: FeatureValueOutputItem, keyHash: string,
        typed: TypedFeatureValue, stamp: FeatureValueWriteStamp): Promise<MJFeatureValueEntity> {
        const fv = await provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', params.contextUser);
        fv.NewRecord();
        this.AssignKeyColumns(fv, params, out, keyHash);
        this.AssignValueColumns(fv, params, out, typed, stamp);
        fv.EffectiveAsOf = stamp.EffectiveAsOf;
        fv.EffectiveTo = null;
        fv.InputAsOf = params.inputAsOf || null;
        fv.SourceUserID = params.source === 'Human' ? stamp.SourceUserID : null;
        return fv;
    }

    /** The unique indexes on an open row (its identity, its key): a second open row of either fails on them. */
    protected static readonly OpenRowIndexNames: readonly string[] = ['UQ_FeatureValue_OpenPipeline', 'UQ_FeatureValue_OpenHuman', 'UQ_FeatureValue_ValueKey'];

    /** Saves a row through the write path's authorisation; null when it saved, else the provider's message (a rejected save included). */
    protected async SaveFailure(fv: MJFeatureValueEntity): Promise<string | null> {
        try {
            return (await FeatureValueWriteAuthorisations.Save(fv)) ? null : fv.LatestResult?.CompleteMessage || 'unknown error';
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /** Saves a row through the write path's authorisation. @throws FeatureValueSaveError when the save fails */
    protected async SaveOrThrow(fv: MJFeatureValueEntity, featureName: string, recordID: string): Promise<void> {
        const failure = await this.SaveFailure(fv);
        if (failure !== null) {
            throw new FeatureValueSaveError(featureName, recordID, failure);
        }
    }

    /**
     * Whether the identity's open row, read again (fresh, in the caller's transaction), already holds this typed value:
     * a writer the lock did not serialise stored it first, so the write is satisfied.
     */
    protected async ConcurrentInsertHolds(params: RecordFeatureValuesParams, provider: IMetadataProvider, featureName: string, typed: TypedFeatureValue): Promise<boolean> {
        const version = params.source === 'Human' ? '' : params.pipelineVersion === null ? ' AND PipelineVersion IS NULL' : ` AND PipelineVersion = ${params.pipelineVersion}`;
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter({ ...this.RecordRefOf(params), FeatureName: featureName })}${FeatureValueCacheService.SourceFilter(params.source)}`
                + ` AND Role = 'Champion' AND EffectiveTo IS NULL${version}`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, params.contextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: re-reading the open '${featureName}' value of record '${params.recordID}' failed: ${res.ErrorMessage}`);
        }
        const stored = res.Results?.[0];
        return !!stored && FeatureValueCacheService.SameTypedValue(stored, typed);
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
        fv.ParametersHash = params.parametersHash;
        fv.InputHash = params.inputHash;
        fv.ValueKeyHash = keyHash;
        fv.Source = params.source;
        fv.Role = 'Champion';
    }

    /** Sets a row's value, reasoning, confidence, run links and ComputedAt. */
    protected AssignValueColumns(fv: MJFeatureValueEntity, params: RecordFeatureValuesParams, out: FeatureValueOutputItem, typed: TypedFeatureValue, stamp: FeatureValueWriteStamp): void {
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
        fv.ComputedAt = stamp.ComputedAt;
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
            latest.set(key, { ID: row.ID, Value: FeatureValueCacheService.TypedValueOf(row), ValueKeyHash: row.ValueKeyHash || null });
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
        Promise<Map<string, LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ID' | 'ValueKeyHash'>>> {
        const rows = new Map<string, LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ID' | 'ValueKeyHash'>>();
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
        const results = await RunView.FromMetadataProvider(p.Provider).RunViews<LatestFeatureValueRow & Pick<MJFeatureValueEntity, 'ID' | 'ValueKeyHash'>>(names.map((name) => ({
            ...shape,
            Fields: [...(shape.Fields || []), 'ID', 'ValueKeyHash'],
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
     * The closed (history) Champion rows of a write's scope on one Feature Value key; read fresh. A `historyOnly` write
     * reads them to leave an identical history row alone.
     * @throws Error when the read fails.
     */
    protected async LoadHistoryOnKey(params: RecordFeatureValuesParams, provider: IMetadataProvider, keyHash: string): Promise<MJFeatureValueEntity[]> {
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeatureValueEntity>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `${FeatureValueCacheService.RecordScopeFilter(params.recordProcessID, params.mlModelScoringBindingID)} AND ValueKeyHash = '${EscapeSQLString(keyHash)}'`
                + ` AND Role = 'Champion' AND EffectiveTo IS NOT NULL`,
            ResultType: 'entity_object',
            BypassCache: true,
        }, params.contextUser);
        if (!res.Success) {
            throw new Error(`FeatureValueCacheService: reading Feature Value history failed: ${res.ErrorMessage}`);
        }
        return res.Results || [];
    }

    /**
     * The most recent Champion Feature Value of a record and feature from one source, as its typed columns; null when
     * there is none. A Human value is read from the open row only (a retired or replaced one is closed history). Read
     * fresh: the human-value guard decides from it whether a field may be overwritten.
     * @throws FeatureValueKeyError when the scope is malformed (see {@link RecordScopeFilter}); Error when the read fails
     * (a guard that cannot read must not guess "pipeline-owned").
     */
    public async GetLatestValue(p: LatestFeatureValueParams): Promise<TypedFeatureValue | null> {
        const exclude = p.ExcludeProcessRunID
            ? ` AND (ProcessRunID IS NULL OR ProcessRunID <> '${EscapeSQLString(p.ExcludeProcessRunID)}')`
            : '';
        const res = await RunView.FromMetadataProvider(p.Provider).RunView<LatestFeatureValueRow>({
            ...FeatureValueCacheService.LatestValueViewShape(),
            ExtraFilter: `${FeatureValueCacheService.RecordFeatureFilter(p)}${FeatureValueCacheService.SourceFilter(p.Source)} AND Role = 'Champion'${exclude}`
                + (p.Source === 'Human' ? ' AND EffectiveTo IS NULL' : ''),
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
     * Records the value a person entered on a pipeline target as a dated Human Feature Value (D5-29): the same value as
     * the open Human row writes nothing; a different one closes it and opens a new row. The new row is effective from
     * the record's `__mj_UpdatedAt` as read here (in the caller's write-back unit, so never before the edit) and carries
     * the user of the record's newest Record Change when the entity tracks record changes. With no Record Process the
     * row is keyed by, and carries, the scoring binding it overrides.
     * @throws FeatureValueKeyError when the scope is malformed; FeatureValueSaveError when the row cannot be saved;
     * Error when the record's stamp cannot be read.
     */
    public async RecordHumanValue(p: RecordHumanValueParams): Promise<void> {
        const stamp = await this.ReadRecordStamp(p);
        await this.WriteValues({
            recordProcessID: p.RecordProcessID, mlModelScoringBindingID: p.MLModelScoringBindingID || null, entityID: p.EntityID, recordID: p.RecordID,
            outputs: [{ featureName: p.FeatureName, value: p.Value }], processRunID: p.ProcessRunID || null,
            promptVersionHash: null, pipelineVersion: null, aiModelID: null, parametersHash: null, inputHash: null, source: 'Human',
            inputAsOf: stamp.UpdatedAt, contextUser: p.ContextUser, provider: p.Provider,
        }, stamp.UserID);
    }

    /**
     * The record's last edit as the caller's provider holds it: its `__mj_UpdatedAt`, and the user of its newest Record
     * Change when the entity tracks record changes (unknown — null — when that read is not allowed or fails). Both null
     * when the entity is not in metadata or has no `__mj_UpdatedAt`.
     * @throws Error when the record itself cannot be read
     */
    protected async ReadRecordStamp(ref: FeatureValueRecordRef): Promise<FeatureValueRecordStamp> {
        const entity = ref.Provider.EntityByID(ref.EntityID);
        if (!entity || !entity.Fields.some((f) => f.Name === '__mj_UpdatedAt')) {
            return { UpdatedAt: null, UserID: null };
        }
        const key = CompositeKey.FromURLSegment(entity, ref.RecordID);
        const reads: RunViewParams[] = [{ EntityName: entity.Name, ExtraFilter: key.ToWhereClause(), Fields: ['__mj_UpdatedAt'], ResultType: 'simple', MaxRows: 1, BypassCache: true }];
        if (entity.TrackRecordChanges) {
            reads.push({
                EntityName: 'MJ: Record Changes', ExtraFilter: `EntityID = '${EscapeSQLString(entity.ID)}' AND RecordID = '${EscapeSQLString(key.ToURLSegment())}'`,
                Fields: ['UserID'], OrderBy: 'ChangedAt DESC', ResultType: 'simple', MaxRows: 1, BypassCache: true,
            });
        }
        const [record, change] = await RunView.FromMetadataProvider(ref.Provider).RunViews<{ __mj_UpdatedAt?: Date | string; UserID?: string }>(reads, ref.ContextUser);
        if (!record.Success) {
            throw new Error(`FeatureValueCacheService: reading record '${ref.RecordID}' of '${entity.Name}' failed: ${record.ErrorMessage}`);
        }
        if (change && !change.Success) {
            LogError(`FeatureValueCacheService: reading the Record Changes of '${ref.RecordID}' failed; the Human value carries no user: ${change.ErrorMessage}`);
        }
        const updated = record.Results?.[0]?.__mj_UpdatedAt;
        return { UpdatedAt: updated ? new Date(updated) : null, UserID: change?.Success ? change.Results?.[0]?.UserID || null : null };
    }

    /**
     * Retires the record's open Human Feature Value of a feature in its scope — the Record Process, or the binding when
     * there is none — by closing it (`EffectiveTo` = now), under the open-row locks, in one transaction (the caller's
     * when it has one): the history keeps it. Returns how many were closed.
     * @throws FeatureValueKeyError when the scope is malformed; FeatureValueSaveError when a row cannot be closed; Error
     * when the rows cannot be read.
     */
    public async RetireHumanValue(p: FeatureValueRecordRef): Promise<number> {
        FeatureValueCacheService.RecordScopeFilter(p.RecordProcessID, p.MLModelScoringBindingID);
        return this.InWriteUnit(p.Provider, async (unit) => {
            const ref = { ...p, Provider: unit };
            const open = [...(await this.LockOpenRows(ref, 'Human', [p.FeatureName])).values()];
            const now = new Date();
            for (const row of open) {
                await this.CloseRow(row, FeatureValueCacheService.StartAfter(row, now), p.FeatureName, p.RecordID);
            }
            return open.length;
        });
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

    /** The typed value columns an output is stored with. Unchanged and concurrent-insert checks compare against this. */
    protected static StoredValueOf(out: FeatureValueOutputItem): TypedFeatureValue {
        return FeatureValueCacheService.ToTypedValue(out.value, out.constraintType);
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

    /** Whether a row holds exactly this typed value ({@link FeatureValueEffectiveDating.SameTypedValue}). */
    protected static SameTypedValue(row: TypedFeatureValue, v: TypedFeatureValue): boolean {
        return FeatureValueEffectiveDating.SameTypedValue(row, v);
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
