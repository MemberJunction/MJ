/**
 * @fileoverview Infer processor — for each record, runs an AI Prompt over the record's data and
 * returns the structured result as the record's `ResultPayload`. Write-back is NOT done here: the
 * `WriteBackProcessor` wrapper (added by `RecordProcessExecutor` when an OutputMapping is set, or when any
 * output of the spec has no write target, so its Feature Values commit, preview and report an outcome there)
 * applies the Record Process's OutputMapping uniformly across Action / Agent / Infer work types.
 *
 * Supports DataFeatureSpec context (EntityDocumentID template rendering with __Parent context,
 * QueryID parameterized execution, Field projections), Layer-1 constraint injection, Layer-2
 * constraint validation with OnViolation policies, and lifecycle hooks (P1-6). A Decision pipeline
 * whose spec sets `Escalation` re-runs its below-floor records through an LLM pipeline
 * (see `FeaturePipelineEscalation`).
 *
 * @module @memberjunction/feature-pipelines-engine
 */

import { createHash } from 'node:crypto';
import { type EntityInfo, GetIndexRestrictedFieldNames, type IMetadataProvider, LogError, LogStatus, Metadata, OmitDeniedFieldKeys, RunQuery, RunView } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual, Canonicalize, ComputeContentHashAsync, EscapeSQLString, ResolveMappingRef, ResolveValueMapping, SafeJSONParse } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity, type MJFeaturePipelineTypeEntity, type MJRecordProcessEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams, type AIPromptRunResult, type MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    IRecordProcessor,
    ProcessorRunSummaryContext,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
    RecordIDs,
    WriteBackValuePreview,
} from '@memberjunction/record-set-processor-base';
import type {
    DeferredRecordWriteSource,
    HumanValueGuard,
    HumanValueGuardSource,
    OutputMappingConfig,
    WithheldTargetSource,
    WithheldWriteBackTargets,
} from '@memberjunction/record-set-processor';
import {
    DataFeatureSpec,
    DataFeatureOutput,
    FeatureValueCacheService,
    type ResolvedConstraint,
    LookupConstraintValues,
    ModelAnswer,
    OutputConstraintResolver,
    ValidateOutputItems,
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
    OutputTargets,
    FeaturePipelinePin,
    type FeaturePipelinePinData,
    FeaturePipelineVersionService,
    FeaturePipelineRunResults,
    type FeaturePipelineRecordResult,
    type FeaturePipelineRunPin,
    type RecordFeatureValuesOutcome,
    type TypedFeatureValue,
    ConfidenceFloor,
    type BelowConfidenceOutput,
    PromptTemplateContent,
    type PromptTemplateContentRow,
    type ValueConstraint,
} from '@memberjunction/feature-pipelines';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentCache, EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import { FeaturePipelineHumanValueGuard } from './FeaturePipelineHumanValueGuard';
import { EscalationTargetUnresolvableError, FeaturePipelineUnresolvableError } from './FeaturePipelineErrors';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeHooks,
    type FeaturePipelineComputeResult,
    type FeaturePipelineComputeSuccess,
} from '../drivers/BaseFeaturePipelineDriver';
import { LLMFeaturePipelineDriver } from '../drivers/LLMFeaturePipelineDriver';
import {
    DescribeEscalationFailure,
    FeaturePipelineEscalator,
    type BelowFloorOutput,
    type EscalatedAnswer,
    type EscalationOutcome,
    type FeatureValueKeyParts,
} from './FeaturePipelineEscalation';

/** On a dry run, a Feature Value that would be stored for an output with no write target. */
export interface FeatureValuePreview {
    FeatureName: string;
    Previous: unknown;
    Proposed: unknown;
}

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

/** What {@link InferProcessor.UpsertFeatureValues} writes for one record; the key parts (pin, input hash) are required. */
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
    Result: FeaturePipelineRecordResult;
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
export class InferProcessor implements IRecordProcessor, HumanValueGuardSource, DeferredRecordWriteSource, WithheldTargetSource {
    /** Default dry-run sample cap for Infer pipelines over a stored scope (every previewed record calls the model). */
    public readonly DefaultDryRunSampleSize = 25;

    /** An Infer run that completed with one or more failed records ends with status `Failed`. */
    public readonly FailRunOnRecordError = true;

    /** The driver resolution, started on first use and shared by every record this processor runs. */
    private driverResolution?: Promise<BaseFeaturePipelineDriver>;

    /** The escalation of below-floor decisions, created on first use when the spec has `Escalation`. */
    private _escalator?: FeaturePipelineEscalator;

    /** How many records this processor has escalated. */
    private escalatedRecordCount = 0;

    /** Whether this processor writes its records' `MJ: Feature Values` (off on a Decision pipeline's escalation target). */
    public WritesHistory = true;

    /** The pipeline version this run computes under (part of the Feature Value key); null until resolved. */
    protected PipelineVersion: number | null = null;

    /** The pin hash the run resolved {@link PipelineVersion} for; a record computed under another pin is not written under it. */
    private versionPinHash: string | null = null;

    /** Dry runs only: why the real run would be refused by the version registry; each record's result warns of it. */
    private dryRunRefusal: string | null = null;

    /** Each record's Feature Values before this batch first wrote them, by record ID then feature (one batch only). */
    private previousFeatureValues = new Map<string, Record<string, TypedFeatureValue | null>>();

    /** The pin and input hash each record of the current batch was written under, by record ID; same lifecycle. */
    private featureValueKeys = new Map<string, FeatureValueKeyParts>();

    /** What each record of the current dry-run batch would store for its outputs with no write target, by record ID; same lifecycle. */
    private featureValuePreviews = new Map<string, FeatureValuePreview[]>();

    /** The last pin resolved, and the inputs it was computed from (see {@link ResolvePin}). */
    private resolvedPin?: { Fingerprint: string; Pin: FeaturePipelinePinData };

    /** The prompt's template text in the database at the last {@link SyncPromptTemplateText}; what the pin hashes. */
    private promptTemplateText?: string;

    /** The template content read for a run (see {@link SyncPromptTemplateText}): reused while the run and template match. */
    private templateRead?: { ProcessRunID: string | undefined; TemplateID: string; Row: PromptTemplateContentRow | undefined };

    /** The run and template the template engine was last reloaded for, and whether a reload that did not help was logged. */
    private templateReload?: { ProcessRunID: string | undefined; TemplateID: string; Logged: boolean };

