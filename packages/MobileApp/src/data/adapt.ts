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
import { Colors, colorForAgent } from '@/theme/tokens';

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
    const conv = item.Entity;
    const agents: ConversationParticipantAgent[] = item.AgentIds.length === 0
        ? [{ id: 'unknown', name: 'Skip', color: Colors.agentFallback, initial: 'A' }]
        : item.AgentIds.map((id, idx) => {
            const name = item.AgentNames[idx] ?? 'Agent';
            return {
                id,
                name,
                color: colorForAgent(name),
                initial: initialsOf(name),
            };
        });
    return {
        Id: conv.ID,
        Title: conv.Name ?? '(untitled)',
        Snippet: item.LatestSnippet ?? '(no messages yet)',
        Timestamp: relativeTimeLabel(item.LatestAt),
        Agents: agents,
        MessageCount: item.MessageCount,
        Live: item.Live,
        Pinned: conv.IsPinned ?? false,
    };
}

/** @deprecated Use {@link AdaptConversationToSummary}. */
export function adaptConversationToSummary(item: ConversationListItem): ConversationSummary {
    return AdaptConversationToSummary(item);
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

/** @deprecated Use {@link GroupConversations}. */
export function groupConversations(items: ConversationListItem[]): GroupedConversations {
    return GroupConversations(items);
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
        color: colorForAgent(safeName),
        initial: initialsOf(safeName),
    };
}

/** @deprecated Use {@link AdaptAgentRef}. */
export function adaptAgentRef(id: string | null | undefined, name: string | null | undefined): AdaptedAgentRef {
    return AdaptAgentRef(id, name);
}

/**
 * A conversation message in UI shape — a discriminated union on `kind`.
 * `user` messages carry just their text; `agent` messages additionally carry the
 * agent reference, run status, suggested follow-up responses, and completion time.
 */
export type AdaptedMessage =
    | { Kind: 'user'; Id: string; Text: string; CreatedAt: Date }
    | {
        Kind: 'agent';
        Id: string;
        Agent: AdaptedAgentRef;
        Body: string;
        CreatedAt: Date;
        Status: 'Complete' | 'In-Progress' | 'Error';
        SuggestedResponses: string[];
        CompletionMs: number | null;
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
            Kind: 'user',
            Id: d.ID,
            Text: d.Message ?? '',
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
        Kind: 'agent',
        Id: d.ID,
        Agent: AdaptAgentRef(d.AgentID, msg.agentName),
        Body: d.Message ?? (d.Error ?? ''),
        CreatedAt: date,
        Status: d.Status ?? 'Complete',
        SuggestedResponses: suggestedResponses,
        CompletionMs: d.CompletionTime ?? null,
    };
}

/** @deprecated Use {@link AdaptMessage}. */
export function adaptMessage(msg: ConversationMessage): AdaptedMessage {
    return AdaptMessage(msg);
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
        title: load.Conversation.Name ?? '(untitled)',
        participants: Array.from(participants.values()),
        messageCount: load.Messages.length,
        live: load.Messages.some((m) => m.detail.Status === 'In-Progress'),
        messages: load.Messages.map(AdaptMessage),
        artifacts: load.Artifacts,
    };
}

/** @deprecated Use {@link AdaptConversation}. */
export function adaptConversation(load: ConversationDetailLoad) {
    return AdaptConversation(load);
}
