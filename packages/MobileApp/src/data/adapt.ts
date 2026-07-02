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
export function adaptConversationToSummary(item: ConversationListItem): ConversationSummary {
    const conv = item.entity;
    const agents: ConversationParticipantAgent[] = item.agentIds.length === 0
        ? [{ id: 'unknown', name: 'Skip', color: Colors.agentFallback, initial: 'A' }]
        : item.agentIds.map((id, idx) => {
            const name = item.agentNames[idx] ?? 'Agent';
            return {
                id,
                name,
                color: colorForAgent(name),
                initial: initialsOf(name),
            };
        });
    return {
        id: conv.ID,
        title: conv.Name ?? '(untitled)',
        snippet: item.latestSnippet ?? '(no messages yet)',
        timestamp: relativeTimeLabel(item.latestAt),
        agents,
        messageCount: item.messageCount,
        live: item.live,
        pinned: conv.IsPinned ?? false,
    };
}

/**
 * Group conversations into Pinned / Today / Yesterday / Earlier buckets,
 * matching the visual structure of the mockup.
 */
export type GroupedConversations = {
    pinned: ConversationSummary[];
    today: ConversationSummary[];
    yesterday: ConversationSummary[];
    earlier: ConversationSummary[];
};

/**
 * Adapt and bucket a list of conversations into Pinned / Today / Yesterday /
 * Earlier groups. Pinned wins over date bucketing; remaining items are placed by
 * the local calendar date of their latest activity.
 *
 * @param items The loaded conversation list items.
 * @returns The four grouped, UI-shaped summary buckets.
 */
export function groupConversations(items: ConversationListItem[]): GroupedConversations {
    const out: GroupedConversations = { pinned: [], today: [], yesterday: [], earlier: [] };
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    for (const item of items) {
        const summary = adaptConversationToSummary(item);
        if (summary.pinned) {
            out.pinned.push(summary);
            continue;
        }
        const when = item.latestAt.toDateString();
        if (when === todayStr) out.today.push(summary);
        else if (when === yesterdayStr) out.yesterday.push(summary);
        else out.earlier.push(summary);
    }
    return out;
}

/** UI reference to an agent (id + name + derived avatar color/initial). */
export type AdaptedAgentRef = {
    id: string;
    name: string;
    color: string;
    initial: string;
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
export function adaptAgentRef(id: string | null | undefined, name: string | null | undefined): AdaptedAgentRef {
    const safeName = name ?? 'Agent';
    return {
        id: id ?? 'unknown',
        name: safeName,
        color: colorForAgent(safeName),
        initial: initialsOf(safeName),
    };
}

/**
 * A conversation message in UI shape — a discriminated union on `kind`.
 * `user` messages carry just their text; `agent` messages additionally carry the
 * agent reference, run status, suggested follow-up responses, and completion time.
 */
export type AdaptedMessage =
    | { kind: 'user'; id: string; text: string; createdAt: Date }
    | {
        kind: 'agent';
        id: string;
        agent: AdaptedAgentRef;
        body: string;
        createdAt: Date;
        status: 'Complete' | 'In-Progress' | 'Error';
        suggestedResponses: string[];
        completionMs: number | null;
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
export function adaptMessage(msg: ConversationMessage): AdaptedMessage {
    const d = msg.detail;
    const createdAt = (d as unknown as { __mj_CreatedAt?: Date | string }).__mj_CreatedAt;
    const date = createdAt ? new Date(createdAt) : new Date();
    if (d.Role === 'User') {
        return {
            kind: 'user',
            id: d.ID,
            text: d.Message ?? '',
            createdAt: date,
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
        agent: adaptAgentRef(d.AgentID, msg.agentName),
        body: d.Message ?? (d.Error ?? ''),
        createdAt: date,
        status: d.Status ?? 'Complete',
        suggestedResponses,
        completionMs: d.CompletionTime ?? null,
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
export function adaptConversation(load: ConversationDetailLoad) {
    const participants = new Map<string, AdaptedAgentRef>();
    for (const msg of load.messages) {
        if (msg.detail.AgentID) {
            const ref = adaptAgentRef(msg.detail.AgentID, msg.agentName);
            if (!participants.has(ref.id)) participants.set(ref.id, ref);
        }
    }
    return {
        id: load.conversation.ID,
        title: load.conversation.Name ?? '(untitled)',
        participants: Array.from(participants.values()),
        messageCount: load.messages.length,
        live: load.messages.some((m) => m.detail.Status === 'In-Progress'),
        messages: load.messages.map(adaptMessage),
        artifacts: load.artifacts,
    };
}
