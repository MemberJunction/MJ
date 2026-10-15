/**
 * @fileoverview The Record Set Processor engine — the single substrate every set-iterating job
 * routes through. It owns batching, bounded concurrency, optional rate limiting, an error-rate
 * circuit breaker, a budget-gate hook, progress events, the pause/cancel handshake, resume from a
 * checkpoint, and per-record error isolation — while delegating *what to iterate* (source), *what
 * to do* (processor), and *where to persist* (tracker) to pluggable seams.
 * @module @memberjunction/record-set-processor
 */

import type { ParameterFidelity } from '@memberjunction/ai';
import { BaseSingleton } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import {
    FeaturePipelineRunPin,
    FeaturePipelineRunResult,
    IProcessRunTracker,
    ProcessCursor,
    ProcessRunMeta,
    ProcessRunResult,
    ProcessRunStatusValue,
    ProcessRunSummary,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
    RecordSetProcessOptions,
    RunCounts,
    RunHandle,
    TriggeredByValue,
} from '@memberjunction/record-set-processor-base';
import { RateLimiter } from './RateLimiter';
import { GenericProcessRunTracker } from './trackers/GenericProcessRunTracker';
import { WatermarkService, type WatermarkDecision } from './watermark/WatermarkService';
import type { OutputMappingConfig } from './writeBack';

/**
 * Thrown by {@link RecordSetProcessor.Process} for a Feature Pipeline run (`FeaturePipeline: true`) without a
 * `recordProcessID`: its run result could not be attributed to a pipeline.
 */
export class FeaturePipelineRunAttributionError extends Error {
    constructor() {
        super('A Feature Pipeline run (FeaturePipeline: true) needs recordProcessID.');
        this.name = 'FeaturePipelineRunAttributionError';
    }
}

/** Default batch size when none is supplied. */
const DEFAULT_BATCH_SIZE = 100;
/** Default error-rate circuit-breaker threshold (percent). */
const DEFAULT_ERROR_THRESHOLD = 20;

/**
 * The server-side engine that processes a record set through the source/processor/tracker pipeline.
 * Use the {@link Instance} singleton: `await RecordSetProcessor.Instance.Process({ ... })`.
 */
export class RecordSetProcessor extends BaseSingleton<RecordSetProcessor> {
    /** The process-wide singleton instance. */
    public static get Instance(): RecordSetProcessor {
        return super.getInstance<RecordSetProcessor>();
    }

