/**
 * Tests for EntityInfo.ConfigurableAtCreationAttributes — the entity flags a per-table CodeGen config
 * entry may set when CodeGen first creates the entity (consumed by CodeGenLib's new-entity INSERT).
 * The list is typed against EntityInfo, so a misspelled name fails to compile; these tests pin the
 * runtime side: the exact set, and that each name is a real property on a constructed EntityInfo.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

describe('EntityInfo.ConfigurableAtCreationAttributes', () => {
    it('lists the eleven entity flags settable at creation', () => {
        expect([...EntityInfo.ConfigurableAtCreationAttributes].sort()).toEqual([
            'AllowAllRowsAPI', 'AllowCaching', 'AllowCreateAPI', 'AllowDeleteAPI', 'AllowUpdateAPI',
            'AllowUserSearchAPI', 'AuditRecordAccess', 'AuditViewRuns', 'IncludeInAPI', 'TrackRecordChanges',
            'UserViewMaxRows',
        ]);
    });

    it('names only real EntityInfo properties', () => {
        const entity = new EntityInfo({ ID: 'ent-1', Name: 'Things', SchemaName: 'app', BaseTable: 'Thing', EntityFields: [] });
        for (const attr of EntityInfo.ConfigurableAtCreationAttributes) {
            expect(attr in entity, attr).toBe(true);
        }
    });

    it('returns the same list each time, with no duplicates', () => {
        const list = EntityInfo.ConfigurableAtCreationAttributes;
        expect(EntityInfo.ConfigurableAtCreationAttributes).toBe(list);
        expect(new Set(list).size).toBe(list.length);
    });
});
