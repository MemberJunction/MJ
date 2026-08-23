import { NormalizeUUID } from '@memberjunction/global';
import {
    BuildConversationTimeline,
    type RealtimeTimelineSourceDetail
} from './realtime-session-timeline';

export function SelectLatestTimelinePage<T extends RealtimeTimelineSourceDetail>(
    chronologicalDetails: readonly T[],
    pageSize: number
): { Page: T[]; OldestIncluded: T | null } {
    const timeline = BuildConversationTimeline(chronologicalDetails);
    const pageItems = timeline.slice(Math.max(0, timeline.length - pageSize));

    // Message items match by identity (the grouping pass passes the row through
    // untouched); session items by normalized id, so every folded row comes along.
    const includedMessages = new Set<T>();
    const includedSessionKeys = new Set<string>();
    for (const item of pageItems) {
        if (item.Kind === 'message') {
            includedMessages.add(item.Detail);
        } else {
            includedSessionKeys.add(NormalizeUUID(item.Group.SessionID));
        }
    }

    // Filter the ORIGINAL row set rather than walking the page items, so the result keeps
    // chronological order and picks up session rows interleaved after the card's position.
    const page = chronologicalDetails.filter(detail => {
        const sessionId = trimmedSessionId(detail.AgentSessionID);
        return sessionId === null
            ? includedMessages.has(detail)
            : includedSessionKeys.has(NormalizeUUID(sessionId));
    });

    return { Page: page, OldestIncluded: page.length > 0 ? page[0] : null };
}



// NOTE: the plan also called for a `NeedsSessionExpansion` helper here, shared between the
// store and the engine. It is not exported, because there is no such shared caller: deciding
// whether a fetched page landed mid-session is something only the fetcher can act on, and the
// fetcher is `ConversationEngine.expandOldestSession` in `@memberjunction/core-entities`.
// That package cannot import from this one — the dependency runs Angular → core-entities and
// must never run the other way — so a helper here would have been exported, tested, and
// called by nothing. The engine makes the same `trim()` check inline against the row it just
// read. `trimmedSessionId` below keeps that definition honest on THIS side of the boundary,
// where `SelectLatestTimelinePage` does need it.

/**
 * Trims the stamped session id; empty/whitespace stamps count as unstamped — mirrors the
 * grouping pass, so a row this module treats as a normal message is one the timeline
 * treats as a normal message too.
 */
function trimmedSessionId(raw: string | null | undefined): string | null {
    const trimmed = raw?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
}


/** Default number of *timeline items* shown on first paint and per older page. */
export const DEFAULT_TRANSCRIPT_PAGE_SIZE = 10;

/** Raw-row over-read so session collapse still fills a page of timeline items. */
export const DEFAULT_RAW_OVERREAD = DEFAULT_TRANSCRIPT_PAGE_SIZE * 3;

/**
 * How many times a short page may re-fetch with a wider over-read before settling.
 *
 * The over-read exists because raw rows are not display items — a realtime session folds
 * many rows into ONE timeline card, so `3 × pageSize` rows can yield two or three items
 * instead of ten. Growing the read is what keeps a page a page.
 *
 * Bounded, because the pathological case is a conversation that is almost entirely one long
 * session: growing without limit there would walk the whole table, which is the exact cost
 * windowing exists to avoid. Three attempts reaches 12 × pageSize, past which a short page is
 * the honest answer and the sentinel simply fires again.
 */
export const MAX_OVERREAD_ATTEMPTS = 3;

/** Multiplier applied to the over-read on each retry. */
export const OVERREAD_GROWTH_FACTOR = 2;

/**
 * Extra pages a tail refresh may read to bridge back to the rows it already holds.
 *
 * A refresh reads the NEWEST page. If the conversation grew by more than a page since the
 * last read — a long agent burst, a tab left open — that page starts above the loaded tail
 * and the rows in between belong to neither. Merging the two anyway produces a set that
 * sorts into order and looks contiguous while silently missing its middle, which is the
 * worst possible outcome: nothing about the transcript says anything is absent.
 *
 * So the refresh pages down until it reaches known rows. Bounded, because "the tail ran away
 * from us" has no upper limit and chasing it without one is the unbounded read this whole
 * feature exists to remove. Past the budget the refresh drops the disconnected older rows
 * instead and lets the sentinel offer them back — a visible gap the reader can close, rather
 * than an invisible one they cannot.
 */
export const MAX_REFRESH_BACKFILL_PAGES = 3;

export interface ConversationDetailWindowCursor {
    /** Exclusive upper bound for the next older fetch. Null only when the window is empty. */
    OldestSequence: number | null;
    /** Inclusive high-water mark of the loaded tail. Used to detect live appends. */
    NewestSequence: number | null;
    /** True when at least one older raw row exists that is not in LoadedDetails. */
    HasMoreAbove: boolean;
}

// NOTE: the loaded-window and fetch-result shapes the plan sketched here live on the
// consumer instead — `ConversationDetailWindowSnapshot` in
// `../services/conversation-detail-window.store`, and `DetailWindowLoadResult` in
// `@memberjunction/core-entities`. Declaring unused duplicates here would give a future
// contributor two plausible contracts to pick between.