    /** Resolved constraints per output name, with lookup rows loaded; started once (a processor serves one run). */
    private resolvedConstraints?: Promise<Map<string, ResolvedConstraint | null>>;

    /** The map {@link ResolveConstraints} last produced, for the synchronous {@link ConstraintHash} getter. */
    private lastResolvedConstraints?: Map<string, ResolvedConstraint | null>;

    /** Whether Feature Value writes wait for the record's write-back unit ({@link DeferFeatureValuesToWriteBack}). */
    private deferFeatureValues = false;

    /** Each record's Feature Value writes waiting for its write-back, in order, by record ID (deferred mode only). */
    private pendingFeatureValues = new Map<string, FeatureValueWriteParams[]>();

    /**
     * @param promptID - The `MJ: AI Prompts` ID to run for each record.
     * @param inputMapping - Mapping shaping the data passed to the prompt; undefined for the default (`{ record }`).
     * @param spec - The DataFeatureSpec defining outputs, constraints, and caching policy; undefined when there is none.
     * @param outputMappingText - The Record Process's OutputMapping text, part of the spec hash (null when it has none).
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

    /** The hash that versions this pipeline's output constraints, including the allowed values the run resolved. */
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

    /** A record's Feature Values before this processor first wrote them in the current batch; undefined when it wrote none. */
    public PreviousFeatureValues(recordID: string): Readonly<Record<string, TypedFeatureValue | null>> | undefined {
        return this.previousFeatureValues.get(recordID);
    }

    /** The guard write-back uses to keep values a person entered; undefined when the run has no pipeline, entity or spec. */
    public CreateHumanValueGuard(record: RecordRef, context: RecordProcessorContext): HumanValueGuard | undefined {
        if (!context.RecordProcessID || !context.EntityID || !this.spec) {
            return undefined;
        }
        return new FeaturePipelineHumanValueGuard({
            RecordProcessID: context.RecordProcessID, EntityID: context.EntityID, Record: record, Context: context, Spec: this.spec,
            PreviousValues: () => this.PreviousFeatureValues(record.RecordID),
        });
    }

    /** Enriches the output mapping with `fieldLookups` from `spec.Outputs` and reports whether any output has no write target. */
    public PrepareOutputMapping(mapping: Record<string, unknown> | undefined): { OutputMapping?: Record<string, unknown>; HasUnmappedWrites?: boolean } {
        const outputMapping = mapping ? ({ ...mapping } as OutputMappingConfig) : undefined;
        if (outputMapping?.fields && this.spec?.Outputs) {
            for (const out of this.spec.Outputs) {
                if (out.Target && out.Target.Mode === 'field') {
                    const fieldName = out.Target.EntityFieldName;
                    if (outputMapping.fields[fieldName] && (out.Target.LookupMatchField || out.Target.OnLookupMiss)) {
                        outputMapping.fieldLookups = outputMapping.fieldLookups ? { ...outputMapping.fieldLookups } : {};
                        if (!outputMapping.fieldLookups[fieldName]) {
                            outputMapping.fieldLookups[fieldName] = {
                                matchField: out.Target.LookupMatchField ?? 'Name',
                                onLookupMiss: out.Target.OnLookupMiss ?? 'null',
                            };
                        }
                    }
                }
            }
        }
        return {
            OutputMapping: outputMapping as Record<string, unknown> | undefined,
            HasUnmappedWrites: this.spec?.Outputs?.some((o) => !OutputTargets.HasWriteTarget(o)) === true,
        };
    }

    /** Builds the Feature Pipeline run summary (and `WouldRefuse` on a dry run) from the run's counts and per-record results. */
    public BuildRunSummary(context: ProcessorRunSummaryContext): { ResultSummary?: unknown; WouldRefuse?: string } {
        return FeaturePipelineRunResults.Build(
            context.RecordProcessID || '',
            context.Counts,
            context.Results,
            context.Status,
            this.CurrentRunPin(),
            this.CurrentRunRefusal(),
            context.DryRun,
        );
    }

    /** Queues this processor's Feature Value writes for the write-back unit that wraps it ({@link WriteDeferredFeatureValues}). */
    public DeferFeatureValuesToWriteBack(): void {
        this.deferFeatureValues = true;
    }

    /** Generic `DeferredRecordWriteSource` hook delegating to {@link DeferFeatureValuesToWriteBack}. */
    public DeferRecordWritesToWriteBack(): void {
        this.DeferFeatureValuesToWriteBack();
    }

    /**
     * Saves a record's queued Feature Value writes on the write-back unit's `provider`; null when none were queued.
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

    /** Generic `DeferredRecordWriteSource` hook delegating to {@link WriteDeferredFeatureValues}. */
    public async WriteDeferredRecordValues(recordID: string, provider: IMetadataProvider): Promise<RecordFeatureValuesOutcome | null> {
        return this.WriteDeferredFeatureValues(recordID, provider);
    }

    /** Drops a record's queued Feature Value writes: its result failed, so it gets no write-back. */
    public DiscardDeferredFeatureValues(recordID: string): void {
        this.pendingFeatureValues.delete(recordID);
    }

    /** Generic `DeferredRecordWriteSource` hook delegating to {@link DiscardDeferredFeatureValues}. */
    public DiscardDeferredRecordValues(recordID: string): void {
        this.DiscardDeferredFeatureValues(recordID);
    }

