/**
 * UI-shaped data types used by mockup-derived screens. Real-data adapters
 * (src/data/adapt.ts) convert MJ entities into these shapes.
 */

/**
 * A single agent participating in a conversation, reduced to just what an
 * avatar chip needs to render (id, name, a stable color, and an initial).
 */
export type ConversationParticipantAgent = {
    id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    color: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** First letter to render in the avatar disc. */
    initial: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
};

/**
 * A conversation row as rendered in the conversation list — title, a snippet of
 * the latest message, a relative timestamp label, participating agents, and
 * list-affordance flags (live/pinned/unread). Produced by the adapters in
 * {@link ../adapt} from MJ `MJ: Conversations` + `MJ: Conversation Details` data.
 */
export type ConversationSummary = {
    Id: string;
    Title: string;
    Snippet: string;
    /** Human-friendly relative time label (e.g. "Now", "5m", "Yest"). */
    Timestamp: string;
    Agents: ConversationParticipantAgent[];
    MessageCount: number;
    /** True while an agent task in the conversation is still running. */
    Live?: boolean;
    /** True when the conversation is pinned to the top of the list. */
    Pinned?: boolean;
    UnreadCount?: number;
};

/**
 * A compact "recent conversation" chip (title + participant avatars) shown in
 * horizontally-scrolling quick-access rows.
 */
export type RecentConvoChip = {
    Id: string;
    Title: string;
    Participants: ConversationParticipantAgent[];
    Live?: boolean;
};
