/**
 * @fileoverview The two resolver paths a person answers an agent request through.
 *
 * `MJAIAgentRequestEntityServer` records a request's responder only for a save that is the user's own
 * client request, so both paths save inside a client CRUD boundary: `RespondToAgentRequest`, and the
 * conversation reply sync (`syncFeedbackRequestFromConversation`). The sync also never answers a
 * workflow step's request: the graph's own run is that request's provenance, so a follow-up message
 * to the run is not an answer to it.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    events: [] as string[],
    runAgentInConversation: vi.fn(),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
    },
    ArtifactToolManager: class {},
    CanAgentOwnSubAgentConsults: () => false,
    LoadOpenSubAgentConsults: async () => [],
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { RunView, ServerOperationScopeManager } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext } from '../types.js';

const USER = { ID: '44444444-4444-4444-8444-444444444444', Email: 'person@example.com' } as unknown as UserInfo;
const LAST_RUN_ID = '33333333-3333-4333-8333-333333333333';

/** A request row whose save records whether it ran as the caller's own client request. */
function recordingRequest(seen: { client?: boolean }): Record<string, unknown> {
    return {
        ID: 'req-1',
        Status: 'Requested',
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn(async () => {
            seen.client = ServerOperationScopeManager.Instance.IsInDirectClientCrud();
            return true;
        }),
    };
}

interface SyncCallable {
    syncFeedbackRequestFromConversation(
        lastRunId: string, newRunId: string, userMessage: string | undefined, contextUser: UserInfo, provider: IMetadataProvider,
    ): Promise<void>;
}

describe('RunAIAgentResolver: a person answering an agent request', () => {
    let runViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        runViewMock = vi.fn();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);
    });

    it("the conversation reply sync skips workflow steps' requests and saves as the person's own request", async () => {
        const seen: { client?: boolean } = {};
        runViewMock.mockResolvedValue({ Success: true, Results: [recordingRequest(seen)] });
        const resolver = new RunAIAgentResolver() as unknown as SyncCallable;

        await resolver.syncFeedbackRequestFromConversation(LAST_RUN_ID, 'new-run', 'yes, go ahead', USER, {} as IMetadataProvider);

        const filter = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain(`OriginatingAgentRunID='${LAST_RUN_ID}'`);
        expect(filter).toContain('OriginatingTaskID IS NULL');
        expect(seen.client).toBe(true);
    });

    it("RespondToAgentRequest saves the answer as the caller's own request", async () => {
        const seen: { client?: boolean } = {};
        const request = recordingRequest(seen);
        const provider = { GetEntityObject: vi.fn().mockResolvedValue(request) };
        const resolver = new RunAIAgentResolver();
        vi.spyOn(resolver as unknown as { GetUserFromPayload(): UserInfo }, 'GetUserFromPayload').mockReturnValue(USER);
        const ctx = { userPayload: {}, providers: [{ provider, type: 'Read-Write' }], dataSource: {} } as unknown as AppContext;

        const result = await resolver.RespondToAgentRequest('req-1', 'Approved', ctx);

        expect(result.success).toBe(true);
        expect(seen.client).toBe(true);
    });
});

/**
 * Owner-batch item 3 (D-091, D5-22, D5-35) — A2 attacks 13 (a), 14 and 19. Explorer's chat sends the plan card's answer as
 * a `@{"_mode":"form",…}` token with no `lastRunId`. The turn is chained to the run that presented the plan (reason
 * `'plan-answer'`), the open Plan-step request is saved Approved/Rejected with the form's fields as the person's own
 * client save BEFORE the continuation run (marked so that save does not also resume), and linked to the run after it.
 * Every other message is chained and synced exactly as before. Harness: the resolver's seams are replaced on the
 * instance (`ResolverSeams`), `RunView` is spied, the request is a recording double; casts where handed over.
 */
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import type { PubSubEngine } from 'type-graphql';
import type { UserPayload } from '../types.js';

const PRESENTING_RUN = '16787b44-29f6-44a5-8bd4-fc1538e79275';
const PLAN_REQUEST = '26787b44-29f6-44a5-8bd4-fc1538e79275';
const NEW_RUN = '36787b44-29f6-44a5-8bd4-fc1538e79275';
const PLAN_TEXT = '## Plan\nPredict Renewed.';

