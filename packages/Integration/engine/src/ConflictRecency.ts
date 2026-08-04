/**
 * "MostRecent" conflict resolution helper.
 *
 * When a field changed on BOTH sides since the last sync (a true bidirectional
 * conflict) and the entity map's ConflictResolution policy is `MostRecent`, the side
 * that was modified more recently wins. This compares the MJ row's last-update time
 * against the external record's modified time at RECORD granularity (most sources
 * don't expose per-field timestamps), and returns null when either timestamp is
 * missing/unparseable so the caller can fall back to DestWins — a conflict is never
 * silently dropped on missing data.
 *
 * Pure + dependency-free so it is cheaply unit-testable; the engine wires it to
 * `__mj_UpdatedAt` (MJ side) and `ExternalRecord.ModifiedAt` (external side).
 */
export type RecencyWinner = 'mj' | 'external';

/** Parses a Date / epoch-number / ISO-string into epoch ms; null if not a usable timestamp. */
export function parseTimestamp(v: unknown): number | null {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.length > 0) {
        const t = Date.parse(v);
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

/**
 * Returns which side wins under MostRecent, or null when the comparison can't be made.
 * Ties go to 'mj' (DestWins-style tiebreak) — the local edit is assumed authoritative
 * when both stamps are equal.
 */
export function mostRecentWinner(mjUpdatedAt: unknown, externalModifiedAt: unknown): RecencyWinner | null {
    const mjTs = parseTimestamp(mjUpdatedAt);
    const extTs = parseTimestamp(externalModifiedAt);
    if (mjTs == null || extTs == null) return null;
    return mjTs >= extTs ? 'mj' : 'external';
}
