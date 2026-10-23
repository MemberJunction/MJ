/**
 * @fileoverview `RunAIAgentFromConversationDetail` after A19: only the server writes agent replies.
 *
 * The mutation names the user's message. The server loads the history, creates the agent's reply row as the person
 * asking (marked as server-authored by `AgentRunner.CreateAgentReplyDetail`), and runs the agent into it. The
 * fire-and-forget acknowledgement names the row (`conversationDetailId`, `createdAt`) and is returned before the run
 * publishes anything; the run's status messages carry the same ID (`AgentRunStatusPublisher`, its own tests).
 */
import 'reflect-metadata'; // must precede any type-graphql decorator evaluation
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
    createReply: vi.fn(),
    runAgentInConversation: vi.fn(),
    widgetContext: vi.fn(),
    agents: new Map<string, { ID: string; Name: string; Status: string }>(),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: async () => undefined,
            GetAgentByID: (id: string) => hoisted.agents.get(id),
        },
    },
    GetAttachmentService: () => ({}),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        CreateAgentReplyDetail(args: unknown) {
            return hoisted.createReply(args);
        }
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
    },
    ArtifactToolManager: class {},
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: (...args: unknown[]) => hoisted.widgetContext(...args),
    ElevateUserPayload: (payload: Record<string, unknown>, user: unknown) => ({ ...payload, userRecord: user }),
}));

import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const USER = { ID: 'user-1', Email: 'user@example.com' };
const SYSTEM = { ID: 'system-1', Email: 'system@example.com' };
const CREATED_AT = new Date('2026-10-12T10:00:00.000Z');
const REPLY = { ID: 'reply-1', ConversationID: 'conv-1', __mj_CreatedAt: CREATED_AT };

type Fn = ReturnType<typeof vi.fn>;

interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
    validateAgent: Fn;
    persistInFlightAgentFailure: Fn;
}

/** The order the turn's steps happened in. */
let steps: string[] = [];

function makeResolver(): { resolver: RunAIAgentResolver; seams: ResolverSeams } {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn((payload: { userRecord: unknown }) => payload.userRecord);
    seams.loadConversationHistoryWithAttachments = vi.fn(async () => {
        steps.push('history');
        return [];
    });
    seams.executeAIAgent = vi.fn(async () => {
        steps.push('run');
        return { success: true, result: '{}' };
    });
    seams.executeAgentInBackground = vi.fn(() => {
        steps.push('run');
    });
    return { resolver, seams };
}

/**
 * A provider whose conversation details are the user's message ('user-msg-1', in conv-1) plus `others`: message ID →
 * its conversation. A load of any other ID finds nothing, as when the caller can't read it.
 */
function makeContext(userMessageFound = true, others: Record<string, string> = {}): { ctx: AppContext; loads: Fn } {
    const conversations: Record<string, string> = { ...(userMessageFound ? { 'user-msg-1': 'conv-1' } : {}), ...others };
    const loads = vi.fn();
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row = { ConversationID: '', Load: async (id: string) => false };
            row.Load = async (id: string) => {
                loads(id);
                row.ConversationID = conversations[id] ?? '';
                return id in conversations;
            };
            return row;
        }),
    };
    const ctx = {
        userPayload: { sessionId: 'session-1', userRecord: USER } as unknown as UserPayload,
        providers: [{ type: 'Read-Write', provider }],
        dataSource: {},
    } as unknown as AppContext;
    return { ctx, loads };
}

const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;

function runMutation(
    resolver: RunAIAgentResolver,
    ctx: AppContext,
    fireAndForget: boolean,
    threading: { replyParentId?: string; announcedByAgentId?: string } = {}
) {
    return resolver.RunAIAgentFromConversationDetail(
        'user-msg-1', 'agent-1', ctx, 'session-1', pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, fireAndForget, undefined, undefined, undefined,
        threading.replyParentId, threading.announcedByAgentId
    );
}

