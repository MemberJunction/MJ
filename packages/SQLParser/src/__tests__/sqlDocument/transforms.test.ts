/**
 * The transforms built on EditSet: StripOrderBy, SetRowCap, WrapAsDerivedTable, HoistCTEs,
 * RenameCTE, ReplaceSelectList and AppendTail, on SQL Server and PostgreSQL.
 */
import { describe, it, expect } from 'vitest';
import { AppendTail, ReplaceSelectList, SetRowCap, StripOrderBy } from '../../edit/clauseTransforms.js';
import { HoistCTEs, RenameCTE, WrapAsDerivedTable } from '../../edit/cteTransforms.js';
import { SqlDocument } from '../../sql/sqlDocument.js';
import { PG, Parse, ParseClean, SS } from './helpers.js';

const UNION = 'SELECT a.ID, a.Name FROM dbo.A a UNION ALL SELECT b.ID, b.Name FROM dbo.B b';

function wrap(sql: string, dialect = SS, alias = '_mj_capped'): string {
    return WrapAsDerivedTable(ParseClean(sql, dialect), dialect, alias).Text;
}

describe('StripOrderBy', () => {
    it('removes exactly the ORDER BY clause and keeps FOR JSON, OPTION and LIMIT tails', () => {
        expect(StripOrderBy(ParseClean('SELECT a FROM t ORDER BY a, b DESC FOR JSON PATH', SS)).Text).toBe('SELECT a FROM t FOR JSON PATH');
        expect(StripOrderBy(ParseClean('SELECT a FROM t ORDER BY a OPTION (RECOMPILE)', SS)).Text).toBe('SELECT a FROM t OPTION (RECOMPILE)');
        expect(StripOrderBy(ParseClean('SELECT a FROM t ORDER BY a LIMIT 5', PG)).Text).toBe('SELECT a FROM t LIMIT 5');
    });

    it('removes a set operation\'s ORDER BY, not a branch\'s or a window\'s', () => {
        expect(StripOrderBy(ParseClean(`${UNION} ORDER BY Name`, SS)).Text).toBe(UNION);
        const windowed = 'SELECT ROW_NUMBER() OVER (ORDER BY a) AS r FROM t';
        expect(StripOrderBy(ParseClean(`${windowed} ORDER BY r`, SS)).Text).toBe(windowed);
    });

    it('keeps the line break after a line comment, so the next clause is not commented out', () => {
        expect(StripOrderBy(ParseClean('SELECT a FROM t -- note\nORDER BY a OPTION (MAXDOP 1)', SS)).Text).toBe('SELECT a FROM t -- note\n OPTION (MAXDOP 1)');
    });

    it('does nothing when there is no ORDER BY, and refuses SQL it cannot read', () => {
        const none = StripOrderBy(ParseClean('SELECT a FROM t', SS));
        expect([none.Applied, none.Text, none.Diagnostics]).toEqual([false, 'SELECT a FROM t', []]);
        expect(StripOrderBy(Parse('SELECT a FROM t ORDER BY (a', SS)).Diagnostics.map(d => d.Code)).toEqual(['SQL_TRANSFORM_NOT_APPLICABLE']);
    });

    it('returns the edits it made over the original text', () => {
        const result = StripOrderBy(ParseClean('SELECT a FROM t ORDER BY a', SS));
        expect(result.Edits?.Edits.map(e => [e.Kind, e.Span])).toEqual([['Replace', { Start: 15, End: 26 }]]);
    });
});

