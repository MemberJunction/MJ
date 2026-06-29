import { describe, it, expect } from 'vitest';
import { MaterializationRefresher, MATERIALIZATION_SURROGATE_COLUMN } from '../MaterializationRefresher';

/**
 * Sub-step R1: the SQL Server full-rebuild + atomic-swap statement builder (plan §11.2).
 * Pure logic, fully unit-testable; the live DB behavior is covered by the integration check.
 */
describe('MaterializationRefresher.buildFullRebuildStatementsSQLServer', () => {
    const base = { schema: '__mj', tableName: 'materialized_Demo', viewName: 'materialized_vwDemo' };

    describe('query case (synthetic IDENTITY surrogate)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            ...base,
            sourceSelect: 'SELECT a, b FROM __mj.Foo',
            surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN,
        });

        it('produces the 6-statement build → atomic-swap → rename → repoint sequence', () => {
            expect(stmts).toHaveLength(6);
        });

        it('builds a fresh shadow from the source, generating the IDENTITY surrogate', () => {
            expect(stmts[0]).toContain("IF OBJECT_ID('[__mj].[materialized_Demo__shadow]', 'U') IS NOT NULL DROP TABLE [__mj].[materialized_Demo__shadow]");
            expect(stmts[1]).toContain(`SELECT IDENTITY(int, 1, 1) AS [${MATERIALIZATION_SURROGATE_COLUMN}], src.* INTO [__mj].[materialized_Demo__shadow] FROM (SELECT a, b FROM __mj.Foo) AS src`);
        });

        it('atomically repoints the wrapper view to the shadow, then drops/renames/repoints back', () => {
            expect(stmts[2]).toBe('CREATE OR ALTER VIEW [__mj].[materialized_vwDemo] AS SELECT * FROM [__mj].[materialized_Demo__shadow]');
            expect(stmts[3]).toContain("DROP TABLE [__mj].[materialized_Demo]");
            expect(stmts[4]).toBe("EXEC sp_rename '__mj.materialized_Demo__shadow', 'materialized_Demo'");
            expect(stmts[5]).toBe('CREATE OR ALTER VIEW [__mj].[materialized_vwDemo] AS SELECT * FROM [__mj].[materialized_Demo]');
        });

        it('never truncates the live table in place (no TRUNCATE)', () => {
            expect(stmts.some((s) => /TRUNCATE/i.test(s))).toBe(false);
        });
    });

    describe('filterDue (due-selection for the sweep)', () => {
        const now = new Date('2026-06-23T12:00:00Z');
        it('includes rows never refreshed (no NextRefreshAt) and those due at/before now; excludes future', () => {
            const rows = [
                { id: 'never', NextRefreshAt: null },
                { id: 'overdue', NextRefreshAt: new Date('2026-06-23T11:00:00Z') },
                { id: 'exactly-now', NextRefreshAt: new Date('2026-06-23T12:00:00Z') },
                { id: 'future', NextRefreshAt: new Date('2026-06-23T13:00:00Z') },
            ];
            const due = MaterializationRefresher.filterDue(rows, now).map((r) => r.id);
            expect(due).toEqual(['never', 'overdue', 'exactly-now']);
        });
    });

    describe('base-view case (no surrogate — source already carries its PK)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            ...base,
            sourceSelect: 'SELECT * FROM __mj.vwDemoSource',
        });

        it('copies the source shape directly with SELECT * INTO (no IDENTITY surrogate)', () => {
            expect(stmts[1]).toBe('SELECT * INTO [__mj].[materialized_Demo__shadow] FROM (SELECT * FROM __mj.vwDemoSource) AS src');
            expect(stmts[1]).not.toContain('IDENTITY');
        });

        it('still performs the atomic swap + rename + repoint', () => {
            expect(stmts[2]).toContain('CREATE OR ALTER VIEW [__mj].[materialized_vwDemo] AS SELECT * FROM [__mj].[materialized_Demo__shadow]');
            expect(stmts[4]).toBe("EXEC sp_rename '__mj.materialized_Demo__shadow', 'materialized_Demo'");
        });
    });
});

/**
 * PG counterpart of the full-rebuild + atomic-swap builder (plan §11.2). Pure logic; live PG
 * behavior is a gated integration follow-up. PG quoting: schema bare, object double-quoted.
 */
describe('MaterializationRefresher.buildFullRebuildStatementsPostgreSQL', () => {
    const base = { schema: '__mj', tableName: 'materialized_demo', viewName: 'materialized_vw_demo' };

    describe('query case (synthetic surrogate as the FIRST column)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            ...base,
            sourceSelect: 'SELECT a, b FROM __mj.foo',
            surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN,
        });

        it('produces the 6-statement build → atomic-swap → rename → repoint sequence', () => {
            expect(stmts).toHaveLength(6);
        });

        it('builds the shadow with the surrogate FIRST via ROW_NUMBER (PG view-column-order strictness)', () => {
            expect(stmts[0]).toBe('DROP TABLE IF EXISTS __mj."materialized_demo__shadow" CASCADE');
            expect(stmts[1]).toBe(`CREATE TABLE __mj."materialized_demo__shadow" AS SELECT ROW_NUMBER() OVER () AS "${MATERIALIZATION_SURROGATE_COLUMN}", src.* FROM (SELECT a, b FROM __mj.foo) AS src`);
            // surrogate must precede the source columns so CREATE OR REPLACE VIEW stays column-compatible
            expect(stmts[1].indexOf(MATERIALIZATION_SURROGATE_COLUMN)).toBeLessThan(stmts[1].indexOf('src.*'));
        });

        it('repoints via CREATE OR REPLACE VIEW, then drops (CASCADE) / renames / repoints back', () => {
            expect(stmts[2]).toBe('CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo__shadow"');
            expect(stmts[3]).toBe('DROP TABLE IF EXISTS __mj."materialized_demo" CASCADE');
            expect(stmts[4]).toBe('ALTER TABLE __mj."materialized_demo__shadow" RENAME TO "materialized_demo"');
            expect(stmts[5]).toBe('CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo"');
        });

        it('never truncates the live table in place (no TRUNCATE)', () => {
            expect(stmts.some((s) => /TRUNCATE/i.test(s))).toBe(false);
        });
    });

    describe('base-view case (no surrogate — source already carries its PK)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            ...base,
            sourceSelect: 'SELECT * FROM __mj.vw_demo_source',
        });

        it('copies the source shape directly with CREATE TABLE AS (no ROW_NUMBER surrogate)', () => {
            expect(stmts[1]).toBe('CREATE TABLE __mj."materialized_demo__shadow" AS SELECT * FROM (SELECT * FROM __mj.vw_demo_source) AS src');
            expect(stmts[1]).not.toContain('ROW_NUMBER');
        });

        it('still performs the atomic swap + rename + repoint', () => {
            expect(stmts[2]).toContain('CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo__shadow"');
            expect(stmts[4]).toBe('ALTER TABLE __mj."materialized_demo__shadow" RENAME TO "materialized_demo"');
        });
    });
});
