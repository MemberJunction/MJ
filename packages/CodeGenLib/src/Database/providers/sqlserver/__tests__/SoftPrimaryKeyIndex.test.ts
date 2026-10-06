/**
 * A SOFT primary key gets no index from anything else in the stack, and MJ's own write path
 * scans the table on every create without one.
 *
 * `IsPrimaryKey && IsSoftPrimaryKey` means the key exists only in metadata: no PRIMARY KEY
 * constraint, no unique index. Integration tables are built that way deliberately, because
 * their keys are inferred and a constraint would reject valid rows whenever an inference is
 * wrong. But the create path still calls InnerLoad on that key to check for an existing row,
 * a genuinely new record matches nothing, and a not-found lookup cannot short-circuit — so it
 * reads the entire heap before concluding the row is absent. The scan grows with the table.
 *
 * Three mechanisms each declined to cover it: the integration DDL generator emits no index on
 * the key columns; the FK auto-indexer skips primary keys ("already covered by its own index"
 * — true for a real PK, false by definition for a soft one); and the missing-index probe reads
 * sys.foreign_keys, which these tables have none of.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';

function createMockEntity(
    overrides: Record<string, unknown> = {},
    fieldOverrides?: Record<string, unknown>[]
): EntityInfo {
    const initData = {
        ID: 'entity-1',
        Name: 'Nimble Contacts',
        SchemaName: 'nimble',
        BaseTable: 'Contacts',
        BaseTableCodeName: 'Contacts',
        BaseView: 'vwContacts',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        CascadeDeletes: false,
        VirtualEntity: false,
        EntityFields: fieldOverrides ?? [],
        ...overrides,
    };
    return new EntityInfo(initData);
}

/** A soft-PK column: flagged PK in metadata, backed by no constraint. */
function softPKField(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `spk-${name}`,
        Name: name,
        Type: 'nvarchar',
        Length: 450,
        Sequence: sequence,
        IsPrimaryKey: true,
        IsSoftPrimaryKey: true,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
        RelatedEntityID: null,
        ...extra,
    };
}

/** An ordinary, constraint-backed PK column. */
function realPKField(name = 'ID'): Record<string, unknown> {
    return {
        ID: `pk-${name}`,
        Name: name,
        Type: 'uniqueidentifier',
        Length: 16,
        Sequence: 1,
        IsPrimaryKey: true,
        IsSoftPrimaryKey: false,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: 'newsequentialid()',
        RelatedEntityID: null,
    };
}

function plainField(name: string, sequence: number): Record<string, unknown> {
    return {
        ID: `f-${name}`,
        Name: name,
        Type: 'nvarchar',
        Length: 200,
        Sequence: sequence,
        IsPrimaryKey: false,
        IsSoftPrimaryKey: false,
        AllowsNull: true,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
        RelatedEntityID: null,
    };
}

