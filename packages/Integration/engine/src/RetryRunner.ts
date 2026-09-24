/**
 * Configuration for retry behavior with exponential backoff.
 */
export interface RetryConfig {
    /** Maximum number of attempts (including the initial one). Default: 3 */
    MaxAttempts: number;
    /** Initial backoff delay in milliseconds. Default: 1000 */
    InitialBackoffMs: number;
    /** Maximum backoff delay in milliseconds. Default: 30000 */
    MaxBackoffMs: number;
    /** Fraction of jitter to add (0-1). Default: 0.1 */
    JitterFraction: number;
}

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    MaxAttempts: 3,
    InitialBackoffMs: 1000,
    MaxBackoffMs: 30000,
    JitterFraction: 0.1,
};

/**
 * Computes the delay for a given attempt using exponential backoff with jitter.
 * @param attempt - The current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function computeDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.InitialBackoffMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponentialDelay, config.MaxBackoffMs);
    const jitter = capped * config.JitterFraction * Math.random();
    return capped + jitter;
}

/**
 * Optional hooks that let a caller make the wait between attempts smarter than blind backoff.
 *
 * Both exist for rate limiting. Exponential backoff is the right default for a network blip, but it
 * is the WRONG answer to a 429: the source has usually told us exactly how long to wait, and
 * retrying sooner is what turns a soft throttle into a hard one.
 */
export interface RetryHooks {
    /**
     * Derive the wait from the error itself — e.g. a `Retry-After` header. Return `null`/`undefined`
     * to keep the computed exponential backoff. The larger of the two is NOT taken automatically;
     * returning a value replaces the backoff, so a caller can honour a source that asks for a
     * SHORTER wait as well as a longer one.
     */
    DelayForError?: (error: unknown, attempt: number, backoffMs: number) => number | null | undefined;
    /**
     * Awaited after the delay and before the next attempt — e.g. re-acquiring a rate-limit token, so
     * a retry passes through the same gate the first attempt did instead of bypassing it.
     */
    BeforeRetry?: (attempt: number, error: unknown) => Promise<void> | void;
}

/**
 * Executes an operation with retry logic using exponential backoff.
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @param isRetryable - Predicate to determine if a caught error should trigger a retry
 * @param onRetry - Optional callback invoked before each retry with attempt number, error, and delay.
 *                  Runs BEFORE the wait, so it is the right place to report the failure onward (e.g.
 *                  backing off a shared limiter) rather than after the retries are spent.
 * @param hooks - Optional {@link RetryHooks} for source-directed delays and pre-attempt gating
 * @returns The result of the operation
 * @throws The last error encountered if all attempts fail
 */
export async function WithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    isRetryable: (error: unknown) => boolean = () => true,
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void,
    hooks?: RetryHooks
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= config.MaxAttempts; attempt++) {
        try {
            return await operation();
        } catch (err) {
            lastError = err;

            const isLastAttempt = attempt === config.MaxAttempts;
            if (isLastAttempt || !isRetryable(err)) {
                throw err;
            }

            const backoffMs = computeDelay(attempt, config);
            const directed = hooks?.DelayForError?.(err, attempt, backoffMs);
            const delayMs = typeof directed === 'number' && Number.isFinite(directed) && directed >= 0
                ? directed
                : backoffMs;

            if (onRetry) {
                onRetry(attempt, err, delayMs);
            }

            await sleep(delayMs);
            await hooks?.BeforeRetry?.(attempt, err);
        }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError;
}

/**
 * Returns a promise that resolves after the specified delay.
 * @param ms - Delay in milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
