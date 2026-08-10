/**
 * Engine-level watchdog for a single test execution.
 *
 * The engine awaited `driver.Execute()` with no timeout of its own: a driver
 * whose promise never settles wedged a worker forever, undetectably. Drivers set
 * `status:'Timeout'` when THEY time out, but a genuinely stuck driver (crashed
 * browser, hung network, lost await) never returns at all. This wraps the
 * execution in a race against a watchdog set to the driver's own effective
 * timeout PLUS grace, so it only fires when the driver has blown well past when
 * it should have returned — converting an undetectable hang into a bounded,
 * classified, reported event and guaranteeing the worker moves on.
 *
 * Pure (no engine/DB coupling) and timer-injection-free (uses real timers but is
 * driven entirely by its inputs) so it's unit-testable with fake timers.
 */

/** Minimum grace added on top of the effective timeout before the watchdog fires. */
export const WATCHDOG_MIN_GRACE_MS = 30_000;
/** Additional grace as a fraction of the effective timeout (whichever is larger wins). */
export const WATCHDOG_GRACE_FACTOR = 0.25;

/**
 * Compute when the watchdog should fire: `effectiveTimeout + grace`, where grace
 * is `max(WATCHDOG_MIN_GRACE_MS, effectiveTimeout × WATCHDOG_GRACE_FACTOR)`. So a
 * 5-min test tolerates ~75 s of overrun before it's declared wedged; a very
 * short test still gets a 30 s floor so normal teardown jitter never trips it.
 */
export function resolveWatchdogMs(
    effectiveTimeoutMs: number,
    opts?: { minGraceMs?: number; graceFactor?: number }
): number {
    const minGrace = opts?.minGraceMs ?? WATCHDOG_MIN_GRACE_MS;
    const factor = opts?.graceFactor ?? WATCHDOG_GRACE_FACTOR;
    const base = Math.max(0, effectiveTimeoutMs);
    const grace = Math.max(minGrace, Math.round(base * factor));
    return base + grace;
}

/** Result of a watched execution. */
export interface WatchdogOutcome<T> {
    /** True when the watchdog fired before `work` settled. */
    timedOut: boolean;
    /** The resolved value; present only when `timedOut` is false. */
    value?: T;
}

/**
 * Race `work` against a `watchdogMs` timer.
 *
 * - `work` resolves first → `{ timedOut: false, value }`.
 * - `work` rejects first → the rejection is re-thrown (the caller's existing
 *   try/catch handles a thrown Execute).
 * - the timer fires first → `onTimeout()` runs and `{ timedOut: true }` is
 *   returned; the abandoned `work` promise is fully handled internally so a LATE
 *   settlement (the zombie eventually resolving/rejecting) never becomes an
 *   unhandled rejection.
 *
 * `watchdogMs ≤ 0` disables the watchdog (awaits `work` directly).
 */
export async function withWatchdog<T>(
    work: Promise<T>,
    watchdogMs: number,
    opts: { onTimeout?: () => void } = {}
): Promise<WatchdogOutcome<T>> {
    if (!watchdogMs || watchdogMs <= 0) {
        return { timedOut: false, value: await work };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const raced = await Promise.race([
            // Both handlers attached, so a late rejection of the abandoned work
            // promise settles this derived promise (handled) — never unhandled.
            work.then(v => ({ k: 'ok' as const, v }), e => ({ k: 'err' as const, e })),
            new Promise<{ k: 'timeout' }>(resolve => {
                timer = setTimeout(() => resolve({ k: 'timeout' as const }), watchdogMs);
            }),
        ]);
        if (raced.k === 'timeout') {
            opts.onTimeout?.();
            return { timedOut: true };
        }
        if (raced.k === 'err') {
            throw raced.e;
        }
        return { timedOut: false, value: raced.v };
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
