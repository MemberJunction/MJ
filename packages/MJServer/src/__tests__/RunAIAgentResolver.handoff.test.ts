/**
 * @fileoverview Server-side agent handoff execution in `RunAIAgentResolver` (VS-SAGE-3).
 *
 * Verifies:
 * - `handoffChain: []` is passed on `ExecuteAgentParams` for interactive user sessions in
 *   `RunAIAgentFromConversationDetail` and `RunAIAgent`.
 * - `handoffChain` is absent for API-key callers, widget guests, guest/widget users without an
 *   explicit host allow-list, and `RunAIAgentSystemUser`.
 * - `AgentRunner.FollowHandoffs` is invoked when the source run returns a `handoff` decision.
 * - `pubSub.publish` ordering across a handoff hop: source frames → source `complete` inside
 *   `OnHopStart` (after the target placeholder row is created) → target frames → target `complete`
 *   with the target's detail ID.
 * - `OnHopEnd` runs post-execution notifications for the hop.
 * - `sanitizeAgentResult` preserves `handoff` on the serialized result.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import type { FollowHandoffsInput } from '@memberjunction/ai-agents';

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
    followHandoffs: vi.fn(),
    resolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    elevateUserPayload: vi.fn(),
}));

vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-agents')>();
    return {
        ...actual,
        AgentRunner: class {
            RunAgentInConversation(...args: unknown[]) {
                return hoisted.runAgentInConversation(...args);
            }
            FollowHandoffs(...args: unknown[]) {
                return hoisted.followHandoffs(...args);
            }
        },
        ArtifactToolManager: class {},
    };
});

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: (...args: unknown[]) => hoisted.resolveWidgetGuestRunContext(...args),
    ElevateUserPayload: (...args: unknown[]) => hoisted.elevateUserPayload(...args),
}));

import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const USER = { ID: 'user-1', Email: 'user@example.com' };

type Fn = ReturnType<typeof vi.fn>;

interface ResolverSeams {
    CheckAPIKeyScopeAuthorization: Fn;
    GetUserFromPayload: Fn;
    loadConversationHistoryWithAttachments: Fn;
    findChainablePredecessor: Fn;
    validateAgent: Fn;
    persistInFlightAgentFailure: Fn;
    sendFeedbackRequestNotification: Fn;
}

function makeResolver(userOverride: Record<string, unknown> = USER): {
    resolver: RunAIAgentResolver;
    seams: ResolverSeams;
} {
    const resolver = new RunAIAgentResolver();
    const seams = resolver as unknown as ResolverSeams;
    seams.CheckAPIKeyScopeAuthorization = vi.fn().mockResolvedValue(undefined);
    seams.GetUserFromPayload = vi.fn().mockReturnValue(userOverride);
    seams.loadConversationHistoryWithAttachments = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Build a product launch video' },
    ]);
    seams.findChainablePredecessor = vi.fn().mockResolvedValue(null);
    seams.validateAgent = vi.fn().mockResolvedValue({ ID: 'agent-sage', Name: 'Sage' });
    seams.persistInFlightAgentFailure = vi.fn().mockResolvedValue(undefined);
    seams.sendFeedbackRequestNotification = vi.fn().mockResolvedValue(undefined);
    return { resolver, seams };
}

function makeContext(payloadOverrides: Record<string, unknown> = {}): AppContext {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({
            ConversationID: 'conv-1',
            BranchID: null,
            Load: vi.fn().mockResolvedValue(true),
        }),
    };
    return {
        userPayload: {
            sessionId: 'session-1',
            userRecord: USER,
            ...payloadOverrides,
        } as unknown as UserPayload,
        providers: [{ type: 'Read-Write', provider }],
        dataSource: {},
    } as unknown as AppContext;
}

function parseEnvelopes(publish: Fn): Array<Record<string, unknown>> {
    return publish.mock.calls.map(
        (call) => JSON.parse((call[1] as { message: string }).message) as Record<string, unknown>,
    );
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    hoisted.runAgentInConversation.mockReset();
    hoisted.followHandoffs.mockReset();
    hoisted.resolveWidgetGuestRunContext.mockReset().mockResolvedValue(null);
    hoisted.elevateUserPayload.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAIAgentResolver — handoffChain gating', () => {
    const defaultAgentReturn = {
        agentResult: {
            success: true,
            agentRun: {
                ID: 'run-sage',
                ConversationDetailID: 'detail-sage',
                Steps: [],
                GetAll: () => ({ ID: 'run-sage', ConversationDetailID: 'detail-sage', Agent: 'Sage' }),
            },
        },
        agentResponseDetailId: 'detail-sage',
        conversationId: 'conv-1',
    };

    it('passes handoffChain: [] for an interactive user in RunAIAgentFromConversationDetail and RunAIAgent', async () => {
        hoisted.runAgentInConversation.mockResolvedValue(defaultAgentReturn);
        const { resolver } = makeResolver();
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;

        await resolver.RunAIAgentFromConversationDetail(
            'detail-user', 'agent-sage', makeContext(), 'session-1', pubSub,
        );

        const fromDetailParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
        expect(fromDetailParams.handoffChain).toEqual([]);

        hoisted.runAgentInConversation.mockClear();
        await resolver.RunAIAgent(
            'agent-sage', makeContext(), '[{"role":"user","content":"hi"}]', 'session-1', pubSub,
        );

        const directParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
        expect(directParams.handoffChain).toEqual([]);
        expect(hoisted.followHandoffs).not.toHaveBeenCalled();
    });

    it('omits handoffChain for an API-key caller, a widget guest, and RunAIAgentSystemUser', async () => {
        hoisted.runAgentInConversation.mockResolvedValue(defaultAgentReturn);
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;

        // 1. API-key caller on RunAIAgentFromConversationDetail
        {
            const { resolver } = makeResolver();
            await resolver.RunAIAgentFromConversationDetail(
                'detail-user',
                'agent-sage',
                makeContext({ apiKeyHash: 'mj_sk_hash_123' }),
                'session-1',
                pubSub,
            );
            const apiKeyParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
            expect(apiKeyParams.handoffChain).toBeUndefined();
        }

        // 2. API-key caller on RunAIAgent
        hoisted.runAgentInConversation.mockClear();
        {
            const { resolver } = makeResolver();
            await resolver.RunAIAgent(
                'agent-sage',
                makeContext({ apiKeyHash: 'mj_sk_hash_123' }),
                '[{"role":"user","content":"hi"}]',
                'session-1',
                pubSub,
            );
            const apiKeyDirectParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
            expect(apiKeyDirectParams.handoffChain).toBeUndefined();
        }

        // 3. Widget guest on RunAIAgentFromConversationDetail
        hoisted.runAgentInConversation.mockClear();
        {
            const elevatedPayload = { sessionId: 'session-1', userRecord: { ID: 'sys-user', Email: 'sys@example.com' } };
            hoisted.resolveWidgetGuestRunContext.mockResolvedValue({
                PinnedAgentId: 'agent-pinned',
                ElevatedUser: elevatedPayload.userRecord,
            });
            hoisted.elevateUserPayload.mockReturnValue(elevatedPayload);
            const { resolver } = makeResolver();
            await resolver.RunAIAgentFromConversationDetail(
                'detail-user',
                'agent-sage',
                makeContext(),
                'session-1',
                pubSub,
            );
            const widgetParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
            expect(widgetParams.handoffChain).toBeUndefined();
        }

        // 4. Magic-link / guest-hosted user without a host allow-list
        hoisted.runAgentInConversation.mockClear();
        {
            const { resolver } = makeResolver({ ...USER, IsMagicLinkAnonymous: true });
            await resolver.RunAIAgent(
                'agent-sage',
                makeContext(),
                '[{"role":"user","content":"hi"}]',
                'session-1',
                pubSub,
            );
            const guestParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
            expect(guestParams.handoffChain).toBeUndefined();
        }

        // 5. RunAIAgentSystemUser
        hoisted.runAgentInConversation.mockClear();
        {
            const { resolver } = makeResolver();
            await resolver.RunAIAgentSystemUser(
                'agent-sage',
                makeContext(),
                '[{"role":"user","content":"hi"}]',
                'session-1',
                pubSub,
            );
            const sysParams = hoisted.runAgentInConversation.mock.calls[0][0] as Record<string, unknown>;
            expect(sysParams.handoffChain).toBeUndefined();
        }
    });
});

describe('RunAIAgentResolver — FollowHandoffs & PubSub ordering', () => {
    it('follows a returned handoff, publishes source complete after the target row in OnHopStart, then target frames and target complete with handoff preserved on sanitized results', async () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub = { publish } as unknown as PubSubEngine;
        const { resolver, seams } = makeResolver();

        const sageRun = {
            ID: 'run-sage',
            ConversationDetailID: 'detail-sage',
            Message: 'Handing off to Director.',
            Steps: [],
            GetAll: () => ({ ID: 'run-sage', ConversationDetailID: 'detail-sage', Agent: 'Sage', Message: 'Handing off to Director.' }),
        };
        const directorRun = {
            ID: 'run-director',
            ConversationDetailID: 'detail-director',
            Message: 'Here is the completed 15s product launch teaser.',
            Steps: [],
            GetAll: () => ({ ID: 'run-director', ConversationDetailID: 'detail-director', Agent: 'Director', Message: 'Here is the completed 15s product launch teaser.' }),
        };
        const handoffPayload = {
            targetAgentId: 'agent-director',
            targetAgentName: 'Director',
            reason: 'Ready to produce video',
            brief: 'Produce a 15s vertical product launch teaser.',
            message: 'Handing off to Director.',
        };

        const timeline: string[] = [];

        hoisted.runAgentInConversation.mockImplementation(async (params: {
            onProgress?: (progress: { step: string; message?: string; percentage?: number; metadata?: Record<string, unknown> }) => void;
        }) => {
            params.onProgress?.({
                step: 'prompt_execution',
                message: 'Routing request',
                percentage: 50,
                metadata: { agentRun: sageRun, agentName: 'Sage' },
            });
            return {
                agentResult: {
                    success: true,
                    agentRun: sageRun,
                    payload: { routed: true },
                    handoff: handoffPayload,
                } as unknown as ExecuteAgentResult,
                agentResponseDetailId: 'detail-sage',
                conversationId: 'conv-1',
            };
        });

        hoisted.followHandoffs.mockImplementation(async (input: FollowHandoffsInput) => {
            // Simulate AgentRunner.FollowHandoffs creating the target placeholder row BEFORE firing OnHopStart.
            timeline.push('target-row-created:detail-director');

            const hopInfo = {
                hopIndex: 0,
                sourceAgent: { ID: 'agent-sage', Name: 'Sage' } as never,
                sourceConversationDetailId: input.sourceConversationDetailId,
                targetAgent: { ID: 'agent-director', Name: 'Director' } as never,
                targetConversationDetailId: 'detail-director',
                preset: null,
                presetSource: 'None' as const,
                handoff: handoffPayload,
            };

            const callbacks = await input.hooks?.OnHopStart?.(
                hopInfo,
                {
                    agentResult: input.sourceResult,
                    conversationDetailId: input.sourceConversationDetailId,
                },
            );

            // Stream a progress frame and a streaming token from the target hop through the returned callbacks.
            callbacks?.onProgress?.({
                step: 'prompt_execution',
                message: 'Generating storyboard',
                percentage: 60,
                metadata: { agentRun: directorRun, agentName: 'Director' },
            });
            callbacks?.onStreaming?.({
                content: 'Scene 1: ',
                isComplete: false,
                stepType: 'prompt',
                kind: 'final-response',
            });

            const finalHopResult = {
                success: true,
                agentRun: directorRun,
                payload: { scenes: 3 },
                feedbackRequestId: 'req-hop-1',
            } as unknown as ExecuteAgentResult;

            const outcome = {
                hopIndex: 0,
                targetAgent: { ID: 'agent-director', Name: 'Director' } as never,
                targetConversationDetailId: 'detail-director',
                preset: null,
                presetSource: 'None' as const,
                agentResult: finalHopResult,
            };

            await input.hooks?.OnHopEnd?.(hopInfo, outcome);

            return [outcome];
        });

        publish.mockImplementation(async (_topic: string, wrapper: { message: string }) => {
            const parsed = JSON.parse(wrapper.message) as {
                data: { type: string; conversationDetailId?: string; agentRunId?: string };
            };
            timeline.push(`pubsub:${parsed.data.type}:${parsed.data.conversationDetailId ?? parsed.data.agentRunId ?? ''}`);
        });

        const response = await resolver.RunAIAgentFromConversationDetail(
            'detail-user', 'agent-sage', makeContext(), 'session-1', pubSub,
        );

        expect(response.success).toBe(true);
        expect(hoisted.followHandoffs).toHaveBeenCalledTimes(1);

        // Synchronous return value stays tied to the source detail so the sync client path does not
        // overwrite the source detail with the target hop's message (VS-QA-3 item 5).
        const returnedPayload = JSON.parse(response.result!) as {
            agentRun?: { ID?: string; ConversationDetailID?: string; Message?: string };
            handoff?: unknown;
        };
        expect(returnedPayload.agentRun?.ID).toBe('run-sage');
        expect(returnedPayload.agentRun?.ConversationDetailID).toBe('detail-sage');
        expect(returnedPayload.agentRun?.Message).toBe('Handing off to Director.');
        expect(returnedPayload.handoff).toEqual(handoffPayload);

        expect(timeline).toEqual([
            'pubsub:progress:run-sage',
            'target-row-created:detail-director',
            'pubsub:partial_result:run-sage',
            'pubsub:complete:detail-sage',
            'pubsub:progress:run-director',
            'pubsub:streaming:run-director',
            'pubsub:partial_result:run-director',
            'pubsub:complete:detail-director',
        ]);

        // Verify the source completion frame's serialized result carries `handoff`
        const envelopes = parseEnvelopes(publish);
        const sourceComplete = envelopes.find(
            (env) => (env.data as { type?: string; conversationDetailId?: string }).type === 'complete'
                && (env.data as { conversationDetailId?: string }).conversationDetailId === 'detail-sage',
        );
        expect(sourceComplete).toBeDefined();
        const sourceCompleteResult = JSON.parse((sourceComplete!.data as { result: string }).result) as Record<string, unknown>;
        expect(sourceCompleteResult.handoff).toEqual(handoffPayload);

        // Verify target completion frame carries the target's detail ID
        const targetComplete = envelopes.find(
            (env) => (env.data as { type?: string; conversationDetailId?: string }).type === 'complete'
                && (env.data as { conversationDetailId?: string }).conversationDetailId === 'detail-director',
        );
        expect(targetComplete).toBeDefined();
        expect((targetComplete!.data as { agentRunId: string }).agentRunId).toBe('run-director');

        // Verify OnHopEnd triggered post-execution notifications for the hop
        expect(seams.sendFeedbackRequestNotification).toHaveBeenCalledTimes(1);
    });

    it('preserves mutated sourceResult.agentRun.Message (refusal notice) in returned and published results when FollowHandoffs refuses hop 0', async () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub = { publish } as unknown as PubSubEngine;
        const { resolver } = makeResolver();

        const sageRun: {
            ID: string;
            ConversationDetailID: string;
            Message: string;
            Steps: unknown[];
            GetAll: () => Record<string, unknown>;
        } = {
            ID: 'run-sage',
            ConversationDetailID: 'detail-sage',
            Message: 'Here is my analysis.',
            Steps: [],
            GetAll: () => ({ ID: 'run-sage', ConversationDetailID: 'detail-sage', Agent: 'Sage', Message: sageRun.Message }),
        };
        const handoffPayload = {
            targetAgentId: 'agent-director',
            targetAgentName: 'Director',
            brief: 'Brief',
        };

        hoisted.runAgentInConversation.mockResolvedValue({
            agentResult: {
                success: true,
                agentRun: sageRun,
                handoff: handoffPayload,
            } as unknown as ExecuteAgentResult,
            agentResponseDetailId: 'detail-sage',
            conversationId: 'conv-1',
        });

        const refusalNotice =
            "Here is my analysis.\n\nI couldn't transfer you to Director: The current user does not have permission to run Director.";
        hoisted.followHandoffs.mockImplementation(async (input: FollowHandoffsInput) => {
            if (input.sourceResult.agentRun) {
                input.sourceResult.agentRun.Message = refusalNotice;
            }
            return [];
        });

        const response = await resolver.RunAIAgentFromConversationDetail(
            'detail-user', 'agent-sage', makeContext(), 'session-1', pubSub,
        );

        const returnedPayload = JSON.parse(response.result!) as {
            agentRun?: { Message?: string };
        };
        expect(returnedPayload.agentRun?.Message).toBe(refusalNotice);

        const envelopes = parseEnvelopes(publish);
        const sourceComplete = envelopes.find(
            (env) => (env.data as { type?: string; conversationDetailId?: string }).type === 'complete'
                && (env.data as { conversationDetailId?: string }).conversationDetailId === 'detail-sage',
        );
        expect(sourceComplete).toBeDefined();
        const publishedResult = JSON.parse((sourceComplete!.data as { result: string }).result) as {
            agentRun?: { Message?: string };
        };
        expect(publishedResult.agentRun?.Message).toBe(refusalNotice);
    });

    it('publishes a failure completion frame for the failing hop and does not re-publish the source completion when a hop fails after OnHopStart', async () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub = { publish } as unknown as PubSubEngine;
        const { resolver } = makeResolver();

        const sageRun = {
            ID: 'run-sage',
            ConversationDetailID: 'detail-sage',
            Steps: [],
            GetAll: () => ({ ID: 'run-sage', ConversationDetailID: 'detail-sage', Agent: 'Sage' }),
        };
        const handoffPayload = {
            targetAgentId: 'agent-director',
            targetAgentName: 'Director',
            reason: 'Ready to produce video',
            brief: 'Produce a 15s vertical product launch teaser.',
        };

        hoisted.runAgentInConversation.mockResolvedValue({
            agentResult: {
                success: true,
                agentRun: sageRun,
                handoff: handoffPayload,
            } as unknown as ExecuteAgentResult,
            agentResponseDetailId: 'detail-sage',
            conversationId: 'conv-1',
        });

        hoisted.followHandoffs.mockImplementation(async (input: FollowHandoffsInput) => {
            const hopInfo = {
                hopIndex: 0,
                sourceAgent: { ID: 'agent-sage', Name: 'Sage' } as never,
                sourceConversationDetailId: input.sourceConversationDetailId,
                targetAgent: { ID: 'agent-director', Name: 'Director' } as never,
                targetConversationDetailId: 'detail-director',
                preset: null,
                presetSource: 'None' as const,
                handoff: handoffPayload,
            };

            await input.hooks?.OnHopStart?.(hopInfo, {
                agentResult: input.sourceResult,
                conversationDetailId: input.sourceConversationDetailId,
            });

            const failedOutcome = {
                hopIndex: 0,
                targetAgent: { ID: 'agent-director', Name: 'Director' } as never,
                targetConversationDetailId: 'detail-director',
                preset: null,
                presetSource: 'None' as const,
                error: 'Model rate limit exceeded',
            };
            await input.hooks?.OnHopEnd?.(hopInfo, failedOutcome);
            return [failedOutcome];
        });

        const response = await resolver.RunAIAgentFromConversationDetail(
            'detail-user', 'agent-sage', makeContext(), 'session-1', pubSub,
        );

        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('Model rate limit exceeded');

        const envelopes = parseEnvelopes(publish);
        const completeFrames = envelopes.filter(
            (env) => (env.data as { type?: string }).type === 'complete',
        );
        expect(completeFrames).toHaveLength(2);
        expect(completeFrames[0].data).toMatchObject({
            type: 'complete',
            success: true,
            conversationDetailId: 'detail-sage',
        });
        expect(completeFrames[1].data).toMatchObject({
            type: 'complete',
            success: false,
            conversationDetailId: 'detail-director',
            errorMessage: 'Model rate limit exceeded',
        });
    });

    it('passes unmutated conversationMessages into FollowHandoffs even when the source RunAgentInConversation mutates its copy in place', async () => {
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;
        const { resolver } = makeResolver();

        const sageRun = {
            ID: 'run-sage',
            ConversationDetailID: 'detail-sage',
            Steps: [],
            GetAll: () => ({ ID: 'run-sage', ConversationDetailID: 'detail-sage', Agent: 'Sage' }),
        };
        const handoffPayload = {
            targetAgentId: 'agent-director',
            targetAgentName: 'Director',
            brief: 'Brief',
        };

        hoisted.runAgentInConversation.mockImplementation(async (params: {
            conversationMessages: Array<{ role: string; content: unknown }>;
        }) => {
            params.conversationMessages.push({
                role: 'user',
                content: 'Retrying due to: invalid JSON',
            });
            return {
                agentResult: {
                    success: true,
                    agentRun: sageRun,
                    handoff: handoffPayload,
                } as unknown as ExecuteAgentResult,
                agentResponseDetailId: 'detail-sage',
                conversationId: 'conv-1',
            };
        });

        let followHandoffsMessages: unknown;
        hoisted.followHandoffs.mockImplementation(async (input: FollowHandoffsInput) => {
            followHandoffsMessages = input.params.conversationMessages;
            return [];
        });

        await resolver.RunAIAgentFromConversationDetail(
            'detail-user', 'agent-sage', makeContext(), 'session-1', pubSub,
        );

        expect(followHandoffsMessages).toEqual([
            { role: 'user', content: 'Build a product launch video' },
        ]);
    });

    it('preserves handoff in sanitizeAgentResult when returned directly', () => {
        const { resolver } = makeResolver();
        const sanitize = (resolver as unknown as {
            sanitizeAgentResult(r: unknown): Record<string, unknown>;
        }).sanitizeAgentResult.bind(resolver);

        const handoff = {
            targetAgentId: 'agent-director',
            targetAgentName: 'Director',
            reason: 'User asked for video',
            brief: 'Create a 15s spot',
        };
        const sanitized = sanitize({
            success: true,
            payload: { ok: true },
            handoff,
        });

        expect(sanitized.handoff).toEqual(handoff);
    });
});
