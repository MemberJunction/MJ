/**
 * Retry policy construction for suite runs.
 *
 * Turns the retry decision from "retry every non-passing status N times" into a
 * classified, budgeted policy:
 *   - Deterministic failures (`impossible`, `app-error`) get ZERO retries — the
 *     recheck run showed 27 such failures retried 3× each was the largest waste.
 *   - Non-env classes (`nav-loop`, `assertion`, `unknown`) get at most 1.
 *   - Env/transient classes (`timeout`, `blank-page`, `infra`, `auth-detour`)
 *     get the operator's full `--retries` budget (health-gated by admission
 *     control).
 *   - A SUITE-WIDE budget caps total extra attempts at ceil(0.15 × suiteSize),
 *     so "34 retries in a 44-test run" can't happen — it's a diagnosis, not a
 *     strategy. When the budget is spent, remaining failures are accepted first-shot.
 *   - Exponential backoff + jitter spaces retries out.
 *
 * Pure — the policy reads the already-classified `TestRunResult.failureCategory`
 * (stamped by the engine via `failure-classifier.ts`) and mutates only its own
 * budget, so every branch is unit-testable without a driver.
 */
import { FailureCategory, TestRunResult } from '@memberjunction/testing-engine-base';
import { RetryPolicy } from './retry';

/** Fraction of suite size allowed as total extra retry attempts. */
export const SUITE_RETRY_BUDGET_FRACTION = 0.15;

/**
 * Share of the budget reserved for infrastructure failures.
 *
 * Without a reserve the budget is first-come-first-served, and agent-attributable
 * failures early in the run drain it before any infrastructure failure is even
 * seen. Observed: four `nav-loop` failures on never-passing tests consumed all 4
 * units, then every `auth-detour` — a class the driver itself calls "an
 * infrastructure/session fault, not an agent failure" — was accepted first-shot.
 * Reserving a share keeps the total cap intact while guaranteeing infra can retry.
 */
export const SUITE_RETRY_INFRA_RESERVE_FRACTION = 0.5;

/** Extra retry attempts allowed suite-wide: ceil(fraction × suiteSize), ≥0. */
export function computeSuiteRetryBudget(suiteSize: number): number {
    if (suiteSize <= 0) {
        return 0;
    }
    return Math.ceil(SUITE_RETRY_BUDGET_FRACTION * suiteSize);
}

/** Units of `budget` only infrastructure failures may consume. */
export function computeInfraReserve(budget: number): number {
    return Math.floor(Math.max(0, budget) * SUITE_RETRY_INFRA_RESERVE_FRACTION);
}

/**
 * Failure classes that are not the agent's fault. These may draw on the reserved
 * portion of the budget; everything else may not.
 */
const INFRASTRUCTURE_CATEGORIES: ReadonlySet<FailureCategory> = new Set<FailureCategory>(['auth-detour', 'infra']);

/** Whether a category is infrastructure-attributable (privileged for retries). */
export function isInfrastructureFailure(category: FailureCategory): boolean {
    return INFRASTRUCTURE_CATEGORIES.has(category);
}

/**
 * A shared, monotonically-draining counter of extra retry attempts for a suite.
 * Every worker consults the same instance; `tryConsume` is synchronous so it's
 * race-free under the single-threaded event loop.
 *
 * `reserved` units are claimable only by privileged (infrastructure) callers, so
 * agent-class failures cannot starve them. The TOTAL cap is unchanged.
 */
export class RetryBudget {
    private _remaining: number;
    constructor(public readonly total: number, public readonly reserved: number = 0) {
        this._remaining = Math.max(0, total);
    }
    get remaining(): number {
        return this._remaining;
    }
    /** Reserve actually in force: never negative, never more than the total. */
    private get effectiveReserve(): number {
        return Math.max(0, Math.min(this.reserved, this._remainingTotal));
    }
    /** The total, floored at 0 (a negative total is simply an empty budget). */
    private get _remainingTotal(): number {
        return Math.max(0, this.total);
    }
    /** Units still claimable by a non-privileged caller. */
    get remainingUnreserved(): number {
        return Math.max(0, this._remaining - this.effectiveReserve);
    }
    /**
     * Consume one unit; returns false (and consumes nothing) when the caller's
     * share is exhausted. Privileged callers may dip into the reserve.
     */
    tryConsume(privileged = false): boolean {
        const floor = privileged ? 0 : this.effectiveReserve;
        if (this._remaining > floor) {
            this._remaining--;
            return true;
        }
        return false;
    }
}

