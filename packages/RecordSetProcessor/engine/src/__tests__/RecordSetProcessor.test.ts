/**
 * Unit tests for the RecordSetProcessor engine loop: batching, counts, per-record error isolation,
 * circuit breaker, pause/cancel, budget gate, maxRecords, concurrency, progress, and resume.
 * No database — uses the real ArraySource + FunctionRecordProcessor and a spy tracker.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArraySource,
    IProcessRunTracker,
    ProcessCursor,
    ProcessRunSummary,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
    RunHandle,
} from '@memberjunction/record-set-processor-base';
import { BATCH_WATERMARK_WRITE_CONCURRENCY, FunctionRecordProcessor, NoOpTracker, RecordSetProcessor } from '../index';
import { WatermarkService, type WatermarkDecision } from '../watermark/WatermarkService';

const USER = {} as UserInfo;
const PROVIDER = {} as IMetadataProvider;
const recs = (n: number): RecordRef[] => Array.from({ length: n }, (_, i) => ({ EntityID: 'E', RecordID: `r${i}` }));
const ok = (): RecordResult => ({ Status: 'Succeeded' });
const engine = RecordSetProcessor.Instance;

/** A tracker that records calls and can simulate cancellation / resume. */
class SpyTracker implements IProcessRunTracker {
    public details: Array<{ record: RecordRef; result: RecordResult }> = [];
    public checkpoints = 0;
    public completed?: ProcessRunSummary;
    public resumeCursor?: ProcessCursor;
    public lastCursor?: ProcessCursor;
    /** Checkpoint returns false (pause) once this many checkpoints have occurred. */
    public pauseAfter = Number.POSITIVE_INFINITY;

    public async BeginRun(): Promise<RunHandle> {
        return { ProcessRunID: 'RUN-1' };
    }
    public async RecordResult(_h: RunHandle, record: RecordRef, result: RecordResult): Promise<void> {
        this.details.push({ record, result });
    }
    public async Checkpoint(_h: RunHandle, cursor: ProcessCursor): Promise<boolean> {
        this.checkpoints++;
        this.lastCursor = cursor;
        return this.checkpoints < this.pauseAfter;
    }
    public async CompleteRun(_h: RunHandle, summary: ProcessRunSummary): Promise<void> {
        this.completed = summary;
    }
    public async LoadResumeCursor(): Promise<ProcessCursor | undefined> {
        return this.resumeCursor;
    }
}

