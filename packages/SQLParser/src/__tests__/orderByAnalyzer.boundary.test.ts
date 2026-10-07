/**
 * Template rendering can leave no space between a literal or quoted identifier and the ORDER BY
 * that follows it (`… = '2024-01-01'ORDER BY …`). The top-level ORDER BY must still be found, so
 * paging does not add a second one and composition strips it from a CTE body.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { AnalyzeTopLevelOrderBy } from '../orderByAnalyzer.js';

const ss = new SQLServerDialect();

describe('ORDER BY with no space before it', () => {
    const cases: Array<[string, string]> = [
        ['after a string literal', "SELECT a FROM t WHERE d >= '2024-01-01'ORDER BY a"],
        ['after a bracket identifier', 'SELECT a FROM [t]ORDER BY a'],
        ['after a double-quoted identifier', 'SELECT a FROM "t"ORDER BY a']
    ];
    for (const [label, sql] of cases) {
        it(`is found ${label}`, () => {
            const analysis = AnalyzeTopLevelOrderBy(sql, ss);
            expect(analysis.Positions).toHaveLength(1);
            expect(analysis.OrderByClause).toBe('a');
            expect(analysis.SqlWithoutOrderBy).not.toMatch(/ORDER\s+BY/i);
        });
    }

    it('is still not found inside an identifier such as XORDER BY', () => {
        expect(AnalyzeTopLevelOrderBy('SELECT a AS XORDER FROM t', ss).Positions).toHaveLength(0);
    });
});

describe('quoted identifiers with doubled closing characters', () => {
    it('does not find an ORDER BY inside a bracket identifier containing ]]', () => {
        const analysis = AnalyzeTopLevelOrderBy('SELECT a AS [x]] ORDER BY y] FROM t ORDER BY a', ss);
        expect(analysis.Positions).toHaveLength(1);
        expect(analysis.OrderByClause).toBe('a');
    });

    it('does not find an ORDER BY inside a double-quoted identifier containing ""', () => {
        const analysis = AnalyzeTopLevelOrderBy('SELECT a AS "x"" ORDER BY y" FROM t ORDER BY a', ss);
        expect(analysis.Positions).toHaveLength(1);
        expect(analysis.OrderByClause).toBe('a');
    });
});
