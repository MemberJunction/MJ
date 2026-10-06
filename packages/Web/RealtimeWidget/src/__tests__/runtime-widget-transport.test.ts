/**
 * The runtime transport reads the agent's reply from the conversation's current branch path:
 * the newest AI detail by `Sequence` within `ConversationEngine.ScopeFilter`. When the scope cannot
 * be read, the reply is empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ViewCall {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    MaxRows?: number;
}

const hoisted = vi.hoisted(() => {
    const user = { ID: 'guest-user' };
    /** A new entity row: plain property assignment, Save succeeds, and the ID depends on the entity. */
    const newRow = (entityName: string) => ({
        ID: entityName === 'MJ: Conversations' ? 'conv-1' : 'detail-1',
        LatestResult: null,
        NewRecord: () => undefined,
        Save: async () => true,
    });
    return {
        views: [] as ViewCall[],
        replyRows: [] as Array<{ Message: string | null }>,
        logError: vi.fn(),
        user,
        provider: {
            CurrentUser: user,
            GetEntityObject: async (entityName: string) => newRow(entityName),
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: hoisted.logError,
        RunView: class {
            async RunView(params: ViewCall) {
                hoisted.views.push(params);
                return { Success: true, Results: hoisted.replyRows };
            }
        },
    };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    setupGraphQLClient: async () => hoisted.provider,
    GraphQLProviderConfigData: class {},
}));

vi.mock('@memberjunction/conversations-runtime', () => ({
    ConversationsRuntime: {
        Instance: {
            Config: async () => undefined,
            AgentRunner: { processMessage: async () => ({ success: true }) },
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    agentFailureMessage: (_result: unknown, fallback: string) => fallback,
}));

import { ConversationEngine, type ConversationScope } from '@memberjunction/core-entities';
import { RuntimeWidgetTransport } from '../transport/runtime-widget-transport.js';
import type { WidgetSession } from '../types.js';

const SESSION: WidgetSession = {
    token: 'token',
    expiresAtMs: Date.now() + 60_000,
    widgetId: 'widget-1',
    applicationId: 'app-1',
    pinnedAgentId: 'agent-1',
    modality: 'Text',
    sessionId: 'session-1',
    rememberReturningVisitors: false,
    enabledChannels: [],
};

const BRANCH_SCOPE: ConversationScope = {
    ConversationID: 'conv-1',
    BranchID: 'branch-2',
    Branches: [{ ID: 'branch-2', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 4, Name: 'Alt' }],
};

async function startTransport(): Promise<RuntimeWidgetTransport> {
    const transport = new RuntimeWidgetTransport('https://api.example.com');
    await transport.Initialize(SESSION);
    return transport;
}

describe('RuntimeWidgetTransport — latest agent reply', () => {
    beforeEach(() => {
        hoisted.views.length = 0;
        hoisted.replyRows = [{ Message: 'Hello from the agent' }];
        hoisted.logError.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the newest AI reply on the current branch path', async () => {
        const load = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);
        const transport = await startTransport();

        const result = await transport.SendMessage('hi');

        expect(result).toEqual({ reply: 'Hello from the agent', success: true });
        expect(load).toHaveBeenCalledTimes(1);
        expect(load.mock.calls[0][0]).toBe('conv-1');
        expect(load.mock.calls[0][1]).toBe(hoisted.user);
        expect(load.mock.calls[0][2]).toBe(hoisted.provider);
        const view = hoisted.views[0];
        expect(view.EntityName).toBe('MJ: Conversation Details');
        expect(view.ExtraFilter).toBe(`${ConversationEngine.ScopeFilter(BRANCH_SCOPE)} AND [Role]='AI'`);
        expect(view.ExtraFilter).toContain("[BranchID]='branch-2'");
        expect(view.OrderBy).toBe('Sequence DESC');
        expect(view.MaxRows).toBe(1);
    });

    it('reads the trunk with the trunk predicate when the conversation has no current branch', async () => {
        const trunk = ConversationEngine.TrunkScope('conv-1');
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(trunk);
        const transport = await startTransport();

        await transport.SendMessage('hi');

        const view = hoisted.views[0];
        expect(view.ExtraFilter).toBe(`${ConversationEngine.ScopeFilter(trunk)} AND [Role]='AI'`);
        expect(view.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL AND [Role]='AI'");
        expect(view.OrderBy).toBe('Sequence DESC');
    });

    it('returns an empty reply and logs when the scope cannot be read', async () => {
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockRejectedValue(new Error('Conversation conv-1 not found'));
        const transport = await startTransport();

        const result = await transport.SendMessage('hi');

        expect(result).toEqual({ reply: '', success: true });
        expect(hoisted.views).toEqual([]);
        const errors = hoisted.logError.mock.calls.map((c) => String(c[0]));
        expect(errors.some((m) => m.includes('conv-1') && m.includes('Conversation conv-1 not found'))).toBe(true);
    });
});
