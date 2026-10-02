/**
 * A discovery's completion line has to say what the run DID.
 *
 * The object counts alone made a PRESUPPOSED connector's every run read as a no-op: its objects are
 * declared, so no run creates any, and a live refresh that created 69 fields and updated 487 reported
 * "0 objects created, 0 updated". The field counts were computed, carried and internally logged the
 * whole time — they were simply not in the sentence.
 */
import { describe, it, expect } from 'vitest';
import { DescribePersistCounts } from '../SchemaPersistCounts.js';

describe('DescribePersistCounts', () => {
    it('names the FIELD counts on a run that created no objects — the whole point', () => {
        const s = DescribePersistCounts({
            ObjectsCreated: 0, ObjectsUpdated: 0, FieldsCreated: 69, FieldsUpdated: 487,
        });
        expect(s).toContain('69 fields created');
        expect(s).toContain('487 updated');
        // and still reports the objects, so the two are never confused for each other
        expect(s).toContain('0 objects created');
    });

    it('reports objects and fields in one fixed order, so every surface reads alike', () => {
        expect(DescribePersistCounts({
            ObjectsCreated: 2, ObjectsUpdated: 3, FieldsCreated: 4, FieldsUpdated: 5,
        })).toBe('2 objects created, 3 updated, 4 fields created, 5 updated');
    });

    it('says there was no persist result rather than printing a row of zeros', () => {
        // Zeros are a finding ("the run changed nothing"); a missing result is not the same claim.
        expect(DescribePersistCounts(undefined)).toBe('no persist result reported');
        expect(DescribePersistCounts(undefined)).not.toContain('0');
    });
});
