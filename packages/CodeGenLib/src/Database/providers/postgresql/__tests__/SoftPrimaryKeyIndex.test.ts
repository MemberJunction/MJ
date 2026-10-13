/**
 * PostgreSQL side of the soft-primary-key index. The decisions about WHICH entities qualify and
 * in what column order live in CodeGenDatabaseProvider as a template method — shared with SQL
 * Server so they cannot drift. This pins the PG-visible output: quoting, the `IF NOT EXISTS`
 * idempotency form, the lower-case name prefix, and the 63-character identifier limit.
 *
 * PG quoting: `QuoteIdentifier(x)` -> `"x"`; `QuoteSchema(s, o)` -> `"s"."o"`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';

function createMockEntity(
    overrides: Record<string, unknown> = {},
    fields: Record<string, unknown>[] = []
): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Totara Course Completions',
        SchemaName: 'totara',
        BaseTable: 'course_completions',
        BaseTableCodeName: 'course_completions',
        BaseView: 'vwcourse_completions',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        CascadeDeletes: false,
        VirtualEntity: false,
        EntityFields: fields,
        ...overrides,
    });
}

function softPKField(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `spk-${name}`,
        Name: name,
        Type: 'varchar',
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

describe('PostgreSQLCodeGenProvider — soft primary key index', () => {
    let provider: PostgreSQLCodeGenProvider;

    beforeEach(() => {
        provider = new PostgreSQLCodeGenProvider();
    });

    it('emits a quoted, schema-qualified composite index in ordinal order', () => {
        const entity = createMockEntity({}, [softPKField('user_id', 2), softPKField('course_id', 1)]);

        const sql = provider.generateSoftPrimaryKeyIndex(entity);

        expect(sql.length).toBe(1);
        expect(sql[0]).toContain('"totara"."course_completions"');
        expect(sql[0]).toContain('("course_id", "user_id")');
    });

    it('uses the lower-case PG name convention', () => {
        const sql = provider.generateSoftPrimaryKeyIndex(
            createMockEntity({}, [softPKField('course_id', 1)])
        )[0];

        expect(sql).toContain('"idx_auto_mj_softpk_course_completions"');
    });

    it('is idempotent via CREATE INDEX IF NOT EXISTS', () => {
        const sql = provider.generateSoftPrimaryKeyIndex(
            createMockEntity({}, [softPKField('course_id', 1)])
        )[0];

        expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
        expect(sql).not.toMatch(/CREATE\s+UNIQUE/i);
    });

    it('truncates the index name to 63 characters', () => {
        const long = 'very_long_table_name_segment_padding_to_force_truncation_of_identifier';
        const entity = createMockEntity({ BaseTable: long, BaseTableCodeName: long }, [
            softPKField('course_id', 1),
        ]);

        const sql = provider.generateSoftPrimaryKeyIndex(entity)[0];
        const name = sql.match(/IF NOT EXISTS "([^"]+)"/)![1];

        expect(name.length).toBeLessThanOrEqual(63);
    });

    it('refuses an unbounded key column rather than creating an index that fails at INSERT time', () => {
        // PG accepts `text` in a btree key and then errors on whichever row exceeds ~1/8 of a
        // page — long after the index was created, and on a row nobody can predict. Keeping the
        // refusal at generation time means the message names the column instead.
        const entity = createMockEntity({}, [softPKField('payload_key', 1, { Length: -1 })]);

        const sql = provider.generateSoftPrimaryKeyIndex(entity);

        expect(sql.length).toBe(1);
        expect(sql[0]).not.toContain('CREATE INDEX');
        expect(sql[0]).toContain('SKIPPED');
        expect(sql[0]).toContain('payload_key');
    });

    it('emits nothing for an ordinary entity with a real primary key', () => {
        const entity = createMockEntity({}, [
            {
                ID: 'pk-1',
                Name: 'id',
                Type: 'uuid',
                Length: 16,
                Sequence: 1,
                IsPrimaryKey: true,
                IsSoftPrimaryKey: false,
                AllowsNull: false,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
                DefaultValue: '',
                RelatedEntityID: null,
            },
        ]);

        expect(provider.generateSoftPrimaryKeyIndex(entity)).toEqual([]);
    });
});
