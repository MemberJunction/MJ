/**
 * @fileoverview Infer processor — for each record, runs an AI Prompt over the record's data and
 * returns the structured result as the record's `ResultPayload`. Write-back is NOT done here: the
 * `WriteBackProcessor` wrapper (added by `RecordProcessExecutor` when an OutputMapping is set)
 * applies the Record Process's OutputMapping uniformly across Action / Agent / Infer work types.
 *
 * Supports DataFeatureSpec context (EntityDocumentID template rendering with __Parent context,
 * QueryID parameterized execution, Field projections), Layer-1 constraint injection, Layer-2
 * constraint validation with OnViolation policies, and lifecycle hooks. A Decision pipeline
 * whose spec sets `Escalation` re-runs its below-floor records through an LLM pipeline
 * (see `FeaturePipelineEscalation`).
 *
 * @module @memberjunction/record-set-processor
 */

import { createHash } from 'node:crypto';
import { type IMetadataProvider, LogError, LogStatus, Metadata, RunQuery, RunView } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual, Canonicalize, ComputeContentHashAsync, EscapeSQLString, ResolveMappingRef, SafeJSONParse, resolveMappingRef, resolveValueMapping } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity, type MJFeaturePipelineTypeEntity, type MJRecordProcessEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams, type AIPromptRunResult, type MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    FeaturePipelineRunPin,
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
    RecordIDs,
} from '@memberjunction/record-set-processor-base';
import {
    DataFeatureSpec,
    DataFeatureOutput,
    FeatureValueCacheService,
    type ResolvedConstraint,
    LookupConstraintValues,
    ModelAnswer,
    OutputConstraintResolver,
    OutputValidator,
    RenderConstraintBlock,
    BuildEntityFieldValueLookup,
    type CacheKeyResult,
    type FeatureValueOutputItem,
    ConstraintBlockMissingError,
    ConstraintPromptTemplate,
    IsDecisionPipelineType,
    IsLLMPipelineType,
    LLM_PIPELINE_TYPE,
    validateMaterializationTargets,
    validateSpec,
    type ViolationPolicy,
    type FeaturePipelineFieldValueLookup,
    FindOutputByName,
    FeaturePipelinePin,
    type FeaturePipelinePinData,
    FeaturePipelineVersionService,
    type RecordFeatureValuesOutcome,
    type TypedFeatureValue,
    ConfidenceFloor,
    type BelowConfidenceOutput,
} from '@memberjunction/feature-pipelines';
import { EntityDocumentCache, EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import type { HumanValueGuard, HumanValueGuardSource, OutputMappingConfig, WithheldTargetSource, WithheldWriteBackTargets } from '../writeBack';
import { FeaturePipelineHumanValueGuard } from './FeaturePipelineHumanValueGuard';
import { EscalationTargetUnresolvableError, FeaturePipelineUnresolvableError } from './FeaturePipelineErrors';
import type { DeferredFeatureValueSource } from './WriteBackProcessor';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeHooks,
    type FeaturePipelineComputeResult,
    type FeaturePipelineComputeSuccess,
} from '../feature-pipeline-drivers/BaseFeaturePipelineDriver';
import { LLMFeaturePipelineDriver } from '../feature-pipeline-drivers/LLMFeaturePipelineDriver';
import {
    DescribeEscalationFailure,
    FeaturePipelineEscalator,
    type BelowFloorOutput,
    type EscalatedAnswer,
    type EscalationOutcome,
    type FeatureValueKeyParts,
} from './FeaturePipelineEscalation';

/** What one processing pass has resolved: the pipeline's prompt and driver, and the hashes that version its answers. */
interface PipelineRunState {
    Prompt: MJAIPromptEntityExtended;
    Driver: BaseFeaturePipelineDriver;
    IsCacheable: boolean;
    PromptVersionHash: string;
    ConstraintHash: string;
    /** The pipeline's pin: prompt version, primary model, parameters and spec. */
    Pin: FeaturePipelinePinData;
    /** SHA-256 of {@link Pin}. */
    PinHash: string;
    /** Each output's resolved constraint, lookup rows included (see {@link InferProcessor.ResolveConstraints}). */
    ResolvedConstraints: Map<string, ResolvedConstraint | null>;
}

/** Records that share a Dedup Cache key, computed once through the first of them. */
interface CacheKeyGroup {
    keyInfo?: CacheKeyResult;
    records: RecordRef[];
}

/** A key group's first record, what the driver computed for it, and the outputs below the escalation floor. */
interface ComputedSample {
    Group: CacheKeyGroup;
    Sample: RecordRef;
    Computed: FeaturePipelineComputeResult;
    BelowFloor: BelowFloorOutput[];
}

/**
 * What {@link InferProcessor.UpsertFeatureValues} writes for one record. The Feature Value key's parts — the pin
 * (prompt version hash, primary model, parameters hash) and the input hash — are required, so a call site that drops
 * one fails to compile instead of writing a different key.
 */
export interface FeatureValueWriteParams {
    Record: RecordRef;
    Context: RecordProcessorContext;
    /** The pipeline's payload the outputs are read from (by each output's Ref); `unknown` at that boundary. */
    Payload: unknown;
    OmitValues?: boolean;
    Reasoning?: string | null;
    Confidence?: number | null;
    OutputConfidence?: Record<string, number>;
    PromptID?: string | null;
    ConstraintHash?: string | null;
    AIPromptRunID?: string | null;
    FeatureValueCacheID?: string | null;
    /** SHA-256 of the record's normalised inputs (its cache key hash), part of the Feature Value key. */
    InputHash: string | null;
    /** The pin that computed the values: its prompt version hash, primary model and parameters hash are part of the key. */
    Pin: FeaturePipelinePinData;
}

/** The Feature Value fields a key group's sample was written with, shared by the group's other records. */
type GroupFeatureValues = Omit<FeatureValueWriteParams, 'Record'>;

/** A sample's final result, and the Feature Values its group's other records get (absent when it failed). */
interface FinalizedSample {
    Result: RecordResult;
    FeatureValues?: GroupFeatureValues;
}

