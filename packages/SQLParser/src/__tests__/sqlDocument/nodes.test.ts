/**
 * The SqlDocument tree, node kind by node kind, on SQL Server and PostgreSQL (and the other
 * dialects where their grammar differs).
 */
import { describe, it, expect } from 'vitest';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import { SqlDocument } from '../../sql/sqlDocument.js';
import type { FromSource, JoinSource, SelectCore } from '../../sql/sqlNodes.js';
import { CodesOf, Dotted, PG, PLATFORMS, Parse, ParseClean, SS, Top, TopSelect } from './helpers.js';

function firstSource(core: SelectCore): FromSource {
    const source = core.From?.Sources[0];
    if (source === undefined) throw new Error('no FROM source');
    return source;
}

function join(source: FromSource): JoinSource {
    if (source.Kind !== 'Join') throw new Error(`expected a join, got ${source.Kind}`);
    return source;
}

describe.each(PLATFORMS)('statements and WITH (%s)', (_name, dialect) => {
    it('reads one statement with its terminator', () => {
        const doc = ParseClean('SELECT a FROM t;', dialect);
        expect(doc.Statements).toHaveLength(1);
        expect(doc.Statements[0].StatementKind).toBe('Select');
        expect(doc.Text(doc.Statements[0].Terminator ?? { Start: 0, End: 0 })).toBe(';');
    });

    it('splits statements at semicolons and skips leading and repeated ones', () => {
        const doc = Parse(';;SELECT 1;; SELECT 2;', dialect);
        expect(doc.Statements.map(s => doc.Text(s))).toEqual(['SELECT 1;', 'SELECT 2;']);
    });

    it('reads WITH, CTE names, column lists and bodies', () => {
        const doc = ParseClean('WITH a AS (SELECT 1 AS x), b (y, z) AS (SELECT x, x FROM a) SELECT y FROM b', dialect);
        const clause = doc.Statements[0].With;
        expect(clause?.CTEs.map(c => c.Name.Value)).toEqual(['a', 'b']);
        expect(clause?.CTEs[1].ColumnList?.map(c => c.Value)).toEqual(['y', 'z']);
        expect(doc.Text(clause?.CTEs[0].Body ?? { Start: 0, End: 0 })).toBe('SELECT 1 AS x');
        expect(doc.Text(clause?.CTEs[0].BodySpan ?? { Start: 0, End: 0 })).toBe('(SELECT 1 AS x)');
    });

    it('keeps an empty text as no statements', () => {
        expect(Parse('', dialect).Statements).toEqual([]);
        expect(Parse('  -- only a comment\n', dialect).Statements).toEqual([]);
    });
});

describe('WITH clause dialect forms', () => {
    it('reads WITH RECURSIVE and MATERIALIZED on PostgreSQL', () => {
        const doc = ParseClean('WITH RECURSIVE r AS NOT MATERIALIZED (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r', PG);
        expect(doc.Statements[0].With?.Recursive).toBe(true);
        expect(doc.Statements[0].With?.CTEs[0].Materialized).toBe('NotMaterialized');
    });

    it('flags WITH RECURSIVE where the dialect has none', () => {
        expect(CodesOf(Parse('WITH RECURSIVE r AS (SELECT 1 AS n) SELECT n FROM r', SS))).toContain('SQL_NOT_IN_DIALECT');
    });

    it('reads a WITH nested in a subquery (PostgreSQL)', () => {
        const doc = ParseClean('SELECT * FROM (WITH inner_cte AS (SELECT 1 AS a) SELECT a FROM inner_cte) d', PG);
        const derived = firstSource(TopSelect(doc));
        expect(derived.Kind === 'Derived' && derived.Query.With?.CTEs[0].Name.Value).toBe('inner_cte');
    });

    it('reads a CTE that fails to parse as an Unknown body with a diagnostic', () => {
        const doc = Parse('WITH a (SELECT 1) SELECT 1', SS);
        expect(doc.IsComplete).toBe(false);
        expect(doc.Statements[0].Body.Kind).toBe('Unknown');
    });
});

