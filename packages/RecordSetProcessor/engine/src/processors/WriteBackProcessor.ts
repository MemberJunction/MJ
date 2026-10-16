/**
 * @fileoverview A processor decorator that runs an inner processor (Action/Agent/Infer) and then
 * applies the Record Process's `OutputMapping` write-back (fields / child record) using the inner
 * result's payload. Lets any work type share the same declarative write-back.
 * @module @memberjunction/record-set-processor
 */

import { type IMetadataProvider, LogError } from '@memberjunction/core';
import type { RecordFeatureValuesOutcome } from '@memberjunction/feature-pipelines';
import {
    FeaturePipelineRunPin,
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
    WriteBackRunPayload,
} from '@memberjunction/record-set-processor-base';
import { OutputMappingConfig, RunProvenance, ApplyOutputMapping, type HumanValueGuardSource, type WithheldTargetSource } from '../writeBack';

/** The hook a processor may expose to adjust its result before write-back (`InferProcessor.beforeWriteBack`). */
interface BeforeWriteBackHook {
    /** `result` is the processor's own payload (`RecordResult.ResultPayload`, untyped at this seam). */
    beforeWriteBack(outputMapping: OutputMappingConfig | undefined, result: unknown, record: RecordRef, context: RecordProcessorContext): Promise<void>;
}

/** A processor whose per-record values commit with the record's write-back (InferProcessor's Feature Values). */
export interface DeferredFeatureValueSource {
    /** From now on, queue the per-record Feature Value writes instead of saving them. */
    DeferFeatureValuesToWriteBack(): void;
    /** Saves a record's queued writes on the write-back unit's provider; null when none were queued. */
    WriteDeferredFeatureValues(recordID: string, provider: IMetadataProvider): Promise<RecordFeatureValuesOutcome | null>;
    /** Drops a record's queued writes (its result failed, so it gets no write-back). */
    DiscardDeferredFeatureValues(recordID: string): void;
}

/** Wraps a processor and applies output-mapping write-back to each successful result. */
export class WriteBackProcessor implements IRecordProcessor {
    /**
     * @param inner - The processor that produces the work result.
     * @param outputMapping - The `OutputMapping` config to apply to each successful result.
     * @param dryRun - When true, the inner work still runs but the write-back only computes a
     *   preview (no entity is saved / no child is created), so a dry-run of any wrapped work type
     *   reports its effect without mutating data, and fails a record whose real write would fail.
     *   Mirrors `FieldRulesProcessor`'s dry-run. A dry-run context previews too.
     * @param run - Optional run provenance information stamped on write-back operations.
     */
    constructor(
        private readonly inner: IRecordProcessor,
        private readonly outputMapping: OutputMappingConfig,
        private readonly dryRun: boolean = false,
        private readonly run?: RunProvenance,
    ) {
        if (WriteBackProcessor.defersFeatureValues(inner)) {
            inner.DeferFeatureValuesToWriteBack();
        }
    }

    private readonly _lookupCache = new Map<string, string | number>();

    public get OutputMapping(): OutputMappingConfig {
        return this.outputMapping;
    }

    public GetWriteBackFields(): string[] {
        return Object.keys(this.outputMapping.fields ?? {});
    }

    /** @deprecated Use {@link GetWriteBackFields}. */
    public getWriteBackFields(): string[] {
        return this.GetWriteBackFields();
    }

    /** Forwards the run-level readiness check to the wrapped processor, when it declares one. */
    public async Preflight(context: RecordProcessorContext): Promise<void> {
        if (this.inner.Preflight) {
            await this.inner.Preflight(context);
        }
    }

    /** Forwards the run-level pin of the wrapped processor, when it reports one. */
    public CurrentRunPin(): FeaturePipelineRunPin | null {
        return this.inner.CurrentRunPin ? this.inner.CurrentRunPin() : null;
    }