/** Whether a value is a plain JSON object (not null, not an array). */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs an AI Prompt per record and returns its structured output (write-back is the wrapper's job).
 * A pipeline whose spec sets `Escalation` computes a whole batch before recording any of it, so its batch
 * path does not call {@link ProcessRecord} once per record: an extension that overrides `ProcessRecord`
 * does not see those records.
 */
export class InferProcessor implements IRecordProcessor, HumanValueGuardSource, DeferredFeatureValueSource, WithheldTargetSource {
    /** The driver resolution, started on first use and shared by every record this processor runs. */
    private driverResolution?: Promise<BaseFeaturePipelineDriver>;

    /** The escalation of below-floor decisions, created on first use when the spec has `Escalation`. */
    private _escalator?: FeaturePipelineEscalator;

    /** How many records this processor has escalated. */
    private escalatedRecordCount = 0;

    /**
     * Whether this processor writes its records' `MJ: Feature Values` (keyed upserts, one row per Feature Value key).
     * On for every pipeline run. A Decision pipeline turns it off on its escalation target, because it writes the
     * final answers of the records it escalates itself. (The name predates keyed upserts; it is public API, so it is
     * kept.)
     */
    public WritesHistory = true;

    /**
     * The pipeline version (`MJ: Feature Pipeline Versions.Version`) this run computes under: part of the Feature Value
     * key and of each record's result. Assigned by the version registry when it resolves the run's version;
     * null until then, and for a processor run without one.
     */
    protected PipelineVersion: number | null = null;

    /** The pin hash the run resolved {@link PipelineVersion} for; a record computed under another pin is not written under it. */
    private versionPinHash: string | null = null;

    /** Dry runs only: why the real run would be refused by the version registry; each record's result warns of it. */
    private dryRunRefusal: string | null = null;

    /**
     * Each record's Feature Values as they were before this processor first wrote them in the current batch, by record
     * ID, then feature name. Cleared when the next batch starts ({@link ResetBatchState}): its consumers (write-back,
     * the escalating Decision pipeline) read it right after the batch that produced it, so it never grows past a batch.
     */
    private previousFeatureValues = new Map<string, Record<string, TypedFeatureValue | null>>();

    /** The pin and input hash each record of the current batch was written under, by record ID; same lifecycle. */
    private featureValueKeys = new Map<string, FeatureValueKeyParts>();

    /** The last pin resolved, and the inputs it was computed from (see {@link ResolvePin}). */
    private resolvedPin?: { Fingerprint: string; Pin: FeaturePipelinePinData };

    /** Resolved constraints per output name, with lookup rows loaded; started once (a processor serves one run). */
    private resolvedConstraints?: Promise<Map<string, ResolvedConstraint | null>>;

    /** The map {@link ResolveConstraints} last produced, for the synchronous {@link ConstraintHash} getter. */
    private lastResolvedConstraints?: Map<string, ResolvedConstraint | null>;

    /**
     * Whether this processor's Feature Value writes wait for the record's write-back ({@link DeferFeatureValuesToWriteBack}):
     * a pipeline with write-back saves them inside the write-back unit, so they commit or roll back with it.
     */
    private deferFeatureValues = false;

    /** Each record's Feature Value writes waiting for its write-back, in order, by record ID (deferred mode only). */
    private pendingFeatureValues = new Map<string, FeatureValueWriteParams[]>();

    /**
     * @param promptID - The `MJ: AI Prompts` ID to run for each record.
     * @param inputMapping - Mapping shaping the data passed to the prompt; undefined for the default (`{ record }`).
     * @param spec - The DataFeatureSpec defining outputs, constraints, and caching policy; undefined when there is none.
     * @param outputMappingText - The Record Process's OutputMapping text, part of the spec hash (null when it has
     *   none). A constructor argument, so every path that builds a processor — `new`, the ClassFactory, a subclass —
     *   hashes the same spec for the same pipeline.
     */
    constructor(
        protected readonly promptID: string,
        protected readonly inputMapping: Record<string, string> | undefined,
        protected readonly spec: DataFeatureSpec | undefined,
        protected readonly outputMappingText: string | null,
    ) {}

    /**
     * Builds the processor for an Infer Feature Pipeline from its `MJ: Record Processes` row: parses and
     * validates the DataFeatureSpec in `Configuration` (and its materialization targets), and creates the
     * spec's `ProcessorExtensionKey` subclass when it names one. `RecordProcessExecutor` builds every
     * Infer pipeline this way, and so does a Decision pipeline's escalation to an LLM pipeline.
     *
     * @param rp - The pipeline's row (WorkType `Infer`).
     * @param provider - The provider whose metadata the materialization targets are checked against (default: the global one).
     * @throws Error when the row has no PromptID, its Configuration is not valid JSON, its spec or
     * materialization targets are invalid, or its ProcessorExtensionKey is not registered.
     */
    public static FromRecordProcess(rp: MJRecordProcessEntity, provider?: IMetadataProvider): InferProcessor {
        if (!rp.PromptID) {
            throw new Error(`Record Process '${rp.Name}': WorkType=Infer requires PromptID`);
        }
        // unparseable mapping JSON (SafeJSONParse answers null) falls back to the default mapping, as an absent one does
        const inputMapping = (rp.InputMapping ? SafeJSONParse<Record<string, string>>(rp.InputMapping) : null) || undefined;
        const spec = InferProcessor.parseSpec(rp, provider);
        if (spec?.ProcessorExtensionKey) {
            const custom = MJGlobal.Instance.ClassFactory.CreateInstance<InferProcessor>(InferProcessor, spec.ProcessorExtensionKey, rp.PromptID, inputMapping, spec, rp.OutputMapping || null);
            if (custom && custom.constructor !== InferProcessor) {
                return custom;
            } else {
                throw new Error(`Record Process '${rp.Name}': ProcessorExtensionKey '${spec.ProcessorExtensionKey}' not found in ClassFactory`);
            }
        }
        return new InferProcessor(rp.PromptID, inputMapping, spec, rp.OutputMapping || null);
    }

    /** Parses and validates the DataFeatureSpec in an Infer pipeline row's `Configuration`; undefined when it has none. */
    private static parseSpec(rp: MJRecordProcessEntity, provider?: IMetadataProvider): DataFeatureSpec | undefined {
        let spec: DataFeatureSpec | undefined;
        if (rp.Configuration && rp.Configuration.trim().length > 0) {
            try {
                spec = JSON.parse(rp.Configuration) as DataFeatureSpec;
            } catch (e) {
                throw new Error(`Record Process '${rp.Name}': Configuration is invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
            }
            const issues = validateSpec(spec);
            const errors = issues.filter((i) => i.Severity === 'error');
            if (errors.length > 0) {
                throw new Error(`Record Process '${rp.Name}': invalid DataFeatureSpec in Configuration: ${errors.map((err) => err.Message).join('; ')}`);
            }

            const targetProvider = provider ?? Metadata.Provider;
            if (targetProvider && rp.EntityID) {
                const materializationIssues = validateMaterializationTargets(spec, targetProvider, rp.EntityID);
                const matErrors = materializationIssues.filter((i) => i.Severity === 'error');
                if (matErrors.length > 0) {
                    throw new Error(`Record Process '${rp.Name}': invalid materialization targets: ${matErrors.map((err) => `${err.Field ? `[${err.Field}] ` : ''}${err.Message} Fix: ${err.FixRecommendation}`).join('; ')}`);
                }
            }
        }
        return spec;
    }

    /** The pipeline's DataFeatureSpec, when it has one. */
    public get Spec(): DataFeatureSpec | undefined {
        return this.spec;
    }

    /** The `MJ: AI Prompts` ID this processor runs for each record. */
    public get PromptID(): string {
        return this.promptID;
    }

    /**
     * The hash that versions this pipeline's output constraints, as its Dedup Cache and history record it. It includes
     * the allowed values resolved for this processor's run (lookup rows, field value lists) once they are resolved.
     * Read it only after the run resolved them ({@link ResolvePin}, which every record and `Preflight` go through):
     * before that it is the hash of the declared constraints alone, which differs for a lookup pipeline.
     */
    public get ConstraintHash(): string {
        return this.computeConstraintHash(this.spec, this.lastResolvedConstraints);
    }

    /**
     * How many records this processor has escalated to its spec's `Escalation` pipeline. A processor
     * serves one run, so this is the run's count. It counts every record whose answer was escalated,
     * including the records that shared a Dedup Cache key with one, and the escalations that failed.
     */
    public get EscalatedRecordCount(): number {
        return this.escalatedRecordCount;
    }

    /**
     * A record's Feature Values as they were before this processor first wrote them, by feature name (null for a
     * feature with no row on its key). Feature Values are updated in place on their key, so this is the only record of
     * what an earlier run wrote once this run has written. Kept for the batch that wrote the record (until the next
     * {@link ProcessBatch} starts). Undefined when this processor wrote nothing for the record in that batch.
     */
    public PreviousFeatureValues(recordID: string): Readonly<Record<string, TypedFeatureValue | null>> | undefined {
        return this.previousFeatureValues.get(recordID);
    }

    /**
     * The spec outputs whose answers this processor records as `Source='Pipeline'` Feature Values: one row per output for
     * every record it writes, an empty answer included (a null value, or `[]`). The watermark gate reads them to tell an
     * output answered empty from one deleted since it was written. Empty when it records none (no spec, or
     * {@link WritesHistory} off).
     */
    public RecordedAnswerOutputs(): DataFeatureOutput[] {
        return this.WritesHistory ? this.spec?.Outputs || [] : [];
    }

    /**
     * The guard write-back uses to keep values a person entered; undefined when the run has no pipeline, entity or
     * spec. It reads the record's {@link PreviousFeatureValues} when asked, which is after the record's Feature Values
     * were written inside the write-back unit ({@link WriteDeferredFeatureValues}).
     */
    public CreateHumanValueGuard(record: RecordRef, context: RecordProcessorContext): HumanValueGuard | undefined {
        if (!context.recordProcessID || !context.entityID || !this.spec) {
            return undefined;
        }
        return new FeaturePipelineHumanValueGuard({
            RecordProcessID: context.recordProcessID, EntityID: context.entityID, Record: record, Context: context, Spec: this.spec,
            PreviousValues: () => this.PreviousFeatureValues(record.RecordID),
        });
    }

    /**
     * Hands this processor's Feature Value writes to the write-back that wraps it: from now on they are queued per
     * record and saved by {@link WriteDeferredFeatureValues} inside the record's write-back unit. So a failed
     * write-back leaves the previous Feature Values in place (what the pipeline last wrote stays what it last
     * committed), and a dry run writes none.
     */
    public DeferFeatureValuesToWriteBack(): void {
        this.deferFeatureValues = true;
    }

    /**
     * Saves a record's queued Feature Value writes, in order, on `provider` (the write-back unit's), and keeps the
     * values they replaced as the record's {@link PreviousFeatureValues}; null when none were queued.
     * @throws Error naming the record when a write fails (the write-back unit then rolls back)
     */
    public async WriteDeferredFeatureValues(recordID: string, provider: IMetadataProvider): Promise<RecordFeatureValuesOutcome | null> {
        const queued = this.pendingFeatureValues.get(recordID);
        this.pendingFeatureValues.delete(recordID);
        if (!queued || queued.length === 0) {
            return null;
        }
        // The capture belongs to this unit's first write, not to an earlier pass over the same record.
        this.previousFeatureValues.delete(recordID);
        const total: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Previous: {} };
        for (const params of queued) {
            const outcome = await this.WriteFeatureValuesOn(params, provider);
            total.Upserted += outcome.Upserted;
            total.Unchanged += outcome.Unchanged;
        }
        total.Previous = { ...this.previousFeatureValues.get(recordID) };
        return total;
    }

    /** Drops a record's queued Feature Value writes: its result failed, so it gets no write-back. */
    public DiscardDeferredFeatureValues(recordID: string): void {
        this.pendingFeatureValues.delete(recordID);
    }

    /** One queued write on the unit's provider; a failure names the record. */
    protected async WriteFeatureValuesOn(params: FeatureValueWriteParams, provider: IMetadataProvider): Promise<RecordFeatureValuesOutcome> {
        try {
            return await this.WriteFeatureValues({ ...params, Context: { ...params.Context, provider } });
        } catch (e) {
            // The typed error (a FeatureValueSaveError carries the feature, record and provider message) stays reachable as `cause`.
            throw new Error(`Feature Value write failed for record '${params.Record.RecordID}': ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
    }

    /**
     * The pin and input hash a record's result was computed under, whether or not this processor writes Feature Values
     * (an escalation target does not: the Decision pipeline keys the answer with them). Set only once the record's
     * Feature Values were written (or, with {@link WritesHistory} off, once there was nothing to write), and kept for the
     * batch that produced it. Undefined when the record did not succeed here.
     */
    public FeatureValueKeyOf(recordID: string): FeatureValueKeyParts | undefined {
        return this.featureValueKeys.get(recordID);
    }

    /**
     * Run-level checks before the first record: an LLM pipeline whose outputs carry constraints must have a prompt
     * template that renders them, or the model never sees the allowed values. `RecordSetProcessor` calls it once
     * per run (through `WriteBackProcessor` when the pipeline writes back), so a refused run processes no record.
     * Then, for a run of a Record Process that writes Feature Values, resolves the pipeline version the run writes
     * under (the version registry's run gate: it refuses a scheduled run of a changed version, and a gated version
     * without a passing golden-set result) and keeps it for every record's result and Feature Values. A gated
     * processor that writes none (an escalation target) is only checked against its gate, read-only.
     * @throws Error when the prompt or driver cannot be resolved (the same reason every record would fail with)
     * @throws ConstraintBlockMissingError when the prompt template does not render the constraint block
     * @throws FeaturePipelineVersionRefusedError when the run may not write under the pipeline's current version
     */
    public async Preflight(context: RecordProcessorContext): Promise<void> {
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            throw new Error(run.ErrorMessage);
        }
        const missingBlock = ConstraintPromptTemplate.DescribeMissingBlock(this.spec, run.Prompt.Name, run.Prompt.TemplateText);
        if (missingBlock) {
            throw new ConstraintBlockMissingError(run.Prompt.Name, missingBlock);
        }
        if (!context.recordProcessID) {
            return;
        }
        if (this.WritesHistory) {
            await this.ResolvePipelineVersion(context, context.recordProcessID, run.Pin, run.PinHash);
        } else if (this.spec?.Activation) {
            // A processor that writes no Feature Values (a Decision pipeline's escalation target: the Decision pipeline
            // writes the answers under its own version) has no version to write under, and must not register or
            // activate versions of its pipeline as a side effect of another pipeline's run. A gated one still may
            // compute only under a version that passed its golden set: checked without writing anything.
            await FeaturePipelineVersionService.Instance.AssertRunnable({
                RecordProcessID: context.recordProcessID, Pin: run.Pin, Activation: this.spec.Activation,
                ContextUser: context.contextUser, Provider: context.provider,
            });
        }
    }

    /**
     * Asks the version registry for the version this run writes under and keeps it, with the pin hash it was resolved
     * for. On a dry run, keeps why the real run would be refused, for each record's result.
     * @throws FeaturePipelineVersionRefusedError when the run may not write under the pipeline's current version
     */
    protected async ResolvePipelineVersion(context: RecordProcessorContext, recordProcessID: string, pin: FeaturePipelinePinData, pinHash: string): Promise<void> {
        const resolved = await FeaturePipelineVersionService.Instance.ResolveForRun({
            RecordProcessID: recordProcessID, Pin: pin, Activation: this.spec?.Activation,
            TriggeredBy: context.TriggeredBy, DryRun: context.DryRun, ContextUser: context.contextUser, Provider: context.provider,
        });
        this.PipelineVersion = resolved.Version;
        this.versionPinHash = resolved.Version === null ? null : pinHash;
        this.dryRunRefusal = resolved.WouldRefuse || null;
    }

    /**
     * The pin of this processor's current run state (prompt, model, parameters, spec).
     * @throws FeaturePipelineUnresolvableError when the prompt or driver cannot be resolved
     */
    public async ResolveRunPin(context: RecordProcessorContext): Promise<FeaturePipelinePinData> {
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            throw new FeaturePipelineUnresolvableError(run.ErrorMessage);
        }
        return run.Pin;
    }

    /** The resolved output constraints (with lookup rows) of this processor; the golden-set driver scores with them. */
    public async GetResolvedConstraints(context: RecordProcessorContext): Promise<Map<string, ResolvedConstraint | null>> {
        return this.ResolveConstraints(context);
    }

    public async ProcessRecord(
        record: RecordRef,
        context: RecordProcessorContext,
        options?: { skipLookup?: boolean; keyInfo?: CacheKeyResult }
    ): Promise<RecordResult> {
        const dry = context.DryRun === true;
        await this.ensureRecordsLoaded([record], context);
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            return { Status: 'Failed', ErrorMessage: run.ErrorMessage };
        }
        const { Prompt: prompt, PromptVersionHash: promptVersionHash, ConstraintHash: constraintHash } = run;
        let keyInfo: CacheKeyResult | undefined;

        // Dedup Cache lookup
        if (run.IsCacheable) {
            keyInfo =
                options?.keyInfo ??
                (await FeatureValueCacheService.Instance.ComputeCacheKey({
                    KeyFields: this.spec?.Caching?.KeyFields,
                    RecordData: this.recordToPlain(record),
                }));

            // BypassCache treats every key as a miss (an evaluation measures the model, not the cache)
            if (!options?.skipLookup && context.BypassCache !== true) {
                const cached = await FeatureValueCacheService.Instance.Lookup({
                    RecordProcessID: context.recordProcessID,
                    Scope: this.spec?.Caching?.Scope,
                    PromptID: prompt.ID,
                    PromptVersionHash: promptVersionHash,
                    ConstraintHash: constraintHash,
                    AIModelID: run.Pin.AIModelID,
                    ParametersHash: run.Pin.ParametersHash,
                    KeyHash: keyInfo.KeyHash,
                    // A dry run reads the cache without counting the hit
                    RecordHit: !dry,
                    ContextUser: context.contextUser,
                    Provider: context.provider,
                });

                if (cached) {
                    let cachedPayload = JSON.parse(cached.OutputsJSON);
                    if (typeof cachedPayload === 'string') {
                        try {
                            cachedPayload = JSON.parse(cachedPayload);
                        } catch {
                            // keep as string
                        }
                    }
                    const annotations = this.RecordedAnnotations(cachedPayload);
                    return this.WithFeatureValues({
                        Status: 'Succeeded',
                        ResultPayload: cachedPayload,
                        AIPromptRunID: cached.AIPromptRunID || undefined,
                        PromptVersionHash: promptVersionHash,
                        FeatureValueCacheID: cached.ID,
                        ...(annotations.OutputConfidence ? { Confidence: annotations.OutputConfidence } : {}),
                    }, {
                        Record: record,
                        Context: context,
                        Payload: cachedPayload,
                        ...annotations,
                        PromptID: prompt.ID,
                        ConstraintHash: constraintHash,
                        AIPromptRunID: cached.AIPromptRunID,
                        FeatureValueCacheID: cached.ID,
                        InputHash: keyInfo.KeyHash,
                        Pin: run.Pin,
                    });
                }
            }
        }

        // The pipeline type's driver turns the record's context into its outputs (for LLM: the prompt run and its hooks)
        const sample = await this.computeSample({ keyInfo, records: [record] }, context, run);
        // A decision below the escalation floor escalates; any other answer is validated and recorded as it is
        const [finalized] = await this.finalizeSamples([sample], context, run);
        return finalized.Result;
    }

    /**
     * Runs the driver on a key group's first record, and notes which outputs, if any, are below the escalation floor.
     * A group without a cache key (an uncacheable pipeline) gets one from the spec's context fields: it is the input
     * hash of the group's Feature Values, never used for a cache call.
     */
    private async computeSample(group: CacheKeyGroup, context: RecordProcessorContext, run: PipelineRunState): Promise<ComputedSample> {
        const sample = group.records[0];
        group.keyInfo ??= await FeatureValueCacheService.Instance.ComputeCacheKey({
            KeyFields: this.spec?.Context?.Fields,
            RecordData: this.recordToPlain(sample),
        });
        const fieldValues = this.buildFieldValuesLookup(context);
        const computed = await run.Driver.ComputeOutputs({
            Record: sample,
            Context: context,
            Prompt: run.Prompt,
            Spec: this.spec,
            Hooks: this.buildComputeHooks(),
            FieldValues: fieldValues,
        });
        return { Group: group, Sample: sample, Computed: computed, BelowFloor: this.belowFloor(computed) };
    }

    /**
     * Finishes a computed sample: a driver failure fails it, a below-floor decision takes its escalation's
     * outcome, and any other answer is validated, cached and recorded.
     */
    private async finalizeSample(
        sample: ComputedSample,
        outcomes: Map<string, EscalationOutcome>,
        context: RecordProcessorContext,
        run: PipelineRunState
    ): Promise<FinalizedSample> {
        const computed = sample.Computed;
        if ('ErrorMessage' in computed) {
            return {
                Result: {
                    Status: 'Failed',
                    ErrorMessage: computed.ErrorMessage,
                    AIPromptRunID: computed.AIPromptRunID,
                    ParameterFidelity: computed.ParameterFidelity,
                },
            };
        }
        if (sample.BelowFloor.length > 0) {
            return this.finalizeEscalated(sample, computed, outcomes.get(sample.Sample.RecordID), context, run);
        }
        const result = await this.finalizeComputed(sample.Sample, context, run, sample.Group.keyInfo, computed);
        return { Result: result, FeatureValues: this.missFanOutFeatureValues(result, context, run, sample.Group.keyInfo) };
    }

    /**
     * Validates a driver's outputs against the constraints (applying each OnViolation policy), stores
     * them in the Dedup Cache, and records their history.
     */
    private async finalizeComputed(
        record: RecordRef,
        context: RecordProcessorContext,
        run: PipelineRunState,
        keyInfo: CacheKeyResult | undefined,
        computed: FeaturePipelineComputeSuccess
    ): Promise<RecordResult> {
        const { Prompt: prompt, PromptVersionHash: promptVersionHash, ConstraintHash: constraintHash } = run;
        const dry = context.DryRun === true;
        const aiPromptRunID = computed.AIPromptRunID;
        const rawResult = computed.RawResult;

        // Layer 2: Validate outputs against constraints and apply OnViolation policy
        const validationOutcome = await this.validateOutputs(
            this.spec?.Outputs ?? [],
            rawResult,
            record,
            context
        );

        if (!validationOutcome.valid) {
            // Nothing is cached or recorded for an answer outside the constraints; the run counts it as rejected
            return {
                Status: 'Failed',
                FailureKind: 'RejectedInvalid',
                ErrorMessage: validationOutcome.errorMessage || 'Constraint violation',
                AIPromptRunID: aiPromptRunID,
                ParameterFidelity: computed.ParameterFidelity,
            };
        }

        // The payload carries the driver's own confidences, so the Dedup Cache stores them and a hit replays them
        const floored = this.ApplyConfidenceFloors(InferProcessor.WithDriverConfidence(
            validationOutcome.payload,
            this.confidenceOfKeptValues(computed.Confidence, validationOutcome.replacedOutputs)
        ));
        if ('Rejected' in floored) {
            // Like a constraint rejection: nothing is cached or recorded, and the run counts it apart from failures
            return InferProcessor.BelowConfidenceFailure(floored.Rejected, aiPromptRunID, computed.ParameterFidelity);
        }
        // An output below a 'null' floor is withheld: the payload holds null for it and names it, so a cache hit replays that
        const payload = floored.Payload;
        const annotations = this.RecordedAnnotations(payload);
        let featureValueCacheID: string | undefined;

        // Dedup Cache store (never on a dry run: it persists nothing)
        const warnings: string[] = [];
        if (run.IsCacheable && keyInfo && !dry) {
            try {
                const stored = await FeatureValueCacheService.Instance.Store({
                    RecordProcessID: context.recordProcessID,
                    Scope: this.spec?.Caching?.Scope,
                    PromptID: prompt.ID,
                    PromptVersionHash: promptVersionHash,
                    ConstraintHash: constraintHash,
                    AIModelID: run.Pin.AIModelID,
                    ParametersHash: run.Pin.ParametersHash,
                    KeyHash: keyInfo.KeyHash,
                    KeyDisplay: keyInfo.KeyDisplay,
                    KeyJSON: keyInfo.KeyJSON,
                    OutputsJSON: JSON.stringify(payload),
                    Reasoning: annotations.Reasoning || null,
                    AIPromptRunID: aiPromptRunID ?? null,
                    TtlSeconds: this.spec?.Caching?.TTLSeconds,
                    ContextUser: context.contextUser,
                    Provider: context.provider,
                });
                featureValueCacheID = stored.ID;
            } catch (e) {
                const message = `failed storing cache entry: ${e instanceof Error ? e.message : String(e)}`;
                LogError(`InferProcessor: ${message}`);
                warnings.push(message);
            }
        }

        // Feature Values (upserted on their key)
        return this.WithFeatureValues({
            Status: 'Succeeded',
            ResultPayload: payload,
            AIPromptRunID: aiPromptRunID,
            PromptVersionHash: promptVersionHash,
            FeatureValueCacheID: featureValueCacheID,
            ParameterFidelity: computed.ParameterFidelity,
            ...(annotations.OutputConfidence ? { Confidence: annotations.OutputConfidence } : {}),
            ...(warnings.length > 0 ? { Warnings: warnings } : {}),
        }, {
            Record: record,
            Context: context,
            Payload: payload,
            ...annotations,
            PromptID: prompt.ID,
            ConstraintHash: constraintHash,
            AIPromptRunID: aiPromptRunID,
            FeatureValueCacheID: featureValueCacheID,
            InputHash: keyInfo?.KeyHash || null,
            Pin: run.Pin,
        });
    }

    /**
     * Two-phase batch execution. Resolves distinct keys across the batch first,
     * checks the dedup cache in one batch query, executes LLM prompts ONCE per distinct key,
     * and fans results back across all matching rows.
     */
    public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        const dry = context.DryRun === true;
        this.ResetBatchState();
        await this.ensureRecordsLoaded(records, context);
        const results = new Map<string, RecordResult>();
        if (!this.spec?.Caching?.Cacheable || records.length === 0) {
            if (this.escalator && records.length > 0) {
                return this.processUncachedBatchWithEscalation(records, context);
            }
            for (const r of records) {
                results.set(r.RecordID, await this.ProcessRecord(r, context));
            }
            return results;
        }

        // Resolve before the cache phases, so a type that cannot run fails every record rather than serving cache hits
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            return this.failEvery(records, run.ErrorMessage, results);
        }
        const { Prompt: prompt, PromptVersionHash: promptVersionHash, ConstraintHash: constraintHash } = run;

        // Phase 1: Compute distinct cache keys across the batch
        const keyGroupMap = new Map<string, CacheKeyGroup>();
        for (const record of records) {
            const recordData = this.recordToPlain(record);
            const keyInfo = await FeatureValueCacheService.Instance.ComputeCacheKey({
                KeyFields: this.spec.Caching.KeyFields,
                RecordData: recordData,
            });
            let group = keyGroupMap.get(keyInfo.KeyHash);
            if (!group) {
                group = { keyInfo, records: [] };
                keyGroupMap.set(keyInfo.KeyHash, group);
            }
            group.records.push(record);
        }

        // Phase 2: Batch lookup existing cache entries for all distinct keys. BypassCache treats every key as a miss
        // (an evaluation measures the model, not the cache); a dry run reads the cache without counting the hits.
        const distinctKeyHashes = Array.from(keyGroupMap.keys());
        const cacheMap = context.BypassCache === true
            ? new Map<string, MJFeatureValueCacheEntity>()
            : await FeatureValueCacheService.Instance.BatchLookup({
                RecordProcessID: context.recordProcessID,
                Scope: this.spec.Caching.Scope,
                PromptID: prompt.ID,
                PromptVersionHash: promptVersionHash,
                ConstraintHash: constraintHash,
                AIModelID: run.Pin.AIModelID,
                ParametersHash: run.Pin.ParametersHash,
                KeyHashes: distinctKeyHashes,
                RecordHit: !dry,
                ContextUser: context.contextUser,
                Provider: context.provider,
            });

        // Phase 3: Fan out hits; execute misses ONCE per distinct key and fan out
        const escalatingMisses: CacheKeyGroup[] = [];
        for (const [keyHash, group] of keyGroupMap.entries()) {
            const cached = cacheMap.get(keyHash);
            if (cached) {
                // CACHE HIT: fan out immediately to all matching records without calling LLM!
                let cachedPayload = JSON.parse(cached.OutputsJSON);
                if (typeof cachedPayload === 'string') {
                    try {
                        cachedPayload = JSON.parse(cachedPayload);
                    } catch {
                        // keep as string
                    }
                }
                const annotations = this.RecordedAnnotations(cachedPayload);
                for (const rec of group.records) {
                    results.set(rec.RecordID, await this.WithFeatureValues({
                        Status: 'Succeeded',
                        ResultPayload: cachedPayload,
                        AIPromptRunID: cached.AIPromptRunID || undefined,
                        PromptVersionHash: promptVersionHash,
                        FeatureValueCacheID: cached.ID,
                        ...(annotations.OutputConfidence ? { Confidence: annotations.OutputConfidence } : {}),
                    }, {
                        Record: rec,
                        Context: context,
                        Payload: cachedPayload,
                        ...annotations,
                        PromptID: prompt.ID,
                        ConstraintHash: constraintHash,
                        AIPromptRunID: cached.AIPromptRunID,
                        FeatureValueCacheID: cached.ID,
                        InputHash: keyHash,
                        Pin: run.Pin,
                    }));
                }
            } else if (this.escalator) {
                // CACHE MISS, escalating pipeline: computed together below, so the below-floor records escalate together
                escalatingMisses.push(group);
            } else {
                // CACHE MISS: Execute prompt ONCE for the distinct key (using the first record in the group)
                const sampleRecord = group.records[0];
                const singleResult = await this.ProcessRecord(sampleRecord, context, {
                    skipLookup: true,
                    keyInfo: group.keyInfo,
                });

                // Fan out result to all records in this group
                await this.fanOutGroupResult(group, sampleRecord, singleResult, this.missFanOutFeatureValues(singleResult, context, run, group.keyInfo), results);
            }
        }
        await this.computeGroupsWithEscalation(escalatingMisses, context, run, results);

        return results;
    }

    /** Fails every record with one message. */
    private failEvery(records: RecordRef[], errorMessage: string, results: Map<string, RecordResult>): Map<string, RecordResult> {
        for (const r of records) {
            results.set(r.RecordID, { Status: 'Failed', ErrorMessage: errorMessage });
        }
        return results;
    }

    /**
     * Resolves what one processing pass needs: the prompt, the driver, and the hashes that version the
     * pipeline's answers. Returns why the pipeline cannot run instead, when the prompt is missing or the
     * driver cannot be resolved.
     */
    private async resolveRunState(context: RecordProcessorContext): Promise<PipelineRunState | { ErrorMessage: string }> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            return { ErrorMessage: `AI Prompt '${this.promptID}' not found` };
        }
        const resolution = await this.resolveDriverOrError(context);
        if ('ErrorMessage' in resolution) {
            return { ErrorMessage: resolution.ErrorMessage };
        }
        const pin = await this.ResolvePin(prompt as MJAIPromptEntityExtended, context);
        const pinHash = await FeaturePipelinePin.ComputeHash(pin);
        if (this.versionPinHash && pinHash !== this.versionPinHash) {
            // The prompt, model, parameters, spec or escalation target changed after the run resolved its version: a
            // value computed now would carry a version that did not compute it.
            return {
                ErrorMessage: `The Feature Pipeline's prompt, model, parameters or spec changed during the run, after it resolved version v${this.PipelineVersion}. This record was not computed; run the pipeline again to compute it under the new version.`,
            };
        }
        const resolved = await this.ResolveConstraints(context);
        return {
            Prompt: prompt,
            Driver: resolution.Driver,
            IsCacheable: this.spec?.Caching?.Cacheable === true,
            PromptVersionHash: pin.PromptVersionHash,
            ConstraintHash: this.computeConstraintHash(this.spec, resolved),
            Pin: pin,
            PinHash: pinHash,
            ResolvedConstraints: resolved,
        };
    }

    /**
     * Starts a batch: drops the previous batch's per-record state ({@link PreviousFeatureValues},
     * {@link FeatureValueKeyOf}). Its consumers read it right after the batch that produced it, so keeping it longer
     * would only grow it by one entry per record for the whole run.
     */
    protected ResetBatchState(): void {
        this.previousFeatureValues.clear();
        this.featureValueKeys.clear();
        this.pendingFeatureValues.clear();
    }

    /**
     * The pin this processor's prompt and spec give right now: prompt version hash, primary model, parameters hash and
     * spec hash. Read from the AI engine's cached prompt and prompt models.
     *
     * It is resolved per record (each record's result and watermark carry it), but its three hashes are computed only
     * when an input changed: the result is kept with a fingerprint of everything the hashes read (the prompt's text and
     * parameters, the primary model and its settings), so an edited prompt, template or model takes effect on the next
     * record while an unchanged pin costs no hashing. The spec and OutputMapping are fixed for the processor's life.
     * A Decision pipeline that escalates also fingerprints its escalation target's pin, which its spec hash covers
     * ({@link ResolveEscalationTargetPinHash}).
     * The prompt version hash covers the rendered constraint block, so it includes the run's resolved constraints
     * (lookup rows), which are loaded once per processor through `context`.
     */
    public async ResolvePin(prompt: MJAIPromptEntityExtended, context: RecordProcessorContext): Promise<FeaturePipelinePinData> {
        const resolved = await this.ResolveConstraints(context);
        const models = (AIEngine.Instance.PromptModels ?? []).filter((pm) => UUIDsEqual(pm.PromptID, prompt.ID));
        const primary = FeaturePipelinePin.SelectPrimaryModel(models);
        // `??` keeps a configured 0 (temperature, seed, effort) distinct from an unset value
        const parameters = {
            Temperature: prompt.Temperature ?? null, TopP: prompt.TopP ?? null, TopK: prompt.TopK ?? null, MinP: prompt.MinP ?? null,
            FrequencyPenalty: prompt.FrequencyPenalty ?? null, PresencePenalty: prompt.PresencePenalty ?? null,
            Seed: prompt.Seed ?? null, ResponseFormat: prompt.ResponseFormat,
            EffortLevel: primary?.EffortLevel ?? prompt.EffortLevel ?? null, ModelParameters: primary?.ModelParameters || null,
        };
        const escalationTargetPinHash = await this.ResolveEscalationTargetPinHash(context);
        const fingerprint = Canonicalize({
            PromptID: prompt.ID, PromptText: this.promptVersionHashBasis(prompt, this.spec, resolved), Parameters: parameters, AIModelID: primary?.ModelID || null,
            EscalationTargetPinHash: escalationTargetPinHash,
        });
        if (this.resolvedPin?.Fingerprint === fingerprint) {
            return this.resolvedPin.Pin;
        }
        const pin: FeaturePipelinePinData = {
            PromptID: prompt.ID,
            PromptVersionHash: this.computePromptVersionHash(prompt, this.spec, resolved),
            AIModelID: primary?.ModelID || null,
            ParametersHash: await FeaturePipelinePin.ComputeParametersHash(parameters),
            SpecHash: this.spec ? await FeaturePipelinePin.ComputeSpecHash(this.spec, this.outputMappingText, escalationTargetPinHash) : 'no-spec',
        };
        this.resolvedPin = { Fingerprint: fingerprint, Pin: pin };
        return pin;
    }

    /**
     * The pin hash of this Decision pipeline's escalation target, which its spec hash covers; null when the pipeline
     * does not escalate, the context names no entity, or the target cannot be used as configured
     * ({@link EscalationTargetUnresolvableError}). Such a target is not an error here: the Decision pipeline's own
     * answers still compute, and every record that escalates fails with the target's reason (the escalation resolves it
     * again, from the same memoised build, and reports it). A failure to load the target is rethrown: hashing without
     * the target on a transient error would make a spurious new version.
     * @throws Error when the target's row or what its pin needs cannot be loaded
     */
    protected async ResolveEscalationTargetPinHash(context: RecordProcessorContext): Promise<string | null> {
        const escalator = this.escalator;
        if (!escalator || !context.entityID) {
            return null;
        }
        let targetPin: FeaturePipelinePinData;
        try {
            targetPin = await escalator.ResolveTargetPin(context, context.entityID);
        } catch (e) {
            if (e instanceof EscalationTargetUnresolvableError) {
                return null;
            }
            throw e;
        }
        return FeaturePipelinePin.ComputeHash(targetPin);
    }

    /**
     * The pipeline's resolved output constraints, lookup rows included; loaded once per processor (a processor serves
     * one run). A failed load is kept too: every later record of the run fails with the same error rather than
     * re-reading the lookup per record. The context must name the run's entity (`entityID`), since a field target's
     * constraint resolves against it.
     */
    protected async ResolveConstraints(context: RecordProcessorContext): Promise<Map<string, ResolvedConstraint | null>> {
        this.resolvedConstraints ||= this.LoadResolvedConstraints(context);
        this.lastResolvedConstraints = await this.resolvedConstraints;
        return this.lastResolvedConstraints;
    }

    /**
     * Resolves every output's constraint and loads lookup rows through the run's provider, the one way the builder's
     * preview resolves them too ({@link OutputConstraintResolver.Resolve}). The entity's metadata is read only when an
     * output has a constraint and a field target: no other output resolves against a field.
     */
    protected async LoadResolvedConstraints(context: RecordProcessorContext): Promise<Map<string, ResolvedConstraint | null>> {
        const outputs = this.spec?.Outputs || [];
        const needsField = outputs.some((o) => o.Constraint && o.Target.Mode === 'field');
        const entity = needsField && context.entityID ? context.provider.EntityByID(context.entityID) : undefined;
        return OutputConstraintResolver.Resolve(outputs, entity, (resolved) => LookupConstraintValues.Load(resolved, context.provider, context.contextUser));
    }

    /**
     * Gives every record in a key group its sample's result. The other records get a copy of it, and their
     * own Feature Values from `featureValues` (which is absent when the sample failed); a record whose own values
     * cannot be written fails.
     */
    private async fanOutGroupResult(
        group: CacheKeyGroup,
        sample: RecordRef,
        result: RecordResult,
        featureValues: GroupFeatureValues | undefined,
        results: Map<string, RecordResult>
    ): Promise<void> {
        for (const rec of group.records) {
            if (rec.RecordID === sample.RecordID) {
                results.set(rec.RecordID, result);
            } else {
                const copy: RecordResult = { ...result, ...(result.Warnings ? { Warnings: [...result.Warnings] } : {}) };
                results.set(rec.RecordID, featureValues ? await this.WithFeatureValues(copy, { ...featureValues, Record: rec }) : copy);
            }
        }
    }

    /** The Feature Values a key group's other records get from its sample's computed result: none when it failed. */
    private missFanOutFeatureValues(
        result: RecordResult,
        context: RecordProcessorContext,
        run: PipelineRunState,
        keyInfo: CacheKeyResult | undefined
    ): GroupFeatureValues | undefined {
        if (result.Status !== 'Succeeded') {
            return undefined;
        }
        return {
            Context: context,
            Payload: result.ResultPayload,
            PromptID: run.Prompt.ID,
            ConstraintHash: run.ConstraintHash,
            AIPromptRunID: result.AIPromptRunID,
            FeatureValueCacheID: result.FeatureValueCacheID,
            InputHash: keyInfo?.KeyHash || null,
            Pin: run.Pin,
            // The same reasoning and confidences the sample recorded, from the same payload a later hit replays
            ...this.RecordedAnnotations(result.ResultPayload),
        };
    }

    // -------------------------------------------------------------------------------------------------
    // Escalation (DataFeatureSpec.Escalation): below-floor decisions re-run through an LLM pipeline
    // -------------------------------------------------------------------------------------------------

    /**
     * The escalation of below-floor decisions, when the spec is a Decision pipeline's and has `Escalation`;
     * created once. `ValidateSpec` already refuses `Escalation` on any other type, but a processor built
     * directly from a spec skips it, and an LLM pipeline returns no confidence, so every record would escalate.
     */
    private get escalator(): FeaturePipelineEscalator | undefined {
        if (!this.spec?.Escalation || !IsDecisionPipelineType(this.spec.PipelineType)) {
            return undefined;
        }
        this._escalator ??= new FeaturePipelineEscalator(
            this.spec.Escalation,
            this.spec.Outputs ?? [],
            (pipeline, provider) => InferProcessor.FromRecordProcess(pipeline, provider)
        );
        return this._escalator;
    }

    /** A successful decision's outputs below the escalation floor; empty when the pipeline does not escalate. */
    private belowFloor(computed: FeaturePipelineComputeResult): BelowFloorOutput[] {
        const escalator = this.escalator;
        if (!escalator || 'ErrorMessage' in computed) {
            return [];
        }
        return escalator.BelowFloor(computed.Confidence);
    }

    /** An uncached batch of a pipeline that escalates: every record is its own group, computed together. */
    private async processUncachedBatchWithEscalation(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        const results = new Map<string, RecordResult>();
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            return this.failEvery(records, run.ErrorMessage, results);
        }
        await this.computeGroupsWithEscalation(records.map((r) => ({ records: [r] })), context, run, results);
        return results;
    }

    /**
     * Computes key groups for a pipeline that escalates. The driver answers each group's first record; the
     * below-floor answers escalate together, in one pass through the target; then each group's final
     * answer is recorded once and fanned out to its records.
     */
    private async computeGroupsWithEscalation(
        groups: CacheKeyGroup[],
        context: RecordProcessorContext,
        run: PipelineRunState,
        results: Map<string, RecordResult>
    ): Promise<void> {
        const samples: ComputedSample[] = [];
        for (const group of groups) {
            samples.push(await this.computeSample(group, context, run));
        }
        const finalized = await this.finalizeSamples(samples, context, run);
        for (let i = 0; i < samples.length; i++) {
            await this.fanOutGroupResult(samples[i].Group, samples[i].Sample, finalized[i].Result, finalized[i].FeatureValues, results);
        }
    }

    /**
     * Escalates the below-floor samples together, then finalizes every sample, in order. The escalations are
     * counted and logged by each escalated sample's final result, so an escalated answer that fails this
     * pipeline's own constraints counts as failed.
     */
    private async finalizeSamples(samples: ComputedSample[], context: RecordProcessorContext, run: PipelineRunState): Promise<FinalizedSample[]> {
        const outcomes = await this.escalateBelowFloor(samples, context);
        const finalized: FinalizedSample[] = [];
        for (const sample of samples) {
            finalized.push(await this.finalizeSample(sample, outcomes, context, run));
        }
        this.countEscalations(samples, finalized);
        return finalized;
    }

    /**
     * Escalates, together, the samples whose decision was below the floor. Returns each escalated sample's
     * outcome by record ID; empty when none escalated.
     */
    private async escalateBelowFloor(samples: ComputedSample[], context: RecordProcessorContext): Promise<Map<string, EscalationOutcome>> {
        const escalator = this.escalator;
        const escalating = samples.filter((s) => s.BelowFloor.length > 0);
        if (!escalator || escalating.length === 0) {
            return new Map<string, EscalationOutcome>();
        }
        return escalator.Escalate(escalating.map((s) => ({ Record: s.Sample, BelowFloor: s.BelowFloor })), context);
    }

    /**
     * Adds a pass's escalated records (each group's records, fan-out included) to the run's count, and logs
     * it, counting as failed each escalated group whose final result failed.
     */
    private countEscalations(samples: ComputedSample[], finalized: FinalizedSample[]): void {
        const escalator = this.escalator;
        let escalated = 0;
        let failed = 0;
        samples.forEach((sample, i) => {
            if (sample.BelowFloor.length === 0) {
                return;
            }
            escalated += sample.Group.records.length;
            if (finalized[i].Result.Status !== 'Succeeded') {
                failed += sample.Group.records.length;
            }
        });
        if (!escalator || escalated === 0) {
            return;
        }
        this.escalatedRecordCount += escalated;
        LogStatus(
            `InferProcessor: escalated ${escalated} record(s) whose decision confidence was below ${escalator.BelowConfidence} ` +
            `to Feature Pipeline '${escalator.PipelineID}' (${failed} failed); ${this.escalatedRecordCount} escalated in this run.`
        );
    }

    /**
     * Finishes a record whose decision was below the escalation floor. A failed escalation fails the record
     * with both reasons, and the low-confidence decision is never cached, recorded or returned. A successful
     * one replaces the decision: the target's validated payload, in this pipeline's shape, is recorded in
     * history under the target's prompt, prompt run, hashes and cache entry, with the escalation note as the
     * history row's reasoning, and the record's result names the target's prompt with that prompt run and
     * hash, so write-back's `$run` provenance describes one run. It is not written to this pipeline's Dedup
     * Cache, which holds only answers the decision model gave with confidence; the target caches its own answers.
     *
     * The target validated its answer against its own constraints only, and those may be looser than this
     * pipeline's (a wider enum, or none). So the answer, in this pipeline's shape, is validated again against
     * this pipeline's own output constraints, with each output's OnViolation policy, exactly as a decision's
     * answer is: `fail` fails the record with both reasons, `null` and `coerce-to-other` apply. A value
     * outside the Decision pipeline's domain is never recorded or written back.
     *
     * The record paid for two model calls, and `MJ: Feature Values` is what links a prompt run to the process
     * run. So before the answer's row, one more history row records the superseded decision: its prompt run,
     * prompt, hashes and confidence, with no values (the low-confidence answer is never recorded as a value)
     * and a reasoning that says it was superseded. It is written once per decision call: a key group's other
     * records get only the answer's row.
     */
    private async finalizeEscalated(
        sample: ComputedSample,
        decision: FeaturePipelineComputeSuccess,
        outcome: EscalationOutcome | undefined,
        context: RecordProcessorContext,
        run: PipelineRunState
    ): Promise<FinalizedSample> {
        const record = sample.Sample;
        const decisionRunID = decision.AIPromptRunID;
        if (!outcome) {
            const message = `Escalation to Feature Pipeline '${this.spec?.Escalation?.PipelineID}' returned no outcome`;
            return { Result: { Status: 'Failed', ErrorMessage: message, AIPromptRunID: decisionRunID } };
        }
        if ('ErrorMessage' in outcome) {
            return { Result: { Status: 'Failed', ErrorMessage: outcome.ErrorMessage, AIPromptRunID: outcome.AIPromptRunID || decisionRunID, ParameterFidelity: outcome.ParameterFidelity } };
        }
        const checked = await this.validateOutputs(this.spec?.Outputs ?? [], this.projectEscalatedPayload(outcome), record, context);
        if (!checked.valid) {
            const reason = `its answer is outside this Decision pipeline's own constraints: ${checked.errorMessage ?? 'Constraint violation'}`;
            const message = DescribeEscalationFailure(outcome.EscalationReason, outcome.PipelineName, reason);
            return { Result: { Status: 'Failed', FailureKind: 'RejectedInvalid', ErrorMessage: message, AIPromptRunID: outcome.AIPromptRunID || decisionRunID, ParameterFidelity: outcome.ParameterFidelity } };
        }
        // The escalated answer is recorded under this pipeline's outputs, so it is held to their confidence floors too
        const floored = this.ApplyConfidenceFloors(checked.payload);
        if ('Rejected' in floored) {
            const failure = InferProcessor.BelowConfidenceFailure(floored.Rejected, outcome.AIPromptRunID || decisionRunID, outcome.ParameterFidelity);
            return { Result: { ...failure, ErrorMessage: DescribeEscalationFailure(outcome.EscalationReason, outcome.PipelineName, failure.ErrorMessage || '') } };
        }
        const payload = floored.Payload;
        try {
            await this.recordSupersededDecision(sample, decision, outcome, context, run);
        } catch (e) {
            const message = this.FeatureValueWriteFailure(e, record);
            return { Result: { Status: 'Failed', ErrorMessage: message, AIPromptRunID: outcome.AIPromptRunID || decisionRunID, ParameterFidelity: outcome.ParameterFidelity } };
        }
        // The answer is keyed under the target's pin and its input hash: the target computed it
        const featureValues: GroupFeatureValues = {
            Context: context,
            Payload: payload,
            Reasoning: outcome.Note,
            PromptID: outcome.PromptID,
            ConstraintHash: outcome.ConstraintHash,
            AIPromptRunID: outcome.AIPromptRunID,
            FeatureValueCacheID: outcome.FeatureValueCacheID,
            InputHash: outcome.InputHash,
            Pin: outcome.Pin,
        };
        const result = await this.WithFeatureValues({
            Status: 'Succeeded',
            ResultPayload: payload,
            PromptID: outcome.PromptID,
            AIPromptRunID: outcome.AIPromptRunID,
            PromptVersionHash: outcome.PromptVersionHash,
            FeatureValueCacheID: outcome.FeatureValueCacheID,
            ParameterFidelity: outcome.ParameterFidelity,
        }, { ...featureValues, Record: record });
        return { Result: result, FeatureValues: result.Status === 'Succeeded' ? featureValues : undefined };
    }

    /**
     * Writes the Feature Values row of a decision an escalation superseded: the decision model's prompt run and
     * confidence under this pipeline's prompt and hashes, no values, and a reasoning saying it was superseded.
     * Nothing is written when the decision has no prompt run to link.
     * @throws Error when the row cannot be written (the caller fails the record).
     */
    private async recordSupersededDecision(
        sample: ComputedSample,
        decision: FeaturePipelineComputeSuccess,
        outcome: EscalatedAnswer,
        context: RecordProcessorContext,
        run: PipelineRunState
    ): Promise<void> {
        if (!decision.AIPromptRunID) {
            return;
        }
        // On a dry run UpsertFeatureValues writes nothing, so this row is not written either
        await this.UpsertFeatureValues({
            Record: sample.Sample,
            Context: context,
            Payload: null,
            OmitValues: true,
            Reasoning: outcome.SupersededNote,
            PromptID: run.Prompt.ID,
            ConstraintHash: run.ConstraintHash,
            AIPromptRunID: decision.AIPromptRunID,
            InputHash: sample.Group.keyInfo?.KeyHash || null,
            Pin: run.Pin,
            ...(decision.Confidence ? { OutputConfidence: decision.Confidence } : {}),
        });
    }

    /**
     * The escalated payload in this pipeline's shape: the target's validated payload, with each output's
     * value also placed at this pipeline's Ref for it, so write-back and history (which read this
     * pipeline's Refs) find the escalated values. When both pipelines use the same Refs, it is the target's
     * payload as is.
     */
    private projectEscalatedPayload(outcome: EscalatedAnswer): unknown {
        let projected: unknown = isPlainRecord(outcome.Payload) ? structuredClone(outcome.Payload) : outcome.Payload;
        for (const output of this.spec?.Outputs ?? []) {
            const source = FindOutputByName(outcome.TargetOutputs, output.Name);
            if (!source || source.Ref === output.Ref) {
                continue;
            }
            const value = ResolveMappingRef(source.Ref, { $: outcome.Payload });
            if (output.Ref === '$') {
                projected = value;
            } else if (output.Ref.startsWith('$.')) {
                const target: Record<string, unknown> = isPlainRecord(projected) ? projected : {};
                SetNestedValue(target, output.Ref.substring(2), value);
                projected = target;
            }
        }
        return projected;
    }

    /**
     * Computes a deterministic SHA-256 hash representing the prompt version and constraint instructions.
     * A pipeline type other than `LLM` is part of the hash, so switching a pipeline's type never serves
     * the old type's cached values. An LLM pipeline's hash is unchanged by the type's introduction.
     * So are the `Escalation` settings: the floor decides which decision answers are confident enough to
     * keep, so changing it (or the target) invalidates the answers cached under the old settings. A
     * pipeline without `Escalation` keeps its hash.
     */
    protected computePromptVersionHash(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec, resolved?: Map<string, ResolvedConstraint | null>): string {
        return createHash('sha256').update(this.promptVersionHashBasis(prompt, spec, resolved)).digest('hex');
    }

    /**
     * The text {@link computePromptVersionHash} hashes: the prompt's text, outputs, constraint block (rendered with the
     * run's resolved constraints, so a changed lookup taxonomy is a new prompt version) and suffixes.
     */
    private promptVersionHashBasis(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec, resolved?: Map<string, ResolvedConstraint | null>): string {
        const promptText = prompt.TemplateText ?? prompt.Description ?? prompt.Name ?? '';
        const outputsStr = spec?.Outputs ? JSON.stringify(spec.Outputs) : '';
        const constraintBlock = spec?.Outputs ? RenderConstraintBlock(spec.Outputs, resolved) : '';
        return `${prompt.ID}::${promptText}::${outputsStr}::${constraintBlock}${this.pipelineTypeHashSuffix(spec)}${this.escalationHashSuffix(spec)}${this.userMessageHashSuffix(spec)}`;
    }

    /**
     * The user-turn option's part of the prompt version hash: the record sent as its own JSON user message changes what
     * the model reads, so an answer cached without it is never served with it (or the other way round). Empty when the
     * option is off, so a pipeline that does not opt in keeps its hash and its Dedup Cache.
     */
    private userMessageHashSuffix(spec?: DataFeatureSpec): string {
        return spec?.Context?.RecordAsUserMessage === true ? '::RecordAsUserMessage' : '';
    }

    /** The pipeline type's part of the prompt version hash: empty when the type is absent or `LLM`. */
    private pipelineTypeHashSuffix(spec?: DataFeatureSpec): string {
        const pipelineType = spec?.PipelineType?.trim();
        if (!pipelineType || IsLLMPipelineType(pipelineType)) {
            return '';
        }
        return `::PipelineType=${pipelineType.toLowerCase()}`;
    }

    /** The escalation settings' part of the prompt version hash: empty without `Escalation`. */
    private escalationHashSuffix(spec?: DataFeatureSpec): string {
        const escalation = spec?.Escalation;
        if (!escalation) {
            return '';
        }
        const settings = { PipelineID: escalation.PipelineID?.trim().toLowerCase(), BelowConfidence: escalation.BelowConfidence };
        return `::Escalation=${Canonicalize(settings)}`;
    }

    /**
     * Computes a deterministic SHA-256 hash representing the output constraints and, when `resolved` is given, the
     * allowed values each output resolved from outside its spec (see {@link ResolvedAllowedValuesOf}), so an answer
     * cached under another taxonomy is never served. An output whose allowed values are all in its spec adds nothing,
     * so a pipeline whose constraints did not change keeps its hash and its Dedup Cache.
     */
    protected computeConstraintHash(spec?: DataFeatureSpec, resolved?: Map<string, ResolvedConstraint | null>): string {
        if (!spec?.Outputs || spec.Outputs.length === 0) {
            return 'no-constraints';
        }
        const constraints = spec.Outputs.map((o) => {
            const allowed = InferProcessor.ResolvedAllowedValuesOf(o, resolved?.get(o.Name));
            return allowed ? { name: o.Name, constraint: o.Constraint, allowed } : { name: o.Name, constraint: o.Constraint };
        });
        const canonical = Canonicalize(constraints);
        return createHash('sha256').update(canonical).digest('hex');
    }

    /**
     * Writes one record's Feature Values and returns its result: Failed (with the reason) when the write failed, else
     * the result with `Outcome` (Unchanged when every value already existed as it is), `PipelineVersion` and the
     * `PipelinePin` the values were written under (the run result reports it). On a dry
     * run nothing is written: the result has `DryRun: true` and no `Outcome`. The
     * record's Feature Value key ({@link FeatureValueKeyOf}) is kept only once the write succeeded.
     */
    protected async WithFeatureValues(result: RecordResult, featureValues: FeatureValueWriteParams): Promise<RecordResult> {
        let outcome: RecordFeatureValuesOutcome | null;
        try {
            outcome = await this.UpsertFeatureValues(featureValues);
        } catch (e) {
            return { ...result, Status: 'Failed', ErrorMessage: this.FeatureValueWriteFailure(e, featureValues.Record) };
        }
        this.featureValueKeys.set(featureValues.Record.RecordID, { Pin: featureValues.Pin, InputHash: featureValues.InputHash });
        const withheld = InferProcessor.WithheldOutputsOf(featureValues.Payload).map((w) => w.OutputName);
        const pinned: RecordResult = {
            ...result, PipelineVersion: this.PipelineVersion, PipelinePin: this.RunPinOf(featureValues.Pin),
            ...(withheld.length > 0 ? { BelowConfidenceOutputs: withheld } : {}),
        };
        if (featureValues.Context.DryRun === true) {
            // Nothing was written, so the result claims no Outcome; it says it is a dry run instead
            const warnings = this.dryRunRefusal ? [...(result.Warnings || []), `A real run would be refused: ${this.dryRunRefusal}`] : result.Warnings;
            return { ...pinned, DryRun: true, ...(warnings ? { Warnings: warnings } : {}) };
        }
        if (this.deferFeatureValues) {
            return pinned; // the write-back sets Outcome once it wrote them
        }
        const unchanged = outcome !== null && outcome.Upserted === 0 && outcome.Unchanged > 0;
        return { ...pinned, Outcome: unchanged ? 'Unchanged' : 'Upserted' };
    }

    /** The run-result pin of a Feature Value pin: this processor's pipeline version plus the pin's three key hashes. */
    protected RunPinOf(pin: FeaturePipelinePinData): FeaturePipelineRunPin {
        return { PipelineVersion: this.PipelineVersion, PromptVersionHash: pin.PromptVersionHash, AIModelID: pin.AIModelID, ParametersHash: pin.ParametersHash };
    }

    /**
     * The pin this run computes under, once {@link ResolvePin} resolved one (`Preflight` and every record go through
     * it), else null. The run result falls back to it when no record carried a pin (every record was skipped).
     */
    public CurrentRunPin(): FeaturePipelineRunPin | null {
        return this.resolvedPin ? this.RunPinOf(this.resolvedPin.Pin) : null;
    }

    /**
     * On a dry run, why the version registry would refuse the real run (the version it resolved in `Preflight`), else
     * null. The run result reports it, so the preview says that applying it would be refused even when every record
     * was skipped on its watermark.
     */
    public CurrentRunRefusal(): string | null {
        return this.dryRunRefusal;
    }

    /**
     * The message a record fails with when its Feature Values cannot be written; also logged.
     * @param e the caught error — `unknown` at a catch boundary, narrowed with `instanceof`
     */
    protected FeatureValueWriteFailure(e: unknown, record: RecordRef): string {
        const message = `Feature Value write failed: ${e instanceof Error ? e.message : String(e)}`;
        LogError(`InferProcessor: ${message} (record '${record.RecordID}')`);
        return message;
    }

    /**
     * Upserts a record's Feature Values (`MJ: Feature Values`) for all outputs, on their key: the record, feature,
     * pipeline version, the pin's prompt version hash, primary model and parameters hash, the input hash and source.
     * `outputConfidence` (from a driver that produces confidence) sets each output's confidence by output name, ahead
     * of the single `confidence`. `omitValues` writes every output's value as null, whatever the payload holds (a
     * superseded decision's row). Keeps, per record, each feature's value from before this processor first wrote it
     * (see {@link PreviousFeatureValues}).
     * When the processor defers to its write-back ({@link DeferFeatureValuesToWriteBack}) the write is queued for the
     * record's write-back unit instead, and null is returned.
     * A dry run neither writes nor queues anything, so a write-back unit has nothing to save for it either.
     * @returns What the upsert did; null when nothing is written now (a dry run, {@link WritesHistory} off, no outputs,
     * no pipeline or entity in the context, or the write is deferred).
     * @throws Error when a value cannot be written (the caller decides what fails).
     */
    protected async UpsertFeatureValues(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome | null> {
        if (params.Context.DryRun === true) {
            return null;
        }
        if (!this.WritesHistory || !this.spec?.Outputs || this.spec.Outputs.length === 0 || !params.Context.recordProcessID || !params.Context.entityID) {
            return null;
        }
        if (this.deferFeatureValues) {
            const queued = this.pendingFeatureValues.get(params.Record.RecordID) || [];
            queued.push(params);
            this.pendingFeatureValues.set(params.Record.RecordID, queued);
            return null;
        }
        return this.WriteFeatureValues(params);
    }

    /**
     * Writes one record's Feature Values now, on `params.Context.provider` (see {@link UpsertFeatureValues}), and keeps
     * the values they replaced. Callers check {@link WritesHistory}, the outputs and the context first.
     */
    protected async WriteFeatureValues(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome> {
        const outputs = this.spec?.Outputs || [];
        const recordProcessID = params.Context.recordProcessID;
        const entityID = params.Context.entityID;
        if (!recordProcessID || !entityID) {
            throw new Error('InferProcessor: a Feature Value write needs the run\'s pipeline and entity');
        }

        const outputsList: FeatureValueOutputItem[] = [];
        const sources = { $: params.Payload };
        // An output withheld below its confidence floor records the abstention: its Feature Value row on this key holds
        // no value (every value column null), so the record counts as answered (the watermark skip reads it) while
        // write-back clears a target value the pipeline wrote and keeps a person's (WithheldWriteBackTargets)
        const withheld = new Set(InferProcessor.WithheldOutputsOf(params.Payload).map((w) => w.OutputName));

        for (const output of outputs) {
            const val = params.OmitValues || withheld.has(output.Name) ? null : resolveMappingRef(output.Ref, sources);
            outputsList.push({
                FeatureName: output.Name,
                Value: val !== undefined ? val : null,
                Reasoning: params.Reasoning,
                // `??` because 0 is a valid confidence
                Confidence: params.OutputConfidence?.[output.Name] ?? params.Confidence,
            });
        }

        const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({
            RecordProcessID: recordProcessID,
            EntityID: entityID,
            RecordID: params.Record.RecordID,
            Outputs: outputsList,
            PromptID: params.PromptID,
            ConstraintHash: params.ConstraintHash,
            ProcessRunID: params.Context.processRunID,
            AIPromptRunID: params.AIPromptRunID,
            FeatureValueCacheID: params.FeatureValueCacheID,
            PipelineVersion: this.PipelineVersion,
            PromptVersionHash: params.Pin.PromptVersionHash,
            AIModelID: params.Pin.AIModelID,
            ParametersHash: params.Pin.ParametersHash,
            InputHash: params.InputHash,
            Source: 'Pipeline',
            // a superseded decision's row (no values) is history: it never takes the latest value back from the answer
            HistoryOnly: params.OmitValues === true,
            ContextUser: params.Context.contextUser,
            Provider: params.Context.provider,
        });
        this.KeepPreviousValues(params.Record.RecordID, outcome.Previous);
        return outcome;
    }

    /**
     * Keeps a record's pre-run values: the value captured by the record's first write in this batch, per feature. A
     * later write in the same batch (an escalated answer after its superseded decision's row) would capture this run's
     * own row.
     */
    protected KeepPreviousValues(recordID: string, previous: Record<string, TypedFeatureValue | null>): void {
        const kept = this.previousFeatureValues.get(recordID) || {};
        for (const [featureName, value] of Object.entries(previous)) {
            if (!(featureName in kept)) {
                kept[featureName] = value;
            }
        }
        this.previousFeatureValues.set(recordID, kept);
    }

    /**
     * Computes the watermark basis hash for Checksum strategy: SHA-256 over canonical
     * { promptData, promptVersionHash, aiModelID, parametersHash, specHash } — the record's prompt data and the pin.
     */
    public async ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string> {
        await this.ensureRecordsLoaded([record], context);
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        const pin = prompt ? await this.ResolvePin(prompt as MJAIPromptEntityExtended, context) : null;
        const promptData = await this.buildPromptData(record, context);
        return ComputeContentHashAsync({
            promptData,
            promptVersionHash: pin?.PromptVersionHash || '',
            aiModelID: pin?.AIModelID || null,
            parametersHash: pin?.ParametersHash || null,
            specHash: pin?.SpecHash || null,
        });
    }

    // -------------------------------------------------------------------------------------------------
    // Feature Pipeline driver (resolved from MJ: Feature Pipeline Types by DataFeatureSpec.PipelineType)
    // -------------------------------------------------------------------------------------------------

    /**
     * Resolves the driver for this pipeline's type, once per processor instance.
     *
     * The type is `DataFeatureSpec.PipelineType`, or `LLM` when absent. It is matched by name
     * (case-insensitive, trimmed) against the `MJ: Feature Pipeline Types` catalog cached by
     * `KnowledgeHubMetadataEngine`, and its `DriverClass` is created through the ClassFactory. `LLM`
     * resolves to {@link LLMFeaturePipelineDriver} when the catalog has no `LLM` row, or cannot be read,
     * so a database without the seed row keeps working. The driver's `ValidateOutputs` then runs once.
     *
     * @throws Error when the type is not in the catalog (and is not `LLM`), is not Active, names a
     * DriverClass that is not registered, or cannot produce every output (naming each one).
     */
    protected async ResolveDriver(context: RecordProcessorContext): Promise<BaseFeaturePipelineDriver> {
        this.driverResolution ??= this.resolveDriverFromCatalog(context);
        return this.driverResolution;
    }

    /** Runs {@link ResolveDriver}, turning a resolution error into a message the caller fails the record with. */
    private async resolveDriverOrError(
        context: RecordProcessorContext
    ): Promise<{ Driver: BaseFeaturePipelineDriver } | { ErrorMessage: string }> {
        try {
            return { Driver: await this.ResolveDriver(context) };
        } catch (e) {
            return { ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    /** Finds the pipeline's type in the catalog, creates its driver, and checks it can produce every output. */
    private async resolveDriverFromCatalog(context: RecordProcessorContext): Promise<BaseFeaturePipelineDriver> {
        const typeName = this.spec?.PipelineType ?? LLM_PIPELINE_TYPE;
        const pipelineType = await this.findPipelineType(typeName, context);
        const driver = pipelineType ? this.createDriver(pipelineType) : this.createDriverWithoutCatalogRow(typeName);
        if (this.spec) {
            this.assertDriverProducesOutputs(driver, typeName, this.spec, context);
        }
        return driver;
    }

    /**
     * Looks the type up by name in the catalog. If the catalog cannot be read, `LLM` is treated as not
     * found (and so still resolves); any other type fails, because only the catalog names its driver.
     */
    private async findPipelineType(typeName: string, context: RecordProcessorContext): Promise<MJFeaturePipelineTypeEntity | undefined> {
        try {
            await KnowledgeHubMetadataEngine.Instance.Config(false, context.contextUser, context.provider);
            const wanted = typeName.trim().toLowerCase();
            return KnowledgeHubMetadataEngine.Instance.FeaturePipelineTypes.find((t) => t.Name?.trim().toLowerCase() === wanted);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            if (!IsLLMPipelineType(typeName)) {
                throw new Error(`Feature Pipeline type '${typeName}' could not be resolved: MJ: Feature Pipeline Types could not be read: ${reason}`);
            }
            LogError(`InferProcessor: MJ: Feature Pipeline Types could not be read (${reason}); running as LLM`);
            return undefined;
        }
    }

    /** The driver for a type with no catalog row: `LLM` still runs; any other name is an error. */
    private createDriverWithoutCatalogRow(typeName: string): BaseFeaturePipelineDriver {
        if (IsLLMPipelineType(typeName)) {
            return new LLMFeaturePipelineDriver();
        }
        throw new Error(`Feature Pipeline type '${typeName}' was not found in MJ: Feature Pipeline Types.`);
    }

    /** Creates an Active type's driver from its registered `DriverClass`. */
    private createDriver(pipelineType: MJFeaturePipelineTypeEntity): BaseFeaturePipelineDriver {
        if (pipelineType.Status !== 'Active') {
            throw new Error(`Feature Pipeline type '${pipelineType.Name}' is ${pipelineType.Status}; only an Active type can run.`);
        }
        const driverClass = pipelineType.DriverClass;
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseFeaturePipelineDriver>(BaseFeaturePipelineDriver, driverClass);
        if (!driver || driver.constructor === BaseFeaturePipelineDriver) {
            throw new Error(
                `Feature Pipeline type '${pipelineType.Name}' names DriverClass '${driverClass}', which is not registered ` +
                `with @RegisterClass(BaseFeaturePipelineDriver, '${driverClass}').`
            );
        }
        return driver;
    }

    /**
     * The value lists of the pipeline's own entity (`context.entityID`), for the output check and the
     * driver. Consults only that entity's fields, so a same-named field elsewhere is never read; undefined
     * when the run names no entity or the provider does not know it.
     */
    private buildFieldValuesLookup(context: RecordProcessorContext): FeaturePipelineFieldValueLookup | undefined {
        if (!context.entityID) {
            return undefined;
        }
        const provider = context.provider ?? Metadata.Provider; // global-provider-ok: last-resort fallback for a context built without its provider
        return typeof provider?.EntityByID === 'function' ? BuildEntityFieldValueLookup(provider.EntityByID(context.entityID)) : undefined;
    }

    /** Fails when the driver cannot produce one or more of the spec's outputs, naming every one. */
    private assertDriverProducesOutputs(
        driver: BaseFeaturePipelineDriver,
        typeName: string,
        spec: DataFeatureSpec,
        context: RecordProcessorContext
    ): void {
        const fieldValues = this.buildFieldValuesLookup(context);
        const messages = driver.ValidateOutputs(spec, fieldValues);
        if (messages.length > 0) {
            throw new Error(`Feature Pipeline type '${typeName}' cannot produce every output: ${messages.join(' ')}`);
        }
    }

    /** The driver's callbacks into this processor's overridable steps, so extensions keep working. */
    private buildComputeHooks(): FeaturePipelineComputeHooks {
        return {
            BuildPromptData: (record, ctx) => this.buildPromptData(record, ctx),
            BeforeBuildContext: (record, ctx) => this.beforeBuildContext(record, ctx),
            BeforePromptExecute: (params, record, ctx) => this.beforePromptExecute(params, record, ctx),
            AfterPromptExecute: (result, record, ctx) => this.afterPromptExecute(result, record, ctx),
            BuildUserMessage: (record) => this.BuildUserMessage(record),
        };
    }

    // -------------------------------------------------------------------------------------------------
    // Lifecycle Hooks (overridable by subclasses registered under DataFeatureSpec.ProcessorExtensionKey)
    // -------------------------------------------------------------------------------------------------

    /** Lifecycle hook called before prompt data context is constructed. */
    protected async beforeBuildContext(record: RecordRef, ctx: RecordProcessorContext): Promise<void> {}

    /** Lifecycle hook called immediately before ExecutePrompt is invoked. */
    protected async beforePromptExecute(params: AIPromptParams, record: RecordRef, ctx: RecordProcessorContext): Promise<void> {}

    /** Lifecycle hook called after prompt execution returns successfully. Defaults to returning result.result. */
    protected async afterPromptExecute(
        result: AIPromptRunResult<unknown>,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<unknown> {
        return result.result ?? {};
    }

    /**
     * Layer 2 output validation hook. Evaluates outputs against declared constraints, applies OnViolation
     * policies (fail, null, coerce-to-other), and builds the processed payload. `replacedOutputs` names
     * the outputs whose value a `null` or `coerce-to-other` policy replaced.
     */
    protected async validateOutputs(
        outputs: DataFeatureOutput[],
        rawResult: unknown,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<{ valid: boolean; payload?: unknown; errorMessage?: string; replacedOutputs?: string[] }> {
        if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
            return { valid: true, payload: InferProcessor.WithoutReservedKeys(rawResult) };
        }

        // The model's own answer never sets the reserved keys: only this check and the driver write them
        let payloadCopy: unknown = InferProcessor.WithoutReservedKeys(
            typeof rawResult === 'object' && rawResult !== null ? structuredClone(rawResult) : rawResult
        );
        const violations: Array<{ outputName: string; violationMessage: string; policy: ViolationPolicy }> = [];

        for (const output of outputs) {
            if (!output.Constraint) {
                continue;
            }

            const sources = { $: rawResult };
            const rawVal = resolveMappingRef(output.Ref, sources);

            const target = output.Target;
            const field = target.Mode === 'field'
                ? ctx.provider?.EntityByID(record.EntityID)?.Fields?.find(
                    (f) => f.Name.toLowerCase() === target.EntityFieldName.toLowerCase()
                )
                : undefined;

            // The resolved constraint carries the field's value list for an enum with FromFieldMetadata and a
            // lookup's allowed rows; an array output with an ItemRef is checked item by item
            const validation = OutputValidator.ValidateOutputItems(rawVal, output.Constraint, {
                targetFieldTSType: field?.TSType,
                resolved: (await this.ResolveConstraints(ctx)).get(output.Name) || undefined,
            });

            if (!validation.valid) {
                return {
                    valid: false,
                    errorMessage: `Constraint violation for '${output.Name}': ${validation.violationMessage}`,
                };
            }

            if (validation.violationPolicyApplied === 'null' || validation.violationPolicyApplied === 'coerce-to-other') {
                violations.push({
                    outputName: output.Name,
                    violationMessage: validation.violationMessage ?? 'Constraint violation',
                    policy: validation.violationPolicyApplied,
                });
            }

            if (validation.coerced || validation.value !== rawVal) {
                if (output.Ref === '$') {
                    payloadCopy = validation.value;
                } else if (typeof payloadCopy === 'object' && payloadCopy !== null && output.Ref.startsWith('$.')) {
                    const propPath = output.Ref.substring(2);
                    SetNestedValue(payloadCopy as Record<string, unknown>, propPath, validation.value);
                }
            }
        }

        if (typeof payloadCopy === 'object' && payloadCopy !== null && violations.length > 0) {
            (payloadCopy as Record<string, unknown>)._violations = violations;
        }

        return { valid: true, payload: payloadCopy, replacedOutputs: violations.map((v) => v.outputName) };
    }

    /**
     * The driver's per-output confidences, less those of outputs whose value the constraint check replaced:
     * a confidence belongs to the value the model gave, not to a null or 'Other' written in its place.
     * Undefined when none remain.
     */
    private confidenceOfKeptValues(
        confidence: Record<string, number> | undefined,
        replacedOutputs: string[] | undefined
    ): Record<string, number> | undefined {
        if (!confidence) {
            return undefined;
        }
        const replaced = new Set(replacedOutputs ?? []);
        const kept = Object.entries(confidence).filter(([outputName]) => !replaced.has(outputName));
        return kept.length > 0 ? Object.fromEntries(kept) : undefined;
    }

    /**
     * The payload key listing the outputs withheld below their confidence floor ({@link BelowConfidenceOutput}[]), so
     * the Dedup Cache stores the decision with the outputs and a hit replays it. Reserved, like `_violations`.
     */
    public static readonly BELOW_CONFIDENCE_KEY = '_belowConfidence';

    /**
     * Applies each output's confidence floor (`MinConfidence` / `OnLowConfidence`) to a validated payload. The
     * confidences are the ones the record's Feature Values carry ({@link RecordedAnnotations}): the driver's, else the
     * answer's at each ConfidenceRef; an output the constraint check replaced has none, so it is below any floor. Any
     * below-floor output with policy `fail` rejects the answer. Otherwise each below-floor output (policy `null`) is
     * withheld: its value in the payload becomes null and the payload names it under {@link BELOW_CONFIDENCE_KEY}, so
     * its Feature Value records the abstention (no value) and write-back clears a target value the pipeline wrote, keeping
     * a person's ({@link WithheldWriteBackTargets}).
     * @param payload - the validated payload; `unknown` on purpose, a model's answer of any shape
     */
    protected ApplyConfidenceFloors(payload: unknown): { Payload: unknown } | { Rejected: BelowConfidenceOutput[] } {
        const below = ConfidenceFloor.FindBelow(this.spec?.Outputs || [], this.RecordedAnnotations(payload).OutputConfidence);
        if (below.length === 0) {
            return { Payload: payload };
        }
        const rejecting = below.filter((b) => b.Policy === 'fail');
        if (rejecting.length > 0) {
            return { Rejected: rejecting };
        }
        let withheld: Record<string, unknown> = isPlainRecord(payload) ? structuredClone(payload) : {};
        for (const b of below) {
            const ref = FindOutputByName(this.spec?.Outputs || [], b.OutputName)?.Ref;
            if (ref === '$') {
                withheld = {}; // the whole answer is the withheld output
            } else if (ref?.startsWith('$.')) {
                SetNestedValue(withheld, ref.substring(2), null);
            }
        }
        return { Payload: { ...withheld, [InferProcessor.BELOW_CONFIDENCE_KEY]: below } };
    }

    /**
     * The failed result of an answer rejected by a `fail` confidence floor: `FailureKind` `BelowConfidence`, naming each
     * output with its confidence and floor.
     */
    protected static BelowConfidenceFailure(rejected: BelowConfidenceOutput[], aiPromptRunID: string | undefined,
        parameterFidelity: RecordResult['ParameterFidelity']): RecordResult {
        const detail = rejected.map((b) => `'${b.OutputName}' confidence ${b.Confidence === null ? 'missing' : b.Confidence} < ${b.MinConfidence}`);
        return {
            Status: 'Failed', FailureKind: 'BelowConfidence', BelowConfidenceOutputs: rejected.map((b) => b.OutputName),
            ErrorMessage: `Answer below its confidence floor: ${detail.join('; ')}`, AIPromptRunID: aiPromptRunID, ParameterFidelity: parameterFidelity,
        };
    }

    /**
     * The outputs a payload withheld below their confidence floor ({@link BELOW_CONFIDENCE_KEY}); empty when none.
     * @param payload - a validated or cached payload; `unknown` on purpose, a model's answer of any shape
     */
    public static WithheldOutputsOf(payload: unknown): BelowConfidenceOutput[] {
        const stored = isPlainRecord(payload) ? payload[InferProcessor.BELOW_CONFIDENCE_KEY] : undefined;
        if (!Array.isArray(stored)) {
            return [];
        }
        return stored.flatMap((v: unknown): BelowConfidenceOutput[] => {
            if (!isPlainRecord(v) || typeof v.OutputName !== 'string' || typeof v.MinConfidence !== 'number' || (v.Policy !== 'null' && v.Policy !== 'fail')) {
                return [];
            }
            return [{ OutputName: v.OutputName, Confidence: typeof v.Confidence === 'number' ? v.Confidence : null, MinConfidence: v.MinConfidence, Policy: v.Policy }];
        });
    }

    /**
     * The write-back targets a successful result withheld: the field of each withheld output with a field target (mapped
     * to null through the human-value guard), and the child entity of each one with a child target (its mapping skipped). Undefined when the result withheld nothing.
     */
    public WithheldWriteBackTargets(result: RecordResult): WithheldWriteBackTargets | undefined {
        const names = result.Status === 'Succeeded' ? result.BelowConfidenceOutputs || [] : [];
        if (names.length === 0) {
            return undefined;
        }
        const outputs = names.flatMap((n) => FindOutputByName(this.spec?.Outputs || [], n) || []);
        return {
            Fields: outputs.flatMap((o) => (o.Target.Mode === 'field' ? [o.Target.EntityFieldName] : [])),
            ChildEntities: outputs.flatMap((o) => (o.Target.Mode === 'child' ? [o.Target.EntityName] : [])),
        };
    }

    /**
     * The model's reasoning ({@link ModelAnswer.Reasoning}: a "reasoning" key in any case, empty or whitespace-only
     * being none); undefined when capture is off.
     * @param rawResult - the driver's raw result; `unknown` on purpose, a model's parsed JSON answer of any shape
     */
    public static ExtractReasoning(rawResult: unknown, capture: boolean): string | undefined {
        return capture ? ModelAnswer.Reasoning(rawResult) : undefined;
    }

    /** Whether the pipeline records the model's reasoning (`CaptureReasoning`, on unless the spec turns it off). */
    private get captureReasoning(): boolean {
        return this.spec?.CaptureReasoning !== false;
    }

    /**
     * Per-output confidences read at each output's ConfidenceRef, for values in [0, 1].
     * @param result - a raw or validated result; `unknown` on purpose, a model's parsed JSON answer of any shape
     */
    private confidenceFromRefs(result: unknown): Record<string, number> | undefined {
        const out: Record<string, number> = {};
        for (const o of this.spec?.Outputs || []) {
            if (!o.ConfidenceRef) {
                continue;
            }
            const v = ResolveMappingRef(o.ConfidenceRef, { $: result });
            if (typeof v === 'number' && v >= 0 && v <= 1) {
                out[o.Name] = v;
            }
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }

    /**
     * The payload key holding the driver's own per-output confidences (a Decision driver's), so the Dedup Cache stores
     * them with the outputs and a hit replays them. Reserved, like `_violations`.
     */
    public static readonly DRIVER_CONFIDENCE_KEY = '_confidence';

    /**
     * The payload with the driver's confidences under {@link DRIVER_CONFIDENCE_KEY}; unchanged when there are none or
     * the payload is not an object (then no output can carry a driver confidence on a hit either, so none is recorded).
     * @param payload - the validated payload; `unknown` on purpose, a model's answer of any shape
     */
    protected static WithDriverConfidence(payload: unknown, driverConfidence: Record<string, number> | undefined): unknown {
        if (!driverConfidence || !isPlainRecord(payload)) {
            return payload;
        }
        return { ...payload, [InferProcessor.DRIVER_CONFIDENCE_KEY]: driverConfidence };
    }

    /**
     * What a record's Feature Values carry besides their values: the model's reasoning and each output's confidence,
     * read from the payload the Dedup Cache stores for the record's key. A miss (its sample and every other record of
     * its key group) and every later hit of the key call this with that same payload, so a re-run of an unchanged key
     * records exactly what the first run recorded (Unchanged). The driver's own confidence
     * ({@link DRIVER_CONFIDENCE_KEY}) wins over the one the answer states at a ConfidenceRef; an output the constraint
     * check replaced (the payload's `_violations`, see {@link validateOutputs}) gets none. Reasoning is none when the
     * pipeline does not capture it.
     * @param payload - the validated or cached payload; `unknown` on purpose, a model's answer of any shape
     */
    protected RecordedAnnotations(payload: unknown): Pick<FeatureValueWriteParams, 'Reasoning' | 'OutputConfidence'> {
        const fields: Record<string, unknown> = isPlainRecord(payload) ? payload : {};
        const violations = Array.isArray(fields._violations) ? fields._violations : [];
        const replaced = violations.flatMap((v) => isPlainRecord(v) && typeof v.outputName === 'string' ? [v.outputName] : []);
        const confidence = this.confidenceOfKeptValues(
            { ...(this.confidenceFromRefs(payload) || {}), ...InferProcessor.DriverConfidenceOf(fields) },
            replaced
        );
        return {
            Reasoning: InferProcessor.ExtractReasoning(payload, this.captureReasoning) || null,
            ...(confidence ? { OutputConfidence: confidence } : {}),
        };
    }

    /**
     * The allowed values an output resolved from outside its spec: a lookup's loaded rows, or an enum's values read
     * from field metadata. Undefined when there are none or they are the spec's own enum `Values` (already hashed).
     */
    protected static ResolvedAllowedValuesOf(output: DataFeatureOutput, resolved: ResolvedConstraint | null | undefined): string[] | undefined {
        const allowed = resolved?.AllowedValues;
        if (!allowed || allowed.length === 0) {
            return undefined;
        }
        const c = output.Constraint;
        const external = c?.Type === 'lookup' || (c?.Type === 'enum' && c.FromFieldMetadata === true);
        return external ? allowed : undefined;
    }

    /** The driver confidences a payload stores under {@link DRIVER_CONFIDENCE_KEY} (numbers in [0, 1] only). */
    protected static DriverConfidenceOf(fields: Record<string, unknown>): Record<string, number> {
        const stored = fields[InferProcessor.DRIVER_CONFIDENCE_KEY];
        if (!isPlainRecord(stored)) {
            return {};
        }
        return Object.fromEntries(Object.entries(stored).flatMap(([name, v]) => (typeof v === 'number' && v >= 0 && v <= 1 ? [[name, v]] : [])));
    }

    /**
     * The payload keys this processor reserves: `_violations` (the outputs the constraint check replaced, see
     * {@link validateOutputs}), {@link DRIVER_CONFIDENCE_KEY} and {@link BELOW_CONFIDENCE_KEY}. All three ride in the Dedup Cache's stored payload and
     * in the result payload, so a write-back that maps the whole payload (`$`) carries them too.
     */
    public static readonly RESERVED_PAYLOAD_KEYS: readonly string[] = ['_violations', InferProcessor.DRIVER_CONFIDENCE_KEY, InferProcessor.BELOW_CONFIDENCE_KEY];

    /**
     * A model's answer without the reserved keys ({@link RESERVED_PAYLOAD_KEYS}), so an answer cannot claim a driver
     * confidence or a replaced output. A non-object answer is returned as it is.
     * @param answer - the model's parsed answer; `unknown` on purpose, JSON of any shape
     */
    protected static WithoutReservedKeys(answer: unknown): unknown {
        if (!isPlainRecord(answer)) {
            return answer;
        }
        return Object.fromEntries(Object.entries(answer).filter(([key]) => !InferProcessor.RESERVED_PAYLOAD_KEYS.includes(key)));
    }

    /** Lifecycle hook to resolve a dedup cache key for this record. Default returns null (computed by cache service). */
    protected async resolveCacheKey(record: RecordRef, spec: DataFeatureSpec | undefined, ctx: RecordProcessorContext): Promise<string | null> {
        return null;
    }

    /** Lifecycle hook called before write-back is executed on this record. */
    public async beforeWriteBack(  // case-violation-ok-legacy-back-compat: a subclass overrides this; a stub preserves CALLING the old name but not OVERRIDING it, and WriteBackProcessor also probes for it by string
        mapping: OutputMappingConfig | undefined,
        result: unknown,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<void> {}

    // -------------------------------------------------------------------------------------------------
    // Context Construction & Helpers
    // -------------------------------------------------------------------------------------------------

    /**
     * Creates the parser that renders the spec's context Entity Document for a record. The rendered text goes to the
     * model as plain text, so the parser renders without HTML escaping (`Affineur & Owner`, not `Affineur &amp; Owner`).
     * @param provider the run's provider, which resolves the document's entities; the parser's default when omitted
     */
    protected CreateContextDocumentParser(provider?: IMetadataProvider): EntityDocumentTemplateParser {
        const parser = EntityDocumentTemplateParser.CreateInstance();
        if (provider) {
            parser.ProviderOverride = provider;
        }
        return parser;
    }

    /**
     * Builds the data object passed to the prompt.
     * Incorporates spec.Context (EntityDocumentID rendering, QueryID parameterized execution, Field filtering),
     * input mapping, and Layer-1 constraint instructions.
     */
    protected async buildPromptData(record: RecordRef, ctx?: RecordProcessorContext): Promise<Record<string, unknown>> {
        let recordData = this.recordToPlain(record);

        // Context.Fields projection: filter record fields if explicit fields are listed
        if (this.spec?.Context?.Fields && this.spec.Context.Fields.length > 0) {
            const allowed = new Set(this.spec.Context.Fields.map((f) => f.toLowerCase()));
            const filtered: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(recordData)) {
                if (allowed.has(key.toLowerCase()) || key === 'ID' || key === 'RecordID' || key === 'EntityID') {
                    filtered[key] = val;
                }
            }
            recordData = filtered;
        }

        let promptData: Record<string, unknown>;
        const mappingToUse = this.inputMapping ?? this.spec?.Context?.InputMapping;

        if (!mappingToUse) {
            promptData = { record: recordData };
        } else {
            const mapped = resolveValueMapping(mappingToUse, { record: recordData });
            promptData = mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : { record: recordData };
        }

        // EntityDocument context rendering
        if (this.spec?.Context?.EntityDocumentID && ctx) {
            try {
                await EntityDocumentCache.Instance.Refresh(false, ctx.contextUser);
                const doc = EntityDocumentCache.Instance.GetDocument(
                    this.spec.Context.EntityDocumentID
                );
                if (doc) {
                    const parser = this.CreateContextDocumentParser(ctx.provider);
                    const templateText = await parser.resolveDocumentTemplateText(doc, ctx.contextUser);
                    if (templateText && templateText.trim().length > 0) {
                        const rendered = await parser.Parse(templateText, record.EntityID, recordData, ctx.contextUser);
                        promptData.context = rendered;
                        promptData.RenderedContext = rendered;
                        promptData.document = rendered;
                    }
                }
            } catch (e) {
                LogError(`InferProcessor: failed to render EntityDocument '${this.spec.Context.EntityDocumentID}': ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // Query context execution
        if (this.spec?.Context?.QueryID && ctx) {
            try {
                const rq = new RunQuery();
                const queryParams: Record<string, unknown> = {};
                if (this.spec.Context.QueryParams) {
                    for (const [pName, pRef] of Object.entries(this.spec.Context.QueryParams)) {
                        queryParams[pName] = resolveMappingRef(pRef, { record: recordData, $: recordData });
                    }
                }
                const qResult = await rq.RunQuery(
                    { QueryID: this.spec.Context.QueryID, Parameters: queryParams },
                    ctx.contextUser
                );
                if (qResult && qResult.Success) {
                    promptData.queryResult = qResult.Results;
                    if (!promptData.context) {
                        promptData.context = qResult.Results;
                    }
                } else {
                    LogError(`InferProcessor: RunQuery '${this.spec.Context.QueryID}' failed: ${qResult?.ErrorMessage ?? 'unknown error'}`);
                }
            } catch (e) {
                LogError(`InferProcessor: failed executing Query '${this.spec.Context.QueryID}': ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // Layer 1: Inject constraint block if feature spec declares outputs
        if (this.spec?.Outputs && this.spec.Outputs.length > 0) {
            const constraintBlock = RenderConstraintBlock(this.spec.Outputs, ctx ? await this.ResolveConstraints(ctx) : undefined);
            if (constraintBlock && constraintBlock.trim().length > 0) {
                promptData.constraints = constraintBlock;
                promptData.ConstraintBlock = constraintBlock;
            }
        }

        return promptData;
    }

    /**
     * The prompt's user turn: the record's `Context.Fields` values as one JSON object, in the spec's field order (field
     * names matched case-insensitively; a field the record lacks is null). Opt-in: null (the prompt keeps the runner's
     * default user turn, as before the option existed) unless the spec sets `Context.RecordAsUserMessage: true`. JSON-encoding fences each value: a value cannot close its string
     * or add a key, whatever text it holds (an instruction, a closing tag, a quote). Record IDs are never included, so
     * the turn depends only on the values the cache key and input hash also read.
     */
    protected async BuildUserMessage(record: RecordRef): Promise<string | null> {
        const fields = this.spec?.Context?.Fields || [];
        if (this.spec?.Context?.RecordAsUserMessage !== true || fields.length === 0) {
            return null;
        }
        const data = this.recordToPlain(record);
        const byLowerName = new Map(Object.keys(data).map((k) => [k.toLowerCase(), k]));
        const values: Record<string, unknown> = {};
        for (const field of fields) {
            const key = byLowerName.get(field.toLowerCase());
            values[field] = key === undefined || data[key] === undefined ? null : data[key];
        }
        return JSON.stringify(values);
    }

    /** Extracts a plain field map from the record (BaseEntity → GetAll(), plain object → as-is). */
    protected recordToPlain(record: RecordRef): Record<string, unknown> {
        const r = record.Record as { GetAll?: () => Record<string, unknown> } | Record<string, unknown> | undefined;
        if (r && typeof (r as { GetAll?: unknown }).GetAll === 'function') {
            return (r as { GetAll: () => Record<string, unknown> }).GetAll();
        }
        if (r && typeof r === 'object') {
            return r as Record<string, unknown>;
        }
        return { RecordID: record.RecordID, EntityID: record.EntityID };
    }

    /**
     * Ensures that every record in the batch has its full field data loaded on `record.Record`.
     * If records only have primary keys (as yielded by source pagination), batch-fetches the
     * full records via RunView in a single query per entity.
     */
    protected async ensureRecordsLoaded(records: RecordRef[], context: RecordProcessorContext): Promise<void> {
        const requiredFields: string[] = [];
        if (this.spec?.Context?.Fields) {
            requiredFields.push(...this.spec.Context.Fields);
        }
        if (this.spec?.Caching?.KeyFields) {
            requiredFields.push(...this.spec.Caching.KeyFields);
        }

        const needsLoading = records.filter((r) => {
            if (!r.Record || typeof r.Record !== 'object') return true;
            if (typeof (r.Record as { GetAll?: unknown }).GetAll === 'function') return false;
            const rec = r.Record as Record<string, unknown>;
            // If explicit fields are required, check if any is missing
            if (requiredFields.length > 0) {
                const recKeysLower = new Set(Object.keys(rec).map((k) => k.toLowerCase()));
                const missing = requiredFields.some((f) => !recKeysLower.has(f.toLowerCase()));
                if (missing) return true;
                return false;
            }
            // If no explicit fields, check if record only contains primary/identity keys
            const nonPkKeys = Object.keys(rec).filter((k) => {
                const lower = k.toLowerCase();
                return lower !== 'id' && lower !== 'recordid' && lower !== 'entityid';
            });
            return nonPkKeys.length === 0;
        });

        if (needsLoading.length === 0) return;

        const candidateProvider = context.provider ?? Metadata.Provider; // global-provider-ok: fallback to global provider when not in context
        const provider = (candidateProvider && typeof candidateProvider.EntityByID === 'function')
            ? candidateProvider
            : undefined;
        if (!provider) return;

        const byEntity = new Map<string, RecordRef[]>();
        for (const r of needsLoading) {
            const list = byEntity.get(r.EntityID) ?? [];
            list.push(r);
            byEntity.set(r.EntityID, list);
        }

        for (const [entityID, entityRecords] of byEntity) {
            const entity = provider.EntityByID(entityID);
            if (!entity) continue;

            const pk = entity.FirstPrimaryKey?.Name ?? 'ID'; // first-pk-ok: batch lookup by PK for entity records
            const chunkSize = 500;
            for (let i = 0; i < entityRecords.length; i += chunkSize) {
                const chunk = entityRecords.slice(i, i + chunkSize);
                const ids = chunk.map((r) => `'${EscapeSQLString(r.RecordID)}'`).join(',');
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: entity.Name,
                    ExtraFilter: `[${pk}] IN (${ids})`,
                    ResultType: 'simple',
                    MaxRows: chunk.length,
                    BypassCache: true,
                }, context.contextUser);

                if (result.Success && result.Results) {
                    // Keyed by the normalised ID: the database returns a UUID in its own case (SQL Server: upper),
                    // which a caller-supplied RecordID (a scope's lowercase IDs) need not match
                    const rowMap = new Map<string, Record<string, unknown>>();
                    for (const row of result.Results as Record<string, unknown>[]) {
                        const key = row[pk];
                        // a row without its key value cannot be matched (String(undefined) would key it as "undefined")
                        if (key !== null && key !== undefined) {
                            rowMap.set(RecordIDs.Key(String(key)), row);
                        }
                    }
                    for (const r of chunk) {
                        const row = rowMap.get(RecordIDs.Key(r.RecordID));
                        if (row) {
                            r.Record = row;
                        }
                    }
                } else {
                    const errMsg = result.ErrorMessage || 'Failed to load records from entity view';
                    LogError(`[InferProcessor] ensureRecordsLoaded failed for entity '${entity.Name}': ${errMsg}`);
                    throw new Error(`[InferProcessor] Failed to load records for entity '${entity.Name}': ${errMsg}`);
                }
            }
        }
    }
}

/**
 * Sets a value at a dot-delimited path (e.g. 'a.b' or 'items[0].name') on an object,
 * mutating the object in-place and creating intermediate objects or arrays as needed.
 */
export function SetNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    if (!path) return;
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part || part === '__proto__' || part === 'constructor' || part === 'prototype') {
            return;
        }
        const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const name = arrayMatch[1];
            if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
                return;
            }
            const index = parseInt(arrayMatch[2], 10);
            if (!Array.isArray(current[name])) {
                current[name] = [];
            }
            const arr = current[name] as unknown[];
            if (!arr[index] || typeof arr[index] !== 'object') {
                arr[index] = Object.create(null);
            }
            current = arr[index] as Record<string, unknown>;
        } else {
            if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
                current[part] = Object.create(null);
            }
            current = current[part] as Record<string, unknown>;
        }
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart === '__proto__' || lastPart === 'constructor' || lastPart === 'prototype') {
        return;
    }
    const arrayMatch = lastPart.match(/^([^[]+)\[(\d+)\]$/);
    if (arrayMatch) {
        const name = arrayMatch[1];
        if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
            return;
        }
        const index = parseInt(arrayMatch[2], 10);
        if (!Array.isArray(current[name])) {
            current[name] = [];
        }
        (current[name] as unknown[])[index] = value;
    } else {
        current[lastPart] = value;
    }
}

/** @deprecated Use {@link SetNestedValue}. */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    return SetNestedValue(obj, path, value);
}

