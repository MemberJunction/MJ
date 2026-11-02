/**
 * wait-until.ts — a bounded condition wait, for the places the suite currently sleeps.
 *
 * WHY THIS EXISTS
 *
 * A fixed `Sleep(N)` before reading an asynchronously-produced result makes N both the floor
 * and the ceiling of how long the suite will tolerate: every run pays N even when the result
 * landed in 20ms, and a loaded runner that needs N+1 fails. Measured on the deterministic tier,
 * roughly 180s of a 665s run was spent in such sleeps.
 *
 * `WaitUntil` inverts that: N becomes a TIMEOUT rather than a floor. The common case returns as
 * soon as the condition holds, and the slow case gets more headroom than the old constant gave.
 * That is both faster and more robust — the opposite of the usual speed/reliability trade.
 *
 * WHAT IT MUST NOT BE USED FOR
 *
 * Polling can only observe something HAPPENING. Three kinds of wait in this suite are not that,
 * and converting them would silently weaken the check:
 *
 *   1. Outliving a TTL — `Sleep(3000) // outlive TTL`. The point is that real time passes so the
 *      entry genuinely expires. There is nothing to poll for.
 *   2. Asserting a NON-event — "wait past the settle window, so a deletion wrongly triggered by
 *      the edit would have run by now". You cannot poll for the absence of something; the wait IS
 *      the evidence.
 *   3. Outwaiting a known product-internal timer with no observable completion, e.g.
 *      QueryEngine's result-deletion debounce.
 *
 * For those, keep the fixed sleep and say in a comment why it is fixed.
 */

/** Sleep helper, local so this module has no dependency on the agent-live bundle. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export interface WaitUntilOptions {
    /** Upper bound on the whole wait. A timeout throws with `What` and the last problem seen. */
    TimeoutMs?: number;
    /** Gap between attempts. Small by default: the point is to notice promptly. */
    PollMs?: number;
    /**
     * Consecutive satisfying observations required before returning. Above 1 this guards against
     * one lucky read of a value that is still converging (several provider instances, a cache
     * that briefly flaps). It is a stability requirement, not a delay — see `StableForMs` for the
     * part that is about elapsed time.
     */
    StableReads?: number;
    /**
     * Minimum wall-clock the condition must hold across those reads. Use when convergence is
     * genuinely time-based rather than read-count-based; leave unset when it is not. Separating
     * this from `PollMs` is deliberate: tying stability to the poll interval means making the
     * poll slower to get a longer stability window, which is how a 5s poll with 3 required reads
     * became a hard 10s floor on every call.
     */
    StableForMs?: number;
}

const DEFAULTS = { TimeoutMs: 30_000, PollMs: 100, StableReads: 1, StableForMs: 0 } as const;

/**
 * Polls `condition` until it holds (and has held per the stability options), or throws once
 * `TimeoutMs` elapses.
 *
 * A condition that THROWS counts as "not yet", not as a failure: a read against a resource that
 * is still converging may legitimately error before it starts succeeding, and the last error is
 * reported if the wait ultimately times out. A condition that needs to fail loudly should assert
 * after `WaitUntil` returns, not inside it.
 *
 * @param condition  Observed repeatedly; truthy means satisfied. May be sync or async.
 * @param what       Describes the awaited state, for the timeout message. Phrase it as the thing
 *                   being waited FOR ("the Q13 query resolves in the QueryEngine"), because it is
 *                   read in a failure as "... did not reach '<what>' within Ns".
 */
export async function WaitUntil(
    condition: () => boolean | Promise<boolean>,
    what: string,
    options: WaitUntilOptions = {}
): Promise<void> {
    const timeoutMs = options.TimeoutMs ?? DEFAULTS.TimeoutMs;
    const pollMs = options.PollMs ?? DEFAULTS.PollMs;
    const stableReads = Math.max(1, options.StableReads ?? DEFAULTS.StableReads);
    const stableForMs = options.StableForMs ?? DEFAULTS.StableForMs;

    const started = Date.now();
    const deadline = started + timeoutMs;
    let consecutive = 0;
    let firstSatisfiedAt = 0;
    let lastProblem = 'the condition was never satisfied';

    for (;;) {
        try {
            if (await condition()) {
                consecutive++;
                if (consecutive === 1) {
                    firstSatisfiedAt = Date.now();
                }
                const heldLongEnough = Date.now() - firstSatisfiedAt >= stableForMs;
                if (consecutive >= stableReads && heldLongEnough) {
                    return;
                }
                if (!heldLongEnough) {
                    lastProblem = `condition held for ${Date.now() - firstSatisfiedAt}ms of the required ${stableForMs}ms`;
                } else {
                    lastProblem = `condition held on ${consecutive} of the required ${stableReads} consecutive reads`;
                }
            } else {
                consecutive = 0;
                firstSatisfiedAt = 0;
                lastProblem = `condition '${what}' not satisfied`;
            }
        } catch (e) {
            // "Not yet", not fatal — see the doc comment.
            consecutive = 0;
            firstSatisfiedAt = 0;
            lastProblem = e instanceof Error ? e.message : String(e);
        }

        if (Date.now() >= deadline) {
            throw new Error(
                `Timed out after ${Math.round((Date.now() - started) / 1000)}s waiting for '${what}' ` +
                `(last problem: ${lastProblem})`
            );
        }
        await sleep(pollMs);
    }
}
