/**
 * UI-shaped data types used by mockup-derived screens. Real-data adapters
 * (src/data/adapt.ts) convert MJ entities into these shapes.
 */

export type ConversationParticipantAgent = {
    id: string;
    name: string;
    color: string;
    /** First letter to render in the avatar disc. */
    initial: string;
};

export type ConversationSummary = {
    id: string;
    title: string;
    snippet: string;
    timestamp: string;
    agents: ConversationParticipantAgent[];
    messageCount: number;
    live?: boolean;
    pinned?: boolean;
    unreadCount?: number;
};

export type RecentConvoChip = {
    id: string;
    title: string;
    participants: ConversationParticipantAgent[];
    live?: boolean;
};

/** Inline artifact card props (data-table case shown in mockups). */
export type InlineArtifactPreviewRow = { name: string; sub: string; amount: string };

export type InlineArtifactCardData = {
    id: string;
    type: 'data-table' | 'chart' | 'document' | 'code';
    typeLabel: string;
    title: string;
    meta: string;
    rows?: InlineArtifactPreviewRow[];
    producedBy: ConversationParticipantAgent;
};