describe('RecordSetProcessor.Process', () => {
    it('passes DryRun and TriggeredBy to every record and to Preflight', async () => {
        const seen: Array<Pick<RecordProcessorContext, 'DryRun' | 'TriggeredBy'>> = [];
        let preflight: Pick<RecordProcessorContext, 'DryRun' | 'TriggeredBy'> | undefined;
        const processor = {
            ProcessRecord: async (_r: RecordRef, ctx: RecordProcessorContext) => { seen.push({ DryRun: ctx.DryRun, TriggeredBy: ctx.TriggeredBy }); return ok(); },
            Preflight: async (ctx: RecordProcessorContext) => { preflight = { DryRun: ctx.DryRun, TriggeredBy: ctx.TriggeredBy }; },
        };
        await engine.Process({ Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: new NoOpTracker(), ContextUser: USER, Provider: PROVIDER, DryRun: true, TriggeredBy: 'Schedule' });
        expect(seen).toEqual([{ DryRun: true, TriggeredBy: 'Schedule' }, { DryRun: true, TriggeredBy: 'Schedule' }]);
        expect(preflight).toEqual({ DryRun: true, TriggeredBy: 'Schedule' });
    });

    it('processes every record across batches and reports Completed with correct counts', async () => {
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
        });
        expect(result.Status).toBe('Completed');
        expect(result.Processed).toBe(5);
        expect(result.Success).toBe(5);
        expect(result.Error).toBe(0);
        expect(result.Total).toBe(5);
        expect(result.ProcessRunID).toBeUndefined(); // NoOpTracker persists nothing
    });

    it('isolates a single record failure without aborting the run (below the breaker threshold)', async () => {
        const processor = new FunctionRecordProcessor((r) =>
            r.RecordID === 'r2' ? { Status: 'Failed', ErrorMessage: 'nope' } : ok());
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: processor,
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 5, // one batch → 1/5 = 20%, not > 20% → continues
        });
        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(4);
        expect(result.Error).toBe(1);
    });

    it('trips the circuit breaker when the error rate exceeds the threshold', async () => {
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: new FunctionRecordProcessor(() => ({ Status: 'Failed', ErrorMessage: 'x' })),
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 5,
            ErrorThresholdPercent: 20,
        });
        expect(result.Status).toBe('Failed');
        expect(result.Error).toBe(5);
        expect(result.ErrorMessage).toContain('Circuit breaker');
    });

    it('captures a thrown processor as a Failed record result', async () => {
        const tracker = new SpyTracker();
        const result = await engine.Process({
            Source: new ArraySource(recs(1), 'E'),
            Processor: new FunctionRecordProcessor(() => { throw new Error('boom'); }),
            Tracker: tracker,
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 1,
        });
        expect(result.Status).toBe('Failed'); // 1/1 = 100% > 20%
        expect(tracker.details[0].result.Status).toBe('Failed');
        expect(tracker.details[0].result.ErrorMessage).toContain('boom');
        expect(tracker.details[0].result.DurationMs).toBeGreaterThanOrEqual(0);
    });

    it('refuses the whole run up front when the processor Preflight throws — no record is processed', async () => {
        const tracker = new SpyTracker();
        let processed = 0;
        const inner = new FunctionRecordProcessor(() => { processed++; return ok(); });
        const processor = {
            ProcessRecord: (r: RecordRef, c: Parameters<typeof inner.ProcessRecord>[1]) => inner.ProcessRecord(r, c),
            Preflight: async () => { throw new Error('ML Model needs training'); },
        };
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: processor,
            Tracker: tracker,
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
        });
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toBe('ML Model needs training');
        expect(result.Processed).toBe(0);
        expect(processed).toBe(0);
        expect(tracker.details).toHaveLength(0);
        expect(tracker.completed?.Status).toBe('Failed'); // the run is still recorded honestly
        expect(consoleError).toHaveBeenCalledWith('RecordSetProcessor: run failed: ML Model needs training');
    });

    it('runs normally when the processor Preflight passes, calling it exactly once', async () => {
        let preflights = 0;
        const inner = new FunctionRecordProcessor(ok);
        const processor = {
            ProcessRecord: (r: RecordRef, c: Parameters<typeof inner.ProcessRecord>[1]) => inner.ProcessRecord(r, c),
            Preflight: async () => { preflights++; },
        };
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: processor,
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
        });
        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(5);
        expect(preflights).toBe(1);
    });

    it('pauses gracefully when the tracker requests cancellation at a checkpoint', async () => {
        const tracker = new SpyTracker();
        tracker.pauseAfter = 1; // first checkpoint returns false
        const result = await engine.Process({
            Source: new ArraySource(recs(6), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: tracker,
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBe(2);
        expect(tracker.completed?.Status).toBe('Paused');
    });

    it('pauses when the budget-gate hook declines to continue', async () => {
        const result = await engine.Process({
            Source: new ArraySource(recs(6), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
            OnAfterBatch: async () => ({ Continue: false, Reason: 'cost cap' }),
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBe(2);
        expect(result.ErrorMessage).toContain('cost cap');
    });

    it('honors the maxRecords cap by trimming the final batch', async () => {
        const result = await engine.Process({
            Source: new ArraySource(recs(10), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 3,
            MaxRecords: 5,
        });
        expect(result.Status).toBe('Completed');
        expect(result.Processed).toBe(5);
    });

    it('processes every record exactly once with concurrency > 1', async () => {
        const tracker = new SpyTracker();
        await engine.Process({
            Source: new ArraySource(recs(10), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: tracker,
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 10,
            MaxConcurrency: 4,
        });
        expect(tracker.details).toHaveLength(10);
        expect(new Set(tracker.details.map((d) => d.record.RecordID)).size).toBe(10);
    });

    it('emits cumulative progress after each batch', async () => {
        const progress: number[] = [];
        await engine.Process({
            Source: new ArraySource(recs(4), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: new NoOpTracker(),
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 2,
            OnProgress: (p) => progress.push(p.Processed),
        });
        expect(progress).toEqual([2, 4]);
    });

    it('resumes from a tracker-supplied cursor, skipping already-processed records', async () => {
        const tracker = new SpyTracker();
        tracker.resumeCursor = { Offset: 3 };
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'),
            Processor: new FunctionRecordProcessor(ok),
            Tracker: tracker,
            ContextUser: USER,
            Provider: PROVIDER,
            BatchSize: 10,
            Resume: true,
        });
        expect(result.Processed).toBe(2); // only r3, r4 remain after offset 3
        expect(tracker.details.map((d) => d.record.RecordID)).toEqual(['r3', 'r4']);
    });

    describe('a processor that declares MaxConcurrentBatches runs that many batches at once', () => {
        /** A batch processor that records how many of its batches are in flight; batch `failing` (1-based start order) fails every record. */
        const batchProcessor = (limit: number | undefined, failing: number | null = null) => {
            const state = { inFlight: 0, peak: 0, started: 0 };
            return {
                state,
                processor: {
                    MaxConcurrentBatches: limit,
                    ProcessRecord: async (): Promise<RecordResult> => ok(),
                    ProcessBatch: async (records: RecordRef[]): Promise<RecordResult[]> => {
                        const n = ++state.started;
                        state.inFlight++;
                        state.peak = Math.max(state.peak, state.inFlight);
                        await new Promise((r) => setTimeout(r, 5));
                        state.inFlight--;
                        return records.map((r) => (n === failing ? { Status: 'Failed', ErrorMessage: `batch ${n}` } : Number(r.RecordID.slice(1)) % 7 === 0 ? { Status: 'Skipped' } : ok()));
                    },
                },
            };
        };
        const run = (p: ReturnType<typeof batchProcessor>['processor'], n: number) => engine.Process({ Source: new ArraySource(recs(n), 'E'), Processor: p,
            Tracker: new NoOpTracker(), ContextUser: USER, Provider: PROVIDER, BatchSize: 3, ErrorThresholdPercent: 100 });

        it('a batch that rejects fails the run only after every batch of its wave has settled: nothing is written after the run closes', async () => {
            const events: string[] = [];
            const tracker = {
                BeginRun: async () => ({ ProcessRunID: 'PR' }),
                RecordResult: async (_h: unknown, record: RecordRef) => {
                    if (record.RecordID === 'r0') throw new Error('detail write failed');
                    events.push(`result ${record.RecordID}`);
                },
                Checkpoint: async () => true,
                CompleteRun: async (_h: unknown, summary: { Status: string }) => { events.push(`complete ${summary.Status}`); },
                LoadResumeCursor: async () => undefined,
            };
            const processor = {
                MaxConcurrentBatches: 2,
                ProcessRecord: async (): Promise<RecordResult> => ok(),
                ProcessBatch: async (records: RecordRef[]): Promise<RecordResult[]> => {
                    if (records[0].RecordID !== 'r0') await new Promise((r) => setTimeout(r, 30)); // the second batch is still writing
                    return records.map(() => ok());
                },
            };
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const result = await engine.Process({ Source: new ArraySource(recs(6), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER, Provider: PROVIDER, BatchSize: 3 });
            errors.mockRestore();
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('detail write failed');
            expect(events[events.length - 1]).toBe('complete Failed');
            expect(events.filter((e) => e.startsWith('result r'))).toEqual(['result r3', 'result r4', 'result r5']);
        });

        it('never has more than MaxConcurrentBatches batches in flight, and has more than one', async () => {
            const { state, processor } = batchProcessor(4);
            const result = await run(processor, 30);
            expect([result.Status, result.Processed, state.started]).toEqual(['Completed', 30, 10]);
            expect(state.peak).toBeGreaterThan(1);
            expect(state.peak).toBeLessThanOrEqual(4);
        });

        it('ends with the counts of the serial run on the same input', async () => {
            const serial = await run(batchProcessor(undefined).processor, 31);
            const parallel = await run(batchProcessor(4).processor, 31);
            const pick = (r: typeof serial) => [r.Status, r.Total, r.Processed, r.Success, r.Error, r.Skipped];
            expect(pick(parallel)).toEqual(pick(serial));
            expect(serial.Processed).toBe(31);
        });

        it('a failing batch fails its own records only; its wave finishes, and the run goes on to the breaker as a serial run does', async () => {
            const serial = await run(batchProcessor(undefined, 2).processor, 30);
            const parallel = await run(batchProcessor(4, 2).processor, 30);
            const pick = (r: typeof serial) => [r.Status, r.Processed, r.Success, r.Error, r.Skipped];
            expect(pick(parallel)).toEqual(pick(serial));
            expect(parallel.Error).toBe(3);
        });
    });

    describe('the batch path writes its records\' watermarks with bounded concurrency', () => {
        afterEach(() => vi.restoreAllMocks());

        it('writes every succeeded record\'s watermark once, at most BATCH_WATERMARK_WRITE_CONCURRENCY at a time, and more than one at a time', async () => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.Records.map((r) => [r.RecordID, { ShouldSkip: false, BasisHash: `h-${r.RecordID}` }])));
            let inFlight = 0;
            let peak = 0;
            const written: string[] = [];
            vi.spyOn(WatermarkService.Instance, 'UpdateWatermark').mockImplementation(async (p) => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 5));
                written.push(`${p.RecordID}:${p.BasisHash}`);
                inFlight--;
            });
            const processor = {
                ProcessRecord: async (): Promise<RecordResult> => ok(),
                ProcessBatch: async (records: RecordRef[]): Promise<RecordResult[]> => records.map((r) => (r.RecordID === 'r3' ? { Status: 'Failed', ErrorMessage: 'x' } : ok())),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(30), 'E'), Processor: processor, Tracker: new NoOpTracker(),
                ContextUser: USER, Provider: PROVIDER, BatchSize: 30, RecordProcessID: 'RP', EntityID: 'E', ErrorThresholdPercent: 100 });
            expect(result.Processed).toBe(30);
            expect([...written].sort()).toEqual(recs(30).filter((r) => r.RecordID !== 'r3').map((r) => `${r.RecordID}:h-${r.RecordID}`).sort());
            expect(peak).toBeGreaterThan(1);
            expect(peak).toBeLessThanOrEqual(BATCH_WATERMARK_WRITE_CONCURRENCY);
        });
    });

    describe('the breaker over attempted records', () => {
        afterEach(() => vi.restoreAllMocks());
        /** The engine skips records r0..r(n-1) on their watermark, without handing them to the processor. */
        const watermarkSkips = (n: number): void => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.Records.map((r) => [r.RecordID, { ShouldSkip: Number(r.RecordID.slice(1)) < n }])));
        };

        it('27 records, 25 skipped on their watermark, 2 failed ends Failed', async () => {
            watermarkSkips(25);
            const processor = new FunctionRecordProcessor(() => ({ Status: 'Failed', ErrorMessage: 'UNIQUE KEY' }));
            const result = await engine.Process({ Source: new ArraySource(recs(27), 'E'), Processor: processor, Tracker: new NoOpTracker(),
                ContextUser: USER, Provider: PROVIDER, BatchSize: 27, SkipUnchanged: true, RecordProcessID: 'RP', EntityID: 'E' });
            expect(result.Skipped).toBe(25);
            expect(result.Error).toBe(2);
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('100.0% of 2 attempted records');
        });

        it('counts records the processor returned as Skipped as attempted: 1000 records, 97% no-op, 1% failed completes', async () => {
            // Field-rules shape: every record is evaluated; most change nothing (Skipped), a few fail
            const processor = new FunctionRecordProcessor((r) => {
                const i = Number(r.RecordID.slice(1)) % 100;
                if (i === 0) return { Status: 'Failed', ErrorMessage: 'validation failed' };
                return i < 3 ? ok() : { Status: 'Skipped' };
            });
            const result = await engine.Process({ Source: new ArraySource(recs(1000), 'E'), Processor: processor, Tracker: new NoOpTracker(),
                ContextUser: USER, Provider: PROVIDER, BatchSize: 100 });
            expect(result.Status).toBe('Completed');
            expect(result.Processed).toBe(1000);
            expect(result.Skipped).toBe(970);
            expect(result.Error).toBe(10);
        });
    });

    describe('Processor FailRunOnRecordError and BuildRunSummary hooks', () => {
        it('ends a run Failed when FailRunOnRecordError is true and any record failed, and populates ResultSummary from BuildRunSummary', async () => {
            const tracker = new SpyTracker();
            const processor = {
                FailRunOnRecordError: true,
                ProcessRecord: async (r: RecordRef): Promise<RecordResult> => {
                    if (r.RecordID === 'r0') return { Status: 'Failed', ErrorMessage: 'Constraint violation', FailureKind: 'RejectedInvalid' };
                    return { Status: 'Succeeded' };
                },
                BuildRunSummary: ({ RecordProcessID, Status, Results }: {
                    RecordProcessID?: string;
                    Status: string;
                    Results: RecordResult[];
                }) => ({
                    ResultSummary: { RecordProcessID, Attempted: Results.length, Status },
                }),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(10), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER,
                Provider: PROVIDER, BatchSize: 10, RecordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe('1 of 10 attempted records failed (1 rejected by output constraints)');
            expect(tracker.completed?.ResultSummary).toEqual({
                RecordProcessID: 'RP-1', Attempted: 10, Status: 'Failed',
            });
            expect(result.ResultSummary).toEqual({
                RecordProcessID: 'RP-1', Attempted: 10, Status: 'Failed',
            });
        });

        it('reports 0 rejected by output constraints when a non-constraint error fails a FailRunOnRecordError run', async () => {
            const tracker = new SpyTracker();
            const processor = {
                FailRunOnRecordError: true,
                ProcessRecord: async (r: RecordRef): Promise<RecordResult> => (r.RecordID === 'r2' ? { Status: 'Failed', ErrorMessage: 'deadlock' } : ok()),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(10), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER,
                Provider: PROVIDER, BatchSize: 10, RecordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe('1 of 10 attempted records failed (0 rejected by output constraints)');
        });

        it('keeps Completed status for processors without FailRunOnRecordError', async () => {
            const processor = new FunctionRecordProcessor((r) => (r.RecordID === 'r0' ? { Status: 'Failed', ErrorMessage: 'x' } : ok()));
            const tracker = new SpyTracker();
            const result = await engine.Process({ Source: new ArraySource(recs(10), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER, Provider: PROVIDER, BatchSize: 10 });
            expect(result.Status).toBe('Completed');
            expect(tracker.completed?.ResultSummary).toBeUndefined();
        });

        it('carries WouldRefuse from BuildRunSummary on a dry run\'s result', async () => {
            const tracker = new SpyTracker();
            const refusal = 'Processor version v6 is not activated';
            const processor = {
                ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded', DryRun: true }),
                BuildRunSummary: () => ({ ResultSummary: { Previewed: 2 }, WouldRefuse: refusal }),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER, Provider: PROVIDER,
                BatchSize: 2, DryRun: true, RecordProcessID: 'RP-1' });
            expect(tracker.completed?.WouldRefuse).toBe(refusal);
            expect(result.WouldRefuse).toBe(refusal);
        });

        it('invokes BuildRunSummary even when every record was skipped on its watermark', async () => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.Records.map((r) => [r.RecordID, { ShouldSkip: true }])));
            const tracker = new SpyTracker();
            const processor = {
                ProcessRecord: async (): Promise<RecordResult> => ok(),
                BuildRunSummary: ({ Counts, Results }: { Counts: { Skipped: number }; Results: RecordResult[] }) => ({
                    ResultSummary: { Attempted: Results.length, Skipped: Counts.Skipped, Status: 'completed' },
                }),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER, Provider: PROVIDER,
                BatchSize: 2, RecordProcessID: 'RP-1', SkipUnchanged: true, EntityID: 'E' });
            vi.restoreAllMocks();
            expect(result.Status).toBe('Completed');
            expect(tracker.completed?.ResultSummary).toEqual({ Attempted: 0, Skipped: 2, Status: 'completed' });
        });

        it('keeps a run that already ended Failed with its own message', async () => {
            const processor = {
                FailRunOnRecordError: true,
                ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Failed', ErrorMessage: 'x' }),
                BuildRunSummary: () => ({ ResultSummary: {} }),
            };
            const result = await engine.Process({ Source: new ArraySource(recs(2), 'E'), Tracker: new NoOpTracker(), ContextUser: USER, Provider: PROVIDER,
                Processor: processor, BatchSize: 2, RecordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('Circuit breaker');
        });
    });
});

