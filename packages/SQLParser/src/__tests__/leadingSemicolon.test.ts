/**
 * T-SQL code often writes `;WITH` so a CTE can follow another statement. A semicolon before any
 * statement content separates nothing: the query is still one statement.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import { IsReadOnlyQuery, SplitLeadingCTEs } from '../sqlShape.js';
import { AnalyzePagingShape } from '../pagingShape.js';

const ss = new SQLServerDialect();
const sql = ';WITH c AS (SELECT 1 AS a) SELECT a FROM c ORDER BY a';

describe('a leading semicolon', () => {
    it('is not a stacked statement', () => {
        expect(SQLParser.HasStackedStatements(sql, ss)).toBe(false);
        expect(SQLParser.HasStackedStatements('  ;; /* c */ ; SELECT 1', ss)).toBe(false);
    });

    it('still counts when content precedes it', () => {
        expect(SQLParser.HasStackedStatements('SELECT 1; SELECT 2', ss)).toBe(true);
    });

    it('does not hide the WITH clause', () => {
        const split = SplitLeadingCTEs(sql, ss)!;
        expect(split.Definitions.map(d => d.Name)).toEqual(['c']);
        expect(split.Main).toBe('SELECT a FROM c ORDER BY a');
        expect(AnalyzePagingShape(sql, ss).CTEs).not.toBeNull();
    });

    it('is a read query', () => {
        expect(IsReadOnlyQuery(sql, ss).IsReadOnly).toBe(true);
    });
});
