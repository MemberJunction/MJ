import { describe, it, expect } from 'vitest';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { EntityInfo } from '@memberjunction/core';

/**
 * Unit tests for SQLCodeGenBase.checkBaseViewColumnsChangedPG — the PostgreSQL base-view
 * drift detector. On PG it is the ONLY mechanism that decides whether a base view needs
 * regeneration (pg_get_viewdef reformatting makes the SQL Server text comparison unusable),
 * so its behavior is pinned here. It compares the view's live column set against the entity's
 * expected fields; an empty set means the view is missing (self-heal → regenerate).
 */

function makeEntity(fieldNames: string[]): EntityInfo {
    const EntityFields = fieldNames.map((name, i) => ({
        ID: `f-${i}`,
        Name: name,
        Type: 'nvarchar',
        Length: 100,
        IsPrimaryKey: i === 0,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
    }));
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Test Entity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseTableCodeName: 'TestEntity',
        BaseView: 'vwTestEntities',
        IncludeInAPI: true,
        EntityFields,
        EntityPermissions: [],
    });
}

// Minimal CodeGenConnection stand-in: only .query is used by the method under test.
function mockPool(columnNames: string[]) {
    return {
        query: async (_sql: string) => ({ recordset: columnNames.map((c) => ({ column_name: c })) }),
    };
}

// Invoke the protected method without running the (provider-resolving) constructor.
function invoke(viewColumns: string[], entityFields: string[]): Promise<boolean> {
    const gen = Object.create(SQLCodeGenBase.prototype) as SQLCodeGenBase;
    const fn = (gen as unknown as {
        checkBaseViewColumnsChangedPG(pool: unknown, entity: EntityInfo, viewName: string): Promise<boolean>;
    }).checkBaseViewColumnsChangedPG.bind(gen);
    return fn(mockPool(viewColumns), makeEntity(entityFields), 'vwTestEntities');
}

describe('SQLCodeGenBase.checkBaseViewColumnsChangedPG', () => {
    it('missing view (empty column set) → true (self-heal)', async () => {
        expect(await invoke([], ['ID', 'Name', 'Email'])).toBe(true);
    });

    it('view columns exactly match entity fields → false', async () => {
        expect(await invoke(['ID', 'Name', 'Email'], ['ID', 'Name', 'Email'])).toBe(false);
    });

    it('view missing a field that metadata declares → true (the v5.46 OpenApp outage case)', async () => {
        expect(await invoke(['ID', 'Name'], ['ID', 'Name', 'Email'])).toBe(true);
    });

    it('view has an extra column not in metadata → true', async () => {
        expect(await invoke(['ID', 'Name', 'Email', 'Legacy'], ['ID', 'Name', 'Email'])).toBe(true);
    });

    it('same count but a renamed column → true', async () => {
        expect(await invoke(['ID', 'Name', 'Phone'], ['ID', 'Name', 'Email'])).toBe(true);
    });

    it('is case-insensitive (PG lower-cases identifiers) → false', async () => {
        expect(await invoke(['id', 'name', 'email'], ['ID', 'Name', 'Email'])).toBe(false);
    });
});