describe('RecordSetProcessor.Process — waits for the Action log rows its results carry (#6045)', () => {
    /** A processor whose every result names a log row that lands only when `release` is called. */
    function gatedLogProcessor() {
        let release!: () => void;
        const landed = new Promise<void>((r) => { release = r; });
        const calls: string[] = [];
        const processor = {
            ProcessRecord: async (r: RecordRef): Promise<RecordResult> => {
                calls.push(r.RecordID);
                return { Status: 'Succeeded', ActionExecutionLogID: `log-${r.RecordID}`, ActionExecutionLogPersisted: landed };
            },
        };
        return { processor, calls, release };
    }

    it('does not resolve while a log row is pending, even when the tracker ignores it, and the loop never waits', async () => {
        const { processor, calls, release } = gatedLogProcessor();
        let done = false;
        const run = engine.Process({ Source: new ArraySource(recs(3), 'E'), Processor: processor, Tracker: new NoOpTracker(), ContextUser: USER, Provider: PROVIDER })
            .then((r) => { done = true; return r; });
        await new Promise((r) => setTimeout(r, 20));
        expect(calls).toEqual(['r0', 'r1', 'r2']); // every record ran: the loop did not wait on the log rows
        expect(done).toBe(false);

        release();
        expect((await run).Status).toBe('Completed');
    });

    it('calls CompleteRun only after the log rows have settled', async () => {
        const { processor, release } = gatedLogProcessor();
        const tracker = new SpyTracker();
        const run = engine.Process({ Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: tracker, ContextUser: USER, Provider: PROVIDER });
        await new Promise((r) => setTimeout(r, 20));
        expect(tracker.details).toHaveLength(2);
        expect(tracker.completed).toBeUndefined();

        release();
        await run;
        expect(tracker.completed?.Status).toBe('Completed');
    });

    it('waits for log rows carried by a batch processor\'s results too', async () => {
        let release!: () => void;
        const landed = new Promise<void>((r) => { release = r; });
        const processor = {
            ProcessRecord: async (): Promise<RecordResult> => ok(),
            ProcessBatch: async (rs: RecordRef[]) => new Map(rs.map((r): [string, RecordResult] => [r.RecordID, { Status: 'Succeeded', ActionExecutionLogID: `log-${r.RecordID}`, ActionExecutionLogPersisted: landed }])),
        };
        let done = false;
        const run = engine.Process({ Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: new NoOpTracker(), ContextUser: USER, Provider: PROVIDER })
            .then(() => { done = true; });
        await new Promise((r) => setTimeout(r, 20));
        expect(done).toBe(false);

        release();
        await run;
        expect(done).toBe(true);
    });
});

