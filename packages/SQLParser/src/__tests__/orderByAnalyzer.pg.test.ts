/**
 * Whether an ORDER BY is legal inside a CTE depends on a TOP / LIMIT / OFFSET actually being
 * present. The PostgreSQL grammar returns an empty limit node for every SELECT, which must not
 * count as one.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { AnalyzeTopLevelOrderBy } from '../orderByAnalyzer.js';

const pg = new PostgreSQLDialect();

describe('IsOrderByLegalInCTE on PostgreSQL', () => {
    it('is false for a plain ORDER BY, so the clause can be stripped', () => {
        const analysis = AnalyzeTopLevelOrderBy('SELECT a FROM t ORDER BY a', pg);
        expect(analysis.IsLegalInCTE).toBe(false);
        expect(analysis.SqlWithoutOrderBy).toBe('SELECT a FROM t');
    });

    it('is true when the query has a LIMIT', () => {
        expect(AnalyzeTopLevelOrderBy('SELECT a FROM t ORDER BY a LIMIT 5', pg).IsLegalInCTE).toBe(true);
    });

    it('is true when the query has an OFFSET', () => {
        expect(AnalyzeTopLevelOrderBy('SELECT a FROM t ORDER BY a OFFSET 5', pg).IsLegalInCTE).toBe(true);
    });
});
