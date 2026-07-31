/**
 * Time-budget expiry decision for a Computer Use run (CU-B4).
 *
 * Pure (no engine/timer coupling) so it's unit-testable by feeding elapsed/settle
 * numbers directly — the same discipline as {@link resolveWatchdogMs}.
 *
 * Two independent bounds decide when the agentic loop must stop gracefully:
 *
 *  1. AGENT-TIME budget — `elapsed − cumulativeSettle ≥ maxMs`. Settle (page
 *     renders, auth-detour recovery) is excluded so a slow-to-render app doesn't
 *     burn the agent's *reasoning* budget.
 *
 *  2. WALL-CLOCK ceiling — `elapsed ≥ maxMs + engineGrace`. A hard cap on TOTAL
 *     elapsed time. Without it, a settle-heavy run keeps its agent-time under
 *     `maxMs` while wall-clock climbs, so it never self-expires here and instead
 *     blows past into the TestEngine watchdog's grace window — which ABANDONS the
 *     run as an unscored infra `Error` (the "test never ran" symptom). The engine
 *     grace is deliberately HALF the watchdog's, so this ceiling always trips
 *     first and the run ends as a graceful, judged `TimeBudgetExceeded` with room
 *     to spare for the final judge call.
 *
 * Watchdog grace (TestEngine `resolveWatchdogMs`) = `max(30s, 0.25 × maxMs)`.
 * Engine grace (here)                            = `max(15s, 0.125 × maxMs)`.
 * ⇒ ceiling < watchdog for every `maxMs`, with a margin ≥ 15s for the judge.
 * If the watchdog grace formula changes, keep these halved to preserve the order.
 */

/** Minimum wall-clock grace over the budget before the engine's own ceiling fires. */
export const WALL_CLOCK_GRACE_MIN_MS = 15_000;
/** Wall-clock grace as a fraction of the budget (whichever is larger wins). */
export const WALL_CLOCK_GRACE_FACTOR = 0.125;

/** The wall-clock ceiling (total elapsed) at which the run expires gracefully. */
export function wallClockCeilingMs(maxMs: number): number {
    const base = Math.max(0, maxMs);
    return base + Math.max(WALL_CLOCK_GRACE_MIN_MS, Math.round(base * WALL_CLOCK_GRACE_FACTOR));
}

/**
 * Whether the run must expire now, and why — or `null` when it's within budget
 * (or no budget is configured). The reason string is for the graceful-expiry log.
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
