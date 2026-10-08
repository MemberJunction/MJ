import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// ---------------------------------------------------------------------------
// The real `@memberjunction/core` with `Metadata` and `RunView` replaced, so the real
// `ConversationEngine` (Main predicate, in-memory filter) runs against the rows each test
// routes. Every RunView call is recorded.
// ---------------------------------------------------------------------------
type RunViewParams = {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    Fields?: string[];
    ResultType?: string;
    MaxRows?: number;
};
type RunViewResult = { Success: boolean; Results: unknown[]; ErrorMessage?: string };

const state = vi.hoisted(() => ({
    calls: [] as RunViewParams[],
    route: (_params: RunViewParams): RunViewResult => ({ Success: true, Results: [] }),
    conversation: undefined as unknown,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const respond = (params: RunViewParams): RunViewResult => {
        state.calls.push(params);
        return state.route(params);
    };
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        async GetEntityObject(): Promise<unknown> {
            return state.conversation;
        }
    }
    class RunView {
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            return respond(params);
        }
        async RunViews(params: RunViewParams[]): Promise<RunViewResult[]> {
            return params.map(respond);
        }
    }
    return { ...actual, Metadata, RunView };
});

// The realtime-session helpers are not under test; the real runtime would load the whole entity layer.
vi.mock('@memberjunction/conversations-runtime', () => ({
    CollectRealtimeSessionIDs: () => [],
    MapRealtimeSessionMeta: () => new Map(),
    REALTIME_SESSION_META_FIELDS: [],
}));

import { LoadConversation, LoadConversations } from '@/data/services/conversations';

const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
const B1 = 'B1111111-1111-1111-1111-111111111111';
const B2 = 'B2222222-2222-2222-2222-222222222222';
const A1 = 'A1111111-1111-1111-1111-111111111111';
const A2 = 'A2222222-2222-2222-2222-222222222222';
const A3 = 'A3333333-3333-3333-3333-333333333333';

const DETAILS = 'MJ: Conversation Details';
const BRANCHES = 'MJ: Conversation Branches';

/** A recent detail row as the list query returns it; later sequences are created later unless `createdMinute` says otherwise. */
function detail(conversationId: string, sequence: number, branchId: string | null, createdMinute = sequence) {
    return {
        ID: `${conversationId}-${sequence}`,
        ConversationID: conversationId,
        Message: `message ${sequence}${branchId ? ' (branch)' : ''}`,
        Role: 'User',
        Status: 'Complete',
        AgentID: null,
        __mj_CreatedAt: new Date(Date.UTC(2026, 9, 5, 10, createdMinute)).toISOString(),
        BranchID: branchId,
        Sequence: sequence,
    };
}

function conversationRow(id: string) {
    return { ID: id, Name: `conversation ${id.slice(0, 2)}`, __mj_UpdatedAt: new Date() };
}

/** Routes the list's queries: conversations, recent details, agents. */
function routeList(opts: { conversations: unknown[]; details: unknown[] }) {
    return (params: RunViewParams): RunViewResult => {
        switch (params.EntityName) {
            case 'MJ: Conversations':
                return { Success: true, Results: opts.conversations };
            case DETAILS:
                return { Success: true, Results: opts.details };
            default:
                return { Success: true, Results: [] };
        }
    };
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
    state.calls = [];
    state.route = () => ({ Success: true, Results: [] });
    state.conversation = undefined;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    warn.mockRestore();
});

