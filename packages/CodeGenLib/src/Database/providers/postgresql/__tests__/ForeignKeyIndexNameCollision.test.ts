/**
 * Two FK columns on a long table name can truncate to the same 63-character index name on
 * PostgreSQL. `CREATE INDEX IF NOT EXISTS` then skips the second index without an error. The
 * second name gets a hash suffix; the first keeps the truncated name it has today.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';

function field(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `f-${name}`, Name: name, Type: 'uniqueidentifier', Length: 16, Sequence: sequence,
        IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, AutoIncrement: false,
        RelatedEntityID: null, ...extra,
    };
}

function entity(baseTable: string, fkNames: string[]): EntityInfo {
    return new EntityInfo({
        ID: 'e-1', Name: baseTable, SchemaName: '__mj', BaseTable: baseTable,
        BaseTableCodeName: baseTable, BaseView: `vw${baseTable}`, VirtualEntity: false,
        EntityFields: [
            field('ID', 1, { IsPrimaryKey: true }),
            ...fkNames.map((n, i) => field(n, i + 2, { RelatedEntityID: `r-${i}` })),
        ],
        EntityRelationships: [],
        EntityOrganicKeys: [],
    });
}

function indexNames(statements: string[]): string[] {
    return statements
        .map((s) => /CREATE INDEX IF NOT EXISTS "([^"]+)"/.exec(s)?.[1])
        .filter((n): n is string => !!n);
}

describe('PostgreSQL FK index names that truncate to the same 63 characters', () => {
    const provider = new PostgreSQLCodeGenProvider();

    it('gives the second colliding index a distinct hashed name and keeps the first unchanged', () => {
        const e = entity('CommunicationProviderMessageType', ['CommunicationProviderID', 'CommunicationProviderTypeID']);
        const names = indexNames(provider.GenerateForeignKeyIndexes(e));
        expect(names).toHaveLength(2);
        expect(names[0]).toBe('idx_auto_mj_fkey_communication_provider_message_type_communicat');
        expect(names[1]).not.toBe(names[0]);
        expect(names[1]).toMatch(/^idx_auto_mj_fkey_communication_provider_message_type_c_[0-9a-f]{8}$/);
        expect(names[1]).toHaveLength(63);
    });

    it('leaves names that do not collide as they are', () => {
        const e = entity('Customer', ['RegionID', 'OwnerID']);
        expect(indexNames(provider.GenerateForeignKeyIndexes(e))).toEqual([
            'idx_auto_mj_fkey_customer_region_id',
            'idx_auto_mj_fkey_customer_owner_id',
        ]);
    });
});
