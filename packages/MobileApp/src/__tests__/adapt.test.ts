import { describe, it, expect } from 'vitest';
import {
    AdaptConversationToSummary,
    GroupConversations,
    AdaptAgentRef,
    AdaptMessage,
    AdaptConversation,
} from '@/data/adapt';
import type { ConversationListItem, ConversationMessage, ConversationDetailLoad } from '@/data/services/conversations';
import { Colors, ColorForAgent } from '@/theme/tokens';

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
        LatestSnippet: 'hello',
        LatestAt: new Date(),
        live: false,
        AgentIds: [],
        AgentNames: [],
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
    describe('AdaptAgentRef', () => {
        it('resolves color + initial from the agent name', () => {
            const ref = AdaptAgentRef('a1', 'Research Bot');
            expect(ref.id).toBe('a1');
            expect(ref.name).toBe('Research Bot');
            expect(ref.color).toBe(ColorForAgent('Research Bot'));
            expect(ref.initial).toBe('R');
        });

        it('falls back to safe defaults for null id/name', () => {
            const ref = AdaptAgentRef(null, null);
            expect(ref.id).toBe('unknown');
            expect(ref.name).toBe('Agent');
            expect(ref.initial).toBe('A');
        });
    });

    describe('AdaptConversationToSummary', () => {
        it('maps core fields and falls back for empty title/snippet', () => {
            const summary = AdaptConversationToSummary(
                listItem({ entity: { ID: 'c9', Name: null, IsPinned: true }, LatestSnippet: null, messageCount: 7, live: true }),
            );
            expect(summary.Id).toBe('c9');
            expect(summary.Title).toBe('(untitled)');
            expect(summary.Snippet).toBe('(no messages yet)');
            expect(summary.MessageCount).toBe(7);
            expect(summary.Live).toBe(true);
            expect(summary.Pinned).toBe(true);
        });

        it('synthesizes a single fallback agent when none participated', () => {
            const summary = AdaptConversationToSummary(listItem({ AgentIds: [], AgentNames: [] }));
            expect(summary.Agents).toHaveLength(1);
            expect(summary.Agents[0].name).toBe('Skip');
            expect(summary.Agents[0].color).toBe(Colors.agentFallback);
        });

        it('builds one participant per agent id with resolved colors/initials', () => {
            const summary = AdaptConversationToSummary(
                listItem({ AgentIds: ['a1', 'a2'], AgentNames: ['Research', 'Analyst'] }),
            );
            expect(summary.Agents).toHaveLength(2);
            expect(summary.Agents[0]).toMatchObject({ id: 'a1', name: 'Research', color: Colors.agentResearch, initial: 'R' });
            expect(summary.Agents[1]).toMatchObject({ id: 'a2', name: 'Analyst', color: Colors.agentAnalyst, initial: 'A' });
        });
    });

    describe('GroupConversations', () => {
        it('buckets by pinned / today / yesterday / earlier', () => {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const lastWeek = new Date(now);
            lastWeek.setDate(now.getDate() - 8);

            const grouped = GroupConversations([
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

    describe('AdaptMessage', () => {
        it('adapts a user message', () => {
            const m = AdaptMessage(message({ ID: 'm1', Role: 'User', Message: 'hi there' }));
            expect(m.kind).toBe('user');
            if (m.kind === 'user') {
                expect(m.id).toBe('m1');
                expect(m.text).toBe('hi there');
            }
        });

        it('adapts an agent message and parses suggested responses (strings only, max 4)', () => {
            const m = AdaptMessage(
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
                expect(m.Body).toBe('the answer');
                expect(m.Agent.name).toBe('Sage');
                expect(m.CompletionMs).toBe(1234);
                expect(m.SuggestedResponses).toEqual(['a', 'b', 'c', 'd']);
            }
        });

        it('tolerates malformed suggested-responses JSON', () => {
            const m = AdaptMessage(message({ ID: 'm3', Role: 'AI', Message: 'x', SuggestedResponses: '{not json' }));
            if (m.kind === 'agent') expect(m.SuggestedResponses).toEqual([]);
        });

        it('defaults status to Complete and falls back to Error text for empty message', () => {
            const m = AdaptMessage(message({ ID: 'm4', Role: 'Error', Message: null, Error: 'boom', Status: null }));
            if (m.kind === 'agent') {
                expect(m.Status).toBe('Complete');
                expect(m.Body).toBe('boom');
            }
        });
    });

    describe('AdaptConversation', () => {
        it('dedupes participants, counts messages, and flags live', () => {
            const load: ConversationDetailLoad = {
                Conversation: { ID: 'c1', Name: 'My Chat' } as unknown as ConversationDetailLoad['Conversation'],
                Messages: [
                    message({ ID: '1', Role: 'User', Message: 'q' }),
                    message({ ID: '2', Role: 'AI', Message: 'a', AgentID: 'a1', Status: 'Complete' }, 'Sage'),
                    message({ ID: '3', Role: 'AI', Message: '', AgentID: 'a1', Status: 'In-Progress' }, 'Sage'),
                ],
                Artifacts: [],
                SessionMeta: new Map(),
            };
            const adapted = AdaptConversation(load);
            expect(adapted.id).toBe('c1');
            expect(adapted.title).toBe('My Chat');
            expect(adapted.messageCount).toBe(3);
            expect(adapted.live).toBe(true);
            expect(adapted.participants).toHaveLength(1);
            expect(adapted.participants[0].id).toBe('a1');
        });
    });
});

/**
 * Titles and snippets are wire-format sources too.
 *
 * The thread's message bodies were fixed for this; the conversation's NAME was not — and the name
 * is derived from the first words of the first message. A conversation opened with `@Sage …` was
 * therefore titled `@{"type":"agent","id":"55…`, which showed in the thread header and in every row
 * of the conversation list.
 */
describe('mention tokens in titles and snippets', () => {
    const MENTION = '@{"type":"agent","id":"55E3BE9F-0000-0000-0000-000000000001","name":"Sage"}';

    it('renders a mention in the list row title as the display name', () => {
        const row = AdaptConversationToSummary(
            listItem({ entity: { ID: 'c1', Name: `${MENTION} what is on my plate` } }),
        );
        expect(row.Title).toBe('@Sage what is on my plate');
        expect(row.Title).not.toContain('{"type"');
    });

    it('renders a mention in the list snippet as the display name', () => {
        const row = AdaptConversationToSummary(
            listItem({ LatestSnippet: `${MENTION} how is the pipeline` }),
        );
        expect(row.Snippet).toBe('@Sage how is the pipeline');
    });

    it('renders a mention in the thread header title as the display name', () => {
        const adapted = AdaptConversation({
            Conversation: { ID: 'c1', Name: `${MENTION} pipeline` } as unknown as ConversationDetailLoad['Conversation'],
            Messages: [],
            Artifacts: [],
            SessionMeta: new Map(),
        });
        expect(adapted.title).toBe('@Sage pipeline');
    });

    it('still falls back when the name and snippet are absent', () => {
        const row = AdaptConversationToSummary(
            listItem({ entity: { ID: 'c1', Name: null }, LatestSnippet: null }),
        );
        expect(row.Title).toBe('(untitled)');
        expect(row.Snippet).toBe('(no messages yet)');
    });
});
