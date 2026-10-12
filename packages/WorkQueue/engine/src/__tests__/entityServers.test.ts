import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { CheckPartitionModeChange } from '../entities/partitionModeChange';
import {
    DRIVER_OWNED_STATE_MESSAGE, MJWorkQueueDeduplicationEntityServer, MJWorkQueueDeliveryEntityServer, MJWorkQueueMessageEntityServer,
} from '../entities/DriverOwnedEntityServers';

/**
 * The smallest EntityInfo BaseEntity's constructor accepts: a name, an Active status and no fields. The guards never
 * read a field, so nothing else is needed — and no metadata provider or database is involved.
 */
function StubEntityInfo(name: string): EntityInfo {
    return new EntityInfo({ ID: '00000000-0000-0000-0000-000000000001', Name: name, Status: 'Active', EntityFields: [] });
}

describe('driver-owned state guards', () => {
    const guards = [
        { Build: () => new MJWorkQueueDeliveryEntityServer(StubEntityInfo(WorkQueueEntityNames.Deliveries)), Name: 'Delivery' },
        { Build: () => new MJWorkQueueMessageEntityServer(StubEntityInfo(WorkQueueEntityNames.Messages)), Name: 'Message' },
        { Build: () => new MJWorkQueueDeduplicationEntityServer(StubEntityInfo(WorkQueueEntityNames.Deduplications)), Name: 'Deduplication' },
    ];

    it.each(guards)('$Name refuses Save and Delete and reports why', async ({ Build }) => {
        const entity: BaseEntity = Build();
        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.Message).toBe(DRIVER_OWNED_STATE_MESSAGE);
        expect(entity.LatestResult?.Type).toBe('create');
        expect(await entity.Delete()).toBe(false);
        expect(entity.LatestResult?.Type).toBe('delete');
    });

    it('names the operator actions that exist', () => {
        expect(DRIVER_OWNED_STATE_MESSAGE).toContain('Replay / Discard');
    });
});

describe('CheckPartitionModeChange (F11)', () => {
    const changed = { IsSaved: true, Changed: true, OldValue: 'None', NewValue: 'Ordered' };

    it('rejects a change once the subscription has deliveries', async () => {
        const issue = await CheckPartitionModeChange(changed, async () => true);
        expect(issue).toEqual({
            Field: 'PartitionMode',
            Message: "PartitionMode cannot change from 'None' to 'Ordered' once the subscription has deliveries; create a new subscription instead",
            Value: 'Ordered',
        });
    });

    it('allows the change while the subscription has no deliveries', async () => {
        expect(await CheckPartitionModeChange(changed, async () => false)).toBeNull();
    });

    it('never queries for new records or unchanged modes', async () => {
        let asked = 0;
        const probe = async () => { asked++; return true; };
        expect(await CheckPartitionModeChange({ ...changed, IsSaved: false }, probe)).toBeNull();
        expect(await CheckPartitionModeChange({ ...changed, Changed: false }, probe)).toBeNull();
        expect(asked).toBe(0);
    });
});
