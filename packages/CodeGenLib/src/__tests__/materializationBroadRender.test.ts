import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { buildBroadRowFilterSQL } from '../Database/materializationBroadRender';

/**
 * Phase 2d — broad-render (plan §6.4). Strips the row-filter WHERE predicate(s) so the
 * materialization holds all rows. Assertions re-parse the output and inspect its WHERE subtree
 * (immune to sqlify formatting/quoting differences).
 */
describe('buildBroadRowFilterSQL', () => {
    const tsql = new SQLServerDialect();
    const pg = new PostgreSQLDialect();

    /** JSON of the output's top-level WHERE subtree (null when there is no WHERE). */
    const whereJson = (sql: string, dialect = tsql): string => {
        const ast = SQLParser.Astify(sql, dialect).ast;
        const stmt = Array.isArray(ast) ? ast[0] : ast;
        const where = (stmt as { where?: unknown } | null)?.where ?? null;
        return JSON.stringify(where);
    };

    it('removes the sole equality predicate → no WHERE remains', () => {
        const r = buildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status = 'Active'", ['Status'], tsql);
        expect(r.removedCount).toBe(1);
        expect(whereJson(r.sql)).toBe('null');
    });

    it('removes only the row-filter conjunct, keeps the others', () => {
        const r = buildBroadRowFilterSQL(
            "SELECT ID, Status FROM Orders WHERE Status = 'Active' AND ChapterID = 42",
            ['Status'],
            tsql,
        );
        expect(r.removedCount).toBe(1);
        const w = whereJson(r.sql);
        expect(w).toContain('ChapterID');
        expect(w).not.toContain('Status');
    });

    it('removes an IN-list row-filter predicate', () => {
        const r = buildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status IN ('A','B','C')", ['Status'], tsql);
        expect(r.removedCount).toBe(1);
        expect(whereJson(r.sql)).toBe('null');
    });

    it('removes multiple row-filter columns', () => {
        const r = buildBroadRowFilterSQL(
            "SELECT ID, Status, Region FROM Orders WHERE Status = 'Active' AND Region = 'East'",
            ['Status', 'Region'],
            tsql,
        );
        expect(r.removedCount).toBe(2);
        expect(whereJson(r.sql)).toBe('null');
    });

    it('keeps a non-row-filter conjunct while removing the row-filter one (order-independent)', () => {
        const r = buildBroadRowFilterSQL(
            "SELECT ID, Status, Region FROM Orders WHERE Region = 'East' AND Status = 'Active'",
            ['Status'],
            tsql,
        );
        expect(r.removedCount).toBe(1);
        const w = whereJson(r.sql);
        expect(w).toContain('Region');
        expect(w).not.toContain('Status');
    });

    it('removes a range (>) row-filter predicate', () => {
        const r = buildBroadRowFilterSQL('SELECT ID, Score FROM Members WHERE Score > 100', ['Score'], tsql);
        expect(r.removedCount).toBe(1);
        expect(whereJson(r.sql)).toBe('null');
    });

    it('PostgreSQL dialect: strips correctly via the {expr:{value}} column shape', () => {
        const r = buildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status = 'Active'", ['Status'], pg);
        expect(r.removedCount).toBe(1);
        expect(whereJson(r.sql, pg)).toBe('null');
    });

    it('no matching column → unchanged, removedCount 0', () => {
        const sql = "SELECT ID, Status FROM Orders WHERE ChapterID = 42";
        const r = buildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.removedCount).toBe(0);
        expect(r.sql).toBe(sql);
    });

    it('empty column list → unchanged no-op', () => {
        const sql = "SELECT ID FROM Orders WHERE Status = 'Active'";
        const r = buildBroadRowFilterSQL(sql, [], tsql);
        expect(r.removedCount).toBe(0);
        expect(r.sql).toBe(sql);
    });

    it('does NOT remove a column=column predicate (value side is not a literal)', () => {
        const sql = 'SELECT o.ID FROM Orders o WHERE o.Status = o.PrevStatus';
        const r = buildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.removedCount).toBe(0);
    });

    it('a query with no WHERE is returned unchanged', () => {
        const sql = 'SELECT ID, Status FROM Orders';
        const r = buildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.removedCount).toBe(0);
        expect(r.sql).toBe(sql);
    });
});
