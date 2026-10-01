import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { resolveCollectionRelationship } from '../collection-resolver';

describe('resolveCollectionRelationship', () => {
    it('resolves collection relationships with strict 4-tier rule strength', () => {
        const mockEntityInfo = {
            Name: 'Orders',
            RelatedEntities: [
                {
                    RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: 'Lines',
                    RelatedRecordCollection: JSON.stringify({ Name: 'OrderLines', Load: 'explicit', OnRemove: 'delete' }),
                },
                {
                    RelatedEntity: 'MJ_BizApps_Orders: Order Notes',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: 'OrderNotes',
                    RelatedRecordCollection: null,
                },
                {
                    RelatedEntity: 'OrderAuditLogs',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: null,
                    RelatedRecordCollection: null,
                },
                {
                    RelatedEntity: 'OrderTracking',
                    RelatedEntityJoinField: null, // Invalid: no join field
                    DisplayName: 'Tracking',
                    RelatedRecordCollection: null,
                },
            ],
        } as unknown as EntityInfo;

        // Tier 1: Explicit JSON Name match
        const t1 = resolveCollectionRelationship(mockEntityInfo, 'OrderLines');
        expect(t1).not.toBeNull();
        expect(t1?.relatedEntity).toBe('MJ_BizApps_Orders: Order Lines');
        expect(t1?.joinField).toBe('OrderID');
        expect(t1?.load).toBe('explicit');

        // Tier 2: DisplayName match
        const t2 = resolveCollectionRelationship(mockEntityInfo, 'OrderNotes');
        expect(t2).not.toBeNull();
        expect(t2?.relatedEntity).toBe('MJ_BizApps_Orders: Order Notes');
        expect(t2?.joinField).toBe('OrderID');

        // Tier 3: Full entity name match
        const t3 = resolveCollectionRelationship(mockEntityInfo, 'OrderAuditLogs');
        expect(t3).not.toBeNull();
        expect(t3?.relatedEntity).toBe('OrderAuditLogs');

        // Tier 4: Stripped name with plural tolerance
        const t4 = resolveCollectionRelationship(mockEntityInfo, 'OrderLine');
        expect(t4).not.toBeNull();
        expect(t4?.relatedEntity).toBe('MJ_BizApps_Orders: Order Lines');

        // Missing join field fails resolution
        const tInvalid = resolveCollectionRelationship(mockEntityInfo, 'Tracking');
        expect(tInvalid).toBeNull();

        // Unknown collection name fails resolution
        const tUnknown = resolveCollectionRelationship(mockEntityInfo, 'NonExistentCollection');
        expect(tUnknown).toBeNull();
    });

    it('throws explicit error on ambiguity within winning tier', () => {
        const ambiguousEntityInfo = {
            Name: 'Orders',
            RelatedEntities: [
                {
                    RelatedEntity: 'OrderLines1',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: 'Lines',
                    RelatedRecordCollection: null,
                },
                {
                    RelatedEntity: 'OrderLines2',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: 'Lines',
                    RelatedRecordCollection: null,
                },
            ],
        } as unknown as EntityInfo;

        expect(() => resolveCollectionRelationship(ambiguousEntityInfo, 'Lines')).toThrow(
            /Ambiguous collection resolution for 'Lines' on entity 'Orders'/
        );
    });

    it('warns on malformed RelatedRecordCollection JSON and falls back gracefully', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const malformedEntityInfo = {
            Name: 'Orders',
            RelatedEntities: [
                {
                    RelatedEntity: 'OrderLines',
                    RelatedEntityJoinField: 'OrderID',
                    DisplayName: 'OrderLines',
                    RelatedRecordCollection: '{ invalid json ...',
                },
            ],
        } as unknown as EntityInfo;

        // Tier 1 fails with warning, falls back to Tier 2 (DisplayName)
        const res = resolveCollectionRelationship(malformedEntityInfo, 'OrderLines');
        expect(res).not.toBeNull();
        expect(res?.relatedEntity).toBe('OrderLines');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("malformed RelatedRecordCollection JSON on entity 'Orders'")
        );

        warnSpy.mockRestore();
    });
});
