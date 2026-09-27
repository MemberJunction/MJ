import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { DEAD_LETTER_PROPERTIES, RUNTIME_PROPERTIES } from '../properties';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestAzureResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

const r = TestAzureResources(false);
const signal = new AbortController().signal;
let bus: FakeServiceBus;
let binding: SubscriptionBinding;
let operator: AzureTransportOperator;
let consumer: ServiceBusTransportConsumer;

async function publish(index: number): Promise<void> {
    const message = TestMessage(index);
    await bus.Send(r.TopicName, [{ MessageId: message.MessageID, Body: JSON.stringify(message), ApplicationProperties: { ...message.Attributes } }]);
}

async function deadLetter(index: number, reason: string, error: string | null = 'boom'): Promise<string> {
    await publish(index);
    const [delivery] = await consumer.Receive(10, 0, signal);
    await consumer.DeadLetter(delivery, reason, error);
    return delivery.Message.MessageID;
}

beforeEach(() => {
    bus = new FakeServiceBus();
    binding = TestSubscriptionBinding(false);
    SeedValidAzureResources(bus, TestTopicBinding(false), binding);
    operator = new AzureTransportOperator(bus, bus, { Now: () => bus.Now });
    consumer = new ServiceBusTransportConsumer(bus, binding, { Now: () => bus.Now });
});

describe('AzureTransportOperator.GetStats', () => {
    it('reports active and dead-lettered counts, with in-flight unknown', async () => {
        await publish(1);
        await publish(2);
        await deadLetter(3, 'Fatal');
        expect(await operator.GetStats(binding)).toEqual({
            SubscriptionName: 'email.unsubscribe', Pending: 2, InFlight: 0, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: null, AsOf: new Date(bus.Now).toISOString(),
        });
    });

    it('throws when the subscription does not exist', async () => {
        await expect(operator.GetStats(TestSubscriptionBinding(false, { Config: { ...binding.Config, SubscriptionName: 'missing' } }))).rejects.toThrow('does not exist');
    });
});

describe('AzureTransportOperator.ListDeadLetters', () => {
    it('peeks non-destructively and pages by sequence number', async () => {
        const first = await deadLetter(1, 'Poison', 'stack');
        const second = await deadLetter(2, 'Fatal', null);
        const page = await operator.ListDeadLetters(binding, null, 1);
        expect(page?.Items.map((i) => [i.DeliveryID, i.Reason, i.LastError, i.Attempts, i.BlocksKey])).toEqual([[first, 'Poison', 'stack', 1, false]]);
        expect(page?.NextCursor).not.toBeNull();
        const rest = await operator.ListDeadLetters(binding, page!.NextCursor, 10);
        expect(rest?.Items.map((i) => i.DeliveryID)).toEqual([second]);
        expect(rest?.NextCursor).toBeNull();
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName)).toHaveLength(2);
        expect(bus.Calls.filter((c) => c.Op === 'Receive' && c.Subscription)).toHaveLength(2);
    });

    it('reports a service-side MaxDeliveryCount dead letter as RedrivePolicy and a non-envelope body with a preview', async () => {
        await bus.Send(r.TopicName, [{ MessageId: 'poison', Body: 'garbage', ApplicationProperties: {} }]);
        for (let i = 0; i < 12; i += 1) {
            const batch = await bus.Receive({ TopicName: r.TopicName, SubscriptionName: r.SubscriptionName, RequiresSession: false, MaxMessages: 1, WaitMs: 0 });
            for (const m of batch) {
                await bus.Abandon(m);
            }
        }
        const page = await operator.ListDeadLetters(binding, null, 10);
        expect(page?.Items).toHaveLength(1);
        expect(page?.Items[0]).toMatchObject({ DeliveryID: expect.stringMatching(/^sb:\d+$/), Reason: 'RedrivePolicy', Attempts: 0 });
        expect(page?.Items[0].LastError).toContain('raw body: garbage');
    });
});

describe('AzureTransportOperator.Replay and Discard', () => {
    it('replays a dead letter as a targeted attempt-1 copy and removes it from the subqueue', async () => {
        const id = await deadLetter(1, 'Poison');
        await deadLetter(2, 'Poison');
        expect(await operator.Replay(binding, id, 'user-7', 'fixed upstream')).toEqual({ Supported: true, Changed: true });
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName)).toHaveLength(1);
        const [copy] = bus.Messages(r.TopicName, r.SubscriptionName);
        expect(copy.Properties).toMatchObject({
            [RUNTIME_PROPERTIES.Target]: 'email.unsubscribe', [RUNTIME_PROPERTIES.Replay]: '1', [RUNTIME_PROPERTIES.Attempt]: '1',
            [RUNTIME_PROPERTIES.ReplayNote]: 'fixed upstream', [RUNTIME_PROPERTIES.ReplayedBy]: 'user-7',
        });
        expect(copy.Properties[DEAD_LETTER_PROPERTIES.Reason]).toBeUndefined();
        const [replayed] = await consumer.Receive(10, 0, signal);
        expect(replayed.IsReplay).toBe(true);
        expect(replayed.Attempt).toBe(1);
        expect(replayed.Message.MessageID).toBe(id);
    });

    it('reports an unknown dead letter as unchanged and an unreadable one as not replayable', async () => {
        await deadLetter(1, 'Poison');
        expect(await operator.Replay(binding, 'no-such-id', null, null)).toEqual({ Supported: true, Changed: false });
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName)).toHaveLength(1);
        await bus.Send(r.TopicName, [{ MessageId: 'poison', Body: 'garbage', ApplicationProperties: {} }]);
        await consumer.Receive(10, 0, signal);
        const page = await operator.ListDeadLetters(binding, null, 10);
        const poison = page!.Items.find((i) => i.DeliveryID.startsWith('sb:'))!;
        expect(await operator.Replay(binding, poison.DeliveryID, null, null)).toEqual({ Supported: true, Changed: false });
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName)).toHaveLength(2);
    });

    it('discards a dead letter and refuses anything it cannot find', async () => {
        const id = await deadLetter(1, 'Poison');
        expect(await operator.Discard(binding, id, 'bad batch', null)).toEqual({ Supported: true, Changed: true });
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName)).toHaveLength(0);
        expect(await operator.Discard(binding, id, 'again', null)).toEqual({ Supported: false });
    });

    it('returns null for partitions', async () => {
        expect(await operator.ListPartitions(binding, null, null, 10)).toBeNull();
    });
});
