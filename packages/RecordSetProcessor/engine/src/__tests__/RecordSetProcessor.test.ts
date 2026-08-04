/**
 * Unit tests for the RecordSetProcessor engine loop: batching, counts, per-record error isolation,
 * circuit breaker, pause/cancel, budget gate, maxRecords, concurrency, progress, and resume.
 * No database — uses the real ArraySource + FunctionRecordProcessor and a spy tracker.
 */

import { describe, it, expect } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArraySource,
    IProcessRunTracker,
    ProcessCursor,
    ProcessRunSummary,
    RecordRef,
    RecordResult,
    RunHandle,
} from '@memberjunction/record-set-processor-base';
import { FunctionRecordProcessor, NoOpTracker, RecordSetProcessor } from '../index';

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
});
