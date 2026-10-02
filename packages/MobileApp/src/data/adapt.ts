/**
 * Adapters that convert real MJ entity shapes into the UI-shaped types the
 * mockup-derived screens render. Centralized so swapping data sources stays
 * a one-call concern.
 */

import type { ConversationListItem, ConversationDetailLoad, ConversationMessage } from '@/data/services/conversations';
import type {
    ConversationParticipantAgent,
    ConversationSummary,
} from '@/data/types';
import { Colors, ColorForAgent } from '@/theme/tokens';
import { NormalizeUUID } from '@memberjunction/global';
import {
    BuildConversationTimeline,
    FindRealtimeSessionMeta,
    IsVisibleRealtimeTurn,
    type RealtimeSessionTimelineGroup,
    type RealtimeSessionTimelineMeta,
    type RealtimeTimelineSourceDetail,
} from '@memberjunction/conversations-runtime';
import { MentionsToPlainText } from './mention-display';

/**
 * Derive the single uppercase avatar initial from an agent/participant name.
 *
 * @param name Source name; may be null/empty.
 * @returns The first letter uppercased, or `'A'` when the name is missing.
 */
function initialsOf(name: string | null): string {
    if (!name) return 'A';
    const trimmed = name.trim();
    return trimmed.charAt(0).toUpperCase() || 'A';
}

/**
 * Format a timestamp as a compact, list-friendly relative label
 * ("Now", "5m", a same-day clock time, "Yest", a weekday, or a month/day date).
 *
 * @param when The instant to describe.
 * @param now  Reference "current" time (injectable for testing); defaults to `new Date()`.
 * @returns A short human-readable label suitable for a conversation row.
 */
