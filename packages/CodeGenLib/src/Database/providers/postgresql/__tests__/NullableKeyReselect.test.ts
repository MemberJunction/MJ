/**
 * #3526 — the create routine re-selects the row it inserted by its key. A key column that allows NULL is
 * matched NULL-safely; otherwise a row with a NULL key part is never found and the create returns no row.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';

function entity(subCodeAllowsNull: boolean): EntityInfo {
    const key = (name: string, allowsNull: boolean) => ({
        ID: `pk-${name}`, Name: name, Type: 'nvarchar', Length: 200, IsPrimaryKey: true, AllowsNull: allowsNull,
        AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '',
    });
    return new EntityInfo({
        ID: 'entity-1', Name: 'Staged Rows', SchemaName: 'stage', BaseTable: 'StagedRow', BaseTableCodeName: 'StagedRow',
        BaseView: 'vwStagedRows', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        CascadeDeletes: false, DeleteType: 'Hard', spCreate: '', spUpdate: '', spDelete: '', EntityPermissions: [],
        EntityFields: [
            key('AccountNo', false),
            key('SubCode', subCodeAllowsNull),
            { ID: 'f3', Name: 'Amount', Type: 'decimal', Length: 9, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
        ],
    });
}

describe('PostgreSQLCodeGenProvider — composite key re-select after create (#3526)', () => {
    const provider = new PostgreSQLCodeGenProvider();

    it('matches a nullable key part NULL-safely', () => {
        const sql = provider.generateCRUDCreate(entity(true));
        expect(sql).toMatch(/\("SubCode" = \S+ OR \("SubCode" IS NULL AND \S+ IS NULL\)\)/);
        expect(sql).toMatch(/"AccountNo" = \S+ AND \("SubCode"/);
    });

    it('keeps plain equality when no key part allows NULL', () => {
        const sql = provider.generateCRUDCreate(entity(false));
        expect(sql).not.toContain('IS NULL AND');
    });
});
