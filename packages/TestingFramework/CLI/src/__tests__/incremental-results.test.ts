import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IncrementalResultsSink } from '../utils/incremental-results';
import type { TestRunResult } from '@memberjunction/testing-engine-base';

/** Minimal valid TestRunResult with per-test overrides. */
function mkResult(over: Partial<TestRunResult>): TestRunResult {
    return {
        testRunId: 'x',
        testId: 't',
        testName: 'T',
        status: 'Passed',
        score: 1,
        passedChecks: 1,
        failedChecks: 0,
        totalChecks: 1,
        oracleResults: [],
        targetType: '',
        targetLogId: '',
        durationMs: 100,
        totalCost: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        ...over,
    };
}

describe('IncrementalResultsSink (DR-D5)', () => {
    let dir: string;
    let out: string;

    beforeEach(() => {
        // Basename mimics a run dir so the sink derives runId from it.
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-20260721T000000Z-'));
        out = path.join(dir, 'results.json');
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const readJsonl = () =>
        fs.readFileSync(path.join(dir, 'results.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const readPartial = () =>
        JSON.parse(fs.readFileSync(path.join(dir, 'results.partial.json'), 'utf8'));

    it('returns null (no-op) when no output path is set', () => {
        expect(IncrementalResultsSink.forOutput(undefined, 'S')).toBeNull();
    });

    it('derives the run id from the output directory basename', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'Alpha' }));
        expect(readJsonl()[0].runId).toBe(path.basename(dir));
    });

    it('emits one final JSONL line for a clean pass', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'Alpha', workerIndex: 0 }));
        const lines = readJsonl();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ isFinal: true, status: 'Passed', workerIndex: 0 });
    });

    it('expands prior attempts into their own non-final lines', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({
            testId: 't2', testName: 'Beta', status: 'Passed', flaky: true, attempts: 3,
            priorAttempts: [
                { attempt: 1, status: 'Failed', score: 0.2, durationMs: 50, errorMessage: 'nav loop' },
                { attempt: 2, status: 'Timeout', score: 0, durationMs: 400 },
            ],
        }));
        const lines = readJsonl();
        expect(lines).toHaveLength(3);
        expect(lines.filter(l => !l.isFinal)).toHaveLength(2);
        expect(lines.find(l => l.attempt === 1).error).toBe('nav loop');
        expect(lines.find(l => l.isFinal).flaky).toBe(true);
    });

    it('appends across multiple completions (does not truncate)', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'A' }));
        sink.onTestComplete(mkResult({ testId: 't2', testName: 'B', status: 'Failed', score: 0.3 }));
        expect(readJsonl()).toHaveLength(2);
    });

    it('keeps the partial snapshot at Running with live counts mid-flight', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'A' }));
        sink.onTestComplete(mkResult({ testId: 't2', testName: 'B', status: 'Failed', score: 0 }));
        sink.onTestComplete(mkResult({ testId: 't3', testName: 'C', status: 'Passed', flaky: true }));
        const p = readPartial();
        expect(p.status).toBe('Running');
        expect(p.counts).toMatchObject({ passed: 2, failed: 1, flaky: 1 });
        // No heavy payloads leak into the snapshot.
        expect(JSON.stringify(p)).not.toContain('oracleResults');
    });

    it('finalize() stamps the terminal status and is idempotent', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'A' }));
        sink.finalize('Completed');
        expect(readPartial().status).toBe('Completed');
        sink.finalize('Cancelled'); // ignored — already finalized
        expect(readPartial().status).toBe('Completed');
    });

    it('surfaces the completed count', () => {
        const sink = IncrementalResultsSink.forOutput(out, 'S')!;
        expect(sink.completedCount).toBe(0);
        sink.onTestComplete(mkResult({ testId: 't1', testName: 'A' }));
        expect(sink.completedCount).toBe(1);
    });
});
