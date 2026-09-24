import { describe, it, expect } from 'vitest';
import { DatabaseTransportOperator } from '../transports/database/DatabaseTransportOperator';
import { EncodeCursor } from '../transports/database/rowMapping';
import { RecordingExecutor, SubscriptionBindingFixture, TestDeps } from './fakes';

const DELIVERY = 'EEEEEEEE-0000-0000-0000-000000000001';
const USER = '11111111-0000-0000-0000-000000000001';

function DeadLetterRowFixture(id: string): object {
    return {
        DeliveryID: id, AttemptCount: 5, DeadLetterReason: 'MaxAttemptsExceeded', LastError: 'boom',
        DeadLetteredAt: new Date('2026-01-01T00:00:00Z'), DeliveryPartitionKey: 'venue-42', BlocksKey: 1,
        MessageID: 'M1', PartitionKey: 'venue-42', Attributes: '{}', Payload: '{"a":1}',
        PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
    };
}

describe('DatabaseTransportOperator executor ownership (03 §11, F8)', () => {
    it('runs every statement on its own independent executor, never on the shared source', async () => {
        const source = new RecordingExecutor()
            .QueueRows([{ Pending: 0, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: null, CompletedLastHour: 0 }])
            .QueueRows([{ AffectedRows: 1 }]);
        const operator = new DatabaseTransportOperator(source, TestDeps(source));
        await operator.GetStats(SubscriptionBindingFixture());
        await operator.Replay(SubscriptionBindingFixture(), DELIVERY, null, null);
        expect(source.CallsOn('source')).toHaveLength(0);
        expect(source.CallsOn('independent#1')).toHaveLength(2);
        expect(source.Calls.every(call => !call.InTransaction)).toBe(true);
    });

    it('releases its executor on Close', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const operator = new DatabaseTransportOperator(source, TestDeps(source));
        await operator.Replay(SubscriptionBindingFixture(), DELIVERY, null, null);
        await operator.Close();
        expect(source.Events).toEqual(['independent', 'release']);
    });
});

describe('DatabaseTransportOperator.GetStats', () => {
    it('maps counts, reports blocked keys only for Ordered subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([{
            Pending: '3', InFlight: 1, DeadLettered: 2, BlockedKeys: 1, OldestPendingAgeSeconds: 12, CompletedLastHour: null,
        }]);
        const stats = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .GetStats(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }));
        expect(stats).toMatchObject({
            SubscriptionName: 'venue-import', Pending: 3, InFlight: 1, DeadLettered: 2, BlockedKeys: 1,
            OldestPendingAgeSeconds: 12, CompletedLastHour: 0,
        });
        expect(executor.Calls[0].SQL).toContain('[spWorkQueueSubscriptionStats]');
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', true]);
    });

    it('returns null blocked keys for unordered subscriptions and never a negative age', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Pending: 1, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: -30, CompletedLastHour: 0 }]);
        const stats = await new DatabaseTransportOperator(executor, TestDeps(executor)).GetStats(SubscriptionBindingFixture());
        expect(stats.BlockedKeys).toBeNull();
        expect(stats.OldestPendingAgeSeconds).toBe(0);      // every pending row is still in backoff
    });
});

describe('DatabaseTransportOperator.ListDeadLetters', () => {
    it('fetches one extra row to decide whether there is a next page', async () => {
        const executor = new RecordingExecutor().QueueRows([DeadLetterRowFixture('D1'), DeadLetterRowFixture('D2'), DeadLetterRowFixture('D3')]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListDeadLetters(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), null, 2);
        expect(page?.Items.map(i => i.DeliveryID)).toEqual(['D1', 'D2']);
        expect(page?.NextCursor).toBe(EncodeCursor({ DeliveryID: 'D2' }));
        expect(page?.Items[0]).toMatchObject({ Attempts: 5, Reason: 'MaxAttemptsExceeded', BlocksKey: true, PartitionKey: 'venue-42' });
        expect(page?.Items[0].Message.Payload).toEqual({ a: 1 });
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', true, null, 3]);
    });

    it('passes a decoded cursor to the keyset', async () => {
        const executor = new RecordingExecutor().QueueRows([]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListDeadLetters(SubscriptionBindingFixture(), EncodeCursor({ DeliveryID: 'D2' }), 10);
        expect(executor.Calls[0].Params).toContain('D2');
        expect(page).toEqual({ Items: [], NextCursor: null });
    });
});

describe('DatabaseTransportOperator.ListPartitions', () => {
    it('returns an empty page for unpartitioned subscriptions without querying', async () => {
        const executor = new RecordingExecutor();
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor)).ListPartitions(SubscriptionBindingFixture(), null, null, 10);
        expect(page).toEqual({ Items: [], NextCursor: null });
        expect(executor.Calls).toHaveLength(0);
    });

    it('maps partition rows to the 03 §5.2 record', async () => {
        const executor = new RecordingExecutor().QueueRows([{
            PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, WaitingItems: '4',
        }]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListPartitions(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), 'Blocked', null, 10);
        expect(page?.Items).toEqual([{ PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, WaitingItems: 4 }]);
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', true, 'Blocked', null, 11]);
    });
});

