/**
 * Adapters that convert real MJ entity shapes into the UI-shaped types the
 * mockup-derived screens render. Centralized so swapping data sources stays
 * a one-call concern.
 */

import type { ConversationListItem, ConversationDetailLoad, ConversationMessage } from '@/data/services/conversations';
import type {
    ConversationParticipantAgent,
    ConversationSummary,
} from '@/data/mock-conversations';
import { Colors, colorForAgent } from '@/theme/tokens';

function initialsOf(name: string | null): string {
    if (!name) return 'A';
    const trimmed = name.trim();
    return trimmed.charAt(0).toUpperCase() || 'A';
}

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

export type AdaptedAgentRef = {
    id: string;
    name: string;
    color: string;
    initial: string;
};

export function adaptAgentRef(id: string | null | undefined, name: string | null | undefined): AdaptedAgentRef {
    const safeName = name ?? 'Agent';
    return {
        id: id ?? 'unknown',
        name: safeName,
        color: colorForAgent(safeName),
        initial: initialsOf(safeName),
    };
}

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