    /** One queued write on the unit's provider; a failure names the record. */
    protected async WriteFeatureValuesOn(params: FeatureValueWriteParams, provider: IMetadataProvider): Promise<RecordFeatureValuesOutcome> {
        try {
            return await this.WriteFeatureValues({ ...params, Context: { ...params.Context, Provider: provider } });
        } catch (e) {
            throw new Error(`Feature Value write failed for record '${params.Record.RecordID}': ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
    }

    /** The pin and input hash a record's result was computed under in this batch; undefined when it did not succeed. */
    public FeatureValueKeyOf(recordID: string): FeatureValueKeyParts | undefined {
        return this.featureValueKeys.get(recordID);
    }

    /**
     * Run-level checks before the first record: the prompt template renders the constraint block, and the version
     * registry's run gate resolves the version the run writes under.
     * @throws Error when the prompt or driver cannot be resolved
     * @throws ConstraintBlockMissingError when the prompt template does not render the constraint block
     * @throws FeaturePipelineVersionRefusedError when the run may not write under the pipeline's current version
     */
    public async Preflight(context: RecordProcessorContext): Promise<void> {
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            throw new Error(run.ErrorMessage);
        }
        const missingBlock = ConstraintPromptTemplate.DescribeMissingBlock(this.spec, run.Prompt.Name, this.promptTemplateText ?? run.Prompt.TemplateText);
        if (missingBlock) {
            throw new ConstraintBlockMissingError(run.Prompt.Name, missingBlock);
        }
        if (!context.RecordProcessID) {
            return;
        }
        if (this.WritesHistory) {
            await this.ResolvePipelineVersion(context, context.RecordProcessID, run.Pin, run.PinHash);
        } else if (this.spec?.Activation) {
            // an escalation target registers no versions of its own; a gated one may still only compute a passed version
            await FeaturePipelineVersionService.Instance.AssertRunnable({
                RecordProcessID: context.RecordProcessID, Pin: run.Pin, Activation: this.spec.Activation,
                ContextUser: context.ContextUser, Provider: context.Provider,
            });
        }
    }

    /**
     * Keeps the version this run writes under, the pin hash it was resolved for and, on a dry run, why a real run would be refused.
     * @throws FeaturePipelineVersionRefusedError when the run may not write under the pipeline's current version
     */
    protected async ResolvePipelineVersion(context: RecordProcessorContext, recordProcessID: string, pin: FeaturePipelinePinData, pinHash: string): Promise<void> {
        const resolved = await FeaturePipelineVersionService.Instance.ResolveForRun({
            RecordProcessID: recordProcessID, Pin: pin, Activation: this.spec?.Activation,
            TriggeredBy: context.TriggeredBy, DryRun: context.DryRun, ContextUser: context.ContextUser, Provider: context.Provider,
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
    ): Promise<FeaturePipelineRecordResult> {
        const dry = context.DryRun === true;
        await this.ensureRecordsLoaded([record], context);
        const run = await this.resolveRunState(context);
        if ('ErrorMessage' in run) {
            return { Status: 'Failed', ErrorMessage: run.ErrorMessage };
        }
        const { Prompt: prompt, PromptVersionHash: promptVersionHash, ConstraintHash: constraintHash } = run;
        let keyInfo: CacheKeyResult | undefined;

        // P1-7c Dedup Cache lookup
        if (run.IsCacheable) {
            keyInfo =
                options?.keyInfo ??
                (await FeatureValueCacheService.Instance.ComputeCacheKey({
                    keyFields: this.spec?.Caching?.KeyFields,
                    recordData: this.recordToPlain(record),
                }));

            // BypassCache treats every key as a miss (an evaluation measures the model, not the cache)
            if (!options?.skipLookup && context.BypassCache !== true) {
                const cached = await FeatureValueCacheService.Instance.Lookup({
                    recordProcessID: context.RecordProcessID,
                    scope: this.spec?.Caching?.Scope,
                    promptID: prompt.ID,
                    promptVersionHash,
                    constraintHash,
                    aiModelID: run.Pin.AIModelID,
                    parametersHash: run.Pin.ParametersHash,
                    keyHash: keyInfo.keyHash,
                    // A dry run reads the cache without counting the hit
                    recordHit: !dry,
                    contextUser: context.ContextUser,
                    provider: context.Provider,
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
                        AIPromptRunID: cached.AIPromptRunID ?? undefined,
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
                        InputHash: keyInfo.keyHash,
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
     * Runs the driver on a key group's first record and notes the outputs below the escalation floor. An uncacheable
     * group gets a key from the context fields, used only as its Feature Values' input hash.
     */
    private async computeSample(group: CacheKeyGroup, context: RecordProcessorContext, run: PipelineRunState): Promise<ComputedSample> {
        const sample = group.records[0];
        group.keyInfo ??= await FeatureValueCacheService.Instance.ComputeCacheKey({
            keyFields: this.spec?.Context?.Fields,
            recordData: this.recordToPlain(sample),
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
    ): Promise<FeaturePipelineRecordResult> {
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
                ErrorMessage: validationOutcome.errorMessage ?? 'Constraint violation',
                AIPromptRunID: aiPromptRunID,
            };
        }

        // The payload carries the driver's own confidences, so the Dedup Cache stores them and a hit replays them
        // An output below its floor is withheld: the payload holds null for it and names it, so a cache hit replays that
        const payload = this.ApplyConfidenceFloors(InferProcessor.WithDriverConfidence(
            validationOutcome.payload,
            this.confidenceOfKeptValues(computed.Confidence, validationOutcome.replacedOutputs)
        ));
        const annotations = this.RecordedAnnotations(payload);
        let featureValueCacheID: string | undefined;

        // P1-7c Dedup Cache store (never on a dry run: it persists nothing)
        const warnings: string[] = [];
        if (run.IsCacheable && keyInfo && !dry) {
            try {
                const stored = await FeatureValueCacheService.Instance.Store({
                    recordProcessID: context.RecordProcessID,
                    scope: this.spec?.Caching?.Scope,
                    promptID: prompt.ID,
                    promptVersionHash,
                    constraintHash,
                    aiModelID: run.Pin.AIModelID,
                    parametersHash: run.Pin.ParametersHash,
                    keyHash: keyInfo.keyHash,
                    keyDisplay: keyInfo.keyDisplay,
                    keyJSON: keyInfo.keyJSON,
                    outputsJSON: JSON.stringify(payload),
                    reasoning: annotations.Reasoning || null,
                    aiPromptRunID: aiPromptRunID ?? null,
                    ttlSeconds: this.spec?.Caching?.TTLSeconds,
                    contextUser: context.ContextUser,
                    provider: context.Provider,
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
            InputHash: keyInfo?.keyHash || null,
            Pin: run.Pin,
        });
    }

    /**
     * Two-phase batch execution (P1-7c). Resolves distinct keys across the batch first,
     * checks the dedup cache in one batch query, executes LLM prompts ONCE per distinct key,
     * and fans results back across all matching rows.
     */
    public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, FeaturePipelineRecordResult>> {
        const dry = context.DryRun === true;
        this.ResetBatchState();
        await this.ensureRecordsLoaded(records, context);
        const results = new Map<string, FeaturePipelineRecordResult>();
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
                keyFields: this.spec.Caching.KeyFields,
                recordData,
            });
            let group = keyGroupMap.get(keyInfo.keyHash);
            if (!group) {
                group = { keyInfo, records: [] };
                keyGroupMap.set(keyInfo.keyHash, group);
            }
            group.records.push(record);
        }

        // Phase 2: Batch lookup existing cache entries for all distinct keys. BypassCache treats every key as a miss
        // (an evaluation measures the model, not the cache); a dry run reads the cache without counting the hits.
        const distinctKeyHashes = Array.from(keyGroupMap.keys());
        const cacheMap = context.BypassCache === true
            ? new Map<string, MJFeatureValueCacheEntity>()
            : await FeatureValueCacheService.Instance.BatchLookup({
                recordProcessID: context.RecordProcessID,
                scope: this.spec.Caching.Scope,
                promptID: prompt.ID,
                promptVersionHash,
                constraintHash,
                aiModelID: run.Pin.AIModelID,
                parametersHash: run.Pin.ParametersHash,
                keyHashes: distinctKeyHashes,
                recordHit: !dry,
                contextUser: context.ContextUser,
                provider: context.Provider,
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
                        AIPromptRunID: cached.AIPromptRunID ?? undefined,
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
    private failEvery(records: RecordRef[], errorMessage: string, results: Map<string, FeaturePipelineRecordResult>): Map<string, FeaturePipelineRecordResult> {
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
        await AIEngine.Instance.Config(false, context.ContextUser);
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

    /** Starts a batch: drops the previous batch's per-record state ({@link PreviousFeatureValues}, {@link FeatureValueKeyOf}). */
    protected ResetBatchState(): void {
        this.previousFeatureValues.clear();
        this.featureValuePreviews.clear();
        this.featureValueKeys.clear();
        this.pendingFeatureValues.clear();
    }

    /**
     * The pin this processor's prompt and spec give right now: prompt version hash, primary model, parameters hash and
     * spec hash. Resolved per record but re-hashed only when a fingerprint of its inputs (prompt text and parameters,
     * primary model, escalation target pin) changed, so an edited prompt takes effect on the next record.
     */
    public async ResolvePin(prompt: MJAIPromptEntityExtended, context: RecordProcessorContext): Promise<FeaturePipelinePinData> {
        await this.SyncPromptTemplateText(prompt, context);
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
     * F-FP-6: the pin hashes the template text that is in the database at run start, not the text the prompt loaded
     * when the process started, and the template engine is reloaded when its cache holds other text — so an edited
     * template changes the next run's pin and is what the next run renders, without a restart. The text is read once
     * per run (per `ProcessRunID` and template); a call without a `ProcessRunID` reads every time.
     */
    protected async SyncPromptTemplateText(prompt: MJAIPromptEntityExtended, context: RecordProcessorContext): Promise<void> {
        const templateID = prompt.TemplateID;
        if (!templateID) {
            this.promptTemplateText = undefined;
            return;
        }
        const memo = this.templateRead;
        if (memo && context.ProcessRunID !== undefined && memo.ProcessRunID === context.ProcessRunID && UUIDsEqual(memo.TemplateID, templateID)) {
            this.promptTemplateText = memo.Row?.TemplateText ?? '';
            return;
        }
        const row = await PromptTemplateContent.ReadCurrent(context.Provider, templateID, context.ContextUser);
        this.templateRead = { ProcessRunID: context.ProcessRunID, TemplateID: templateID, Row: row };
        this.promptTemplateText = row?.TemplateText ?? '';
        await this.syncTemplateEngine(templateID, row, context);
    }

    /**
     * Reloads the template engine when its cache holds other text than `row` — at most once per run and template, so
     * a cache that still differs after the reload (another load in flight, or equal-Priority rows the engine orders by
     * load order) is logged once instead of reloading on every record.
     */
    private async syncTemplateEngine(templateID: string, row: PromptTemplateContentRow | undefined, context: RecordProcessorContext): Promise<void> {
        const engine = TemplateEngineServer.Instance;
        await engine.Config(false, context.ContextUser);
        if (this.engineHoldsCurrentText(engine, templateID, row)) {
            return;
        }
        let reload = this.templateReload;
        if (!reload || reload.ProcessRunID !== context.ProcessRunID || !UUIDsEqual(reload.TemplateID, templateID)) {
            reload = { ProcessRunID: context.ProcessRunID, TemplateID: templateID, Logged: false };
            this.templateReload = reload;
            await engine.Config(true, context.ContextUser);
            if (this.engineHoldsCurrentText(engine, templateID, row)) {
                return;
            }
        }
        if (!reload.Logged) {
            reload.Logged = true;
            LogStatus(`InferProcessor: the template engine still holds other text for template ${templateID} after a reload; the pin is computed from the database text, and the engine is not reloaded again in this run.`);
        }
    }

    /**
     * True when the engine's cached rendered content for `templateID` has the text of `current` (no content in the
     * database ↔ no cached content). Text only, not the row ID: the engine breaks equal-Priority ties by load order.
     */
    private engineHoldsCurrentText(engine: TemplateEngineServer, templateID: string, current: PromptTemplateContentRow | undefined): boolean {
        const cached = engine.Templates.find((t) => UUIDsEqual(t.ID, templateID))?.GetHighestPriorityContent();
        if (!current || !cached) {
            return !current && !cached;
        }
        return (cached.TemplateText || '') === (current.TemplateText || '');
    }

    /**
     * The pin hash of this Decision pipeline's escalation target, which its spec hash covers; null when it does not
     * escalate, or the target is unusable as configured (each escalating record then fails with the reason).
     * @throws Error when the target cannot be loaded (hashing without it would make a spurious new version)
     */
    protected async ResolveEscalationTargetPinHash(context: RecordProcessorContext): Promise<string | null> {
        const escalator = this.escalator;
        if (!escalator || !context.EntityID) {
            return null;
        }
        let targetPin: FeaturePipelinePinData;
        try {
            targetPin = await escalator.ResolveTargetPin(context, context.EntityID);
        } catch (e) {
            if (e instanceof EscalationTargetUnresolvableError) {
                return null;
            }
            throw e;
        }
        return FeaturePipelinePin.ComputeHash(targetPin);
    }

    /** The pipeline's resolved output constraints, lookup rows included; loaded once per processor (a failed load too). */
    protected async ResolveConstraints(context: RecordProcessorContext): Promise<Map<string, ResolvedConstraint | null>> {
        this.resolvedConstraints ||= this.LoadResolvedConstraints(context);
        this.lastResolvedConstraints = await this.resolvedConstraints;
        return this.lastResolvedConstraints;
    }

    /** Resolves every output's constraint and loads lookup rows through the run's provider ({@link OutputConstraintResolver.Resolve}). */
    protected async LoadResolvedConstraints(context: RecordProcessorContext): Promise<Map<string, ResolvedConstraint | null>> {
        const outputs = this.spec?.Outputs || [];
        const needsField = outputs.some((o) => o.Constraint && OutputTargets.HasWriteTarget(o) && o.Target.Mode === 'field');
        const entity = needsField && context.EntityID ? context.Provider.EntityByID(context.EntityID) : undefined;
        return OutputConstraintResolver.Resolve(outputs, entity, (resolved) => LookupConstraintValues.Load(resolved, context.Provider, context.ContextUser));
    }

    /** Gives every record in a key group its sample's result, each with its own Feature Values (absent when the sample failed). */
    private async fanOutGroupResult(
        group: CacheKeyGroup,
        sample: RecordRef,
        result: FeaturePipelineRecordResult,
        featureValues: GroupFeatureValues | undefined,
        results: Map<string, FeaturePipelineRecordResult>
    ): Promise<void> {
        for (const rec of group.records) {
            if (rec.RecordID === sample.RecordID) {
                results.set(rec.RecordID, result);
            } else {
                const copy: FeaturePipelineRecordResult = { ...result, ...(result.Warnings ? { Warnings: [...result.Warnings] } : {}) };
                results.set(rec.RecordID, featureValues ? await this.WithFeatureValues(copy, { ...featureValues, Record: rec }) : copy);
            }
        }
    }

    /** The Feature Values a key group's other records get from its sample's computed result: none when it failed. */
    private missFanOutFeatureValues(
        result: FeaturePipelineRecordResult,
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
            InputHash: keyInfo?.keyHash || null,
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
    private async processUncachedBatchWithEscalation(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, FeaturePipelineRecordResult>> {
        const results = new Map<string, FeaturePipelineRecordResult>();
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
        results: Map<string, FeaturePipelineRecordResult>
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
            return { Result: { Status: 'Failed', ErrorMessage: outcome.ErrorMessage, AIPromptRunID: outcome.AIPromptRunID || decisionRunID } };
        }
        const checked = await this.validateOutputs(this.spec?.Outputs ?? [], this.projectEscalatedPayload(outcome), record, context);
        if (!checked.valid) {
            const reason = `its answer is outside this Decision pipeline's own constraints: ${checked.errorMessage ?? 'Constraint violation'}`;
            const message = DescribeEscalationFailure(outcome.EscalationReason, outcome.PipelineName, reason);
            return { Result: { Status: 'Failed', FailureKind: 'RejectedInvalid', ErrorMessage: message, AIPromptRunID: outcome.AIPromptRunID || decisionRunID } };
        }
        // The escalated answer is recorded under this pipeline's outputs, so it is held to their confidence floors too
        const payload = this.ApplyConfidenceFloors(checked.payload);
        try {
            await this.recordSupersededDecision(sample, decision, outcome, context, run);
        } catch (e) {
            const message = this.FeatureValueWriteFailure(e, record);
            return { Result: { Status: 'Failed', ErrorMessage: message, AIPromptRunID: outcome.AIPromptRunID || decisionRunID } };
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
        }, { ...featureValues, Record: record });
        return { Result: result, FeatureValues: result.Status === 'Succeeded' ? featureValues : undefined };
    }

