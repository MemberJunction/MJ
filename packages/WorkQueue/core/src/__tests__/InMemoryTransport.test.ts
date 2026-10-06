import { describe, it, expect } from 'vitest';
import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildMessages, BuildSubscriptionBinding, BuildTopicBinding, ManualClock } from '../testing/fixtures';
import { BuildWorkMessage } from '../validation';

const signal = new AbortController().signal;

describe('InMemoryTransport publish', () => {
    it('creates one delivery per matching subscription', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('email.events');
        const archive = BuildSubscriptionBinding(topic, 'email.archive');
        const clicks = BuildSubscriptionBinding(topic, 'email.clicks', { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] } });
        const results = await transport.Publish(
            topic,
            BuildMessages(topic, [{ Attributes: { eventType: 'open' } }, { Attributes: { eventType: 'click' } }]),
            [archive, clicks],
        );
        expect(results.map((result) => result.Status)).toEqual(['Accepted', 'Accepted']);
        expect(transport.Snapshot('email.archive')).toHaveLength(2);
        expect(transport.Snapshot('email.clicks')).toHaveLength(1);
    });

    it('reports a republished envelope as Duplicate, however the producer ordered its keys', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const id = crypto.randomUUID();
        const first = BuildWorkMessage('t', { MessageID: id, Attributes: { a: '1', b: '2' }, Payload: { x: 1, y: 2 } }, new Date('2026-01-01T00:00:00Z'), () => id);
        const retry = BuildWorkMessage('t', { MessageID: id, Attributes: { b: '2', a: '1' }, Payload: { y: 2, x: 1 } }, new Date('2026-01-01T00:05:00Z'), () => id);
        await transport.Publish(topic, [first], [subscription]);
        expect((await transport.Publish(topic, [retry], [subscription]))[0]).toEqual({ MessageID: id, Status: 'Duplicate' });
        expect(transport.Snapshot('s')).toHaveLength(1);
    });

    it('rejects a reused MessageID with a different envelope', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const id = crypto.randomUUID();
        await transport.Publish(topic, BuildMessages(topic, [{ MessageID: id, Attributes: { a: '1' } }]), [subscription]);
        const [result] = await transport.Publish(topic, BuildMessages(topic, [{ MessageID: id, Attributes: { a: '2' } }]), [subscription]);
        expect(result.Status).toBe('Rejected');
        expect(result.Error?.Code).toBe('MessageIDConflict');
    });

    it('treats MessageID as globally unique: the same ID on another topic is a conflict', async () => {
        const transport = new InMemoryTransport();
        const first = BuildTopicBinding('first.topic');
        const second = BuildTopicBinding('second.topic');
        const id = crypto.randomUUID();
        await transport.Publish(first, BuildMessages(first, [{ MessageID: id }]), [BuildSubscriptionBinding(first, 's1')]);
        const [result] = await transport.Publish(second, BuildMessages(second, [{ MessageID: id }]), [BuildSubscriptionBinding(second, 's2')]);
        expect(result.Error?.Code).toBe('MessageIDConflict');
        expect(transport.Snapshot('s2')).toHaveLength(0);
    });
});

describe('InMemoryTransport partition rules', () => {
    it('ignores partition keys for None subscriptions', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k' }, { PartitionKey: 'k' }]), [subscription]);
        expect(await transport.OpenConsumer(subscription).Receive(10, 0, signal)).toHaveLength(2);
        expect(transport.Snapshot('s').map((row) => row.PartitionKey)).toEqual([null, null]);
    });

    it('treats messages without a partition key as independent on an Exclusive subscription', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive' });
        await transport.Publish(topic, BuildMessages(topic, [{}, {}]), [subscription]);
        expect(await transport.OpenConsumer(subscription).Receive(10, 0, signal)).toHaveLength(2);
    });

    it('never returns two deliveries of one key from a single receive', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive' });
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'a' }, { PartitionKey: 'a' }, { PartitionKey: 'b' }]), [subscription]);
        const received = await transport.OpenConsumer(subscription).Receive(10, 0, signal);
        expect(received.map((delivery) => delivery.Message.PartitionKey)).toEqual(['a', 'b']);
    });

    it('an Ordered head in retry backoff holds its key; an Exclusive retry does not', async () => {
        for (const mode of ['Ordered', 'Exclusive'] as const) {
            const clock = new ManualClock();
            const transport = new InMemoryTransport({ Now: clock.Now });
            const topic = BuildTopicBinding('t');
            const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: mode });
            const consumer = transport.OpenConsumer(subscription);
            await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k', Attributes: { n: '1' } }, { PartitionKey: 'k', Attributes: { n: '2' } }]), [subscription]);
            const [head] = await consumer.Receive(10, 0, signal);
            await consumer.Retry(head, 60, 'busy');
            const next = await consumer.Receive(10, 0, signal);
            expect(next.map((delivery) => delivery.Message.Attributes.n)).toEqual(mode === 'Ordered' ? [] : ['2']);
        }
    });
});

