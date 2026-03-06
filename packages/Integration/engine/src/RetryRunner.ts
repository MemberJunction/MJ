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
 * Executes an operation with retry logic using exponential backoff.
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @param isRetryable - Predicate to determine if a caught error should trigger a retry
 * @param onRetry - Optional callback invoked before each retry with attempt number, error, and delay
 * @returns The result of the operation
 * @throws The last error encountered if all attempts fail
 */
export async function WithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    isRetryable: (error: unknown) => boolean = () => true,
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void
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

            const delayMs = computeDelay(attempt, config);
            if (onRetry) {
                onRetry(attempt, err, delayMs);
            }

            await sleep(delayMs);
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
