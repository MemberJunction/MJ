/**
 * Paging a query that already limits its own rows, or carries a clause that must stay last.
 *
 * The rule: the query's own cap is part of what it means. `StartRow` / `MaxRows` page within the
 * capped result, the smaller of the two caps wins, and the total row count is the size of the
 * capped result. The query's own text is kept as written apart from the cap being replaced.
 */
import { describe, it, expect } from 'vitest';
import { QueryPagingEngine } from '../queryPagingEngine';

const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

describe('R1 — a query with its own LIMIT / OFFSET … FETCH gets one paging clause, not two', () => {
    it('PostgreSQL LIMIT: pages within the limit', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a LIMIT 50', 10, 20, 'postgresql');
        expect(count(paged.DataSQL, /\bLIMIT\b/gi)).toBe(1);
        expect(paged.DataSQL).toMatch(/\bLIMIT\s+20\s+OFFSET\s+10\b/i);
        expect(paged.CountSQL).toMatch(/LIMIT 50/);
    });

    it('PostgreSQL LIMIT … OFFSET: the page starts after the query’s own offset', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a LIMIT 50 OFFSET 5', 10, 20, 'postgresql');
        expect(paged.DataSQL).toMatch(/\bLIMIT\s+20\s+OFFSET\s+15\b/i);
        expect(count(paged.DataSQL, /\bOFFSET\b/gi)).toBe(1);
    });

    it('PostgreSQL LIMIT smaller than the page: the last page is cut at the limit', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a LIMIT 25', 20, 20, 'postgresql');
        expect(paged.DataSQL).toMatch(/\bLIMIT\s+5\s+OFFSET\s+20\b/i);
    });

    it('SQL Server OFFSET … FETCH: pages within the window', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH NEXT 50 ROWS ONLY', 10, 20, 'sqlserver');
        expect(count(paged.DataSQL, /\bOFFSET\b/gi)).toBe(1);
        expect(paged.DataSQL).toMatch(/OFFSET\s+15\s+ROWS\s+FETCH\s+NEXT\s+20\s+ROWS\s+ONLY/i);
    });

    it('a page past the query’s own cap is an empty result, not invalid SQL', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const sql = platform === 'postgresql' ? 'SELECT a FROM t ORDER BY a LIMIT 10' : 'SELECT a FROM t ORDER BY a OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY';
            const paged = QueryPagingEngine.WrapWithPaging(sql, 10, 20, platform);
            expect(paged.DataSQL).toMatch(/WHERE 1 = 0/);
            expect(paged.DataSQL).not.toMatch(/\bFETCH\s+NEXT\s+0\b|\bLIMIT\s+0\b/i);
        }
    });
});

describe('R6 — the smaller of the query’s TOP and MaxRows wins, and the total follows it', () => {
    it('SQL Server TOP 5 paged by 100 returns at most 5 rows', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT TOP 5 a FROM t ORDER BY a', 0, 100, 'sqlserver');
        expect(paged.DataSQL).not.toMatch(/\bTOP\b/i);
        expect(paged.DataSQL).toMatch(/OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+5\s+ROWS\s+ONLY/i);
        expect(paged.CountSQL).toMatch(/TOP 5/);
    });

    it('SQL Server TOP (10) DISTINCT, second page of 4', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT DISTINCT TOP (10) a FROM t ORDER BY a', 4, 4, 'sqlserver');
        expect(paged.DataSQL).toMatch(/^SELECT DISTINCT\s+a FROM t ORDER BY a/);
        expect(paged.DataSQL).toMatch(/OFFSET\s+4\s+ROWS\s+FETCH\s+NEXT\s+4\s+ROWS\s+ONLY/i);
    });

    it('MaxRows smaller than TOP: MaxRows wins', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT TOP 500 a FROM t ORDER BY a', 0, 20, 'sqlserver');
        expect(paged.DataSQL).toMatch(/FETCH\s+NEXT\s+20\s+ROWS\s+ONLY/i);
    });
});

describe('R5 — a query the parser cannot read keeps the same cap in its data and count queries', () => {
    it('TOP on an unparseable query (TRY_CAST)', () => {
        const sql = 'SELECT TOP 5 TRY_CAST(a AS INT) AS a FROM t ORDER BY a';
        const paged = QueryPagingEngine.WrapWithPaging(sql, 20, 10, 'sqlserver');
        expect(paged.CountSQL).toMatch(/TOP 5/);
        expect(paged.DataSQL).toMatch(/WHERE 1 = 0/);
    });
});

