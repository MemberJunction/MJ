import { describe, it, expect } from 'vitest';
import {
    adaptConversationToSummary,
    groupConversations,
    adaptAgentRef,
    adaptMessage,
    adaptConversation,
} from '@/data/adapt';
import type { ConversationListItem, ConversationMessage, ConversationDetailLoad } from '@/data/services/conversations';
import { Colors, colorForAgent } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Lightweight builders — adapt.ts only reads a handful of fields off the MJ
// entities, so we construct plain objects and cast to the entity-shaped types.
// ---------------------------------------------------------------------------

type ListItemOverrides = Partial<Omit<ConversationListItem, 'entity'>> & { entity?: Record<string, unknown> };

function listItem(over: ListItemOverrides = {}): ConversationListItem {
    const { entity: entityOver, ...rest } = over;
    const entity = { ID: 'c1', Name: 'Chat', IsPinned: false, ...(entityOver ?? {}) };
    return {
        entity: entity as unknown as ConversationListItem['entity'],
        latestSnippet: 'hello',
        latestAt: new Date(),
        live: false,
        agentIds: [],
        agentNames: [],
        messageCount: 3,
        ...rest,
    };
}

type DetailShape = {
    ID: string;
    Role: 'User' | 'AI' | 'Error';
    Message?: string | null;
    Error?: string | null;
    Status?: 'Complete' | 'In-Progress' | 'Error' | null;
    AgentID?: string | null;
    SuggestedResponses?: string | null;
    CompletionTime?: number | null;
    __mj_CreatedAt?: Date | string;
};

function message(detail: DetailShape, agentName: string | null = null): ConversationMessage {
    return { detail: detail as unknown as ConversationMessage['detail'], agentName };
}

describe('adapt', () => {
    describe('adaptAgentRef', () => {
        it('resolves color + initial from the agent name', () => {
            const ref = adaptAgentRef('a1', 'Research Bot');
            expect(ref.id).toBe('a1');
            expect(ref.name).toBe('Research Bot');
            expect(ref.color).toBe(colorForAgent('Research Bot'));
            expect(ref.initial).toBe('R');
        });

        it('falls back to safe defaults for null id/name', () => {
            const ref = adaptAgentRef(null, null);
            expect(ref.id).toBe('unknown');
            expect(ref.name).toBe('Agent');
            expect(ref.initial).toBe('A');
        });
    });

    describe('adaptConversationToSummary', () => {
        it('maps core fields and falls back for empty title/snippet', () => {
            const summary = adaptConversationToSummary(
                listItem({ entity: { ID: 'c9', Name: null, IsPinned: true }, latestSnippet: null, messageCount: 7, live: true }),
            );
            expect(summary.id).toBe('c9');
            expect(summary.title).toBe('(untitled)');
            expect(summary.snippet).toBe('(no messages yet)');
            expect(summary.messageCount).toBe(7);
            expect(summary.live).toBe(true);
            expect(summary.pinned).toBe(true);
        });

        it('synthesizes a single fallback agent when none participated', () => {
            const summary = adaptConversationToSummary(listItem({ agentIds: [], agentNames: [] }));
            expect(summary.agents).toHaveLength(1);
            expect(summary.agents[0].name).toBe('Skip');
            expect(summary.agents[0].color).toBe(Colors.agentFallback);
        });

        it('builds one participant per agent id with resolved colors/initials', () => {
            const summary = adaptConversationToSummary(
                listItem({ agentIds: ['a1', 'a2'], agentNames: ['Research', 'Analyst'] }),
            );
            expect(summary.agents).toHaveLength(2);
            expect(summary.agents[0]).toMatchObject({ id: 'a1', name: 'Research', color: Colors.agentResearch, initial: 'R' });
            expect(summary.agents[1]).toMatchObject({ id: 'a2', name: 'Analyst', color: Colors.agentAnalyst, initial: 'A' });
        });
    });

    describe('groupConversations', () => {
        it('buckets by pinned / today / yesterday / earlier', () => {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const lastWeek = new Date(now);
            lastWeek.setDate(now.getDate() - 8);

            const grouped = groupConversations([
                listItem({ entity: { ID: 'p', Name: 'Pinned', IsPinned: true }, latestAt: lastWeek }),
                listItem({ entity: { ID: 't', Name: 'Today' }, latestAt: now }),
                listItem({ entity: { ID: 'y', Name: 'Yest' }, latestAt: yesterday }),
                listItem({ entity: { ID: 'e', Name: 'Earlier' }, latestAt: lastWeek }),
            ]);

            expect(grouped.pinned.map((s) => s.id)).toEqual(['p']);
            expect(grouped.today.map((s) => s.id)).toEqual(['t']);
            expect(grouped.yesterday.map((s) => s.id)).toEqual(['y']);
            expect(grouped.earlier.map((s) => s.id)).toEqual(['e']);
        });
    });

    describe('adaptMessage', () => {
        it('adapts a user message', () => {
            const m = adaptMessage(message({ ID: 'm1', Role: 'User', Message: 'hi there' }));
            expect(m.kind).toBe('user');
            if (m.kind === 'user') {
                expect(m.id).toBe('m1');
                expect(m.text).toBe('hi there');
            }
        });

        it('adapts an agent message and parses suggested responses (strings only, max 4)', () => {
            const m = adaptMessage(
                message(
                    {
                        ID: 'm2',
                        Role: 'AI',
                        Message: 'the answer',
                        AgentID: 'a1',
                        Status: 'Complete',
                        CompletionTime: 1234,
                        SuggestedResponses: JSON.stringify(['a', 'b', 42, 'c', 'd', 'e']),
                    },
                    'Sage',
                ),
            );
            expect(m.kind).toBe('agent');
            if (m.kind === 'agent') {
                expect(m.body).toBe('the answer');
                expect(m.agent.name).toBe('Sage');
                expect(m.completionMs).toBe(1234);
                expect(m.suggestedResponses).toEqual(['a', 'b', 'c', 'd']);
            }
        });

        it('tolerates malformed suggested-responses JSON', () => {
            const m = adaptMessage(message({ ID: 'm3', Role: 'AI', Message: 'x', SuggestedResponses: '{not json' }));
            if (m.kind === 'agent') expect(m.suggestedResponses).toEqual([]);
        });

        it('defaults status to Complete and falls back to Error text for empty message', () => {
            const m = adaptMessage(message({ ID: 'm4', Role: 'Error', Message: null, Error: 'boom', Status: null }));
            if (m.kind === 'agent') {
                expect(m.status).toBe('Complete');
                expect(m.body).toBe('boom');
            }
        });
    });

    describe('adaptConversation', () => {
        it('dedupes participants, counts messages, and flags live', () => {
            const load: ConversationDetailLoad = {
                conversation: { ID: 'c1', Name: 'My Chat' } as unknown as ConversationDetailLoad['conversation'],
                messages: [
                    message({ ID: '1', Role: 'User', Message: 'q' }),
                    message({ ID: '2', Role: 'AI', Message: 'a', AgentID: 'a1', Status: 'Complete' }, 'Sage'),
                    message({ ID: '3', Role: 'AI', Message: '', AgentID: 'a1', Status: 'In-Progress' }, 'Sage'),
                ],
                artifacts: [],
            };
            const adapted = adaptConversation(load);
            expect(adapted.id).toBe('c1');
            expect(adapted.title).toBe('My Chat');
            expect(adapted.messageCount).toBe(3);
            expect(adapted.live).toBe(true);
            expect(adapted.participants).toHaveLength(1);
            expect(adapted.participants[0].id).toBe('a1');
        });
    });
});