beforeEach(() => {
    steps = [];
    hoisted.agents.clear();
    hoisted.agents.set('agent-1', { ID: 'agent-1', Name: 'Research', Status: 'Active' });
    hoisted.agents.set('manager-1', { ID: 'manager-1', Name: 'Sage', Status: 'Active' });
    hoisted.agents.set('retired-1', { ID: 'retired-1', Name: 'Old', Status: 'Disabled' });
    hoisted.widgetContext.mockReset().mockResolvedValue(null);
    hoisted.createReply.mockReset().mockImplementation(async () => {
        steps.push('reply');
        return REPLY;
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('RunAIAgentFromConversationDetail — the server creates the reply row', () => {
    it("acks the reply row it created, with its ID and creation time, before the run publishes anything", async () => {
        const { resolver, seams } = makeResolver();
        const { ctx } = makeContext();

        const result = await runMutation(resolver, ctx, true);

        expect(result.success).toBe(true);
        expect(JSON.parse(result.result)).toEqual({
            accepted: true,
            fireAndForget: true,
            conversationDetailId: 'reply-1',
            createdAt: CREATED_AT.toISOString(),
        });
        // History first (so it never holds the empty reply), then the reply row, then the run.
        expect(steps).toEqual(['history', 'reply', 'run']);
    });

    it("creates the reply as the person asking, answering their message, for the agent that runs", async () => {
        const { resolver } = makeResolver();
        const { ctx } = makeContext();

        await runMutation(resolver, ctx, true);

        expect(hoisted.createReply).toHaveBeenCalledOnce();
        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({
            conversationId: 'conv-1',
            agentId: 'agent-1',
            contextUser: USER,
            parentId: 'user-msg-1',
        });
    });

    it('runs the agent into that row on both paths: its ID and the row itself reach the run', async () => {
        const background = makeResolver();
        await runMutation(background.resolver, makeContext().ctx, true);
        const bgArgs = background.seams.executeAgentInBackground.mock.calls[0];
        expect(bgArgs[12]).toBe('reply-1');
        expect(bgArgs.at(-1)).toBe(REPLY);

        const sync = makeResolver();
        await runMutation(sync.resolver, makeContext().ctx, false);
        const syncArgs = sync.seams.executeAIAgent.mock.calls[0];
        expect(syncArgs[13]).toBe('reply-1');
        expect(syncArgs.at(-1)).toBe(REPLY);
    });

    it('hands agentResponseDetail through the real executeAIAgent into RunAgentInConversation', async () => {
        const resolver = new RunAIAgentResolver();
        const seams = resolver as unknown as ResolverSeams;
        seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Research' });
        seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
        hoisted.runAgentInConversation.mockReset().mockRejectedValue(new Error('stop here'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const execute = (resolver as unknown as { executeAIAgent(...args: unknown[]): Promise<unknown> }).executeAIAgent.bind(resolver);
        const userPayload = { sessionId: 'session-1', userRecord: USER };
        await execute(
            {}, {}, 'agent-1', userPayload, '[{"role":"user","content":"hi"}]', 'session-1', pubSub,
            undefined, undefined, undefined, undefined, undefined, undefined, 'reply-1', false, false,
            undefined, undefined, 'conv-1', undefined, undefined, undefined, undefined, undefined,
            false, null, REPLY
        );

        expect(hoisted.runAgentInConversation).toHaveBeenCalledOnce();
        expect(hoisted.runAgentInConversation.mock.calls[0][1]).toMatchObject({
            conversationDetailId: 'reply-1',
            agentResponseDetail: REPLY,
        });
    });

    it("loads the user's message as the caller, and creates nothing when they can't read it", async () => {
        const { resolver, seams } = makeResolver();
        const { ctx, loads } = makeContext(false);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await runMutation(resolver, ctx, true);

        expect(loads).toHaveBeenCalledWith('user-msg-1');
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('user-msg-1');
        expect(hoisted.createReply).not.toHaveBeenCalled();
        expect(seams.executeAgentInBackground).not.toHaveBeenCalled();
    });

    it('fails the request with the reason when the reply row is refused, and starts no run', async () => {
        const { resolver, seams } = makeResolver();
        hoisted.createReply.mockRejectedValue(new Error('Failed to create agent response conversation detail: You have view-only access to this conversation.'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await runMutation(resolver, makeContext().ctx, true);

        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('view-only access');
        expect(seams.executeAgentInBackground).not.toHaveBeenCalled();
    });

    it("writes a widget guest's reply as the guest, while the agent runs under the elevated principal", async () => {
        hoisted.widgetContext.mockResolvedValue({ ElevatedUser: SYSTEM, PinnedAgentId: 'pinned-agent' });
        const { resolver, seams } = makeResolver();

        await runMutation(resolver, makeContext().ctx, true);

        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({ contextUser: USER, agentId: 'pinned-agent' });
        const runPayload = seams.executeAgentInBackground.mock.calls[0][3] as { userRecord: unknown };
        expect(runPayload.userRecord).toBe(SYSTEM);
    });
});

describe('RunAIAgentFromConversationDetail — where the reply sits', () => {
    it("threads the reply under a message of the same conversation the caller names", async () => {
        const { resolver } = makeResolver();

        const result = await runMutation(resolver, makeContext(true, { 'manager-reply-1': 'conv-1' }).ctx, true, { replyParentId: 'manager-reply-1' });

        expect(result.success).toBe(true);
        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({ parentId: 'manager-reply-1' });
    });

    it('refuses a parent from another conversation, or one the caller cannot read, and creates nothing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (const parent of ['elsewhere-1', 'hidden-1']) {
            const { resolver, seams } = makeResolver();
            hoisted.createReply.mockClear();

            const result = await runMutation(resolver, makeContext(true, { 'elsewhere-1': 'conv-2' }).ctx, true, { replyParentId: parent });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain(parent);
            expect(hoisted.createReply).not.toHaveBeenCalled();
            expect(seams.executeAgentInBackground).not.toHaveBeenCalled();
        }
    });

    it("posts the announcing agent's fixed line first, threads the reply under it, and names it in the ack", async () => {
        const { resolver, seams } = makeResolver();
        hoisted.createReply.mockImplementation(async (args: { message?: string }) => (
            args.message ? { ID: 'announcement-1', ConversationID: 'conv-1', __mj_CreatedAt: CREATED_AT } : REPLY
        ));

        const result = await runMutation(resolver, makeContext().ctx, true, { announcedByAgentId: 'manager-1' });

        expect(seams.CheckAPIKeyScopeAuthorization).toHaveBeenCalledWith('agent:execute', 'manager-1', expect.anything());
        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({
            agentId: 'manager-1',
            contextUser: USER,
            parentId: 'user-msg-1',
            message: 'Continuing with **Research** for refinement...',
            status: 'Complete',
        });
        expect(hoisted.createReply.mock.calls[1][0]).toMatchObject({ agentId: 'agent-1', parentId: 'announcement-1' });
        expect(JSON.parse(result.result)).toMatchObject({ conversationDetailId: 'reply-1', announcementDetailId: 'announcement-1' });
    });

    it('ignores announcedByAgentId when elevated under a widget guest token', async () => {
        hoisted.widgetContext.mockResolvedValue({ ElevatedUser: SYSTEM, PinnedAgentId: 'pinned-agent' });
        const { resolver } = makeResolver();

        const result = await runMutation(resolver, makeContext().ctx, true, { announcedByAgentId: 'manager-1' });

        expect(result.success).toBe(true);
        expect(hoisted.createReply).toHaveBeenCalledOnce();
        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({ agentId: 'pinned-agent', parentId: 'user-msg-1' });
        expect(JSON.parse(result.result)).not.toHaveProperty('announcementDetailId');
    });

    it('refuses an announcement by an agent that is not active, and creates nothing', async () => {
        const { resolver } = makeResolver();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await runMutation(resolver, makeContext().ctx, true, { announcedByAgentId: 'retired-1' });

        expect(result.success).toBe(false);
        expect(hoisted.createReply).not.toHaveBeenCalled();
    });

    it('without threading, answers the user message directly and the ack names no announcement', async () => {
        const { resolver } = makeResolver();

        const result = await runMutation(resolver, makeContext().ctx, true);

        expect(hoisted.createReply).toHaveBeenCalledOnce();
        expect(hoisted.createReply.mock.calls[0][0]).toMatchObject({ parentId: 'user-msg-1' });
        expect(JSON.parse(result.result)).not.toHaveProperty('announcementDetailId');
    });
});
