import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { AzureGatewayError } from '../gateway/errors';
import type { ServiceBusReceivedEnvelope, ServiceBusReceiveRequest } from '../gateway/ServiceBusGateway';
import { DEAD_LETTER_PROPERTIES, RUNTIME_PROPERTIES } from '../properties';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestAzureResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

const signal = new AbortController().signal;
let bus: FakeServiceBus;
let binding: SubscriptionBinding;

function consumerFor(isFifo: boolean, policy: Partial<SubscriptionBinding['Policy']> = {}): ServiceBusTransportConsumer {
    bus = new FakeServiceBus();
    binding = TestSubscriptionBinding(isFifo, { Policy: policy });
    SeedValidAzureResources(bus, TestTopicBinding(isFifo), binding);
    return new ServiceBusTransportConsumer(bus, binding, { Now: () => bus.Now });
}

async function send(isFifo: boolean, index: number, properties: Record<string, string> = {}, key?: string): Promise<void> {
    const message = TestMessage(index, key ? { PartitionKey: key } : {});
    await bus.Send(TestAzureResources(isFifo).TopicName, [{
        MessageId: `${message.MessageID}${properties[RUNTIME_PROPERTIES.Attempt] ?? ''}`, Body: JSON.stringify(message),
        ApplicationProperties: { ...message.Attributes, ...properties }, ...(isFifo ? { SessionId: key ?? message.MessageID } : {}),
    }]);
}

class AlwaysBusy extends FakeServiceBus {
    public override async Receive(_request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]> {
        throw new AzureGatewayError('Service Bus receiveMessages failed: busy', 'ServiceBusy', true);
    }
}

describe('ServiceBusTransportConsumer.Receive', () => {
    it('returns deliveries with attempt, replay flag and the lock expiry as the lease', async () => {
        const consumer = consumerFor(false);
        await send(false, 1);
        await send(false, 2, { [RUNTIME_PROPERTIES.Replay]: '1' });
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(deliveries[0]).toMatchObject({ Attempt: 1, IsReplay: false, LeaseToken: expect.stringMatching(/^lt-/) });
        expect(deliveries[1].IsReplay).toBe(true);
        expect(deliveries[0].LeaseExpiresAt.getTime()).toBe(bus.Now + 60_000);
        expect(consumer.TrackedCount).toBe(2);
    });

    it('derives the attempt from the copy base and the delivery count', async () => {
        const consumer = consumerFor(false);
        await send(false, 1, { [RUNTIME_PROPERTIES.Attempt]: '3' });
        const [first] = await consumer.Receive(10, 0, signal);
        expect(first.Attempt).toBe(3);
        await consumer.Release(first);
        const [again] = await consumer.Receive(10, 0, signal);
        expect(again.Attempt).toBe(4);
    });

    it('dead-letters a body that is not an envelope and a crash-looping message', async () => {
        const consumer = consumerFor(false, { MaxAttempts: 1 });
        const r = TestAzureResources(false);
        await bus.Send(r.TopicName, [{ MessageId: 'poison', Body: 'not json', ApplicationProperties: {} }]);
        await send(false, 2);
        const [first] = await consumer.Receive(10, 0, signal);
        expect(first.Message.MessageID).toBe(TestMessage(2).MessageID);
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName).map((m) => m.DeadLetterReason)).toEqual(['InvalidEnvelope']);
        // Three abandons push DeliveryCount past MaxAttempts + 2 before the service's own MaxDeliveryCount (MaxAttempts + 5).
        await consumer.Release(first);
        for (let i = 0; i < 2; i += 1) {
            const [delivery] = await consumer.Receive(10, 0, signal);
            await consumer.Release(delivery);
        }
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(bus.DeadLetters(r.TopicName, r.SubscriptionName).map((m) => m.Properties[DEAD_LETTER_PROPERTIES.Reason])).toEqual(['InvalidEnvelope', 'MaxAttemptsExceeded']);
    });

    it('receives one message per session on an Exclusive subscription and frees the session on settle', async () => {
        const consumer = consumerFor(true);
        await send(true, 1, {}, 'key-a');
        await send(true, 2, {}, 'key-a');
        await send(true, 3, {}, 'key-b');
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID).sort()).toEqual([TestMessage(1).MessageID, TestMessage(3).MessageID]);
        expect(bus.OpenSessions).toBe(2);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        await consumer.Complete(deliveries.find((d) => d.Message.MessageID === TestMessage(1).MessageID)!);
        expect(bus.OpenSessions).toBe(1);
        expect((await consumer.Receive(10, 0, signal)).map((d) => d.Message.MessageID)).toEqual([TestMessage(2).MessageID]);
    });

    it('propagates a retryable receive failure', async () => {
        bus = new AlwaysBusy();
        binding = TestSubscriptionBinding(false);
        SeedValidAzureResources(bus, TestTopicBinding(false), binding);
        await expect(new ServiceBusTransportConsumer(bus, binding).Receive(1, 0, signal)).rejects.toBeInstanceOf(AzureGatewayError);
    });
});

