import { describe, it, expect } from 'vitest';
import { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { RecordingExecutor, TEST_USER } from './fakes';

const TOPIC = 'AAAAAAAA-0000-0000-0000-000000000001';
const MSG = 'CCCCCCCC-0000-0000-0000-000000000001';
const OTHER = 'CCCCCCCC-0000-0000-0000-000000000002';

describe('DeduplicationLedger.Reserve (03 §2.1, F1)', () => {
    it('reserves a free or expired key in one statement', async () => {
        const executor = new RecordingExecutor().QueueRows([{ MessageID: MSG, Status: 'Reserved' }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Reserved' });
        expect(executor.Calls).toHaveLength(1);
        expect(executor.Calls[0].SQL).toContain('[spWorkQueueReserveDeduplication]');
        expect(executor.Calls[0].Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reports Duplicate only for a Confirmed owner', async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: OTHER, Status: 'Confirmed' }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
        expect(executor.Calls[1].SQL).toContain('[spWorkQueueSelectDeduplicationOwner]');
    });

    it('reports its own Confirmed row as a Duplicate: the earlier publish succeeded', async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: MSG.toLowerCase(), Status: 'Confirmed' }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG))
            .toEqual({ Kind: 'Duplicate', OwnerMessageID: MSG.toLowerCase() });
    });

    it("reports Pending, never Duplicate, for another message's unexpired reservation", async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: OTHER, Status: 'Reserved' }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG))
            .toEqual({ Kind: 'Pending', OwnerMessageID: OTHER });
    });

    it('treats a unique-constraint race on the key as "not taken" and reads the winner', async () => {
        const race = Object.assign(new Error("Violation of UNIQUE KEY constraint 'UQ_WorkQueueDeduplication_Topic_Key'"), { number: 2627 });
        const executor = new RecordingExecutor()
            .QueueError(race)                                              // reserve: lost the insert race
            .QueueRows([{ MessageID: OTHER, Status: 'Confirmed' }]);      // owner: the winner, already confirmed
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
        expect(executor.Calls).toHaveLength(2);
    });

    it('a race on a different unique index is not a key race', async () => {
        const other = Object.assign(new Error("Violation of UNIQUE KEY constraint 'UQ_WorkQueueDelivery_Subscription_Message'"), { number: 2627 });
        const executor = new RecordingExecutor().QueueError(other);
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow('UQ_WorkQueueDelivery_Subscription_Message');
        expect(executor.Calls).toHaveLength(1);
    });

    it('tries again when the owner vanished between the two statements, then reserves', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([]).QueueRows([])                                   // attempt 1: not taken, no owner visible
            .QueueRows([{ MessageID: MSG, Status: 'Reserved' }]);         // attempt 2: taken
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).toEqual({ Kind: 'Reserved' });
        expect(executor.Calls).toHaveLength(3);
    });

    it('fails loudly when no attempt resolves the key', async () => {
        const executor = new RecordingExecutor();      // every statement answers with no rows
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow("key 'k1'");
        expect(executor.Calls).toHaveLength(6);
    });

    it('does not swallow errors that are not a race on the key', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow('connection reset');
    });
});

describe('DeduplicationLedger confirm, release and purge', () => {
    it('confirms with the TTL and reports success', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Confirm(TOPIC, 'k1', MSG, 86400)).toBe(true);
        expect(executor.Calls[0].Params).toEqual([TOPIC, 'k1', MSG, 86400]);
    });

    it('reports a failed release when nothing matched', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Release(TOPIC, 'k1', MSG)).toBe(false);
    });

    it('purges in batches until a batch comes back short', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 2 }])
            .QueueRows([{ AffectedRows: 1 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).PurgeExpired(2, 10)).toBe(3);
        expect(executor.Calls).toHaveLength(2);
    });

    it('stops purging at the batch limit', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 2 }])
            .QueueRows([{ AffectedRows: 2 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).PurgeExpired(2, 2)).toBe(4);
        expect(executor.Calls).toHaveLength(2);
    });
});
