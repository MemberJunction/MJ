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
});
