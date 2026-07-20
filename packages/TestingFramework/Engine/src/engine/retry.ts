/**
 * Retry-on-failure helper for non-deterministic test targets.
 *
 * LLM-driven tests (e.g. Computer Use browser automation) can fail transiently —
 * a timeout, a navigation loop, the agent giving up — yet pass cleanly on a re-run.
 * `runWithRetries` re-runs a FAILED test up to `maxRetries` extra times and accepts
 * the first passing attempt (pass-if-any). A test that fails then passes is marked
 * `flaky` so the non-determinism is surfaced in reporting, never silently masked.
 *
 * Pure (no engine/DB coupling) so the retry policy is unit-testable in isolation.
 */
import { TestRunResult, PriorAttemptSummary } from '@memberjunction/testing-engine-base';

/**
 * Whether a result is a failure worth retrying. Transient/non-deterministic terminal
 * states (Failed/Error/Timeout) are retriable; Passed/Skipped are accepted as-is.
 */
export function isRetriableFailure(result: TestRunResult): boolean {
    return result.status === 'Failed' || result.status === 'Error' || result.status === 'Timeout';
}

/**
 * Run a test (via `runOnce`) with up to `maxRetries` extra attempts on failure.
 *
 * @param runOnce     Executes one attempt. Receives the 1-based attempt number so the
 *                    caller can stamp a fresh start time / iteration per attempt.
 * @param maxRetries  Extra attempts allowed after the first. 0 disables retries.
 * @param onBeforeRetry Optional hook fired just before each retry (for logging).
 * @returns The final result: the first passing attempt if any, else the last failure.
 *          `attempts` is the total runs; `flaky` is true when it failed then passed.
 */
export async function runWithRetries(
    runOnce: (attempt: number) => Promise<TestRunResult>,
    maxRetries: number,
    onBeforeRetry?: (nextAttempt: number, lastResult: TestRunResult) => void
): Promise<TestRunResult> {
    let result = await runOnce(1);
    let attempts = 1;
    // CU-F3: preserve why each superseded attempt failed before it's overwritten,
    // so flakiness (the suite's #1 signal) is diagnosable from the final result.
    const priorAttempts: PriorAttemptSummary[] = [];

    while (maxRetries > 0 && attempts - 1 < maxRetries && isRetriableFailure(result)) {
        priorAttempts.push(summarizeAttempt(result, attempts));
        const nextAttempt = attempts + 1;
        onBeforeRetry?.(nextAttempt, result);
        result = await runOnce(nextAttempt);
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
    };
}
