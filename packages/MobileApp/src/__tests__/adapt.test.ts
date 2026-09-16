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
        Entity: entity as unknown as ConversationListItem['Entity'],
        LatestSnippet: 'hello',
        LatestAt: new Date(),
        Live: false,
        AgentIds: [],
        AgentNames: [],
        MessageCount: 3,
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
                listItem({ entity: { ID: 'c9', Name: null, IsPinned: true }, LatestSnippet: null, MessageCount: 7, Live: true }),
            );
            expect(summary.Id).toBe('c9');
            expect(summary.Title).toBe('(untitled)');
            expect(summary.Snippet).toBe('(no messages yet)');
            expect(summary.MessageCount).toBe(7);
            expect(summary.Live).toBe(true);
            expect(summary.Pinned).toBe(true);
        });

        it('synthesizes a single fallback agent when none participated', () => {
            const summary = adaptConversationToSummary(listItem({ AgentIds: [], AgentNames: [] }));
            expect(summary.Agents).toHaveLength(1);
            expect(summary.Agents[0].name).toBe('Skip');
            expect(summary.Agents[0].color).toBe(Colors.agentFallback);
        });

        it('builds one participant per agent id with resolved colors/initials', () => {
            const summary = adaptConversationToSummary(
                listItem({ AgentIds: ['a1', 'a2'], AgentNames: ['Research', 'Analyst'] }),
            );
            expect(summary.Agents).toHaveLength(2);
            expect(summary.Agents[0]).toMatchObject({ id: 'a1', name: 'Research', color: Colors.agentResearch, initial: 'R' });
            expect(summary.Agents[1]).toMatchObject({ id: 'a2', name: 'Analyst', color: Colors.agentAnalyst, initial: 'A' });
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
                listItem({ entity: { ID: 'p', Name: 'Pinned', IsPinned: true }, LatestAt: lastWeek }),
                listItem({ entity: { ID: 't', Name: 'Today' }, LatestAt: now }),
                listItem({ entity: { ID: 'y', Name: 'Yest' }, LatestAt: yesterday }),
                listItem({ entity: { ID: 'e', Name: 'Earlier' }, LatestAt: lastWeek }),
            ]);

            expect(grouped.Pinned.map((s) => s.Id)).toEqual(['p']);
            expect(grouped.Today.map((s) => s.Id)).toEqual(['t']);
            expect(grouped.Yesterday.map((s) => s.Id)).toEqual(['y']);
            expect(grouped.Earlier.map((s) => s.Id)).toEqual(['e']);
        });
    });

    describe('adaptMessage', () => {
        it('adapts a user message', () => {
            const m = adaptMessage(message({ ID: 'm1', Role: 'User', Message: 'hi there' }));
            expect(m.Kind).toBe('user');
            if (m.Kind === 'user') {
                expect(m.Id).toBe('m1');
                expect(m.Text).toBe('hi there');
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
            expect(m.Kind).toBe('agent');
            if (m.Kind === 'agent') {
                expect(m.Body).toBe('the answer');
                expect(m.Agent.name).toBe('Sage');
                expect(m.CompletionMs).toBe(1234);
                expect(m.SuggestedResponses).toEqual(['a', 'b', 'c', 'd']);
            }
        });

        it('tolerates malformed suggested-responses JSON', () => {
            const m = adaptMessage(message({ ID: 'm3', Role: 'AI', Message: 'x', SuggestedResponses: '{not json' }));
            if (m.Kind === 'agent') expect(m.SuggestedResponses).toEqual([]);
        });

        it('defaults status to Complete and falls back to Error text for empty message', () => {
            const m = adaptMessage(message({ ID: 'm4', Role: 'Error', Message: null, Error: 'boom', Status: null }));
            if (m.Kind === 'agent') {
                expect(m.Status).toBe('Complete');
                expect(m.Body).toBe('boom');
            }
        });
    });

    describe('adaptConversation', () => {
        it('dedupes participants, counts messages, and flags live', () => {
            const load: ConversationDetailLoad = {
                Conversation: { ID: 'c1', Name: 'My Chat' } as unknown as ConversationDetailLoad['Conversation'],
                Messages: [
                    message({ ID: '1', Role: 'User', Message: 'q' }),
                    message({ ID: '2', Role: 'AI', Message: 'a', AgentID: 'a1', Status: 'Complete' }, 'Sage'),
                    message({ ID: '3', Role: 'AI', Message: '', AgentID: 'a1', Status: 'In-Progress' }, 'Sage'),
                ],
                Artifacts: [],
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
