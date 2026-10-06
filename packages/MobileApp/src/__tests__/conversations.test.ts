import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// ---------------------------------------------------------------------------
// The real `@memberjunction/core` with `Metadata` and `RunView` replaced, so the real
// `ConversationEngine` (scope loading, path predicate, in-memory filter) runs against the
// rows each test routes. Every RunView call is recorded.
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
const C3 = '33333333-3333-3333-3333-333333333333';
const B1 = 'B1111111-1111-1111-1111-111111111111';
const B2 = 'B2222222-2222-2222-2222-222222222222';
const B3 = 'B3333333-3333-3333-3333-333333333333';
const A1 = 'A1111111-1111-1111-1111-111111111111';
const A2 = 'A2222222-2222-2222-2222-222222222222';
const A3 = 'A3333333-3333-3333-3333-333333333333';

const DETAILS = 'MJ: Conversation Details';
const BRANCHES = 'MJ: Conversation Branches';

type Branch = { ID: string; ConversationID: string; ParentBranchID: string | null; ForkFromSequence: number | null; Name: string | null };
function branch(id: string, conversationId: string, forkFromSequence: number): Branch {
    return { ID: id, ConversationID: conversationId, ParentBranchID: null, ForkFromSequence: forkFromSequence, Name: null };
}

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

function conversationRow(id: string, currentBranchId: string | null) {
    return { ID: id, Name: `conversation ${id.slice(0, 2)}`, CurrentBranchID: currentBranchId, __mj_UpdatedAt: new Date() };
}

