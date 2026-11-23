import { describe, it, expect, beforeEach } from 'vitest';
import { Outcome, type SubscriptionBinding, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateServiceBusFunctionHandler } from '../functions/CreateServiceBusFunctionHandler';
import type { AzureFunctionInvocationContext, AzureFunctionServiceBusMessage } from '../functions/functionsTypes';
import { FakeServiceBusGateway } from '../testing/fakes';
import { TestAzureResources, TestAzureSubscriptionBinding, TestMessage } from '../testing/fixtures';

let fake: FakeServiceBusGateway;
let binding: SubscriptionBinding;
let calls: string[];
let script: Map<string, WorkOutcome>;
let metrics: string[];

class ScriptedHandler implements WorkHandler {
    public async Handle(message: WorkMessage): Promise<WorkOutcome> {
        calls.push(message.MessageID);
        return script.get(message.MessageID) ?? Outcome.Complete();
    }
}

function setup(requiresSession: boolean): void {
    const r = TestAzureResources(requiresSession);
    fake = new FakeServiceBusGateway()
        .AddTopic(r.ServiceBusTopicName)
        .AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: requiresSession, LockDurationSeconds: 120 });
    binding = TestAzureSubscriptionBinding(requiresSession);
    calls = [];
    script = new Map();
    metrics = [];
}

async function batchEvent(
    requiresSession: boolean,
    items: { index: number; sessionId?: string; body?: string }[],
): Promise<AzureFunctionServiceBusMessage[]> {
    const r = TestAzureResources(requiresSession);
    const created: AzureFunctionServiceBusMessage[] = [];
    for (const item of items) {
        const msg = TestMessage(item.index);
        await fake.Send(r.ServiceBusTopicName, {
            MessageId: msg.MessageID,
            Body: item.body ?? JSON.stringify(msg),
            ApplicationProperties: msg.Attributes,
            ...(requiresSession ? { SessionId: item.sessionId ?? `s-${item.index}` } : {}),
        });
    }
    const received = await fake.Receive({
        TopicName: r.ServiceBusTopicName,
        SubscriptionName: r.SubscriptionName,
        RequiresSession: requiresSession,
        MaxMessages: 32,
        MaxWaitTimeMs: 0,
    });
    for (const rec of received) {
        created.push({
            messageId: rec.MessageId,
            lockToken: rec.LockToken,
            deliveryCount: rec.DeliveryCount,
            sessionId: rec.SessionId ?? undefined,
            body: rec.Body,
            applicationProperties: rec.ApplicationProperties,
        });
    }
    return created;
}

function createHandler(throwOnSingle = true) {
    return CreateServiceBusFunctionHandler(() => new ScriptedHandler(), {
        Binding: binding,
        Gateway: fake,
        Now: () => fake.Now,
        EmitMetrics: (line) => metrics.push(line),
        TimeoutSafetyMs: 10_000,
        ThrowOnSingleMessageFailure: throwOnSingle,
    });
}

beforeEach(() => setup(true));

