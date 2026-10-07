/**
 * node-sql-parser's T-SQL grammar accepts `WITH [name] AS (…) SELECT …` as a run of bare
 * `name = value` assignments. Every composed query has a bracket-quoted CTE name, so the parser
 * must treat that reading as a failed parse and fall back, not report a meaningless tree as valid.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import { AnalyzeTopLevelOrderBy } from '../orderByAnalyzer.js';

const ss = new SQLServerDialect();
const composed = `WITH [__cte_Dep_Param_z3svzn] AS (\nSELECT ID, Category FROM t WHERE Category = 'Gamma'\n)\nSELECT d.ID FROM [__cte_Dep_Param_z3svzn] d ORDER BY d.ID`;

describe('bracket-quoted CTE names on SQL Server', () => {
    it('finds the ORDER BY of a composed query', () => {
        const analysis = AnalyzeTopLevelOrderBy(composed, ss);
        expect(analysis.Positions).toHaveLength(1);
        expect(analysis.OrderByClause).toBe('d.ID');
    });

    it('reads the statement as a SELECT, not as variable assignments', () => {
        const parsed = new SQLParser(composed, ss);
        expect(parsed.IsValid).toBe(true);
        expect(parsed.StatementKind).toBe('select');
        expect(parsed.ToSQL()).toContain('[__cte_Dep_Param_z3svzn]');
    });

    it('does not hand back the assignment reading from the static parse', () => {
        const ast = SQLParser.ParseSQL(`WITH [x] AS (SELECT 1 AS a) SELECT a FROM [x]`, ss);
        const statements = ast == null ? [] : Array.isArray(ast) ? ast : [ast];
        for (const statement of statements) {
            expect((statement as unknown as { type?: unknown }).type).toBeTypeOf('string');
        }
    });

    it('still extracts the CTE definitions and the main statement', () => {
        const extraction = SQLParser.ExtractCTEs(composed, ss)!;
        expect(extraction.CTEDefinitions).toHaveLength(1);
        expect(extraction.MainStatement).toMatch(/^SELECT d\.ID FROM \[__cte_Dep_Param_z3svzn\] d ORDER BY d\.ID$/);
    });

    it('extracts table references, not the assignment variables', () => {
        const tables = SQLParser.ExtractTableRefs(`WITH [x] AS (SELECT a FROM dbo.Real) SELECT a FROM [x]`, ss).map(t => t.TableName);
        expect(tables).toContain('Real');
        expect(tables).not.toContain('WITH');
    });
});