describe.each(PLATFORMS)('select blocks (%s)', (_name, dialect) => {
    it('reads every block clause', () => {
        const sql = 'SELECT DISTINCT a.x, COUNT(*) AS n FROM t a WHERE a.y > 1 GROUP BY a.x HAVING COUNT(*) > 2 ORDER BY n DESC';
        const core = TopSelect(ParseClean(sql, dialect));
        expect(core.Distinct?.Form).toBe('Distinct');
        expect(core.SelectList).toHaveLength(2);
        expect(core.From?.Sources).toHaveLength(1);
        expect(core.Where?.Condition.Text).toBe('a.y > 1');
        expect(core.GroupBy?.Items.map(i => i.Text)).toEqual(['a.x']);
        expect(core.Having?.Condition.Text).toBe('COUNT(*) > 2');
        expect(core.OrderBy?.Items[0].Direction).toBe('Desc');
    });

    it('reads clauses written in an unusual order', () => {
        const core = TopSelect(ParseClean('SELECT a FROM t GROUP BY a WHERE a > 1', dialect));
        expect(core.Where).not.toBeNull();
        expect(core.GroupBy).not.toBeNull();
    });

    it('reads select items: aliases, stars and qualified stars', () => {
        const doc = ParseClean('SELECT *, t.*, a AS x, b y, "q" AS "Quoted Name", c + 1 FROM t', dialect);
        const items = TopSelect(doc).SelectList;
        expect(items.map(i => i.IsStar)).toEqual([true, true, false, false, false, false]);
        expect(Dotted(items[1].StarQualifier)).toBe('t');
        expect(items.map(i => i.Alias?.Value ?? null)).toEqual([null, null, 'x', 'y', 'Quoted Name', null]);
        expect(items.map(i => i.AliasForm)).toEqual([null, null, 'As', 'Bare', 'As', null]);
        expect(items[5].Expression.Text).toBe('c + 1');
    });

    it('does not take the last word of an expression for an alias', () => {
        const items = TopSelect(ParseClean('SELECT CASE WHEN a = 1 THEN 2 ELSE 3 END, a.b, NULL, CAST(x AS INT) FROM t', dialect)).SelectList;
        expect(items.map(i => i.Alias?.Value ?? null)).toEqual([null, null, null, null]);
    });

    it('reads ORDER BY items with direction, NULLS and ordinals', () => {
        const items = TopSelect(ParseClean('SELECT a, b FROM t ORDER BY a ASC, 2 DESC, b', dialect)).OrderBy?.Items ?? [];
        expect(items.map(i => [i.Expression.Text, i.Direction, i.IsOrdinal])).toEqual([['a', 'Asc', false], ['2', 'Desc', true], ['b', null, false]]);
    });

    it('reads a select with no FROM', () => {
        const core = TopSelect(ParseClean('SELECT 1 AS one', dialect));
        expect(core.From).toBeNull();
        expect(core.SelectList[0].Alias?.Value).toBe('one');
    });

    it('reads SELECT … INTO', () => {
        const core = TopSelect(ParseClean('SELECT a INTO archive_copy FROM t', dialect));
        expect(Dotted(core.Into?.Target ?? null)).toBe('archive_copy');
    });

    it('reads a WINDOW clause', () => {
        const core = TopSelect(ParseClean('SELECT ROW_NUMBER() OVER w AS rn FROM t WINDOW w AS (PARTITION BY g ORDER BY x)', dialect));
        expect(core.Window?.Definitions.map(d => [d.Name.Value, d.Specification.Text])).toEqual([['w', 'PARTITION BY g ORDER BY x']]);
    });
});

