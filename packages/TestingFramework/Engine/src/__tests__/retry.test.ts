import { describe, it, expect, vi } from 'vitest';
import { TestRunResult, PriorAttemptSummary, FailureCategory } from '@memberjunction/testing-engine-base';
import { isRetriableFailure, runWithRetries } from '../engine/retry';
import { fixedRetries } from '../engine/retry-policy';

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
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.status).toBe('Passed');
        expect(r.attempts).toBe(1);
        expect(r.flaky).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('maxRetries=0 never retries, even on failure', async () => {
        const { fn } = sequence('Failed');
        const r = await runWithRetries(fn, fixedRetries(0));
        expect(r.status).toBe('Failed');
        expect(r.attempts).toBe(1);
        expect(r.flaky).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fails then passes → flaky=true, returns the passing result', async () => {
        const { fn } = sequence('Failed', 'Passed');
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.status).toBe('Passed');
        expect(r.flaky).toBe(true);
        expect(r.attempts).toBe(2);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('exhausts all retries on persistent failure → not flaky, last failure returned', async () => {
        const { fn } = sequence('Failed', 'Error', 'Timeout');
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(isRetriableFailure(r)).toBe(true);
        expect(r.status).toBe('Timeout'); // the last attempt's status
        expect(r.flaky).toBe(false);
        expect(r.attempts).toBe(3); // 1 + 2 retries
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('stops retrying as soon as it passes (does not use remaining budget)', async () => {
        const { fn } = sequence('Failed', 'Passed', 'Failed');
        const r = await runWithRetries(fn, fixedRetries(5));
        expect(r.status).toBe('Passed');
        expect(r.attempts).toBe(2);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('passes each attempt number to runOnce (for fresh start times)', async () => {
        const { fn, calls } = sequence('Failed', 'Failed', 'Passed');
        await runWithRetries(fn, fixedRetries(3));
        expect(calls).toEqual([1, 2, 3]);
    });

    it('fires onBeforeRetry once per retry with the prior failing result', async () => {
        const { fn } = sequence('Failed', 'Failed', 'Passed');
        const onBeforeRetry = vi.fn();
        await runWithRetries(fn, fixedRetries(3), onBeforeRetry);
        expect(onBeforeRetry).toHaveBeenCalledTimes(2);
        expect(onBeforeRetry.mock.calls[0][0]).toBe(2); // nextAttempt
        expect(onBeforeRetry.mock.calls[0][1].status).toBe('Failed'); // lastResult
    });

    // Superseded attempts must be preserved for flake diagnosis.
    it('does not set priorAttempts when the first attempt passes', async () => {
        const { fn } = sequence('Passed');
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.priorAttempts).toBeUndefined();
    });

    it('preserves each superseded failure on a flaky pass', async () => {
        const { fn } = sequence('Failed', 'Error', 'Passed');
        const r = await runWithRetries(fn, fixedRetries(3));
        expect(r.status).toBe('Passed');
        expect(r.flaky).toBe(true);
        expect(r.priorAttempts).toHaveLength(2);
        expect(r.priorAttempts?.map(a => a.status)).toEqual(['Failed', 'Error']);
        expect(r.priorAttempts?.map(a => a.attempt)).toEqual([1, 2]);
    });

    it('preserves all superseded attempts when retries are exhausted', async () => {
        const { fn } = sequence('Failed', 'Error', 'Timeout');
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.status).toBe('Timeout'); // final attempt, returned as the result
        // The two attempts BEFORE the final one are preserved; the final is `r` itself.
        expect(r.priorAttempts?.map(a => a.status)).toEqual(['Failed', 'Error']);
    });

    it('summaries carry the diagnostic score of each attempt', async () => {
        const { fn } = sequence('Failed', 'Passed');
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.priorAttempts?.[0]).toMatchObject({ attempt: 1, status: 'Failed', score: 0 });
    });
});

// The memo round-trip. A superseded attempt carries the engine's failure
// memo + category, and each retry is HANDED the accumulated prior attempts so it
// can feed the last failure forward to its engine (non-blind retry).
describe('runWithRetries — non-blind retry', () => {
    /** A failing result carrying the diagnostics a driver would surface. */
    function failWithMemo(memo: string, category: FailureCategory): TestRunResult {
        return { ...makeResult('Failed'), failureMemo: memo, failureCategory: category };
    }

    it('preserves failureMemo + failureCategory on each superseded attempt', async () => {
        const results = [failWithMemo('stuck on step 4', 'nav-loop'), makeResult('Passed')];
        const fn = vi.fn(async (attempt: number) => results[Math.min(attempt - 1, results.length - 1)]);
        const r = await runWithRetries(fn, fixedRetries(2));
        expect(r.status).toBe('Passed');
        expect(r.priorAttempts?.[0]).toMatchObject({
            attempt: 1, failureMemo: 'stuck on step 4', failureCategory: 'nav-loop',
        });
    });

    it('hands the first attempt an empty prior-attempts list', async () => {
        let firstArg: PriorAttemptSummary[] | undefined;
        const fn = vi.fn(async (_attempt: number, priorAttempts: PriorAttemptSummary[]) => {
            firstArg ??= priorAttempts;
            return makeResult('Passed');
        });
        await runWithRetries(fn, fixedRetries(2));
        expect(firstArg).toEqual([]);
    });

    it('feeds the accumulated prior attempts (with memos) to each subsequent attempt', async () => {
        const seen: Array<Array<{ attempt: number; failureMemo?: string }>> = [];
        const results = [
            failWithMemo('memo-1', 'timeout'),
            failWithMemo('memo-2', 'timeout'),
            makeResult('Passed'),
        ];
        const fn = vi.fn(async (attempt: number, priorAttempts: PriorAttemptSummary[]) => {
            // Snapshot exactly what THIS attempt was handed, at call time.
            seen.push(priorAttempts.map(a => ({ attempt: a.attempt, failureMemo: a.failureMemo })));
            return results[Math.min(attempt - 1, results.length - 1)];
        });
        await runWithRetries(fn, fixedRetries(3));
        expect(seen[0]).toEqual([]); // attempt 1: blind, as before
        expect(seen[1]).toEqual([{ attempt: 1, failureMemo: 'memo-1' }]); // attempt 2 sees #1
        expect(seen[2]).toEqual([ // attempt 3 sees #1 and #2, oldest first
            { attempt: 1, failureMemo: 'memo-1' },
            { attempt: 2, failureMemo: 'memo-2' },
        ]);
    });
});