describe('InMemoryTransport operator and sweep', () => {
    it('pages dead letters with a cursor', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{}, {}, {}]), [subscription]);
        for (const delivery of await consumer.Receive(10, 0, signal)) {
            await consumer.DeadLetter(delivery, 'Poison', null);
        }
        const firstPage = await transport.Operator().ListDeadLetters(subscription, null, 2);
        expect(firstPage?.Items).toHaveLength(2);
        expect(firstPage?.NextCursor).toBe('2');
        const secondPage = await transport.Operator().ListDeadLetters(subscription, firstPage?.NextCursor ?? null, 2);
        expect(secondPage?.Items).toHaveLength(1);
        expect(secondPage?.NextCursor).toBeNull();
    });

    it('reports stats from the injected clock', async () => {
        const clock = new ManualClock();
        const transport = new InMemoryTransport({ Now: clock.Now });
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{}, {}]), [subscription]);
        clock.Advance(5_000);
        const [delivery] = await consumer.Receive(1, 0, signal);
        await consumer.Complete(delivery);
        expect(await transport.Operator().GetStats(subscription)).toEqual({
            SubscriptionName: 's',
            Pending: 1,
            InFlight: 0,
            DeadLettered: 0,
            BlockedKeys: null,
            OldestPendingAgeSeconds: 5,
            CompletedLastHour: 1,
            AsOf: new Date(clock.Now()).toISOString(),
        });
    });

    it('derives partition conditions from the delivery rows', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Ordered' });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'blocked' }, { PartitionKey: 'blocked' }, { PartitionKey: 'busy' }, { PartitionKey: 'idle' }]), [subscription]);
        const received = await consumer.Receive(10, 0, signal);
        const byKey = new Map(received.map((delivery) => [delivery.Message.PartitionKey, delivery]));
        const blockedHead = byKey.get('blocked');
        const idleHead = byKey.get('idle');
        expect(blockedHead !== undefined && idleHead !== undefined).toBe(true);
        if (blockedHead !== undefined && idleHead !== undefined) {
            await consumer.DeadLetter(blockedHead, 'Poison', null);
            await consumer.Complete(idleHead);
        }
        const all = await transport.Operator().ListPartitions(subscription, null, null, 10);
        expect(all?.Items).toEqual([
            { PartitionKey: 'blocked', Condition: 'Blocked', HeadDeliveryID: blockedHead?.DeliveryID, WaitingItems: 1 },
            { PartitionKey: 'busy', Condition: 'InFlight', HeadDeliveryID: byKey.get('busy')?.DeliveryID, WaitingItems: 0 },
        ]);
        expect((await transport.Operator().ListPartitions(subscription, 'Idle', null, 10))?.Items.map((item) => item.PartitionKey)).toEqual(['idle']);
        expect((await transport.Operator().GetStats(subscription)).BlockedKeys).toBe(1);
    });

    it('hands out copies, so a handler cannot mutate the stored message', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ Attributes: { eventType: 'open' } }]), [subscription]);
        const [delivery] = await consumer.Receive(10, 0, signal);
        delivery.Message.Attributes.eventType = 'mutated';
        await consumer.Release(delivery);
        const [again] = await consumer.Receive(10, 0, signal);
        expect(again.Message.Attributes.eventType).toBe('open');
        expect(again.Attempt).toBe(1);
    });

    it('cancels in flight with a flag, fences every settle, and frees the key as soon as the holder acknowledges', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive', LeaseSeconds: 30 });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k' }, { PartitionKey: 'k' }]), [subscription]);
        const [delivery] = await consumer.Receive(10, 0, signal);

        expect(await transport.Operator().Discard(subscription, delivery.DeliveryID, 'operator cancelled', 'user-1')).toEqual({
            Supported: true,
            Changed: true,
            CancelRequested: true,
        });
        // The token is NOT rotated: the holder learns why it lost the delivery, and can acknowledge.
        expect(await consumer.ExtendLease(delivery, 30)).toBe('Cancelled');
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
        expect(await consumer.Retry(delivery, 5, 'x')).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
        expect(transport.Snapshot('s').find((row) => row.DeliveryID === delivery.DeliveryID)).toMatchObject({ Status: 'InFlight', CancelRequested: true });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);

        expect(await consumer.AcknowledgeCancel(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Discarded' });
        expect((await consumer.Receive(10, 0, signal)).length).toBe(1);
        // A second acknowledgement, or one for a delivery that was never cancelled, changes nothing.
        expect(await consumer.AcknowledgeCancel(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
    });

    it('discards a cancelled delivery at lease expiry when its holder is dead, and never retries it', async () => {
        const clock = new ManualClock();
        const transport = new InMemoryTransport({ Now: clock.Now });
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive', LeaseSeconds: 30 });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k' }, { PartitionKey: 'k' }]), [subscription]);
        const [delivery] = await consumer.Receive(10, 0, signal);
        await transport.Operator().Discard(subscription, delivery.DeliveryID, 'operator cancelled', null);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);

        clock.Advance(31_000);
        expect(transport.RunSweep()).toEqual({ ExpiredLeases: 1 });
        expect(transport.Snapshot('s').find((row) => row.DeliveryID === delivery.DeliveryID)?.Status).toBe('Discarded');
        expect((await consumer.Receive(10, 0, signal)).map((next) => next.DeliveryID)).not.toContain(delivery.DeliveryID);
    });

    it('declares Database-transport capabilities', () => {
        expect(new InMemoryTransport().Capabilities).toBe(IN_MEMORY_TRANSPORT_CAPABILITIES);
        expect(IN_MEMORY_TRANSPORT_CAPABILITIES).toMatchObject({ SupportsOrdered: true, SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, PeekDeadLetters: 'Full' });
    });
});