describe('LoadConversations — Main rows', () => {
    it('counts only the Main rows of every conversation and shows the newest Main row', async () => {
        state.route = routeList({
            conversations: [conversationRow(C1), conversationRow(C2)],
            details: [
                detail(C1, 1, null),
                detail(C1, 2, null),
                detail(C1, 3, B1, 40),   // newest row, but in a fork
                detail(C2, 1, null),
                detail(C2, 2, B2),
            ],
        });

        const list = await LoadConversations();
        const byId = new Map(list.map((item) => [item.entity.ID, item]));

        expect(byId.get(C1)?.messageCount).toBe(2);
        expect(byId.get(C1)?.LatestSnippet).toBe('message 2');
        expect(byId.get(C2)?.messageCount).toBe(1);
    });

    it('selects the branch and sequence columns on the recent-rows query', async () => {
        state.route = routeList({ conversations: [conversationRow(C1)], details: [] });

        await LoadConversations();

        const recent = state.calls.find((c) => c.EntityName === DETAILS);
        expect(recent?.Fields).toEqual(expect.arrayContaining(['BranchID', 'Sequence', 'ConversationID']));
    });

    it('reads no fork rows', async () => {
        state.route = routeList({ conversations: [conversationRow(C1), conversationRow(C2)], details: [detail(C1, 1, null)] });

        await LoadConversations();

        expect(state.calls.some((c) => c.EntityName === BRANCHES)).toBe(false);
    });
});

describe('LoadConversation — scoped reads', () => {
    /** Routes LoadConversation's queries; the details rows carry artifact links. */
    function routeConversation(opts: {
        artifacts?: unknown[];
        scopedLinks?: unknown[];
        allLinks?: unknown[];
    }) {
        return (params: RunViewParams): RunViewResult => {
            switch (params.EntityName) {
                case 'MJ: Conversation Artifacts':
                    return { Success: true, Results: opts.artifacts ?? [] };
                case DETAILS:
                    if (params.ResultType === 'entity_object') return { Success: true, Results: [] };
                    return {
                        Success: true,
                        Results: (params.ExtraFilter ?? '').includes('[BranchID]') ? (opts.scopedLinks ?? []) : (opts.allLinks ?? []),
                    };
                default:
                    return { Success: true, Results: [] };
            }
        };
    }

    beforeEach(() => {
        state.conversation = { ID: C1, Name: 'one', Load: async () => true };
    });

    it('reads the messages with the Main predicate, in Sequence order', async () => {
        state.route = routeConversation({});

        await LoadConversation(C1);

        const messages = state.calls.find((c) => c.EntityName === DETAILS && c.ResultType === 'entity_object');
        expect(messages?.ExtraFilter).toBe(`[ConversationID]='${C1}' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL`);
        expect(messages?.OrderBy).toBe('Sequence ASC');
        expect(state.calls.some((c) => c.EntityName === BRANCHES)).toBe(false);
    });

    it('keeps the artifacts a Main message links to, and those no message links to', async () => {
        state.route = routeConversation({
            artifacts: [
                { ID: A1, Name: 'in Main' },
                { ID: A2, Name: 'in a fork' },
                { ID: A3, Name: 'no message' },
            ],
            scopedLinks: [{ ArtifactID: A1, ArtifactVersionID: null, AgentID: null }],
            allLinks: [
                { ArtifactID: A1, ArtifactVersionID: null },
                { ArtifactID: A2, ArtifactVersionID: null },
            ],
        });

        const load = await LoadConversation(C1);

        expect(load?.Artifacts.map((a) => a.ID)).toEqual([A1, A3]);
        const scopedLinkQuery = state.calls.find(
            (c) => c.EntityName === DETAILS && c.ResultType === 'simple' && (c.ExtraFilter ?? '').includes('[BranchID]'),
        );
        expect(scopedLinkQuery?.ExtraFilter).toContain(`[ConversationID]='${C1}' AND [BranchID] IS NULL`);
    });

    it('shows no artifacts when the artifact links cannot be read', async () => {
        const base = routeConversation({ artifacts: [{ ID: A1, Name: 'x' }] });
        state.route = (params) =>
            params.EntityName === DETAILS && params.ResultType === 'simple'
                ? { Success: false, Results: [], ErrorMessage: 'boom' }
                : base(params);

        const load = await LoadConversation(C1);

        expect(load?.Artifacts).toEqual([]);
        expect(warn).toHaveBeenCalled();
    });
});
