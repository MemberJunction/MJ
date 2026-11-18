/**
 * The SqlDocument analyses on SQL Server and PostgreSQL: table references, CTEs, output items,
 * top-level ORDER BY, row caps, the read-only check, statement kinds, column references,
 * whole-row constructs and duplicate output names.
 */
import { describe, it, expect } from 'vitest';
import type { SqlDocument } from '../../sql/sqlDocument.js';
import { Dotted, PG, PLATFORMS, Parse, ParseClean, SS } from './helpers.js';

function tables(doc: SqlDocument): string[] {
    return doc.TableReferences().Value.map(t => `${t.Kind}:${Dotted(t.Name)}:${t.Schema ?? '-'}`);
}

function readOnly(sql: string, dialect = SS): string | null {
    const check = Parse(sql, dialect).IsReadOnly().Value;
    return check.IsReadOnly ? null : check.Reason;
}

describe.each(PLATFORMS)('TableReferences (%s)', (_name, dialect) => {
    it('lists every source read anywhere: joins, derived tables, CTE bodies and WHERE subqueries', () => {
        const sql = 'WITH c AS (SELECT k FROM s.base) SELECT 1 FROM c JOIN s.t1 a ON a.k = c.k, (SELECT k FROM t2) d WHERE EXISTS (SELECT 1 FROM t3 WHERE t3.k = a.k)';
        expect(tables(ParseClean(sql, dialect))).toEqual(['Table:s.base:s', 'CTE:c:-', 'Table:s.t1:s', 'Table:t2:-', 'Table:t3:-']);
    });

    it('reports a schema only when one is written, and keeps every part with its span', () => {
        const doc = ParseClean('SELECT 1 FROM db1.s.t, t', dialect);
        const [qualified, bare] = doc.TableReferences().Value;
        expect([qualified.Schema, bare.Schema]).toEqual(['s', null]);
        expect(qualified.Name.Parts.map(p => doc.Text(p))).toEqual(['db1', 's', 't']);
    });

    it('lists a table-valued function as a function', () => {
        expect(tables(ParseClean('SELECT 1 FROM s.fn(1) f JOIN t ON 1 = 1', dialect))).toEqual(['Function:s.fn:s', 'Table:t:-']);
    });

    it('is incomplete when part of the text could not be read', () => {
        expect(Parse('SELECT 1 FROM t WHERE (', dialect).TableReferences().Complete).toBe(false);
        expect(ParseClean('SELECT 1 FROM t', dialect).TableReferences().Complete).toBe(true);
    });
});

describe('TableReferences, dialect forms', () => {
    it('unquotes bracketed and quoted names', () => {
        expect(tables(ParseClean('SELECT 1 FROM [dbo].[Order Details] od', SS))).toEqual(['Table:dbo.Order Details:dbo']);
        expect(tables(ParseClean('SELECT 1 FROM "public"."Order ""X"""', PG))).toEqual(['Table:public.Order "X":public']);
    });

    it('reads a source on either side of an APPLY and inside a PIVOT', () => {
        expect(tables(ParseClean('SELECT 1 FROM (SELECT a FROM s.src) x PIVOT (SUM(a) FOR b IN ([1])) p CROSS APPLY s.f(p.a) z', SS))).toEqual(['Table:s.src:s', 'Function:s.f:s']);
    });
});

describe.each(PLATFORMS)('CTEs and OutputItems (%s)', (_name, dialect) => {
    it('lists CTEs, leading and nested', () => {
        const doc = ParseClean('WITH a AS (SELECT 1 AS x), b AS (SELECT x FROM a) SELECT x FROM b', dialect);
        expect(doc.CTEs().Value.map(c => [c.Name.Value, c.Leading, c.StatementIndex])).toEqual([['a', true, 0], ['b', true, 0]]);
    });

    it('lists output items with their names, aliases, spans and stars', () => {
        const doc = ParseClean('SELECT t.*, a.x, a.y AS z, a.x + 1, COUNT(*) AS n FROM t a', dialect);
        expect(doc.OutputItems().Value.Items.map(i => [i.Name, i.Alias?.Value ?? null, doc.Text(i.ExpressionSpan), i.IsStar])).toEqual([
            [null, null, 't.*', true], ['x', null, 'a.x', false], ['z', 'z', 'a.y', false], [null, null, 'a.x + 1', false], ['n', 'n', 'COUNT(*)', false],
        ]);
    });

    it('gives a set operation the first branch\'s items and every branch', () => {
        const value = ParseClean('SELECT a AS x FROM r UNION SELECT b FROM s UNION SELECT c FROM t', dialect).OutputItems().Value;
        expect([value.IsSetOperation, value.Items.map(i => i.Name), value.Branches.map(b => b.map(i => i.Name))]).toEqual([true, ['x'], [['x'], ['b'], ['c']]]);
    });

    it('finds duplicate output names, ignoring case by default', () => {
        const doc = ParseClean('SELECT a.ID, b.id, a.Name AS Label, b.Label FROM a JOIN b ON b.k = a.k', dialect);
        expect(doc.DuplicateOutputNames().Value.map(d => [d.Name, d.Items.length])).toEqual([['ID', 2], ['Label', 2]]);
        expect(doc.DuplicateOutputNames({ CaseSensitive: true }).Value.map(d => d.Name)).toEqual(['Label']);
    });

    it('is incomplete about duplicates when the output has a star', () => {
        expect(ParseClean('SELECT *, a FROM t', dialect).DuplicateOutputNames().Complete).toBe(false);
    });
});

