import { describe, it, expect, vi } from 'vitest';
import { FailureCategory, TestRunResult } from '@memberjunction/testing-engine-base';
import {
    RetryBudget,
    computeSuiteRetryBudget,
    computeInfraReserve,
    isInfrastructureFailure,
    maxExtraAttemptsForCategory,
    computeBackoffMs,
    buildSuiteRetryPolicy,
    fixedRetries,
} from '../engine/retry-policy';

function failed(category: FailureCategory): TestRunResult {
    return {
        testRunId: 'tr', testId: 't', testName: 'T', status: 'Failed',
        score: 0, passedChecks: 0, failedChecks: 1, totalChecks: 1, oracleResults: [],
        targetType: 'Computer Use', targetLogId: 'l',
        durationMs: 1, totalCost: 0, startedAt: new Date(0), completedAt: new Date(0),
        failureCategory: category,
    };
}

describe('computeSuiteRetryBudget', () => {
    it('is ceil(0.15 × suiteSize)', () => {
        expect(computeSuiteRetryBudget(44)).toBe(7); // ceil(6.6)
        expect(computeSuiteRetryBudget(10)).toBe(2); // ceil(1.5)
        expect(computeSuiteRetryBudget(1)).toBe(1);  // ceil(0.15)
    });
    it('is 0 for a non-positive suite size', () => {
        expect(computeSuiteRetryBudget(0)).toBe(0);
        expect(computeSuiteRetryBudget(-5)).toBe(0);
    });
});

describe('RetryBudget', () => {
    it('drains one unit per consume and refuses when empty', () => {
        const b = new RetryBudget(2);
        expect(b.remaining).toBe(2);
        expect(b.tryConsume()).toBe(true);
        expect(b.tryConsume()).toBe(true);
        expect(b.tryConsume()).toBe(false);
        expect(b.remaining).toBe(0);
    });
    it('clamps a negative total to 0', () => {
        const b = new RetryBudget(-3);
        expect(b.total).toBe(-3);
        expect(b.tryConsume()).toBe(false);
    });
});

describe('maxExtraAttemptsForCategory', () => {
    it('gives deterministic classes ZERO retries regardless of the ceiling', () => {
        expect(maxExtraAttemptsForCategory('impossible', 5)).toBe(0);
        expect(maxExtraAttemptsForCategory('app-error', 5)).toBe(0);
    });
    it('caps nav-loop / assertion / unknown at 1', () => {
        expect(maxExtraAttemptsForCategory('nav-loop', 5)).toBe(1);
        expect(maxExtraAttemptsForCategory('assertion', 5)).toBe(1);
        expect(maxExtraAttemptsForCategory('unknown', 5)).toBe(1);
        expect(maxExtraAttemptsForCategory('unknown', 0)).toBe(0); // never exceeds the ceiling
    });
    it('gives env/transient classes the full requested ceiling', () => {
        for (const c of ['timeout', 'blank-page', 'infra', 'auth-detour'] as const) {
            expect(maxExtraAttemptsForCategory(c, 3)).toBe(3);
            expect(maxExtraAttemptsForCategory(c, 0)).toBe(0);
        }
    });
});

describe('computeBackoffMs', () => {
    const noJitter = () => 0.5; // rng=0.5 → (0.5*2-1)=0 → zero jitter delta

    it('grows exponentially from baseMs and caps', () => {
        expect(computeBackoffMs(2, { baseMs: 1000, capMs: 15000 }, noJitter)).toBe(1000); // first retry
        expect(computeBackoffMs(3, { baseMs: 1000, capMs: 15000 }, noJitter)).toBe(2000);
        expect(computeBackoffMs(4, { baseMs: 1000, capMs: 15000 }, noJitter)).toBe(4000);
        expect(computeBackoffMs(10, { baseMs: 1000, capMs: 15000 }, noJitter)).toBe(15000); // capped
    });

    it('applies ± jitter bounded by the jitter fraction', () => {
        const lo = computeBackoffMs(3, { baseMs: 1000, jitter: 0.25 }, () => 0);   // -25%
        const hi = computeBackoffMs(3, { baseMs: 1000, jitter: 0.25 }, () => 1);   // +25%
        expect(lo).toBe(1500); // 2000 - 500
        expect(hi).toBe(2500); // 2000 + 500
    });

    it('never returns a negative delay', () => {
        expect(computeBackoffMs(2, { baseMs: 10, jitter: 5 }, () => 0)).toBeGreaterThanOrEqual(0);
    });
});

