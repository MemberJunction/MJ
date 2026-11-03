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

const hoisted = vi.hoisted(() => ({
    runAgentInConversation: vi.fn().mockResolvedValue({ agentResult: { success: true } }),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
        CreateAgentReplyDetail() {
            return Promise.resolve({ ID: 'reply-1', __mj_CreatedAt: new Date() }); // the server creates the reply row (A19)
        }
    },
    ArtifactToolManager: class {},
    CanAgentOwnSubAgentConsults: vi.fn(() => false),
    LoadOpenSubAgentConsults: vi.fn(async () => []),
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const USER = { ID: 'user-1', Email: 'user@example.com' };
const STOPPED_RUN = '16787b44-29f6-44a5-8bd4-fc1538e79275';
const CONSULT_RUN = 'c0ffee00-29f6-44a5-8bd4-fc1538e79275';

type Fn = ReturnType<typeof vi.fn>;

interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
    findChainablePredecessor: Fn;
    validateAgent: Fn;
    syncFeedbackRequestFromConversation: Fn;
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
    seams.findChainablePredecessor = vi.fn().mockResolvedValue(null);
    return { resolver, seams };
}

function makeContext(branchId: string | null = null): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({ ConversationID: 'conv-1', BranchID: branchId, Load: vi.fn().mockResolvedValue(true) }),
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
    options: { payload?: string; lastRunId?: string; autoPopulate?: boolean; fireAndForget?: boolean; branchId?: string | null }
) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', makeContext(options.branchId ?? null), 'session-1', pubSub,
        undefined, undefined, options.payload, options.lastRunId, options.autoPopulate, undefined, undefined, undefined,
        undefined, undefined, options.fireAndForget, undefined, undefined,
        undefined
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgentFromConversationDetail — continuing from a chainable predecessor run', () => {
    let resolver: RunAIAgentResolver;
    let seams: ResolverSeams;

    beforeEach(() => {
        ({ resolver, seams } = makeResolver());
    });

    it('chains the new run to the stopped predecessor and rolls its payload in when none was supplied', async () => {
        seams.findChainablePredecessor.mockResolvedValue({ runId: STOPPED_RUN, reason: 'stopped' });

        const result = await runMutation(resolver, {});

        expect(result.success).toBe(true);
        expect(seams.findChainablePredecessor).toHaveBeenCalledWith('conv-1', 'agent-1', null, USER, expect.anything());
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[SYNC_AUTO]).toBe(true);
    });

    it('keeps the caller\'s payload as the start when one was supplied (chains, but does not roll the old one in)', async () => {
        seams.findChainablePredecessor.mockResolvedValue({ runId: STOPPED_RUN, reason: 'stopped' });

        await runMutation(resolver, { payload: '{"fromArtifact":true}' });

        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[SYNC_AUTO]).toBeUndefined();
    });

    it('hands the chain to a fire-and-forget run too', async () => {
        seams.findChainablePredecessor.mockResolvedValue({ runId: STOPPED_RUN, reason: 'stopped' });

        await runMutation(resolver, { fireAndForget: true });

        expect(seams.executeAIAgent).not.toHaveBeenCalled();
        const args = seams.executeAgentInBackground.mock.calls[0];
        expect(args[BG_LAST_RUN]).toBe(STOPPED_RUN);
        expect(args[BG_AUTO]).toBe(true);
    });

    it('chains an open-consult predecessor on both synchronous and fire-and-forget paths, setting autoPopulate only when no payload was supplied', async () => {
        seams.findChainablePredecessor.mockResolvedValue({ runId: CONSULT_RUN, reason: 'open-consult' });

        // 1. Synchronous without payload -> effectiveAutoPopulate = true
        await runMutation(resolver, {});
        const syncNoPayloadArgs = seams.executeAIAgent.mock.calls[0];
        expect(syncNoPayloadArgs[SYNC_LAST_RUN]).toBe(CONSULT_RUN);
        expect(syncNoPayloadArgs[SYNC_AUTO]).toBe(true);

        // 2. Synchronous with payload -> effectiveAutoPopulate = undefined
        await runMutation(resolver, { payload: '{"custom":1}' });
        const syncWithPayloadArgs = seams.executeAIAgent.mock.calls[1];
        expect(syncWithPayloadArgs[SYNC_LAST_RUN]).toBe(CONSULT_RUN);
        expect(syncWithPayloadArgs[SYNC_AUTO]).toBeUndefined();

        // 3. Fire-and-forget without payload -> effectiveAutoPopulate = true
        await runMutation(resolver, { fireAndForget: true });
        const bgNoPayloadArgs = seams.executeAgentInBackground.mock.calls[0];
        expect(bgNoPayloadArgs[BG_LAST_RUN]).toBe(CONSULT_RUN);
        expect(bgNoPayloadArgs[BG_AUTO]).toBe(true);

        // 4. Fire-and-forget with payload -> effectiveAutoPopulate = undefined
        await runMutation(resolver, { fireAndForget: true, payload: '{"custom":1}' });
        const bgWithPayloadArgs = seams.executeAgentInBackground.mock.calls[1];
        expect(bgWithPayloadArgs[BG_LAST_RUN]).toBe(CONSULT_RUN);
        expect(bgWithPayloadArgs[BG_AUTO]).toBeUndefined();
    });

    it('threads a lastRunId chained from findChainablePredecessor into syncFeedbackRequestFromConversation when executeAIAgent runs', async () => {
        const realResolver = new RunAIAgentResolver();
        const realSeams = realResolver as unknown as ResolverSeams;
        realSeams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
        realSeams.GetUserFromPayload = vi.fn().mockReturnValue(USER);
        realSeams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([
            { role: 'user', content: 'Proceed with option A' },
        ]);
        realSeams.findChainablePredecessor = vi.fn().mockResolvedValue({
            runId: CONSULT_RUN,
            reason: 'open-consult',
        });
        realSeams.validateAgent = vi.fn().mockResolvedValue({
            ID: 'agent-1',
            Name: 'Director',
            Status: 'Active',
        });
        realSeams.syncFeedbackRequestFromConversation = vi.fn().mockResolvedValue(undefined);
        hoisted.runAgentInConversation.mockResolvedValueOnce({
            agentResult: {
                success: true,
                agentRun: { ID: 'new-run-99', ConversationDetailID: 'detail-1' },
            },
            conversationId: 'conv-1',
        });

        const res = await runMutation(realResolver, {});

        expect(res.success).toBe(true);
        expect(realSeams.syncFeedbackRequestFromConversation).toHaveBeenCalledWith(
            CONSULT_RUN,
            'new-run-99',
            'Proceed with option A',
            USER,
            expect.anything()
        );
    });

    it('looks up the predecessor on the branch the person\'s message was posted on', async () => {
        await runMutation(resolver, { branchId: 'B' });
        expect(seams.findChainablePredecessor).toHaveBeenCalledWith('conv-1', 'agent-1', 'B', expect.anything(), expect.anything());
        await runMutation(resolver, {});
        expect(seams.findChainablePredecessor).toHaveBeenLastCalledWith('conv-1', 'agent-1', null, expect.anything(), expect.anything());
    });

    it('a caller-supplied lastRunId wins and the lookup is skipped', async () => {
        await runMutation(resolver, { lastRunId: 'caller-run', autoPopulate: false });

        expect(seams.findChainablePredecessor).not.toHaveBeenCalled();
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
