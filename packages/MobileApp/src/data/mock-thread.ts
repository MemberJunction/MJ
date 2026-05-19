/**
 * Mock data for the chat thread screen — mirrors the content shown in
 * plans/mobile-app-react-native/html/chat-thread.html.
 *
 * Real implementation will hydrate from `MJ: Conversation Detail` rows via
 * RunView and stream incoming messages via the existing
 * ConversationStreamingService pattern.
 */

import { Colors } from '@/theme/tokens';

export type AgentRef = {
    id: string;
    name: string;
    color: string;
    initial: string;
};

export const AGENT_SKIP: AgentRef = { id: 'skip', name: 'Skip', color: Colors.agentSkip, initial: 'S' };
export const AGENT_RESEARCH: AgentRef = { id: 'research', name: 'Research', color: Colors.agentResearch, initial: 'R' };

export type ThreadStep = { label: string };

export type ArtifactPreviewRow = { name: string; sub: string; amount: string };

export type InlineArtifact = {
    id: string;
    type: 'data-table' | 'chart' | 'document' | 'code';
    typeLabel: string;
    title: string;
    meta: string;
    rows?: ArtifactPreviewRow[];
    producedBy: AgentRef;
};

export type ThreadMessage =
    | {
        kind: 'user';
        id: string;
        text: string;
    }
    | {
        kind: 'agent';
        id: string;
        agent: AgentRef;
        durationMs?: number;
        steps?: ThreadStep[];
        body: string;
        artifact?: InlineArtifact;
        actions?: string[];
    };

export type Conversation = {
    id: string;
    title: string;
    participants: AgentRef[];
    messageCount: number;
    live: boolean;
    messages: ThreadMessage[];
    artifacts: InlineArtifact[];
};

const ARTIFACT_OPEN_OPPS: InlineArtifact = {
    id: 'a-open-opps',
    type: 'data-table',
    typeLabel: 'Data table',
    title: 'Open opportunities · Acme Corp',
    meta: '3 records · sorted by amount',
    producedBy: AGENT_SKIP,
    rows: [
        { name: 'Q2 platform expansion', sub: 'Negotiation · close 6/15', amount: '$145K' },
        { name: 'Renewal — Enterprise', sub: 'Proposal · close 6/30', amount: '$84K' },
        { name: 'SSO & SCIM', sub: 'Discovery · close 7/12', amount: '$56K' },
    ],
};

const ARTIFACT_NEWS_DIGEST: InlineArtifact = {
    id: 'a-news-digest',
    type: 'document',
    typeLabel: 'Research digest',
    title: 'Acme news this week',
    meta: '4 sources cited',
    producedBy: AGENT_RESEARCH,
};

const ARTIFACT_PIPELINE_TREND: InlineArtifact = {
    id: 'a-pipeline-trend',
    type: 'chart',
    typeLabel: 'Chart',
    title: 'Pipeline trend · Acme',
    meta: '12-month line',
    producedBy: AGENT_SKIP,
};

export const MOCK_CONVERSATIONS: Record<string, Conversation> = {
    'c-acme-pipeline-review': {
        id: 'c-acme-pipeline-review',
        title: 'Acme Corp pipeline review',
        participants: [AGENT_SKIP, AGENT_RESEARCH],
        messageCount: 9,
        live: true,
        artifacts: [ARTIFACT_OPEN_OPPS, ARTIFACT_NEWS_DIGEST, ARTIFACT_PIPELINE_TREND],
        messages: [
            { kind: 'user', id: 'm1', text: "Pull up Acme Corp's recent opportunities — anything over $50K still open?" },
            {
                kind: 'agent',
                id: 'm2',
                agent: AGENT_SKIP,
                durationMs: 2400,
                steps: [
                    { label: 'Queried Opportunities · 12 rows' },
                    { label: 'Filtered open · >$50K · 3 rows' },
                ],
                body: 'Acme Corp has **three open opportunities** above $50K. Total pipeline **$285K**, weighted to about **$148K**.',
                artifact: ARTIFACT_OPEN_OPPS,
                actions: ['Who owns these?', 'By stage', 'Email summary'],
            },
            { kind: 'user', id: 'm3', text: 'Nice. @research any news on Acme this week?' },
            {
                kind: 'agent',
                id: 'm4',
                agent: AGENT_RESEARCH,
                durationMs: 3100,
                steps: [
                    { label: 'Searched 12 sources · last 7 days' },
                ],
                body: 'Two notable items. Acme announced a Series C extension on Monday, and their VP of Eng posted about an upcoming platform consolidation rolling in Q3.',
            },
        ],
    },
};

export function getConversation(id: string | undefined): Conversation | null {
    if (!id) return null;
    return MOCK_CONVERSATIONS[id] ?? null;
}

/**
 * Recent conversations for the strip under the chat header.
 * Mock data; the real implementation will load the 4–5 most recent conversations.
 */
export type RecentConvoChip = {
    id: string;
    title: string;
    participants: AgentRef[];
    live?: boolean;
};

export const RECENT_CONVOS: RecentConvoChip[] = [
    { id: 'c-acme-pipeline-review', title: 'Acme pipeline review', participants: [AGENT_SKIP, AGENT_RESEARCH], live: true },
    { id: 'c-q2-forecast', title: 'Q2 forecast', participants: [AGENT_SKIP] },
    { id: 'c-renewal-risks', title: 'Renewal risks deep-dive', participants: [AGENT_SKIP, AGENT_RESEARCH] },
];
