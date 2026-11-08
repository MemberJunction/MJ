/**
 * MJ-DISC-16's healing pass re-persists objects the first pass created. Replacing the first pass's
 * result with the heal's reported "0 objects created, N updated" for a brand-new connection, and
 * dropped the first pass's merge log.
 */
import { describe, it, expect } from 'vitest';
import { MergeHealedPersistResult } from '../IntegrationConnectorCreationPipeline.js';
import type { PersistSchemaResult } from '../IntegrationSchemaSync.js';

function persist(over: Partial<PersistSchemaResult>): PersistSchemaResult {
    return {
        ObjectsCreated: 0, ObjectsUpdated: 0, FieldsCreated: 0, FieldsUpdated: 0,
        ObjectMergeLog: [], FieldMergeLog: [], ObjectsDeactivated: [], FieldsDeactivated: [],
        ...over,
    } as PersistSchemaResult;
}

describe('MergeHealedPersistResult', () => {
    const first = persist({
        ObjectsCreated: 3, FieldsCreated: 20,
        ObjectMergeLog: [{ Object: 'a' }, { Object: 'b' }, { Object: 'c' }] as unknown as PersistSchemaResult['ObjectMergeLog'],
        ObjectsDeactivated: ['old'],
    });
    const heal = persist({
        ObjectsUpdated: 2, FieldsCreated: 1, FieldsUpdated: 5,
        ObjectMergeLog: [{ Object: 'b' }, { Object: 'c' }] as unknown as PersistSchemaResult['ObjectMergeLog'],
    });

    it('keeps the first pass\'s counts, so a new connection still reads as created', () => {
        const out = MergeHealedPersistResult(first, heal);
        expect(out.ObjectsCreated).toBe(3);
        expect(out.ObjectsUpdated).toBe(0);
        expect(out.FieldsUpdated).toBe(0);
    });

    it('adds the fields sampling found that the declaration did not', () => {
        expect(MergeHealedPersistResult(first, heal).FieldsCreated).toBe(21);
    });

    it('keeps the first pass\'s merge log and appends the heal\'s', () => {
        expect(MergeHealedPersistResult(first, heal).ObjectMergeLog).toHaveLength(5);
    });

    it('retires only what the first pass retired', () => {
        expect(MergeHealedPersistResult(first, heal).ObjectsDeactivated).toEqual(['old']);
    });
});
