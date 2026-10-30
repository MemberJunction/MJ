import type { SessionCloseReason } from './SessionManager.js';

/** The close reasons an expiry check can yield: the two ways a live session runs out of time. */
export type ExpiryReason = Extract<SessionCloseReason, 'Idle' | 'TimeLimit'>;

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

/**
 * How far ahead of a stored deadline a browser's `TimeLimit` claim is still believed. The browser's
 * alarm runs on its own clock and a skewed or throttled tab may fire a little early; a minute covers that
 * without letting a client end a session meant to run for minutes more.
 */
export const DEADLINE_CLAIM_SKEW_MS = 60_000;

/**
 * Verifies a `TimeLimit` close claim against the session's stored deadline. The browser claims, the server
 * verifies: the claim holds when the stored deadline has passed or falls within {@link DEADLINE_CLAIM_SKEW_MS},
 * otherwise (no deadline, or one far in the future) the close is recorded as `Explicit`. The janitor's own
 * `TimeLimit` trivially passes, so every caller shares one path, and this module remains the single place that
 * answers "did the deadline pass?" for both the sweep and the client claim. Idleness never counts here.
 */
export function VerifyTimeLimitClaim(
    session: { LastActiveAt: Date | string | null | undefined; Config_: string | null | undefined },
    nowMs: number,
): 'TimeLimit' | 'Explicit' {
    return ExpiryCloseReason(session, nowMs + DEADLINE_CLAIM_SKEW_MS, Number.POSITIVE_INFINITY) === 'TimeLimit'
        ? 'TimeLimit'
        : 'Explicit';
}
