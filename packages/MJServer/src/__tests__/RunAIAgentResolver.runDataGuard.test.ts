/**
 * @fileoverview Every agent-run entry of `RunAIAgentResolver` drops the reserved scope and agent-type
 * keys from a browser's `data` before it reaches `ExecuteAgentParams` (A12.15).
 *
 * The rule itself is pinned by `agent-run-data-guard.test.ts`; these tests pin the call sites: the
 * synchronous and fire-and-forget paths of `RunAIAgent` and `RunAIAgentFromConversationDetail`, the
 * widget-guest path (judged on the guest's own payload, not the system principal it is elevated to),
 * and the trusted callers that keep the keys.
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
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
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

/** The parsed `data` the run was handed (position 7 of executeAIAgent / executeAgentInBackground). */
function dataHandedTo(fn: Fn): Record<string, unknown> {
    return JSON.parse(fn.mock.calls[0][7] as string) as Record<string, unknown>;
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
    it('reach ExecuteAgentParams.data without the reserved keys for an interactive user', async () => {
        const { resolver } = makeResolver();

        await runAIAgent(resolver, makeContext({}));

        const params = hoisted.runAgentInConversation.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(params.data).toEqual(ORDINARY);
    });

    it('are dropped on the fire-and-forget path too', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAgentInBackground = vi.fn();

        await runAIAgent(resolver, makeContext({}), true);

        expect(dataHandedTo(seams.executeAgentInBackground)).toEqual(ORDINARY);
    });

    it('are kept, byte for byte, for an API-key caller', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });

        await runAIAgent(resolver, makeContext({ apiKeyId: 'key-1', apiKeyHash: 'hash-1' }));

        expect(seams.executeAIAgent.mock.calls[0][7]).toBe(CLIENT_DATA);
    });
});

describe('RunAIAgentFromConversationDetail — reserved run-data keys', () => {
    it('are dropped for an interactive user on both paths', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
        seams.executeAgentInBackground = vi.fn();

        await runFromDetail(resolver, makeContext({}));
        await runFromDetail(resolver, makeContext({}), true);

        expect(dataHandedTo(seams.executeAIAgent)).toEqual(ORDINARY);
        expect(dataHandedTo(seams.executeAgentInBackground)).toEqual(ORDINARY);
    });

    it('are dropped for a widget guest although its run executes as the system user', async () => {
        const { resolver } = makeResolver();
        hoisted.resolveWidgetGuestRunContext.mockResolvedValue({
            ElevatedUser: SYSTEM_USER,
            Widget: {},
            PinnedAgentId: 'pinned-agent',
        });

        await runFromDetail(resolver, makeContext({ email: GUEST.Email, userRecord: GUEST }));

        const params = hoisted.runAgentInConversation.mock.calls[0][0] as { contextUser: { ID: string }; data: Record<string, unknown> };
        expect(params.contextUser.ID).toBe(SYSTEM_USER.ID); // the premise: the run is elevated
        expect(params.data).toEqual(ORDINARY);
    });

    it('are kept, byte for byte, for the system user', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });

        await runFromDetail(resolver, makeContext({ isSystemUser: true, email: SYSTEM_USER.Email, userRecord: SYSTEM_USER }));

        expect(seams.executeAIAgent.mock.calls[0][7]).toBe(CLIENT_DATA);
    });
});

describe('RunAIAgentSystemUser — reserved run-data keys', () => {
    it('are kept for the system user it admits', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
        const ctx = makeContext({ isSystemUser: true, email: SYSTEM_USER.Email, userRecord: SYSTEM_USER });

        await resolver.RunAIAgentSystemUser('agent-1', ctx, '[]', 'session-1', pubSub, CLIENT_DATA);

        expect(seams.executeAIAgent.mock.calls[0][7]).toBe(CLIENT_DATA);
    });
});
