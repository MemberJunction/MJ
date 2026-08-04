/**
 * UI-shaped data types used by mockup-derived screens. Real-data adapters
 * (src/data/adapt.ts) convert MJ entities into these shapes.
 */

/**
 * A single agent participating in a conversation, reduced to just what an
 * avatar chip needs to render (id, name, a stable color, and an initial).
 */
export type ConversationParticipantAgent = {
    id: string;
    name: string;
    color: string;
    /** First letter to render in the avatar disc. */
    initial: string;
};

/**
 * A conversation row as rendered in the conversation list — title, a snippet of
 * the latest message, a relative timestamp label, participating agents, and
 * list-affordance flags (live/pinned/unread). Produced by the adapters in
 * {@link ../adapt} from MJ `MJ: Conversations` + `MJ: Conversation Details` data.
 */
export type ConversationSummary = {
    id: string;
    title: string;
    snippet: string;
    /** Human-friendly relative time label (e.g. "Now", "5m", "Yest"). */
    timestamp: string;
    agents: ConversationParticipantAgent[];
    messageCount: number;
    /** True while an agent task in the conversation is still running. */
    live?: boolean;
    /** True when the conversation is pinned to the top of the list. */
    pinned?: boolean;
    unreadCount?: number;
};

/**
 * A compact "recent conversation" chip (title + participant avatars) shown in
 * horizontally-scrolling quick-access rows.
 */
export type RecentConvoChip = {
    id: string;
    title: string;
    participants: ConversationParticipantAgent[];
    live?: boolean;
};