/** Routes the list's queries: conversations, recent details, branch rows, agents. */
function routeList(opts: { conversations: unknown[]; details: unknown[]; branches?: Branch[] }) {
    return (params: RunViewParams): RunViewResult => {
        switch (params.EntityName) {
            case 'MJ: Conversations':
                return { Success: true, Results: opts.conversations };
            case DETAILS:
                return { Success: true, Results: opts.details };
            case BRANCHES:
                return { Success: true, Results: opts.branches ?? [] };
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

describe('LoadConversations — per-conversation scope', () => {
    it('counts only the rows on the current branch path, and the trunk for an unbranched conversation', async () => {
        state.route = routeList({
            conversations: [conversationRow(C1, B1), conversationRow(C2, null)],
            details: [
                // C1 forks at sequence 2: trunk rows 3 and 4 are on the other path. Row 4 is the newest.
                detail(C1, 1, null),
                detail(C1, 2, null),
                detail(C1, 3, null),
                detail(C1, 4, null, 30),
                detail(C1, 5, B1),
                detail(C1, 6, B1),
                // C2 sits on the trunk; its branch row is on the other path.
                detail(C2, 1, null),
                detail(C2, 2, null),
                detail(C2, 3, null),
                detail(C2, 4, B2),
            ],
            branches: [branch(B1, C1, 2), branch(B2, C2, 3)],
        });

        const list = await LoadConversations();
        const byId = new Map(list.map((item) => [item.entity.ID, item]));

        expect(byId.get(C1)?.messageCount).toBe(4);
        expect(byId.get(C1)?.LatestSnippet).toBe('message 6 (branch)');
        expect(byId.get(C2)?.messageCount).toBe(3);
        expect(byId.get(C2)?.LatestSnippet).toBe('message 3');
        expect(warn).not.toHaveBeenCalled();
    });

    it('selects the branch and sequence columns on the recent-rows query', async () => {
        state.route = routeList({ conversations: [conversationRow(C1, null)], details: [] });

        await LoadConversations();

        const recent = state.calls.find((c) => c.EntityName === DETAILS);
        expect(recent?.Fields).toEqual(expect.arrayContaining(['BranchID', 'Sequence', 'ConversationID']));
    });

    it('loads the branch rows of every branched conversation in one query', async () => {
        state.route = routeList({
            conversations: [conversationRow(C1, B1), conversationRow(C2, null), conversationRow(C3, B3)],
            details: [detail(C1, 1, null), detail(C3, 1, null)],
            branches: [branch(B1, C1, 1), branch(B3, C3, 1)],
        });

        await LoadConversations();

        const branchQueries = state.calls.filter((c) => c.EntityName === BRANCHES);
        expect(branchQueries).toHaveLength(1);
        expect(branchQueries[0].ExtraFilter).toContain(`'${C1}'`);
        expect(branchQueries[0].ExtraFilter).toContain(`'${C3}'`);
        expect(branchQueries[0].ExtraFilter).not.toContain(C2);
        expect(branchQueries[0].ExtraFilter).toMatch(/^ConversationID IN \(/);
    });

    it('issues no branch query when no listed conversation is on a branch', async () => {
        state.route = routeList({
            conversations: [conversationRow(C1, null), conversationRow(C2, null)],
            details: [detail(C1, 1, null), detail(C2, 1, null)],
        });

        await LoadConversations();

        expect(state.calls.some((c) => c.EntityName === BRANCHES)).toBe(false);
    });

    it('counts the trunk and logs once when current branches are not among the loaded branch rows', async () => {
        state.route = routeList({
            conversations: [conversationRow(C1, B1), conversationRow(C3, B3)],
            details: [
                detail(C1, 1, null),
                detail(C1, 2, null),
                detail(C1, 3, null),
                detail(C1, 4, B1),
                detail(C3, 1, null),
                detail(C3, 2, B3),
            ],
            branches: [],
        });

        const list = await LoadConversations();
        const byId = new Map(list.map((item) => [item.entity.ID, item]));

        expect(byId.get(C1)?.messageCount).toBe(3);
        expect(byId.get(C3)?.messageCount).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain(C1);
        expect(String(warn.mock.calls[0][0])).toContain(C3);
    });
});

describe('LoadConversation — scoped reads', () => {
    /** Routes LoadConversation's queries; the details rows carry artifact links. */
    function routeConversation(opts: {
        currentBranchId: string | null;
        branches?: Branch[];
        artifacts?: unknown[];
        scopedLinks?: unknown[];
        allLinks?: unknown[];
    }) {
        return (params: RunViewParams): RunViewResult => {
            switch (params.EntityName) {
                case 'MJ: Conversations':
                    return { Success: true, Results: [{ ID: C1, CurrentBranchID: opts.currentBranchId }] };
                case BRANCHES:
                    return { Success: true, Results: opts.branches ?? [] };
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

    it('reads the messages with the scope filter of the current branch, in Sequence order', async () => {
        state.route = routeConversation({ currentBranchId: B1, branches: [branch(B1, C1, 2)] });

        await LoadConversation(C1);

        const messages = state.calls.find((c) => c.EntityName === DETAILS && c.ResultType === 'entity_object');
        expect(messages?.ExtraFilter).toBe(
            `[ConversationID]='${C1}' AND ([BranchID]='${B1}' OR ([BranchID] IS NULL AND [Sequence] <= 2))`,
        );
        expect(messages?.OrderBy).toBe('Sequence ASC');
    });

    it('reads the trunk with the unchanged trunk predicate and no branch query', async () => {
        state.route = routeConversation({ currentBranchId: null });

        await LoadConversation(C1);

        const messages = state.calls.find((c) => c.EntityName === DETAILS && c.ResultType === 'entity_object');
        expect(messages?.ExtraFilter).toBe(`[ConversationID]='${C1}' AND [BranchID] IS NULL`);
        expect(state.calls.some((c) => c.EntityName === BRANCHES)).toBe(false);
    });

    it('keeps the artifacts a message in scope links to, and those no message links to', async () => {
        state.route = routeConversation({
            currentBranchId: B1,
            branches: [branch(B1, C1, 2)],
            artifacts: [
                { ID: A1, Name: 'in scope' },
                { ID: A2, Name: 'other path' },
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
        expect(scopedLinkQuery?.ExtraFilter).toContain(
            `[ConversationID]='${C1}' AND ([BranchID]='${B1}' OR ([BranchID] IS NULL AND [Sequence] <= 2))`,
        );
    });

    it('shows no artifacts when the artifact links cannot be read', async () => {
        const base = routeConversation({ currentBranchId: null, artifacts: [{ ID: A1, Name: 'x' }] });
        state.route = (params) =>
            params.EntityName === DETAILS && params.ResultType === 'simple'
                ? { Success: false, Results: [], ErrorMessage: 'boom' }
                : base(params);

        const load = await LoadConversation(C1);

        expect(load?.Artifacts).toEqual([]);
        expect(warn).toHaveBeenCalled();
    });

    it('fails when the current branch is not a branch of the conversation', async () => {
        state.route = routeConversation({ currentBranchId: B1, branches: [] });

        await expect(LoadConversation(C1)).rejects.toThrow(/not a branch/);
    });
});