describe('DuplicateOutputNames, case folding', () => {
    it('keeps PostgreSQL quoted names apart and folds unquoted ones', () => {
        expect(ParseClean('SELECT a AS "Name", b AS "name", c AS name FROM t', PG).DuplicateOutputNames().Value.map(d => d.Items.length)).toEqual([2]);
    });
});

describe.each(PLATFORMS)('TopLevelOrderBy and RowCaps (%s)', (_name, dialect) => {
    it('finds the top-level ORDER BY with its exact span, not one inside a subquery or window', () => {
        const doc = ParseClean('SELECT ROW_NUMBER() OVER (ORDER BY a) AS r, (SELECT MAX(b) FROM u) AS m FROM t ORDER BY r', dialect);
        expect(doc.Text(doc.TopLevelOrderBy().Value?.Span ?? { Start: 0, End: 0 })).toBe('ORDER BY r');
    });

    it('has no top-level ORDER BY when only a CTE or derived table has one', () => {
        expect(ParseClean('SELECT a FROM (SELECT a FROM t ORDER BY a OFFSET 0 ROWS) d', dialect).TopLevelOrderBy().Value).toBeNull();
    });

    it('reads OFFSET … FETCH caps as numbers', () => {
        const caps = ParseClean('SELECT a FROM t ORDER BY a OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY', dialect).RowCaps().Value;
        expect(caps.map(c => [c.Form, c.Rows, c.Skip, c.Numeric])).toEqual([['Offset', null, 10, true], ['Fetch', 5, null, true]]);
    });
});

describe('RowCaps, dialect forms', () => {
    it('reads TOP, with PERCENT and WITH TIES as not numeric', () => {
        expect(ParseClean('SELECT TOP 5 a FROM t', SS).RowCaps().Value.map(c => [c.Form, c.Rows, c.Numeric])).toEqual([['Top', 5, true]]);
        expect(ParseClean('SELECT TOP 5 PERCENT a FROM t', SS).RowCaps().Value.map(c => [c.Rows, c.Numeric, c.Percent])).toEqual([[5, false, true]]);
        expect(ParseClean('SELECT TOP (@n) a FROM t', SS).RowCaps().Value.map(c => [c.Rows, c.Numeric])).toEqual([[null, false]]);
    });

    it('reads LIMIT, LIMIT ALL and a parameter LIMIT', () => {
        expect(ParseClean('SELECT a FROM t LIMIT 3', PG).RowCaps().Value.map(c => [c.Form, c.Rows, c.Numeric])).toEqual([['Limit', 3, true]]);
        expect(ParseClean('SELECT a FROM t LIMIT ALL', PG).RowCaps().Value.map(c => [c.Rows, c.Numeric])).toEqual([[null, true]]);
        expect(ParseClean('SELECT a FROM t LIMIT $1', PG).RowCaps().Value.map(c => c.Numeric)).toEqual([false]);
    });
});

describe('IsReadOnly, StatementKinds and HasStackedStatements', () => {
    it('accepts one read query', () => {
        for (const [, dialect] of PLATFORMS) {
            expect(readOnly('SELECT a FROM t', dialect)).toBeNull();
            expect(readOnly('WITH c AS (SELECT 1 AS a) SELECT a FROM c;', dialect)).toBeNull();
            expect(readOnly('(SELECT a FROM t) UNION (SELECT b FROM u)', dialect)).toBeNull();
        }
    });

    it('refuses writes, SELECT … INTO, row locks and stacked statements, with the reason', () => {
        expect(readOnly('UPDATE t SET a = TRY_CAST(b AS INT)')).toMatch(/UPDATE statement/);
        expect(readOnly('MERGE t USING s ON t.k = s.k WHEN MATCHED THEN DELETE;')).toMatch(/MERGE/);
        expect(readOnly('SELECT a INTO newtable FROM t')).toMatch(/SELECT … INTO/);
        expect(readOnly('EXEC dbo.sp')).toMatch(/EXECUTE/);
        expect(readOnly('SELECT 1; SELECT 2')).toMatch(/more than one statement/);
        expect(readOnly('WITH d AS (DELETE FROM s RETURNING id) SELECT id FROM d', PG)).toMatch(/DELETE inside/);
        expect(readOnly('SELECT a FROM t FOR UPDATE', PG)).toMatch(/locks/);
        expect(readOnly('WITH c AS (SELECT 1 AS a) DELETE FROM c')).toMatch(/DELETE statement/);
    });

    it('fails closed when the text cannot be read', () => {
        expect(readOnly('SELECT (a FROM t')).toMatch(/could not be read/);
        expect(readOnly('')).toMatch(/empty/);
        expect(readOnly('SELECT {{ x }}')).toMatch(/could not be read/);
    });

    it('lists statement kinds and stacked statements', () => {
        const doc = Parse('SET NOCOUNT ON; SELECT 1; INSERT INTO t VALUES (1)', SS);
        expect(doc.StatementKinds().Value).toEqual(['Set', 'Select', 'Insert']);
        expect(doc.HasStackedStatements().Value).toBe(true);
        expect(Parse('SELECT 1;', SS).HasStackedStatements().Value).toBe(false);
    });
});

