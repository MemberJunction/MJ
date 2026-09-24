import { describe, it, expect } from 'vitest';
import type { ReceivedDelivery, SubscriptionPolicy } from '@memberjunction/work-queue-core';
import { DatabaseTransportConsumer } from '../transports/database/DatabaseTransportConsumer';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { RecordingExecutor, SubscriptionBindingFixture, TestDeps } from './fakes';

const CLAIMED = {
    DeliveryID: 'EEEEEEEE-0000-0000-0000-000000000001', AttemptCount: 1, LeaseToken: 'FFFFFFFF-0000-0000-0000-000000000001',
    LeaseExpiresAt: new Date('2026-01-01T00:01:00Z'), IsReplay: 0, MessageID: 'M1', PartitionKey: 'venue-42',
    Attributes: '{"a":"b"}', Payload: '{"x":1}', PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
};

function Consumer(source: RecordingExecutor, policy: Partial<SubscriptionPolicy> = {}, events: DeadLetteredEvent[] = []): DatabaseTransportConsumer {
    const deps = { ...TestDeps(source), NotifyDeadLettered: (event: DeadLetteredEvent) => { events.push(event); } };
    return new DatabaseTransportConsumer(source, CreateWorkQueueSqlBuilder(source), SubscriptionBindingFixture(policy), deps, 'host:1:abcd');
}

function Delivery(): ReceivedDelivery {
    return {
        DeliveryID: CLAIMED.DeliveryID, LeaseToken: CLAIMED.LeaseToken, Attempt: 1, IsReplay: false,
        LeaseExpiresAt: new Date(), Message: { MessageID: 'M1', Topic: 'import.ready', PartitionKey: 'venue-42', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z' },
    };
}

describe('DatabaseTransportConsumer executor ownership (03 §11, F8)', () => {
    it('runs every statement on its own independent executor, outside any transaction, and releases it on Close', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([CLAIMED]).QueueRows([{ AffectedRows: 1 }]);
        const consumer = Consumer(source);
        const [delivery] = await consumer.Receive(5, 0, new AbortController().signal);
        await consumer.Complete(delivery);
        await consumer.Close();
        expect(source.CallsOn('source')).toHaveLength(0);
        expect(source.CallsOn('independent#1')).toHaveLength(3);
        expect(source.Calls.every(call => !call.InTransaction)).toBe(true);
        expect(source.Events).toEqual(['independent', 'release']);
    });
});

describe('DatabaseTransportConsumer.Receive', () => {
    it('expires leases, then claims keyless deliveries for None subscriptions', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([CLAIMED]);
        const deliveries = await Consumer(source).Receive(5, 20, new AbortController().signal);
        expect(source.Calls[0].SQL).toContain('[spWorkQueueExpireLeases]');
        expect(source.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 5]);
        expect(source.Calls[1].SQL).toContain('[spWorkQueueClaimUnpartitioned]');
        expect(source.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 'host:1:abcd', 60, 5]);
        expect(deliveries[0]).toMatchObject({ DeliveryID: CLAIMED.DeliveryID.toLowerCase(), LeaseToken: CLAIMED.LeaseToken.toLowerCase(), Attempt: 1, IsReplay: false, LeaseExpiresAt: CLAIMED.LeaseExpiresAt });
        expect(deliveries[0].Message).toMatchObject({ Topic: 'import.ready', PartitionKey: 'venue-42', Payload: { x: 1 } });
    });

    it('raises a dead-letter event for every row the expire pass dead-lettered, with the reason the procedure wrote', async () => {
        const events: DeadLetteredEvent[] = [];
        const source = new RecordingExecutor()
            .QueueRows([{ DeliveryID: 'D9', SubscriptionID: 'S', PartitionKey: 'venue-1', Reason: 'LeaseExpired' }])
            .QueueRows([]);
        await Consumer(source, {}, events).Receive(1, 0, new AbortController().signal);
        expect(events).toEqual([{ SubscriptionName: 'venue-import', DeliveryID: 'D9', Reason: 'LeaseExpired', PartitionKey: 'venue-1' }]);
    });

    it('keeps the first candidate per key, skips a key lost to another worker, then fills with keyless rows', async () => {
        const lost = Object.assign(new Error("Cannot insert duplicate key row with unique index 'UQ_WorkQueueDelivery_InFlightPartition'"), { number: 2601 });
        const source = new RecordingExecutor()
            .QueueRows([])                                                                                  // ExpireLeases
            .QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }, { DeliveryID: 'D1b', PartitionKey: 'k1' }, { DeliveryID: 'D2', PartitionKey: 'k2' }])
            .QueueError(lost)                                                                               // D1: another worker won k1
            .QueueRows([CLAIMED])                                                                           // D2 claimed
            .QueueRows([]);                                                                                 // keyless fill
        const deliveries = await Consumer(source, { PartitionMode: 'Exclusive' }).Receive(2, 0, new AbortController().signal);
        expect(deliveries).toHaveLength(1);
        expect(source.Calls[1].SQL).toContain('[spWorkQueueSelectPartitionCandidates]');
        expect(source.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', false, 8]);        // Exclusive, max × CANDIDATE_OVERSCAN
        expect(source.Calls[2].SQL).toContain('[spWorkQueueClaimPartitionCandidate]');
        expect(source.Calls.map(call => call.Params[1])).not.toContain('D1b');                              // never two claims for one key
        expect(source.Calls).toHaveLength(5);
        expect(source.Calls[4].SQL).toContain('[spWorkQueueClaimUnpartitioned]');
        expect(source.Calls[4].Params[3]).toBe(1);
    });

    it('stops claiming candidates once it has enough, and passes the Ordered flag', async () => {
        const source = new RecordingExecutor()
            .QueueRows([])
            .QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }, { DeliveryID: 'D2', PartitionKey: 'k2' }])
            .QueueRows([CLAIMED]);
        const deliveries = await Consumer(source, { PartitionMode: 'Ordered' }).Receive(1, 0, new AbortController().signal);
        expect(deliveries).toHaveLength(1);
        expect(source.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', true, 4]);
        expect(source.Calls[2].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 'D1', true, 'host:1:abcd', 60]);
        expect(source.Calls).toHaveLength(3);                                                               // no D2 claim, no keyless fill
    });

    it('rethrows claim errors that are not a lost key', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }]).QueueError(new Error('connection reset'));
        await expect(Consumer(source, { PartitionMode: 'Ordered' }).Receive(1, 0, new AbortController().signal)).rejects.toThrow('connection reset');
    });

    it('does nothing when already aborted', async () => {
        const source = new RecordingExecutor();
        const controller = new AbortController();
        controller.abort();
        expect(await Consumer(source).Receive(5, 0, controller.signal)).toEqual([]);
        expect(source.Calls).toHaveLength(0);
    });
});