describe('buildSuiteRetryPolicy', () => {
    it('denies retry for a deterministic category without touching the budget', () => {
        const budget = new RetryBudget(5);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 2 });
        expect(policy(failed('app-error'), 1).retry).toBe(false);
        expect(budget.remaining).toBe(5); // not consumed
    });

    it('grants retries for env classes up to the requested ceiling', () => {
        const budget = new RetryBudget(99);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 2, rng: () => 0.5 });
        expect(policy(failed('timeout'), 1).retry).toBe(true);  // 1st retry
        expect(policy(failed('timeout'), 2).retry).toBe(true);  // 2nd retry
        expect(policy(failed('timeout'), 3).retry).toBe(false); // ceiling reached
    });

    it('caps nav-loop at a single retry', () => {
        const budget = new RetryBudget(99);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 5 });
        expect(policy(failed('nav-loop'), 1).retry).toBe(true);
        expect(policy(failed('nav-loop'), 2).retry).toBe(false);
    });

    it('stops all retries once the shared budget is exhausted, and reports it once', () => {
        const budget = new RetryBudget(1);
        const onBudgetExhausted = vi.fn();
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 3, onBudgetExhausted, rng: () => 0.5 });
        expect(policy(failed('timeout'), 1).retry).toBe(true);  // consumes the only unit
        expect(policy(failed('infra'), 1).retry).toBe(false);   // budget gone
        expect(onBudgetExhausted).toHaveBeenCalledTimes(1);
    });

    it('attaches a backoff delay to a granted retry', () => {
        const budget = new RetryBudget(9);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 3, backoff: { baseMs: 1000 }, rng: () => 0.5 });
        const d = policy(failed('timeout'), 1);
        expect(d.retry).toBe(true);
        expect(d.backoffMs).toBe(1000);
    });

    it('treats an unclassified result as unknown (1 retry)', () => {
        const budget = new RetryBudget(9);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 3 });
        const noCategory = { ...failed('unknown') };
        delete noCategory.failureCategory;
        expect(policy(noCategory, 1).retry).toBe(true);
        expect(policy(noCategory, 2).retry).toBe(false);
    });
});

describe('fixedRetries', () => {
    it('retries up to n extra times regardless of category', () => {
        const policy = fixedRetries(2);
        expect(policy(failed('app-error'), 1).retry).toBe(true); // ignores category
        expect(policy(failed('app-error'), 2).retry).toBe(true);
        expect(policy(failed('app-error'), 3).retry).toBe(false);
    });
    it('n=0 never retries', () => {
        expect(fixedRetries(0)(failed('timeout'), 1).retry).toBe(false);
    });
});

describe('computeInfraReserve', () => {
    it('reserves half the budget, rounded down', () => {
        expect(computeInfraReserve(4)).toBe(2);
        expect(computeInfraReserve(5)).toBe(2);
        expect(computeInfraReserve(1)).toBe(0); // a 1-unit budget stays fully shared
        expect(computeInfraReserve(0)).toBe(0);
    });

    it('never returns a negative reserve', () => {
        expect(computeInfraReserve(-4)).toBe(0);
    });
});

describe('isInfrastructureFailure', () => {
    it('treats only harness-attributable classes as privileged', () => {
        expect(isInfrastructureFailure('auth-detour')).toBe(true);
        expect(isInfrastructureFailure('infra')).toBe(true);
    });

    it('does not privilege agent-attributable or app classes', () => {
        for (const c of ['nav-loop', 'assertion', 'unknown', 'timeout', 'blank-page', 'app-error', 'impossible'] as FailureCategory[]) {
            expect(isInfrastructureFailure(c)).toBe(false);
        }
    });
});

