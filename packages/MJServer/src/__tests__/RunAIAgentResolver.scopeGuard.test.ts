/**
 * @fileoverview Which scope-limited sessions may dispatch an agent through
 * `RunAIAgentFromConversationDetail`.
 *
 * The public web widget's guest is the one guest this mutation serves: its agent is pinned by the
 * widget instance and runs under a trusted server principal. Every other scope-limited session — a
 * resource-scoped magic link, or an anonymous guest whose widget cannot be resolved — is refused
 * before anything loads, because its RLS scope bounds neither which agent runs nor what it does.
 */
import 'reflect-metadata'; // must precede any type-graphql decorator evaluation
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

// Same harness as RunAIAgentResolver.historyFrom.test.ts: the schema is irrelevant, so every
// type-graphql decorator is a no-op.
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
    resolveWidgetGuest: vi.fn(),
    elevate: vi.fn(),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {},
    ArtifactToolManager: class {},
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: hoisted.resolveWidgetGuest,
    ElevateUserPayload: hoisted.elevate,
}));

import { UserInfo } from '@memberjunction/core';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

type Fn = ReturnType<typeof vi.fn>;

/** The private members this test reaches, through an explicit shape (no `any`). */
interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
}

const PINNED_AGENT_ID = 'pinned-agent';

function user(kind: 'ordinary' | 'anonymous' | 'scoped'): UserInfo {
    const u = new UserInfo();
    u.ID = 'user-1';
    u.Email = 'user@example.com';
    if (kind === 'anonymous') {
        u.IsMagicLinkAnonymous = true;
    }
    if (kind === 'scoped') {
        u.MagicLinkScope = { ResourceID: 'resource-1' };
    }
    return u;
}

function setup(caller: UserInfo) {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([]);
    seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });

    const getEntityObject = vi.fn().mockResolvedValue({ ConversationID: 'conv-1', Load: vi.fn().mockResolvedValue(true) });
    const ctx = {
        userPayload: { sessionId: 'session-1', email: caller.Email, userRecord: caller } as UserPayload,
        providers: [{ type: 'Read-Write', provider: { GetEntityObject: getEntityObject } }],
        dataSource: {},
    } as unknown as AppContext;
    return { resolver, seams, ctx, getEntityObject };
}

const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;

function dispatch(resolver: RunAIAgentResolver, ctx: AppContext) {
    return resolver.RunAIAgentFromConversationDetail('detail-1', 'client-chosen-agent', ctx, 'session-1', pubSub);
}

beforeEach(() => {
    hoisted.resolveWidgetGuest.mockResolvedValue(null);
    hoisted.elevate.mockImplementation((payload: UserPayload) => ({ ...payload, isSystemUser: true }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('RunAIAgentFromConversationDetail — scope-limited sessions', () => {
    it.each(['anonymous', 'scoped'] as const)('refuses a %s session that is not a resolved widget guest, before loading anything', async (kind) => {
        const { resolver, seams, ctx, getEntityObject } = setup(user(kind));

        const result = await dispatch(resolver, ctx);

        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('not available to scope-limited sessions');
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(seams.executeAIAgent).not.toHaveBeenCalled();
    });

    it('dispatches a widget guest to the PINNED agent, never the client-supplied one', async () => {
        const guest = user('anonymous');
        hoisted.resolveWidgetGuest.mockResolvedValue({ ElevatedUser: user('ordinary'), PinnedAgentId: PINNED_AGENT_ID });
        const { resolver, seams, ctx } = setup(guest);

        const result = await dispatch(resolver, ctx);

        expect(result.success).toBe(true);
        expect(seams.executeAIAgent).toHaveBeenCalledTimes(1);
        expect(seams.executeAIAgent.mock.calls[0][2]).toBe(PINNED_AGENT_ID);
    });

    it('does not affect an ordinary authenticated user', async () => {
        const { resolver, seams, ctx } = setup(user('ordinary'));

        const result = await dispatch(resolver, ctx);

        expect(result.success).toBe(true);
        expect(seams.executeAIAgent.mock.calls[0][2]).toBe('client-chosen-agent');
    });
});
