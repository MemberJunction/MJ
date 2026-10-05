/**
 * @fileoverview Continuing from a user-stopped run on `RunAIAgentFromConversationDetail`.
 *
 * The chat client never sends `lastRunId`, so the turn after a Stop used to start a fresh,
 * unchained run. The mutation now looks for a user-stopped newest root run for the agent in the
 * conversation and, when it finds one, chains the new run to it by LastRunID and rolls its
 * FinalPayload in when the caller supplied no payload. These tests pin that on both dispatch
 * paths, that a caller-supplied lastRunId wins, and that no predecessor changes nothing.
 * Harness as in `RunAIAgentResolver.historyFrom.test.ts`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return Object.fromEntries(exportNames.map((name) => [name, decoratorFactory]));
});

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation() {
            return Promise.resolve({ agentResult: { success: true } });
        }
    },
    ArtifactToolManager: class {},
    // The pure helpers the resolver shares with BaseAgent; stubbed to the same contract.
    BuildStoppedRunPredecessorFilter: (conversationId: string, agentId: string) =>
        `ConversationID='${conversationId}' AND ParentRunID IS NULL AND AgentID='${agentId}'`,
    IsUserStoppedRun: (run: { Status: string; CancellationReason: string | null } | null | undefined) =>
        !!run && run.Status === 'Cancelled' && run.CancellationReason === 'User Request',
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const USER = { ID: 'user-1', Email: 'user@example.com' };
const STOPPED_RUN = '16787b44-29f6-44a5-8bd4-fc1538e79275';

type Fn = ReturnType<typeof vi.fn>;

interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
    findUserStoppedPredecessorRunId: Fn;
}

/** Argument positions of lastRunId / autoPopulateLastRunPayload on the two dispatch seams. */
const SYNC_LAST_RUN = 10, SYNC_AUTO = 11, BG_LAST_RUN = 9, BG_AUTO = 10;

function makeResolver(): { resolver: RunAIAgentResolver; seams: ResolverSeams } {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn().mockReturnValue(USER);
    seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([]);
    seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
    seams.executeAgentInBackground = vi.fn();
    seams.findUserStoppedPredecessorRunId = vi.fn().mockResolvedValue(null);
    return { resolver, seams };
}

function makeContext(): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({ ConversationID: 'conv-1', Load: vi.fn().mockResolvedValue(true) }),
    };
    return {
        userPayload: { sessionId: 'session-1', userRecord: USER } as unknown as UserPayload,
        providers: [{ type: 'Read-Write', provider }],
        dataSource: {},
    } as unknown as AppContext;
}

const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;

async function runMutation(
    resolver: RunAIAgentResolver,
    options: { payload?: string; lastRunId?: string; autoPopulate?: boolean; fireAndForget?: boolean }
) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', makeContext(), 'session-1', pubSub,
        undefined, undefined, options.payload, options.lastRunId, options.autoPopulate, undefined, undefined, undefined,
        undefined, undefined, options.fireAndForget, undefined, undefined,
        undefined
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgentFromConversationDetail — continuing from a user-stopped run', () => {
    let resolver: RunAIAgentResolver;
    let seams: ResolverSeams;

    beforeEach(() => {
        ({ resolver, seams } = makeResolver());
    });

    it('chains the new run to the stopped predecessor and rolls its payload in when none was supplied', async () => {
        seams.findUserStoppedPredecessorRunId.mockResolvedValue(STOPPED_RUN);

        const result = await runMutation(resolver, {});

        expect(result.success).toBe(true);
        expect(seams.findUserStoppedPredecessorRunId).toHaveBeenCalledWith('conv-1', 'agent-1', USER, expect.anything());
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[SYNC_AUTO]).toBe(true);
    });

    it('keeps the caller\'s payload as the start when one was supplied (chains, but does not roll the old one in)', async () => {
        seams.findUserStoppedPredecessorRunId.mockResolvedValue(STOPPED_RUN);

        await runMutation(resolver, { payload: '{"fromArtifact":true}' });

        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[SYNC_AUTO]).toBeUndefined();
    });

    it('hands the chain to a fire-and-forget run too', async () => {
        seams.findUserStoppedPredecessorRunId.mockResolvedValue(STOPPED_RUN);

        await runMutation(resolver, { fireAndForget: true });

        expect(seams.executeAIAgent).not.toHaveBeenCalled();
        const args = seams.executeAgentInBackground.mock.calls[0];
        expect(args[BG_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[BG_AUTO]).toBe(true);
    });

    it('a caller-supplied lastRunId wins and the lookup is skipped', async () => {
        await runMutation(resolver, { lastRunId: 'caller-run', autoPopulate: false });

        expect(seams.findUserStoppedPredecessorRunId).not.toHaveBeenCalled();
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe('caller-run');
        expect(args[SYNC_AUTO]).toBe(false);
    });

    it('with no stopped predecessor the run is dispatched unchained, as before', async () => {
        await runMutation(resolver, {});

        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBeUndefined();
        expect(args[SYNC_AUTO]).toBeUndefined();
    });
});