describe('RetryBudget infrastructure reserve', () => {
    it('stops non-privileged callers at the reserve floor', () => {
        const b = new RetryBudget(4, 2);
        expect(b.tryConsume(false)).toBe(true);
        expect(b.tryConsume(false)).toBe(true);
        // Two units remain but they are reserved.
        expect(b.tryConsume(false)).toBe(false);
        expect(b.remaining).toBe(2);
        expect(b.remainingUnreserved).toBe(0);
    });

    it('lets privileged callers claim the reserve after agent classes are capped', () => {
        // This is the exact observed failure: 4 nav-loops drained everything and
        // every later auth-detour was accepted first-shot.
        const b = new RetryBudget(4, 2);
        b.tryConsume(false);
        b.tryConsume(false);
        expect(b.tryConsume(true)).toBe(true);
        expect(b.tryConsume(true)).toBe(true);
        expect(b.tryConsume(true)).toBe(false);
        expect(b.remaining).toBe(0);
    });

    it('keeps the TOTAL cap unchanged — a reserve redistributes, never adds', () => {
        const b = new RetryBudget(4, 2);
        let granted = 0;
        while (b.tryConsume(true)) granted++;
        expect(granted).toBe(4);
    });

    it('defaults to no reserve, preserving the previous shared-pool behavior', () => {
        const b = new RetryBudget(3);
        expect(b.tryConsume(false)).toBe(true);
        expect(b.tryConsume(false)).toBe(true);
        expect(b.tryConsume(false)).toBe(true);
        expect(b.tryConsume(false)).toBe(false);
    });

    it('ignores a reserve larger than the total', () => {
        const b = new RetryBudget(2, 99);
        expect(b.tryConsume(false)).toBe(false); // everything is reserved
        expect(b.tryConsume(true)).toBe(true);
    });
});

describe('buildSuiteRetryPolicy — infra reserve', () => {
    it('grants an auth-detour retry from the reserve when agent classes are spent', () => {
        const budget = new RetryBudget(2, 1);
        const policy = buildSuiteRetryPolicy({ budget, requestedMax: 2, rng: () => 0.5 });

        expect(policy(failed('nav-loop'), 1).retry).toBe(true);   // uses the unreserved unit
        expect(policy(failed('nav-loop'), 1).retry).toBe(false);  // reserve is off-limits
        expect(policy(failed('auth-detour'), 1).retry).toBe(true); // reserve released
    });
});

describe('buildSuiteRetryPolicy — chronic failures', () => {
    it('denies an agent-class retry to a test with no recent pass', () => {
        const budget = new RetryBudget(4, 0);
        const onChronicSkipped = vi.fn();
        const policy = buildSuiteRetryPolicy({
            budget, requestedMax: 2, rng: () => 0.5,
            isChronicFailure: () => true, onChronicSkipped,
        });

        expect(policy(failed('nav-loop'), 1).retry).toBe(false);
        expect(onChronicSkipped).toHaveBeenCalledTimes(1);
        // Critically, the denial must not spend a unit.
        expect(budget.remaining).toBe(4);
    });

    it('still retries an infrastructure failure on a chronic test', () => {
        // A chronic test failing on auth is the harness's fault, not the test's.
        const budget = new RetryBudget(4, 2);
        const policy = buildSuiteRetryPolicy({
            budget, requestedMax: 2, rng: () => 0.5, isChronicFailure: () => true,
        });

        expect(policy(failed('auth-detour'), 1).retry).toBe(true);
        expect(policy(failed('infra'), 1).retry).toBe(true);
    });

    it('leaves non-chronic tests untouched', () => {
        const budget = new RetryBudget(4, 0);
        const policy = buildSuiteRetryPolicy({
            budget, requestedMax: 2, rng: () => 0.5, isChronicFailure: () => false,
        });

        expect(policy(failed('nav-loop'), 1).retry).toBe(true);
    });

    it('applies the category cap before the chronic gate', () => {
        // app-error is 0-retry by class, so the chronic hook must never be consulted.
        const isChronicFailure = vi.fn().mockReturnValue(true);
        const policy = buildSuiteRetryPolicy({
            budget: new RetryBudget(4, 0), requestedMax: 2, rng: () => 0.5, isChronicFailure,
        });

        expect(policy(failed('app-error'), 1).retry).toBe(false);
        expect(isChronicFailure).not.toHaveBeenCalled();
    });
});
