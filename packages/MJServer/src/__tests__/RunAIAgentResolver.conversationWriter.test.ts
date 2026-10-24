/**
 * @fileoverview A widget guest's agent run executes as the system user, but the conversation belongs to the guest,
 * and only the owner (or a grantee) may write a conversation's messages (MJConversationDetailEntityExtended, MJ#4791).
 * So the resolver names the guest as `ConversationWriter`: AgentRunner then writes the reply as the guest and the
 * run's own records as the system user. Before this, every reply save of a widget guest was refused and the widget
 * never showed the agent's answer.
 */
import 'reflect-metadata'; // must precede any type-graphql decorator evaluation
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

// type-graphql's real decorators need emitDecoratorMetadata, which vitest's esbuild transform
// does not emit; the schema is irrelevant here, so every decorator is a no-op.
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
    runAgentInConversation: vi.fn(),
    createAgentReplyDetail: vi.fn(),
    resolveWidgetGuestRunContext: vi.fn(),
    authorize: vi.fn(),
}));

// Only the key engine is stubbed: Authorize allows `agent:trusted` for the key whose hash is 'hash-trusted'.
vi.mock('@memberjunction/api-keys', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/api-keys')>()),
    GetAPIKeyEngine: () => ({ Authorize: hoisted.authorize }),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
        CreateAgentReplyDetail(...args: unknown[]) {
            return hoisted.createAgentReplyDetail(...args);
        }
    },
    ArtifactToolManager: class {},
}));

// Only the widget lookup is stubbed; ElevateUserPayload is the real one, so the widget-guest test runs
// against the elevated system-user payload the resolver really builds.
vi.mock('../realtimeWidget/widgetGuestElevation.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../realtimeWidget/widgetGuestElevation.js')>()),
    ResolveWidgetGuestRunContext: hoisted.resolveWidgetGuestRunContext,
}));

import { UserCache } from '@memberjunction/generic-database-provider';
import type { UserInfo } from '@memberjunction/core';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const SCOPE_RECORD_ID = 'B1A2C3D4-0000-4000-8000-00000000A115';
const ORDINARY = { conversationId: 'conv-1', latestMessageId: 'detail-1', invocationReason: 'user-message' };
const CLIENT_DATA = JSON.stringify({
    ...ORDINARY,
    PrimaryScopeRecordID: SCOPE_RECORD_ID,
    PrimaryScopeEntityName: 'MJ: Companies',
    SecondaryScopes: { TeamID: 'team-other' },
    __agentTypePromptParams: { enableTaskGraphs: true },
});

const USER = { ID: 'user-1', Email: 'browser.user@example.com' };
const SYSTEM_USER = { ID: 'system-user', Email: 'system@example.com' };
const GUEST = { ID: 'guest-1', Email: 'anonymous@magic-link.local', IsMagicLinkAnonymous: true };

type Fn = ReturnType<typeof vi.fn>;

/** The private members this test reaches, through an explicit shape (no `any`). */
interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    validateAgent: Fn;
    persistInFlightAgentFailure: Fn;
}

const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;

function makeResolver(): { resolver: RunAIAgentResolver; seams: ResolverSeams } {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn((payload: UserPayload) => payload.userRecord);
    seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([{ role: 'user', content: 'hi' }]);
    seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Test Agent' });
    seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
    return { resolver, seams };
}

function makeContext(userPayload: Partial<UserPayload>): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({ ConversationID: 'conv-1', Load: vi.fn().mockResolvedValue(true) }),
    };
    return {
        userPayload: { sessionId: 'session-1', email: USER.Email, userRecord: USER, ...userPayload } as UserPayload,
        providers: [{ type: 'Read-Write', provider }],
        dataSource: {},
    } as unknown as AppContext;
}

/** The params the n-th run was handed by the real executeAIAgent (what AgentRunner.RunAgentInConversation received). */
interface HandedParams {
    data: Record<string, unknown>;
    TrustReservedRunData?: boolean;
    contextUser: { ID: string };
}

