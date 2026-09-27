import { describe, it, expect, beforeEach } from 'vitest';
import { Outcome, type SubscriptionBinding, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateServiceBusFunctionHandler, UnsettledMessageError } from '../functions/CreateServiceBusFunctionHandler';
import type { FunctionsInvocationContextLike, FunctionsMessageActions, FunctionsServiceBusMessage } from '../functions/functionTypes';
import { ParseSubscriptionBindingEnv } from '../functions/bindingEnv';
import { DEAD_LETTER_PROPERTIES, RUNTIME_PROPERTIES } from '../properties';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestAzureResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

const r = TestAzureResources(false);
let bus: FakeServiceBus;
let binding: SubscriptionBinding;
let calls: string[];
let script: Map<string, WorkOutcome>;
let settlements: string[];
let metrics: string[];

class ScriptedHandler implements WorkHandler {
    public async Handle(message: WorkMessage): Promise<WorkOutcome> {
        calls.push(message.MessageID);
        return script.get(message.MessageID) ?? Outcome.Complete();
    }
}

function actions(failWith?: Error): FunctionsMessageActions {
    const record = (name: string) => async (): Promise<void> => {
        if (failWith) {
            throw failWith;
        }
        settlements.push(name);
    };
    return { complete: record('complete'), abandon: record('abandon'), deadLetter: async (_m, o) => { if (failWith) throw failWith; settlements.push(`deadLetter:${o.deadLetterReason}:${o.propertiesToModify?.[DEAD_LETTER_PROPERTIES.Attempts]}`); } };
}

function context(a: FunctionsMessageActions, remainingMs = 60_000): FunctionsInvocationContextLike {
    return { actions: a, remainingTimeMs: () => remainingMs, invocationId: 'inv-1' };
}

function triggered(index: number, properties: Record<string, unknown> = {}, body?: unknown): FunctionsServiceBusMessage {
    const message = TestMessage(index);
    return {
        messageId: message.MessageID, body: body ?? JSON.stringify(message), applicationProperties: { ...message.Attributes, ...properties },
        deliveryCount: 1, lockToken: `lt-${index}`, enqueuedTimeUtc: new Date(bus.Now), lockedUntilUtc: new Date(bus.Now + 60_000), sequenceNumber: index,
    };
}

beforeEach(() => {
    bus = new FakeServiceBus();
    binding = TestSubscriptionBinding(false);
    SeedValidAzureResources(bus, TestTopicBinding(false), binding);
    calls = [];
    script = new Map();
    settlements = [];
    metrics = [];
});

function handler(): ReturnType<typeof CreateServiceBusFunctionHandler> {
    return CreateServiceBusFunctionHandler(() => new ScriptedHandler(), { Binding: binding, Sender: bus, EmitMetrics: (l) => metrics.push(l), Now: () => bus.Now, Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined } });
}

describe('CreateServiceBusFunctionHandler', () => {
    it('runs the handler and completes the message', async () => {
        await handler()(triggered(1), context(actions()));
        expect(calls).toEqual([TestMessage(1).MessageID]);
        expect(settlements).toEqual(['complete']);
        expect(JSON.parse(metrics[0])).toMatchObject({ Namespace: 'MJ/WorkQueue', Subscription: 'email.unsubscribe', Processed: 1, Completed: 1 });
    });

    it('retries by scheduling a targeted copy and completing the original', async () => {
        script.set(TestMessage(2).MessageID, Outcome.Retry('busy', 30));
        await handler()(triggered(2), context(actions()));
        expect(settlements).toEqual(['complete']);
        const [copy] = bus.Messages(r.TopicName, r.SubscriptionName);
        expect(copy.Properties).toMatchObject({ [RUNTIME_PROPERTIES.Target]: 'email.unsubscribe', [RUNTIME_PROPERTIES.Attempt]: '2' });
        expect(copy.VisibleAt).toBe(bus.Now + 30_000);
        expect(JSON.parse(metrics[0]).Retried).toBe(1);
    });

    it('dead-letters a fatal outcome with the runtime properties', async () => {
        script.set(TestMessage(3).MessageID, Outcome.DeadLetter('Poison'));
        await handler()(triggered(3), context(actions()));
        expect(settlements).toEqual(['deadLetter:Poison:1']);
    });

    it('dead-letters a body that is not an envelope without calling the handler', async () => {
        await handler()(triggered(4, {}, 'garbage'), context(actions()));
        expect(calls).toEqual([]);
        expect(settlements).toEqual(['deadLetter:InvalidEnvelope:1']);
        expect(JSON.parse(metrics[0]).DeadLettered).toBe(1);
    });

    it('throws so the host abandons the message when settlement fails', async () => {
        const failing = actions(Object.assign(new Error('busy'), { code: 'ServiceBusy', retryable: true }));
        await expect(handler()(triggered(5), context(failing))).rejects.toBeInstanceOf(UnsettledMessageError);
        expect(JSON.parse(metrics[0]).Failed).toBe(1);
    });

    it('reads its binding from the environment once', async () => {
        const env = { MJ_WQ_SUBSCRIPTION: JSON.stringify({ Policy: binding.Policy, Filter: null, HostType: 'External', Config: binding.Config }) };
        const parsed = ParseSubscriptionBindingEnv(env.MJ_WQ_SUBSCRIPTION);
        expect(parsed.Policy.SubscriptionName).toBe('email.unsubscribe');
        const fn = CreateServiceBusFunctionHandler(() => new ScriptedHandler(), { Env: env, Sender: bus, EmitMetrics: () => undefined, Now: () => bus.Now, Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined } });
        await fn(triggered(6), context(actions()));
        expect(settlements).toEqual(['complete']);
        expect(() => ParseSubscriptionBindingEnv(undefined)).toThrow('environment variable is not set');
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ Policy: { ...binding.Policy, PartitionMode: 'Ordered' }, Filter: null, HostType: 'External', Config: binding.Config }))).toThrow('Ordered requires the Database transport');
    });
});
