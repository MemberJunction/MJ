/** Local until SessionCloseReason gains these values (they need the CloseReason CHECK migration). */
export type ExpiryReason = 'Idle' | 'TimeLimit';

/**
 * Parses the absolute deadline (ms) from a session's `Config_` JSON, or null when absent/malformed.
 * A malformed deadline counts as absent by design: a sweep must never throw on one bad row, so null
 * is the documented failure result here, not a swallowed error.
 */
export function ParseSessionDeadlineMs(configJson: string | null | undefined): number | null {
    if (!configJson) {
        return null;
    }
    try {
        const parsed = JSON.parse(configJson) as { maxSessionDeadlineIso?: unknown };
        if (typeof parsed.maxSessionDeadlineIso !== 'string') {
            return null;
        }
        const ms = Date.parse(parsed.maxSessionDeadlineIso);
        return Number.isNaN(ms) ? null : ms;
    } catch {
        // Malformed JSON: treated as "no deadline" (see doc comment).
        return null;
    }
}

/**
 * Decides why a session has expired, or null when it has not.
 *
 * Two moments can expire a session: its idle moment (`LastActiveAt + closeThresholdMs`) and its authored
 * hard deadline (`Config_.maxSessionDeadlineIso`). Only a moment that has already passed (`<= nowMs`)
 * counts, and the EARLIER of the passed moments wins. A tie at the same instant yields `TimeLimit`:
 * the authored rule beats the safety net. A row without a usable `LastActiveAt` (null, or a value that
 * does not parse to a date) is never `Idle`, and neither is any row when `closeThresholdMs` is non-finite.
 * `LastActiveAt` is typed `Date` but may arrive as an ISO string from a provider, so both are accepted.
 */
export function ExpiryCloseReason(
    session: { LastActiveAt: Date | string | null | undefined; Config_: string | null | undefined },
    nowMs: number,
    closeThresholdMs: number,
): ExpiryReason | null {
    const lastActiveMs = session.LastActiveAt ? new Date(session.LastActiveAt).getTime() : Number.NaN;
    const idleMs = lastActiveMs + closeThresholdMs;
    const idleAt = Number.isFinite(idleMs) ? idleMs : null;
    const deadlineAt = ParseSessionDeadlineMs(session.Config_);
    const idlePassed = idleAt !== null && idleAt <= nowMs;
    const deadlinePassed = deadlineAt !== null && deadlineAt <= nowMs;
    if (deadlinePassed && idlePassed) {
        return deadlineAt <= idleAt ? 'TimeLimit' : 'Idle';
    }
    if (deadlinePassed) {
        return 'TimeLimit';
    }
    return idlePassed ? 'Idle' : null;
}
