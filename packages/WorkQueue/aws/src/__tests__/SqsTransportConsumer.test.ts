import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { AwsGatewayError } from '../gateway/errors';
import type { SqsReceivedMessage } from '../gateway/SqsGateway';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

const r = TestAwsResources(true);
let sqs: FakeSqsGateway;
let binding: SubscriptionBinding;
let consumer: SqsTransportConsumer;
const signal = new AbortController().signal;

function withPolicy(overrides: Partial<SubscriptionBinding['Policy']>): SqsTransportConsumer {
    binding = TestSubscriptionBinding(true, { Policy: overrides });
    return new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now });
}

async function send(index: number, attributes: Record<string, string> = {}, group: string = `g-${index}`): Promise<void> {
    await sqs.Send({ QueueUrl: r.QueueUrl, Body: JSON.stringify(TestMessage(index)), MessageGroupId: group, MessageDeduplicationId: `d-${index}`, Attributes: attributes });
}

class AlwaysThrottledSqs extends FakeSqsGateway {
    public override async Receive(): Promise<SqsReceivedMessage[]> {
        throw new AwsGatewayError('SQS ReceiveMessage failed: Throttling', 'Throttling', true);
    }
}

beforeEach(() => {
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
    consumer = withPolicy({});
});

describe('SqsTransportConsumer.Receive', () => {
    it('returns deliveries with attempt, replay flag and lease expiry', async () => {
        await send(1);
        await send(2, { [REPLAY_ATTRIBUTE]: '1' });
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(deliveries[0]).toMatchObject({ Attempt: 1, IsReplay: false, LeaseToken: expect.stringMatching(/^rh-/) });
        expect(deliveries[1].IsReplay).toBe(true);
        expect(deliveries[0].LeaseExpiresAt.getTime()).toBe(sqs.Now + 60_000);
        expect(consumer.TrackedCount).toBe(2);
    });

    it('receives one message per call on a FIFO queue, so one key is never in flight twice', async () => {
        await send(1, {}, 'key-a');
        await send(2, {}, 'key-a');
        await send(3, {}, 'key-b');
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID).sort()).toEqual([TestMessage(1).MessageID, TestMessage(3).MessageID]);
        const receives = sqs.Calls.filter((call) => call.Op === 'Receive');
        expect(receives).toHaveLength(10);
        expect(receives.every((call) => call.MaxMessages === 1)).toBe(true);
        // key-a's second message stays queued until the first settles.
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        await consumer.Complete(deliveries.find((d) => d.Message.MessageID === TestMessage(1).MessageID)!);
        expect((await consumer.Receive(10, 0, signal)).map((d) => d.Message.MessageID)).toEqual([TestMessage(2).MessageID]);
    });

    it('does not burn a follower\'s attempts while its head retries', async () => {
        await send(1, {}, 'key-a');
        await send(2, {}, 'key-a');
        for (let attempt = 1; attempt <= 3; attempt++) {
            const [head] = await consumer.Receive(10, 0, signal);
            expect(head.Message.MessageID).toBe(TestMessage(1).MessageID);
            await consumer.Retry(head, 30, 'boom');
            sqs.Advance(31);
        }
        const [head] = await consumer.Receive(10, 0, signal);
        await consumer.Complete(head);
        const [follower] = await consumer.Receive(10, 0, signal);
        expect(follower.Message.MessageID).toBe(TestMessage(2).MessageID);
        expect(follower.Attempt).toBe(1);
    });

    it('batches on a standard queue', async () => {
        const standard = TestAwsResources(false);
        sqs.AddQueue(standard.QueueUrl, { Fifo: false }).AddQueue(standard.DeadLetterQueueUrl, { Fifo: false });
        const standardConsumer = new SqsTransportConsumer(sqs, TestSubscriptionBinding(false), { Now: () => sqs.Now });
        for (const index of [1, 2, 3]) {
            await sqs.Send({ QueueUrl: standard.QueueUrl, Body: JSON.stringify(TestMessage(index)) });
        }
        expect(await standardConsumer.Receive(25, 0, signal)).toHaveLength(3);
        const receives = sqs.Calls.filter((call) => call.Op === 'Receive');
        expect(receives).toEqual([expect.objectContaining({ MaxMessages: 10 })]);
    });

    it('dead-letters a body that is not an envelope and does not return it', async () => {
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: 'not json', MessageGroupId: 'g', MessageDeduplicationId: 'bad' });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(sqs.Messages(r.DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('still returns the adopted messages when one message cannot be dead-lettered', async () => {
        const failures: string[] = [];
        consumer = new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now, OnAdoptError: (message, error) => failures.push(`${message.Body}: ${error.message}`) });
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: 'not json', MessageGroupId: 'bad', MessageDeduplicationId: 'bad' });
        await send(1);
        sqs.FailNext('Send', new AwsGatewayError('SQS SendMessage failed: down', 'InternalError', true));
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID]);
        expect(failures).toEqual(['not json: SQS SendMessage failed: down']);
        // The poison message was not deleted; SQS redelivers it after the visibility timeout.
        expect(sqs.Messages(r.QueueUrl).map((m) => m.Body)).toContain('not json');
    });

    it('throws only when every receive call fails', async () => {
        const throttled = new AlwaysThrottledSqs().AddQueue(r.QueueUrl, { Fifo: true });
        await expect(new SqsTransportConsumer(throttled, binding).Receive(3, 0, signal)).rejects.toThrow('Throttling');
        // One failed call out of several is tolerated: the other receives still return their messages.
        await send(1);
        sqs.FailNext('Receive', new AwsGatewayError('SQS ReceiveMessage failed: Throttling', 'Throttling', true));
        expect(await consumer.Receive(3, 0, signal)).toHaveLength(1);
    });

    it('guards at MaxAttempts + 2 receives, not at MaxAttempts', async () => {
        consumer = withPolicy({ MaxAttempts: 2 });
        await send(1);
        for (let i = 0; i < 4; i++) {
            expect(await consumer.Receive(1, 0, signal)).toHaveLength(1);   // receives 1–4 are still delivered
            sqs.Advance(61);
        }
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);           // receive 5 > 2 + 2
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('MaxAttemptsExceeded');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('5');
    });
});