describe.each(PLATFORMS)('ColumnReferences (%s)', (_name, dialect) => {
    it('tags each reference with its clause', () => {
        const sql = 'SELECT a.x FROM a JOIN b ON b.k = a.k WHERE a.y = 1 GROUP BY a.x HAVING MAX(b.z) > 1 ORDER BY a.x';
        expect(ParseClean(sql, dialect).ColumnReferences().Value.map(c => `${c.Clause}:${c.Path.map(p => p.Value).join('.')}`)).toEqual([
            'Select:a.x', 'Join:b.k', 'Join:a.k', 'Where:a.y', 'GroupBy:a.x', 'Having:b.z', 'OrderBy:a.x',
        ]);
    });

    it('marks an ORDER BY name that is an output alias', () => {
        const refs = ParseClean('SELECT a.x AS total FROM a ORDER BY total', dialect).ColumnReferences().Value;
        expect(refs.map(r => [r.Column.Value, r.RefersToOutputAlias, r.Binding?.Source.Name ?? null])).toEqual([['x', false, 'a'], ['total', true, null]]);
    });

    it('includes JOIN … USING names and excludes CTE column lists and hints', () => {
        const refs = ParseClean('WITH c (k, v) AS (SELECT 1, 2) SELECT v FROM c JOIN d USING (k)', dialect).ColumnReferences().Value;
        expect(refs.map(r => `${r.Clause}:${r.Column.Value}`)).toEqual(['Select:v', 'Join:k']);
    });
});

describe('ColumnReferences, dialect forms', () => {
    it('excludes OPTION hints and reads the column of a method call on a column', () => {
        const refs = ParseClean("SELECT a.Payload.value('(/x)[1]', 'int') AS v FROM t a OPTION (MAXRECURSION 10)", SS).ColumnReferences().Value;
        expect(refs.map(r => r.Path.map(p => p.Value).join('.'))).toEqual(['a.Payload']);
    });
});

describe.each(PLATFORMS)('WholeRowConstructs (%s)', (_name, dialect) => {
    it('finds stars with their clause and binding, but not COUNT(*)', () => {
        const constructs = ParseClean('SELECT a.*, COUNT(*) AS n FROM t a WHERE EXISTS (SELECT * FROM u) GROUP BY a.k', dialect).WholeRowConstructs().Value;
        expect(constructs.map(w => [w.Kind, w.Clause, w.Binding?.Source.Name ?? null])).toEqual([['QualifiedStar', 'Select', 'a'], ['Star', 'Select', null]]);
    });

    it('finds set operations, NATURAL JOIN and ordinal ORDER BY with paging', () => {
        const constructs = ParseClean('SELECT a FROM r NATURAL JOIN s UNION SELECT b FROM t ORDER BY 1 OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY', dialect).WholeRowConstructs().Value;
        expect(constructs.map(w => [w.Kind, w.Detail, w.Paged])).toEqual([['NaturalJoin', 'NATURAL JOIN', false], ['SetOperation', 'UNION', false], ['OrdinalOrderBy', 'ORDER BY 1', true]]);
    });
});

describe('WholeRowConstructs, dialect forms', () => {
    it('finds FOR JSON / FOR XML on SQL Server', () => {
        expect(ParseClean('SELECT a FROM t FOR JSON PATH', SS).WholeRowConstructs().Value.map(w => w.Detail)).toEqual(['FOR JSON']);
    });

    it('finds row_to_json and a source name used as a value on PostgreSQL', () => {
        const constructs = ParseClean('SELECT row_to_json(x), x, x.id FROM t x', PG).WholeRowConstructs().Value;
        expect(constructs.map(w => [w.Kind, w.Binding?.Source.Name ?? null])).toEqual([['RowFunction', 'x'], ['RowReference', 'x']]);
    });

    it('does not read a column named like its table as the row on SQL Server', () => {
        expect(ParseClean('SELECT Region FROM dbo.Region', SS).WholeRowConstructs().Value).toEqual([]);
    });
});
