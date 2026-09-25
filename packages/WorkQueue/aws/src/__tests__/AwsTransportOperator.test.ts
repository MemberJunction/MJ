import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import type { SqsReceivedMessage, SqsReceiveRequest } from '../gateway/SqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

const r = TestAwsResources(true);
const signal = new AbortController().signal;
let sqs: FakeSqsGateway;

/** Returns `EmptyReceives` false-empty results before behaving normally (what SQS short polling does). */
class FalseEmptySqs extends FakeSqsGateway {
    public EmptyReceives = 0;
    public override async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        if (this.EmptyReceives > 0) {
            this.EmptyReceives -= 1;
            return [];
        }
        return super.Receive(request);
    }
}
let binding: SubscriptionBinding;
let operator: AwsTransportOperator;

async function deadLetter(index: number, attributes: Record<string, string>, partitionKey?: string): Promise<void> {
    const message = TestMessage(index, partitionKey ? { PartitionKey: partitionKey } : {});
    await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: JSON.stringify(message), MessageGroupId: `g-${index}`, MessageDeduplicationId: `dl-${index}`, Attributes: attributes });
}

function runtimeAttributes(reason: string, attempts: string): Record<string, string> {
    return {
        [DEAD_LETTER_ATTRIBUTES.Reason]: reason,
        [DEAD_LETTER_ATTRIBUTES.Attempts]: attempts,
        [DEAD_LETTER_ATTRIBUTES.LastError]: 'boom',
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: '2026-09-16T12:00:00.000Z',
    };
}

beforeEach(() => {
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
    binding = TestSubscriptionBinding(true);
    operator = new AwsTransportOperator(sqs, { Now: () => sqs.Now });
});

describe('AwsTransportOperator.GetStats', () => {
    it('reports queue and dead-letter counts, with no DB-only figures', async () => {
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: '{}', MessageGroupId: 'a', MessageDeduplicationId: 'a' });
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: '{}', MessageGroupId: 'b', MessageDeduplicationId: 'b' });
        await sqs.Receive({ QueueUrl: r.QueueUrl, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 60 });
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.GetStats(binding)).toEqual({
            SubscriptionName: 'email.unsubscribe', Pending: 1, InFlight: 1, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: null, AsOf: new Date(sqs.Now).toISOString(),
        });
    });

    it('throws when the queue does not exist', async () => {
        const empty = new FakeSqsGateway();
        await expect(new AwsTransportOperator(empty).GetStats(binding)).rejects.toThrow(`SQS queue ${r.QueueUrl} does not exist`);
    });
});

describe('AwsTransportOperator.ListDeadLetters', () => {
    it('maps runtime, redrive and unreadable dead letters and restores visibility', async () => {
        await deadLetter(1, runtimeAttributes('MaxAttemptsExceeded', '5'), 'subscriber-9');
        await deadLetter(2, {});
        await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: 'garbage', MessageGroupId: 'g-x', MessageDeduplicationId: 'x' });
        const page = await operator.ListDeadLetters(binding, null, 50);
        expect(page?.NextCursor).toBeNull();
        expect(page?.Items).toEqual([
            { DeliveryID: TestMessage(1).MessageID, Message: TestMessage(1, { PartitionKey: 'subscriber-9' }), PartitionKey: 'subscriber-9', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'boom', DeadLetteredAt: '2026-09-16T12:00:00.000Z', BlocksKey: false },
            { DeliveryID: TestMessage(2).MessageID, Message: TestMessage(2), PartitionKey: null, Attempts: 0, Reason: 'RedrivePolicy', LastError: null, DeadLetteredAt: null, BlocksKey: false },
            expect.objectContaining({ DeliveryID: expect.stringMatching(/^sqs:msg-/), Reason: 'RedrivePolicy', LastError: 'raw body: garbage' }),
        ]);
        expect(page?.Items[2].Message).toMatchObject({ Topic: '', Attributes: {}, Payload: null });
        expect(sqs.Messages(r.DeadLetterQueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });

    it('long-polls, survives false-empty receives and stops after three consecutive empties', async () => {
        const flaky = new FalseEmptySqs().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        sqs = flaky;
        operator = new AwsTransportOperator(flaky, { Now: () => flaky.Now });
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        flaky.EmptyReceives = 2;
        expect((await operator.ListDeadLetters(binding, null, 50))?.Items).toHaveLength(1);
        const receives = flaky.Calls.filter((call) => call.Op === 'Receive');
        expect(receives.every((call) => call.WaitTimeSeconds === 1)).toBe(true);
        flaky.EmptyReceives = 3;
        expect((await operator.ListDeadLetters(binding, null, 50))?.Items).toEqual([]);
    });

    it('scans no more than the page size', async () => {
        for (const i of [1, 2, 3]) {
            await deadLetter(i, runtimeAttributes('Fatal', '1'));
        }
        expect((await operator.ListDeadLetters(binding, null, 2))?.Items).toHaveLength(2);
    });
});

describe('AwsTransportOperator.Replay', () => {
    it('sends the dead letter back marked as a replay and removes it from the dead-letter queue', async () => {
        await deadLetter(7, runtimeAttributes('Fatal', '3'), 'subscriber-9');
        await deadLetter(8, runtimeAttributes('Fatal', '3'));
        expect(await operator.Replay(binding, TestMessage(7).MessageID, 'user-1', 'fixed the template')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(1);
        const [replayed] = sqs.Messages(r.QueueUrl);
        expect(replayed.GroupId).toBe('subscriber-9');
        expect(replayed.DeduplicationId).toBe(`${TestMessage(7).MessageID}:replay:${sqs.Now}`);
        expect(replayed.Attributes).toEqual({ [REPLAY_ATTRIBUTE]: '1', mj_replay_note: 'fixed the template', mj_replayed_by: 'user-1' });
        const [delivery] = await new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now }).Receive(1, 0, signal);
        expect(delivery).toMatchObject({ Attempt: 1, IsReplay: true });
    });

    it('changes nothing when the message is not among the scanned dead letters', async () => {
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.Replay(binding, TestMessage(99).MessageID, null, null)).toEqual({ Supported: true, Changed: false });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(sqs.Messages(r.DeadLetterQueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });
});

describe('AwsTransportOperator.Discard and unsupported operations', () => {
    it('discards a dead letter, and reports a pending or in-flight message as unsupported', async () => {
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.Discard(binding, TestMessage(1).MessageID, 'bad data', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
        expect(await operator.Discard(binding, TestMessage(2).MessageID, 'cancel', 'user-1')).toEqual({ Supported: false });
    });

    it('discards an unreadable dead letter by its sqs: ID but cannot replay it', async () => {
        await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: 'garbage', MessageGroupId: 'g-x', MessageDeduplicationId: 'x' });
        const [record] = (await operator.ListDeadLetters(binding, null, 50))?.Items ?? [];
        expect(await operator.Replay(binding, record.DeliveryID, null, null)).toEqual({ Supported: true, Changed: false });
        expect(await operator.Discard(binding, record.DeliveryID, 'unreadable', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
    });

    it('has no partitions', async () => {
        expect(await operator.ListPartitions(binding, 'Blocked', null, 50)).toBeNull();
    });
});
