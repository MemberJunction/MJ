/**
 * The rebuild wraps the source SELECT as a derived table. Its top-level ORDER BY is removed as a span
 * edit on the author's text (nothing is regenerated), and its leading CTEs are moved in front of the
 * wrapping statement, since a WITH clause cannot sit inside a derived table on SQL Server.
 */
import { describe, it, expect } from 'vitest';
import { MaterializationRefresher, MATERIALIZATION_SURROGATE_COLUMN } from '../MaterializationRefresher';

describe('StripTopLevelOrderBy keeps the author\'s text', () => {
    it('removes exactly the ORDER BY clause; casing, brackets and comments stay as written', () => {
        const sql = 'select [r].[Region] /* region */, sum(r.Amt) as Total from dbo.Sales r group by [r].[Region] order by Total desc';
        expect(MaterializationRefresher.StripTopLevelOrderBy(sql, false))
            .toBe('select [r].[Region] /* region */, sum(r.Amt) as Total from dbo.Sales r group by [r].[Region]');
    });

    it('keeps a clause after the ORDER BY (OPTION)', () => {
        expect(MaterializationRefresher.StripTopLevelOrderBy('SELECT a FROM t ORDER BY a OPTION (RECOMPILE)', false))
            .toBe('SELECT a FROM t OPTION (RECOMPILE)');
    });

    it('strips the main query\'s ORDER BY of a WITH-headed source, and leaves a CTE body alone', () => {
        const sql = 'WITH c AS (SELECT TOP 5 a FROM t ORDER BY a) SELECT a FROM c ORDER BY a';
        expect(MaterializationRefresher.StripTopLevelOrderBy(sql, false)).toBe('WITH c AS (SELECT TOP 5 a FROM t ORDER BY a) SELECT a FROM c');
    });

    it('a set operation\'s trailing ORDER BY is removed', () => {
        expect(MaterializationRefresher.StripTopLevelOrderBy('SELECT a FROM t UNION SELECT b FROM u ORDER BY 1', false))
            .toBe('SELECT a FROM t UNION SELECT b FROM u');
    });
});

describe('SplitSourceForDerivedTable', () => {
    it('returns a source without WITH unchanged', () => {
        expect(MaterializationRefresher.SplitSourceForDerivedTable('SELECT a FROM t', false)).toEqual({ With: '', Query: 'SELECT a FROM t' });
    });

    it('drops a trailing semicolon, which cannot sit inside the parentheses', () => {
        expect(MaterializationRefresher.SplitSourceForDerivedTable('SELECT a FROM t;\n', false).Query).toBe('SELECT a FROM t');
        expect(MaterializationRefresher.SplitSourceForDerivedTable('WITH c AS (SELECT 1 AS a) SELECT a FROM c;', false))
            .toEqual({ With: 'WITH c AS (SELECT 1 AS a)\n', Query: 'SELECT a FROM c' });
    });

    it('keeps several CTEs and the RECURSIVE keyword as written', () => {
        const sql = 'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3), s AS (SELECT n FROM r) SELECT n FROM s';
        expect(MaterializationRefresher.SplitSourceForDerivedTable(sql, true))
            .toEqual({ With: 'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3), s AS (SELECT n FROM r)\n', Query: 'SELECT n FROM s' });
    });
});

describe('full rebuild of a WITH-headed source', () => {
    const base = { schema: '__mj', tableName: 'materialized_Demo', viewName: 'materialized_vwDemo' };
    const sourceSelect = 'WITH c AS (SELECT a, b FROM __mj.Foo) SELECT a, b FROM c';

    it('SQL Server: the WITH clause goes in front of SELECT … INTO, the query inside the derived table', () => {
        const stmts = MaterializationRefresher.BuildFullRebuildStatementsSQLServer({ ...base, sourceSelect, surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN });
        expect(stmts[1]).toBe(`WITH c AS (SELECT a, b FROM __mj.Foo)\nSELECT IDENTITY(int, 1, 1) AS [${MATERIALIZATION_SURROGATE_COLUMN}], src.* INTO [__mj].[materialized_Demo__shadow] FROM (SELECT a, b FROM c) AS src`);
    });

    it('SQL Server base-view case', () => {
        const stmts = MaterializationRefresher.BuildFullRebuildStatementsSQLServer({ ...base, sourceSelect });
        expect(stmts[1]).toBe('WITH c AS (SELECT a, b FROM __mj.Foo)\nSELECT * INTO [__mj].[materialized_Demo__shadow] FROM (SELECT a, b FROM c) AS src');
    });

    it('PostgreSQL: CREATE TABLE … AS WITH … SELECT * FROM (query)', () => {
        const stmts = MaterializationRefresher.BuildFullRebuildStatementsPostgreSQL({ ...base, sourceSelect });
        expect(stmts[1]).toBe('CREATE TABLE __mj."materialized_Demo__shadow" AS WITH c AS (SELECT a, b FROM __mj.Foo)\nSELECT * FROM (SELECT a, b FROM c) AS src');
    });
});
