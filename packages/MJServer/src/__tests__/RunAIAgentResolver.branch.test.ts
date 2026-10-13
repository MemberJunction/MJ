/**
 * @fileoverview The conversation branch on `RunAIAgentFromConversationDetail`.
 *
 * The branch comes from the placeholder row the mutation is given, never from a request argument.
 * These tests pin that the mutation loads history along that branch's path, hands the branch to the
 * agent run on both the synchronous and fire-and-forget paths, and reads the trunk when the row has
 * no branch; and that `executeAIAgent` puts the branch on the run's params only when there is one.
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
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
    },
    ArtifactToolManager: class {},
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { ConversationEngine } from '@memberjunction/core-entities';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const USER = { ID: 'user-1', Email: 'user@example.com' };

type Fn = ReturnType<typeof vi.fn>;

/** The private members this test reaches, through an explicit shape (no `any`). */
interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    executeAIAgent: Fn;
    executeAgentInBackground: Fn;
    loadInputArtifactsBatch: Fn;
    validateAgent: Fn;
    persistInFlightAgentFailure: Fn;
}

function makeResolver(): { resolver: RunAIAgentResolver; seams: ResolverSeams } {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn().mockReturnValue(USER);
    return { resolver, seams };
}

function makeContext(branchId: string | null): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({
            ConversationID: 'conv-1',
            BranchID: branchId,
            Load: vi.fn().mockResolvedValue(true),
        }),
    };
    return {
        userPayload: { sessionId: 'session-1', userRecord: USER } as unknown as UserPayload,
        providers: [{ type: 'Read-Write', provider }],
        dataSource: {},
    } as unknown as AppContext;
}

const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;

async function runMutation(resolver: RunAIAgentResolver, branchId: string | null, fireAndForget?: boolean) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', makeContext(branchId), 'session-1', pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, fireAndForget, undefined, undefined, undefined
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgentFromConversationDetail — branch', () => {
    let resolver: RunAIAgentResolver;
    let seams: ResolverSeams;

    beforeEach(() => {
        ({ resolver, seams } = makeResolver());
        seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([]);
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
        seams.executeAgentInBackground = vi.fn();
    });

    it('loads history on the placeholder row\'s branch and hands the branch to the run', async () => {
        await runMutation(resolver, 'branch-b');
        expect(seams.loadConversationHistoryWithAttachments.mock.calls[0][6]).toBe('branch-b');
        expect(seams.executeAIAgent.mock.calls[0].at(-1)).toBe('branch-b');
    });

    it('passes the branch to the background path too', async () => {
        await runMutation(resolver, 'branch-b', true);
        expect(seams.executeAgentInBackground.mock.calls[0].at(-1)).toBe('branch-b');
    });

    it('reads the trunk when the placeholder has no branch (control)', async () => {
        await runMutation(resolver, null);
        expect(seams.loadConversationHistoryWithAttachments.mock.calls[0][6]).toBeNull();
        expect(seams.executeAIAgent.mock.calls[0].at(-1)).toBeNull();
    });
});

describe('loadConversationHistoryWithAttachments — branch', () => {
    it('passes the branch to the fresh loader', async () => {
        const { resolver, seams } = makeResolver();
        seams.loadInputArtifactsBatch = vi.fn().mockResolvedValue(new Map());
        const loadRows = vi.spyOn(ConversationEngine, 'LoadWindowRowsFresh').mockResolvedValue([]);
        const provider = {};
        const load = (resolver as unknown as {
            loadConversationHistoryWithAttachments(
                conversationId: string, user: unknown, max: number, provider: unknown,
                exclude?: string[], historyFrom?: Date, branchId?: string | null
            ): Promise<unknown[]>;
        }).loadConversationHistoryWithAttachments.bind(resolver);
        await load('conv-1', USER, 20, provider, ['detail-1'], undefined, 'branch-b');
        expect(loadRows).toHaveBeenCalledWith('conv-1', USER, provider, undefined, 'branch-b');
    });
});

describe('executeAIAgent — ConversationBranchID', () => {
    it('puts the branch on the run\'s params, and leaves it unset for the trunk', async () => {
        const { resolver, seams } = makeResolver();
        seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Test Agent' });
        seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
        hoisted.runAgentInConversation.mockReset().mockRejectedValue(new Error('stop here'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const execute = (resolver as unknown as { executeAIAgent(...args: unknown[]): Promise<unknown> }).executeAIAgent.bind(resolver);
        const userPayload = { sessionId: 'session-1', userRecord: USER };
        const base = [
            {}, {}, 'agent-1', userPayload, '[{"role":"user","content":"hi"}]', 'session-1', pubSub,
            undefined, undefined, undefined, undefined, undefined, undefined, 'detail-1', false, false,
            undefined, undefined, 'conv-1', undefined, undefined, undefined, undefined, undefined,
        ];
        await execute(...base, 'branch-b');
        await execute(...base, null);
        const [withBranch, trunk] = hoisted.runAgentInConversation.mock.calls.map(c => c[0] as Record<string, unknown>);
        expect(withBranch.ConversationBranchID).toBe('branch-b');
        expect(trunk).not.toHaveProperty('ConversationBranchID');
    });
});
