import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { AzureGatewayError } from '../gateway/errors';
import type { ServiceBusReceivedRecord } from '../gateway/ServiceBusGateway';
import { FakeServiceBusGateway } from '../testing/fakes';
import { TestAzureResources, TestAzureSubscriptionBinding, TestMessage } from '../testing/fixtures';

const r = TestAzureResources(true);
const signal = new AbortController().signal;
let fake: FakeServiceBusGateway;
let binding: SubscriptionBinding;
let consumer: ServiceBusTransportConsumer;

function withPolicy(overrides: Partial<SubscriptionBinding['Policy']>): ServiceBusTransportConsumer {
    binding = TestAzureSubscriptionBinding(true, { Policy: overrides });
    return new ServiceBusTransportConsumer(fake, binding, { Now: () => fake.Now });
}

async function send(index: number, props: Record<string, string> = {}, sessionId = `g-${index}`): Promise<void> {
    const msg = TestMessage(index);
    await fake.Send(r.ServiceBusTopicName, {
        MessageId: msg.MessageID,
        Body: JSON.stringify(msg),
        ApplicationProperties: props,
        SessionId: sessionId,
    });
}

class AlwaysBusyGateway extends FakeServiceBusGateway {
    public override async Receive(): Promise<ServiceBusReceivedRecord[]> {
        throw new AzureGatewayError('ServiceBus receiveMessages failed: ServiceBusy', 'ServiceBusy', true);
    }
}

beforeEach(() => {
    fake = new FakeServiceBusGateway()
        .AddTopic(r.ServiceBusTopicName)
        .AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: true, LockDurationSeconds: 60 });
    consumer = withPolicy({});
});

describe('ServiceBusTransportConsumer.Receive', () => {
    it('returns deliveries with attempt, replay flag, and lock expiration', async () => {
        await send(1);
        await send(2, { [REPLAY_ATTRIBUTE]: '1' });
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(deliveries[0]).toMatchObject({ Attempt: 1, IsReplay: false, LeaseToken: expect.stringMatching(/^lock-/) });
        expect(deliveries[1].IsReplay).toBe(true);
        expect(deliveries[0].LeaseExpiresAt.getTime()).toBe(fake.Now + 60_000);
        expect(consumer.TrackedCount).toBe(2);
    });

    it('enforces one in-flight message per session key and delivers next after Complete', async () => {
        await send(1, {}, 'key-a');
        await send(2, {}, 'key-a');
        await send(3, {}, 'key-b');
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID).sort()).toEqual([TestMessage(1).MessageID, TestMessage(3).MessageID]);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);

        const first = deliveries.find((d) => d.Message.MessageID === TestMessage(1).MessageID)!;
        await consumer.Complete(first);
        const next = await consumer.Receive(10, 0, signal);
        expect(next.map((d) => d.Message.MessageID)).toEqual([TestMessage(2).MessageID]);
    });

    it('dead-letters invalid envelopes and enforces MaxAttempts + 2 receive guard', async () => {
        await fake.Send(r.ServiceBusTopicName, {
            MessageId: 'bad-1',
            Body: 'not json',
            ApplicationProperties: {},
            SessionId: 'bad-sess',
        });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(fake.Messages(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(0);
        const [dlqInvalid] = fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName);
        expect(dlqInvalid.DeadLetterReason).toBe('InvalidEnvelope');

        consumer = withPolicy({ MaxAttempts: 2 });
        await send(10);
        for (let i = 0; i < 4; i++) {
            expect(await consumer.Receive(1, 0, signal)).toHaveLength(1);
            fake.Advance(61);
        }
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        const guarded = fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName).find((m) => m.MessageId === TestMessage(10).MessageID);
        expect(guarded?.DeadLetterReason).toBe('MaxAttemptsExceeded');
        expect(guarded?.ApplicationProperties[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('5');
    });

    it('propagates Receive errors and calls OnAdoptError on adopt failures', async () => {
        const busy = new AlwaysBusyGateway()
            .AddTopic(r.ServiceBusTopicName)
            .AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: true });
        await expect(new ServiceBusTransportConsumer(busy, binding).Receive(5, 0, signal)).rejects.toThrow('ServiceBusy');

        const errors: string[] = [];
        consumer = new ServiceBusTransportConsumer(fake, binding, {
            Now: () => fake.Now,
            OnAdoptError: (msg, err) => errors.push(`${msg.MessageId}:${err.message}`),
        });
        await fake.Send(r.ServiceBusTopicName, { MessageId: 'bad-2', Body: 'not json', ApplicationProperties: {}, SessionId: 's-x' });
        await send(1);
        fake.FailNext('DeadLetter', new AzureGatewayError('transient dlq err', 'ServiceBusy', true));
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries).toHaveLength(1);
        expect(errors).toHaveLength(1);
    });
});

describe('ServiceBusTransportConsumer settles & lock renewal', () => {
    it('completes, releases, and retries with scheduled delay while preserving Attempt monotonicity', async () => {
        await send(1);
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

    it('extends lock while valid, reports Lost after expiration, and throws on retryable RenewLock error', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');

        fake.FailNext('RenewLock', new AzureGatewayError('busy', 'ServiceBusy', true));
        await expect(consumer.ExtendLease(delivery, 60)).rejects.toThrow('busy');

        fake.FailNext('RenewLock', new AzureGatewayError('denied', 'UnauthorizedAccess', false));
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');

        fake.Advance(61);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });

    it('dead-letters into $DeadLetterQueue with metadata and cleans up tracked entries on Close', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.DeadLetter(delivery, 'Poison', 'bad payload')).toEqual({
            Kind: 'Settled',
            DeliveryID: delivery.DeliveryID,
            Status: 'DeadLettered',
        });
        expect(fake.Messages(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(0);
        const [dlq] = fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName);
        expect(dlq.DeadLetterReason).toBe('Poison');
        expect(dlq.ApplicationProperties[DEAD_LETTER_ATTRIBUTES.LastError]).toBe('bad payload');
        expect(consumer.TrackedCount).toBe(0);
        await consumer.Close();
    });
});
