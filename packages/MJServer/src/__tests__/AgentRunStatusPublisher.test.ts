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