describe('SqsTransportConsumer settles', () => {
    it('completes by deleting, and reports a stale receipt as lease lost', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
    });

    it('retries by hiding the message for the delay; it returns with the next attempt', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Retry(delivery, 120, 'boom')).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        sqs.Advance(119);
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        sqs.Advance(2);
        const [again] = await consumer.Receive(1, 0, signal);
        expect(again.Attempt).toBe(2);
    });

    it('caps a retry delay at what is left of the 12-hour window', async () => {
        consumer = withPolicy({ LeaseSeconds: 43200 });
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.Advance(43000);
        await consumer.Retry(delivery, 900, 'late');
        expect(sqs.Messages(r.QueueUrl)[0].VisibleAt).toBe(sqs.Now + 200_000);
    });

    it('releases by making the message visible immediately, which consumes a receive', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Release(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        const [again] = await consumer.Receive(1, 0, signal);
        expect(again.Attempt).toBe(2);
    });

    it('cannot acknowledge a cancel: SQS has no cancel flag', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.AcknowledgeCancel(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(1);
    });
});

describe('SqsTransportConsumer.ExtendLease', () => {
    it('holds while the receipt is current and loses it after another receive', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');
        sqs.Advance(61);
        await new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now }).Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });

    it('loses the lease once the 12-hour window is used, without calling SQS', async () => {
        consumer = withPolicy({ LeaseSeconds: 43200 });
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.Advance(43200);
        const callsBefore = sqs.Calls.length;
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
        expect(sqs.Calls).toHaveLength(callsBefore);
    });

    it('throws on a retryable SQS error (the runtime retries next tick) and loses on a non-retryable one', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.FailNext('ChangeVisibility', new AwsGatewayError('slow down', 'Throttling', true));
        await expect(consumer.ExtendLease(delivery, 60)).rejects.toThrow('slow down');
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');
        sqs.FailNext('ChangeVisibility', new AwsGatewayError('denied', 'AccessDenied', false));
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });
});

describe('SqsTransportConsumer.DeadLetter', () => {
    it('copies to the dead-letter queue, then deletes', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.DeadLetter(delivery, 'MaxAttemptsExceeded', 'last failure')).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'DeadLettered' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Body).toBe(JSON.stringify(TestMessage(1)));
        expect(copy.GroupId).toBe(delivery.DeliveryID);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBe('last failure');
        expect(consumer.TrackedCount).toBe(0);
    });

    it('fails without touching the message when the dead-letter send fails', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.FailNext('Send', new AwsGatewayError('SQS SendMessage failed: down', 'InternalError', true));
        expect(await consumer.DeadLetter(delivery, 'Fatal', null)).toEqual({ Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'SQS SendMessage failed: down' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(1);
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
    });
});