describe('DatabaseTransportConsumer leases', () => {
    it('extends the lease with serialised progress', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60, { Percent: 40 })).toBe('Held');
        expect(source.Calls[0].SQL).toContain('[spWorkQueueExtendLease]');
        expect(source.Calls[0].Params[3]).toBe('{"Percent":40}');
        expect(source.Calls).toHaveLength(1);
    });

    it('reports Lost when the token no longer holds the delivery', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60)).toBe('Lost');
    });

    it('reports Cancelled when the delivery is still held but an operator asked it to stop', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([{ CancelRequested: 1 }]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60)).toBe('Cancelled');
        expect(source.Calls[1].SQL).toContain('[spWorkQueueSelectLeaseState]');
    });

    it('lets a transport error propagate, so the runtime retries on the next tick instead of aborting', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(Consumer(source).ExtendLease(Delivery(), 60)).rejects.toThrow('connection reset');
    });
});

describe('DatabaseTransportConsumer settles', () => {
    it('completes with one guarded write and no transaction', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await Consumer(source).Complete(Delivery())).toEqual({ Kind: 'Settled', DeliveryID: CLAIMED.DeliveryID, Status: 'Completed' });
        expect(source.Calls[0].SQL).toContain('[spWorkQueueCompleteDelivery]');
        expect(source.Calls[0].Params).toEqual([CLAIMED.DeliveryID, CLAIMED.LeaseToken]);
        expect(source.Events).toEqual(['independent']);
    });

    it('reports LeaseLost when completion matches no row', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        expect(await Consumer(source).Complete(Delivery())).toEqual({ Kind: 'LeaseLost', DeliveryID: CLAIMED.DeliveryID });
    });

    it('acknowledges a cancel as Discarded, and reports LeaseLost when there is nothing to acknowledge', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 0 }]);
        const consumer = Consumer(source);
        expect(await consumer.AcknowledgeCancel(Delivery())).toEqual({ Kind: 'Settled', DeliveryID: CLAIMED.DeliveryID, Status: 'Discarded' });
        expect(source.Calls[0].SQL).toContain('[spWorkQueueAcknowledgeCancel]');
        expect(await consumer.AcknowledgeCancel(Delivery())).toEqual({ Kind: 'LeaseLost', DeliveryID: CLAIMED.DeliveryID });
    });

    it('maps retry, dead letter and release to their statuses, and raises a dead-letter event', async () => {
        const events: DeadLetteredEvent[] = [];
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const consumer = Consumer(source, {}, events);
        expect(await consumer.Retry(Delivery(), 30.4, 'boom')).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(source.Calls[0].Params).toEqual([CLAIMED.DeliveryID, CLAIMED.LeaseToken, 30, 'boom']);
        expect(await consumer.DeadLetter(Delivery(), 'Poison', null)).toMatchObject({ Kind: 'Settled', Status: 'DeadLettered' });
        expect(await consumer.Release(Delivery())).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(events).toEqual([{ SubscriptionName: 'venue-import', DeliveryID: CLAIMED.DeliveryID, Reason: 'Poison', PartitionKey: 'venue-42' }]);
    });

    it('reports infrastructure failures as Failed', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        expect(await Consumer(source).Retry(Delivery(), 30, 'boom')).toEqual({ Kind: 'Failed', DeliveryID: CLAIMED.DeliveryID, Error: 'connection reset' });
    });
});
