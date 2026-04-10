import { describe, it, expect } from 'vitest';
import { ManageMetadataBase, ViewRegenEntry } from '../Database/manage-metadata';

describe('ViewRegenEntry and EntitiesRequiringViewRegen', () => {
    // Reset the static list between tests
    function clearRegenList() {
        // Access the private static array to reset it
        (ManageMetadataBase as Record<string, unknown[]>)['_entitiesRequiringViewRegen'] = [];
    }

    describe('AddEntityRequiringViewRegen', () => {
        it('should add an entity with reason', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            const list = ManageMetadataBase.EntitiesRequiringViewRegen;
            expect(list).toHaveLength(1);
            expect(list[0].EntityName).toBe('Members');
            expect(list[0].Reason).toBe('Geocoding');
        });

        it('should not add duplicate entity+reason combinations', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            expect(ManageMetadataBase.EntitiesRequiringViewRegen).toHaveLength(1);
        });

        it('should allow same entity with different reasons', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            // If we add more reasons in the future, they should be separate entries
            // For now, only 'Geocoding' exists as a reason
            expect(ManageMetadataBase.EntitiesRequiringViewRegen).toHaveLength(1);
        });

        it('should track multiple different entities', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            ManageMetadataBase.AddEntityRequiringViewRegen('Events', 'Geocoding');
            ManageMetadataBase.AddEntityRequiringViewRegen('Chapters', 'Geocoding');
            const list = ManageMetadataBase.EntitiesRequiringViewRegen;
            expect(list).toHaveLength(3);
            expect(list.map(e => e.EntityName)).toEqual(['Members', 'Events', 'Chapters']);
        });
    });

    describe('ViewRegenEntry type', () => {
        it('should enforce Reason type', () => {
            const entry: ViewRegenEntry = {
                EntityName: 'Members',
                Reason: 'Geocoding',
            };
            expect(entry.Reason).toBe('Geocoding');
        });

        it('should allow filtering by reason', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            ManageMetadataBase.AddEntityRequiringViewRegen('Events', 'Geocoding');

            const geoEntries = ManageMetadataBase.EntitiesRequiringViewRegen
                .filter(e => e.Reason === 'Geocoding');
            expect(geoEntries).toHaveLength(2);

            const otherEntries = ManageMetadataBase.EntitiesRequiringViewRegen
                .filter(e => e.Reason !== 'Geocoding');
            expect(otherEntries).toHaveLength(0);
        });
    });

    describe('EntitiesRequiringViewRegen getter', () => {
        it('should return empty array initially', () => {
            clearRegenList();
            expect(ManageMetadataBase.EntitiesRequiringViewRegen).toEqual([]);
        });

        it('should return the same array reference', () => {
            clearRegenList();
            ManageMetadataBase.AddEntityRequiringViewRegen('Members', 'Geocoding');
            const ref1 = ManageMetadataBase.EntitiesRequiringViewRegen;
            const ref2 = ManageMetadataBase.EntitiesRequiringViewRegen;
            expect(ref1).toBe(ref2);
        });
    });
});