describe('CreateServiceBusFunctionHandler', () => {
    it('completes single and batch messages and emits structured telemetry', async () => {
        const batch = await batchEvent(true, [{ index: 1 }, { index: 2 }]);
        const response = await createHandler()(batch, { getRemainingTimeInMillis: () => 60_000 });
        expect(response).toEqual({ batchItemFailures: [] });
        expect(fake.Messages(TestAzureResources(true).ServiceBusTopicName, TestAzureResources(true).SubscriptionName)).toHaveLength(0);
        expect(JSON.parse(metrics[0])).toMatchObject({ Subscription: 'email.unsubscribe', Processed: 2, Completed: 2 });
    });

    it('handles single-message v4 trigger where body is parsed JSON and metadata is on triggerMetadata', async () => {
        setup(false);
        const payload = TestMessage(10);
        const context: AzureFunctionInvocationContext = {
            invocationId: 'inv-1',
            triggerMetadata: {
                messageId: payload.MessageID,
                lockToken: 'azfn-lt-1',
                deliveryCount: 1,
                applicationProperties: { eventType: 'unsubscribe' },
            },
            getRemainingTimeInMillis: () => 60_000,
        };
        const standalone = CreateServiceBusFunctionHandler(() => new ScriptedHandler(), {
            Binding: binding,
            EmitMetrics: (line) => metrics.push(line),
        });
        expect(await standalone(payload, context)).toEqual({ batchItemFailures: [] });
        expect(calls).toEqual([payload.MessageID]);
    });

    it('stops a session group at a retry and releases followers in the same batch', async () => {
        // Construct batch containing two messages from session 'a' and one from session 'b'
        const r = TestAzureResources(true);
        await fake.Send(r.ServiceBusTopicName, { MessageId: TestMessage(1).MessageID, Body: JSON.stringify(TestMessage(1)), ApplicationProperties: {}, SessionId: 'a' });
        await fake.Send(r.ServiceBusTopicName, { MessageId: TestMessage(3).MessageID, Body: JSON.stringify(TestMessage(3)), ApplicationProperties: {}, SessionId: 'b' });
        const firstBatch = await fake.Receive({ TopicName: r.ServiceBusTopicName, SubscriptionName: r.SubscriptionName, RequiresSession: true, MaxMessages: 10, MaxWaitTimeMs: 0 });
        const synthetic: AzureFunctionServiceBusMessage[] = [
            { messageId: firstBatch[0].MessageId, lockToken: firstBatch[0].LockToken, deliveryCount: 1, sessionId: 'a', body: firstBatch[0].Body, applicationProperties: {} },
            { messageId: TestMessage(2).MessageID, lockToken: 'lt-follower', deliveryCount: 1, sessionId: 'a', body: JSON.stringify(TestMessage(2)), applicationProperties: {} },
            { messageId: firstBatch[1].MessageId, lockToken: firstBatch[1].LockToken, deliveryCount: 1, sessionId: 'b', body: firstBatch[1].Body, applicationProperties: {} },
        ];
        script.set(TestMessage(1).MessageID, Outcome.Retry('not ready', 0));
        const response = await createHandler()(synthetic, { getRemainingTimeInMillis: () => 60_000 });
        expect(response.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(calls).toContain(TestMessage(1).MessageID);
        expect(calls).toContain(TestMessage(3).MessageID);
        expect(calls).not.toContain(TestMessage(2).MessageID);
        expect(JSON.parse(metrics[0])).toMatchObject({ Retried: 1, NotStarted: 1, Completed: 1 });
    });

    it('dead-letters explicit DeadLetter outcomes and malformed poison payloads without failing the batch', async () => {
        const batch = await batchEvent(true, [{ index: 1 }, { index: 2, body: 'invalid-json' }]);
        script.set(TestMessage(1).MessageID, Outcome.DeadLetter('bad address'));
        expect(await createHandler()(batch, { getRemainingTimeInMillis: () => 60_000 })).toEqual({ batchItemFailures: [] });
        const dlqs = fake.DeadLetters(TestAzureResources(true).ServiceBusTopicName, TestAzureResources(true).SubscriptionName);
        expect(dlqs.map((d) => d.DeadLetterReason).sort()).toEqual(['InvalidEnvelope', 'bad address']);
        expect(calls).toEqual([TestMessage(1).MessageID]);
    });

    it('throws on single-message retry/failure when ThrowOnSingleMessageFailure is enabled', async () => {
        setup(false);
        const [msg] = await batchEvent(false, [{ index: 1 }]);
        script.set(TestMessage(1).MessageID, Outcome.Retry('later', 0));
        await expect(createHandler(true)(msg, { getRemainingTimeInMillis: () => 60_000 })).rejects.toThrow();
        const response = await createHandler(false)(msg, { getRemainingTimeInMillis: () => 60_000 });
        expect(response.batchItemFailures).toEqual([{ itemIdentifier: TestMessage(1).MessageID }]);
    });

    it('stops starting messages near timeout and validates MJ_WQ_SUBSCRIPTION env', async () => {
        const batch = await batchEvent(true, [{ index: 1 }, { index: 2 }]);
        const response = await createHandler()(batch, { getRemainingTimeInMillis: () => 5_000 });
        expect(response.batchItemFailures).toHaveLength(2);
        expect(calls).toEqual([]);

        const fromEnv = CreateServiceBusFunctionHandler(() => new ScriptedHandler(), {
            Env: { MJ_WQ_SUBSCRIPTION: JSON.stringify(binding) },
            Gateway: fake,
            Now: () => fake.Now,
            EmitMetrics: () => undefined,
        });
        expect(await fromEnv(await batchEvent(true, [{ index: 3 }]), { getRemainingTimeInMillis: () => 60_000 })).toEqual({ batchItemFailures: [] });

        const missing = CreateServiceBusFunctionHandler(() => new ScriptedHandler(), {
            Env: {},
            Gateway: fake,
            EmitMetrics: () => undefined,
        });
        await expect(missing([], { getRemainingTimeInMillis: () => 60_000 })).rejects.toThrow('MJ_WQ_SUBSCRIPTION');
    });
});