describe('select block dialect forms', () => {
    it('reads TOP n, TOP (n) PERCENT and WITH TIES on SQL Server', () => {
        expect(TopSelect(ParseClean('SELECT TOP 10 a FROM t', SS)).Top?.Value.Text).toBe('10');
        const top = TopSelect(ParseClean('SELECT DISTINCT TOP (5) PERCENT WITH TIES a FROM t ORDER BY a', SS)).Top;
        expect([top?.Value.Text, top?.Parenthesized, top?.Percent, top?.WithTies]).toEqual(['5', true, true, true]);
    });

    it('flags TOP where the dialect has none', () => {
        expect(CodesOf(Parse('SELECT TOP 10 a FROM t', PG))).toContain('SQL_NOT_IN_DIALECT');
    });

    it('reads SQL Server alias = expression and string aliases', () => {
        const items = TopSelect(ParseClean("SELECT Total = SUM(x), [Count] = COUNT(*), y 'Why', @v = 1 FROM t", SS)).SelectList;
        expect(items.map(i => [i.Alias?.Value ?? null, i.AliasForm, i.Expression.Text])).toEqual([
            ['Total', 'Equals', 'SUM(x)'], ['Count', 'Equals', 'COUNT(*)'], ['Why', 'String', 'y'], [null, null, '@v = 1'],
        ]);
    });

    it('reads a = b as a comparison on PostgreSQL', () => {
        const item = TopSelect(ParseClean('SELECT a = b FROM t', PG)).SelectList[0];
        expect([item.Alias, item.Expression.Text]).toEqual([null, 'a = b']);
    });

    it('reads DISTINCT ON on PostgreSQL', () => {
        const distinct = TopSelect(ParseClean('SELECT DISTINCT ON (a, b) a, b, c FROM t ORDER BY a, b, c', PG)).Distinct;
        expect([distinct?.Form, distinct?.On.map(e => e.Text)]).toEqual(['DistinctOn', ['a', 'b']]);
    });

    it('reads LIMIT, OFFSET and FETCH on PostgreSQL', () => {
        const core = TopSelect(ParseClean('SELECT a FROM t ORDER BY a LIMIT 10 OFFSET 20', PG));
        expect([core.Limit?.Value?.Text, core.Offset?.Value.Text]).toEqual(['10', '20']);
        const fetch = TopSelect(ParseClean('SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH FIRST 3 ROWS ONLY', PG)).Fetch;
        expect([fetch?.Value?.Text, fetch?.WithTies]).toEqual(['3', false]);
        expect(TopSelect(ParseClean('SELECT a FROM t LIMIT ALL', PG)).Limit?.Value).toBeNull();
    });

    it('reads OFFSET … FETCH NEXT … WITH TIES on SQL Server', () => {
        const core = TopSelect(ParseClean('SELECT a FROM t ORDER BY a OFFSET 10 ROWS FETCH NEXT 5 ROWS WITH TIES', SS));
        expect([core.Offset?.Value.Text, core.Fetch?.Value?.Text, core.Fetch?.WithTies]).toEqual(['10', '5', true]);
    });

    it('does not read LIMIT as a clause on SQL Server', () => {
        expect(Parse('SELECT a FROM t LIMIT 5', SS).IsComplete).toBe(false);
    });

    it('reads MySQL LIMIT offset, count', () => {
        const limit = TopSelect(ParseClean('SELECT a FROM t LIMIT 5, 10', GetQueryDialect('mysql'))).Limit;
        expect([limit?.LeadingOffset?.Text, limit?.Value?.Text]).toEqual(['5', '10']);
    });

    it('reads FOR JSON / FOR XML and OPTION on SQL Server', () => {
        const core = TopSelect(ParseClean("SELECT a FROM t ORDER BY a FOR XML PATH(''), ROOT('r'), TYPE OPTION (RECOMPILE, MAXDOP 1)", SS));
        expect(core.For?.Form).toBe('Xml');
        expect(core.Option?.Hints.Text).toBe('RECOMPILE, MAXDOP 1');
        expect(TopSelect(ParseClean('SELECT a FROM t FOR JSON PATH, INCLUDE_NULL_VALUES', SS)).For?.Form).toBe('Json');
    });

    it('flags FOR JSON on PostgreSQL and reads FOR UPDATE there', () => {
        expect(CodesOf(Parse('SELECT a FROM t FOR JSON PATH', PG))).toContain('SQL_NOT_IN_DIALECT');
        const core = TopSelect(ParseClean('SELECT a FROM t FOR NO KEY UPDATE OF t SKIP LOCKED', PG));
        expect(core.For?.Form).toBe('NoKeyUpdate');
    });

    it('reads QUALIFY on Snowflake', () => {
        const core = TopSelect(ParseClean('SELECT a FROM t QUALIFY ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) = 1', GetQueryDialect('snowflake')));
        expect(core.Qualify?.Condition.Text).toBe('ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) = 1');
    });

    it('reads GROUP BY … WITH ROLLUP', () => {
        const group = TopSelect(ParseClean('SELECT a, SUM(b) AS s FROM t GROUP BY a WITH ROLLUP', SS)).GroupBy;
        expect(group?.Items.map(i => i.Text)).toEqual(['a']);
    });

    it('reads IS DISTINCT FROM as an operator, not a FROM clause', () => {
        const core = TopSelect(ParseClean('SELECT a IS DISTINCT FROM b AS changed FROM t', PG));
        expect(core.SelectList[0].Alias?.Value).toBe('changed');
        const source = firstSource(core);
        expect(source.Kind === 'Table' ? Dotted(source.Name) : null).toBe('t');
    });
});