describe('ServiceBusTransportConsumer settlement', () => {
    it('completes, and fences a stale lock', async () => {
        const consumer = consumerFor(false, { LeaseSeconds: 5 });
        await send(false, 1);
        const [first] = await consumer.Receive(10, 0, signal);
        bus.Advance(6);
        const [second] = await consumer.Receive(10, 0, signal);
        expect(await consumer.Complete(first)).toEqual({ Kind: 'LeaseLost', DeliveryID: first.DeliveryID });
        expect(await consumer.Complete(second)).toEqual({ Kind: 'Settled', DeliveryID: second.DeliveryID, Status: 'Completed' });
        expect(await consumer.Complete(second)).toEqual({ Kind: 'LeaseLost', DeliveryID: second.DeliveryID });
    });

    it('retries by scheduling a targeted copy with the next attempt and completing the original', async () => {
        const consumer = consumerFor(false);
        const r = TestAzureResources(false);
        await send(false, 1);
        const [delivery] = await consumer.Receive(10, 0, signal);
        expect(await consumer.Retry(delivery, 30, 'busy')).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        const [copy] = bus.Messages(r.TopicName, r.SubscriptionName);
        expect(copy.MessageId).toBe(`${TestMessage(1).MessageID}:a2`);
        expect(copy.Properties).toMatchObject({ eventType: 'unsubscribe', [RUNTIME_PROPERTIES.Target]: 'email.unsubscribe', [RUNTIME_PROPERTIES.Attempt]: '2' });
        expect(copy.VisibleAt).toBe(bus.Now + 30_000);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        bus.Advance(31);
        const [again] = await consumer.Receive(10, 0, signal);
        expect(again.Message).toEqual(TestMessage(1));
        expect(again.Attempt).toBe(2);
    });

    it('sends the retry copy immediately for a zero delay and fails without completing when scheduling fails', async () => {
        const consumer = consumerFor(false);
        const r = TestAzureResources(false);
        await send(false, 1);
        const [delivery] = await consumer.Receive(10, 0, signal);
        bus.FailNext('Send', new AzureGatewayError('Service Bus sendMessages failed: busy', 'ServiceBusy', true));
        expect(await consumer.Retry(delivery, 0, 'x')).toMatchObject({ Kind: 'Failed' });
        expect(bus.Messages(r.TopicName, r.SubscriptionName)).toHaveLength(1);
        expect(await consumer.Retry(delivery, 0, 'x')).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(bus.Calls.filter((c) => c.Op === 'Send')).toHaveLength(3);
    });

    it('dead-letters with the runtime properties and keeps the copy out of the main subscription', async () => {
        const consumer = consumerFor(false);
        const r = TestAzureResources(false);
        await send(false, 1);
        const [delivery] = await consumer.Receive(10, 0, signal);
        expect(await consumer.DeadLetter(delivery, 'Poison', 'stack trace')).toMatchObject({ Kind: 'Settled', Status: 'DeadLettered' });
        const [dead] = bus.DeadLetters(r.TopicName, r.SubscriptionName);
        expect(dead.DeadLetterReason).toBe('Poison');
        expect(dead.Properties).toMatchObject({
            [DEAD_LETTER_PROPERTIES.Reason]: 'Poison', [DEAD_LETTER_PROPERTIES.Attempts]: '1', [DEAD_LETTER_PROPERTIES.LastError]: 'stack trace',
            [DEAD_LETTER_PROPERTIES.DeadLetteredAt]: new Date(bus.Now).toISOString(),
        });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
    });

    it('extends the lease through the lock, reports Lost after the lock expired, and never Cancelled', async () => {
        const consumer = consumerFor(false, { LeaseSeconds: 5 });
        await send(false, 1);
        const [delivery] = await consumer.Receive(10, 0, signal);
        bus.Advance(4);
        expect(await consumer.ExtendLease(delivery, 5)).toBe('Held');
        bus.Advance(3);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        bus.Advance(6);
        expect(await consumer.ExtendLease(delivery, 5)).toBe('Lost');
        expect(await consumer.AcknowledgeCancel(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
    });

    it('rethrows a retryable renewal failure so the runtime retries on its next tick', async () => {
        const consumer = consumerFor(false);
        await send(false, 1);
        const [delivery] = await consumer.Receive(10, 0, signal);
        bus.FailNext('RenewLock', new AzureGatewayError('Service Bus renewMessageLock failed: busy', 'ServiceBusy', true));
        await expect(consumer.ExtendLease(delivery, 5)).rejects.toBeInstanceOf(AzureGatewayError);
        bus.FailNext('RenewLock', new AzureGatewayError('Service Bus renewMessageLock failed: nope', 'UnauthorizedAccess', false));
        expect(await consumer.ExtendLease(delivery, 5)).toBe('Lost');
    });

    it('releases open sessions on Close', async () => {
        const consumer = consumerFor(true);
        await send(true, 1, {}, 'k');
        await consumer.Receive(10, 0, signal);
        expect(bus.OpenSessions).toBe(1);
        await consumer.Close();
        expect(bus.OpenSessions).toBe(0);
        expect(consumer.TrackedCount).toBe(0);
        expect(await consumer.Receive(10, 0, signal)).toHaveLength(1);
    });
});
