import { describe, it, expect } from 'vitest';
import { FakeServiceBus } from '../testing/fakes';

const T = 'topic';

function bus(): FakeServiceBus {
    return new FakeServiceBus().AddTopic(T, { RequiresDuplicateDetection: true })
        .AddSubscription(T, 'all', { MjSubscriptionName: 'all', RequiresSession: false, LockDurationSeconds: 10, MaxDeliveryCount: 2 })
        .AddSubscription(T, 'clicks', { MjSubscriptionName: 'clicks', RequiresSession: false, Filter: { logic: 'and', filters: [{ field: 'kind', operator: 'eq', value: 'click' }] } });
}

describe('FakeServiceBus', () => {
    it('fans out by filter and targeting, and swallows duplicate MessageIds', async () => {
        const b = bus();
        await b.Send(T, [{ MessageId: '1', Body: '{}', ApplicationProperties: { kind: 'open' } }, { MessageId: '2', Body: '{}', ApplicationProperties: { kind: 'click' } }]);
        await b.Send(T, [{ MessageId: '2', Body: '{}', ApplicationProperties: { kind: 'click' } }, { MessageId: '3', Body: '{}', ApplicationProperties: { kind: 'click', mj_target: 'all' } }]);
        expect(b.Messages(T, 'all').map((m) => m.MessageId)).toEqual(['1', '2', '3']);
        expect(b.Messages(T, 'clicks').map((m) => m.MessageId)).toEqual(['2']);
    });

    it('locks on receive, expires locks, and dead-letters past MaxDeliveryCount', async () => {
        const b = bus();
        await b.Send(T, [{ MessageId: '1', Body: '{}', ApplicationProperties: {} }]);
        const request = { TopicName: T, SubscriptionName: 'all', RequiresSession: false, MaxMessages: 10, WaitMs: 0 };
        const [first] = await b.Receive(request);
        expect(first.DeliveryCount).toBe(1);
        expect(await b.Receive(request)).toEqual([]);
        b.Advance(11);
        const [second] = await b.Receive(request);
        expect(second.DeliveryCount).toBe(2);
        expect(await b.Complete(first)).toBe(false);
        expect(await b.RenewLock(second)).toBe(b.Now + 10_000);
        await b.Abandon(second);
        expect(await b.Receive(request)).toEqual([]);
        expect(b.DeadLetters(T, 'all').map((m) => m.DeadLetterReason)).toEqual(['MaxDeliveryCountExceeded']);
    });

    it('schedules messages and peeks the dead-letter subqueue from a sequence number', async () => {
        const b = bus();
        await b.Schedule(T, [{ MessageId: '1', Body: '{}', ApplicationProperties: {} }], new Date(b.Now + 5_000));
        const request = { TopicName: T, SubscriptionName: 'all', RequiresSession: false, MaxMessages: 10, WaitMs: 0 };
        expect(await b.Receive(request)).toEqual([]);
        b.Advance(5);
        const [m] = await b.Receive(request);
        await b.DeadLetter(m, { Reason: 'Poison', Description: 'd', Properties: { mj_dead_letter_reason: 'Poison' } });
        const [dead] = await b.Peek({ TopicName: T, SubscriptionName: 'all', DeadLetter: true, FromSequenceNumber: null, MaxMessages: 10 });
        expect(dead.DeadLetterReason).toBe('Poison');
        expect(dead.LockToken).toBeNull();
        expect(await b.Peek({ TopicName: T, SubscriptionName: 'all', DeadLetter: true, FromSequenceNumber: String(Number(dead.SequenceNumber) + 1), MaxMessages: 10 })).toEqual([]);
    });

    it('records calls and injects a failure once', async () => {
        const b = bus();
        b.FailNext('Send', new Error('down'));
        await expect(b.Send(T, [])).rejects.toThrow('down');
        await b.Send(T, []);
        expect(b.Calls.filter((c) => c.Op === 'Send')).toHaveLength(2);
    });
});
