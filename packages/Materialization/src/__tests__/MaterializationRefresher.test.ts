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