function relativeTimeLabel(when: Date, now: Date = new Date()): string {
    const diffMs = now.getTime() - when.getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return 'Now';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const sameDay = when.toDateString() === now.toDateString();
    if (sameDay) {
        return when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === when.toDateString()) return 'Yest';
    if (h < 24 * 7) return when.toLocaleDateString([], { weekday: 'short' });
    return when.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Convert a service-layer {@link ConversationListItem} (raw MJ entity + derived
 * message metadata) into a UI-ready {@link ConversationSummary}, assigning each
 * participating agent a stable color/initial. When no agents are known, falls
 * back to a single "Skip" placeholder participant.
 *
 * @param item The loaded conversation list item from the conversations service.
 * @returns The UI-shaped conversation summary for the list.
 */
export function AdaptConversationToSummary(item: ConversationListItem): ConversationSummary {
    const conv = item.entity;
    const agents: ConversationParticipantAgent[] = item.AgentIds.length === 0
        ? [{ id: 'unknown', name: 'Skip', color: Colors.agentFallback, initial: 'A' }]
        : item.AgentIds.map((id, idx) => {
            const name = item.AgentNames[idx] ?? 'Agent';
            return {
                id,
                name,
                color: ColorForAgent(name),
                initial: initialsOf(name),
            };
        });
    return {
        Id: conv.ID,
        // Both run through the mention conversion for the same reason message bodies do: a title
        // derived from a message that opened with a mention, and a snippet that IS the last message,
        // would otherwise show the raw `@{"type":…}` wire format in the list. Converting at display
        // also repairs conversations already named that way in the database.
        Title: MentionsToPlainText(conv.Name) || '(untitled)',
        Snippet: MentionsToPlainText(item.LatestSnippet) || '(no messages yet)',
        Timestamp: relativeTimeLabel(item.LatestAt),
        Agents: agents,
        MessageCount: item.messageCount,
        Live: item.live,
        Pinned: conv.IsPinned ?? false,
    };
}

/**
 * Group conversations into Pinned / Today / Yesterday / Earlier buckets,
 * matching the visual structure of the mockup.
 */
export type GroupedConversations = {
    Pinned: ConversationSummary[];
    Today: ConversationSummary[];
    Yesterday: ConversationSummary[];
    Earlier: ConversationSummary[];
};

/**
 * Adapt and bucket a list of conversations into Pinned / Today / Yesterday /
 * Earlier groups. Pinned wins over date bucketing; remaining items are placed by
 * the local calendar date of their latest activity.
 *
 * @param items The loaded conversation list items.
 * @returns The four grouped, UI-shaped summary buckets.
 */
export function GroupConversations(items: ConversationListItem[]): GroupedConversations {
    const out: GroupedConversations = { Pinned: [], Today: [], Yesterday: [], Earlier: [] };
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    for (const item of items) {
        const summary = AdaptConversationToSummary(item);
        if (summary.Pinned) {
            out.Pinned.push(summary);
            continue;
        }
        const when = item.LatestAt.toDateString();
        if (when === todayStr) out.Today.push(summary);
        else if (when === yesterdayStr) out.Yesterday.push(summary);
        else out.Earlier.push(summary);
    }
    return out;
}

/** UI reference to an agent (id + name + derived avatar color/initial). */
export type AdaptedAgentRef = {
    id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    color: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    initial: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
};

/**
 * Build an {@link AdaptedAgentRef} from a possibly-missing id/name pair,
 * supplying safe fallbacks ("unknown" id, "Agent" name) and deriving a stable
 * color and initial from the name.
 *
 * @param id   Agent id; null/undefined becomes `'unknown'`.
 * @param name Agent display name; null/undefined becomes `'Agent'`.
 * @returns The UI-ready agent reference.
 */
export function AdaptAgentRef(id: string | null | undefined, name: string | null | undefined): AdaptedAgentRef {
    const safeName = name ?? 'Agent';
    return {
        id: id ?? 'unknown',
        name: safeName,
        color: ColorForAgent(safeName),
        initial: initialsOf(safeName),
    };
}

/**
 * A conversation message in UI shape — a discriminated union on `kind`.
 * `user` messages carry just their text; `agent` messages additionally carry the
 * agent reference, run status, suggested follow-up responses, and completion time.
 */
export type AdaptedMessage =
    | { kind: 'user'; id: string; text: string; CreatedAt: Date }  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    | {
        kind: 'agent';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
        id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
        Agent: AdaptedAgentRef;
        Body: string;
        CreatedAt: Date;
        Status: 'Complete' | 'In-Progress' | 'Error';
        SuggestedResponses: string[];
        CompletionMs: number | null;
        /**
         * The artifact this turn produced, when it produced one.
         *
         * `MJ: Conversation Details` carries `ArtifactID` directly, so the link from a message to
         * the thing it made is a column read rather than a join — which is what lets the thread
         * show an artifact card in place instead of only listing artifacts in a dock detached from
         * the turn that created them.
         */
        artifactId: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    };

/**
 * One renderable entry in the thread: an ordinary message, or a whole voice session collapsed
 * into a single element.
 *
 * The collapse is not cosmetic. Every turn of a live voice call is persisted as a normal
 * `MJ: Conversation Detail` stamped with its `AgentSessionID`, so a forty-turn call rendered
 * flat buries the text conversation around it. The web has collapsed these into a session card
 * since the feature shipped; this screen did not, which is the divergence this type closes.
 */
export type AdaptedTimelineItem =
    | { kind: 'message'; message: AdaptedMessage }  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    | {
        kind: 'session';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
        /** The collapsed block: time range, turn count, last-turn preview. */
        Group: RealtimeSessionTimelineGroup;
        /** Session row enrichment (agent name, status, close reason), or null when unavailable. */
        Meta: RealtimeSessionTimelineMeta | null;
        /** The session's visible turns, so the card can expand in place instead of leaving a dead end. */
        Turns: AdaptedMessage[];
    };

/**
 * Convert a service-layer {@link ConversationMessage} (wrapping an MJ
 * `MJ: Conversation Details` row) into a UI {@link AdaptedMessage}. `Role='User'`
 * rows become `user` messages; all others ('AI'/'Error') become `agent` messages,
 * with `SuggestedResponses` JSON safely parsed to at most four string suggestions
 * and the body falling back to the `Error` text when `Message` is empty.
 *
 * @param msg The service-layer conversation message.
 * @returns The UI-shaped message union member.
 */
export function AdaptMessage(msg: ConversationMessage): AdaptedMessage {
    const d = msg.detail;
    const createdAt = (d as unknown as { __mj_CreatedAt?: Date | string }).__mj_CreatedAt;
    const date = createdAt ? new Date(createdAt) : new Date();
    if (d.Role === 'User') {
        return {
            kind: 'user',
            id: d.ID,
            // Mention tokens are stored as JSON for exact routing; a person must never see that.
            text: MentionsToPlainText(d.Message),
            CreatedAt: date,
        };
    }
    // Treat both 'AI' and 'Error' as agent rows
    let suggestedResponses: string[] = [];
    if (d.SuggestedResponses) {
        try {
            const parsed: unknown = JSON.parse(d.SuggestedResponses);
            if (Array.isArray(parsed)) {
                suggestedResponses = parsed.filter((x): x is string => typeof x === 'string').slice(0, 4);
            }
        } catch {
            // ignore parse errors
        }
    }
    return {
        kind: 'agent',
        id: d.ID,
        Agent: AdaptAgentRef(d.AgentID, msg.agentName),
        Body: d.Message ?? (d.Error ?? ''),
        CreatedAt: date,
        Status: d.Status ?? 'Complete',
        SuggestedResponses: suggestedResponses,
        CompletionMs: d.CompletionTime ?? null,
        artifactId: d.ArtifactID ?? null,
    };
}

/**
 * Adapt a fully-loaded conversation ({@link ConversationDetailLoad}) into the
 * UI shape the detail screen renders: title, the de-duplicated set of
 * participating agents (derived from message `AgentID`s), a live flag (any
 * message still `In-Progress`), the adapted message list, and the raw artifacts.
 *
 * @param load The conversation, its messages, and its artifacts from the service.
 * @returns A UI-shaped object with `id`, `title`, `participants`, `messageCount`,
 *          `live`, `messages`, and `artifacts`.
 */
export function AdaptConversation(load: ConversationDetailLoad) {
    const participants = new Map<string, AdaptedAgentRef>();
    for (const msg of load.Messages) {
        if (msg.detail.AgentID) {
            const ref = AdaptAgentRef(msg.detail.AgentID, msg.agentName);
            if (!participants.has(ref.id)) participants.set(ref.id, ref);
        }
    }
    return {
        id: load.Conversation.ID,
        title: MentionsToPlainText(load.Conversation.Name) || '(untitled)',
        participants: Array.from(participants.values()),
        messageCount: load.Messages.length,
        live: load.Messages.some((m) => m.detail.Status === 'In-Progress'),
        messages: load.Messages.map(AdaptMessage),
        timeline: BuildThreadTimeline(load),
        artifacts: load.Artifacts,
    };
}

/**
 * Builds the renderable thread: ordinary messages in order, with each voice session's stamped
 * rows collapsed into one element at the position of its first turn.
 *
 * The grouping itself is `BuildConversationTimeline` from the shared runtime — the same pass the
 * web message list runs — so the two surfaces cannot disagree about what counts as a session or
 * where it belongs in the order. What is added here is the per-session turn list the card expands
 * to show, selected with the runtime's own visible-turn rule so its length matches the turn count
 * the card prints above it.
 *
 * @param load The conversation, its messages, its artifacts and its session meta.
 */
export function BuildThreadTimeline(load: ConversationDetailLoad): AdaptedTimelineItem[] {
    // The grouping pass reads a structural row shape; carrying the adapted message alongside it
    // avoids a second lookup to get from a grouped row back to what should be rendered.
    type Source = RealtimeTimelineSourceDetail & { Adapted: AdaptedMessage; Visible: boolean };
    const sources: Source[] = load.Messages.map((m) => {
        const row: RealtimeTimelineSourceDetail = {
            ID: m.detail.ID,
            AgentSessionID: m.detail.AgentSessionID ?? null,
            Role: m.detail.Role,
            Message: m.detail.Message,
            HiddenToUser: m.detail.HiddenToUser ?? false,
            __mj_CreatedAt: (m.detail as unknown as { __mj_CreatedAt?: Date | null }).__mj_CreatedAt ?? null,
        };
        return { ...row, Adapted: AdaptMessage(m), Visible: IsVisibleRealtimeTurn(row) };
    });

    const turnsBySession = new Map<string, AdaptedMessage[]>();
    for (const src of sources) {
        const sessionId = src.AgentSessionID?.trim();
        if (!sessionId || !src.Visible) continue;
        const key = NormalizeUUID(sessionId);
        const turns = turnsBySession.get(key);
        if (turns) turns.push(src.Adapted);
        else turnsBySession.set(key, [src.Adapted]);
    }

    return BuildConversationTimeline(sources).map((item) =>
        item.Kind === 'message'
            ? { kind: 'message' as const, message: item.Detail.Adapted }
            : {
                kind: 'session' as const,
                Group: item.Group,
                Meta: FindRealtimeSessionMeta(load.SessionMeta, item.Group.SessionID),
                Turns: turnsBySession.get(NormalizeUUID(item.Group.SessionID)) ?? [],
            },
    );
}
