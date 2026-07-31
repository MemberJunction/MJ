/**
 * Retry-on-failure loop for non-deterministic test targets.
 *
 * LLM-driven tests (e.g. Computer Use browser automation) can fail transiently —
 * a timeout, a navigation loop, the agent giving up — yet pass cleanly on a
 * re-run. `runWithRetries` re-runs a FAILED test and accepts the first passing
 * attempt (pass-if-any). A test that fails then passes is marked `flaky` so the
 * non-determinism is surfaced in reporting, never silently masked.
 *
 * DR-D2 turned the retry decision into an injected {@link RetryPolicy}: instead
 * of a blind fixed count, the suite policy classifies the failure and consults a
 * shared suite budget, so deterministic failures (`impossible`/`app-error`) are
 * not retried at all and the suite can't burn 34 retries on 44 tests. This file
 * stays pure (no engine/DB coupling) so the loop is unit-testable in isolation;
 * the policy construction lives in `retry-policy.ts`.
 */
import { TestRunResult, PriorAttemptSummary } from '@memberjunction/testing-engine-base';

/**
 * Whether a result is a failure worth retrying. Transient/non-deterministic terminal
 * states (Failed/Error/Timeout) are retriable; Passed/Skipped are accepted as-is.
 */
export function isRetriableFailure(result: TestRunResult): boolean {
    return result.status === 'Failed' || result.status === 'Error' || result.status === 'Timeout';
}

/** A policy's verdict for one retry decision. */
export interface RetryDecision {
    /** Whether to run another attempt. */
    retry: boolean;
    /** Optional delay (ms) to wait before that attempt (backoff + jitter). */
    backoffMs?: number;
}

/**
 * Decides whether a failed attempt should be retried.
 * @param lastResult    The result of the most recent attempt (always retriable
 *                      when the policy is consulted).
 * @param attemptsSoFar How many attempts have already run (≥1).
 */
export type RetryPolicy = (lastResult: TestRunResult, attemptsSoFar: number) => RetryDecision;

/** Absolute backstop so a buggy policy can never loop forever. */
const HARD_ATTEMPT_CAP = 50;

/**
 * Run a test (via `runOnce`) with retries governed by `policy`.
 *
 * @param runOnce     Executes one attempt. Receives the 1-based attempt number so the
 *                    caller can stamp a fresh start time / iteration per attempt, and
 *                    the running list of prior failed attempts (RI-D2) so the attempt
 *                    can feed the last failure's memo forward (non-blind retry). The
 *                    list is empty on attempt 1 and grows by one each retry.
 * @param policy      Decides after each failure whether to retry and how long to wait.
 * @param onBeforeRetry Optional hook fired just before each retry (for logging).
 * @returns The final result: the first passing attempt if any, else the last failure.
 *          `attempts` is the total runs; `flaky` is true when it failed then passed.
 */
export async function runWithRetries(
    runOnce: (attempt: number, priorAttempts: PriorAttemptSummary[]) => Promise<TestRunResult>,
    policy: RetryPolicy,
    onBeforeRetry?: (nextAttempt: number, lastResult: TestRunResult) => void
): Promise<TestRunResult> {
    // CU-F3: preserve why each superseded attempt failed before it's overwritten,
    // so flakiness (the suite's #1 signal) is diagnosable from the final result.
    // RI-D2: this same list is fed to each attempt so a retry can see the prior
    // failure's memo (non-blind retry). Empty on attempt 1.
    const priorAttempts: PriorAttemptSummary[] = [];
    let result = await runOnce(1, priorAttempts);
    let attempts = 1;

    while (isRetriableFailure(result) && attempts < HARD_ATTEMPT_CAP) {
        const decision = policy(result, attempts);
        if (!decision.retry) {
            break;
        }
        priorAttempts.push(summarizeAttempt(result, attempts));
        const nextAttempt = attempts + 1;
        onBeforeRetry?.(nextAttempt, result);
        if (decision.backoffMs && decision.backoffMs > 0) {
            await new Promise(resolve => setTimeout(resolve, decision.backoffMs));
        }
        // Pass the accumulated prior attempts (RI-D2) so this attempt can feed the
        // last failure's memo to its engine as non-blind context.
        result = await runOnce(nextAttempt, priorAttempts);
        attempts = nextAttempt;

        if (!isRetriableFailure(result)) {
            // Failed on an earlier attempt, passed now → green but flaky.
            result.attempts = attempts;
            result.flaky = true;
            result.priorAttempts = priorAttempts;
            return result;
        }
    }

    result.attempts = attempts;
    result.flaky = false;
    if (priorAttempts.length > 0) {
        result.priorAttempts = priorAttempts;
    }
    return result;
}

/** Capture a lightweight, payload-free summary of a superseded attempt (CU-F3). */
function summarizeAttempt(result: TestRunResult, attempt: number): PriorAttemptSummary {
    return {
        attempt,
        status: result.status,
        score: result.score,
        durationMs: result.durationMs,
        errorMessage: result.errorMessage,
        // RI-D2: carry the classification + engine memo forward so the next
        // attempt (and reporting) isn't blind to why the last one failed.
        failureCategory: result.failureCategory,
        failureMemo: result.failureMemo,
    };
}
