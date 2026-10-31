import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { BuildBroadRowFilterSQL } from '../Database/materializationBroadRender';

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
        const r = BuildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status = 'Active'", ['Status'], tsql);
        expect(r.RemovedCount).toBe(1);
        expect(whereJson(r.Sql)).toBe('null');
    });

    it('removes only the row-filter conjunct, keeps the others', () => {
        const r = BuildBroadRowFilterSQL(
            "SELECT ID, Status FROM Orders WHERE Status = 'Active' AND ChapterID = 42",
            ['Status'],
            tsql,
        );
        expect(r.RemovedCount).toBe(1);
        const w = whereJson(r.Sql);
        expect(w).toContain('ChapterID');
        expect(w).not.toContain('Status');
    });

    it('removes an IN-list row-filter predicate', () => {
        const r = BuildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status IN ('A','B','C')", ['Status'], tsql);
        expect(r.RemovedCount).toBe(1);
        expect(whereJson(r.Sql)).toBe('null');
    });

    it('removes multiple row-filter columns', () => {
        const r = BuildBroadRowFilterSQL(
            "SELECT ID, Status, Region FROM Orders WHERE Status = 'Active' AND Region = 'East'",
            ['Status', 'Region'],
            tsql,
        );
        expect(r.RemovedCount).toBe(2);
        expect(whereJson(r.Sql)).toBe('null');
    });

    it('keeps a non-row-filter conjunct while removing the row-filter one (order-independent)', () => {
        const r = BuildBroadRowFilterSQL(
            "SELECT ID, Status, Region FROM Orders WHERE Region = 'East' AND Status = 'Active'",
            ['Status'],
            tsql,
        );
        expect(r.RemovedCount).toBe(1);
        const w = whereJson(r.Sql);
        expect(w).toContain('Region');
        expect(w).not.toContain('Status');
    });

    it('removes a range (>) row-filter predicate', () => {
        const r = BuildBroadRowFilterSQL('SELECT ID, Score FROM Members WHERE Score > 100', ['Score'], tsql);
        expect(r.RemovedCount).toBe(1);
        expect(whereJson(r.Sql)).toBe('null');
    });

    it('PostgreSQL dialect: strips correctly via the {expr:{value}} column shape', () => {
        const r = BuildBroadRowFilterSQL("SELECT ID, Status FROM Orders WHERE Status = 'Active'", ['Status'], pg);
        expect(r.RemovedCount).toBe(1);
        expect(whereJson(r.Sql, pg)).toBe('null');
    });

    it('no matching column → unchanged, removedCount 0', () => {
        const sql = "SELECT ID, Status FROM Orders WHERE ChapterID = 42";
        const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.RemovedCount).toBe(0);
        expect(r.Sql).toBe(sql);
    });

    it('empty column list → unchanged no-op', () => {
        const sql = "SELECT ID FROM Orders WHERE Status = 'Active'";
        const r = BuildBroadRowFilterSQL(sql, [], tsql);
        expect(r.RemovedCount).toBe(0);
        expect(r.Sql).toBe(sql);
    });

    it('does NOT remove a column=column predicate (value side is not a literal)', () => {
        const sql = 'SELECT o.ID FROM Orders o WHERE o.Status = o.PrevStatus';
        const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.RemovedCount).toBe(0);
    });

    it('a query with no WHERE is returned unchanged', () => {
        const sql = 'SELECT ID, Status FROM Orders';
        const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql);
        expect(r.RemovedCount).toBe(0);
        expect(r.Sql).toBe(sql);
    });

    describe('exact-count guard (expectedRemovals)', () => {
        it('ambiguous is false without expectedRemovals (legacy strip-all behavior)', () => {
            const r = BuildBroadRowFilterSQL(
                "SELECT ID, Region FROM Orders WHERE Region = 'East' AND Region <> 'Internal'",
                ['Region'],
                tsql,
            );
            expect(r.RemovedCount).toBe(2);
            expect(r.Ambiguous).toBe(false);
        });

        it('refuses (ambiguous) when a STATIC predicate on the filter column inflates the count', () => {
            const sql = "SELECT ID, Region FROM Orders WHERE Region = 'East' AND Region <> 'Internal'";
            const r = BuildBroadRowFilterSQL(sql, ['Region'], tsql, 1);
            expect(r.RemovedCount).toBe(2); // one parameter predicate + one static predicate matched
            expect(r.Ambiguous).toBe(true);
            expect(r.Sql).toBe(sql); // fail-safe: original SQL returned unmodified when ambiguous
        });

        it('refuses (ambiguous) when a same-named column on another table inflates the count (qualifier-blind)', () => {
            const sql = "SELECT o.ID FROM Orders o JOIN Chapters c ON c.ID = o.ChapterID WHERE o.Region = 'East' AND c.Region = 'X'";
            const r = BuildBroadRowFilterSQL(sql, ['Region'], tsql, 1);
            expect(r.RemovedCount).toBe(2);
            expect(r.Ambiguous).toBe(true);
            expect(r.Sql).toBe(sql);
        });

        it('accepts (not ambiguous) when the match count equals expectedRemovals', () => {
            const r = BuildBroadRowFilterSQL(
                "SELECT ID, Status, Region FROM Orders WHERE Status = 'Active' AND Region = 'East'",
                ['Status', 'Region'],
                tsql,
                2,
            );
            expect(r.RemovedCount).toBe(2);
            expect(r.Ambiguous).toBe(false);
            expect(whereJson(r.Sql)).toBe('null'); // both parameter predicates cleanly stripped
        });

        it('flags ambiguous when expected but zero matched (parameter predicate not found)', () => {
            const sql = 'SELECT ID, Status FROM Orders WHERE ChapterID = 42';
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(0);
            expect(r.Ambiguous).toBe(true);
            expect(r.Sql).toBe(sql);
        });
    });

    describe("span edits on the author's text", () => {
        it('removes the FIRST conjunct and keeps comments, casing and bracket style as written', () => {
            const sql = "SELECT o.[ID], o.Status /* status col */\nFROM dbo.[Orders] o\nwhere o.Status = 'Active' and o.ChapterID = 42 -- trailing\nORDER BY o.[ID]";
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(1);
            expect(r.Ambiguous).toBe(false);
            expect(r.Sql).toBe("SELECT o.[ID], o.Status /* status col */\nFROM dbo.[Orders] o\nwhere o.ChapterID = 42 -- trailing\nORDER BY o.[ID]");
        });

        it('removes a MIDDLE conjunct with one adjacent AND', () => {
            const r = BuildBroadRowFilterSQL("SELECT ID FROM Orders WHERE ChapterID = 42 AND Status = 'Active' AND IsDeleted = 0", ['Status'], tsql, 1);
            expect(r.Sql).toBe('SELECT ID FROM Orders WHERE ChapterID = 42 AND IsDeleted = 0');
        });

        it('removes the LAST conjunct with the AND before it', () => {
            const r = BuildBroadRowFilterSQL("SELECT ID FROM Orders WHERE ChapterID = 42 AND Status IN ('A', 'B')", ['Status'], tsql, 1);
            expect(r.Sql).toBe('SELECT ID FROM Orders WHERE ChapterID = 42');
        });

        it('drops the whole WHERE when every conjunct goes, keeping the clauses after it', () => {
            const r = BuildBroadRowFilterSQL("SELECT Region, COUNT(*) AS n FROM Orders WHERE Region = 'East' GROUP BY Region", ['Region'], tsql, 1);
            expect(r.Sql).toBe('SELECT Region, COUNT(*) AS n FROM Orders GROUP BY Region');
        });

        it('edits only the outer WHERE of a WITH-headed source, leaving the CTE as written', () => {
            const sql = "WITH recent AS (SELECT ID, Status FROM Orders WHERE Status <> 'Void')\nSELECT ID, Status FROM recent WHERE Status = 'Active' AND ID > 10";
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(1);
            expect(r.Sql).toBe("WITH recent AS (SELECT ID, Status FROM Orders WHERE Status <> 'Void')\nSELECT ID, Status FROM recent WHERE ID > 10");
        });

        it('removes a conjunct inside a parenthesized AND group', () => {
            const r = BuildBroadRowFilterSQL("SELECT ID FROM Orders WHERE (Status = 'A' AND ChapterID = 1) AND Region = 'East'", ['Status'], tsql, 1);
            expect(r.Sql).toBe("SELECT ID FROM Orders WHERE (ChapterID = 1) AND Region = 'East'");
        });

        it('keeps the AND of a BETWEEN with its predicate', () => {
            const r = BuildBroadRowFilterSQL('SELECT ID FROM Members WHERE Score BETWEEN 10 AND 50 AND ChapterID = 2', ['Score'], tsql, 1);
            expect(r.Sql).toBe('SELECT ID FROM Members WHERE ChapterID = 2');
        });

        it('keeps the line break after a line comment when it removes the WHERE', () => {
            const r = BuildBroadRowFilterSQL("SELECT ID FROM Orders -- every order\nWHERE Status = 'A'", ['Status'], tsql, 1);
            expect(r.Sql).toBe('SELECT ID FROM Orders -- every order\n');
        });

        it('PostgreSQL: keeps double-quoted identifiers as written', () => {
            const r = BuildBroadRowFilterSQL('SELECT "ID" FROM "Orders" WHERE "Status" = \'Active\' AND "ChapterID" = 1', ['Status'], pg, 1);
            expect(r.Sql).toBe('SELECT "ID" FROM "Orders" WHERE "ChapterID" = 1');
        });
    });

    describe('unreadable structure is left unchanged (fail closed)', () => {
        it('a predicate under a top-level OR is not removed', () => {
            const sql = "SELECT ID FROM Orders WHERE Status = 'A' OR ChapterID = 1";
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(0);
            expect(r.Ambiguous).toBe(true);
            expect(r.Sql).toBe(sql);
        });

        it('a set operation is not edited', () => {
            const sql = "SELECT ID FROM Orders WHERE Status = 'A' UNION ALL SELECT ID FROM Archive";
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(0);
            expect(r.Sql).toBe(sql);
        });

        it('text the parser cannot read completely is not edited', () => {
            const sql = "SELECT ID FROM Orders WHERE (Status = 'A'";
            const r = BuildBroadRowFilterSQL(sql, ['Status'], tsql, 1);
            expect(r.RemovedCount).toBe(0);
            expect(r.Sql).toBe(sql);
        });
    });
});
