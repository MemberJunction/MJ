/**
 * @fileoverview The Record Set Processor engine — the single substrate every set-iterating job
 * routes through. It owns batching, bounded concurrency, optional rate limiting, an error-rate
 * circuit breaker, a budget-gate hook, progress events, the pause/cancel handshake, resume from a
 * checkpoint, and per-record error isolation — while delegating *what to iterate* (source), *what
 * to do* (processor), and *where to persist* (tracker) to pluggable seams.
 * @module @memberjunction/record-set-processor
 */

import { BaseSingleton } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import {
    IProcessRunTracker,
    ProcessCursor,
    ProcessRunMeta,
    ProcessRunResult,
    ProcessRunStatusValue,
    ProcessRunSummary,
    RecordRef,
    RecordResult,
    RecordSetProcessOptions,
    RunCounts,
    RunHandle,
} from '@memberjunction/record-set-processor-base';
import { RateLimiter } from './RateLimiter';
import { GenericProcessRunTracker } from './trackers/GenericProcessRunTracker';

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
        let cursor = shouldResume ? await tracker.LoadResumeCursor(handle, contextUser, provider) : undefined;
        let total: number | null = null;
        let status: ProcessRunStatusValue = 'Running';
        let errorMessage: string | undefined;
        const startTime = new Date();

        try {
            status = await this.runBatchLoop({
                options, source, processor, tracker, handle, provider,
                batchSize, maxConcurrency, errorThreshold, delayMs, rateLimiter,
                counts,
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

            // Error-rate circuit breaker.
            if (counts.Processed > 0 && counts.Error > 0) {
                const errorRate = (counts.Error / counts.Processed) * 100;
                if (errorRate > ctx.errorThreshold) {
                    ctx.setErrorMessage(`Circuit breaker: error rate ${errorRate.toFixed(1)}% exceeded ${ctx.errorThreshold}%`);
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
        const recordContext = { contextUser: options.contextUser, provider: ctx.provider, processRunID: ctx.handle.ProcessRunID };

        const worker = async (record: RecordRef): Promise<void> => {
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
            } else if (result.Status === 'Skipped') {
                counts.Skipped++;
            } else {
                counts.Error++;
            }
            await ctx.tracker.RecordResult(ctx.handle, record, result, options.contextUser, ctx.provider);
        };

        await this.runWithConcurrency(records, ctx.maxConcurrency, worker);
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
    batchSize: number;
    maxConcurrency: number;
    errorThreshold: number;
    delayMs: number;
    rateLimiter?: RateLimiter;
    counts: RunCounts;
    getCursor: () => ProcessCursor | undefined;
    setCursor: (c: ProcessCursor) => void;
    getTotal: () => number | null;
    setTotal: (t: number) => void;
    setErrorMessage: (m: string) => void;
}