    /** Forwards the dry-run refusal of the wrapped processor, when it reports one. */
    public CurrentRunRefusal(): string | null {
        return this.inner.CurrentRunRefusal ? this.inner.CurrentRunRefusal() : null;
    }

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const result = await this.inner.ProcessRecord(record, context);
        return result.Status === 'Succeeded' ? this.WriteBackOne(record, result, context) : this.WithoutWriteBack(record, result);
    }

    /**
     * Runs one successful result's write-back (`beforeWriteBack`, then {@link ApplyWriteBack}) and turns a write-back
     * error into the record's failure; the one path of {@link ProcessRecord} and {@link ProcessBatch}.
     */
    protected async WriteBackOne(record: RecordRef, result: RecordResult, context: RecordProcessorContext): Promise<RecordResult> {
        try {
            if (WriteBackProcessor.hasBeforeWriteBack(this.inner)) {
                await this.inner.beforeWriteBack(this.outputMapping, result.ResultPayload, record, context);
            }
            return await this.ApplyWriteBack(record, result, context, this.RunProvenanceFor(result, context));
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`WriteBackProcessor: write-back failed for record '${record.RecordID}': ${message}`);
            return { ...result, Status: 'Failed', ErrorMessage: `Write-back failed: ${message}` };
        } finally {
            // A dry-run, or a failure before the unit wrote them, leaves the record's queued values unwritten: drop them.
            this.WithoutWriteBack(record, result);
        }
    }

    /** A record whose write-back is over or will not run: the inner processor's queued values for it are dropped. */
    protected WithoutWriteBack(record: RecordRef, result: RecordResult): RecordResult {
        if (WriteBackProcessor.defersFeatureValues(this.inner)) {
            this.inner.DiscardDeferredFeatureValues(record.RecordID);
        }
        return result;
    }

    /** The provenance a result's write-back maps via `$run.*`: the result's own links, else the run's. */
    protected RunProvenanceFor(result: RecordResult, context: RecordProcessorContext): RunProvenance {
        return {
            ...this.run,
            ProcessRunID: context.processRunID ?? this.run?.ProcessRunID,
            PromptID: result.PromptID ?? this.run?.PromptID,
            AIPromptRunID: result.AIPromptRunID ?? this.run?.AIPromptRunID,
            PromptVersionHash: result.PromptVersionHash ?? this.run?.PromptVersionHash,
            FeatureValueCacheID: result.FeatureValueCacheID ?? this.run?.FeatureValueCacheID,
            ExecutedAt: this.run?.ExecutedAt ?? new Date().toISOString(),
        };
    }

    /**
     * Applies the OutputMapping to one successful result, with the human-value guard and the run's overwrite switch;
     * the inner processor's deferred Feature Values are written first inside the write-back's unit. The outcome is
     * `Upserted` when anything changed, else `Unchanged`. A dry run carries `DryRun: true` and no `Outcome`, and fails
     * when its preview found what the real write would fail on.
     */
    protected async ApplyWriteBack(record: RecordRef, result: RecordResult, context: RecordProcessorContext, run: RunProvenance): Promise<RecordResult> {
        const dry = this.dryRun || context.DryRun === true;
        const guard = WriteBackProcessor.supportsHumanValueGuard(this.inner) ? this.inner.CreateHumanValueGuard(record, context) : undefined;
        let featureValues: RecordFeatureValuesOutcome | null = null;
        const inner = this.inner;
        const unitWork = WriteBackProcessor.defersFeatureValues(inner)
            ? async (unitProvider: IMetadataProvider) => { featureValues = await inner.WriteDeferredFeatureValues(record.RecordID, unitProvider); }
            : undefined;
        // The targets the result withheld (outputs below their confidence floor) are left as they are
        const withheld = WriteBackProcessor.supportsWithheldTargets(inner) ? inner.WithheldWriteBackTargets(result) : undefined;
        const writeBack = await ApplyOutputMapping({
            outputMapping: this.outputMapping, result: result.ResultPayload, record, contextUser: context.contextUser,
            provider: context.provider, dryRun: dry, run, lookupCache: this._lookupCache,
            humanGuard: guard, overwriteHumanValues: context.overwriteHumanValues === true, unitWork, withheld,
        });
        const payload: WriteBackRunPayload = { output: result.ResultPayload, writeBack };
        const preserved = (writeBack.preservedHumanFields?.length || 0) + (writeBack.preservedHumanChildIDs?.length || 0);
        if (dry) {
            const previewed = WriteBackProcessor.WithoutOutcome(result);
            if (writeBack.PreviewErrors && writeBack.PreviewErrors.length > 0) {
                // A dry run that reports success for a write that would fail tells the operator the opposite of the truth.
                return { ...previewed, Status: 'Failed', ErrorMessage: `Dry run: the real write would fail: ${writeBack.PreviewErrors.join('; ')}`,
                    ResultPayload: payload, DryRun: true };
            }
            return { ...previewed, ResultPayload: payload, HumanValuesPreserved: preserved, DryRun: true };
        }
        return {
            ...result, ResultPayload: payload,
            Outcome: WriteBackProcessor.OutcomeOf(writeBack.changed, featureValues, result), HumanValuesPreserved: preserved,
        };
    }

    /** The result without an `Outcome`: a dry run wrote nothing, so it claims neither Upserted nor Unchanged. */
    protected static WithoutOutcome(result: RecordResult): Omit<RecordResult, 'Outcome'> {
        const { Outcome: _written, ...rest } = result;
        return rest;
    }

    /** The record's outcome after write-back: see {@link ApplyWriteBack}; the inner outcome when neither wrote anything. */
    protected static OutcomeOf(changed: boolean, featureValues: RecordFeatureValuesOutcome | null, result: RecordResult): RecordResult['Outcome'] {
        if (changed || (featureValues !== null && featureValues.Upserted > 0)) {
            return 'Upserted';
        }
        return featureValues !== null && featureValues.Unchanged > 0 ? 'Unchanged' : result.Outcome;
    }

    /** Whether a processor defers per-record values to its write-back (a capability check, not a class check). */
    private static defersFeatureValues(p: IRecordProcessor): p is IRecordProcessor & DeferredFeatureValueSource {
        return 'DeferFeatureValuesToWriteBack' in p && typeof p.DeferFeatureValuesToWriteBack === 'function';
    }

    /** Whether a processor has the `beforeWriteBack` hook (InferProcessor and its extensions). */
    private static hasBeforeWriteBack(p: IRecordProcessor): p is IRecordProcessor & BeforeWriteBackHook {
        return 'beforeWriteBack' in p && typeof p.beforeWriteBack === 'function';
    }

    /** Whether a processor's results can withhold write-back targets (a capability check, not a class check). */
    private static supportsWithheldTargets(p: IRecordProcessor): p is IRecordProcessor & WithheldTargetSource {
        return 'WithheldWriteBackTargets' in p && typeof p.WithheldWriteBackTargets === 'function';
    }

    /** Whether a processor can say which target values a person entered (a capability check, not a class check). */
    private static supportsHumanValueGuard(p: IRecordProcessor): p is IRecordProcessor & HumanValueGuardSource {
        return 'CreateHumanValueGuard' in p && typeof p.CreateHumanValueGuard === 'function';
    }

    /**
     * Delegates basis hash computation to the inner processor if supported.
     */
    public async ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string | undefined> {
        if ('ComputeBasisHash' in this.inner && typeof (this.inner as { ComputeBasisHash?: unknown }).ComputeBasisHash === 'function') {
            return (this.inner as { ComputeBasisHash: (r: RecordRef, ctx: RecordProcessorContext) => Promise<string | undefined> }).ComputeBasisHash(record, context);
        }
        return undefined;
    }

    /**
     * Delegates batch processing to the inner processor when supported, and applies
     * output mapping write-back to each successful result.
     */
    public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        if ('ProcessBatch' in this.inner && typeof (this.inner as { ProcessBatch?: unknown }).ProcessBatch === 'function') {
            const rawResults = await (this.inner as { ProcessBatch: (recs: RecordRef[], ctx: RecordProcessorContext) => Promise<Map<string, RecordResult> | RecordResult[]> }).ProcessBatch(records, context);
            const innerResults = this.toResultMap(records, rawResults);
            const outResults = new Map<string, RecordResult>();

            for (const record of records) {
                const res = innerResults.get(record.RecordID);
                if (!res || res.Status !== 'Succeeded') {
                    outResults.set(record.RecordID, this.WithoutWriteBack(record, res ?? { Status: 'Failed', ErrorMessage: 'No result returned from batch processor' }));
                    continue;
                }

                outResults.set(record.RecordID, await this.WriteBackOne(record, res, context));
            }
            return outResults;
        }

        // Fall back to processing each record
        const results = new Map<string, RecordResult>();
        for (const record of records) {
            results.set(record.RecordID, await this.ProcessRecord(record, context));
        }
        return results;
    }

    /**
     * Normalizes an inner `ProcessBatch` result to a RecordID-keyed map. The `IRecordProcessor`
     * contract allows either a `Map` keyed by RecordID or an array positionally aligned with the
     * input records (e.g. the Predictive Studio ML scorer returns an array) — both must work here.
     */
    private toResultMap(records: RecordRef[], results: Map<string, RecordResult> | RecordResult[]): Map<string, RecordResult> {
        if (results instanceof Map) {
            return results;
        }
        const map = new Map<string, RecordResult>();
        records.forEach((record, i) => {
            if (results[i]) {
                map.set(record.RecordID, results[i]);
            }
        });
        return map;
    }
}