describe('RecordSetProcessor.Process — the caller stop signal', () => {
    it('starts no record after the signal fires, ends Paused, and keeps the cursor on the page it was on', async () => {
        const controller = new AbortController();
        const processor = new FunctionRecordProcessor((r) => {
            if (r.RecordID === 'r1') controller.abort(new Error('lease lost'));
            return ok();
        });
        const tracker = new SpyTracker();
        const result = await engine.Process({
            Source: new ArraySource(recs(5), 'E'), Processor: processor, Tracker: tracker,
            ContextUser: USER, Provider: PROVIDER, BatchSize: 5, Signal: controller.signal,
        });
        expect(result.Status).toBe('Paused');
        expect(result.ErrorMessage).toBe('Stopped: lease lost');
        expect(tracker.details.map((d) => d.record.RecordID)).toEqual(['r0', 'r1']);
        expect(result.Processed).toBe(2);
        expect(result.Error).toBe(0);
        expect(tracker.checkpoints).toBe(0); // the cursor never moved past the unreached records
    });

    it('processes nothing when stopped before it starts', async () => {
        const controller = new AbortController();
        controller.abort('shutting down');
        const processor = new FunctionRecordProcessor(ok);
        const result = await engine.Process({
            Source: new ArraySource(recs(3), 'E'), Processor: processor, Tracker: new NoOpTracker(),
            ContextUser: USER, Provider: PROVIDER, Signal: controller.signal,
        });
        expect(result.Status).toBe('Paused');
        expect(result.ErrorMessage).toBe('Stopped: shutting down');
        expect(result.Processed).toBe(0);
    });

    it('hands the signal to every record', async () => {
        const controller = new AbortController();
        const seen: Array<AbortSignal | undefined> = [];
        const processor = {
            ProcessRecord: async (_r: RecordRef, ctx: RecordProcessorContext) => { seen.push(ctx.Signal); return ok(); },
        };
        await engine.Process({
            Source: new ArraySource(recs(2), 'E'), Processor: processor, Tracker: new NoOpTracker(),
            ContextUser: USER, Provider: PROVIDER, Signal: controller.signal,
        });
        expect(seen).toEqual([controller.signal, controller.signal]);
    });

    it('does not count the records a batch processor left unreached as errors', async () => {
        const controller = new AbortController();
        const processor = {
            ProcessRecord: async () => ok(),
            ProcessBatch: async (records: RecordRef[]) => {
                controller.abort('cancelled');
                return new Map([[records[0].RecordID, ok()]]);
            },
        };
        const tracker = new SpyTracker();
        const result = await engine.Process({
            Source: new ArraySource(recs(3), 'E'), Processor: processor, Tracker: tracker,
            ContextUser: USER, Provider: PROVIDER, Signal: controller.signal,
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBe(1);
        expect(result.Error).toBe(0);
        expect(tracker.details.map((d) => d.record.RecordID)).toEqual(['r0']);
    });

    it('stops every concurrent worker from taking another record', async () => {
        const controller = new AbortController();
        const processor = new FunctionRecordProcessor((r) => {
            if (r.RecordID === 'r0') controller.abort('cancelled');
            return ok();
        });
        const tracker = new SpyTracker();
        const result = await engine.Process({
            Source: new ArraySource(recs(10), 'E'), Processor: processor, Tracker: tracker,
            ContextUser: USER, Provider: PROVIDER, BatchSize: 10, MaxConcurrency: 3, Signal: controller.signal,
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBeLessThan(10);
    });

    it('does not count an aborted in-flight non-batch record as an Error', async () => {
        const controller = new AbortController();
        const processor = new FunctionRecordProcessor((r) => {
            if (r.RecordID === 'r0') {
                controller.abort('lease lost');
                return { Status: 'Failed', ErrorMessage: 'stopped mid-record' };
            }
            return ok();
        });
        const tracker = new SpyTracker();
        const result = await engine.Process({
            Source: new ArraySource(recs(3), 'E'), Processor: processor, Tracker: tracker,
            ContextUser: USER, Provider: PROVIDER, BatchSize: 3, Signal: controller.signal,
        });
        expect(result.Status).toBe('Paused');
        expect(result.Error).toBe(0);
        expect(result.Processed).toBe(0);
        expect(tracker.details).toHaveLength(0);
    });
});
