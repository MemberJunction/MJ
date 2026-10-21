import { describe, it, expect } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';

describe('FormRecordRefreshCoordinator', () => {
    it('emits the record to every subscriber of Notify', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        const seen: BaseEntity[] = [];
        coordinator.Refreshed$.subscribe((record) => seen.push(record));

        const record = { ID: 'a' } as unknown as BaseEntity;
        coordinator.Notify(record);

        expect(seen).toEqual([record]);
    });

    it('does not replay to a subscriber that joins after Notify', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        coordinator.Notify({ ID: 'a' } as unknown as BaseEntity);

        const seen: BaseEntity[] = [];
        coordinator.Refreshed$.subscribe((record) => seen.push(record));

        expect(seen).toEqual([]);
    });

    it('emits both RemoteUpdated$ and Refreshed$ when NotifyRemoteUpdate is called', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        const remoteEvents: Array<{ record: BaseEntity; changed: string[] }> = [];
        const refreshedRecords: BaseEntity[] = [];

        coordinator.RemoteUpdated$.subscribe((evt) =>
            remoteEvents.push({ record: evt.record, changed: Array.from(evt.changedFieldNames) }),
        );
        coordinator.Refreshed$.subscribe((record) => refreshedRecords.push(record));

        const record = { ID: 'rec-1' } as unknown as BaseEntity;
        coordinator.NotifyRemoteUpdate(record, new Set(['nickname']));

        expect(remoteEvents).toEqual([{ record, changed: ['nickname'] }]);
        expect(refreshedRecords).toEqual([record]);
    });
});