/** Waits for the n-th run to start (the fire-and-forget path starts it after the resolver has returned). */
async function handedParams(n = 0): Promise<HandedParams> {
    await vi.waitFor(() => expect(hoisted.runAgentInConversation.mock.calls.length).toBeGreaterThan(n));
    return hoisted.runAgentInConversation.mock.calls[n][0] as HandedParams;
}

function runAIAgent(resolver: RunAIAgentResolver, ctx: AppContext, fireAndForget?: boolean) {
    return resolver.RunAIAgent(
        'agent-1', ctx, '[{"role":"user","content":"hi"}]', 'session-1', pubSub, CLIENT_DATA,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        fireAndForget
    );
}

function runFromDetail(resolver: RunAIAgentResolver, ctx: AppContext, fireAndForget?: boolean) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', ctx, 'session-1', pubSub, undefined, CLIENT_DATA,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, fireAndForget
    );
}

beforeEach(() => {
    hoisted.resolveWidgetGuestRunContext.mockReset().mockResolvedValue(null);
    // Stop right after the run's params are captured — the rest of the run is out of scope.
    hoisted.runAgentInConversation.mockReset().mockRejectedValue(new Error('stop here'));
    hoisted.createAgentReplyDetail.mockReset().mockResolvedValue({ ID: 'reply-1', __mj_CreatedAt: new Date() });
    hoisted.authorize.mockReset().mockImplementation(async (apiKeyHash: string, _app: string, scopePath: string) =>
        apiKeyHash === 'hash-trusted' && scopePath === 'agent:trusted'
            ? { Allowed: true, MatchedKeyRule: { ScopePath: scopePath }, EvaluatedRules: [] }
            : { Allowed: false, Reason: 'No matching key scope rules', EvaluatedRules: [] });
    vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(SYSTEM_USER as UserInfo);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** The options the n-th run was handed (the second argument of AgentRunner.RunAgentInConversation). */
async function handedOptions(n = 0): Promise<{ ConversationWriter?: { ID: string } }> {
    await vi.waitFor(() => expect(hoisted.runAgentInConversation.mock.calls.length).toBeGreaterThan(n));
    return hoisted.runAgentInConversation.mock.calls[n][1] as { ConversationWriter?: { ID: string } };
}

describe('RunAIAgentFromConversationDetail — who writes the conversation', () => {
    it('runs a widget guest as the system user but writes its conversation as the guest, on both paths', async () => {
        const { resolver } = makeResolver();
        hoisted.resolveWidgetGuestRunContext.mockResolvedValue({ ElevatedUser: SYSTEM_USER, Widget: {}, PinnedAgentId: 'pinned-agent' });
        const ctx = makeContext({ email: GUEST.Email, userRecord: GUEST });

        await runFromDetail(resolver, ctx);
        await runFromDetail(resolver, ctx, true);

        expect((await handedParams(0)).contextUser.ID).toBe(SYSTEM_USER.ID);
        expect((await handedOptions(0)).ConversationWriter?.ID).toBe(GUEST.ID);
        expect((await handedParams(1)).contextUser.ID).toBe(SYSTEM_USER.ID);
        expect((await handedOptions(1)).ConversationWriter?.ID).toBe(GUEST.ID);
        // The server-created reply row (A19) is written as the guest too, never as the elevated system user.
        for (const [args] of hoisted.createAgentReplyDetail.mock.calls) {
            expect((args as { contextUser: { ID: string } }).contextUser.ID).toBe(GUEST.ID);
        }
        expect(hoisted.createAgentReplyDetail).toHaveBeenCalledTimes(2);
    });

    it('names no separate writer for an ordinary user (it runs and writes as itself)', async () => {
        const { resolver } = makeResolver();

        await runFromDetail(resolver, makeContext({}));

        expect((await handedOptions()).ConversationWriter).toBeUndefined();
        expect((await handedParams()).contextUser.ID).toBe(USER.ID);
    });
});
