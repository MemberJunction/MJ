/**
 * REMOVING WRONG FK METADATA AND GETTING THE INDEXES YOU NEED used to be mutually exclusive.
 *
 * `isIndexableForeignKey` looked at `RelatedEntityID` and nothing else, so indexing and FK metadata
 * were the same decision. On a schema MJ did not author they are not: the real joins are on external
 * ids, the FKs inferred onto them get deleted because they are wrong (that is what the delete is
 * for), and the entity is left with a join MJ performs on every parent record and no index for it.
 * The more correct the metadata became, the worse the plans got.
 *
 * The second input is MJ's own VERIFIED join declarations: `EntityRelationship.EntityKeyField` (only
 * ever set for a non-PK join, so never redundant with a PK index) and the match fields of ACTIVE
 * organic keys.
 *
 * ONLY `ExactMatch` organic keys are indexed, and that exclusion is pinned here too. Every other
 * normalization strategy wraps the column in `LOWER(LTRIM(RTRIM(col)))`, which a plain B-tree index
 * on `col` cannot serve — so emitting one would cost a write per insert, never be used, and read in
 * a catalog listing exactly like an index that works.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';

function field(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `f-${name}`, Name: name, Type: 'nvarchar', Length: 100, Sequence: sequence,
        IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, AutoIncrement: false,
        RelatedEntityID: null, ...extra,
    };
}

function entity(opts: {
    fields: Record<string, unknown>[];
    relationships?: Record<string, unknown>[];
    organicKeys?: Record<string, unknown>[];
}): EntityInfo {
    return new EntityInfo({
        ID: 'e-1', Name: 'Customers', SchemaName: 'acgi', BaseTable: 'Customer',
        BaseTableCodeName: 'Customer', BaseView: 'vwCustomers', VirtualEntity: false,
        EntityFields: opts.fields,
        EntityRelationships: opts.relationships ?? [],
        EntityOrganicKeys: opts.organicKeys ?? [],
    });
}

const BASE_FIELDS = [
    field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
    field('Customer_Key', 2),
    field('Email', 3),
    field('Name', 4),
];

describe('generateForeignKeyIndexes — verified joins, not just declared FKs', () => {
    const provider = new SQLServerCodeGenProvider();

    it('indexes NOTHING when the entity has no FK metadata and no verified join (unchanged behaviour)', () => {
        expect(provider.generateForeignKeyIndexes(entity({ fields: BASE_FIELDS }))).toEqual([]);
    });

    it('still indexes a declared FK exactly as before', () => {
        const e = entity({ fields: [...BASE_FIELDS.slice(0, 1), field('OwnerID', 2, { RelatedEntityID: 'other' }), ...BASE_FIELDS.slice(2)] });
        const indexes = provider.generateForeignKeyIndexes(e);
        expect(indexes).toHaveLength(1);
        expect(indexes[0]).toContain('[OwnerID]');
    });

    it('indexes a column named only by a relationship EntityKeyField — the FK metadata is gone', () => {
        const e = entity({
            fields: BASE_FIELDS,
            relationships: [{ ID: 'r1', EntityID: 'e-1', RelatedEntityID: 'e-2', RelatedEntityJoinField: 'Customer_Key', EntityKeyField: 'Customer_Key', Type: 'One To Many' }],
        });
        const indexes = provider.generateForeignKeyIndexes(e);
        expect(indexes).toHaveLength(1);
        expect(indexes[0]).toContain('[Customer_Key]');
    });

    it('matches the EntityKeyField case-insensitively against the entity\'s own columns', () => {
        const e = entity({
            fields: BASE_FIELDS,
            relationships: [{ ID: 'r1', EntityID: 'e-1', RelatedEntityID: 'e-2', RelatedEntityJoinField: 'x', EntityKeyField: 'customer_key', Type: 'One To Many' }],
        });
        expect(provider.generateForeignKeyIndexes(e)[0]).toContain('[Customer_Key]');
    });

    it('indexes an ExactMatch organic key\'s match fields', () => {
        const e = entity({
            fields: BASE_FIELDS,
            organicKeys: [{ ID: 'ok1', EntityID: 'e-1', Name: 'external_id', MatchFieldNames: 'Customer_Key, Email', NormalizationStrategy: 'ExactMatch', Status: 'Active' }],
        });
        const indexes = provider.generateForeignKeyIndexes(e);
        expect(indexes).toHaveLength(2);
        expect(indexes.join('\n')).toContain('[Customer_Key]');
        expect(indexes.join('\n')).toContain('[Email]');
    });

    it('does NOT index a normalizing organic key, and says why in the generated SQL', () => {
        const e = entity({
            fields: BASE_FIELDS,
            organicKeys: [{ ID: 'ok1', EntityID: 'e-1', Name: 'email_address', MatchFieldNames: 'Email', NormalizationStrategy: 'LowerCaseTrim', Status: 'Active' }],
        });
        const out = provider.generateForeignKeyIndexes(e);
        // No CREATE INDEX at all — only the disclosure.
        expect(out.filter(s => s.includes('CREATE'))).toEqual([]);
        expect(out).toHaveLength(1);
        expect(out[0]).toContain('ORGANIC KEY INDEXES NOT EMITTED');
        expect(out[0]).toContain('email_address: Email (normalization: LowerCaseTrim)');
        expect(out[0]).toContain('LOWER(LTRIM(RTRIM(col)))');
    });

    it('ignores a DISABLED organic key entirely — no index and no disclosure', () => {
        const e = entity({
            fields: BASE_FIELDS,
            organicKeys: [{ ID: 'ok1', EntityID: 'e-1', Name: 'email_address', MatchFieldNames: 'Email', NormalizationStrategy: 'LowerCaseTrim', Status: 'Disabled' }],
        });
        expect(provider.generateForeignKeyIndexes(e)).toEqual([]);
    });

    it('never double-indexes a primary key, however it is declared as a join', () => {
        const e = entity({
            fields: BASE_FIELDS,
            relationships: [{ ID: 'r1', EntityID: 'e-1', RelatedEntityID: 'e-2', RelatedEntityJoinField: 'x', EntityKeyField: 'ID', Type: 'One To Many' }],
        });
        expect(provider.generateForeignKeyIndexes(e)).toEqual([]);
    });

    it('never indexes a virtual field — there is no column to index', () => {
        const e = entity({
            fields: [...BASE_FIELDS, field('OwnerName', 5, { IsVirtual: true })],
            relationships: [{ ID: 'r1', EntityID: 'e-1', RelatedEntityID: 'e-2', RelatedEntityJoinField: 'x', EntityKeyField: 'OwnerName', Type: 'One To Many' }],
        });
        expect(provider.generateForeignKeyIndexes(e)).toEqual([]);
    });
});
