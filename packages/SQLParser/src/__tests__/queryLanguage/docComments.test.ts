/**
 * QueryTemplate.DocComments: `{# @param / @field #}` headers (recommended) and trailing `--:`
 * comments on select-list lines (secondary).
 */
import { describe, it, expect } from 'vitest';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { Codes, Dialect, PG, SS } from './helpers.js';

function docs(sql: string, dialect = SS) {
    return QueryTemplate.Parse(sql, dialect).DocComments();
}

function fields(sql: string, dialect = SS): string[] {
    return docs(sql, dialect).Value.Fields.map(f => `${f.Name}: ${f.Description}`);
}

describe('QueryTemplate.DocComments: headers', () => {
    const HEADER = `{#
  Orders placed since a date.
  @param Since The first day to include
  @param {string} Region - Sales region code,
         two letters
  @field ID The order
  @field "Order Total" The total in USD
  @field [Placed At] When it was placed
#}
SELECT ID, Total AS [Order Total], CreatedAt AS [Placed At] FROM dbo.Orders
WHERE CreatedAt >= {{ Since | sqlDate }} {% if Region %}AND Region = {{ Region | sqlString }}{% endif %}`;

    it('reads the summary, @param and @field lines', () => {
        const result = docs(HEADER);
        expect(result.Diagnostics).toHaveLength(0);
        expect(result.Value.Summary).toBe('Orders placed since a date.');
        expect(result.Value.Parameters.map(p => [p.Name, p.Description, p.DeclaredType, p.Source])).toEqual([
            ['Since', 'The first day to include', null, 'Header'],
            ['Region', 'Sales region code,\ntwo letters', 'string', 'Header'],
        ]);
        expect(result.Value.Fields.map(f => [f.Name, f.Description])).toEqual([
            ['ID', 'The order'], ['Order Total', 'The total in USD'], ['Placed At', 'When it was placed'],
        ]);
    });

    it('gives the span of each name', () => {
        const entry = docs(HEADER).Value.Fields[1];
        expect(HEADER.substring(entry.NameSpan.Start, entry.NameSpan.End)).toBe('Order Total');
        const param = docs(HEADER).Value.Parameters[0];
        expect(HEADER.substring(param.NameSpan.Start, param.NameSpan.End)).toBe('Since');
    });

    it('reads a header on MySQL, where # also starts a line comment, and keeps the SQL after it', () => {
        const template = QueryTemplate.Parse('{# @param x The x\n   @field N The count #} SELECT COUNT(*) AS N FROM t WHERE a > {{ x | sqlNumber }}', Dialect('mysql'));
        const result = template.DocComments();
        expect(result.Value.Parameters.map(p => [p.Name, p.Description])).toEqual([['x', 'The x']]);
        expect(result.Value.Fields.map(f => f.Name)).toEqual(['N']);
        expect(template.Parameters().Value.map(p => p.Name)).toEqual(['x']);
        expect(template.Tokens.Tokens.some(t => t.Text === 'SELECT' && t.Kind === 'Word')).toBe(true);
        expect(template.Diagnostics).toHaveLength(0);
    });

    it('accepts JSDoc-style leading stars', () => {
        expect(docs('{#\n * @param x The x\n #}SELECT {{ x | sqlNumber }}').Value.Parameters.map(p => p.Description)).toEqual(['The x']);
    });

    it('ignores a comment with no tags', () => {
        const result = docs('{# just a note #}SELECT 1');
        expect(result.Value).toEqual({ Summary: null, Parameters: [], Fields: [] });
        expect(result.Diagnostics).toHaveLength(0);
    });

    it('reports an unknown tag, a missing name, a duplicate and an unknown parameter', () => {
        const result = docs('{# @returns rows\n@param\n@field A one\n@field A two\n@param Nope x #}SELECT 1 AS A');
        expect(Codes(result.Diagnostics)).toEqual(['MJQ_DOC_UNKNOWN_TAG', 'MJQ_DOC_MISSING_NAME', 'MJQ_DOC_DUPLICATE', 'MJQ_DOC_UNKNOWN_PARAMETER']);
        expect(result.Value.Fields.map(f => f.Description)).toEqual(['one']);
    });
});

describe('QueryTemplate.DocComments: trailing --: comments', () => {
    it('attaches to the alias, the column name, or a T-SQL Name = expr alias', () => {
        const sql = `SELECT
    o.ID,                  --: The order
    o.Total AS Amount,     --: Total in USD
    COUNT(*) N,            --: Line count
    Label = o.Code,        --: A label
    [Due Date]             --: When it is due
FROM dbo.Orders o`;
        expect(fields(sql)).toEqual(['ID: The order', 'Amount: Total in USD', 'N: Line count', 'Label: A label', 'Due Date: When it is due']);
        expect(docs(sql).Diagnostics).toHaveLength(0);
    });

    it('attaches to the last item without a comma, and across a multi-line item', () => {
        const sql = 'SELECT a,\n  CASE WHEN x > 1 THEN 1\n       ELSE 0 END AS Flag --: Set when x > 1\nFROM t';
        expect(fields(sql)).toEqual(['Flag: Set when x > 1']);
    });

    it('skips DISTINCT and TOP', () => {
        expect(fields('SELECT DISTINCT TOP (10) Name --: The name\nFROM t')).toEqual(['Name: The name']);
    });

    it('reads PostgreSQL quoted aliases', () => {
        expect(fields('SELECT "Total" AS "Order Total" --: The total\nFROM t', PG)).toEqual(['Order Total: The total']);
    });

    it.each([
        ['on its own line', 'SELECT a,\n--: floating\nb FROM t'],
        ['after an item with no name', 'SELECT CASE WHEN a THEN 1 END --: no alias\nFROM t'],
        ['after a star', 'SELECT t.* --: everything\nFROM t'],
        ['inside a CTE', 'WITH c AS (SELECT a --: inner\nFROM t) SELECT a FROM c'],
        ['in a later UNION branch', 'SELECT a FROM t UNION SELECT b --: second\nFROM u'],
        ['outside the select list', 'SELECT a FROM t --: the table\nWHERE 1=1'],
    ])('reports a --: comment %s as ambiguous and ignores it', (_name, sql) => {
        const result = docs(sql);
        expect(result.Value.Fields).toHaveLength(0);
        expect(Codes(result.Diagnostics)).toEqual(['MJQ_DOC_TRAILING_AMBIGUOUS']);
    });

    it('ignores plain -- comments', () => {
        expect(docs('SELECT a -- not a description\nFROM t').Value.Fields).toHaveLength(0);
    });

    it('lets a header description win over a trailing one, and reports the duplicate', () => {
        const result = docs('{# @field a From the header #}SELECT a --: From the line\nFROM t');
        expect(result.Value.Fields.map(f => [f.Description, f.Source])).toEqual([['From the header', 'Header']]);
        expect(Codes(result.Diagnostics)).toEqual(['MJQ_DOC_DUPLICATE']);
    });
});
