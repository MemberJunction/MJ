/**
 * The runtime transport reads the agent's reply from Main: the newest AI detail by `Sequence`
 * within the Main predicate. The widget's conversations have no forks.
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

import { ConversationEngine } from '@memberjunction/core-entities';
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

async function startTransport(): Promise<RuntimeWidgetTransport> {
    const transport = new RuntimeWidgetTransport('https://api.example.com');
    await transport.Initialize(SESSION);
    return transport;
}

describe('RuntimeWidgetTransport — latest agent reply', () => {
    beforeEach(() => {
        hoisted.views.length = 0;
        hoisted.replyRows = [{ Message: 'Hello from the agent' }];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the newest AI reply in Main', async () => {
        const transport = await startTransport();

        const result = await transport.SendMessage('hi');

        expect(result).toEqual({ reply: 'Hello from the agent', success: true });
        expect(hoisted.views).toHaveLength(1);
        const view = hoisted.views[0];
        expect(view.EntityName).toBe('MJ: Conversation Details');
        expect(view.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL AND [Role]='AI'");
        expect(view.OrderBy).toBe('Sequence DESC');
        expect(view.MaxRows).toBe(1);
    });
});
