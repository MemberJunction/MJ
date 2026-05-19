/**
 * Mock data for Phase 1 development.
 *
 * Mirrors the conversations in plans/mobile-app-react-native/html/conversation-list.html.
 * Replaced with real RunView calls against `MJ: Conversation` once auth lands.
 */

import { Colors } from '@/theme/tokens';

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
    /** True when an agent task is still running in this conversation. */
    live?: boolean;
    pinned?: boolean;
    unreadCount?: number;
};

const SKIP: ConversationParticipantAgent = { id: 'skip', name: 'Skip', color: Colors.agentSkip, initial: 'S' };
const RESEARCH: ConversationParticipantAgent = { id: 'research', name: 'Research', color: Colors.agentResearch, initial: 'R' };
const ANALYST: ConversationParticipantAgent = { id: 'analyst', name: 'Account Analyst', color: Colors.agentAnalyst, initial: 'A' };
const FORECASTER: ConversationParticipantAgent = { id: 'forecaster', name: 'Forecaster', color: Colors.agentForecaster, initial: 'F' };

export const MOCK_CONVERSATIONS_PINNED: ConversationSummary[] = [
    {
        id: 'c-daily-pipeline',
        title: 'Daily pipeline standup',
        snippet: "You're at 92% of monthly quota with 8 days left.",
        timestamp: '8:30 AM',
        agents: [SKIP],
        messageCount: 14,
        pinned: true,
    },
];

export const MOCK_CONVERSATIONS_TODAY: ConversationSummary[] = [
    {
        id: 'c-acme-pipeline-review',
        title: 'Acme Corp pipeline review',
        snippet: 'Two notable items. Acme announced a Series C extension on Monday…',
        timestamp: 'Now',
        agents: [SKIP, RESEARCH],
        messageCount: 9,
        live: true,
    },
    {
        id: 'c-q2-forecast',
        title: 'Q2 revenue forecast',
        snippet: 'Best case lands at $4.2M. Sensitivity is mostly on enterprise renewals…',
        timestamp: '9:12 AM',
        agents: [FORECASTER],
        messageCount: 6,
    },
    {
        id: 'c-renewal-risks',
        title: 'Renewal risks deep-dive',
        snippet: "Three accounts flagged. Northwind's usage dropped 40% last quarter…",
        timestamp: '7:48 AM',
        agents: [SKIP, FORECASTER, RESEARCH],
        messageCount: 21,
        unreadCount: 4,
    },
];

export const MOCK_CONVERSATIONS_YESTERDAY: ConversationSummary[] = [
    {
        id: 'c-lead-scoring',
        title: 'Lead scoring tweaks',
        snippet: 'Bumping enterprise weighting to 1.4 increased top-quartile recall to 78%…',
        timestamp: 'Yest',
        agents: [ANALYST],
        messageCount: 11,
    },
    {
        id: 'c-northwind-health',
        title: 'Northwind health check',
        snippet: 'Health score down to 62. Top risk: support tickets up 3x, MAU flat…',
        timestamp: 'Yest',
        agents: [SKIP, ANALYST],
        messageCount: 7,
    },
];
