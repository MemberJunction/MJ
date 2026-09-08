/**
 * Suite circuit breaker.
 *
 * A doomed run had no early exit: the OOM run burned 80 min to total loss, and a
 * broken deploy (Explorer serving a blank shell) would burn the full 7.8 h and
 * ~10k LLM calls producing 380 identical failures. Playwright ships `maxFailures`
 * for exactly this. This is a two-tier breaker consulted at the dispatch point:
 *
 *   1. ENVIRONMENT tier — a sliding window over the last N final outcomes; if
 *      ≥ `envFailureThreshold` of them failed with an ENVIRONMENT-class category
 *      (timeout / blank-page / infra / auth-detour), the host is degrading, so
 *      abort rather than keep hammering it. (Admission control already paused on
 *      critical health before failures piled up; a full window of env failures
 *      despite that is strong evidence.)
 *   2. MAX-FAILURES tier — a plain cap on total failures of ANY category, set
 *      high, to catch the broken-deploy case ("assume an app-level event").
 *
 * Pure + latched (once tripped, stays tripped) so the trip decision is
 * unit-testable and stable for the dispatch gate to poll.
 */
import { FailureCategory, TestRunResult } from '@memberjunction/testing-engine-base';

/**
 * Categories that indicate the ENVIRONMENT is at fault (vs. the app under test).
 * A run failing mostly with these is degrading infrastructure, not a real
 * regression, so it should abort rather than burn hours.
 */
export const ENV_FAILURE_CATEGORIES: ReadonlySet<FailureCategory> = new Set<FailureCategory>([
    'timeout', 'blank-page', 'infra', 'auth-detour',
]);

/** Why the breaker tripped. */
export type TripReason = 'environment' | 'max-failures';

/** The breaker's current verdict. */
export interface TripVerdict {
    tripped: boolean;
    reason?: TripReason;
    detail?: string;
}

/** Tunables for {@link CircuitBreaker}. */
export interface CircuitBreakerConfig {
    /** Sliding-window size for the environment tier. Default 10. */
    windowSize?: number;
    /** Fraction of the window that must be env-class failures to trip. Default 0.6. */
    envFailureThreshold?: number;
    /** Total failures (any category) that trip the max-failures tier. Default ∞ (off). */
    maxFailures?: number;
}

/** Default max-failures cap: high, so it only catches broken-deploy runs. */
export function defaultMaxFailures(suiteSize: number): number {
    return Math.max(10, Math.ceil(0.25 * Math.max(0, suiteSize)));
}

/** Whether a result is a terminal failure (counts toward both tiers). */
function isFailure(result: TestRunResult): boolean {
    return result.status === 'Failed' || result.status === 'Error' || result.status === 'Timeout';
}

export class CircuitBreaker {
    private readonly windowSize: number;
    private readonly envFailureThreshold: number;
    private readonly maxFailures: number;
    /** Sliding window of recent finals: true = env-class failure. */
    private readonly window: boolean[] = [];
    private totalFailures = 0;
    private _verdict: TripVerdict = { tripped: false };

    constructor(config: CircuitBreakerConfig = {}) {
        this.windowSize = config.windowSize ?? 10;
        this.envFailureThreshold = config.envFailureThreshold ?? 0.6;
        this.maxFailures = config.maxFailures ?? Number.POSITIVE_INFINITY;
    }

    /** Feed one FINAL test outcome (post-retry) into both tiers. */
    record(result: TestRunResult): void {
        const failed = isFailure(result);
        if (failed) {
            this.totalFailures++;
        }
        const envFail = failed && result.failureCategory != null && ENV_FAILURE_CATEGORIES.has(result.failureCategory);
        this.window.push(envFail);
        if (this.window.length > this.windowSize) {
            this.window.shift();
        }
        this.evaluate();
    }

    private evaluate(): void {
        if (this._verdict.tripped) {
            return; // latched — first trip wins
        }
        if (this.totalFailures >= this.maxFailures) {
            this._verdict = {
                tripped: true,
                reason: 'max-failures',
                detail: `${this.totalFailures} failures reached the cap of ${this.maxFailures} — assume an app-level event`,
            };
            return;
        }
        if (this.window.length >= this.windowSize) {
            const envFails = this.window.filter(Boolean).length;
            if (envFails / this.window.length >= this.envFailureThreshold) {
                this._verdict = {
                    tripped: true,
                    reason: 'environment',
                    detail: `${envFails}/${this.window.length} recent attempts failed with environment-class errors`,
                };
            }
        }
    }

    get tripped(): boolean {
        return this._verdict.tripped;
    }

    get verdict(): TripVerdict {
        return this._verdict;
    }
}
