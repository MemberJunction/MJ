import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';

// Task 3 makes SessionCloseReason include these; until then it is declared here.
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
 * the authored rule beats the safety net. A row without `LastActiveAt` is never `Idle`.
 */
export function ExpiryCloseReason(
    session: Pick<MJAIAgentSessionEntity, 'LastActiveAt' | 'Config_'>,
    nowMs: number,
    closeThresholdMs: number,
): ExpiryReason | null {
    const idleAt = session.LastActiveAt ? session.LastActiveAt.getTime() + closeThresholdMs : null;
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