describe('SQLServerCodeGenProvider — soft primary key index', () => {
    let provider: SQLServerCodeGenProvider;

    beforeEach(() => {
        provider = new SQLServerCodeGenProvider();
    });

    describe('when it applies', () => {
        it('indexes a single-column soft PK', () => {
            const entity = createMockEntity({}, [softPKField('external_id', 1), plainField('Email', 2)]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity);

            expect(sql.length).toBe(1);
            expect(sql[0]).toContain('CREATE INDEX IDX_AUTO_MJ_SOFTPK_Contacts');
            expect(sql[0]).toContain('[nimble].[Contacts] ([external_id])');
        });

        it('indexes a composite soft PK as ONE index, in ordinal order', () => {
            // One composite, not one per column: the existence check is an equality match on
            // the whole key, and per-column indexes would not serve it.
            const entity = createMockEntity({}, [
                softPKField('tenant_id', 2),
                softPKField('record_id', 1),
                plainField('Name', 3),
            ]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity);

            expect(sql.length).toBe(1);
            expect(sql[0]).toContain('([record_id], [tenant_id])');
        });

        it('creates a NON-unique index — uniqueness is what the soft-PK design refuses to assert', () => {
            const entity = createMockEntity({}, [softPKField('external_id', 1)]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity)[0];

            expect(sql).toContain('CREATE INDEX ');
            expect(sql).not.toMatch(/CREATE\s+UNIQUE/i);
        });

        it('is idempotent — re-running codegen must not fail on an existing index', () => {
            const entity = createMockEntity({}, [softPKField('external_id', 1)]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity)[0];

            expect(sql).toContain('IF NOT EXISTS');
            expect(sql).toContain('FROM sys.indexes');
            expect(sql).toContain("WHERE name = 'IDX_AUTO_MJ_SOFTPK_Contacts'");
        });

        it('says in the generated SQL why the index exists', () => {
            // The next person to read this file should not have to rediscover the whole story.
            const sql = provider.generateSoftPrimaryKeyIndex(
                createMockEntity({}, [softPKField('external_id', 1)])
            )[0];

            expect(sql).toContain('soft primary key');
            expect(sql).toMatch(/scans the whole table/i);
        });
    });

    describe('when it does NOT apply', () => {
        it('emits nothing for an ordinary entity with a real PK', () => {
            // Nearly every entity. A real PK already has its constraint's index.
            const entity = createMockEntity({}, [realPKField(), plainField('Name', 2)]);

            expect(provider.generateSoftPrimaryKeyIndex(entity)).toEqual([]);
        });

        it('emits nothing for an entity with no primary key at all', () => {
            const entity = createMockEntity({}, [plainField('Name', 1)]);

            expect(provider.generateSoftPrimaryKeyIndex(entity)).toEqual([]);
        });

        it('emits nothing for a virtual entity — a view cannot be indexed', () => {
            const entity = createMockEntity({ VirtualEntity: true }, [softPKField('external_id', 1)]);

            expect(provider.generateSoftPrimaryKeyIndex(entity)).toEqual([]);
        });

        it('emits nothing for a MIXED key rather than guessing', () => {
            // Part-real, part-soft is not a shape the integration schema builder produces, and
            // inventing an index for it is worse than leaving it alone.
            const entity = createMockEntity({}, [realPKField(), softPKField('external_id', 2)]);

            expect(provider.generateSoftPrimaryKeyIndex(entity)).toEqual([]);
        });
    });

    describe('unindexable key columns', () => {
        it('does not emit an index whose key column SQL Server would reject', () => {
            // Length -1 is MAX. SQL Server refuses LOB types as index key columns outright.
            const entity = createMockEntity({}, [softPKField('external_id', 1, { Length: -1 })]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity);

            expect(sql.length).toBe(1);
            expect(sql[0]).not.toContain('CREATE INDEX');
        });

        it('explains the skip IN THE FILE, naming the offending column', () => {
            // A silently missing index is the exact failure this whole change exists to end —
            // swapping one silence for another would leave the next person the same puzzle.
            // (A key column declared with no explicit length maps to NVARCHAR(MAX), which is
            // how a table lands here without anyone intending it.)
            const entity = createMockEntity({}, [
                softPKField('record_id', 1),
                softPKField('blob_key', 2, { Length: -1 }),
            ]);

            const sql = provider.generateSoftPrimaryKeyIndex(entity)[0];

            expect(sql).toContain('SKIPPED');
            expect(sql).toContain('nimble.Contacts');
            expect(sql).toContain('blob_key');
            // ...and not the column that was fine.
            expect(sql).not.toContain('record_id (');
            expect(sql).toMatch(/explicit bounded length/i);
        });
    });

    describe('identifier limits', () => {
        it('truncates the index name to 128 characters', () => {
            const long = 'VeryLongSegmentNamePaddingToForceTruncationOfTheIdentifier';
            const entity = createMockEntity(
                { BaseTable: `${long}Table`, BaseTableCodeName: `${long}${long}${long}Table` },
                [softPKField('external_id', 1)]
            );

            const sql = provider.generateSoftPrimaryKeyIndex(entity)[0];
            const name = sql.match(/CREATE INDEX (\S+) ON/)![1];

            expect(name.length).toBeLessThanOrEqual(128);
        });
    });
});
