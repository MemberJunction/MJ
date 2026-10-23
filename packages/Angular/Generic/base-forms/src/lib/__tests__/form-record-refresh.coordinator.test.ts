import { describe, it, expect } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import {
    FormRecordRefreshCoordinator,
    type FormFieldConflict,
    type FormRemoteUpdateEvent,
    type FormSingleFieldRestoreRequest,
    type FormVersionPreviewState
} from '../form-record-refresh.coordinator';

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

    it('tracks autoMergedPreviousValues and conflicts via NotifyRemoteUpdate', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        const remoteEvents: FormRemoteUpdateEvent[] = [];
        const conflictSnapshots: Array<ReadonlyMap<string, FormFieldConflict>> = [];

        coordinator.RemoteUpdated$.subscribe((evt) => remoteEvents.push(evt));
        coordinator.ConflictsChanged$.subscribe((map) => conflictSnapshots.push(map));

        const record = { ID: 'rec-2' } as unknown as BaseEntity;
        const autoMerged = new Map<string, unknown>([['status', 'Pending']]);
        const priceConflict: FormFieldConflict = {
            fieldName: 'Price',
            previousServerValue: 100,
            incomingServerValue: 125,
            localEditedValue: 110
        };
        const conflicts = new Map<string, FormFieldConflict>([['price', priceConflict]]);

        coordinator.NotifyRemoteUpdate(record, new Set(['status', 'price']), autoMerged, conflicts);

        expect(remoteEvents).toHaveLength(1);
        expect(remoteEvents[0].autoMergedPreviousValues?.get('status')).toBe('Pending');
        expect(remoteEvents[0].conflicts?.get('price')).toEqual(priceConflict);
        expect(coordinator.ActiveConflicts.size).toBe(1);
        expect(coordinator.ActiveConflicts.get('price')).toEqual(priceConflict);
        expect(conflictSnapshots).toHaveLength(1);
        expect(conflictSnapshots[0].get('price')).toEqual(priceConflict);
    });

    it('resolves individual conflicts case-insensitively and clears all conflicts', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        const conflictCounts: number[] = [];
        coordinator.ConflictsChanged$.subscribe((map) => conflictCounts.push(map.size));

        const record = { ID: 'rec-3' } as unknown as BaseEntity;
        const conflicts = new Map<string, FormFieldConflict>([
            [
                'name',
                {
                    fieldName: 'Name',
                    previousServerValue: 'Alpha',
                    incomingServerValue: 'Beta',
                    localEditedValue: 'Gamma'
                }
            ],
            [
                'status',
                {
                    fieldName: 'Status',
                    previousServerValue: 'Draft',
                    incomingServerValue: 'Published',
                    localEditedValue: 'Archived'
                }
            ]
        ]);

        coordinator.NotifyRemoteUpdate(record, new Set(['name', 'status']), undefined, conflicts);
        expect(coordinator.ActiveConflicts.size).toBe(2);

        coordinator.ResolveConflict('Name');
        expect(coordinator.ActiveConflicts.size).toBe(1);
        expect(coordinator.ActiveConflicts.has('name')).toBe(false);
        expect(coordinator.ActiveConflicts.has('status')).toBe(true);

        coordinator.ClearAllConflicts();
        expect(coordinator.ActiveConflicts.size).toBe(0);
        expect(conflictCounts).toEqual([2, 1, 0]);
    });

    it('broadcasts time-travel version preview state and single-field restore requests', () => {
        const coordinator = new FormRecordRefreshCoordinator();
        const previews: Array<FormVersionPreviewState | null> = [];
        const restoreRequests: FormSingleFieldRestoreRequest[] = [];

        coordinator.VersionPreviewChanged$.subscribe((p) => previews.push(p));
        coordinator.SingleFieldRestoreRequested$.subscribe((req) => restoreRequests.push(req));

        const previewState: FormVersionPreviewState = {
            ChangeID: 'chg-42',
            ChangedAt: '2026-04-20T10:00:00Z',
            UserName: 'Alice Smith',
            VersionSummary: 'Updated Status and Budget',
            Snapshot: { Status: 'Draft', Budget: 50000 },
            ChangedFields: new Map([
                [
                    'status',
                    {
                        FieldName: 'Status',
                        HistoricalValue: 'Draft',
                        CurrentLiveValue: 'Approved'
                    }
                ]
            ])
        };

        coordinator.SetVersionPreview(previewState);
        expect(coordinator.ActiveVersionPreview).toEqual(previewState);
        expect(previews).toEqual([previewState]);

        coordinator.RequestRestoreSingleField({
            FieldName: 'Status',
            HistoricalValue: 'Draft',
            ChangeID: 'chg-42'
        });
        expect(restoreRequests).toEqual([
            {
                FieldName: 'Status',
                HistoricalValue: 'Draft',
                ChangeID: 'chg-42'
            }
        ]);

        coordinator.SetVersionPreview(null);
        expect(coordinator.ActiveVersionPreview).toBeNull();
        expect(previews).toEqual([previewState, null]);
    });
});