    /**
     * Writes the valueless Feature Values row of a decision an escalation superseded (its prompt run and confidence);
     * nothing when the decision has no prompt run.
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
            InputHash: sample.Group.keyInfo?.keyHash || null,
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

    /** The text {@link computePromptVersionHash} hashes: prompt text, outputs, the rendered constraint block and suffixes. */
    private promptVersionHashBasis(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec, resolved?: Map<string, ResolvedConstraint | null>): string {
        const promptText = this.promptTemplateText ?? prompt.TemplateText ?? prompt.Description ?? prompt.Name ?? '';
        const outputsStr = spec?.Outputs ? JSON.stringify(spec.Outputs) : '';
        const constraintBlock = spec?.Outputs ? RenderConstraintBlock(spec.Outputs, resolved) : '';
        return `${prompt.ID}::${promptText}::${outputsStr}::${constraintBlock}${this.pipelineTypeHashSuffix(spec)}${this.escalationHashSuffix(spec)}${this.userMessageHashSuffix(spec)}`;
    }

    /** The user-turn option's part of the prompt version hash: empty when `RecordAsUserMessage` is off. */
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

    /** Computes a deterministic SHA-256 hash representing the output constraints and their resolved allowed values. */
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
     * Writes one record's Feature Values and returns its result: Failed when the write failed, else with `Outcome`,
     * `PipelineVersion` and `PipelinePin`. A dry run writes nothing: `DryRun: true` and no `Outcome`.
     */
    protected async WithFeatureValues(result: FeaturePipelineRecordResult, featureValues: FeatureValueWriteParams): Promise<FeaturePipelineRecordResult> {
        let outcome: RecordFeatureValuesOutcome | null;
        try {
            outcome = await this.UpsertFeatureValues(featureValues);
        } catch (e) {
            // on a dry run nothing is written: only the preview's read of the stored values can have failed
            const message = featureValues.Context.DryRun === true ? this.FeatureValuePreviewFailure(e, featureValues.Record) : this.FeatureValueWriteFailure(e, featureValues.Record);
            return { ...result, Status: 'Failed', ErrorMessage: message };
        }
        this.featureValueKeys.set(featureValues.Record.RecordID, { Pin: featureValues.Pin, InputHash: featureValues.InputHash });
        const withheld = InferProcessor.WithheldOutputsOf(featureValues.Payload).map((w) => w.OutputName);
        const pinned: FeaturePipelineRecordResult = {
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

    /** The pin this run computes under once resolved, else null (the run result of skipped records reports it). */
    public CurrentRunPin(): FeaturePipelineRunPin | null {
        return this.resolvedPin ? this.RunPinOf(this.resolvedPin.Pin) : null;
    }

    /** On a dry run, why the version registry would refuse the real run, else null. */
    public CurrentRunRefusal(): string | null {
        return this.dryRunRefusal;
    }

    /** The message a record fails with when its Feature Values cannot be written; also logged. */
    protected FeatureValueWriteFailure(e: unknown, record: RecordRef): string {
        const message = `Feature Value write failed: ${e instanceof Error ? e.message : String(e)}`;
        LogError(`InferProcessor: ${message} (record '${record.RecordID}')`);
        return message;
    }

    /** The message a dry-run record fails with when its stored Feature Values cannot be read for the preview; also logged. */
    protected FeatureValuePreviewFailure(e: unknown, record: RecordRef): string {
        const message = `Feature Value preview read failed: ${e instanceof Error ? e.message : String(e)}`;
        LogError(`InferProcessor: ${message} (record '${record.RecordID}')`);
        return message;
    }

    /**
     * Upserts a record's Feature Values for all outputs, on their key. `OutputConfidence` sets each output's confidence
     * ahead of `Confidence`; `OmitValues` writes every value as null (a superseded decision's row). When deferred
     * ({@link DeferFeatureValuesToWriteBack}) the write is queued for the record's write-back unit instead.
     * @returns What the upsert did; null when nothing is written now (a dry run, nothing to write, or deferred).
     */
    protected async UpsertFeatureValues(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome | null> {
        if (params.Context.DryRun === true) {
            if (!params.OmitValues) {
                await this.PreviewFeatureValuesOf(params);
            }
            return null;
        }
        if (!this.WritesHistory || !this.spec?.Outputs || this.spec.Outputs.length === 0 || !params.Context.RecordProcessID || !params.Context.EntityID) {
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
     * On a dry run, works out what the record's outputs with no write target would store and keeps it for
     * {@link PreviewFeatureValues}: each one whose typed answer differs from the record's latest stored value
     * (its Pipeline value), or that has none. A withheld output stores nothing, so it is omitted.
     */
    protected async PreviewFeatureValuesOf(params: FeatureValueWriteParams): Promise<void> {
        const recordProcessID = params.Context.RecordProcessID;
        const entityID = params.Context.EntityID;
        const provider = params.Context.Provider;
        const targetless = (this.spec?.Outputs || []).filter((o) => !OutputTargets.HasWriteTarget(o));
        // a pipeline that writes no history stores nothing, so it previews nothing (as UpsertFeatureValues writes nothing)
        if (!this.WritesHistory || !recordProcessID || !entityID || !provider || targetless.length === 0) {
            return;
        }
        const withheld = new Set(InferProcessor.WithheldOutputsOf(params.Payload).map((w) => w.OutputName));
        const outputs = targetless.filter((o) => !withheld.has(o.Name));
        if (outputs.length === 0) {
            this.featureValuePreviews.delete(params.Record.RecordID);
            return;
        }
        // the Pipeline value only: that is what a real run decides Upserted / Unchanged against
        const stored = await FeatureValueCacheService.Instance.GetLatestPipelineValues({
            RecordProcessID: recordProcessID, EntityID: entityID, RecordID: params.Record.RecordID, FeatureNames: outputs.map((o) => o.Name),
            ContextUser: params.Context.ContextUser, Provider: provider,
        });
        const previews: FeatureValuePreview[] = [];
        for (const output of outputs) {
            const resolved = ResolveMappingRef(output.Ref, { $: params.Payload });
            const proposed = FeatureValueCacheService.ToTypedValue(resolved !== undefined ? resolved : null, output.Constraint?.Type);
            const latest = stored.get(output.Name.toLowerCase());
            const proposedValue = FeatureValueCacheService.NativeValueOf(proposed);
            const previousValue = latest ? FeatureValueCacheService.NativeValueOf(latest) : null;
            if (!latest || !InferProcessor.sameFeatureValue(previousValue, proposedValue)) {
                previews.push({ FeatureName: output.Name, Previous: previousValue ?? null, Proposed: proposedValue });
            }
        }
        if (previews.length > 0) {
            this.featureValuePreviews.set(params.Record.RecordID, previews);
        } else {
            this.featureValuePreviews.delete(params.Record.RecordID);
        }
    }

    /**
     * The TSType a constraint implies for an output with no write target (no column to take one from): `'number'` for
     * numeric and money, `'boolean'` for boolean, `'Date'` for date; undefined for the others.
     */
    public static ConstraintTSType(constraintType: ValueConstraint['Type']): string | undefined {
        switch (constraintType) {
            case 'numeric':
            case 'money':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'date':
                return 'Date';
            default:
                return undefined;
        }
    }

    /** Whether two native Feature Values are the same value (dates by instant, objects by content). `unknown`: a Feature Value is of any output type. */
    private static sameFeatureValue(a: unknown, b: unknown): boolean {
        return Canonicalize(a instanceof Date ? a.toISOString() : a) === Canonicalize(b instanceof Date ? b.toISOString() : b);
    }

    /** What the record's outputs with no write target would store on this dry-run batch; empty when none would change. */
    public PreviewFeatureValues(recordID: string): FeatureValuePreview[] {
        return this.featureValuePreviews.get(recordID) || [];
    }

    /** What the record's unmapped outputs would store on this dry-run batch (`WriteBackProcessor` hook). */
    public PreviewRecordValues(recordID: string): WriteBackValuePreview[] {
        return this.PreviewFeatureValues(recordID).map((p) => ({
            Name: p.FeatureName,
            Label: `${p.FeatureName} (feature value)`,
            Previous: p.Previous,
            Proposed: p.Proposed,
        }));
    }

    /** Writes one record's Feature Values now, on `params.Context.Provider`, and keeps the values they replaced. */
    protected async WriteFeatureValues(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome> {
        const outputs = this.spec?.Outputs || [];
        const recordProcessID = params.Context.RecordProcessID;
        const entityID = params.Context.EntityID;
        if (!recordProcessID || !entityID) {
            throw new Error('InferProcessor: a Feature Value write needs the run\'s pipeline and entity');
        }

        const outputsList: FeatureValueOutputItem[] = [];
        const sources = { $: params.Payload };
        // an output withheld below its confidence floor records the abstention: a row with no value
        const withheld = new Set(InferProcessor.WithheldOutputsOf(params.Payload).map((w) => w.OutputName));

        for (const output of outputs) {
            const val = params.OmitValues || withheld.has(output.Name) ? null : ResolveMappingRef(output.Ref, sources);
            outputsList.push({
                featureName: output.Name,
                value: val !== undefined ? val : null,
                reasoning: params.Reasoning,
                // `??` because 0 is a valid confidence
                confidence: params.OutputConfidence?.[output.Name] ?? params.Confidence,
                // typed storage by constraint applies to outputs with no write target only: a written output keeps its storage
                constraintType: OutputTargets.HasWriteTarget(output) ? undefined : output.Constraint?.Type,
            });
        }

        const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({
            recordProcessID,
            entityID,
            recordID: params.Record.RecordID,
            outputs: outputsList,
            promptID: params.PromptID,
            constraintHash: params.ConstraintHash,
            processRunID: params.Context.ProcessRunID,
            aiPromptRunID: params.AIPromptRunID,
            featureValueCacheID: params.FeatureValueCacheID,
            pipelineVersion: this.PipelineVersion,
            promptVersionHash: params.Pin.PromptVersionHash,
            aiModelID: params.Pin.AIModelID,
            parametersHash: params.Pin.ParametersHash,
            inputHash: params.InputHash,
            source: 'Pipeline',
            // a superseded decision's row (no values) is history: it never takes the latest value back from the answer
            historyOnly: params.OmitValues === true,
            contextUser: params.Context.ContextUser,
            provider: params.Context.Provider,
        });
        this.KeepPreviousValues(params.Record.RecordID, outcome.Previous);
        return outcome;
    }

    /** Keeps a record's pre-run values: the first write's capture per feature in this batch. */
    protected KeepPreviousValues(recordID: string, previous: Record<string, TypedFeatureValue | null>): void {
        const kept = this.previousFeatureValues.get(recordID) || {};
        for (const [featureName, value] of Object.entries(previous)) {
            if (!(featureName in kept)) {
                kept[featureName] = value;
            }
        }
        this.previousFeatureValues.set(recordID, kept);
    }

    /** Computes the watermark basis hash for Checksum strategy: the record's prompt data and the pin. */
    public async ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string> {
        await this.ensureRecordsLoaded([record], context);
        await AIEngine.Instance.Config(false, context.ContextUser);
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
            await KnowledgeHubMetadataEngine.Instance.Config(false, context.ContextUser, context.Provider);
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
     * The value lists of the pipeline's own entity (`context.EntityID`), for the output check and the
     * driver. Consults only that entity's fields, so a same-named field elsewhere is never read; undefined
     * when the run names no entity or the provider does not know it.
     */
    private buildFieldValuesLookup(context: RecordProcessorContext): FeaturePipelineFieldValueLookup | undefined {
        if (!context.EntityID) {
            return undefined;
        }
        const provider = context.Provider ?? Metadata.Provider; // global-provider-ok: last-resort fallback for a context built without its provider
        return typeof provider?.EntityByID === 'function' ? BuildEntityFieldValueLookup(provider.EntityByID(context.EntityID)) : undefined;
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
    // P1-6 Lifecycle Hooks (overridable by subclasses registered under DataFeatureSpec.ProcessorExtensionKey)
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
            const rawVal = ResolveMappingRef(output.Ref, sources);

            // A field target lends its column's TSType; an output with no write target takes the type its constraint
            // implies, so a quoted '0.75' or 'true' coerces as it would for a typed column
            const target = OutputTargets.HasWriteTarget(output) ? output.Target : undefined;
            const field = target?.Mode === 'field'
                ? ctx.Provider?.EntityByID(record.EntityID)?.Fields?.find(
                    (f) => f.Name.toLowerCase() === target.EntityFieldName.toLowerCase()
                )
                : undefined;
            const valueTSType = target ? field?.TSType : InferProcessor.ConstraintTSType(output.Constraint.Type);

            // The resolved constraint carries the field's value list for an enum with FromFieldMetadata and a
            // lookup's allowed rows; an array output with an ItemRef is checked item by item
            const validation = ValidateOutputItems(rawVal, output.Constraint, {
                targetFieldTSType: valueTSType,
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

    /** The reserved payload key listing the outputs withheld below their confidence floor (cached with the outputs). */
    public static readonly BELOW_CONFIDENCE_KEY = '_belowConfidence';

    /**
     * Withholds each output below its confidence floor (by the confidences its Feature Values carry): nulled in the
     * payload and named under {@link BELOW_CONFIDENCE_KEY}.
     * @param payload - the validated payload; `unknown` on purpose, a model's answer of any shape
     */
    protected ApplyConfidenceFloors(payload: unknown): unknown {
        const below = ConfidenceFloor.FindBelow(this.spec?.Outputs || [], this.RecordedAnnotations(payload).OutputConfidence);
        if (below.length === 0) {
            return payload;
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
        return { ...withheld, [InferProcessor.BELOW_CONFIDENCE_KEY]: below };
    }

    /** The outputs a payload withheld below their confidence floor ({@link BELOW_CONFIDENCE_KEY}); empty when none. */
    public static WithheldOutputsOf(payload: unknown): BelowConfidenceOutput[] {
        const stored = isPlainRecord(payload) ? payload[InferProcessor.BELOW_CONFIDENCE_KEY] : undefined;
        if (!Array.isArray(stored)) {
            return [];
        }
        return stored.flatMap((v: unknown): BelowConfidenceOutput[] => {
            if (!isPlainRecord(v) || typeof v.OutputName !== 'string' || typeof v.MinConfidence !== 'number' || v.Policy !== 'null') {
                return [];
            }
            return [{ OutputName: v.OutputName, Confidence: typeof v.Confidence === 'number' ? v.Confidence : null, MinConfidence: v.MinConfidence, Policy: v.Policy }];
        });
    }

    /** The field and child-entity targets a successful result withheld; undefined when it withheld nothing. */
    public WithheldWriteBackTargets(result: RecordResult): WithheldWriteBackTargets | undefined {
        const names = result.Status === 'Succeeded' ? result.BelowConfidenceOutputs || [] : [];
        if (names.length === 0) {
            return undefined;
        }
        const outputs = names.flatMap((n) => FindOutputByName(this.spec?.Outputs || [], n) || []).filter(OutputTargets.HasWriteTarget);
        if (outputs.length === 0) {
            return undefined;
        }
        return {
            Fields: outputs.flatMap((o) => (o.Target.Mode === 'field' ? [o.Target.EntityFieldName] : [])),
            ChildEntities: outputs.flatMap((o) => (o.Target.Mode === 'child' ? [o.Target.EntityName] : [])),
        };
    }

    /** The model's reasoning ({@link ModelAnswer.Reasoning}); undefined when capture is off. */
    public static ExtractReasoning(rawResult: unknown, capture: boolean): string | undefined {
        return capture ? ModelAnswer.Reasoning(rawResult) : undefined;
    }

    /** Whether the pipeline records the model's reasoning (`CaptureReasoning`, on unless the spec turns it off). */
    private get captureReasoning(): boolean {
        return this.spec?.CaptureReasoning !== false;
    }

    /** Per-output confidences read at each output's ConfidenceRef, for values in [0, 1]. */
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

    /** The reserved payload key holding the driver's own per-output confidences (cached with the outputs). */
    public static readonly DRIVER_CONFIDENCE_KEY = '_confidence';

    /** The payload with the driver's confidences under {@link DRIVER_CONFIDENCE_KEY}; unchanged without any or for a non-object. */
    protected static WithDriverConfidence(payload: unknown, driverConfidence: Record<string, number> | undefined): unknown {
        if (!driverConfidence || !isPlainRecord(payload)) {
            return payload;
        }
        return { ...payload, [InferProcessor.DRIVER_CONFIDENCE_KEY]: driverConfidence };
    }

    /**
     * The reasoning and per-output confidences a record's Feature Values carry, read from the payload the Dedup Cache
     * stores (so a cache hit records what the miss recorded). The driver's confidence wins over a ConfidenceRef; an
     * output the constraint check replaced gets none.
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

    /** The allowed values an output resolved from outside its spec (lookup rows, field-metadata enum values). */
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

    /** The payload keys this processor reserves; they ride in the cached and result payloads. */
    public static readonly RESERVED_PAYLOAD_KEYS: readonly string[] = ['_violations', InferProcessor.DRIVER_CONFIDENCE_KEY, InferProcessor.BELOW_CONFIDENCE_KEY];

    /** A model's answer without the reserved keys ({@link RESERVED_PAYLOAD_KEYS}); a non-object answer as it is. */
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
     * Creates the parser that renders the spec's context Entity Document for a record.
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
            promptData = { record: this.contextFieldsListed ? recordData : this.withoutIndexRestrictedFields(recordData, record, ctx) };
        } else {
            const mapped = ResolveValueMapping(mappingToUse, { record: recordData });
            promptData = mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : { record: recordData };
        }

        // P1-8a: EntityDocument context rendering
        if (this.spec?.Context?.EntityDocumentID && ctx) {
            try {
                await EntityDocumentCache.Instance.Refresh(false, ctx.ContextUser);
                const doc = EntityDocumentCache.Instance.GetDocument(
                    this.spec.Context.EntityDocumentID
                );
                if (doc) {
                    const parser = this.CreateContextDocumentParser(ctx.Provider);
                    const templateText = await parser.resolveDocumentTemplateText(doc, ctx.ContextUser);
                    if (templateText && templateText.trim().length > 0) {
                        const documentRecord = this.contextDocumentRecord(recordData, record, ctx);
                        const rendered = await parser.Parse(templateText, record.EntityID, documentRecord, ctx.ContextUser);
                        promptData.context = rendered;
                        promptData.RenderedContext = rendered;
                        promptData.document = rendered;
                    }
                }
            } catch (e) {
                LogError(`InferProcessor: failed to render EntityDocument '${this.spec.Context.EntityDocumentID}': ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // P1-8a / C7: Query context execution
        if (this.spec?.Context?.QueryID && ctx) {
            try {
                const rq = new RunQuery();
                const queryParams: Record<string, unknown> = {};
                if (this.spec.Context.QueryParams) {
                    for (const [pName, pRef] of Object.entries(this.spec.Context.QueryParams)) {
                        queryParams[pName] = ResolveMappingRef(pRef, { record: recordData, $: recordData });
                    }
                }
                const qResult = await rq.RunQuery(
                    { QueryID: this.spec.Context.QueryID, Parameters: queryParams },
                    ctx.ContextUser
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
     * The prompt's user turn when the spec sets `Context.RecordAsUserMessage`: the record's `Context.Fields` values as
     * one JSON object (JSON-encoding fences each value), else null (the runner's default turn).
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

    /**
     * The default mapping's record data without the fields field-level security restricts for any
     * role ({@link GetIndexRestrictedFieldNames}). A record process runs as a system identity and
     * writes what the model answers into fields other users read, so the model must not see by
     * default what any of those users may not. A field named in `Context.Fields` or an input
     * mapping is an explicit choice and is not filtered.
     */
    private withoutIndexRestrictedFields(recordData: Record<string, unknown>, record: RecordRef, ctx?: RecordProcessorContext): Record<string, unknown> {
        const restricted = GetIndexRestrictedFieldNames(this.recordEntityInfo(record, ctx));
        if (restricted.size === 0) {
            return recordData;
        }
        return Object.fromEntries(Object.entries(recordData).filter(([key]) => !restricted.has(key.trim().toLowerCase())));
    }

    /** Whether the spec's `Context.Fields` names the record fields the prompt sees. */
    private get contextFieldsListed(): boolean {
        return (this.spec?.Context?.Fields?.length ?? 0) > 0;
    }

    /**
     * The record values the `Context.EntityDocumentID` document renders from. The default mapping's
     * rule applies ({@link withoutIndexRestrictedFields}, unless `Context.Fields` names the fields),
     * and the fields the run user may not read are dropped as well, so the rendered context never
     * holds a value the prompt's `record` leaves out.
     */
    private contextDocumentRecord(recordData: Record<string, unknown>, record: RecordRef, ctx: RecordProcessorContext): Record<string, unknown> {
        const values = this.contextFieldsListed ? recordData : this.withoutIndexRestrictedFields(recordData, record, ctx);
        const entity = this.recordEntityInfo(record, ctx);
        if (!entity?.FieldLevelSecurityApplies || !ctx.ContextUser) {
            return values;
        }
        return OmitDeniedFieldKeys(values, entity.GetDeniedReadFields(ctx.ContextUser));
    }

    /** The record's entity: from a loaded BaseEntity, else from the run's (or the global) metadata provider. */
    private recordEntityInfo(record: RecordRef, ctx?: RecordProcessorContext): EntityInfo | null {
        const loaded = record.Record as { EntityInfo?: EntityInfo } | undefined;
        if (loaded?.EntityInfo) {
            return loaded.EntityInfo;
        }
        const provider = ctx?.Provider ?? Metadata.Provider;
        return record.EntityID && provider ? provider.EntityByID(record.EntityID) ?? null : null;
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

        const candidateProvider = context.Provider ?? Metadata.Provider; // global-provider-ok: fallback to global provider when not in context
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
                    SkipTotalRowCount: true,
                    BypassCache: true,
                }, context.ContextUser);

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