type Fn = ReturnType<typeof vi.fn>;
interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
    findChainablePredecessor: Fn;
    validateAgent: Fn;
    sanitizeEdgePreDiscoveryInData: Fn;
    runPostExecutionNotifications: Fn;
    syncFeedbackRequestFromConversation: Fn;
    startConversationTurn: Fn;
}

function planCardToken(decision: 'approve' | 'reject', plan = PLAN_TEXT): string {
    return ConversationUtility.CreateFormResponse('formSubmit', [
        { name: 'plan', value: plan, label: 'Plan' },
        { name: 'reason', value: '', label: 'Feedback' },
        { name: 'decision', value: decision, label: 'Decision' },
    ], 'Review Plan');
}

/** A Plan-step request double: records the order of its saves, whether each was the person's own and marked. */
function planRequest(): Record<string, unknown> & { Marked: boolean[]; Clients: boolean[] } {
    const r: Record<string, unknown> & { Marked: boolean[]; Clients: boolean[] } = {
        ID: PLAN_REQUEST, Status: 'Requested', OriginatingAgentRunID: PRESENTING_RUN, ResumingAgentRunID: null,
        Response: null, ResponseData: null, RespondedAt: null, Marked: [], Clients: [],
        Load: vi.fn().mockResolvedValue(true),
    };
    let mark = false;
    r.MarkAnsweredByConversationHost = vi.fn(() => { mark = true; });
    r.Save = vi.fn(async () => {
        hoisted.events.push(`save:${String(r.Status)}${r.ResumingAgentRunID ? ':linked' : ''}`);
        r.Marked.push(mark);
        r.Clients.push(ServerOperationScopeManager.Instance.IsInDirectClientCrud());
        mark = false;
        return true;
    });
    return r;
}

function turnResolver(userText: string): { resolver: RunAIAgentResolver; seams: ResolverSeams } {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn().mockReturnValue(USER);
    seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
    seams.executeAgentInBackground = vi.fn();
    seams.findChainablePredecessor = vi.fn().mockResolvedValue(null);
    seams.startConversationTurn = vi.fn().mockResolvedValue({
        Reply: { ID: 'reply-1', __mj_CreatedAt: new Date() }, BranchId: null, ConversationId: 'conv-1',
        MessagesJson: JSON.stringify([{ role: 'user', content: userText }]),
    });
    return { resolver, seams };
}

function turnContext(provider: Record<string, unknown> = {}): AppContext {
    return { userPayload: { sessionId: 'session-1', userRecord: USER } as unknown as UserPayload, providers: [{ type: 'Read-Write', provider }], dataSource: {} } as unknown as AppContext;
}
const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;
/** Argument positions on `executeAIAgent`: lastRunId, and the plan answer after followHandoffs (27). */
const SYNC_LAST_RUN = 10, PLAN_ANSWER_ARG = 28;

async function runTurn(resolver: RunAIAgentResolver, provider: Record<string, unknown> = {}) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', turnContext(provider), 'session-1', pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, false, undefined, undefined, undefined,
    );
}

describe('RunAIAgentResolver — the plan card answered in the chat (owner-batch item 3)', () => {
    let runViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        hoisted.events.length = 0;
        runViewMock = vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: PLAN_REQUEST, OriginatingAgentRunID: PRESENTING_RUN }] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);
    });

    it('attack 19: a form-token answer with no lastRunId is chained to the presenting run (plan-answer)', async () => {
        const { resolver, seams } = turnResolver(planCardToken('approve'));
        await runTurn(resolver);
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBe(PRESENTING_RUN);
        expect(args[PLAN_ANSWER_ARG]).toMatchObject({ RequestID: PLAN_REQUEST, Decision: 'approve' });
        const filter = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain("Status='Requested'");
        expect(filter).toContain('OriginatingTaskID IS NULL');
        expect(filter).toContain("StepType='Plan'");
    });

    it('attack 19: the chained turn rolls the presenting run\'s payload in (auto-populate) when the caller sent none', async () => {
        const { resolver, seams } = turnResolver(planCardToken('approve'));
        await runTurn(resolver);
        expect(seams.executeAIAgent.mock.calls[0][SYNC_LAST_RUN + 1]).toBe(true);
    });

    it('attack 14: a plain chat message is not a plan answer: chained (or not) exactly as before', async () => {
        const { resolver, seams } = turnResolver('what features will you use?');
        await runTurn(resolver);
        expect(runViewMock).not.toHaveBeenCalled();
        expect(seams.findChainablePredecessor).toHaveBeenCalledTimes(1);
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[SYNC_LAST_RUN]).toBeUndefined();
        expect(args[PLAN_ANSWER_ARG]).toBeUndefined();
    });

    it('a form token with no open Plan-step request falls back to the existing chaining', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const { resolver, seams } = turnResolver(planCardToken('approve'));
        await runTurn(resolver);
        expect(seams.findChainablePredecessor).toHaveBeenCalledTimes(1);
        const args = seams.executeAIAgent.mock.calls[0];
        expect(args[PLAN_ANSWER_ARG]).toBeUndefined();
    });
});

