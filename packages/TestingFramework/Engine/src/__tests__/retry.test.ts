import { describe, it, expect, vi } from 'vitest';
import { TestRunResult } from '@memberjunction/testing-engine-base';
import { isRetriableFailure, runWithRetries } from '../engine/retry';

// Minimal TestRunResult factory — only `status` matters for the retry policy.
function makeResult(status: TestRunResult['status']): TestRunResult {
    return {
        testRunId: 'tr', testId: 't', testName: 'T', status,
        score: status === 'Passed' ? 1 : 0,
        passedChecks: 0, failedChecks: 0, totalChecks: 0, oracleResults: [],
        targetType: 'Computer Use', targetLogId: 'l',
        durationMs: 1, totalCost: 0, startedAt: new Date(0), completedAt: new Date(0),
    };
}

// A runOnce that returns the given sequence of statuses, one per attempt.
function sequence(...statuses: Array<TestRunResult['status']>) {
    const calls: number[] = [];
    const fn = vi.fn(async (attempt: number) => {
        calls.push(attempt);
        return makeResult(statuses[Math.min(attempt - 1, statuses.length - 1)]);
    });
    return { fn, calls };
}

describe('isRetriableFailure', () => {
    it('treats Failed / Error / Timeout as retriable', () => {
        for (const s of ['Failed', 'Error', 'Timeout'] as const) {
            expect(isRetriableFailure(makeResult(s))).toBe(true);
        }
    });
    it('treats Passed / Skipped as NOT retriable', () => {
        for (const s of ['Passed', 'Skipped'] as const) {
            expect(isRetriableFailure(makeResult(s))).toBe(false);
        }
    });
});

describe('runWithRetries', () => {
    it('passes on the first attempt → no retry, attempts=1, not flaky', async () => {
        const { fn } = sequence('Passed');
        const r = await runWithRetries(fn, 2);
        expect(r.status).toBe('Passed');
        expect(r.attempts).toBe(1);
        expect(r.flaky).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('maxRetries=0 never retries, even on failure', async () => {
        const { fn } = sequence('Failed');
        const r = await runWithRetries(fn, 0);
        expect(r.status).toBe('Failed');
        expect(r.attempts).toBe(1);
        expect(r.flaky).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fails then passes → flaky=true, returns the passing result', async () => {
        const { fn } = sequence('Failed', 'Passed');
        const r = await runWithRetries(fn, 2);
        expect(r.status).toBe('Passed');
        expect(r.flaky).toBe(true);
        expect(r.attempts).toBe(2);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('exhausts all retries on persistent failure → not flaky, last failure returned', async () => {
        const { fn } = sequence('Failed', 'Error', 'Timeout');
        const r = await runWithRetries(fn, 2);
        expect(isRetriableFailure(r)).toBe(true);
        expect(r.status).toBe('Timeout'); // the last attempt's status
        expect(r.flaky).toBe(false);
        expect(r.attempts).toBe(3); // 1 + 2 retries
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('stops retrying as soon as it passes (does not use remaining budget)', async () => {
        const { fn } = sequence('Failed', 'Passed', 'Failed');
        const r = await runWithRetries(fn, 5);
        expect(r.status).toBe('Passed');
        expect(r.attempts).toBe(2);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('passes each attempt number to runOnce (for fresh start times)', async () => {
        const { fn, calls } = sequence('Failed', 'Failed', 'Passed');
        await runWithRetries(fn, 3);
        expect(calls).toEqual([1, 2, 3]);
    });

    it('fires onBeforeRetry once per retry with the prior failing result', async () => {
        const { fn } = sequence('Failed', 'Failed', 'Passed');
        const onBeforeRetry = vi.fn();
        await runWithRetries(fn, 3, onBeforeRetry);
        expect(onBeforeRetry).toHaveBeenCalledTimes(2);
        expect(onBeforeRetry.mock.calls[0][0]).toBe(2); // nextAttempt
        expect(onBeforeRetry.mock.calls[0][1].status).toBe('Failed'); // lastResult
    });
});
