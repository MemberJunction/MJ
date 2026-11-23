import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { PubSubTransportConsumer } from '../consumer/PubSubTransportConsumer';
import { GcpGatewayError } from '../gateway/errors';
import type { PubSubReceivedRecord } from '../gateway/PubSubGateway';
import { FakePubSubGateway } from '../testing/fakes';
import { TestGcpResources, TestGcpSubscriptionBinding, TestMessage } from '../testing/fixtures';

const r = TestGcpResources(true);
const signal = new AbortController().signal;
let fake: FakePubSubGateway;
let binding: SubscriptionBinding;
let consumer: PubSubTransportConsumer;

function withPolicy(overrides: Partial<SubscriptionBinding['Policy']>): PubSubTransportConsumer {
    binding = TestGcpSubscriptionBinding(true, { Policy: overrides });
    return new PubSubTransportConsumer(fake, binding, { Now: () => fake.Now });
}

async function publish(index: number, attrs: Record<string, string> = {}, orderingKey = `g-${index}`): Promise<void> {
    const msg = TestMessage(index);
    await fake.Publish(r.TopicName, {
        MessageId: msg.MessageID,
        Data: JSON.stringify(msg),
        Attributes: attrs,
        OrderingKey: orderingKey,
    });
}

class AlwaysBusyGateway extends FakePubSubGateway {
    public override async Pull(): Promise<PubSubReceivedRecord[]> {
        throw new GcpGatewayError('PubSub pull failed: UNAVAILABLE', 'GRPC_14', true);
    }
}

beforeEach(() => {
    fake = new FakePubSubGateway()
        .AddTopic(r.TopicName)
        .AddTopic(r.DeadLetterTopicName)
        .AddSubscription(r.DeadLetterTopicName, r.DeadLetterSubscriptionName, { EnableMessageOrdering: true })
        .AddSubscription(r.TopicName, r.SubscriptionName, {
            EnableMessageOrdering: true,
            AckDeadlineSeconds: 60,
            DeadLetterTopicName: r.DeadLetterTopicName,
        });
    consumer = withPolicy({});
});

describe('PubSubTransportConsumer.Receive', () => {
    it('returns deliveries with attempt, replay flag, and ack-deadline expiration', async () => {
        await publish(1);
        await publish(2, { [REPLAY_ATTRIBUTE]: '1' });
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(deliveries[0]).toMatchObject({ Attempt: 1, IsReplay: false, LeaseToken: expect.stringMatching(/^ack-/) });
        expect(deliveries[1].IsReplay).toBe(true);
        expect(deliveries[0].LeaseExpiresAt.getTime()).toBe(fake.Now + 60_000);
        expect(consumer.TrackedCount).toBe(2);
    });

    it('enforces one in-flight message per orderingKey and delivers next after Complete', async () => {
        await publish(1, {}, 'key-a');
        await publish(2, {}, 'key-a');
        await publish(3, {}, 'key-b');
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID).sort()).toEqual([TestMessage(1).MessageID, TestMessage(3).MessageID]);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);

        const first = deliveries.find((d) => d.Message.MessageID === TestMessage(1).MessageID)!;
        await consumer.Complete(first);
        const next = await consumer.Receive(10, 0, signal);
        expect(next.map((d) => d.Message.MessageID)).toEqual([TestMessage(2).MessageID]);
    });

    it('dead-letters invalid envelopes and enforces MaxAttempts + 2 receive guard', async () => {
        await fake.Publish(r.TopicName, {
            MessageId: 'bad-1',
            Data: 'not json',
            Attributes: {},
            OrderingKey: 'bad-key',
        });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(fake.Messages(r.SubscriptionName)).toHaveLength(0);
        const [dlqInvalid] = fake.Messages(r.DeadLetterSubscriptionName);
        expect(dlqInvalid.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');

        consumer = withPolicy({ MaxAttempts: 2 });
        await publish(10);
        for (let i = 0; i < 4; i++) {
            expect(await consumer.Receive(1, 0, signal)).toHaveLength(1);
            fake.Advance(61);
        }
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        const guarded = fake.Messages(r.DeadLetterSubscriptionName).find((m) => m.Attributes[DEAD_LETTER_ATTRIBUTES.SourceMessageId] === TestMessage(10).MessageID);
        expect(guarded?.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('MaxAttemptsExceeded');
        expect(guarded?.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('5');
    });

    it('propagates Receive errors and calls OnAdoptError on adopt failures', async () => {
        const busy = new AlwaysBusyGateway()
            .AddTopic(r.TopicName)
            .AddSubscription(r.TopicName, r.SubscriptionName, { EnableMessageOrdering: true });
        await expect(new PubSubTransportConsumer(busy, binding).Receive(5, 0, signal)).rejects.toThrow('UNAVAILABLE');

        const errors: string[] = [];
        consumer = new PubSubTransportConsumer(fake, binding, {
            Now: () => fake.Now,
            OnAdoptError: (msg, err) => errors.push(`${msg.ServerMessageId}:${err.message}`),
        });
        await fake.Publish(r.TopicName, { MessageId: 'bad-2', Data: 'not json', Attributes: {}, OrderingKey: 'k-bad' });
        await publish(1);
        fake.FailNext('Publish', new GcpGatewayError('transient dlq err', 'GRPC_14', true));
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries).toHaveLength(1);
        expect(errors).toHaveLength(1);
    });
});

