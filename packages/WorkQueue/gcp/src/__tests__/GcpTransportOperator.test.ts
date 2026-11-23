import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { PubSubTransportConsumer } from '../consumer/PubSubTransportConsumer';
import { GcpTransportOperator } from '../operator/GcpTransportOperator';
import { FakePubSubGateway } from '../testing/fakes';
import { TestGcpResources, TestGcpSubscriptionBinding, TestMessage } from '../testing/fixtures';

const r = TestGcpResources(true);
const signal = new AbortController().signal;
let fake: FakePubSubGateway;
let binding: SubscriptionBinding;
let operator: GcpTransportOperator;

async function seedDeadLetter(index: number, attrs: Record<string, string>, partitionKey?: string): Promise<void> {
    const message = TestMessage(index, partitionKey ? { PartitionKey: partitionKey } : {});
    await fake.Publish(r.DeadLetterTopicName, {
        MessageId: message.MessageID,
        Data: JSON.stringify(message),
        Attributes: {
            ...attrs,
            [DEAD_LETTER_ATTRIBUTES.SourceSubscription]: r.SubscriptionName,
            [DEAD_LETTER_ATTRIBUTES.SourceMessageId]: message.MessageID,
        },
        ...(partitionKey ? { OrderingKey: partitionKey } : {}),
    });
}

beforeEach(() => {
    fake = new FakePubSubGateway()
        .AddTopic(r.TopicName)
        .AddTopic(r.DeadLetterTopicName)
        .AddSubscription(r.DeadLetterTopicName, r.DeadLetterSubscriptionName, { EnableMessageOrdering: true })
        .AddSubscription(r.TopicName, r.SubscriptionName, {
            EnableMessageOrdering: true,
            DeadLetterTopicName: r.DeadLetterTopicName,
        });
    binding = TestGcpSubscriptionBinding(true);
    operator = new GcpTransportOperator(fake, fake, { Now: () => fake.Now });
});

describe('GcpTransportOperator', () => {
    it('GetStats returns active and dead-letter counts and throws for missing subscription', async () => {
        await fake.Publish(r.TopicName, { MessageId: 'a', Data: '{}', Attributes: {}, OrderingKey: 'k1' });
        await seedDeadLetter(1, { [DEAD_LETTER_ATTRIBUTES.Reason]: 'Fatal', [DEAD_LETTER_ATTRIBUTES.Attempts]: '1' });

        expect(await operator.GetStats(binding)).toEqual({
            SubscriptionName: 'email.unsubscribe',
            Pending: 1,
            InFlight: 0,
            DeadLettered: 1,
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(fake.Now).toISOString(),
        });

        await expect(operator.GetStats(TestGcpSubscriptionBinding(true, {
            Config: {
                TopicName: r.TopicName,
                SubscriptionName: 'missing-sub',
                EnableMessageOrdering: true,
            },
        }))).rejects.toThrow('does not exist');
    });

    it('ListDeadLetters inspects non-destructively and maps valid and invalid envelopes', async () => {
        await seedDeadLetter(1, {
            [DEAD_LETTER_ATTRIBUTES.Reason]: 'MaxAttemptsExceeded',
            [DEAD_LETTER_ATTRIBUTES.Attempts]: '5',
            [DEAD_LETTER_ATTRIBUTES.LastError]: 'boom',
            [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: '2026-09-16T12:00:00.000Z',
        }, 'subscriber-9');

        await fake.Publish(r.DeadLetterTopicName, {
            MessageId: 'raw-1',
            Data: 'garbage',
            Attributes: {},
            OrderingKey: 'k-raw',
        });

        const page = await operator.ListDeadLetters(binding, null, 50);
        expect(page?.NextCursor).toBeNull();
        expect(page?.Items).toEqual([
            {
                DeliveryID: TestMessage(1).MessageID,
                Message: TestMessage(1, { PartitionKey: 'subscriber-9' }),
                PartitionKey: 'subscriber-9',
                Attempts: 5,
                Reason: 'MaxAttemptsExceeded',
                LastError: 'boom',
                DeadLetteredAt: '2026-09-16T12:00:00.000Z',
                BlocksKey: false,
            },
            expect.objectContaining({
                DeliveryID: expect.stringMatching(/^gcp:/),
                Reason: 'MaxDeliveryAttemptsExceeded',
                LastError: 'raw body: garbage',
            }),
        ]);
        // Non-destructive inspection leaves both entries on the DLQ subscription
        expect(fake.Messages(r.DeadLetterSubscriptionName)).toHaveLength(2);
        expect(await operator.ListPartitions(binding, 'Blocked', null, 50)).toBeNull();
    });

    it('Replay re-publishes with replay metadata and Discard removes dead-letter entries', async () => {
        await seedDeadLetter(7, { [DEAD_LETTER_ATTRIBUTES.Reason]: 'Fatal', [DEAD_LETTER_ATTRIBUTES.Attempts]: '3' }, 'subscriber-9');
        await seedDeadLetter(8, { [DEAD_LETTER_ATTRIBUTES.Reason]: 'Fatal', [DEAD_LETTER_ATTRIBUTES.Attempts]: '3' }, 'subscriber-10');

        expect(await operator.Replay(binding, TestMessage(7).MessageID, 'user-1', 'fixed downstream')).toEqual({
            Supported: true,
            Changed: true,
        });
        expect(fake.Messages(r.DeadLetterSubscriptionName)).toHaveLength(1);

        const [delivery] = await new PubSubTransportConsumer(fake, binding, { Now: () => fake.Now }).Receive(1, 0, signal);
        expect(delivery).toMatchObject({ Attempt: 1, IsReplay: true });
        expect(fake.Messages(r.SubscriptionName)).toHaveLength(1);

        expect(await operator.Replay(binding, 'missing-id', null, null)).toEqual({ Supported: true, Changed: false });
        expect(await operator.Discard(binding, TestMessage(8).MessageID, 'skip', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(fake.Messages(r.DeadLetterSubscriptionName)).toHaveLength(0);
        expect(await operator.Discard(binding, 'missing-id', 'skip', 'user-1')).toEqual({ Supported: false });
        expect(REPLAY_ATTRIBUTE).toBe('mj_replay');
    });
});
