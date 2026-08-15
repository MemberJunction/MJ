/**
 * `WithTimeout`'s own timeout must be terminal for the attempt, while genuine transport errors stay
 * retryable.
 *
 * WHY: `WithTimeout` is a `Promise.race` with no cancellation — the abandoned operation keeps
 * running. `IsRetryableError` counts `NETWORK_TIMEOUT` as transient, so the fetch path used to retry
 * a timed-out page twice more, each attempt issuing a fresh full page of vendor requests on top of
 * the still-in-flight previous one. Up to 3x the load on a source already too slow to finish once —
 * and it could not succeed anyway, since the same work under the same budget exceeds it again.
 *
 * The subtlety this pins: `ClassifyError` folds `econnreset` in with timeouts under the SAME
 * `NETWORK_TIMEOUT` code, and a reset socket IS worth retrying. So the exclusion has to key on the
 * error WithTimeout minted (`instanceof OperationTimeoutError`), not on the classified code. Both
 * halves are asserted here — a fix that just dropped `NETWORK_TIMEOUT` from `IsRetryableError` would
 * pass the first test and fail the second.
 */
import { describe, it, expect, vi } from 'vitest';
import { WithTimeout, OperationTimeoutError } from '../BaseIntegrationConnector.js';
import { WithRetry, type RetryConfig } from '../RetryRunner.js';
import { ClassifyError, IsRetryableError } from '../types.js';

/**
 * Mirrors the predicate `IntegrationEngine`'s fetch path passes to `WithRetry`.
 *
 * This is a COPY — the engine spells it inline and does not export it — so these tests pin the
 * predicate's semantics, not the engine's use of it. The engine-level guarantee (a timed-out page is
 * attempted exactly once through the real `ExecuteEntityMaps` path) is asserted in
 * `IntegrationEngine.fetch-timeout.test.ts`, which drives a never-settling `FetchChanges` through the
 * real engine. Both matter: this file explains WHY the predicate is shaped this way, that one proves
 * the engine still uses it.
 */
const fetchIsRetryable = (err: unknown): boolean =>
    !(err instanceof OperationTimeoutError) && IsRetryableError(ClassifyError(err).Code);

/** Fast retry config so these tests don't sit through exponential backoff. */
const FAST_RETRY: RetryConfig = { MaxAttempts: 3, InitialBackoffMs: 1, MaxBackoffMs: 2, JitterFraction: 0 };

describe('OperationTimeoutError', () => {
    it('carries the operation name and the budget that expired', async () => {
        const err = await WithTimeout(new Promise(() => { /* never settles */ }), 5, 'FetchChanges(contacts)')
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(OperationTimeoutError);
        const timeout = err as OperationTimeoutError;
        expect(timeout.OperationName).toBe('FetchChanges(contacts)');
        expect(timeout.TimeoutMs).toBe(5);
    });

    it('keeps the exact message text, so existing classification is unaffected', async () => {
        const err = await WithTimeout(new Promise(() => { /* never settles */ }), 5, 'FetchChanges(contacts)')
            .catch((e: unknown) => e);

        // The message is load-bearing: ClassifyError reads it, and the run-event stream logs it.
        expect((err as Error).message).toBe("Operation 'FetchChanges(contacts)' timed out after 5ms");
        expect(ClassifyError(err).Code).toBe('NETWORK_TIMEOUT');
        expect(ClassifyError(err).Severity).toBe('Warning');
    });

    it('is still an Error, so every existing catch and log path keeps working', async () => {
        const err = await WithTimeout(new Promise(() => { /* never settles */ }), 5, 'op').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).name).toBe('OperationTimeoutError');
    });
});

describe("the fetch path's retry predicate", () => {
    it('does NOT retry our own timeout — the attempt is terminal', async () => {
        const attempt = vi.fn(() => WithTimeout(new Promise(() => { /* never settles */ }), 5, 'FetchChanges(contacts)'));

        const err = await WithRetry(attempt, FAST_RETRY, fetchIsRetryable).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(OperationTimeoutError);
        expect(attempt).toHaveBeenCalledTimes(1);   // 1, not 3 — this is the whole fix
    });

    it('DOES still retry a reset socket, which shares the NETWORK_TIMEOUT code', async () => {
        // Guards against "fixing" this by dropping NETWORK_TIMEOUT from IsRetryableError: that would
        // silently cost real resilience, because ClassifyError puts econnreset under the same code.
        let calls = 0;
        const attempt = vi.fn(async () => {
            calls++;
            if (calls < 3) throw new Error('read ECONNRESET');
            return 'recovered';
        });

        const result = await WithRetry(attempt, FAST_RETRY, fetchIsRetryable);

        expect(result).toBe('recovered');
        expect(attempt).toHaveBeenCalledTimes(3);
        // Same classified code as the timeout — which is exactly why the exclusion is instanceof-based.
        expect(ClassifyError(new Error('read ECONNRESET')).Code).toBe('NETWORK_TIMEOUT');
    });

    it('leaves rate-limit and database errors retryable', async () => {
        expect(fetchIsRetryable(new Error('429 rate limit exceeded'))).toBe(true);
        expect(fetchIsRetryable(new Error('connection lost'))).toBe(true);
    });

    it('still refuses non-transient errors, as before', async () => {
        expect(fetchIsRetryable(new Error('401 unauthorized: invalid api key'))).toBe(false);
        expect(fetchIsRetryable(new Error('foreign key constraint violated'))).toBe(false);
    });

    it('excludes the timeout by identity, not by message shape', () => {
        // A vendor error that merely mentions a timeout is the vendor's, not ours — it did not come
        // from a budget WE set, so it stays retryable.
        expect(fetchIsRetryable(new Error('upstream gateway timeout'))).toBe(true);
        expect(fetchIsRetryable(new OperationTimeoutError('FetchChanges(x)', 30000))).toBe(false);
    });
});
