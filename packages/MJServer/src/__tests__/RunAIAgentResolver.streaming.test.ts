/**
 * @fileoverview Wire-shape tests for RunAIAgentResolver's streaming callback.
 *
 * The conversation client (ConversationsRuntime's ConversationStreaming) parses the
 * exact JSON this resolver publishes to the PushStatusUpdates topic — in particular
 * `data.type === 'streaming'` and `data.streaming.{content,isPartial,kind}`. These
 * tests pin the published shape so the server and client can't silently drift
 * (the client's own parsing of this same shape is pinned in
 * packages/ConversationsRuntime/src/__tests__/ConversationStreaming.test.ts).
 */
import 'reflect-metadata'; // must precede any type-graphql decorator evaluation
import { describe, it, expect, vi } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

// type-graphql's real decorators need emitDecoratorMetadata to infer field types
// (`@Field() success: boolean`), which vitest's esbuild transform does not emit.
// The GraphQL schema is irrelevant here — no-op every decorator so the resolver
// module can be imported and its streaming callback exercised directly.
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
import type { AgentExecutionStreamingCallback } from '@memberjunction/ai-core-plus';

import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { UserPayload } from '../types.js';

/** Access the private factory without widening the class's public API. */
interface StreamingCallbackFactory {
    createStreamingCallback(
        pubSub: PubSubEngine,
        sessionId: string,
        userPayload: UserPayload,
        agentRunRef: { current: unknown }
    ): AgentExecutionStreamingCallback;
}

function buildHarness() {
    const publish = vi.fn().mockResolvedValue(undefined);
    const pubSub = { publish } as unknown as PubSubEngine;
    const userPayload = { sessionId: 'session-1' } as UserPayload;
    const agentRunRef = {
        current: {
            ID: 'run-1',
            GetAll: () => ({ ID: 'run-1', ConversationDetailID: 'detail-1', Agent: 'Betty' }),
        },
    };
    const resolver = new RunAIAgentResolver() as unknown as StreamingCallbackFactory;
    const callback = resolver.createStreamingCallback(pubSub, 'session-1', userPayload, agentRunRef);
    return { publish, callback };
}

/** Parse the published envelope back out of the pubSub.publish mock. */
function publishedData(publish: ReturnType<typeof vi.fn>): Record<string, unknown> {
    expect(publish).toHaveBeenCalledOnce();
    const envelope = publish.mock.calls[0][1] as { message: string };
    const parsed = JSON.parse(envelope.message) as Record<string, unknown>;
    expect(parsed.type).toBe('StreamingContent');
    expect(parsed.resolver).toBe('RunAIAgentResolver');
    return parsed.data as Record<string, unknown>;
}

describe('RunAIAgentResolver.createStreamingCallback', () => {
    it('publishes the streaming wire shape the conversation client parses', () => {
        const { publish, callback } = buildHarness();

        callback({ content: 'Hel', isComplete: false, stepType: 'prompt', modelName: 'gpt-x', kind: 'final-response' });

        const data = publishedData(publish);
        expect(data.type).toBe('streaming');
        expect(data.agentRunId).toBe('run-1');
        expect((data.agentRun as Record<string, unknown>).ConversationDetailID).toBe('detail-1');
        expect(data.streaming).toMatchObject({
            content: 'Hel',
            isPartial: true,
            stepName: 'prompt',
            kind: 'final-response',
        });
    });

    it('maps isComplete=true to isPartial=false on the final chunk', () => {
        const { publish, callback } = buildHarness();

        callback({ content: '', isComplete: true, kind: 'final-response' });

        const data = publishedData(publish);
        expect((data.streaming as Record<string, unknown>).isPartial).toBe(false);
    });

    it('passes an absent kind through untouched — unmarked raw streams must stay unrendered', () => {
        // Guard rail: if the resolver ever defaults unmarked chunks to a renderable
        // kind (e.g. `chunk.kind ?? 'final-response'` left in from local testing),
        // every Loop agent's raw JSON envelope would render into chat bubbles.
        // This test fails the moment such a fallback exists.
        const { publish, callback } = buildHarness();

        callback({ content: '{"taskComplete":', isComplete: false, stepType: 'prompt' });

        const data = publishedData(publish);
        expect((data.streaming as Record<string, unknown>).kind).toBeUndefined();
    });

    it('does not publish when no agent run is available yet', () => {
        const publish = vi.fn();
        const pubSub = { publish } as unknown as PubSubEngine;
        const resolver = new RunAIAgentResolver() as unknown as StreamingCallbackFactory;
        const callback = resolver.createStreamingCallback(
            pubSub,
            'session-1',
            { sessionId: 'session-1' } as UserPayload,
            { current: null }
        );
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            callback({ content: 'early', isComplete: false });
            expect(publish).not.toHaveBeenCalled();
        } finally {
            consoleSpy.mockRestore();
        }
    });
});
