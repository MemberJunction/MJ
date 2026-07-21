import { describe, it, expect } from 'vitest';
import { FailureCategory, TestRunResult } from '@memberjunction/testing-engine-base';
import { CircuitBreaker, defaultMaxFailures, ENV_FAILURE_CATEGORIES } from '../engine/circuit-breaker';

function res(status: TestRunResult['status'], failureCategory?: FailureCategory): TestRunResult {
    return {
        testRunId: 'tr', testId: 't', testName: 'T', status,
        score: status === 'Passed' ? 1 : 0,
        passedChecks: 0, failedChecks: 0, totalChecks: 0, oracleResults: [],
        targetType: '', targetLogId: '',
        durationMs: 1, totalCost: 0, startedAt: new Date(0), completedAt: new Date(0),
        failureCategory,
    };
}

describe('defaultMaxFailures', () => {
    it('is max(10, ceil(0.25 × suiteSize))', () => {
        expect(defaultMaxFailures(44)).toBe(11); // ceil(11)
        expect(defaultMaxFailures(380)).toBe(95);
        expect(defaultMaxFailures(20)).toBe(10); // floor wins
        expect(defaultMaxFailures(0)).toBe(10);
    });
});

describe('CircuitBreaker — max-failures tier', () => {
    it('trips once total failures (any category) reach the cap', () => {
        const cb = new CircuitBreaker({ maxFailures: 3, windowSize: 100 });
        cb.record(res('Failed', 'assertion'));
        cb.record(res('Failed', 'app-error'));
        expect(cb.tripped).toBe(false);
        cb.record(res('Error', 'unknown'));
        expect(cb.tripped).toBe(true);
        expect(cb.verdict.reason).toBe('max-failures');
    });

    it('does not count passes or flaky passes toward the cap', () => {
        const cb = new CircuitBreaker({ maxFailures: 2, windowSize: 100 });
        cb.record(res('Passed'));
        cb.record(res('Passed'));
        cb.record(res('Skipped'));
        expect(cb.tripped).toBe(false);
    });

    it('is off by default (infinite cap)', () => {
        const cb = new CircuitBreaker({ windowSize: 100 });
        for (let i = 0; i < 50; i++) cb.record(res('Failed', 'assertion'));
        expect(cb.tripped).toBe(false);
    });
});

describe('CircuitBreaker — environment tier', () => {
    it('trips when ≥60% of a full window are env-class failures', () => {
        const cb = new CircuitBreaker({ windowSize: 10, envFailureThreshold: 0.6, maxFailures: 1000 });
        // 5 env failures + 4 passes = window not yet full of enough env fails.
        for (let i = 0; i < 5; i++) cb.record(res('Failed', 'timeout'));
        for (let i = 0; i < 4; i++) cb.record(res('Passed'));
        expect(cb.tripped).toBe(false); // 5/9 window, not full and <60%
        cb.record(res('Failed', 'infra')); // window now full: 6 env / 10 = 60%
        expect(cb.tripped).toBe(true);
        expect(cb.verdict.reason).toBe('environment');
    });

    it('does NOT trip when failures are app-class (real regressions), not env', () => {
        const cb = new CircuitBreaker({ windowSize: 10, envFailureThreshold: 0.6, maxFailures: 1000 });
        for (let i = 0; i < 10; i++) cb.record(res('Failed', 'assertion')); // all app-class
        expect(cb.tripped).toBe(false);
    });

    it('does not trip before the window is full', () => {
        const cb = new CircuitBreaker({ windowSize: 10, envFailureThreshold: 0.6, maxFailures: 1000 });
        for (let i = 0; i < 9; i++) cb.record(res('Failed', 'infra')); // 9 env, window not full
        expect(cb.tripped).toBe(false);
    });

    it('treats timeout/blank-page/infra/auth-detour as environment-class', () => {
        expect([...ENV_FAILURE_CATEGORIES].sort()).toEqual(['auth-detour', 'blank-page', 'infra', 'timeout']);
    });

    it('recovers within the sliding window (env failures age out)', () => {
        const cb = new CircuitBreaker({ windowSize: 10, envFailureThreshold: 0.6, maxFailures: 1000 });
        for (let i = 0; i < 5; i++) cb.record(res('Failed', 'timeout')); // 5 env
        for (let i = 0; i < 10; i++) cb.record(res('Passed'));            // push env out of the window
        expect(cb.tripped).toBe(false);
    });
});

describe('CircuitBreaker — latching', () => {
    it('stays tripped and keeps the first verdict', () => {
        const cb = new CircuitBreaker({ maxFailures: 1, windowSize: 10 });
        cb.record(res('Failed', 'assertion'));
        expect(cb.verdict.reason).toBe('max-failures');
        // Even a subsequent env-heavy window can't change the latched verdict.
        for (let i = 0; i < 10; i++) cb.record(res('Failed', 'infra'));
        expect(cb.verdict.reason).toBe('max-failures');
    });
});