describe('SetRowCap', () => {
    it('inserts TOP after SELECT [DISTINCT] on SQL Server', () => {
        expect(SetRowCap(ParseClean('SELECT a FROM t', SS), SS, 10).Text).toBe('SELECT TOP 10 a FROM t');
        expect(SetRowCap(ParseClean('SELECT DISTINCT a FROM t', SS), SS, 10).Text).toBe('SELECT DISTINCT TOP 10 a FROM t');
    });

    it('tightens a larger numeric cap and leaves a smaller one', () => {
        expect(SetRowCap(ParseClean('SELECT TOP (50) a FROM t', SS), SS, 10).Text).toBe('SELECT TOP (10) a FROM t');
        expect(SetRowCap(ParseClean('SELECT TOP 5 a FROM t', SS), SS, 10).Applied).toBe(false);
        expect(SetRowCap(ParseClean('SELECT a FROM t LIMIT 100', PG), PG, 10).Text).toBe('SELECT a FROM t LIMIT 10');
        expect(SetRowCap(ParseClean('SELECT a FROM t ORDER BY a OFFSET 0 ROWS FETCH NEXT 99 ROWS ONLY', SS), SS, 10).Text).toBe('SELECT a FROM t ORDER BY a OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
    });

    it('caps a SQL Server set operation with OFFSET … FETCH and the select-list ORDER BY', () => {
        expect(SetRowCap(ParseClean(UNION, SS), SS, 10).Text).toBe(`${UNION} ORDER BY 1 OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY`);
    });

    it('adds FETCH after a SQL Server OFFSET', () => {
        expect(SetRowCap(ParseClean('SELECT a FROM t ORDER BY a OFFSET 5 ROWS', SS), SS, 10).Text).toBe('SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY');
    });

    it('appends LIMIT before a PostgreSQL row-lock clause', () => {
        expect(SetRowCap(ParseClean('SELECT a FROM t ORDER BY a FOR UPDATE', PG), PG, 10).Text).toBe('SELECT a FROM t ORDER BY a LIMIT 10 FOR UPDATE');
    });

    it('refuses a cap that is not a plain number', () => {
        expect(SetRowCap(ParseClean('SELECT TOP 10 PERCENT a FROM t', SS), SS, 5).Diagnostics.map(d => d.Code)).toEqual(['SQL_TRANSFORM_NOT_APPLICABLE']);
    });
});

describe('WrapAsDerivedTable', () => {
    it('moves an ORDER BY with no row cap outside, dropping the qualifiers (#5592 forms included)', () => {
        expect(wrap(`${UNION} ORDER BY a.Name DESC, [a] /*c*/ . [ID], a . Name`)).toBe(`SELECT * FROM (\n${UNION}\n) AS [_mj_capped]\nORDER BY Name DESC, [ID], Name`);
    });

    it('keeps a function\'s schema while its column argument loses the qualifier', () => {
        expect(wrap(`${UNION} ORDER BY dbo.fnLen(a.Name), [dbo].[fnRank] (ID) DESC`)).toMatch(/\nORDER BY dbo\.fnLen\(Name\), \[dbo\]\.\[fnRank\] \(ID\) DESC$/);
    });

    it('moves string literals and COLLATE unchanged', () => {
        const orderBy = "ORDER BY CASE WHEN Name = 'a.b' THEN 0 ELSE 1 END, Name COLLATE Latin1_General_CS_AS";
        expect(wrap(`${UNION} ${orderBy}`).endsWith(`\n${orderBy}`)).toBe(true);
    });

    it('fixes the derived-table ORDER BY without TOP: the inner ORDER BY goes', () => {
        const out = wrap('SELECT a.Name FROM dbo.A a ORDER BY a.Name');
        expect(out).toBe('SELECT * FROM (\nSELECT a.Name FROM dbo.A a\n) AS [_mj_capped]\nORDER BY Name');
        expect(SqlDocument.Parse(out, SS).IsComplete).toBe(true);
    });

    it('keeps an ORDER BY that serves the query\'s own row cap, and copies it outside', () => {
        expect(wrap('SELECT TOP 5 a.Name FROM dbo.A a ORDER BY a.Name')).toBe('SELECT * FROM (\nSELECT TOP 5 a.Name FROM dbo.A a ORDER BY a.Name\n) AS [_mj_capped]\nORDER BY Name');
    });

    it('hoists leading CTEs out and moves OPTION to the outer query', () => {
        expect(wrap('WITH c AS (SELECT 1 AS n) SELECT n FROM c ORDER BY n OPTION (MAXRECURSION 10)'))
            .toBe('WITH c AS (SELECT 1 AS n)\nSELECT * FROM (\nSELECT n FROM c\n) AS [_mj_capped]\nORDER BY n\nOPTION (MAXRECURSION 10)');
    });

    it('quotes the alias with the dialect and honours Keep / Drop', () => {
        expect(WrapAsDerivedTable(ParseClean('SELECT a FROM t ORDER BY a', PG), PG, 'Paged Rows', { OrderBy: 'Keep' }).Text).toBe('SELECT * FROM (\nSELECT a FROM t ORDER BY a\n) AS "Paged Rows"');
        expect(WrapAsDerivedTable(ParseClean('SELECT a FROM t ORDER BY a', PG), PG, 'w', { OrderBy: 'Drop', SelectList: 'COUNT(*)' }).Text).toBe('SELECT COUNT(*) FROM (\nSELECT a FROM t\n) AS "w"');
    });

    it('refuses a query ending in FOR JSON', () => {
        expect(WrapAsDerivedTable(ParseClean('SELECT a FROM t FOR JSON PATH', SS), SS, 'w').Applied).toBe(false);
    });
});

describe('HoistCTEs', () => {
    it('returns the leading CTE list as written and the remaining body', () => {
        const hoisted = HoistCTEs(ParseClean('WITH RECURSIVE a AS (SELECT 1 AS x), b (y) AS (SELECT x FROM a) SELECT y FROM b;', PG));
        expect(hoisted?.Recursive).toBe(true);
        expect(hoisted?.CTEs.map(c => [c.Name, c.Text, c.Body])).toEqual([['a', 'a AS (SELECT 1 AS x)', 'SELECT 1 AS x'], ['b', 'b (y) AS (SELECT x FROM a)', 'SELECT x FROM a']]);
        expect(hoisted?.CTEListText).toBe('a AS (SELECT 1 AS x), b (y) AS (SELECT x FROM a)');
        expect(hoisted?.Body).toBe('SELECT y FROM b');
    });

    it('returns an empty list for a query with no WITH, and null for one it cannot read', () => {
        expect(HoistCTEs(ParseClean('SELECT 1', SS))?.CTEs).toEqual([]);
        expect(HoistCTEs(Parse('SELECT (', SS))).toBeNull();
    });
});

describe('RenameCTE', () => {
    it('renames the declaration and every bound reference, never strings, aliases or columns', () => {
        const sql = "WITH Active AS (SELECT ID, Active FROM dbo.C) SELECT Active.ID, a2.*, Active.*, 'Active' AS s, a2.Active FROM Active JOIN Active a2 ON a2.ID = Active . ID WHERE Active.ID IN (SELECT Active.ID FROM Active)";
        expect(RenameCTE(ParseClean(sql, SS), SS, 'Active', 'Active 2').Text).toBe(
            "WITH [Active 2] AS (SELECT ID, Active FROM dbo.C) SELECT [Active 2].ID, a2.*, [Active 2].*, 'Active' AS s, a2.Active FROM [Active 2] JOIN [Active 2] a2 ON a2.ID = [Active 2] . ID WHERE [Active 2].ID IN (SELECT [Active 2].ID FROM [Active 2])");
    });

    it('renames a CTE with a column list, and quotes for PostgreSQL', () => {
        expect(RenameCTE(ParseClean('WITH x (a, b) AS (SELECT 1, 2) SELECT x.a FROM x', PG), PG, 'x', 'Totals').Text).toBe('WITH "Totals" (a, b) AS (SELECT 1, 2) SELECT "Totals".a FROM "Totals"');
    });

    it('leaves a same-named table and a nested CTE that shadows it alone', () => {
        const sql = 'WITH c AS (SELECT 1 AS k) SELECT * FROM c, s.c, (WITH c AS (SELECT 2 AS k) SELECT k FROM c) d';
        expect(RenameCTE(ParseClean(sql, PG), PG, 'c', 'c1').Text).toBe('WITH "c1" AS (SELECT 1 AS k) SELECT * FROM "c1", s.c, (WITH c AS (SELECT 2 AS k) SELECT k FROM c) d');
    });

    it('does nothing for a name that is not a CTE', () => {
        expect(RenameCTE(ParseClean('SELECT 1 FROM t', SS), SS, 't', 'u').Applied).toBe(false);
    });
});

describe('ReplaceSelectList', () => {
    it('replaces the select list of a plain select block', () => {
        expect(ReplaceSelectList(ParseClean('SELECT TOP 5 a, b AS c FROM t WHERE x = 1', SS), '1').Text).toBe('SELECT TOP 5 1 FROM t WHERE x = 1');
    });

    it('refuses DISTINCT and set operations, whose select lists decide the rows', () => {
        expect(ReplaceSelectList(ParseClean('SELECT DISTINCT a FROM t', SS), '1').Applied).toBe(false);
        expect(ReplaceSelectList(ParseClean(UNION, SS), '1').Applied).toBe(false);
    });
});

describe('AppendTail', () => {
    it('appends OFFSET … FETCH before FOR JSON and merges OPTION hints on SQL Server', () => {
        const result = AppendTail(ParseClean('SELECT a FROM t ORDER BY a FOR JSON PATH OPTION (RECOMPILE)', SS), SS, { Offset: 20, Fetch: 10, OptionHints: ['MAXDOP 1'] });
        expect(result.Text).toBe('SELECT a FROM t ORDER BY a OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY FOR JSON PATH OPTION (RECOMPILE, MAXDOP 1)');
    });

    it('adds the ORDER BY SQL Server paging needs, and an OPTION clause when there is none', () => {
        expect(AppendTail(ParseClean('SELECT a FROM t', SS), SS, { Fetch: 10, OptionHints: ['RECOMPILE'] }).Text).toBe('SELECT a FROM t ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY\nOPTION (RECOMPILE)');
    });

    it('appends LIMIT and OFFSET on PostgreSQL', () => {
        expect(AppendTail(ParseClean('SELECT a FROM t ORDER BY a', PG), PG, { Limit: 10, Offset: 20 }).Text).toBe('SELECT a FROM t ORDER BY a LIMIT 10 OFFSET 20');
    });

    it('refuses a clause the query already has, or the dialect lacks', () => {
        expect(AppendTail(ParseClean('SELECT a FROM t ORDER BY a OFFSET 5 ROWS', SS), SS, { Offset: 1 }).Applied).toBe(false);
        expect(AppendTail(ParseClean('SELECT a FROM t', PG), PG, { OptionHints: ['RECOMPILE'] }).Applied).toBe(false);
        expect(AppendTail(ParseClean('SELECT TOP 5 a FROM t ORDER BY a', SS), SS, { Offset: 1 }).Applied).toBe(false);
    });
});
