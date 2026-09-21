import {
    SessionCardIsSameDayRange,
    SessionCardStatusChip,
    SessionCardTitle,
    type RealtimeSessionStatusChip,
    type RealtimeSessionTimelineGroup,
    type RealtimeSessionTimelineMeta,
} from '@memberjunction/conversations-runtime';

/**
 * @fileoverview What the collapsed realtime-session card displays.
 *
 * Separate from the component, and free of any React Native import, for two reasons. It is the part
 * worth testing — this package keeps no React renderer in its test setup by design — and every
 * decision in it is a thin call into `@memberjunction/conversations-runtime`, so keeping it in one
 * small module makes it obvious that nothing here is deciding anything the web decides differently.
 */

/** Everything the card displays, resolved from the block and its meta. */
export type RealtimeSessionCardView = {
    /** "Realtime session · Sage", or the generic label. */
    Title: string;
    /** The status chip, or null when the session row could not be read. */
    Chip: RealtimeSessionStatusChip | null;
    /** The formatted time range, or null when the session has no start. */
    Range: string | null;
    /** "3 turns" / "1 turn". */
    TurnLabel: string;
    /** The meta line under the title. */
    MetaLine: string;
    /** Speaker label and text for the collapsed one-line preview, or null when there is none. */
    Preview: { Role: string; Text: string } | null;
    /** Whether tapping should reveal the transcript. */
    CanExpand: boolean;
};

/**
 * Resolves everything the card shows.
 *
 * Split out from the component because this app has no React renderer in its test setup by
 * design — the presentational decisions are the part worth asserting, and they are all here.
 *
 * @param group The collapsed session block.
 * @param meta Session-row enrichment, or null when the lookup was unavailable.
 * @param turnCount How many visible turns the expansion has to show.
 * @param userName Display name for the user's own turns.
 */
export function BuildRealtimeSessionCardView(
    group: RealtimeSessionTimelineGroup,
    meta: RealtimeSessionTimelineMeta | null,
    turnCount: number,
    userName: string,
): RealtimeSessionCardView {
    const turnLabel = `${group.TurnCount} ${group.TurnCount === 1 ? 'turn' : 'turns'}`;
    const range = FormatRange(group);
    return {
        Title: SessionCardTitle(meta),
        Chip: SessionCardStatusChip(meta),
        Range: range,
        TurnLabel: turnLabel,
        MetaLine: range ? `${range} · ${turnLabel}` : turnLabel,
        Preview: group.LastTurnPreview
            ? { Role: group.LastTurnRole === 'User' ? userName : 'Agent', Text: group.LastTurnPreview }
            : null,
        // Nothing to open when the session left no visible turns — a card that expands to an empty
        // panel is worse than one that plainly does not expand.
        CanExpand: turnCount > 0,
    };
}

/**
 * Formats the card's time range.
 *
 * A same-day range prints the date once and only the time on the right, so "Sep 14, 9:00 AM →
 * 9:40 AM" reads as one session rather than two timestamps.
 */
function FormatRange(group: RealtimeSessionTimelineGroup): string | null {
    if (!group.StartedAt) return null;
    const date = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const start = `${date(group.StartedAt)}, ${time(group.StartedAt)}`;
    if (!group.EndedAt || group.EndedAt.getTime() === group.StartedAt.getTime()) {
        return start;
    }
    const end = SessionCardIsSameDayRange(group)
        ? time(group.EndedAt)
        : `${date(group.EndedAt)}, ${time(group.EndedAt)}`;
    return `${start} → ${end}`;
}
