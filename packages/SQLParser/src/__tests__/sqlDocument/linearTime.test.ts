/**
 * SqlDocument on adversarial input: deep parentheses, deep nesting, thousands of set operations,
 * joins, CTEs and subqueries, and unclosed constructs. Each case doubles the input several times
 * and checks that parsing plus every analysis grows about linearly in CPU time and never throws.
 */
import { describe, it, expect } from 'vitest';
import { SqlDocument } from '../../sql/sqlDocument.js';
import { RenameCTE, WrapAsDerivedTable } from '../../edit/cteTransforms.js';
import { ExpectLinearTime, TIMING_OPTIONS } from '../queryLanguage/helpers.js';
import { PG, SS } from './helpers.js';

const SIZES = [1000, 2000, 4000, 8000];

function analyzeAll(sql: string, dialect = SS): () => void {
    return () => {
        const doc = SqlDocument.Parse(sql, dialect);
        doc.Scope(); doc.TableReferences(); doc.CTEs(); doc.OutputItems(); doc.TopLevelOrderBy(); doc.RowCaps();
        doc.IsReadOnly(); doc.ColumnReferences(); doc.WholeRowConstructs(); doc.DuplicateOutputNames();
    };
}

function repeat(count: number, make: (i: number) => string, separator: string): string {
    return Array.from({ length: count }, (_, i) => make(i)).join(separator);
}

describe('SqlDocument runs in linear time', () => {
    it('deep parentheses in an expression', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT ${'('.repeat(n)}1${')'.repeat(n)} AS x FROM t`));
    });

    it('a deeply parenthesized query, past the nesting limit', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`${'('.repeat(n)}SELECT a FROM t${')'.repeat(n)}`));
        const doc = SqlDocument.Parse(`${'('.repeat(5000)}SELECT a FROM t${')'.repeat(5000)}`, SS);
        expect(doc.Diagnostics.map(d => d.Code)).toContain('SQL_NESTING_TOO_DEEP');
    });

    it('deeply nested scalar subqueries', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT ${'(SELECT '.repeat(n)}1${' FROM t)'.repeat(n)} AS x`));
    });

    it('thousands of UNION ALL branches', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`${repeat(n, i => `SELECT a.x, b.y FROM t${i} a JOIN u b ON b.k = a.k`, ' UNION ALL ')} ORDER BY 1`));
    });

    it('thousands of joins with qualified columns', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT ${repeat(n, i => `t${i}.c`, ', ')} FROM t0 ${repeat(n, i => `JOIN t${i + 1} ON t${i + 1}.k = t${i}.k`, ' ')}`));
    });

    it('thousands of chained CTEs', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`WITH ${repeat(n, i => `c${i + 1} AS (SELECT x FROM c${i})`, ', ')} SELECT * FROM c${n}`, PG));
    });

    it('thousands of correlated subqueries in a select list', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT ${repeat(n, i => `(SELECT MAX(v) FROM s${i} WHERE s${i}.k = o.k) AS m${i}`, ', ')} FROM o`));
    });

    it('unclosed parentheses, strings and comments', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT ${'(a, '.repeat(n)}`));
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT a FROM t WHERE ${repeat(n, () => 'x IN (SELECT y FROM u WHERE', ' ')}`));
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT a FROM t WHERE b = '${'x'.repeat(n * 10)}`));
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT a FROM t /* ${'y '.repeat(n * 5)}`));
    });

    it('stray closing parentheses and junk between clauses', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => analyzeAll(`SELECT a FROM t ${')'.repeat(n)} WHERE ${'@ '.repeat(n)}`));
    });

    it('renaming a CTE referenced thousands of times', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => () => {
            const doc = SqlDocument.Parse(`WITH c AS (SELECT x FROM t) SELECT ${repeat(n, () => 'c.x', ', ')} FROM c ${repeat(n, i => `JOIN c c${i} ON c${i}.x = c.x`, ' ')}`, SS);
            RenameCTE(doc, SS, 'c', 'Renamed');
        });
    });

    it('wrapping a long set operation as a derived table', TIMING_OPTIONS, () => {
        ExpectLinearTime(SIZES, n => () => {
            const doc = SqlDocument.Parse(`${repeat(n, i => `SELECT a.x FROM t${i} a`, ' UNION ')} ORDER BY a.x`, SS);
            WrapAsDerivedTable(doc, SS, 'w');
        });
    });
});
