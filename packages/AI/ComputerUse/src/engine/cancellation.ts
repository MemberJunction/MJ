/**
 * Cooperative cancellation primitives (CU-B8).
 *
 * `Stop()` used to be observed only at the top of each step, so a cancellation
 * fired mid-step (during a 30s+ LLM call, a settle poll, or between actions)
 * could hold a worker slot for a minute-plus while the current step ran to
 * completion. These primitives let the engine react in seconds: an
 * {@link AbortSignal} threaded into the awaitable operations (LLM calls, the
 * settle/backoff delays) makes the in-flight `await` return promptly, and
 * {@link CancellationError} — thrown by the engine's `ensureNotCancelled()`
 * checkpoints — unwinds to a single clean `Cancelled` terminal status.
 *
 * Pure and browser-free so the timing behavior is unit-testable.
 */

/**
 * Thrown by the engine's cooperative cancellation checkpoints to unwind the
 * current step. The engine catches it at the main-loop boundary and maps it to
 * the `Cancelled` status — it is control flow, never an infrastructure error.
 */
export class CancellationError extends Error {
    constructor(message: string = 'Run cancelled') {
        super(message);
        this.name = 'CancellationError';
    }
}

/**
 * Resolve after `ms`, or early — still *resolving*, never rejecting — the
 * moment `signal` aborts. A cancelled run's pending settle poll or retry
 * backoff shouldn't keep a worker slot warm for its full duration; the caller's
 * next `ensureNotCancelled()` checkpoint turns the early return into the clean
 * terminal status. Resolving (not rejecting) keeps this a pure timing helper
 * with no error semantics of its own.
 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        return Promise.resolve();
    }
    return new Promise<void>(resolve => {
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
