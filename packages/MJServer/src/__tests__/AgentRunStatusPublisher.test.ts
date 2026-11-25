/**
 * Pins the status messages RunAIAgentResolver publishes for one run, and shows a host
 * driving the same publisher into ConversationStreaming.
 *
 * The wire assertions are the contract the resolver already published before this class
 * existed: a significant step and not a noise step, streamed text, the partial result,
 * then the completion.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: { Instance: { PushStatusUpdates: vi.fn() } },
}));

import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { ConversationStreaming, type IConversationsRuntimeContext } from '@memberjunction/conversations-runtime';
import { AgentRunStatusPublisher } from '../resolvers/AgentRunStatusPublisher.js';
import { StatusUpdatesFilter, type PushStatusNotificationPayload } from '../generic/PushStatusResolver.js';
import type { UserPayload } from '../types.js';

const run = {
    ID: 'run-1',
    ConversationDetailID: 'detail-1',
    ErrorMessage: undefined as string | undefined,
    Steps: [{ StepName: 'Answer' }],
    GetAll: () => ({ ID: 'run-1', ConversationDetailID: 'detail-1', Agent: 'Betty' }),
};

function publisher() {
    const publish = vi.fn().mockResolvedValue(undefined);
    const pubSub = { publish } as unknown as PubSubEngine;
    const userPayload = { sessionId: 'session-1', userRecord: { ID: 'user-1' } } as UserPayload;
    return { publish, made: new AgentRunStatusPublisher(pubSub, userPayload, 'session-1') };
}

function envelopes(publish: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
    return publish.mock.calls.map((call) => {
        const payload = call[1] as { message: string; sessionId: string; ownerUserId: string };
        expect(payload.sessionId).toBe('session-1');
        expect(payload.ownerUserId).toBe('user-1');
        return JSON.parse(payload.message) as Record<string, unknown>;
    });
}

describe('AgentRunStatusPublisher', () => {
    it('stamps the reply row on every message when it has one, so a reconnecting client can find its row', () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub = { publish } as unknown as PubSubEngine;
        const userPayload = { sessionId: 'session-1', userRecord: { ID: 'user-1' } } as UserPayload;
        const made = new AgentRunStatusPublisher(pubSub, userPayload, 'session-1', 'reply-7');
        const runWithoutDetail = { ...run, ConversationDetailID: undefined, GetAll: () => ({ ID: 'run-1' }) };

        made.OnProgress({ step: 'prompt_execution', message: 'Writing', metadata: { agentRun: runWithoutDetail } });
        made.OnStreaming({ content: 'Hel', isComplete: false, stepType: 'prompt', kind: 'final-response' });
        made.PublishFinal({ success: true, agentRun: runWithoutDetail } as unknown as ExecuteAgentResult);

        const details = envelopes(publish).map((row) => (row.data as { conversationDetailId?: string }).conversationDetailId);
        expect(details).toEqual(['reply-7', 'reply-7', 'reply-7', 'reply-7']);
    });

    it('leaves progress and streaming messages without a reply row when it has none, as before', () => {
        const { publish, made } = publisher();

        made.OnProgress({ step: 'prompt_execution', message: 'Writing', metadata: { agentRun: run } });
        made.OnStreaming({ content: 'Hel', isComplete: false, stepType: 'prompt', kind: 'final-response' });

        const sent = envelopes(publish).map((row) => row.data as Record<string, unknown>);
        expect(sent.every((data) => !('conversationDetailId' in data))).toBe(true);
    });

    it('publishes the resolver sequence: a significant step, streamed text, the partial result, then the completion', () => {
        const { publish, made } = publisher();

        made.OnProgress({ step: 'initialization', message: 'noise', metadata: { agentRun: run } });
        made.OnProgress({
            step: 'prompt_execution',
            message: 'Writing',
            percentage: 40,
            metadata: { agentRun: run, agentName: 'Betty' },
        });
        made.OnStreaming({ content: 'Hel', isComplete: false, stepType: 'prompt', kind: 'final-response' });
        made.PublishFinal({ success: true, agentRun: run, payload: { text: 'Hello' } } as ExecuteAgentResult, 'detail-1', '{"text":"Hello"}');

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
        expect((sent[2].data as { partialResult: { currentStep: string } }).partialResult.currentStep).toBe('Answer');
        const completion = sent[3].data as { type: string; conversationDetailId: string; result: string; agentRunId: string };
        expect(completion.conversationDetailId).toBe('detail-1');
        expect(completion.agentRunId).toBe('run-1');
        expect(completion.result).toBe('{"text":"Hello"}');
    });

    it('stamps the reply row on the completion when that id differs from the run', () => {
        const { publish, made } = publisher();
        made.PublishFinal(
            { success: true, agentRun: run, payload: { text: 'Hello' } } as ExecuteAgentResult,
            'reply-9',
            '{"text":"Hello"}',
        );

        const sent = envelopes(publish);
        const completion = sent[sent.length - 1].data as { type: string; conversationDetailId: string; agentRunId: string };
        expect(completion.type).toBe('complete');
        expect(completion.conversationDetailId).toBe('reply-9');
        expect(completion.agentRunId).toBe('run-1');
        expect(run.ConversationDetailID).toBe('detail-1');
    });

    it('publishes a failure completion when there is no run', () => {
        const { publish, made } = publisher();
        made.PublishFailure('detail-1', 'background blew up');

        const sent = envelopes(publish);
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe('StreamingContent');
        const completion = sent[0].data as {
            type: string;
            agentRunId: string;
            conversationDetailId: string;
            success: boolean;
            errorMessage: string;
            result: string;
        };
        expect(completion.type).toBe('complete');
        expect(completion.agentRunId).toBe('unknown');
        expect(completion.conversationDetailId).toBe('detail-1');
        expect(completion.success).toBe(false);
        expect(completion.errorMessage).toBe('background blew up');
        expect(completion.result).toBe(JSON.stringify({ success: false, errorMessage: 'background blew up' }));
    });

    it('logs when a significant step or a streamed chunk arrives before any run', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { publish, made } = publisher();

        made.OnProgress({ step: 'initialization', message: 'noise' });
        made.OnProgress({ step: 'prompt_execution', message: 'Writing' });
        made.OnStreaming({ content: 'Hel', isComplete: false });

        expect(publish).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith('❌ No agent run available for progress callback');
        expect(error).toHaveBeenCalledWith('❌ No agent run available for streaming callback');
        expect(error).toHaveBeenCalledTimes(2);
        error.mockRestore();
    });

    it('routes a host publisher progress and completion to the reply row', async () => {
        const { publish, made } = publisher();
        made.OnProgress({
            step: 'action_execution',
            message: 'Looking',
            percentage: 10,
            metadata: { agentRun: run },
        });
        made.PublishFinal({ success: true, agentRun: run } as ExecuteAgentResult, 'detail-1', '{"ok":true}');

        const streaming = new ConversationStreaming({
            Notification: { Notify: vi.fn() },
            Tasks: { RemoveByAgentRunId: vi.fn().mockReturnValue(false) },
        } as IConversationsRuntimeContext);
        const onReply = vi.fn();
        streaming.registerMessageCallback('detail-1', onReply);
        const completions: Array<{ conversationDetailId: string; agentRunId: string }> = [];
        streaming.CompletionEvents$.subscribe((event) => completions.push(event));

        const deliver = streaming as unknown as {
            handlePushStatusUpdate(status: unknown): Promise<void>;
        };
        for (const message of envelopes(publish)) {
            await deliver.handlePushStatusUpdate(message);
        }

        expect(onReply).toHaveBeenCalledOnce();
        expect(onReply.mock.calls[0][0].conversationDetailId).toBe('detail-1');
        expect(onReply.mock.calls[0][0].message).toBe('Looking');
        expect(completions).toEqual([{ conversationDetailId: 'detail-1', agentRunId: 'run-1', success: true, errorMessage: undefined }]);
        expect(streaming.GetRecentCompletion('detail-1')?.agentRunId).toBe('run-1');
    });
});

describe('AgentRunStatusPublisher — a widget guest elevated to the system user (#4931)', () => {
    const GUEST = { ID: 'anonymous-user', IsMagicLinkAnonymous: true, AnonymousVisitorID: 'sid-a', MagicLinkScope: { ResourceID: 'sid-a' } };
    const SYSTEM = { ID: 'system-user' };

    it("stamps the guest (ElevatedFrom), not the elevated user, so the guest's own socket receives the run's events", () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const elevated = { sessionId: 'session-1', userRecord: SYSTEM, isSystemUser: true, ElevatedFrom: GUEST } as unknown as UserPayload;
        const made = new AgentRunStatusPublisher({ publish } as unknown as PubSubEngine, elevated, 'session-1');

        made.PublishFinal({ success: true, agentRun: run, payload: { text: 'Hello' } } as ExecuteAgentResult, 'detail-1', '{"text":"Hello"}');
        made.PublishFailure('detail-1', 'boom');

        const owners = publish.mock.calls.map((call) => (call[1] as { ownerUserId: string }).ownerUserId);
        expect(owners.length).toBeGreaterThan(0);
        // An anonymous visitor's owner key carries its scope identity, so another visitor cannot receive these events.
        expect(owners.every((owner) => owner === 'anonymous-user|sid-a')).toBe(true);
        const guestConnection = { userPayload: { sessionId: 'session-1', userRecord: GUEST } as unknown as UserPayload };
        for (const call of publish.mock.calls) {
            expect(StatusUpdatesFilter({ payload: call[1] as PushStatusNotificationPayload, args: { sessionId: 'session-1' }, context: guestConnection })).toBe(true);
        }
    });
});

describe('AgentRunStatusPublisher — streaming chunk coalescing', () => {
    it('coalesces high-frequency OnStreaming tokens over the 25ms window with ordered concatenation', () => {
        vi.useFakeTimers();
        try {
            const publish = vi.fn().mockResolvedValue(undefined);
            const pubSub = { publish } as unknown as PubSubEngine;
            const userPayload = { sessionId: 'session-1', userRecord: { ID: 'user-1' } } as UserPayload;
            const made = new AgentRunStatusPublisher(pubSub, userPayload, 'session-1');

            made.OnProgress({ step: 'initialization', message: 'init', metadata: { agentRun: run } });
            publish.mockClear();

            // Rapid burst of 10 tokens inside <25ms: leading token publishes immediately, next 9 coalesce into 1 publish
            const tokens = ['T0 ', 'T1 ', 'T2 ', 'T3 ', 'T4 ', 'T5 ', 'T6 ', 'T7 ', 'T8 ', 'T9'];
            for (const token of tokens) {
                made.OnStreaming({ content: token, isComplete: false, stepType: 'prompt', kind: 'final-response' });
                vi.advanceTimersByTime(2);
            }

            // Before 25ms window expires, only the leading-edge token was published
            expect(publish).toHaveBeenCalledTimes(1);

            // Advance past the 25ms window -> buffered 9 tokens flush as a single message
            vi.advanceTimersByTime(10);
            expect(publish).toHaveBeenCalledTimes(2);

            const sent = envelopes(publish);
            const firstChunk = (sent[0].data as { streaming: { content: string; isPartial: boolean } }).streaming;
            const secondChunk = (sent[1].data as { streaming: { content: string; isPartial: boolean } }).streaming;
            expect(firstChunk.content).toBe('T0 ');
            expect(firstChunk.isPartial).toBe(true);
            expect(secondChunk.content).toBe('T1 T2 T3 T4 T5 T6 T7 T8 T9');
            expect(secondChunk.isPartial).toBe(true);
            expect(firstChunk.content + secondChunk.content).toBe(tokens.join(''));
        } finally {
            vi.useRealTimers();
        }
    });

    it('flushes buffered tokens immediately on isComplete=true, metadata/step change, OnProgress, and Dispose', () => {
        vi.useFakeTimers();
        try {
            const publish = vi.fn().mockResolvedValue(undefined);
            const pubSub = { publish } as unknown as PubSubEngine;
            const userPayload = { sessionId: 'session-1', userRecord: { ID: 'user-1' } } as UserPayload;
            const made = new AgentRunStatusPublisher(pubSub, userPayload, 'session-1');

            made.OnProgress({ step: 'initialization', message: 'init', metadata: { agentRun: run } });
            publish.mockClear();

            // 1. Metadata change (kind/stepType) flushes pending buffer synchronously before publishing new segment
            made.OnStreaming({ content: 'A', isComplete: false, stepType: 'prompt', kind: 'thinking' });
            made.OnStreaming({ content: 'B', isComplete: false, stepType: 'prompt', kind: 'thinking' });
            made.OnStreaming({ content: 'C', isComplete: false, stepType: 'prompt', kind: 'final-response' });
            expect(publish).toHaveBeenCalledTimes(2); // 'A' (leading) + 'B' (flushed on kind change)
            expect(envelopes(publish).map((e) => (e.data as { streaming: { content: string; kind?: string } }).streaming)).toEqual([
                expect.objectContaining({ content: 'A', kind: 'thinking' }),
                expect.objectContaining({ content: 'B', kind: 'thinking' }),
            ]);

            // 2. isComplete=true flushes immediately with isPartial=false
            made.OnStreaming({ content: 'D', isComplete: true, stepType: 'prompt', kind: 'final-response' });
            expect(publish).toHaveBeenCalledTimes(3);
            const completed = envelopes(publish)[2].data as { streaming: { content: string; isPartial: boolean } };
            expect(completed.streaming.content).toBe('CD');
            expect(completed.streaming.isPartial).toBe(false);

            // 3. Significant OnProgress flushes any buffered tokens first
            vi.advanceTimersByTime(30);
            made.OnStreaming({ content: 'X', isComplete: false, stepType: 'prompt', kind: 'final-response' });
            made.OnStreaming({ content: 'Y', isComplete: false, stepType: 'prompt', kind: 'final-response' });
            made.OnProgress({ step: 'action_execution', message: 'Tool', metadata: { agentRun: run } });
            const afterProgress = envelopes(publish).slice(3);
            expect(afterProgress.map((e) => (e.data as { type: string }).type)).toEqual(['streaming', 'streaming', 'progress']);
            expect((afterProgress[1].data as { streaming: { content: string } }).streaming.content).toBe('Y');

            // 4. Dispose flushes buffered tokens and clears timers safely (disconnect safety)
            vi.advanceTimersByTime(30);
            made.OnStreaming({ content: 'Z1', isComplete: false, stepType: 'prompt' });
            made.OnStreaming({ content: 'Z2', isComplete: false, stepType: 'prompt' });
            expect(vi.getTimerCount()).toBe(1);
            made.Dispose();
            const finalSent = envelopes(publish);
            expect((finalSent[finalSent.length - 1].data as { streaming: { content: string } }).streaming.content).toBe('Z2');
            expect(vi.getTimerCount()).toBe(0);

            // Advancing timers after Dispose fires zero extra ghost publishes
            const countAtDispose = publish.mock.calls.length;
            vi.advanceTimersByTime(1000);
            expect(publish).toHaveBeenCalledTimes(countAtDispose);
        } finally {
            vi.useRealTimers();
        }
    });

    it('isolates interleaved runs and preserves monotonic flush ordering on model/step changes', () => {
        vi.useFakeTimers();
        try {
            const publish = vi.fn().mockResolvedValue(undefined);
            const pubSub = { publish } as unknown as PubSubEngine;
            const userPayload = { sessionId: 'session-1', userRecord: { ID: 'user-1' } } as UserPayload;
            const made = new AgentRunStatusPublisher(pubSub, userPayload, 'session-1');

            const runA = { ...run, ID: 'run-A' };
            const runB = { ...run, ID: 'run-B' };

            made.OnProgress({ step: 'initialization', message: 'init A', metadata: { agentRun: runA } });
            publish.mockClear();

            // Run A leading chunk + buffered chunk
            made.OnStreaming({ content: 'A1-', isComplete: false, stepType: 'prompt', modelName: 'model-1' });
            made.OnStreaming({ content: 'A2-', isComplete: false, stepType: 'prompt', modelName: 'model-1' });
            // Model change inside same run flushes 'A2-' before buffering 'A3'
            made.OnStreaming({ content: 'A3', isComplete: false, stepType: 'prompt', modelName: 'model-2' });
            // Switching to Run B via OnProgress flushes Run A's buffered 'A3' under run-A before Run B emits
            made.OnProgress({ step: 'prompt_execution', message: 'run B starts', metadata: { agentRun: runB } });
            made.OnStreaming({ content: 'B1', isComplete: false, stepType: 'prompt', modelName: 'model-2' });
            made.Dispose();

            const events = envelopes(publish).map((e) => e.data as {
                type: string;
                agentRunId: string;
                streaming?: { content: string; modelName?: string };
                progress?: { currentStep: string };
            });

            expect(events.map((e) => [e.type, e.agentRunId, e.streaming?.content ?? e.progress?.currentStep])).toEqual([
                ['streaming', 'run-A', 'A1-'],
                ['streaming', 'run-A', 'A2-'],
                ['streaming', 'run-A', 'A3'],
                ['progress', 'run-B', 'prompt_execution'],
                ['streaming', 'run-B', 'B1'],
            ]);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});
