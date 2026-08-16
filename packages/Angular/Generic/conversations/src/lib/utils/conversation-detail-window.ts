import { NormalizeUUID } from '@memberjunction/global';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import {
    BuildConversationTimeline,
    type ConversationTimelineItem,
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




export function NeedsSessionExpansion(
    oldestFetched: RealtimeTimelineSourceDetail | null | undefined
): string | null {
    return trimmedSessionId(oldestFetched?.AgentSessionID ?? null);
}

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

export interface ConversationDetailWindowCursor {
    /** Exclusive upper bound for the next older fetch. Null only when the window is empty. */
    OldestSequence: number | null;
    /** Inclusive high-water mark of the loaded tail. Used to detect live appends. */
    NewestSequence: number | null;
    /** True when at least one older raw row exists that is not in LoadedDetails. */
    HasMoreAbove: boolean;
}

export interface ConversationDetailWindow {
    ConversationID: string;
    /** All details loaded so far, chronological by Sequence. Grows as the user pages up. */
    LoadedDetails: MJConversationDetailEntity[];
    Cursor: ConversationDetailWindowCursor;
    /** Timeline of LoadedDetails — derived, never stored separately as source of truth. */
    Timeline: ConversationTimelineItem<MJConversationDetailEntity>[];
}

export interface DetailWindowFetchResult {
    Details: MJConversationDetailEntity[];
    HasMoreAbove: boolean;
}

