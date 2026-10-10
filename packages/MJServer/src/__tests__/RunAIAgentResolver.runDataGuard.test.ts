/**
 * @fileoverview Every agent-run entry of `RunAIAgentResolver` tells the run whether it may read the reserved scope
 * and agent-type keys from a client's `data` (`ExecuteAgentParams.TrustReservedRunData`, A12.15).
 *
 * The decision is pinned by `agent-run-data-guard.test.ts`, and what an untrusted run loses by the ai-core-plus and
 * ai-agents suites (`BaseAgent.Execute` drops the keys). These tests pin the call sites: the synchronous and
 * fire-and-forget paths of `RunAIAgent` and `RunAIAgentFromConversationDetail`, the widget-guest path (judged on
 * the guest's own payload, not the system principal it is elevated to) and the trusted callers — each through the
 * real `executeAIAgent`, up to the params handed to `AgentRunner`. The resolver forwards `data` as sent.
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
    resolveWidgetGuestRunContext: vi.fn(),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
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
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgent — reserved run-data keys', () => {
    it('marks the run untrusted for an interactive user and forwards data as sent', async () => {
        const { resolver } = makeResolver();

        await runAIAgent(resolver, makeContext({}));

        const params = await handedParams();
        expect(params.TrustReservedRunData).toBe(false);
        expect(params.data).toEqual(JSON.parse(CLIENT_DATA));
    });

    it('marks it untrusted on the fire-and-forget path too', async () => {
        const { resolver } = makeResolver();

        await runAIAgent(resolver, makeContext({}), true);

        expect((await handedParams()).TrustReservedRunData).toBe(false);
    });

    it('marks it trusted for an API-key caller, on both paths', async () => {
        const { resolver } = makeResolver();
        const ctx = makeContext({ apiKeyId: 'key-1', apiKeyHash: 'hash-1' });

        await runAIAgent(resolver, ctx);
        await runAIAgent(resolver, ctx, true);

        expect((await handedParams(0)).TrustReservedRunData).toBe(true);
        expect((await handedParams(1)).TrustReservedRunData).toBe(true);
    });
});

describe('RunAIAgentFromConversationDetail — reserved run-data keys', () => {
    it('marks the run untrusted for an interactive user on both paths', async () => {
        const { resolver } = makeResolver();

        await runFromDetail(resolver, makeContext({}));
        await runFromDetail(resolver, makeContext({}), true);

        expect((await handedParams(0)).TrustReservedRunData).toBe(false);
        expect((await handedParams(1)).TrustReservedRunData).toBe(false);
    });

    it('marks a widget-guest run untrusted although it executes as the system user', async () => {
        const { resolver } = makeResolver();
        hoisted.resolveWidgetGuestRunContext.mockResolvedValue({
            ElevatedUser: SYSTEM_USER,
            Widget: {},
            PinnedAgentId: 'pinned-agent',
        });

        await runFromDetail(resolver, makeContext({ email: GUEST.Email, userRecord: GUEST }));

        const params = await handedParams();
        expect(params.contextUser.ID).toBe(SYSTEM_USER.ID); // the premise: the run is elevated
        expect(params.TrustReservedRunData).toBe(false);
    });

    it('marks it trusted for the system user, on both paths', async () => {
        const { resolver } = makeResolver();
        const ctx = makeContext({ isSystemUser: true, email: SYSTEM_USER.Email, userRecord: SYSTEM_USER });

        await runFromDetail(resolver, ctx);
        await runFromDetail(resolver, ctx, true);

        expect((await handedParams(0)).TrustReservedRunData).toBe(true);
        expect((await handedParams(1)).TrustReservedRunData).toBe(true);
    });
});

describe('RunAIAgentSystemUser — reserved run-data keys', () => {
    it('marks the run trusted for the system user it admits, and forwards data as sent', async () => {
        const { resolver } = makeResolver();
        const ctx = makeContext({ isSystemUser: true, email: SYSTEM_USER.Email, userRecord: SYSTEM_USER });

        await resolver.RunAIAgentSystemUser('agent-1', ctx, '[]', 'session-1', pubSub, CLIENT_DATA);

        const params = await handedParams();
        expect(params.TrustReservedRunData).toBe(true);
        expect(params.data).toEqual(JSON.parse(CLIENT_DATA));
    });
});