describe('PubSubTransportConsumer settles & ack-deadline extension', () => {
    it('completes, releases, and retries with ModifyAckDeadline delay while preserving Attempt monotonicity', async () => {
        await publish(1);
        const [d1] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Retry(d1, 120, 'boom')).toEqual({ Kind: 'Settled', DeliveryID: d1.DeliveryID, Status: 'Pending' });
        fake.Advance(119);
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        fake.Advance(2);
        const [d2] = await consumer.Receive(1, 0, signal);
        expect(d2.Attempt).toBe(2);

        expect(await consumer.Release(d2)).toEqual({ Kind: 'Settled', DeliveryID: d2.DeliveryID, Status: 'Pending' });
        const [d3] = await consumer.Receive(1, 0, signal);
        expect(d3.Attempt).toBe(3);

        expect(await consumer.Complete(d3)).toEqual({ Kind: 'Settled', DeliveryID: d3.DeliveryID, Status: 'Completed' });
        expect(await consumer.Complete(d3)).toEqual({ Kind: 'LeaseLost', DeliveryID: d3.DeliveryID });
        expect(await consumer.AcknowledgeCancel(d3)).toEqual({ Kind: 'LeaseLost', DeliveryID: d3.DeliveryID });
    });

    it('extends ack deadline while valid, reports Lost after expiration, and throws on retryable ModifyAckDeadline error', async () => {
        await publish(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');

        fake.FailNext('ModifyAckDeadline', new GcpGatewayError('busy', 'GRPC_14', true));
        await expect(consumer.ExtendLease(delivery, 60)).rejects.toThrow('busy');

        fake.FailNext('ModifyAckDeadline', new GcpGatewayError('denied', 'GRPC_7', false));
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');

        fake.Advance(61);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });

    it('dead-letters into DeadLetterTopicName with metadata and cleans up tracked entries on Close', async () => {
        await publish(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.DeadLetter(delivery, 'Poison', 'bad payload')).toEqual({
            Kind: 'Settled',
            DeliveryID: delivery.DeliveryID,
            Status: 'DeadLettered',
        });
        expect(fake.Messages(r.SubscriptionName)).toHaveLength(0);
        const [dlq] = fake.Messages(r.DeadLetterSubscriptionName);
        expect(dlq.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('Poison');
        expect(dlq.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBe('bad payload');
        expect(consumer.TrackedCount).toBe(0);
        await consumer.Close();
    });
});