    /**
     * Processes a record set end to end and returns the run summary.
     * Logical failures never throw — inspect the returned {@link ProcessRunResult}.
     *
     * @param options - The source, processor, tracker, and execution knobs for this run.
     * @returns The run summary plus the persisted run ID (when a persisting tracker was used).
     * @throws FeaturePipelineRunAttributionError when `FeaturePipeline` is set without `recordProcessID` (a caller error:
     * the run result could not be attributed, and a persisted summary with an empty `RecordProcessID` would be silently
     * wrong).
     */
    public async Process(options: RecordSetProcessOptions): Promise<ProcessRunResult> {
        if (options.FeaturePipeline && !options.recordProcessID) {
            throw new FeaturePipelineRunAttributionError();
        }
        const { source, processor, contextUser } = options;
        const provider: IMetadataProvider = options.provider ?? Metadata.Provider;
        const tracker: IProcessRunTracker = options.tracker ?? new GenericProcessRunTracker();
        const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        const maxConcurrency = Math.max(1, options.maxConcurrency ?? 1);
        const errorThreshold = options.errorThresholdPercent ?? DEFAULT_ERROR_THRESHOLD;
        const delayMs = options.delayBetweenBatchesMs ?? 0;
        const shouldResume = options.resume ?? true;
        const rateLimiter = options.rateLimit
            ? new RateLimiter({ RequestsPerMinute: options.rateLimit.requestsPerMinute, TokensPerMinute: options.rateLimit.tokensPerMinute })
            : undefined;

        const descriptor = source.Describe();
        const meta: ProcessRunMeta = {
            RecordProcessID: options.recordProcessID,
            ScheduledJobRunID: options.scheduledJobRunID,
            EntityID: options.entityID ?? descriptor.EntityID,
            TriggeredBy: options.triggeredBy ?? 'Manual',
            SourceType: descriptor.SourceType,
            SourceID: descriptor.SourceID,
            SourceFilter: descriptor.SourceFilter,
            BatchSize: batchSize,
            Configuration: options.configuration,
            DryRun: options.dryRun,
        };

        const handle = await tracker.BeginRun(meta, contextUser, provider);
        const counts: RunCounts = { Processed: 0, Success: 0, Error: 0, Skipped: 0 };
        const tally: RunTally = {
            WatermarkSkipped: 0, Upserted: 0, Unchanged: 0, Previewed: 0, RejectedInvalid: 0, BelowConfidence: 0, BelowConfidenceRejected: 0, HumanValuesPreserved: 0, Pin: null, ParameterFidelity: null,
        };
        let cursor = shouldResume ? await tracker.LoadResumeCursor(handle, contextUser, provider) : undefined;
        let total: number | null = null;
        let status: ProcessRunStatusValue = 'Running';
        let errorMessage: string | undefined;
        const startTime = new Date();

        try {
            // Run-level readiness gate: a processor whose prerequisite is missing refuses the run up
            // front with one clear message rather than failing every record into the circuit breaker.
            if (processor.Preflight) {
                await processor.Preflight({
                    contextUser,
                    provider,
                    processRunID: handle.ProcessRunID,
                    recordProcessID: options.recordProcessID,
                    entityID: meta.EntityID,
                    DryRun: options.dryRun === true,
                    TriggeredBy: meta.TriggeredBy,
                });
            }
            status = await this.runBatchLoop({
                options, source, processor, tracker, handle, provider, triggeredBy: meta.TriggeredBy,
                batchSize, maxConcurrency, errorThreshold, delayMs, rateLimiter,
                counts,
                tally,
                getCursor: () => cursor,
                setCursor: (c) => { cursor = c; },
                getTotal: () => total,
                setTotal: (t) => { total = t; },
                setErrorMessage: (m) => { errorMessage = m; },
            });
        } catch (e) {
            status = 'Failed';
            errorMessage = e instanceof Error ? e.message : String(e);
            LogError(`RecordSetProcessor: run failed: ${errorMessage}`);
        }

        const attempted = this.attemptedOf(counts, tally);
        if (options.FeaturePipeline && status === 'Completed' && counts.Error > 0) {
            // A Feature Pipeline run is only Completed when every attempted record was computed and written; the
            // records that succeeded keep their writes.
            status = 'Failed';
            errorMessage = `${counts.Error} of ${attempted} attempted records failed (${tally.RejectedInvalid} rejected by output constraints, ${tally.BelowConfidenceRejected} below a confidence floor)`;
        }
        const featurePipeline = options.recordProcessID && options.FeaturePipeline
            ? this.featurePipelineResult(options.recordProcessID, counts, tally, status, processor, options.dryRun === true)
            : undefined;

        const summary: ProcessRunSummary = {
            Status: status,
            Total: total,
            Processed: counts.Processed,
            Success: counts.Success,
            Error: counts.Error,
            Skipped: counts.Skipped,
            StartTime: startTime,
            EndTime: new Date(),
            ErrorMessage: errorMessage,
            FeaturePipeline: featurePipeline,
        };
        await tracker.CompleteRun(handle, summary, contextUser, provider);
        return { ...summary, ProcessRunID: handle.ProcessRunID };
    }