/**
 * Max EXTRA attempts allowed for a failure category, given the operator's
 * requested ceiling. Deterministic classes return 0 regardless of the ceiling.
 */
export function maxExtraAttemptsForCategory(category: FailureCategory, requestedMax: number): number {
    const ceiling = Math.max(0, requestedMax);
    switch (category) {
        case 'impossible':
        case 'app-error':
            return 0; // deterministic — retrying is pure waste
        case 'nav-loop':
        case 'assertion':
        case 'unknown':
            return Math.min(1, ceiling);
        case 'timeout':
        case 'blank-page':
        case 'infra':
        case 'auth-detour':
        default:
            return ceiling; // env/transient — full budget (health-gated in DR-D3)
    }
}

/** Tunables for {@link computeBackoffMs}. */
export interface BackoffConfig {
    /** Delay for the first retry (ms). Default 1000. */
    baseMs?: number;
    /** Upper bound before jitter (ms). Default 15000. */
    capMs?: number;
    /** Jitter fraction, ± of the delay. Default 0.25. */
    jitter?: number;
}

/**
 * Exponential backoff with jitter for the `attempt`-th run (attempt ≥ 2 is the
 * first retry). `rng` is injectable so the jitter is deterministic under test.
 */
export function computeBackoffMs(attempt: number, config: BackoffConfig = {}, rng: () => number = Math.random): number {
    const baseMs = config.baseMs ?? 1000;
    const capMs = config.capMs ?? 15000;
    const jitter = config.jitter ?? 0.25;
    const exp = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt - 2)));
    const delta = exp * jitter * (rng() * 2 - 1);
    return Math.max(0, Math.round(exp + delta));
}

/** Inputs for {@link buildSuiteRetryPolicy}. */
export interface SuiteRetryPolicyOptions {
    /** Shared suite-wide extra-attempt budget. */
    budget: RetryBudget;
    /** Operator's per-test retry ceiling (e.g. `--retries`). */
    requestedMax: number;
    /** Backoff tunables. */
    backoff?: BackoffConfig;
    /** Jitter RNG (injectable for tests). */
    rng?: () => number;
    /** Fired once when a retry is denied purely because the budget is exhausted. */
    onBudgetExhausted?: (result: TestRunResult) => void;
    /**
     * Whether a test has no pass in its recent history. Chronic failures are
     * re-rolls of a known-bad outcome, so they forfeit their agent-class retry and
     * leave the budget for tests that can actually flip. Infrastructure failures
     * are still retried — those are the harness's fault, not the test's.
     */
    isChronicFailure?: (result: TestRunResult) => boolean;
    /** Fired once when a retry is denied because the test is a chronic failure. */
    onChronicSkipped?: (result: TestRunResult) => void;
}

/**
 * Build the suite {@link RetryPolicy}: classify → category cap → chronic gate →
 * suite budget (with infra reserve) → backoff. Budget is consumed only when a
 * retry is actually granted.
 */
export function buildSuiteRetryPolicy(opts: SuiteRetryPolicyOptions): RetryPolicy {
    const { budget, requestedMax, backoff, rng, onBudgetExhausted, isChronicFailure, onChronicSkipped } = opts;
    return (lastResult, attemptsSoFar) => {
        const category = lastResult.failureCategory ?? 'unknown';
        const cap = maxExtraAttemptsForCategory(category, requestedMax);
        const extraSoFar = attemptsSoFar - 1;
        if (extraSoFar >= cap) {
            return { retry: false };
        }
        const privileged = isInfrastructureFailure(category);
        if (!privileged && isChronicFailure?.(lastResult)) {
            onChronicSkipped?.(lastResult);
            return { retry: false };
        }
        if (!budget.tryConsume(privileged)) {
            onBudgetExhausted?.(lastResult);
            return { retry: false };
        }
        return { retry: true, backoffMs: computeBackoffMs(attemptsSoFar + 1, backoff, rng) };
    };
}

/**
 * A fixed-count policy (the legacy behavior): retry up to `n` extra times
 * regardless of category, with no backoff. Used by the standalone/repeat paths
 * and tests.
 */
export function fixedRetries(n: number): RetryPolicy {
    return (_lastResult, attemptsSoFar) => ({ retry: attemptsSoFar - 1 < n });
}
