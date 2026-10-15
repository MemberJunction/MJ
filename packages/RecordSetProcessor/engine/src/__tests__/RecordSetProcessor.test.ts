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
    describe('watermarks on a dry run', () => {
        afterEach(() => vi.restoreAllMocks());
        /** Every record changed since its watermark, so a real run would write each one's. */
        const changed = (): void => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.records.map((r) => [r.RecordID, { shouldSkip: false, basisHash: `hash-${r.RecordID}` }])));
        };
        const run = (processor: Parameters<typeof engine.Process>[0]['processor'], dryRun: boolean) => engine.Process({
            source: new ArraySource(recs(2), 'E'), processor, tracker: new NoOpTracker(), contextUser: USER, provider: PROVIDER,
            dryRun, skipUnchanged: true, recordProcessID: 'RP', entityID: 'E', triggeredBy: 'Schedule',
        });
        const perRecord = { ProcessRecord: async () => ok() };
        const batched = { ProcessRecord: async () => ok(), ProcessBatch: async (rs: RecordRef[]) => rs.map(() => ok()) };

        it('writes no watermark, on the per-record or the batch path, while a real run writes one per record', async () => {
            changed();
            const update = vi.spyOn(WatermarkService.Instance, 'UpdateWatermark').mockResolvedValue();
            await run(perRecord, true);
            await run(batched, true);
            expect(update).not.toHaveBeenCalled();
            await run(perRecord, false);
            await run(batched, false);
            expect(update).toHaveBeenCalledTimes(4);
        });

        it('computes basis hashes with the context every record gets', async () => {
            changed();
            vi.spyOn(WatermarkService.Instance, 'UpdateWatermark').mockResolvedValue();
            await run(perRecord, true);
            const check = vi.mocked(WatermarkService.Instance.CheckBatchWatermarks);
            expect(check.mock.calls[0][0].ProcessorContext).toMatchObject({ DryRun: true, TriggeredBy: 'Schedule', entityID: 'E', recordProcessID: 'RP' });
        });
    });

    it('passes DryRun and TriggeredBy to every record and to Preflight', async () => {
        const seen: Array<Pick<RecordProcessorContext, 'DryRun' | 'TriggeredBy'>> = [];
        let preflight: Pick<RecordProcessorContext, 'DryRun' | 'TriggeredBy'> | undefined;
        const processor = {
            ProcessRecord: async (_r: RecordRef, ctx: RecordProcessorContext) => { seen.push({ DryRun: ctx.DryRun, TriggeredBy: ctx.TriggeredBy }); return ok(); },
            Preflight: async (ctx: RecordProcessorContext) => { preflight = { DryRun: ctx.DryRun, TriggeredBy: ctx.TriggeredBy }; },
        };
        await engine.Process({ source: new ArraySource(recs(2), 'E'), processor, tracker: new NoOpTracker(), contextUser: USER, provider: PROVIDER, dryRun: true, triggeredBy: 'Schedule' });
        expect(seen).toEqual([{ DryRun: true, TriggeredBy: 'Schedule' }, { DryRun: true, TriggeredBy: 'Schedule' }]);
        expect(preflight).toEqual({ DryRun: true, TriggeredBy: 'Schedule' });
    });

    it('processes every record across batches and reports Completed with correct counts', async () => {
        const result = await engine.Process({
            source: new ArraySource(recs(5), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
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
            source: new ArraySource(recs(5), 'E'),
            processor,
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 5, // one batch → 1/5 = 20%, not > 20% → continues
        });
        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(4);
        expect(result.Error).toBe(1);
    });

    it('trips the circuit breaker when the error rate exceeds the threshold', async () => {
        const result = await engine.Process({
            source: new ArraySource(recs(5), 'E'),
            processor: new FunctionRecordProcessor(() => ({ Status: 'Failed', ErrorMessage: 'x' })),
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 5,
            errorThresholdPercent: 20,
        });
        expect(result.Status).toBe('Failed');
        expect(result.Error).toBe(5);
        expect(result.ErrorMessage).toContain('Circuit breaker');
    });

    it('captures a thrown processor as a Failed record result', async () => {
        const tracker = new SpyTracker();
        const result = await engine.Process({
            source: new ArraySource(recs(1), 'E'),
            processor: new FunctionRecordProcessor(() => { throw new Error('boom'); }),
            tracker,
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 1,
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
            source: new ArraySource(recs(5), 'E'),
            processor,
            tracker,
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
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
            source: new ArraySource(recs(5), 'E'),
            processor,
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
        });
        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(5);
        expect(preflights).toBe(1);
    });

    it('pauses gracefully when the tracker requests cancellation at a checkpoint', async () => {
        const tracker = new SpyTracker();
        tracker.pauseAfter = 1; // first checkpoint returns false
        const result = await engine.Process({
            source: new ArraySource(recs(6), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker,
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBe(2);
        expect(tracker.completed?.Status).toBe('Paused');
    });

    it('pauses when the budget-gate hook declines to continue', async () => {
        const result = await engine.Process({
            source: new ArraySource(recs(6), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
            onAfterBatch: async () => ({ continue: false, reason: 'cost cap' }),
        });
        expect(result.Status).toBe('Paused');
        expect(result.Processed).toBe(2);
        expect(result.ErrorMessage).toContain('cost cap');
    });

    it('honors the maxRecords cap by trimming the final batch', async () => {
        const result = await engine.Process({
            source: new ArraySource(recs(10), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 3,
            maxRecords: 5,
        });
        expect(result.Status).toBe('Completed');
        expect(result.Processed).toBe(5);
    });

    it('processes every record exactly once with concurrency > 1', async () => {
        const tracker = new SpyTracker();
        await engine.Process({
            source: new ArraySource(recs(10), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker,
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 10,
            maxConcurrency: 4,
        });
        expect(tracker.details).toHaveLength(10);
        expect(new Set(tracker.details.map((d) => d.record.RecordID)).size).toBe(10);
    });

    it('emits cumulative progress after each batch', async () => {
        const progress: number[] = [];
        await engine.Process({
            source: new ArraySource(recs(4), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker: new NoOpTracker(),
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 2,
            onProgress: (p) => progress.push(p.Processed),
        });
        expect(progress).toEqual([2, 4]);
    });

    it('resumes from a tracker-supplied cursor, skipping already-processed records', async () => {
        const tracker = new SpyTracker();
        tracker.resumeCursor = { Offset: 3 };
        const result = await engine.Process({
            source: new ArraySource(recs(5), 'E'),
            processor: new FunctionRecordProcessor(ok),
            tracker,
            contextUser: USER,
            provider: PROVIDER,
            batchSize: 10,
            resume: true,
        });
        expect(result.Processed).toBe(2); // only r3, r4 remain after offset 3
        expect(tracker.details.map((d) => d.record.RecordID)).toEqual(['r3', 'r4']);
    });

    describe('the breaker over attempted records', () => {
        afterEach(() => vi.restoreAllMocks());
        /** The engine skips records r0..r(n-1) on their watermark, without handing them to the processor. */
        const watermarkSkips = (n: number): void => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.records.map((r) => [r.RecordID, { shouldSkip: Number(r.RecordID.slice(1)) < n }])));
        };

        it('27 records, 25 skipped on their watermark, 2 failed ends Failed', async () => {
            watermarkSkips(25);
            const processor = new FunctionRecordProcessor(() => ({ Status: 'Failed', ErrorMessage: 'UNIQUE KEY' }));
            const result = await engine.Process({ source: new ArraySource(recs(27), 'E'), processor, tracker: new NoOpTracker(),
                contextUser: USER, provider: PROVIDER, batchSize: 27, skipUnchanged: true, recordProcessID: 'RP', entityID: 'E' });
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
            const result = await engine.Process({ source: new ArraySource(recs(1000), 'E'), processor, tracker: new NoOpTracker(),
                contextUser: USER, provider: PROVIDER, batchSize: 100 });
            expect(result.Status).toBe('Completed');
            expect(result.Processed).toBe(1000);
            expect(result.Skipped).toBe(970);
            expect(result.Error).toBe(10);
        });
    });

    describe('Feature Pipeline runs', () => {
        const PIN = { PipelineVersion: 4, PromptVersionHash: 'pv', AIModelID: 'm', ParametersHash: 'ph' };

        it('ends a Feature Pipeline run Failed when any record failed, and summarises it', async () => {
            const tracker = new SpyTracker();
            const processor = new FunctionRecordProcessor((r) => {
                if (r.RecordID === 'r0') return { Status: 'Failed', ErrorMessage: 'Constraint violation', FailureKind: 'RejectedInvalid' };
                if (r.RecordID === 'r1') return { Status: 'Succeeded', Outcome: 'Unchanged', HumanValuesPreserved: 1 };
                return { Status: 'Succeeded', Outcome: 'Upserted', PipelinePin: PIN };
            });
            const result = await engine.Process({ source: new ArraySource(recs(10), 'E'), processor, tracker, contextUser: USER,
                provider: PROVIDER, batchSize: 10, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe('1 of 10 attempted records failed (1 rejected by output constraints)');
            expect(tracker.completed?.FeaturePipeline).toEqual({
                RecordProcessID: 'RP-1', Pin: PIN, ParameterFidelity: null, Attempted: 10, Upserted: 8, Unchanged: 1, Previewed: 0,
                RejectedInvalid: 1, BelowConfidence: 0, Failed: 0, Skipped: 0, HumanValuesPreserved: 1, Status: 'failed',
            });
        });

        it('tallies the records whose outputs a confidence floor withheld', async () => {
            const tracker = new SpyTracker();
            const processor = new FunctionRecordProcessor((r): RecordResult => {
                if (r.RecordID === 'r0' || r.RecordID === 'r1') return { Status: 'Succeeded', Outcome: 'Upserted', BelowConfidenceOutputs: ['S'] };
                if (r.RecordID === 'r2') return { Status: 'Failed', ErrorMessage: 'deadlock' };
                return { Status: 'Succeeded', Outcome: 'Upserted', PipelinePin: PIN };
            });
            const result = await engine.Process({ source: new ArraySource(recs(10), 'E'), processor, tracker, contextUser: USER,
                provider: PROVIDER, batchSize: 10, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe('1 of 10 attempted records failed (0 rejected by output constraints)');
            expect(tracker.completed?.FeaturePipeline).toMatchObject({
                Attempted: 10, Upserted: 9, RejectedInvalid: 0, BelowConfidence: 2, Failed: 1, Status: 'failed',
            });
        });

        it('keeps today\'s status for other work types', async () => {
            const processor = new FunctionRecordProcessor((r) => (r.RecordID === 'r0' ? { Status: 'Failed', ErrorMessage: 'x' } : ok()));
            const tracker = new SpyTracker();
            const result = await engine.Process({ source: new ArraySource(recs(10), 'E'), processor, tracker, contextUser: USER, provider: PROVIDER, batchSize: 10 });
            expect(result.Status).toBe('Completed');
            expect(tracker.completed?.FeaturePipeline).toBeUndefined();
        });

        it('reports a refused parameter fidelity when any record had one', async () => {
            const sent = { Status: 'sent-unchanged' as const, Sent: { VendorModelName: 'm', Temperature: 0, MaxTokens: null, Seed: 42 } };
            const refused = { Status: 'refused' as const, Configured: sent.Sent, WouldSend: { ...sent.Sent, Seed: null } };
            const tracker = new SpyTracker();
            const processor = new FunctionRecordProcessor((r) => ({ Status: 'Succeeded', Outcome: 'Upserted', ParameterFidelity: r.RecordID === 'r1' ? refused : sent }));
            await engine.Process({ source: new ArraySource(recs(3), 'E'), processor, tracker, contextUser: USER, provider: PROVIDER,
                batchSize: 3, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(tracker.completed?.FeaturePipeline?.ParameterFidelity).toEqual(refused);
        });

        it('refuses a Feature Pipeline run without a recordProcessID', async () => {
            await expect(engine.Process({ source: new ArraySource(recs(1), 'E'), processor: new FunctionRecordProcessor(() => ok()), tracker: new NoOpTracker(),
                contextUser: USER, provider: PROVIDER, FeaturePipeline: true })).rejects.toThrow(/needs recordProcessID/);
            await expect(engine.Process({ source: new ArraySource(recs(1), 'E'), processor: new FunctionRecordProcessor(() => ok()), tracker: new NoOpTracker(),
                contextUser: USER, provider: PROVIDER, FeaturePipeline: true })).rejects.toThrow('A Feature Pipeline run (FeaturePipeline: true) needs recordProcessID.');
        });

        it('tallies a dry run as previewed, never as a write', async () => {
            const tracker = new SpyTracker();
            const result = await engine.Process({ source: new ArraySource(recs(3), 'E'), tracker, contextUser: USER, provider: PROVIDER,
                processor: new FunctionRecordProcessor(() => ({ Status: 'Succeeded', DryRun: true, PipelinePin: PIN })),
                batchSize: 3, dryRun: true, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(result.Status).toBe('Completed');
            expect(tracker.completed?.FeaturePipeline).toMatchObject({ Attempted: 3, Previewed: 3, Upserted: 0, Unchanged: 0, Status: 'completed' });
        });

        it('carries why the real run would be refused on a dry run\'s result', async () => {
            const tracker = new SpyTracker();
            const refusal = 'Feature Pipeline version v6 is not activated';
            const processor = { ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded', DryRun: true, PipelinePin: PIN }), CurrentRunRefusal: () => refusal };
            const result = await engine.Process({ source: new ArraySource(recs(2), 'E'), processor, tracker, contextUser: USER, provider: PROVIDER,
                batchSize: 2, dryRun: true, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(tracker.completed?.FeaturePipeline?.WouldRefuse).toBe(refusal);
            expect(result.FeaturePipeline?.WouldRefuse).toBe(refusal);
        });

        it('carries no refusal on a real run, nor on a dry run whose version would run', async () => {
            const real = new SpyTracker();
            await engine.Process({ source: new ArraySource(recs(1), 'E'), tracker: real, contextUser: USER, provider: PROVIDER,
                processor: { ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded', Outcome: 'Upserted' }), CurrentRunRefusal: () => 'stale' },
                batchSize: 1, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(real.completed?.FeaturePipeline).not.toHaveProperty('WouldRefuse');
            const dry = new SpyTracker();
            await engine.Process({ source: new ArraySource(recs(1), 'E'), tracker: dry, contextUser: USER, provider: PROVIDER,
                processor: { ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded', DryRun: true }), CurrentRunRefusal: () => null },
                batchSize: 1, dryRun: true, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(dry.completed?.FeaturePipeline).not.toHaveProperty('WouldRefuse');
        });

        it('tallies the batch path the same way as the per-record path', async () => {
            const tracker = new SpyTracker();
            const processor = {
                ProcessRecord: async (): Promise<RecordResult> => ok(),
                ProcessBatch: async (rs: RecordRef[]): Promise<RecordResult[]> => rs.map((r): RecordResult => (r.RecordID === 'r0'
                    ? { Status: 'Failed', ErrorMessage: 'not allowed', FailureKind: 'RejectedInvalid' }
                    : r.RecordID === 'r1' ? { Status: 'Failed', ErrorMessage: 'deadlock' }
                    : { Status: 'Succeeded', Outcome: r.RecordID === 'r2' ? 'Unchanged' : 'Upserted', HumanValuesPreserved: 2, PipelinePin: PIN })),
            };
            const result = await engine.Process({ source: new ArraySource(recs(12), 'E'), processor, tracker, contextUser: USER, provider: PROVIDER,
                batchSize: 12, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe('2 of 12 attempted records failed (1 rejected by output constraints)');
            expect(tracker.completed?.FeaturePipeline).toMatchObject({
                Pin: PIN, Attempted: 12, Upserted: 9, Unchanged: 1, RejectedInvalid: 1, Failed: 1, HumanValuesPreserved: 20, Status: 'failed',
            });
        });

        it('takes the pin from the processor when every record was skipped on its watermark', async () => {
            vi.spyOn(WatermarkService.Instance, 'CheckBatchWatermarks').mockImplementation(async (p) =>
                new Map<string, WatermarkDecision>(p.records.map((r) => [r.RecordID, { shouldSkip: true }])));
            const tracker = new SpyTracker();
            const processor = { ProcessRecord: async (): Promise<RecordResult> => ok(), CurrentRunPin: () => PIN };
            const result = await engine.Process({ source: new ArraySource(recs(2), 'E'), processor, tracker, contextUser: USER, provider: PROVIDER,
                batchSize: 2, FeaturePipeline: true, recordProcessID: 'RP-1', skipUnchanged: true, entityID: 'E' });
            vi.restoreAllMocks();
            expect(result.Status).toBe('Completed');
            expect(tracker.completed?.FeaturePipeline).toMatchObject({ Pin: PIN, Attempted: 0, Skipped: 2, Status: 'completed' });
        });

        it('keeps a run that already ended Failed with its own message', async () => {
            const result = await engine.Process({ source: new ArraySource(recs(2), 'E'), tracker: new NoOpTracker(), contextUser: USER, provider: PROVIDER,
                processor: new FunctionRecordProcessor(() => ({ Status: 'Failed', ErrorMessage: 'x' })),
                batchSize: 2, FeaturePipeline: true, recordProcessID: 'RP-1' });
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('Circuit breaker');
        });
    });
});
