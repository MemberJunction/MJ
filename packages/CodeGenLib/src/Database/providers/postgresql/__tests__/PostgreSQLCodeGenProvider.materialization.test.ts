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
 * PG quoting: `QuoteIdentifier(x)` -> `"x"` (embedded `"` doubled); `QuoteSchema(s, o)` -> `"s"."o"` (both parts quoted).
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
            expect(sql).toContain('CREATE TABLE IF NOT EXISTS "__mj"."materialized_demo_summary"');
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

        it('maps CANONICAL (SQL Server) type names to PG types — regression for the `type "uniqueidentifier" does not exist` codegen crash', () => {
            // MJ entity-field metadata stores canonical SS type names (uniqueidentifier, nvarchar…) even on a
            // PostgreSQL database, and base-view/query materialization feeds those straight into this method.
            // If they aren't mapped, PG rejects the CREATE TABLE ("type uniqueidentifier does not exist") and
            // aborts the ENTIRE codegen run. Every other PG DDL path maps via mapSQLType; this one must too.
            const canonical: MaterializedColumnSpec[] = [
                { Name: 'ID', SQLType: 'uniqueidentifier', Nullable: false, IsPrimaryKey: true },
                { Name: 'Name', SQLType: 'nvarchar(255)', Nullable: false, IsPrimaryKey: false },
                { Name: 'Notes', SQLType: 'nvarchar(max)', Nullable: true, IsPrimaryKey: false },
            ];
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_x', canonical);
            // canonical SS type names must NOT survive verbatim — PG has no such types
            expect(sql.toLowerCase()).not.toContain('uniqueidentifier');
            expect(sql.toLowerCase()).not.toContain('nvarchar');
            // mapped to PG equivalents
            expect(sql).toContain('"ID" UUID NOT NULL'); // uniqueidentifier -> UUID
            expect(sql).toContain('"Name" varchar(255) NOT NULL'); // nvarchar(255) -> varchar(255)
            expect(sql).toContain('"Notes" TEXT NULL'); // nvarchar(max) -> TEXT
        });

        it('doubles embedded double-quotes in column/table/PK identifiers so an untrusted name cannot break out of its quoting (mint↔refresh parity)', () => {
            // External-query column names arrive from untrusted remote-schema introspection. A `"` in a column,
            // table, or PK-constraint name must be doubled (`"`→`""`) or it breaks out of the quoted identifier
            // during a CodeGen-privileged CREATE TABLE. This mirrors MaterializationRefresher's escId/q/obj on
            // the refresh side, closing the mint↔refresh escaping asymmetry.
            const hostile: MaterializedColumnSpec[] = [
                { Name: 'ev"il', SQLType: 'integer', Nullable: false, IsPrimaryKey: true },
                { Name: 'a"b', SQLType: 'integer', Nullable: true, IsPrimaryKey: false },
            ];
            const sql = provider.generateMaterializedTableSQL('__mj', 'mat"tbl', hostile);
            expect(sql).toContain('"ev""il" integer NOT NULL');
            expect(sql).toContain('"a""b" integer NULL');
            expect(sql).toContain('CREATE TABLE IF NOT EXISTS "__mj"."mat""tbl"');
            expect(sql).toContain('CONSTRAINT "PK_mat""tbl" PRIMARY KEY ("ev""il")');
        });
    });

    describe('generateMaterializedWrapperViewSQL', () => {
        it('emits CREATE OR REPLACE VIEW selecting * from the physical table (stable contract + atomic repoint)', () => {
            const sql = provider.generateMaterializedWrapperViewSQL('__mj', 'materialized_vw_demo_summary', 'materialized_demo_summary');
            expect(sql).toContain('CREATE OR REPLACE VIEW "__mj"."materialized_vw_demo_summary"');
            expect(sql).toContain('SELECT * FROM "__mj"."materialized_demo_summary"');
        });

        it('doubles embedded double-quotes in the view and table names (untrusted-identifier hardening)', () => {
            const sql = provider.generateMaterializedWrapperViewSQL('__mj', 'vw"x', 'tbl"y');
            expect(sql).toContain('CREATE OR REPLACE VIEW "__mj"."vw""x"');
            expect(sql).toContain('SELECT * FROM "__mj"."tbl""y"');
        });
    });

    describe('getMaterializedSurrogateColumnType', () => {
        it('returns a PG identity column type for the v1 synthetic surrogate', () => {
            expect(provider.getMaterializedSurrogateColumnType()).toBe('bigint GENERATED ALWAYS AS IDENTITY');
        });
    });

    describe('getMaterializedHashSurrogateColumnType', () => {
        it('returns text for a KEYED surrogate (matches encode(digest…) → text from CREATE TABLE AS)', () => {
            expect(provider.getMaterializedHashSurrogateColumnType()).toBe('text');
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