    /** The core batch loop. Returns the terminal status. */
    private async runBatchLoop(ctx: BatchLoopContext): Promise<ProcessRunStatusValue> {
        const { options, source, batchSize, counts } = ctx;
        const { contextUser } = options;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const batch = await source.NextBatch(ctx.getCursor(), batchSize, contextUser, ctx.provider);
            if (batch.TotalRowCount != null && ctx.getTotal() == null) {
                ctx.setTotal(batch.TotalRowCount);
            }
            if (batch.Records.length === 0) {
                return 'Completed';
            }

            // Honor a hard record cap by trimming the batch.
            let records = batch.Records;
            if (options.maxRecords != null) {
                const remaining = options.maxRecords - counts.Processed;
                if (remaining <= 0) {
                    return 'Completed';
                }
                if (records.length > remaining) {
                    records = records.slice(0, remaining);
                }
            }

            if (ctx.rateLimiter) {
                await ctx.rateLimiter.Acquire();
            }

            await this.processBatch(records, ctx);

            options.onProgress?.({ ...counts, Total: ctx.getTotal() });

            // Checkpoint + pause/cancel handshake.
            ctx.setCursor(batch.NextCursor);
            const shouldContinue = await ctx.tracker.Checkpoint(ctx.handle, batch.NextCursor, counts, contextUser, ctx.provider);
            if (!shouldContinue) {
                return 'Paused';
            }

            // Budget gate.
            if (options.onAfterBatch) {
                const verdict = await this.safeAfterBatch(options.onAfterBatch, records, counts.Processed);
                if (verdict && !verdict.continue) {
                    ctx.setErrorMessage(verdict.reason ? `Auto-paused: ${verdict.reason}` : 'Auto-paused: budget exceeded');
                    return 'Paused';
                }
            }

            // Error-rate circuit breaker, over the records actually attempted: a record skipped on its watermark was
            // never handed to the processor, so counting it would let a mostly-unchanged set hide a run whose every
            // attempted record failed. A record the processor itself returned as Skipped (e.g. field rules that changed
            // nothing) was evaluated, so it stays in the denominator.
            const attempted = this.attemptedOf(counts, ctx.tally);
            if (attempted > 0 && counts.Error > 0) {
                const errorRate = (counts.Error / attempted) * 100;
                if (errorRate > ctx.errorThreshold) {
                    ctx.setErrorMessage(`Circuit breaker: error rate ${errorRate.toFixed(1)}% of ${attempted} attempted records exceeded ${ctx.errorThreshold}%`);
                    return 'Failed';
                }
            }

            if (batch.Exhausted) {
                return 'Completed';
            }
            if (ctx.delayMs > 0) {
                await this.delay(ctx.delayMs);
            }
        }
    }

    /** Processes one batch with bounded concurrency, isolating per-record failures. */
    private async processBatch(records: RecordRef[], ctx: BatchLoopContext): Promise<void> {
        const { options, counts } = ctx;
        const recordContext: RecordProcessorContext = {
            contextUser: options.contextUser,
            provider: ctx.provider,
            processRunID: ctx.handle.ProcessRunID,
            recordProcessID: options.recordProcessID,
            entityID: options.entityID,
            overwriteHumanValues: options.overwriteHumanValues,
            DryRun: options.dryRun === true,
            TriggeredBy: ctx.triggeredBy,
        };

        // Watermark check: batch-evaluate unchanged records when skipUnchanged is active. A record is skipped only while
        // its outputs exist and the run keeps human values; the others are processed and their watermark refreshed.
        // A real run without skipUnchanged skips nothing but still reads its basis hashes, so a watermark records what
        // was processed (QF-I1).
        let watermarkDecisions: Map<string, WatermarkDecision> | undefined;
        if (this.readsWatermarks(options)) {
            try {
                let writeBackFields: string[] | undefined;
                const procWithWriteBack = options.processor as { getWriteBackFields?: () => string[]; OutputMapping?: OutputMappingConfig };
                if (typeof procWithWriteBack.getWriteBackFields === 'function') {
                    writeBackFields = procWithWriteBack.getWriteBackFields();
                } else if (procWithWriteBack.OutputMapping?.fields) {
                    writeBackFields = Object.keys(procWithWriteBack.OutputMapping.fields);
                }

                watermarkDecisions = await WatermarkService.Instance.CheckBatchWatermarks({
                    recordProcessID: options.recordProcessID,
                    entityID: options.entityID,
                    records,
                    strategy: options.watermarkStrategy ?? 'Checksum',
                    skipUnchanged: options.skipUnchanged,
                    lastRunAt: options.lastRunAt,
                    processor: options.processor,
                    contextUser: options.contextUser,
                    provider: ctx.provider,
                    processRunID: ctx.handle.ProcessRunID,
                    maxConcurrency: ctx.maxConcurrency,
                    excludeFields: writeBackFields,
                    ProcessorContext: recordContext,
                    OverwriteHumanValues: options.overwriteHumanValues === true,
                });
            } catch (e) {
                LogError(`RecordSetProcessor: Watermark check failed (proceeding without skipping): ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const skippedRecords = records.filter((r) => watermarkDecisions?.get(r.RecordID)?.shouldSkip);
        const eligibleRecords = records.filter((r) => !watermarkDecisions?.get(r.RecordID)?.shouldSkip);

        for (const record of skippedRecords) {
            counts.Processed++;
            counts.Skipped++;
            ctx.tally.WatermarkSkipped++;
            const skipResult: RecordResult = { Status: 'Skipped', DurationMs: 0 };
            await ctx.tracker.RecordResult(ctx.handle, record, skipResult, options.contextUser, ctx.provider);
        }

        if (eligibleRecords.length === 0) {
            return;
        }

        // Two-phase batch execution seam (e.g. InferProcessor dedup across distinct keys)
        if (typeof options.processor.ProcessBatch === 'function') {
            const batchStarted = Date.now();
            let batchResults: Map<string, RecordResult>;
            try {
                const rawBatchResults = await options.processor.ProcessBatch(eligibleRecords, recordContext);
                if (rawBatchResults instanceof Map) {
                    batchResults = rawBatchResults;
                } else if (Array.isArray(rawBatchResults)) {
                    batchResults = new Map();
                    for (let i = 0; i < eligibleRecords.length; i++) {
                        const res = rawBatchResults[i] ?? { Status: 'Failed', ErrorMessage: 'No result returned for record' };
                        batchResults.set(eligibleRecords[i].RecordID, res);
                    }
                } else {
                    batchResults = new Map();
                }
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : String(e);
                batchResults = new Map();
                for (const r of eligibleRecords) {
                    batchResults.set(r.RecordID, { Status: 'Failed', ErrorMessage: errMsg });
                }
            }

            const totalDuration = Date.now() - batchStarted;
            const perRecordDuration = Math.round(totalDuration / Math.max(1, eligibleRecords.length));
            if (options.dryRun === true) {
                await this.completeDryRunBatch(eligibleRecords, batchResults, options.processor, recordContext);
            }

            for (const record of eligibleRecords) {
                let result = batchResults.get(record.RecordID) ?? { Status: 'Failed', ErrorMessage: 'No result returned from batch processor' };
                if (result.DurationMs == null) {
                    result = { ...result, DurationMs: perRecordDuration };
                }
                counts.Processed++;
                if (result.Status === 'Succeeded') {
                    counts.Success++;
                    const decision = watermarkDecisions?.get(record.RecordID);
                    if (!options.dryRun && decision?.basisHash && options.recordProcessID && options.entityID) {
                        try {
                            await WatermarkService.Instance.UpdateWatermark({
                                recordProcessID: options.recordProcessID,
                                entityID: options.entityID,
                                recordID: record.RecordID,
                                basisHash: decision.basisHash,
                                existingWatermark: decision.existingWatermark,
                                contextUser: options.contextUser,
                                provider: ctx.provider,
                            });
                        } catch (e) {
                            LogError(`RecordSetProcessor: Failed to update watermark for record '${record.RecordID}': ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                } else if (result.Status === 'Skipped') {
                    counts.Skipped++;
                } else {
                    counts.Error++;
                }
                this.tallyRecord(result, ctx.tally);
                await ctx.tracker.RecordResult(ctx.handle, record, result, options.contextUser, ctx.provider);
            }
            return;
        }

        // A real run records each record as it finishes (a crash mid-batch loses nothing already done). A dry run whose
        // processor finishes its batches (CompleteDryRunBatch) holds the results until the batch is done: it wrote nothing,
        // so a crash mid-batch loses only those previews' detail rows.
        const deferred = options.dryRun === true && typeof options.processor.CompleteDryRunBatch === 'function'
            ? new Map<string, RecordResult>() : null;
        const worker = async (record: RecordRef): Promise<void> => {
            const decision = watermarkDecisions?.get(record.RecordID);
            const started = Date.now();
            let result: RecordResult;
            try {
                result = await options.processor.ProcessRecord(record, recordContext);
            } catch (e) {
                result = { Status: 'Failed', ErrorMessage: e instanceof Error ? e.message : String(e) };
            }
            if (result.DurationMs == null) {
                result.DurationMs = Date.now() - started;
            }
            counts.Processed++;
            if (result.Status === 'Succeeded') {
                counts.Success++;
                // Upsert watermark on success (if not dryRun and basisHash exists)
                if (!options.dryRun && decision?.basisHash && options.recordProcessID && options.entityID) {
                    try {
                        await WatermarkService.Instance.UpdateWatermark({
                            recordProcessID: options.recordProcessID,
                            entityID: options.entityID,
                            recordID: record.RecordID,
                            basisHash: decision.basisHash,
                            existingWatermark: decision.existingWatermark,
                            contextUser: options.contextUser,
                            provider: ctx.provider,
                        });
                    } catch (e) {
                        LogError(`RecordSetProcessor: Failed to update watermark for record '${record.RecordID}': ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            } else if (result.Status === 'Skipped') {
                counts.Skipped++;
            } else {
                counts.Error++;
            }
            this.tallyRecord(result, ctx.tally);
            if (deferred) {
                deferred.set(record.RecordID, result);
                return;
            }
            await ctx.tracker.RecordResult(ctx.handle, record, result, options.contextUser, ctx.provider);
        };

        await this.runWithConcurrency(eligibleRecords, ctx.maxConcurrency, worker);
        if (deferred) {
            // A dry run's batch is finished together (its previews named), then recorded in batch order
            await this.completeDryRunBatch(eligibleRecords, deferred, options.processor, recordContext);
            for (const record of eligibleRecords) {
                const result = deferred.get(record.RecordID);
                if (result) {
                    await ctx.tracker.RecordResult(ctx.handle, record, result, options.contextUser, ctx.provider);
                }
            }
        }
    }

    /**
     * Whether a batch's watermarks are read: on a run of a Record Process over an entity that skips unchanged records
     * (the skip decision), or on a real run that does not (no skip: the basis hashes its succeeded records' watermarks
     * are refreshed with, ruling QF-I1). A dry run without skipping writes no watermark, so it computes no hash.
     */
    private readsWatermarks(options: RecordSetProcessOptions): options is RecordSetProcessOptions & { recordProcessID: string; entityID: string } {
        if (!options.recordProcessID || !options.entityID) {
            return false;
        }
        return options.skipUnchanged === true || options.dryRun !== true;
    }

    /** Records the processor was handed: every processed record except those skipped on their watermark. */
    private attemptedOf(counts: RunCounts, tally: RunTally): number {
        return counts.Processed - tally.WatermarkSkipped;
    }

    /** Adds one record's outcome to the run's Feature Pipeline tally; a refused fidelity on any record wins. */
    private tallyRecord(result: RecordResult, tally: RunTally): void {
        if (result.Status === 'Succeeded') {
            if (result.DryRun === true) {
                // A dry run writes nothing: count it as previewed, never as a write
                tally.Previewed++;
            } else if (result.Outcome === 'Unchanged') {
                tally.Unchanged++;
            } else {
                tally.Upserted++;
            }
        } else if (result.Status === 'Failed' && result.FailureKind === 'RejectedInvalid') {
            tally.RejectedInvalid++;
        } else if (result.Status === 'Failed' && result.FailureKind === 'BelowConfidence') {
            tally.BelowConfidenceRejected++;
        }
        // Withheld outputs (a succeeded record) and a floor rejection (a failed one) both count as the floor acting
        if (result.FailureKind === 'BelowConfidence' || (result.Status === 'Succeeded' && (result.BelowConfidenceOutputs?.length || 0) > 0)) {
            tally.BelowConfidence++;
        }
        tally.HumanValuesPreserved += result.HumanValuesPreserved || 0;
        tally.Pin ||= result.PipelinePin || null;
        if (result.ParameterFidelity && (tally.ParameterFidelity === null || result.ParameterFidelity.Status === 'refused')) {
            tally.ParameterFidelity = result.ParameterFidelity;
        }
    }

    /**
     * The run's FeaturePipelineRunResult from its counts and tally. The pin is the records' pin, else the processor's
     * run-level pin, so a run whose records were all skipped still names the pin it ran under. A dry run also carries
     * the processor's run-level refusal, when the real run would be refused.
     */
    private featurePipelineResult(recordProcessID: string, counts: RunCounts, tally: RunTally,
        status: ProcessRunStatusValue, processor: RecordSetProcessOptions['processor'], dryRun: boolean): FeaturePipelineRunResult {
        const wouldRefuse = dryRun ? processor.CurrentRunRefusal?.() || null : null;
        return {
            ...(wouldRefuse ? { WouldRefuse: wouldRefuse } : {}),
            RecordProcessID: recordProcessID, Pin: tally.Pin || processor.CurrentRunPin?.() || null, ParameterFidelity: tally.ParameterFidelity,
            Attempted: this.attemptedOf(counts, tally), Upserted: tally.Upserted, Unchanged: tally.Unchanged, Previewed: tally.Previewed,
            RejectedInvalid: tally.RejectedInvalid, BelowConfidence: tally.BelowConfidence,
            Failed: counts.Error - tally.RejectedInvalid - tally.BelowConfidenceRejected, Skipped: counts.Skipped,
            HumanValuesPreserved: tally.HumanValuesPreserved, Status: status === 'Completed' ? 'completed' : 'failed',
        };
    }

    /** Runs `worker` over `items` with at most `limit` in flight at once. */
    private async runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
        if (limit <= 1) {
            for (const item of items) {
                await worker(item);
            }
            return;
        }
        let index = 0;
        const runNext = async (): Promise<void> => {
            while (index < items.length) {
                const current = index++;
                await worker(items[current]);
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
    }

    /**
     * Lets the processor finish a dry run's batch ({@link IRecordProcessor.CompleteDryRunBatch}) before its results are
     * recorded. A throw only costs the finishing (e.g. the previews show IDs instead of names): it is logged and the
     * results are recorded as they are.
     */
    private async completeDryRunBatch(records: RecordRef[], results: Map<string, RecordResult>,
        processor: RecordSetProcessOptions['processor'], context: RecordProcessorContext): Promise<void> {
        if (!processor.CompleteDryRunBatch) {
            return;
        }
        const outcomes = records.flatMap((record) => {
            const result = results.get(record.RecordID);
            return result ? [{ Record: record, Result: result }] : [];
        });
        try {
            await processor.CompleteDryRunBatch(outcomes, context);
        } catch (e) {
            LogError(`RecordSetProcessor: finishing the dry-run batch failed (its results are recorded as they are): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Invokes the budget-gate hook, treating a thrown hook as non-fatal (continue). */
    private async safeAfterBatch(
        hook: NonNullable<RecordSetProcessOptions['onAfterBatch']>,
        records: RecordRef[],
        processed: number,
    ): Promise<{ continue: boolean; reason?: string } | null> {
        try {
            return await hook(records, processed);
        } catch (e) {
            LogError(`RecordSetProcessor: onAfterBatch hook threw (continuing): ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/** Internal mutable context threaded through the batch loop. */
interface BatchLoopContext {
    options: RecordSetProcessOptions;
    source: RecordSetProcessOptions['source'];
    processor: RecordSetProcessOptions['processor'];
    tracker: IProcessRunTracker;
    handle: RunHandle;
    provider: IMetadataProvider;
    /** What triggered the run (the run header's `TriggeredBy`), handed to every record's context. */
    triggeredBy: TriggeredByValue;
    batchSize: number;
    maxConcurrency: number;
    errorThreshold: number;
    delayMs: number;
    rateLimiter?: RateLimiter;
    counts: RunCounts;
    /** The run's tally, kept for every run; its Feature Pipeline counts are reported for runs with `FeaturePipeline`. */
    tally: RunTally;
    getCursor: () => ProcessCursor | undefined;
    setCursor: (c: ProcessCursor) => void;
    getTotal: () => number | null;
    setTotal: (t: number) => void;
    setErrorMessage: (m: string) => void;
}

/** What a run counts beyond {@link RunCounts}: its watermark skips (for the breaker) and its {@link FeaturePipelineRunResult} counts. */
interface RunTally {
    /** Records skipped on their watermark without being handed to the processor (not attempted). */
    WatermarkSkipped: number;
    Upserted: number;
    Unchanged: number;
    Previewed: number;
    RejectedInvalid: number;
    /** Records the confidence floor acted on (withheld outputs or a floor rejection): FeaturePipelineRunResult.BelowConfidence. */
    BelowConfidence: number;
    /** Records failed by a confidence floor (`FailureKind` `BelowConfidence`), so `Failed` can leave them out. */
    BelowConfidenceRejected: number;
    HumanValuesPreserved: number;
    Pin: FeaturePipelineRunPin | null;
    ParameterFidelity: ParameterFidelity | null;
}