describe('RunAIAgentResolver.executeAIAgent — settling the plan answer before the continuation run', () => {
    function settlingResolver(request: Record<string, unknown>): { resolver: RunAIAgentResolver; seams: ResolverSeams; provider: Record<string, unknown> } {
        const resolver = new RunAIAgentResolver();
        const seams = resolver as unknown as ResolverSeams;
        seams.GetUserFromPayload = vi.fn().mockReturnValue(USER);
        seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Model Development Agent' });
        seams.sanitizeEdgePreDiscoveryInData = vi.fn(async (d: unknown) => d);
        seams.runPostExecutionNotifications = vi.fn(async () => { hoisted.events.push('post-run-sync'); });
        const provider = { GetEntityObject: vi.fn().mockResolvedValue(request) };
        hoisted.runAgentInConversation.mockImplementation(async () => {
            hoisted.events.push(`run:${String(request.Status)}`);
            return { agentResult: { success: true, agentRun: { ID: NEW_RUN } }, conversationId: 'conv-1' };
        });
        return { resolver, seams, provider };
    }

    interface ExecuteCallable {
        executeAIAgent(...args: unknown[]): Promise<unknown>;
    }
    async function execute(resolver: RunAIAgentResolver, provider: Record<string, unknown>, decision: 'approve' | 'reject', plan = PLAN_TEXT) {
        const token = planCardToken(decision, plan);
        const args: unknown[] = [provider, {}, 'agent-1', { sessionId: 's' }, JSON.stringify([{ role: 'user', content: token }]), 's', pubSub];
        while (args.length < PLAN_ANSWER_ARG) args.push(undefined);
        args[10] = PRESENTING_RUN;
        args[PLAN_ANSWER_ARG] = { RequestID: PLAN_REQUEST, Decision: decision, ResponseData: { plan, reason: '', decision }, Response: token };
        return (resolver as unknown as ExecuteCallable).executeAIAgent(...args);
    }

    beforeEach(() => {
        hoisted.events.length = 0;
    });

    it('attack 13 (a): Approve → the request is Approved with the form\'s ResponseData BEFORE the run, as the person, not resumed', async () => {
        const request = planRequest();
        const { resolver, provider } = settlingResolver(request);
        await execute(resolver, provider, 'approve');
        expect(hoisted.events.slice(0, 2)).toEqual(['save:Approved', 'run:Approved']);
        expect(JSON.parse(String(request.ResponseData))).toEqual({ plan: PLAN_TEXT, reason: '', decision: 'approve' });
        expect(request.RespondedAt).toBeInstanceOf(Date);
        expect(request.Clients[0]).toBe(true);
        expect(request.Marked[0]).toBe(true);
    });

    it('attack 13 (a): after the run the request is linked to it (ResumingAgentRunID)', async () => {
        const request = planRequest();
        const { resolver, provider } = settlingResolver(request);
        await execute(resolver, provider, 'approve');
        expect(request.ResumingAgentRunID).toBe(NEW_RUN);
        expect(hoisted.events).toContain('save:Approved:linked');
    });

    it('attack 14: Reject → Rejected before the run', async () => {
        const request = planRequest();
        const { resolver, provider } = settlingResolver(request);
        await execute(resolver, provider, 'reject');
        expect(hoisted.events.slice(0, 2)).toEqual(['save:Rejected', 'run:Rejected']);
    });

    it('a request that is no longer Requested is left alone (it was answered elsewhere)', async () => {
        const request = planRequest();
        request.Status = 'Approved';
        const { resolver, provider } = settlingResolver(request);
        await execute(resolver, provider, 'approve');
        expect(hoisted.events[0]).toBe('run:Approved');
        expect(request.Save).not.toHaveBeenCalled();
    });
});
