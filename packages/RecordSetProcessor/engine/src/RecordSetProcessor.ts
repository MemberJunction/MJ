/**
 * @fileoverview The Record Set Processor engine — the single substrate every set-iterating job
 * routes through. It owns batching, bounded concurrency, optional rate limiting, an error-rate
 * circuit breaker, a budget-gate hook, progress events, the pause/cancel handshake, resume from a
 * checkpoint, and per-record error isolation — while delegating *what to iterate* (source), *what
 * to do* (processor), and *where to persist* (tracker) to pluggable seams.
 * @module @memberjunction/record-set-processor
 */

import { BaseSingleton } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata } from '@memberjunction/core';
import {
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
     */
    public async Process(options: RecordSetProcessOptions): Promise<ProcessRunResult> {
        const { Source: source, Processor: processor, ContextUser: contextUser } = options;
        const provider: IMetadataProvider = options.Provider ?? Metadata.Provider;
        const tracker: IProcessRunTracker = options.Tracker ?? new GenericProcessRunTracker();
        const batchSize = options.BatchSize ?? DEFAULT_BATCH_SIZE;
        const maxConcurrency = Math.max(1, options.MaxConcurrency ?? 1);
        const errorThreshold = options.ErrorThresholdPercent ?? DEFAULT_ERROR_THRESHOLD;
        const delayMs = options.DelayBetweenBatchesMs ?? 0;
        const shouldResume = options.Resume ?? true;
        const rateLimiter = options.RateLimit
            ? new RateLimiter({ RequestsPerMinute: options.RateLimit.RequestsPerMinute, TokensPerMinute: options.RateLimit.TokensPerMinute })
            : undefined;

        const descriptor = source.Describe();
        const meta: ProcessRunMeta = {
            RecordProcessID: options.RecordProcessID,
            ScheduledJobRunID: options.ScheduledJobRunID,
            EntityID: options.EntityID ?? descriptor.EntityID,
            TriggeredBy: options.TriggeredBy ?? 'Manual',
            SourceType: descriptor.SourceType,
            SourceID: descriptor.SourceID,
            SourceFilter: descriptor.SourceFilter,
            BatchSize: batchSize,
            Configuration: options.Configuration,
            DryRun: options.DryRun,
        };

        const handle = await tracker.BeginRun(meta, contextUser, provider);
        const counts: RunCounts = { Processed: 0, Success: 0, Error: 0, Skipped: 0 };
        const tally: RunTally = {
            WatermarkSkipped: 0,
            RejectedInvalid: 0,
        };
        const collectedResults: RecordResult[] | undefined =
            typeof processor.BuildRunSummary === 'function' ? [] : undefined;
        const logRowsInFlight = new Set<Promise<void>>();
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
                    ContextUser: contextUser,
                    Provider: provider,
                    ProcessRunID: handle.ProcessRunID,
                    RecordProcessID: options.RecordProcessID,
                    EntityID: meta.EntityID,
                    DryRun: options.DryRun === true,
                    TriggeredBy: meta.TriggeredBy,
                });
            }
            status = await this.runBatchLoop({
                options, source, processor, tracker, handle, provider, triggeredBy: meta.TriggeredBy,
                batchSize, maxConcurrency, errorThreshold, delayMs, rateLimiter,
                counts,
                tally,
                collectedResults,
                logRowsInFlight,
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
        if (options.Processor.FailRunOnRecordError && status === 'Completed' && counts.Error > 0) {
            status = 'Failed';
            errorMessage = `${counts.Error} of ${attempted} attempted records failed (${tally.RejectedInvalid} rejected by output constraints)`;
        }
        const processorSummary =
            typeof options.Processor.BuildRunSummary === 'function' && collectedResults
                ? options.Processor.BuildRunSummary({
                      RecordProcessID: options.RecordProcessID,
                      Counts: counts,
                      Status: status,
                      DryRun: options.DryRun === true,
                      Results: collectedResults,
                  })
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
            ...(processorSummary?.ResultSummary !== undefined ? { ResultSummary: processorSummary.ResultSummary } : {}),
            ...(processorSummary?.WouldRefuse !== undefined ? { WouldRefuse: processorSummary.WouldRefuse } : {}),
        };
        // The loop never waits for a record's Action log row (#6045); the run does, once, here. A tracker that
        // writes a detail per record already waits on it, but one that writes none (NoOpTracker) would otherwise
        // let Process() return with log writes still queued, and a caller closing its pool would lose them.
        await Promise.all(logRowsInFlight);
        await tracker.CompleteRun(handle, summary, contextUser, provider);
        return { ...summary, ProcessRunID: handle.ProcessRunID };
    }

    /** The core batch loop. Returns the terminal status. */
    private async runBatchLoop(ctx: BatchLoopContext): Promise<ProcessRunStatusValue> {
        const { options, source, batchSize, counts } = ctx;
        const contextUser = options.ContextUser;

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
            if (options.MaxRecords != null) {
                const remaining = options.MaxRecords - counts.Processed;
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

            options.OnProgress?.({ ...counts, Total: ctx.getTotal() });

            // Checkpoint + pause/cancel handshake.
            ctx.setCursor(batch.NextCursor);
            const shouldContinue = await ctx.tracker.Checkpoint(ctx.handle, batch.NextCursor, counts, contextUser, ctx.provider);
            if (!shouldContinue) {
                return 'Paused';
            }

            // Budget gate.
            if (options.OnAfterBatch) {
                const verdict = await this.safeAfterBatch(options.OnAfterBatch, records, counts.Processed);
                if (verdict && !verdict.Continue) {
                    ctx.setErrorMessage(verdict.Reason ? `Auto-paused: ${verdict.Reason}` : 'Auto-paused: budget exceeded');
                    return 'Paused';
                }
            }

            // Error-rate circuit breaker, over the records handed to the processor (watermark skips excluded).
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
            ContextUser: options.ContextUser,
            Provider: ctx.provider,
            ProcessRunID: ctx.handle.ProcessRunID,
            RecordProcessID: options.RecordProcessID,
            EntityID: options.EntityID,
            OverwriteHumanValues: options.OverwriteHumanValues,
            DryRun: options.DryRun === true,
            TriggeredBy: ctx.triggeredBy,
        };

        // P1-7b Watermark check: batch-evaluate unchanged records when SkipUnchanged is active (a real run without it
        // still reads basis hashes, so its watermarks record what was processed)
        let watermarkDecisions: Map<string, WatermarkDecision> | undefined;
        if (this.readsWatermarks(options)) {
            try {
                let writeBackFields: string[] | undefined;
                const procWithWriteBack = options.Processor as { GetWriteBackFields?: () => string[]; getWriteBackFields?: () => string[]; OutputMapping?: OutputMappingConfig };
                if (typeof procWithWriteBack.GetWriteBackFields === 'function') {
                    writeBackFields = procWithWriteBack.GetWriteBackFields();
                } else if (typeof procWithWriteBack.getWriteBackFields === 'function') {
                    writeBackFields = procWithWriteBack.getWriteBackFields();
                } else if (procWithWriteBack.OutputMapping?.fields) {
                    writeBackFields = Object.keys(procWithWriteBack.OutputMapping.fields);
                }

                watermarkDecisions = await WatermarkService.Instance.CheckBatchWatermarks({
                    RecordProcessID: options.RecordProcessID,
                    EntityID: options.EntityID,
                    Records: records,
                    Strategy: options.WatermarkStrategy ?? 'Checksum',
                    SkipUnchanged: options.SkipUnchanged,
                    LastRunAt: options.LastRunAt,
                    Processor: options.Processor,
                    ContextUser: options.ContextUser,
                    Provider: ctx.provider,
                    ProcessRunID: ctx.handle.ProcessRunID,
                    MaxConcurrency: ctx.maxConcurrency,
                    ExcludeFields: writeBackFields,
                    OverwriteHumanValues: options.OverwriteHumanValues === true,
                });
            } catch (e) {
                LogError(`RecordSetProcessor: Watermark check failed (proceeding without skipping): ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const skippedRecords = records.filter((r) => watermarkDecisions?.get(r.RecordID)?.ShouldSkip);
        const eligibleRecords = records.filter((r) => !watermarkDecisions?.get(r.RecordID)?.ShouldSkip);

        for (const record of skippedRecords) {
            counts.Processed++;
            counts.Skipped++;
            ctx.tally.WatermarkSkipped++;
            const skipResult: RecordResult = { Status: 'Skipped', DurationMs: 0 };
            await ctx.tracker.RecordResult(ctx.handle, record, skipResult, options.ContextUser, ctx.provider);
        }

        if (eligibleRecords.length === 0) {
            return;
        }

        // P1-7c Two-phase batch execution seam (e.g. InferProcessor dedup across distinct keys)
        if (typeof options.Processor.ProcessBatch === 'function') {
            const batchStarted = Date.now();
            let batchResults: Map<string, RecordResult>;
            try {
                const rawBatchResults = await options.Processor.ProcessBatch(eligibleRecords, recordContext);
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

            for (const record of eligibleRecords) {
                let result = batchResults.get(record.RecordID) ?? { Status: 'Failed', ErrorMessage: 'No result returned from batch processor' };
                if (result.DurationMs == null) {
                    result = { ...result, DurationMs: perRecordDuration };
                }
                counts.Processed++;
                if (result.Status === 'Succeeded') {
                    counts.Success++;
                    const decision = watermarkDecisions?.get(record.RecordID);
                    if (!options.DryRun && decision?.BasisHash && options.RecordProcessID && options.EntityID) {
                        try {
                            await WatermarkService.Instance.UpdateWatermark({
                                RecordProcessID: options.RecordProcessID,
                                EntityID: options.EntityID,
                                RecordID: record.RecordID,
                                BasisHash: decision.BasisHash,
                                ExistingWatermark: decision.ExistingWatermark,
                                ContextUser: options.ContextUser,
                                Provider: ctx.provider,
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
                ctx.collectedResults?.push(result);
                this.holdRunForLogRow(result, ctx.logRowsInFlight);
                await ctx.tracker.RecordResult(ctx.handle, record, result, options.ContextUser, ctx.provider);
            }
            return;
        }

        const worker = async (record: RecordRef): Promise<void> => {
            const decision = watermarkDecisions?.get(record.RecordID);
            const started = Date.now();
            let result: RecordResult;
            try {
                result = await options.Processor.ProcessRecord(record, recordContext);
            } catch (e) {
                result = { Status: 'Failed', ErrorMessage: e instanceof Error ? e.message : String(e) };
            }
            if (result.DurationMs == null) {
                result.DurationMs = Date.now() - started;
            }
            counts.Processed++;
            if (result.Status === 'Succeeded') {
                counts.Success++;
                // Upsert watermark on success (if not DryRun and BasisHash exists)
                if (!options.DryRun && decision?.BasisHash && options.RecordProcessID && options.EntityID) {
                    try {
                        await WatermarkService.Instance.UpdateWatermark({
                            RecordProcessID: options.RecordProcessID,
                            EntityID: options.EntityID,
                            RecordID: record.RecordID,
                            BasisHash: decision.BasisHash,
                            ExistingWatermark: decision.ExistingWatermark,
                            ContextUser: options.ContextUser,
                            Provider: ctx.provider,
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
            ctx.collectedResults?.push(result);
            this.holdRunForLogRow(result, ctx.logRowsInFlight);
            await ctx.tracker.RecordResult(ctx.handle, record, result, options.ContextUser, ctx.provider);
        };

        await this.runWithConcurrency(eligibleRecords, ctx.maxConcurrency, worker);
    }

    /**
     * Whether a batch's watermarks are read: a run that skips unchanged records, or a real run that does not (its
     * succeeded records' watermarks are refreshed). A dry run without skipping writes no watermark.
     */
    private readsWatermarks(options: RecordSetProcessOptions): options is RecordSetProcessOptions & { RecordProcessID: string; EntityID: string } {
        if (!options.RecordProcessID || !options.EntityID) {
            return false;
        }
        return options.SkipUnchanged === true || options.DryRun !== true;
    }

    /** Records the processor was handed: every processed record except those skipped on their watermark. */
    private attemptedOf(counts: RunCounts, tally: RunTally): number {
        return counts.Processed - tally.WatermarkSkipped;
    }

    /**
     * Keeps a result's pending Action log row in the run's in-flight set until it settles, so Process() can await
     * it before CompleteRun without the per-record loop ever waiting. Each entry removes itself, so the set holds
     * only rows still in flight.
     */
    private holdRunForLogRow(result: RecordResult, inFlight: Set<Promise<void>>): void {
        const persisted = result.ActionExecutionLogPersisted;
        if (!persisted) {
            return;
        }
        const held: Promise<void> = persisted.then(() => { inFlight.delete(held); }, () => { inFlight.delete(held); });
        inFlight.add(held);
    }

    /** Adds one record's outcome to the run's tally. */
    private tallyRecord(result: RecordResult, tally: RunTally): void {
        if (result.Status === 'Failed' && result.FailureKind === 'RejectedInvalid') {
            tally.RejectedInvalid++;
        }
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

    /** Invokes the budget-gate hook, treating a thrown hook as non-fatal (continue). */
    private async safeAfterBatch(
        hook: NonNullable<RecordSetProcessOptions['OnAfterBatch']>,
        records: RecordRef[],
        processed: number,
    ): Promise<{ Continue: boolean; Reason?: string } | null> {
        try {
            return await hook(records, processed);
        } catch (e) {
            LogError(`RecordSetProcessor: OnAfterBatch hook threw (continuing): ${e instanceof Error ? e.message : String(e)}`);
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
    source: RecordSetProcessOptions['Source'];
    processor: RecordSetProcessOptions['Processor'];
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
    tally: RunTally;
    collectedResults?: RecordResult[];
    /** Action log rows the run's results named that have not landed yet; awaited before CompleteRun. */
    logRowsInFlight: Set<Promise<void>>;
    getCursor: () => ProcessCursor | undefined;
    setCursor: (c: ProcessCursor) => void;
    getTotal: () => number | null;
    setTotal: (t: number) => void;
    setErrorMessage: (m: string) => void;
}

/** What a run counts beyond {@link RunCounts}: its watermark skips (for the breaker) and rejected-invalid failures. */
interface RunTally {
    /** Records skipped on their watermark without being handed to the processor (not attempted). */
    WatermarkSkipped: number;
    RejectedInvalid: number;
}
