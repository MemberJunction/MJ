/**
 * PG-a: a query that is not a set operation, capped as a derived table, must not leave an ORDER BY
 * without TOP (or OFFSET / FETCH) inside the derived table. SQL Server rejects that (Msg 1033: "The
 * ORDER BY clause is invalid in views, inline functions, derived tables, subqueries, and common
 * table expressions, unless TOP, OFFSET or FOR XML is also specified").
 *
 * The path: `ApplyMaxRows` on SQL Server, for a statement whose main query is parenthesized, so
 * the shape has no top-level SELECT to put `TOP` on (`SelectListStart === null`) and no cap of its
 * own. Such a statement with an ORDER BY is capped in place with `OFFSET 0 ROWS FETCH NEXT n ROWS
 * ONLY` after the ORDER BY, as a set operation is, rather than wrapped as a derived table.
 */
import { describe, it, expect } from 'vitest';
import { AnalyzePagingShape } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { QueryPagingEngine } from '../queryPagingEngine';

const tsql = new SQLServerDialect();

/** The body of the `_mj_capped` derived table, or null when the SQL was not capped that way. */
function cappedBody(sql: string): string | null {
    const match = sql.match(/FROM \(\n([\s\S]*)\n\) AS \[_mj_capped\]/);
    return match ? match[1] : null;
}

/** Whether `body` has a top-level ORDER BY and nothing (TOP, OFFSET, FETCH) that makes it legal in a derived table. */
function hasOrderByWithoutCap(body: string): boolean {
    const shape = AnalyzePagingShape(body, tsql);
    return shape.OrderBy !== null && shape.OwnCaps.length === 0;
}

const shapes: Array<{ Name: string; SQL: string }> = [
    { Name: 'a parenthesized SELECT with a trailing ORDER BY', SQL: '(SELECT a FROM t) ORDER BY a' },
    { Name: 'a CTE-headed parenthesized SELECT with a trailing ORDER BY', SQL: 'WITH c AS (SELECT a FROM t) (SELECT a FROM c) ORDER BY a' },
    { Name: 'a parenthesized set operation with a trailing ORDER BY', SQL: '(SELECT a FROM t UNION SELECT b FROM u) ORDER BY a' },
];

describe('PG-a — a non-set-operation capped as a derived table keeps no ORDER BY without TOP inside it', () => {
    it('the helper sees the illegal shape (setup works)', () => {
        expect(hasOrderByWithoutCap('(SELECT a FROM t) ORDER BY a')).toBe(true);
        expect(hasOrderByWithoutCap('SELECT TOP 50 PERCENT a FROM t ORDER BY a')).toBe(false);
        expect(hasOrderByWithoutCap('SELECT a FROM t ORDER BY a OFFSET 0 ROWS')).toBe(false);
    });

    for (const shape of shapes) {
        it(`${shape.Name}: the cap is applied in place, after the query's ORDER BY`, () => {
            const result = QueryPagingEngine.ApplyMaxRows(shape.SQL, 10, 'sqlserver');
            expect(result.Outcome.Method).toBe('fetch');
            expect(result.SQL).toBe(`${shape.SQL}\nOFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY`);
        });

        it(`${shape.Name}: the cap is applied and the query's ORDER BY survives`, () => {
            const result = QueryPagingEngine.ApplyMaxRows(shape.SQL, 10, 'sqlserver');
            expect(result.Outcome.Applied).toBe(true);
            expect(result.SQL).toMatch(/ORDER BY a/);
        });

        // Fixed (was pinned): an ordered statement with no top-level SELECT is capped with OFFSET 0 ROWS FETCH NEXT n ROWS ONLY
        // after its ORDER BY, not wrapped as a derived table (DISCUSSION §6, 2026-10-27; Topic 2a). PG-a.
        it(`${shape.Name}: no ORDER BY without TOP inside the derived table`, () => {
            const result = QueryPagingEngine.ApplyMaxRows(shape.SQL, 10, 'sqlserver');
            const body = cappedBody(result.SQL);
            expect(body === null || !hasOrderByWithoutCap(body)).toBe(true);
        });
    }
});
