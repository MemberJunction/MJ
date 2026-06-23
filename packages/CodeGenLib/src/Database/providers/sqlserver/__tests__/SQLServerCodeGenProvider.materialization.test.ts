import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import type { MaterializedColumnSpec } from '../../../codeGenDatabaseProvider';

/**
 * Tests for the cross-engine materialization DDL primitive (sub-step A of the
 * CodeGen materialization phase — plans/query-entity-materialization.md §2.2/§12).
 * The SQL Server provider emits:
 *   - a conditional CREATE TABLE for the physical materialized table (reuse a
 *     migration-provided table if present; otherwise create the minimal one), and
 *   - the wrapper view (CREATE OR ALTER VIEW) that is the stable read contract and
 *     the atomic-swap repoint mechanism.
 */
describe('SQLServerCodeGenProvider — materialization DDL', () => {
    let provider: SQLServerCodeGenProvider;

    beforeEach(() => {
        provider = new SQLServerCodeGenProvider();
    });

    const cols: MaterializedColumnSpec[] = [
        { Name: 'id', SQLType: 'uniqueidentifier', Nullable: false, IsPrimaryKey: true },
        { Name: 'name', SQLType: 'nvarchar(255)', Nullable: false, IsPrimaryKey: false },
        { Name: 'total_amount', SQLType: 'decimal(18,2)', Nullable: true, IsPrimaryKey: false },
    ];

    describe('generateMaterializedTableSQL', () => {
        it('emits a conditional (create-if-absent) CREATE TABLE so migration-provided tables are reused', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_DemoSummary', cols);
            expect(sql).toContain("IF OBJECT_ID('[__mj].[materialized_DemoSummary]', 'U') IS NULL");
            expect(sql).toContain('CREATE TABLE [__mj].[materialized_DemoSummary]');
            // never an unconditional DROP — that would clobber data / bespoke indexing
            expect(sql).not.toContain('DROP TABLE');
            // single GO-free batch: executed via ds.query (no GO-split); the file separator is the caller's job
            expect(sql).not.toContain('GO');
        });

        it('emits each column with its engine-native type and nullability, bracket-quoted', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_DemoSummary', cols);
            expect(sql).toContain('[id] uniqueidentifier NOT NULL');
            expect(sql).toContain('[name] nvarchar(255) NOT NULL');
            expect(sql).toContain('[total_amount] decimal(18,2) NULL');
        });

        it('emits the single-column surrogate PRIMARY KEY (its own unique index)', () => {
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_DemoSummary', cols);
            expect(sql).toContain('CONSTRAINT [PK_materialized_DemoSummary] PRIMARY KEY ([id])');
        });

        it('supports a composite PK when more than one column is flagged', () => {
            const composite: MaterializedColumnSpec[] = [
                { Name: 'a', SQLType: 'int', Nullable: false, IsPrimaryKey: true },
                { Name: 'b', SQLType: 'int', Nullable: false, IsPrimaryKey: true },
                { Name: 'v', SQLType: 'int', Nullable: true, IsPrimaryKey: false },
            ];
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_X', composite);
            expect(sql).toContain('PRIMARY KEY ([a], [b])');
        });

        it('omits the PRIMARY KEY clause when no column is flagged', () => {
            const noPk = cols.map((c) => ({ ...c, IsPrimaryKey: false }));
            const sql = provider.generateMaterializedTableSQL('__mj', 'materialized_DemoSummary', noPk);
            expect(sql).not.toContain('PRIMARY KEY');
        });
    });

    describe('generateMaterializedWrapperViewSQL', () => {
        it('emits CREATE OR ALTER VIEW selecting * from the physical table (stable contract + atomic repoint)', () => {
            const sql = provider.generateMaterializedWrapperViewSQL('__mj', 'materialized_vwDemoSummary', 'materialized_DemoSummary');
            expect(sql).toContain('CREATE OR ALTER VIEW [__mj].[materialized_vwDemoSummary]');
            expect(sql).toContain('SELECT * FROM [__mj].[materialized_DemoSummary]');
            expect(sql).not.toContain('GO'); // GO-free batch; CREATE OR ALTER VIEW is valid as the sole statement
        });
    });

    describe('base-class default for unimplemented engines', () => {
        it('the SQL Server provider overrides both methods (no throw)', () => {
            expect(() => provider.generateMaterializedTableSQL('__mj', 't', cols)).not.toThrow();
            expect(() => provider.generateMaterializedWrapperViewSQL('__mj', 'v', 't')).not.toThrow();
        });
    });
});