describe.each(PLATFORMS)('set operations and query expressions (%s)', (_name, dialect) => {
    it('reads UNION ALL with a trailing ORDER BY on the set operation', () => {
        const top = Top(ParseClean('SELECT a FROM r UNION ALL SELECT a FROM b ORDER BY a', dialect));
        expect(top.Kind).toBe('SetOperation');
        if (top.Kind !== 'SetOperation') return;
        expect([top.Operator, top.All, top.OrderBy?.Items[0].Expression.Text]).toEqual(['Union', true, 'a']);
        expect(top.Right.Kind === 'Select' && top.Right.OrderBy).toBeNull();
    });

    it('binds INTERSECT tighter than UNION and EXCEPT', () => {
        const top = Top(ParseClean('SELECT a FROM r EXCEPT SELECT a FROM b INTERSECT SELECT a FROM g', dialect));
        expect(top.Kind === 'SetOperation' && [top.Operator, top.Right.Kind, top.Right.Kind === 'SetOperation' && top.Right.Operator]).toEqual(['Except', 'SetOperation', 'Intersect']);
    });

    it('reads parenthesized branches and a parenthesized query with its own tail', () => {
        const top = Top(ParseClean('(SELECT a FROM r) UNION (SELECT a FROM b) ORDER BY 1', dialect));
        expect(top.Kind === 'SetOperation' && [top.Left.Kind, top.Right.Kind]).toEqual(['Parenthesized', 'Parenthesized']);
        const single = Top(ParseClean('(SELECT a FROM r) ORDER BY a', dialect));
        expect(single.Kind === 'Parenthesized' && single.OrderBy?.Items.length).toBe(1);
    });

    it('reads a VALUES query', () => {
        const top = Top(ParseClean('VALUES (1, 2), (3, 4)', dialect));
        expect(top.Kind === 'Values' && top.Rows.map(r => r.Text)).toEqual(['(1, 2)', '(3, 4)']);
    });
});

describe('set operators by dialect', () => {
    it('reads MINUS where the dialect has it, and not elsewhere', () => {
        const top = Top(ParseClean('SELECT a FROM r MINUS SELECT a FROM b', GetQueryDialect('oracle')));
        expect(top.Kind === 'SetOperation' && top.Operator).toBe('Minus');
        expect(Top(Parse('SELECT a FROM r MINUS SELECT a FROM b', PG)).Kind).not.toBe('SetOperation');
    });
});

