/**
 * When a run must stop: cooperative cancellation primitives and the time-budget
 * expiry decision. Pure and browser-free so the timing behavior is unit-testable.
 */

/**
 * Thrown by the engine's cancellation checkpoints to unwind the current step. The
 * main loop maps it to the `Cancelled` status — it is control flow, not an error.
 */
export class CancellationError extends Error {
    constructor(message: string = 'Run cancelled') {
        super(message);
        this.name = 'CancellationError';
    }
}

/**
 * Resolve after `ms`, or early the moment `signal` aborts. Always resolves, never
 * rejects — the caller's next cancellation checkpoint turns the early return into
 * the terminal status.
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

/** Minimum wall-clock grace over the budget before the engine's own ceiling fires. */
export const WALL_CLOCK_GRACE_MIN_MS = 15_000;
/** Wall-clock grace as a fraction of the budget (whichever is larger wins). */
export const WALL_CLOCK_GRACE_FACTOR = 0.125;

/**
 * The wall-clock ceiling (total elapsed) at which the run expires gracefully.
 *
 * Deliberately HALF the TestEngine watchdog's grace (`max(30s, 0.25 × maxMs)`) so
 * this always trips first and the run ends as a judged `TimeBudgetExceeded`
 * rather than being abandoned unscored by the watchdog. Keep the halving if the
 * watchdog formula changes.
 */
export function wallClockCeilingMs(maxMs: number): number {
    const base = Math.max(0, maxMs);
    return base + Math.max(WALL_CLOCK_GRACE_MIN_MS, Math.round(base * WALL_CLOCK_GRACE_FACTOR));
}

/**
 * Whether the run must expire now and why, or `null` when it is within budget (or
 * no budget is configured). Two independent bounds: agent time, which excludes
 * settle so a slow-rendering app doesn't burn the reasoning budget, and the
 * wall-clock ceiling, which caps total elapsed time.
 */
export function timeBudgetExpiryReason(
    elapsedMs: number,
    cumulativeSettleMs: number,
    maxMs: number | undefined
): string | null {
    if (!maxMs || maxMs <= 0) {
        return null;
    }
    const agentTimeMs = Math.max(0, elapsedMs - cumulativeSettleMs);
    if (agentTimeMs >= maxMs) {
        return `agent-time budget (${maxMs}ms, settle excluded)`;
    }
    const ceiling = wallClockCeilingMs(maxMs);
    if (elapsedMs >= ceiling) {
        return `wall-clock ceiling (${ceiling}ms, settle included)`;
    }
    return null;
}