describe('DatabaseTransportOperator resolutions', () => {
    it('replays a dead letter, truncating the note, and reports a change', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Replay(SubscriptionBindingFixture(), DELIVERY, null, 'n'.repeat(1200));
        expect(result).toEqual({ Supported: true, Changed: true });
        expect(executor.Calls[0].SQL).toContain('[spWorkQueueReplayDelivery]');
        expect(String(executor.Calls[0].Params[3])).toHaveLength(1000);
    });

    it('does not touch the database for a malformed delivery ID', async () => {
        const executor = new RecordingExecutor();
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor)).Replay(SubscriptionBindingFixture(), 'nope', null, null);
        expect(result).toEqual({ Supported: true, Changed: false });
        expect(executor.Calls).toHaveLength(0);
    });

    it('discards a pending or dead-lettered delivery with one guarded statement', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), DELIVERY, 'bad batch', null);
        expect(result).toEqual({ Supported: true, Changed: true });       // CancelRequested is absent: nothing was in flight
        expect(executor.Calls).toHaveLength(1);
        expect(executor.Calls[0].SQL).toContain('[spWorkQueueDiscardDelivery]');
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', DELIVERY, true, null, 'bad batch']);
        expect(executor.Events).toEqual(['independent']);                 // no transaction
    });

    it('sets the cancel flag when the delivery is in flight, leaving the token unchanged', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])       // DiscardDelivery matched nothing (row is InFlight)
            .QueueRows([{ AffectedRows: 1 }]);      // CancelInFlightDelivery set the flag
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'operator cancelled', USER);
        expect(result).toEqual({ Supported: true, Changed: true, CancelRequested: true });
        expect(executor.Calls[1].SQL).toContain('[spWorkQueueCancelInFlightDelivery]');
        expect(executor.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', DELIVERY, USER, 'operator cancelled']);
    });

    it('tries the pair again when the status flipped between the two statements', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }]).QueueRows([{ AffectedRows: 0 }])     // in flight, then back to Pending in between
            .QueueRows([{ AffectedRows: 1 }]);                                     // second pass discards it
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'cancel', null);
        expect(result).toEqual({ Supported: true, Changed: true });
        expect(executor.Calls).toHaveLength(3);
    });

    it('reports no change when the delivery is already completed', async () => {
        const executor = new RecordingExecutor();      // every statement affects 0 rows
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'too late', null);
        expect(result).toEqual({ Supported: true, Changed: false });
        expect(executor.Calls).toHaveLength(4);
    });
});

describe('DatabaseTransportOperator backlog and prerequisites', () => {
    it('reports the autoscaler backlog as capped claimable plus in-flight counts', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Claimable: '7', InFlight: 2 }]);
        const backlog = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .GetBacklog(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }));
        expect(backlog).toEqual({ Claimable: 7, InFlight: 2, Capped: false });
        expect(executor.Calls[0].SQL).toContain('[spWorkQueueSubscriptionBacklog]');
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 'Ordered', 1000]);
    });

    it('flags a capped backlog', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Claimable: 1400, InFlight: 3 }]);      // keyless + keyed halves, each capped
        const backlog = await new DatabaseTransportOperator(executor, TestDeps(executor)).GetBacklog(SubscriptionBindingFixture({ PartitionMode: 'Exclusive' }));
        expect(backlog).toEqual({ Claimable: 1000, InFlight: 3, Capped: true });
    });

    it('reports an Error when READ_COMMITTED_SNAPSHOT is off, and nothing when it is on', async () => {
        const off = new RecordingExecutor().QueueRows([{ SnapshotOn: 0 }]);
        const issues = await new DatabaseTransportOperator(off, TestDeps(off)).CheckPrerequisites();
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ Severity: 'Error', Subject: 'Database transport' });
        expect(issues[0].Message).toContain('READ_COMMITTED_SNAPSHOT');
        const on = new RecordingExecutor().QueueRows([{ SnapshotOn: true }]);
        expect(await new DatabaseTransportOperator(on, TestDeps(on)).CheckPrerequisites()).toEqual([]);
    });
});