describe.each(PLATFORMS)('FROM sources (%s)', (_name, dialect) => {
    it('reads tables with schema and alias forms', () => {
        const sources = TopSelect(ParseClean('SELECT 1 FROM s.t1 AS a, t2 b, t3', dialect)).From?.Sources ?? [];
        expect(sources.map(s => (s.Kind === 'Table' ? [Dotted(s.Name), s.Alias?.Value ?? null] : s.Kind))).toEqual([['s.t1', 'a'], ['t2', 'b'], ['t3', null]]);
    });

    it('reads a derived table with column aliases', () => {
        const source = firstSource(TopSelect(ParseClean('SELECT d.x FROM (SELECT 1 AS a) AS d (x)', dialect)));
        expect(source.Kind === 'Derived' && [source.Alias?.Value, source.ColumnAliases.map(c => c.Value)]).toEqual(['d', ['x']]);
    });

    it('reads a VALUES source with column aliases', () => {
        const source = firstSource(TopSelect(ParseClean('SELECT v.n FROM (VALUES (1), (2)) AS v (n)', dialect)));
        expect(source.Kind === 'ValuesSource' && [source.Rows.length, source.Alias?.Value, source.ColumnAliases.map(c => c.Value)]).toEqual([2, 'v', ['n']]);
    });

    it('reads every join kind with ON and USING', () => {
        const sql = 'SELECT 1 FROM a INNER JOIN b ON b.k = a.k LEFT OUTER JOIN c ON c.k = a.k RIGHT JOIN d ON d.k = a.k FULL JOIN e ON e.k = a.k CROSS JOIN f JOIN g USING (k)';
        const kinds: string[] = [];
        let source = firstSource(TopSelect(ParseClean(sql, dialect)));
        while (source.Kind === 'Join') {
            kinds.unshift(`${source.JoinKind}:${source.On?.Text ?? source.Using?.map(u => u.Value).join(',') ?? '-'}`);
            source = source.Left;
        }
        expect(kinds).toEqual(['Inner:b.k = a.k', 'Left:c.k = a.k', 'Right:d.k = a.k', 'Full:e.k = a.k', 'Cross:-', 'Inner:k']);
    });

    it('reads a parenthesized join', () => {
        const source = firstSource(TopSelect(ParseClean('SELECT 1 FROM (a JOIN b ON b.k = a.k) JOIN c ON c.k = a.k', dialect)));
        expect(join(source).Left.Kind).toBe('ParenthesizedSource');
    });

    it('reads a function source', () => {
        const source = firstSource(TopSelect(ParseClean('SELECT f.x FROM s.fn(1, 2) f', dialect)));
        expect(source.Kind === 'Function' && [Dotted(source.Name), source.Arguments.Text, source.Alias?.Value]).toEqual(['s.fn', '1, 2', 'f']);
    });
});

