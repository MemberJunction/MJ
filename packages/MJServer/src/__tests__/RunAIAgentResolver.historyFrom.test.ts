/**
 * @fileoverview The agent's history floor on `RunAIAgentFromConversationDetail`.
 *
 * `agentHistoryFrom` is the one server change behind the conversations host rules: an optional
 * ISO-8601 timestamp, the first moment of the conversation a run may read. These tests pin that
 * the mutation parses it before anything loads, fails the request on an unreadable value instead
 * of dropping it, loads history from it (in the query AND in the window assembly), and hands it to
 * the agent run as `ConversationHistoryFrom` on both the synchronous and fire-and-forget paths —
 * and that leaving it out changes nothing.
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

const FLOOR_ISO = '2026-09-01T12:00:00.000Z';
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

function makeContext(): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({
            ConversationID: 'conv-1',
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

async function runMutation(
    resolver: RunAIAgentResolver,
    options: { agentHistoryFrom?: string; fireAndForget?: boolean }
) {
    return resolver.RunAIAgentFromConversationDetail(
        'detail-1', 'agent-1', makeContext(), 'session-1', pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, options.fireAndForget, undefined, undefined,
        options.agentHistoryFrom
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgentFromConversationDetail — agentHistoryFrom', () => {
    let resolver: RunAIAgentResolver;
    let seams: ResolverSeams;

    beforeEach(() => {
        ({ resolver, seams } = makeResolver());
        seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([]);
        seams.executeAIAgent = vi.fn().mockResolvedValue({ success: true, result: '{}' });
        seams.executeAgentInBackground = vi.fn();
    });

    it('loads history from the floor and hands the floor to the run', async () => {
        const result = await runMutation(resolver, { agentHistoryFrom: FLOOR_ISO });

        expect(result.success).toBe(true);
        const loaderArgs = seams.loadConversationHistoryWithAttachments.mock.calls[0];
        expect(loaderArgs[0]).toBe('conv-1');
        expect(loaderArgs[4]).toEqual(['detail-1']);
        expect((loaderArgs[5] as Date).toISOString()).toBe(FLOOR_ISO);
        const runFloor = seams.executeAIAgent.mock.calls[0].at(-1) as Date;
        expect(runFloor.toISOString()).toBe(FLOOR_ISO);
    });

    it('hands the floor to a fire-and-forget run too', async () => {
        const result = await runMutation(resolver, { agentHistoryFrom: FLOOR_ISO, fireAndForget: true });

        expect(result.success).toBe(true);
        expect(seams.executeAIAgent).not.toHaveBeenCalled();
        const runFloor = seams.executeAgentInBackground.mock.calls[0].at(-1) as Date;
        expect(runFloor.toISOString()).toBe(FLOOR_ISO);
    });

    it('left out, reads the whole conversation as before', async () => {
        await runMutation(resolver, {});

        expect(seams.loadConversationHistoryWithAttachments.mock.calls[0][5]).toBeUndefined();
        expect(seams.executeAIAgent.mock.calls[0].at(-1)).toBeUndefined();
    });

    it('fails the request on an unreadable floor, before loading or running anything', async () => {
        const result = await runMutation(resolver, { agentHistoryFrom: 'last tuesday' });

        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('agentHistoryFrom');
        expect(seams.loadConversationHistoryWithAttachments).not.toHaveBeenCalled();
        expect(seams.executeAIAgent).not.toHaveBeenCalled();
        expect(seams.executeAgentInBackground).not.toHaveBeenCalled();
    });

    it('treats an empty string as unreadable too, never as "no floor"', async () => {
        const result = await runMutation(resolver, { agentHistoryFrom: '' });

        expect(result.success).toBe(false);
        expect(seams.executeAIAgent).not.toHaveBeenCalled();
    });
});

describe('loadConversationHistoryWithAttachments — history floor', () => {
    it('passes the floor to the fresh loader and to the window assembly', async () => {
        const { resolver, seams } = makeResolver();
        seams.loadInputArtifactsBatch = vi.fn().mockResolvedValue(new Map());
        const loadRows = vi.spyOn(ConversationEngine, 'LoadWindowRowsFresh').mockResolvedValue([]);
        const assemble = vi.spyOn(ConversationEngine, 'AssembleContextWindow');
        const floor = new Date(FLOOR_ISO);
        const provider = {};

        const load = (resolver as unknown as {
            loadConversationHistoryWithAttachments(
                conversationId: string, user: unknown, max: number, provider: unknown, exclude?: string[], historyFrom?: Date
            ): Promise<unknown[]>;
        }).loadConversationHistoryWithAttachments.bind(resolver);
        await load('conv-1', USER, 20, provider, ['detail-1'], floor);

        expect(loadRows).toHaveBeenCalledWith('conv-1', USER, provider, floor);
        expect(assemble.mock.calls[0][1]).toEqual({ maxTailMessages: 20, excludeDetailIds: ['detail-1'], historyFrom: floor });
    });
});

function executeArgs(conversationHistoryFrom?: Date): unknown[] {
    const userPayload = { sessionId: 'session-1', userRecord: USER };
    return [
        {}, {}, 'agent-1', userPayload, '[{"role":"user","content":"hi"}]', 'session-1', pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined, 'detail-1', false, false,
        undefined, undefined, 'conv-1', undefined, undefined, undefined, undefined,
        conversationHistoryFrom,
    ];
}

describe('executeAIAgent — ConversationHistoryFrom', () => {
    function wire() {
        const { resolver, seams } = makeResolver();
        seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Test Agent' });
        seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
        // Stop right after the params are captured — the rest of the run is out of scope, and so
        // is the failure it logs.
        hoisted.runAgentInConversation.mockReset().mockRejectedValue(new Error('stop here'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const execute = (resolver as unknown as {
            executeAIAgent(...args: unknown[]): Promise<{ success: boolean }>;
        }).executeAIAgent.bind(resolver);
        return execute;
    }

    it('puts the floor on the run\'s params', async () => {
        const execute = wire();
        const floor = new Date(FLOOR_ISO);
        await execute(...executeArgs(floor));

        const params = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
        expect(params.ConversationHistoryFrom).toBe(floor);
    });

    it('leaves it unset without a floor', async () => {
        const execute = wire();
        await execute(...executeArgs());

        const params = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
        expect(params.ConversationHistoryFrom).toBeUndefined();
    });
});

describe('executeAIAgent — status publishing', () => {
    const agentRun = {
        ID: 'run-1',
        ConversationDetailID: 'detail-1',
        Steps: [{ StepName: 'Answer' }],
        GetAll: () => ({ ID: 'run-1', ConversationDetailID: 'detail-1', Agent: 'Betty' }),
    };

    function envelopes(publish: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
        return publish.mock.calls.map((call) => JSON.parse((call[1] as { message: string }).message) as Record<string, unknown>);
    }

    it('publishes progress, streamed text, the partial result, and the completion from the runner callbacks', async () => {
        const { resolver, seams } = makeResolver();
        seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-1', Name: 'Test Agent' });
        seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const publish = vi.fn().mockResolvedValue(undefined);
        (pubSub as unknown as { publish: Fn }).publish = publish;
        hoisted.runAgentInConversation.mockReset().mockImplementation(async (params: {
            onProgress?: (progress: { step: string; message?: string; percentage?: number; metadata?: Record<string, unknown> }) => void;
            onStreaming?: (chunk: { content: string; isComplete: boolean; stepType?: string; kind?: string }) => void;
        }) => {
            params.onProgress?.({ step: 'initialization', message: 'noise', metadata: { agentRun } });
            params.onProgress?.({
                step: 'prompt_execution',
                message: 'Writing',
                percentage: 40,
                metadata: { agentRun, agentName: 'Betty' },
            });
            params.onStreaming?.({ content: 'Hel', isComplete: false, stepType: 'prompt', kind: 'final-response' });
            return {
                agentResult: { success: true, agentRun, payload: { text: 'Hello' } },
                agentResponseDetailId: 'detail-1',
                conversationId: 'conv-1',
            };
        });
        const execute = (resolver as unknown as {
            executeAIAgent(...args: unknown[]): Promise<{ success: boolean }>;
        }).executeAIAgent.bind(resolver);

        const result = await execute(...executeArgs());

        expect(result.success).toBe(true);
        const sent = envelopes(publish);
        expect(sent.map((row) => (row.data as { type: string }).type)).toEqual([
            'progress',
            'streaming',
            'partial_result',
            'complete',
        ]);
        expect(sent[0].type).toBe('ExecutionProgress');
        expect(sent[0].resolver).toBe('RunAIAgentResolver');
        expect((sent[1].data as { streaming: { content: string } }).streaming.content).toBe('Hel');
        const completion = sent[3].data as { conversationDetailId: string; agentRunId: string; success: boolean };
        expect(completion.conversationDetailId).toBe('detail-1');
        expect(completion.agentRunId).toBe('run-1');
        expect(completion.success).toBe(true);
    });

    it('publishes a failure completion when a fire-and-forget run rejects', async () => {
        const { resolver, seams } = makeResolver();
        seams.executeAIAgent = vi.fn().mockRejectedValue(new Error('background blew up'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const publish = vi.fn().mockResolvedValue(undefined);
        const localPubSub = { publish } as unknown as PubSubEngine;
        const userPayload = { sessionId: 'session-1', userRecord: USER };
        const runInBackground = (resolver as unknown as {
            executeAgentInBackground(...args: unknown[]): void;
        }).executeAgentInBackground.bind(resolver);

        runInBackground(
            {}, {}, 'agent-1', userPayload, '[]', 'session-1', localPubSub,
            undefined, undefined, undefined, undefined, undefined, 'detail-1',
        );
        await vi.waitFor(() => expect(publish).toHaveBeenCalled());

        const sent = envelopes(publish);
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe('StreamingContent');
        expect(sent[0].resolver).toBe('RunAIAgentResolver');
        const completion = sent[0].data as {
            type: string;
            agentRunId: string;
            conversationDetailId: string;
            success: boolean;
            errorMessage: string;
            result: string;
        };
        expect(completion).toMatchObject({
            type: 'complete',
            agentRunId: 'unknown',
            conversationDetailId: 'detail-1',
            success: false,
            errorMessage: 'background blew up',
            result: JSON.stringify({ success: false, errorMessage: 'background blew up' }),
        });
    });
});
