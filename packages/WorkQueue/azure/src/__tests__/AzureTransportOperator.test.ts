import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { FakeServiceBusGateway } from '../testing/fakes';
import { TestAzureResources, TestAzureSubscriptionBinding, TestMessage } from '../testing/fixtures';

const r = TestAzureResources(true);
const signal = new AbortController().signal;
let fake: FakeServiceBusGateway;
let binding: SubscriptionBinding;
let operator: AzureTransportOperator;

async function seedDeadLetter(index: number, props: Record<string, string>, partitionKey?: string, reason?: string): Promise<void> {
    const message = TestMessage(index, partitionKey ? { PartitionKey: partitionKey } : {});
    await fake.Send(r.ServiceBusTopicName, {
        MessageId: message.MessageID,
        Body: JSON.stringify(message),
        ApplicationProperties: {},
        SessionId: partitionKey ?? `g-${index}`,
    });
    const [rec] = await fake.Receive({
        TopicName: r.ServiceBusTopicName,
        SubscriptionName: r.SubscriptionName,
        RequiresSession: true,
        MaxMessages: 1,
        MaxWaitTimeMs: 0,
    });
    await fake.DeadLetter({
        TopicName: r.ServiceBusTopicName,
        SubscriptionName: r.SubscriptionName,
        RequiresSession: true,
        LockToken: rec.LockToken,
        SessionId: rec.SessionId,
        Reason: reason ?? props[DEAD_LETTER_ATTRIBUTES.Reason] ?? 'MaxDeliveryCountExceeded',
        ErrorDescription: props[DEAD_LETTER_ATTRIBUTES.LastError] ?? 'boom',
        PropertiesToModify: props,
    });
}

beforeEach(() => {
    fake = new FakeServiceBusGateway()
        .AddTopic(r.ServiceBusTopicName)
        .AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: true });
    binding = TestAzureSubscriptionBinding(true);
    operator = new AzureTransportOperator(fake, fake, { Now: () => fake.Now });
});

describe('AzureTransportOperator', () => {
    it('GetStats returns active and dead-letter counts and throws for missing subscription', async () => {
        await fake.Send(r.ServiceBusTopicName, { MessageId: 'a', Body: '{}', ApplicationProperties: {}, SessionId: 's1' });
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

        await expect(operator.GetStats(TestAzureSubscriptionBinding(true, {
            Config: { ServiceBusTopicName: r.ServiceBusTopicName, SubscriptionName: 'missing', RequiresSession: true },
        }))).rejects.toThrow('does not exist');
    });

    it('ListDeadLetters peeks non-destructively and maps valid and invalid envelopes', async () => {
        await seedDeadLetter(1, {
            [DEAD_LETTER_ATTRIBUTES.Reason]: 'MaxAttemptsExceeded',
            [DEAD_LETTER_ATTRIBUTES.Attempts]: '5',
            [DEAD_LETTER_ATTRIBUTES.LastError]: 'boom',
            [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: '2026-09-16T12:00:00.000Z',
        }, 'subscriber-9');

        await fake.Send(r.ServiceBusTopicName, { MessageId: 'raw-1', Body: 'garbage', ApplicationProperties: {}, SessionId: 'g-raw' });
        const [rawRec] = await fake.Receive({
            TopicName: r.ServiceBusTopicName,
            SubscriptionName: r.SubscriptionName,
            RequiresSession: true,
            MaxMessages: 1,
            MaxWaitTimeMs: 0,
        });
        await fake.DeadLetter({
            TopicName: r.ServiceBusTopicName,
            SubscriptionName: r.SubscriptionName,
            RequiresSession: true,
            LockToken: rawRec.LockToken,
            SessionId: rawRec.SessionId,
            Reason: 'MaxDeliveryCountExceeded',
            ErrorDescription: '',
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
                DeliveryID: 'asb:raw-1',
                Reason: 'MaxDeliveryCountExceeded',
                LastError: 'raw body: garbage',
            }),
        ]);
        // Peek does not lock or settle dead-letter entries
        expect(fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(2);
        expect(await operator.ListPartitions(binding, 'Blocked', null, 50)).toBeNull();
    });

    it('Replay re-publishes with replay metadata and Discard removes dead-letter entries', async () => {
        await seedDeadLetter(7, { [DEAD_LETTER_ATTRIBUTES.Reason]: 'Fatal', [DEAD_LETTER_ATTRIBUTES.Attempts]: '3' }, 'subscriber-9');
        await seedDeadLetter(8, { [DEAD_LETTER_ATTRIBUTES.Reason]: 'Fatal', [DEAD_LETTER_ATTRIBUTES.Attempts]: '3' }, 'subscriber-10');

        expect(await operator.Replay(binding, TestMessage(7).MessageID, 'user-1', 'fixed downstream')).toEqual({
            Supported: true,
            Changed: true,
        });
        expect(fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(1);

        const [delivery] = await new ServiceBusTransportConsumer(fake, binding, { Now: () => fake.Now }).Receive(1, 0, signal);
        expect(delivery).toMatchObject({ Attempt: 1, IsReplay: true });
        expect(fake.Messages(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(1);

        expect(await operator.Replay(binding, 'missing-id', null, null)).toEqual({ Supported: true, Changed: false });
        expect(await operator.Discard(binding, TestMessage(8).MessageID, 'skip', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(fake.DeadLetters(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(0);
        expect(await operator.Discard(binding, 'missing-id', 'skip', 'user-1')).toEqual({ Supported: false });
        expect(REPLAY_ATTRIBUTE).toBe('mj_replay');
    });
});