describe('FROM source dialect forms', () => {
    it('reads SQL Server table hints, CROSS / OUTER APPLY, OPENJSON WITH and PIVOT', () => {
        const core = TopSelect(ParseClean("SELECT 1 FROM dbo.t AS x WITH (NOLOCK) CROSS APPLY OPENJSON(x.j) WITH (a INT '$.a') AS j OUTER APPLY (SELECT TOP 1 y FROM u WHERE u.k = x.k) z", SS));
        const outer = firstSource(core);
        expect(outer.Kind === 'Apply' && outer.ApplyKind).toBe('Outer');
        if (outer.Kind !== 'Apply' || outer.Left.Kind !== 'Apply') throw new Error('expected nested APPLY');
        const table = outer.Left.Left;
        expect(table.Kind === 'Table' && table.Hints !== null).toBe(true);
        expect(outer.Left.Right.Kind === 'Function' && outer.Left.Right.Options !== null).toBe(true);
        const pivot = firstSource(TopSelect(ParseClean('SELECT * FROM (SELECT r, q, v FROM s) src PIVOT (SUM(v) FOR q IN ([Q1], [Q2])) p', SS)));
        expect(pivot.Kind === 'Pivot' && [pivot.Form, pivot.Alias?.Value]).toEqual(['Pivot', 'p']);
    });

    it('reads a temporal FOR SYSTEM_TIME clause as a table hint', () => {
        const source = firstSource(TopSelect(ParseClean("SELECT 1 FROM dbo.t FOR SYSTEM_TIME AS OF '2026-01-01' AS h", SS)));
        expect(source.Kind === 'Table' && source.Alias?.Value).toBe('h');
    });

    it('reads LATERAL and WITH ORDINALITY on PostgreSQL, and NATURAL JOIN', () => {
        const core = TopSelect(ParseClean('SELECT 1 FROM a, LATERAL (SELECT * FROM b WHERE b.k = a.k) l NATURAL JOIN unnest(a.arr) WITH ORDINALITY AS u(v, i)', PG));
        const lateral = core.From?.Sources[1];
        expect(lateral?.Kind === 'Join' && lateral.Natural && lateral.Left.Kind === 'Derived' && lateral.Left.Lateral).toBe(true);
    });

    it('flags APPLY on PostgreSQL and LATERAL on SQL Server', () => {
        expect(CodesOf(Parse('SELECT 1 FROM a CROSS APPLY f(a.x) z', PG))).toContain('SQL_NOT_IN_DIALECT');
        expect(CodesOf(Parse('SELECT 1 FROM a, LATERAL (SELECT 1 AS x) z', SS))).toContain('SQL_NOT_IN_DIALECT');
    });
});

describe('expressions', () => {
    it('finds identifier paths, skipping types, date parts, variables and keywords', () => {
        const expr = TopSelect(ParseClean("SELECT CAST(a.x AS NVARCHAR(50)) + CONVERT(VARCHAR(10), b, 120) + DATEADD(day, 1, c) + @p + d COLLATE Latin1_General_CI_AS FROM t a", SS)).SelectList[0].Expression;
        expect(expr.Identifiers().map(p => p.Parts.map(x => x.Value).join('.'))).toEqual(['a.x', 'b', 'c', 'd']);
    });

    it('finds identifiers in PostgreSQL casts, EXTRACT, AT TIME ZONE and window frames', () => {
        const sql = "SELECT x::timestamp with time zone, EXTRACT(YEAR FROM d), e AT TIME ZONE 'UTC', SUM(v) OVER (PARTITION BY g ORDER BY o ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t";
        const ids = TopSelect(ParseClean(sql, PG)).SelectList.flatMap(i => i.Expression.Identifiers().map(p => p.Parts[0].Value));
        expect(ids).toEqual(['x', 'd', 'e', 'v', 'g', 'o']);
    });

    it('keeps a column named like a date part or a type when it is not in that position', () => {
        const ids = TopSelect(ParseClean('SELECT Year, Date, Range, DATEDIFF(StartDate, EndDate) FROM t', GetQueryDialect('mysql'))).SelectList.flatMap(i => i.Expression.Identifiers().map(p => p.Parts[0].Value));
        expect(ids).toEqual(['Year', 'Date', 'Range', 'StartDate', 'EndDate']);
    });

    it('finds function calls, nested ones included, with their arguments', () => {
        const calls = TopSelect(ParseClean('SELECT COALESCE(SUM(a.v), 0), dbo.fnX(b) FROM t a', SS)).SelectList.flatMap(i => i.Expression.FunctionCalls());
        expect(calls.map(c => [Dotted(c.Name), c.Arguments.Text])).toEqual([['COALESCE', 'SUM(a.v), 0'], ['SUM', 'a.v'], ['dbo.fnX', 'b']]);
    });

    it('finds stars: bare, qualified and as a function argument', () => {
        const items = TopSelect(ParseClean('SELECT *, t.*, COUNT(*), a * b FROM t', SS)).SelectList;
        expect(items.flatMap(i => i.Expression.Stars()).map(s => [Dotted(s.Qualifier), s.FunctionName])).toEqual([[null, null], ['t', null], [null, 'COUNT']]);
    });

    it('parses nested subqueries as child queries and does not report their names', () => {
        const where = TopSelect(ParseClean('SELECT 1 FROM t WHERE t.a IN (SELECT u.a FROM u) AND EXISTS (SELECT 1 FROM v WHERE v.k = t.k)', SS)).Where;
        expect(where?.Condition.Subqueries()).toHaveLength(2);
        expect(where?.Condition.Identifiers().map(p => p.Parts.map(x => x.Value).join('.'))).toEqual(['t.a']);
    });

    it('reads spaced and commented qualifiers as one path', () => {
        const ids = TopSelect(ParseClean('SELECT a . Name, [a] /*c*/ . [ID] FROM t a', SS)).SelectList.map(i => i.Expression.Identifiers()[0].Parts.map(p => p.Value));
        expect(ids).toEqual([['a', 'Name'], ['a', 'ID']]);
    });
});

