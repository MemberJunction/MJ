/**
 * Paging and row caps read from the structural parser (`SqlDocument`), with the token reader as
 * the fallback for SQL the parser cannot read completely: the constant count body, the recursive
 * keyword and query-hint placement taken from the dialect's grammar, and the fallback itself.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect } from '@memberjunction/sql-dialect';
import { QueryPagingEngine } from '../queryPagingEngine';
import { CountBodyCanSelectConstant, ReadPagingLayout } from '../pagingLayout';

const countOf = (sql: string, platform: 'sqlserver' | 'postgresql' = 'sqlserver') =>
    QueryPagingEngine.WrapWithPaging(sql, 0, 10, platform).CountSQL;

describe('count query — a plain select is counted with a constant select list', () => {
    it('duplicate column names no longer reach the count CTE', () => {
        expect(countOf('SELECT a.ID, b.ID FROM A a JOIN B b ON a.x = b.x ORDER BY a.ID'))
            .toBe('WITH [__count] AS (\nSELECT 1 AS [__mj_row] FROM A a JOIN B b ON a.x = b.x\n)\nSELECT COUNT(*) AS TotalRowCount FROM [__count]');
    });

    it('an unnamed expression column is replaced too, and the WHERE is kept as written', () => {
        expect(countOf("SELECT a + b, ISNULL(c, 0) FROM t /* keep */ WHERE Name = 'x'"))
            .toContain("SELECT 1 AS [__mj_row] FROM t /* keep */ WHERE Name = 'x'");
    });

    it('PostgreSQL quotes the constant column with its own quotes', () => {
        expect(countOf('SELECT id, id FROM t', 'postgresql')).toContain('SELECT 1 AS "__mj_row" FROM t');
    });

    const keptAsWritten: Array<[string, string]> = [
        ['an aggregate (one row without GROUP BY)', 'SELECT COUNT(*) FROM t'],
        ['a GROUP BY', 'SELECT a FROM t GROUP BY a'],
        ['a HAVING', 'SELECT a FROM t GROUP BY a HAVING COUNT(*) > 1'],
        ['SELECT DISTINCT', 'SELECT DISTINCT a FROM t'],
        ['a set operation', 'SELECT a FROM t UNION SELECT b FROM u'],
        ['its own TOP', 'SELECT TOP 5 a FROM t ORDER BY a'],
        ['a window aggregate', 'SELECT SUM(a) OVER () AS s FROM t'],
    ];
    for (const [name, sql] of keptAsWritten) {
        it(`${name} is counted with its select list as written`, () => {
            expect(countOf(sql)).not.toContain('__mj_row');
        });
    }

    it('a set-returning function on PostgreSQL is counted as written', () => {
        expect(countOf('SELECT generate_series(1, 3) AS n FROM t', 'postgresql')).toContain('SELECT generate_series(1, 3) AS n FROM t');
    });

    it('the eligibility check reads only parsed layouts', () => {
        const dialect = GetDialect('sqlserver');
        expect(CountBodyCanSelectConstant(ReadPagingLayout('SELECT a FROM t', dialect))).toBe(true);
        expect(CountBodyCanSelectConstant(ReadPagingLayout('SELECT a FROM t WHERE x = {{ y }}', dialect))).toBe(false);
    });
});

describe('count query — grammar facts come from the dialect', () => {
    it('PostgreSQL keeps WITH RECURSIVE from its grammar', () => {
        const sql = 'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r';
        expect(countOf(sql, 'postgresql')).toMatch(/^WITH RECURSIVE r AS \(/);
    });

    it('SQL Server writes no recursive keyword', () => {
        const sql = 'WITH r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r';
        expect(countOf(sql)).toMatch(/^WITH r AS \(/);
    });

    it('the query-hint clause stays last on the count query', () => {
        expect(countOf('SELECT a, a FROM t OPTION (RECOMPILE)'))
            .toBe('WITH [__count] AS (\nSELECT 1 AS [__mj_row] FROM t\n)\nSELECT COUNT(*) AS TotalRowCount FROM [__count]\nOPTION (RECOMPILE)');
    });

    it('a PostgreSQL row lock is not carried to the count query', () => {
        expect(countOf('SELECT a FROM t FOR UPDATE', 'postgresql')).not.toMatch(/FOR UPDATE/);
    });
});

describe('SQL the structural parser cannot read completely falls back to the token reader', () => {
    const unreadable = 'SELECT a, a FROM t WHERE x = {{ y }} ORDER BY a';

    it('the layout is read from tokens', () => {
        expect(ReadPagingLayout(unreadable, GetDialect('sqlserver')).Parsed).toBeNull();
    });

    it('it is still paged and counted, with its select list as written', () => {
        const paged = QueryPagingEngine.WrapWithPaging(unreadable, 20, 10, 'sqlserver');
        expect(paged.DataSQL).toBe(`${unreadable}\nOFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY`);
        expect(paged.CountSQL).toContain('SELECT a, a FROM t WHERE x = {{ y }}\n)');
    });

    it('it is still capped', () => {
        expect(QueryPagingEngine.WrapWithMaxRows(unreadable, 10, 'sqlserver')).toBe('SELECT TOP 10 a, a FROM t WHERE x = {{ y }} ORDER BY a');
    });
});

describe('row caps on a statement with no top-level SELECT', () => {
    it('without an ORDER BY, it is still capped as a derived table (no ORDER BY inside)', () => {
        const result = QueryPagingEngine.ApplyMaxRows('(SELECT a FROM t)', 10, 'sqlserver');
        expect(result.SQL).toBe('SELECT TOP 10 * FROM (\n(SELECT a FROM t)\n) AS [_mj_capped]');
        expect(result.Outcome.Method).toBe('derived-table');
    });

    it('a parenthesized query with a hint keeps the hint last', () => {
        expect(QueryPagingEngine.WrapWithMaxRows('(SELECT a FROM t) ORDER BY a OPTION (RECOMPILE)', 10, 'sqlserver'))
            .toBe('(SELECT a FROM t) ORDER BY a\nOFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY\nOPTION (RECOMPILE)');
    });
});
