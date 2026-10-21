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
import { FunctionRecordProcessor, NoOpTracker, RecordSetProcessor } from '../index';
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