describe('tolerance and diagnostics', () => {
    it('never throws, whatever the input', () => {
        const inputs = ['(', ')', ')))(((', 'SELECT', 'SELECT FROM', 'WITH', 'WITH a AS', 'SELECT * FROM (', "SELECT 'unclosed", '/* open', 'SELECT a FROM t WHERE (((', ',,,', 'FROM t', 'ORDER BY 1', '{{ x', 'SELECT {% if a %}1{% endif %}'];
        for (const sql of inputs) {
            for (const [, dialect] of PLATFORMS) expect(() => SqlDocument.Parse(sql, dialect).Print(), sql).not.toThrow();
        }
    });

    it('keeps an unrecognised clause as an Unknown node and reads the rest', () => {
        const doc = Parse('SELECT a FROM t TABLESAMPLE_X 10 WHERE a > 1', SS);
        const core = TopSelect(doc);
        expect(core.Unrecognized.map(u => doc.Text(u))).toEqual(['10']);
        expect(core.Where?.Condition.Text).toBe('a > 1');
        expect(CodesOf(doc)).toContain('SQL_UNKNOWN_SYNTAX');
    });

    it('reports unbalanced parentheses', () => {
        expect(CodesOf(Parse('SELECT (a FROM t', SS))).toContain('SQL_UNBALANCED_PARENTHESIS');
        expect(CodesOf(Parse('SELECT a) FROM t', SS))).toContain('SQL_UNBALANCED_PARENTHESIS');
    });

    it('reads a template tag as an opaque value and reports it', () => {
        const doc = Parse('SELECT a FROM t WHERE b = {{ x | sqlString }}', SS);
        expect(TopSelect(doc).Where?.Condition.Text).toBe('b = {{ x | sqlString }}');
        expect(CodesOf(doc)).toContain('SQL_TEMPLATE_TOKEN');
        expect(doc.IsComplete).toBe(false);
    });

    it('keeps a statement that is not a query whole', () => {
        const doc = Parse("INSERT INTO t (a) SELECT b FROM u", SS);
        expect(doc.Statements[0].StatementKind).toBe('Insert');
        expect(doc.Statements[0].Body.Kind).toBe('Unknown');
        expect(CodesOf(doc)).toContain('SQL_NOT_A_QUERY');
    });

    it('splits T-SQL statements that have no semicolon between them', () => {
        const doc = Parse('DECLARE @x INT = 1 SELECT @x AS x', SS);
        expect(doc.Statements.map(s => s.StatementKind)).toEqual(['Declare', 'Select']);
        expect(Parse('SELECT 1 AS a SELECT 2 AS b', SS).Statements).toHaveLength(2);
    });
});