describe('R3 — a CTE-headed query whose main SELECT has TOP keeps its CTEs intact', () => {
    it('with a leading comment and a CTE', () => {
        const sql = '/* header */\nWITH c AS (SELECT a, b FROM t)\nSELECT TOP 10 a FROM c ORDER BY a';
        const paged = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');
        expect(paged.DataSQL).toContain('WITH c AS (SELECT a, b FROM t)');
        expect(paged.DataSQL).toMatch(/SELECT\s+a FROM c ORDER BY a\s+OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+10\s+ROWS\s+ONLY/i);
        expect(paged.CountSQL).toContain('c AS (SELECT a, b FROM t)');
    });
});

describe('R11 — a trailing OPTION hint stays last', () => {
    it('data and count queries end with the hint', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a OPTION (RECOMPILE)', 0, 10, 'sqlserver');
        expect(paged.DataSQL).toMatch(/FETCH\s+NEXT\s+10\s+ROWS\s+ONLY\s+OPTION \(RECOMPILE\)$/i);
        expect(paged.CountSQL).toMatch(/SELECT COUNT\(\*\) AS TotalRowCount FROM \[__count\]\s+OPTION \(RECOMPILE\)$/);
    });
});

describe('R4 — WITH RECURSIVE survives into the count query', () => {
    it('PostgreSQL', () => {
        const sql = 'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r ORDER BY n';
        const paged = QueryPagingEngine.WrapWithPaging(sql, 0, 2, 'postgresql');
        expect(paged.CountSQL).toMatch(/^WITH RECURSIVE r AS \(/);
        expect(paged.CountSQL).not.toMatch(/\(\s*RECURSIVE/i);
    });
});

describe('R15 — the count query keeps the SQL as written', () => {
    it('a derived-table column list survives', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const paged = QueryPagingEngine.WrapWithPaging('SELECT N FROM (VALUES (1), (2), (3)) AS v(N) ORDER BY N', 0, 2, platform);
            expect(paged.CountSQL).toContain('AS v(N)');
        }
    });
});

describe('R12 — an ORDER BY directly after a string literal is found', () => {
    it('one ORDER BY in the data query', () => {
        const paged = QueryPagingEngine.WrapWithPaging("SELECT a FROM t WHERE d >= '2024-01-01'ORDER BY a DESC", 0, 10, 'sqlserver');
        expect(count(paged.DataSQL, /ORDER\s+BY/gi)).toBe(1);
        expect(paged.CountSQL).not.toMatch(/ORDER\s+BY/i);
    });
});

describe('R17 / R18 — the default paging order is legal for set operations and DISTINCT on SQL Server', () => {
    it('UNION with no ORDER BY is ordered by its first column', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t UNION ALL SELECT b FROM u', 0, 10, 'sqlserver');
        expect(paged.DataSQL).toMatch(/ORDER BY 1\s+OFFSET/);
    });

    it('SELECT DISTINCT with no ORDER BY is ordered by its first column', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT DISTINCT a, b FROM t', 0, 10, 'sqlserver');
        expect(paged.DataSQL).toMatch(/ORDER BY 1\s+OFFSET/);
    });

    it('a plain SELECT keeps the order-free default', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t', 0, 10, 'sqlserver');
        expect(paged.DataSQL).toMatch(/ORDER BY \(SELECT NULL\)/);
    });

    it('a DISTINCT inside a subquery does not count', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM (SELECT DISTINCT a FROM t) d', 0, 10, 'sqlserver');
        expect(paged.DataSQL).toMatch(/ORDER BY \(SELECT NULL\)/);
    });
});

