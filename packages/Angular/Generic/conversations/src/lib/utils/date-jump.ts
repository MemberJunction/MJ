import type { RealtimeTimelineSourceDetail } from './realtime-session-timeline';

/**
 * Periods the transcript's date navigator offers. Kept as a union rather than a string so a
 * new dropdown entry cannot silently fall through to "no cutoff".
 */
export type DateJumpPeriod = 'today' | 'yesterday' | 'last-week' | 'last-month';

/**
 * How far back a jump had to page before it stopped.
 *
 * The plan's requirement is that a jump never silently no-ops, so every terminal state here is
 * something the caller can report: `reached` scrolled to a real message, `oldest` ran out of
 * history, `capped` hit {@link DATE_JUMP_MAX_PAGES}, `empty` had nothing loaded at all.
 */
export type DateJumpOutcome = 'reached' | 'oldest' | 'capped' | 'empty';

/**
 * Ceiling on older-page loads for one jump.
 *
 * A jump into a very old conversation would otherwise page the entire history back — the
 * exact unbounded read windowing exists to prevent. On a miss the caller lands the user at
 * the oldest loaded message instead, which is where paging left them anyway.
 */
export const DATE_JUMP_MAX_PAGES = 50;

/** Local midnight `daysAgo` days before `now`. */
function startOfDayBefore(now: Date, daysAgo: number): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - daysAgo);
    return d;
}

/**
 * Inclusive lower bound for a period — the oldest instant a message may carry and still count
 * as "in" that period. `today` is midnight today; the rest reach further back.
 */
export function ResolveDateJumpCutoff(period: DateJumpPeriod, now: Date): Date {
    switch (period) {
        case 'today':
            return startOfDayBefore(now, 0);
        case 'yesterday':
            return startOfDayBefore(now, 1);
        case 'last-week':
            return startOfDayBefore(now, 7);
        case 'last-month':
            return startOfDayBefore(now, 30);
    }
}

/** The timestamp a jump sorts on. Falsy/invalid stamps are skipped rather than treated as epoch. */
function detailTime(detail: RealtimeTimelineSourceDetail): number | null {
    const raw = (detail as { __mj_CreatedAt?: Date | string | null }).__mj_CreatedAt;
    if (!raw) {
        return null;
    }
    const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    return Number.isNaN(ms) ? null : ms;
}

export interface DateJumpTarget<T extends RealtimeTimelineSourceDetail> {
    /** Oldest loaded detail at or after the cutoff — the message to scroll to. */
    Detail: T | null;
    /**
     * True when the loaded set cannot yet answer the question: everything loaded is at or
     * after the cutoff, so an older page might contain a still-earlier message in-period.
     */
    NeedsOlder: boolean;
}

/**
 * Resolves which loaded message a date jump should land on.
 *
 * The target is the OLDEST message at or after the cutoff — jumping to "last week" means the
 * start of last week's conversation, not its end.
 *
 * `NeedsOlder` is the windowing-aware part. If every loaded message is in-period, the true
 * start of the period may still be below the loaded window, so the caller pages and asks
 * again. If any loaded message predates the cutoff, the boundary is already inside the loaded
 * set and no amount of paging would improve the answer.
 */
export function ResolveDateJumpTarget<T extends RealtimeTimelineSourceDetail>(
    chronologicalDetails: readonly T[],
    period: DateJumpPeriod,
    now: Date
): DateJumpTarget<T> {
    const cutoff = ResolveDateJumpCutoff(period, now).getTime();

    let target: T | null = null;
    let sawOlderThanCutoff = false;

    for (const detail of chronologicalDetails) {
        const ms = detailTime(detail);
        if (ms === null) {
            continue;
        }
        if (ms < cutoff) {
            sawOlderThanCutoff = true;
        } else if (target === null) {
            target = detail;
        }
    }

    // Nothing in-period AND nothing older loaded => the whole window post-dates the cutoff
    // only if we also found no target; that still means paging could help.
    return { Detail: target, NeedsOlder: !sawOlderThanCutoff };
}

/** Human-readable result, for the caller to surface instead of failing silently. */
export function DescribeDateJumpOutcome(outcome: DateJumpOutcome, period: DateJumpPeriod): string {
    const label = period === 'last-week' ? 'last week'
        : period === 'last-month' ? 'last month'
        : period;
    switch (outcome) {
        case 'reached':
            return `Jumped to ${label}.`;
        case 'oldest':
            return `No messages from ${label} — showing the start of the conversation.`;
        case 'capped':
            return `Stopped after loading ${DATE_JUMP_MAX_PAGES} pages — showing the oldest loaded message.`;
        case 'empty':
            return 'Nothing loaded to jump to.';
    }
}

/**
 * Final outcome for a date jump.
 *
 * The paging loop and the scroll answer DIFFERENT questions: the loop knows only whether it
 * ran out of history (or pages) to load, while the scroll knows whether an in-period message
 * was actually found. Letting the loop's verdict win was a bug — a conversation whose oldest
 * message is itself in-period never sees a pre-cutoff row, so the loop reports "ran out"
 * even though the jump landed on a perfectly good target and the user was told no such
 * messages exist.
 *
 * So: a successful scroll always wins. The cap only surfaces when the scroll did NOT reach,
 * because that is the only case where "we stopped early" explains the miss.
 */
export function CombineDateJumpOutcome(
    scrollOutcome: DateJumpOutcome,
    hitPageCap: boolean
): DateJumpOutcome {
    if (scrollOutcome === 'reached') {
        return 'reached';
    }
    return hitPageCap ? 'capped' : scrollOutcome;
}
