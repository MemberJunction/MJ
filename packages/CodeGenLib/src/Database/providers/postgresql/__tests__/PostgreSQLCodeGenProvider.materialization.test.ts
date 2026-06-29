import { describe, it, expect, beforeEach } from 'vitest';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';
import type { MaterializedColumnSpec } from '../../../codeGenDatabaseProvider';

/**
 * Tests for the PostgreSQL materialization DDL primitive (plan §2.2/§12) — the PG
 * counterpart to the SQL Server provider. PG emits:
 *   - a conditional CREATE TABLE IF NOT EXISTS for the physical materialized table
 *     (reuse a migration-provided table if present; otherwise create the minimal one), and
 *   - the wrapper view (CREATE OR REPLACE VIEW) that is the stable read contract and the
 *     atomic-swap repoint mechanism (§11.2).
 *
 * PG quoting: `QuoteIdentifier(x)` -> `"x"`; `QuoteSchema(s, o)` -> `s."o"` (schema bare).
 */
describe('PostgreSQLCodeGenProvider — materialization DDL', () => {
    let provider: PostgreSQLCodeGenProvider;

    beforeEach(() => {
        provider = new PostgreSQLCodeGenProvider();
    });

    const cols: MaterializedColumnSpec[] = [
        { Name: 'id', SQLType: 'uuid', Nullable: false, IsPrimaryKey: true },
        { Name: 'name', SQLType: 'varchar(255)', Nullable: false, IsPrimaryKey: false },
        { Name: 'total_amount', SQLType: 'numeric(18,2)', Nullable: true, IsPrimaryKey: false },
    ];

    describe('generateMaterializedTableSQL', () => {
        it('emits a conditional (create-if-absent) CREATE TABLE so migration-provided tables are reused', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_demo_summary', cols);
            expect(sql).toContain('CREATE TABLE IF NOT EXISTS __mj."materialized_demo_summary"');
            // never an unconditional DROP — that would clobber data / bespoke indexing
            expect(sql).not.toContain('DROP TABLE');
        });

        it('emits each column with its PG-native type and nullability, double-quoted', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_demo_summary', cols);
            expect(sql).toContain('"id" uuid NOT NULL');
            expect(sql).toContain('"name" varchar(255) NOT NULL');
            expect(sql).toContain('"total_amount" numeric(18,2) NULL');
        });

        it('emits the single-column surrogate PRIMARY KEY (its own unique index)', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_demo_summary', cols);
            expect(sql).toContain('CONSTRAINT "PK_materialized_demo_summary" PRIMARY KEY ("id")');
        });

        it('supports a composite PK when more than one column is flagged', () => {
            const composite: MaterializedColumnSpec[] = [
                { Name: 'a', SQLType: 'integer', Nullable: false, IsPrimaryKey: true },
                { Name: 'b', SQLType: 'integer', Nullable: false, IsPrimaryKey: true },
                { Name: 'v', SQLType: 'integer', Nullable: true, IsPrimaryKey: false },
            ];
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_x', composite);
            expect(sql).toContain('PRIMARY KEY ("a", "b")');
        });

        it('omits the PRIMARY KEY clause when no column is flagged', () => {
            const noPk = cols.map((c) => ({ ...c, IsPrimaryKey: false }));
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_demo_summary', noPk);
            expect(sql).not.toContain('PRIMARY KEY');
        });
    });

    describe('generateMaterializedWrapperViewSQL', () => {
        it('emits CREATE OR REPLACE VIEW selecting * from the physical table (stable contract + atomic repoint)', () => {
            const sql = provider.generateMaterializedWrapperViewSQL('__mj', 'materialized_vw_demo_summary', 'materialized_demo_summary');
            expect(sql).toContain('CREATE OR REPLACE VIEW __mj."materialized_vw_demo_summary"');
            expect(sql).toContain('SELECT * FROM __mj."materialized_demo_summary"');
        });
    });

    describe('getMaterializedSurrogateColumnType', () => {
        it('returns a PG identity column type for the v1 synthetic surrogate', () => {
            expect(provider.getMaterializedSurrogateColumnType()).toBe('bigint GENERATED ALWAYS AS IDENTITY');
        });
    });

    describe('overrides the base-class throwing defaults (no throw)', () => {
        it('all three materialization methods are implemented', () => {
            expect(() => provider.generateMaterializedTableSQL('__mj', 't', cols)).not.toThrow();
            expect(() => provider.generateMaterializedWrapperViewSQL('__mj', 'v', 't')).not.toThrow();
            expect(() => provider.getMaterializedSurrogateColumnType()).not.toThrow();
        });
    });
});