describe('R2 — TOP forms that are not a plain row count are kept, and the query is paged as a derived table', () => {
    it('TOP n PERCENT', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT TOP 10 PERCENT a FROM t ORDER BY a', 5, 5, 'sqlserver');
        expect(paged.DataSQL).toMatch(/SELECT \* FROM \(\nSELECT TOP 10 PERCENT a FROM t ORDER BY a\n\) AS \[__mj_page\]/);
        expect(paged.DataSQL).toMatch(/OFFSET\s+5\s+ROWS\s+FETCH\s+NEXT\s+5\s+ROWS\s+ONLY$/);
        expect(paged.CountSQL).toContain('TOP 10 PERCENT');
    });

    it('TOP n WITH TIES', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT TOP 10 WITH TIES a FROM t ORDER BY a', 0, 5, 'sqlserver');
        expect(paged.DataSQL).toContain('SELECT TOP 10 WITH TIES a FROM t ORDER BY a');
        expect(paged.DataSQL).not.toMatch(/SELECT\s+(PERCENT|WITH\s+TIES)/i);
    });

    it('TOP (expression)', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT TOP (@n) a FROM t ORDER BY a', 0, 5, 'sqlserver');
        expect(paged.DataSQL).toContain('SELECT TOP (@n) a FROM t ORDER BY a');
        expect(paged.DataSQL).toMatch(/\) AS \[__mj_page\]/);
    });

    it('SELECT ALL TOP n and leading whitespace are read as a plain cap', () => {
        const paged = QueryPagingEngine.WrapWithPaging('   \n  SELECT ALL TOP 4 a FROM t ORDER BY a', 0, 10, 'sqlserver');
        expect(paged.DataSQL).not.toMatch(/\bTOP\b/i);
        expect(paged.DataSQL).toMatch(/FETCH\s+NEXT\s+4\s+ROWS\s+ONLY/);
    });

    it('PostgreSQL FETCH FIRST n ROWS WITH TIES', () => {
        const paged = QueryPagingEngine.WrapWithPaging('SELECT a FROM t ORDER BY a FETCH FIRST 3 ROWS WITH TIES', 0, 5, 'postgresql');
        expect(paged.DataSQL).toContain('FETCH FIRST 3 ROWS WITH TIES\n) AS "__mj_page"');
        expect(paged.DataSQL).toMatch(/LIMIT\s+5\s+OFFSET\s+0$/);
    });
});

describe('D5b — FOR JSON inside a subquery does not disable the row cap', () => {
    it('an unparseable query with a FOR JSON subquery is still capped', () => {
        const sql = 'SELECT TRY_CAST(a AS INT) AS a, (SELECT b FROM u WHERE u.k = t.k FOR JSON PATH) AS j FROM t';
        expect(QueryPagingEngine.WrapWithMaxRows(sql, 10, 'sqlserver')).not.toBe(sql);
    });

    it('a set operation with a FOR JSON subquery is still capped', () => {
        const sql = 'SELECT a FROM t UNION ALL SELECT (SELECT b FROM u FOR JSON PATH) FROM v';
        expect(QueryPagingEngine.WrapWithMaxRows(sql, 10, 'sqlserver')).not.toBe(sql);
    });
});

describe('R20 / R15 — the row cap keeps the query as written and its ORDER BY in scope', () => {
    it('an unparseable query ordered by an aliased column is capped without moving the ORDER BY', () => {
        const sql = 'SELECT TRY_CAST(t.a AS INT) AS a FROM t ORDER BY t.a';
        const capped = QueryPagingEngine.WrapWithMaxRows(sql, 5, 'sqlserver');
        expect(capped).toBe('SELECT TOP 5 TRY_CAST(t.a AS INT) AS a FROM t ORDER BY t.a');
    });

    it('a set operation ordered by an output column is capped in place', () => {
        const capped = QueryPagingEngine.WrapWithMaxRows('SELECT a FROM t UNION SELECT a FROM u ORDER BY a', 5, 'sqlserver');
        expect(capped).toMatch(/^SELECT a FROM t UNION SELECT a FROM u ORDER BY a\s+OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+5\s+ROWS\s+ONLY$/);
    });

    it('a derived-table column list survives the cap', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            expect(QueryPagingEngine.WrapWithMaxRows('SELECT N FROM (VALUES (1), (2)) AS v(N) ORDER BY N', 1, platform)).toContain('AS v(N)');
        }
    });

    it('the caller’s identifiers and keywords are not re-quoted or re-cased', () => {
        const sql = 'select ID, DisplayName from mjit.Item where Name like \'a%\' order by ID';
        expect(QueryPagingEngine.WrapWithMaxRows(sql, 10, 'sqlserver')).toBe('select TOP 10 ID, DisplayName from mjit.Item where Name like \'a%\' order by ID');
    });

    it('a CTE-headed query gets TOP on its main SELECT, with the CTEs untouched', () => {
        const sql = 'WITH [c] AS (SELECT TOP 3 a FROM t ORDER BY a) SELECT DISTINCT a FROM [c]';
        expect(QueryPagingEngine.WrapWithMaxRows(sql, 10, 'sqlserver')).toBe('WITH [c] AS (SELECT TOP 3 a FROM t ORDER BY a) SELECT DISTINCT TOP 10 a FROM [c]');
    });

    it('a trailing OPTION hint stays last', () => {
        expect(QueryPagingEngine.WrapWithMaxRows('SELECT a FROM t UNION SELECT b FROM u OPTION (RECOMPILE)', 5, 'sqlserver'))
            .toMatch(/FETCH NEXT 5 ROWS ONLY\nOPTION \(RECOMPILE\)$/);
    });
});
