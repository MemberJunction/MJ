/**
 * A clause that cannot appear inside a derived table matters only at the top level of the
 * statement. The same words inside a subquery, a string or a comment do not stop a wrap.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';

const ss = new SQLServerDialect();
const has = (sql: string): boolean => SQLParser.HasUnwrappableTrailingClause(sql, ss);

describe('HasUnwrappableTrailingClause', () => {
    it('is true for a top-level FOR JSON / FOR XML / OPTION', () => {
        expect(has('SELECT a FROM t FOR JSON PATH')).toBe(true);
        expect(has('SELECT a FROM t FOR XML RAW')).toBe(true);
        expect(has('SELECT a FROM t OPTION (RECOMPILE)')).toBe(true);
    });

    it('is false when FOR JSON is inside a subquery', () => {
        expect(has('SELECT a, (SELECT b FROM u WHERE u.k = t.k FOR JSON PATH) AS j FROM t')).toBe(false);
        expect(has('SELECT a FROM t UNION ALL SELECT (SELECT b FROM u FOR JSON PATH) FROM v')).toBe(false);
    });

    it('is false when the words are in a comment', () => {
        expect(has('SELECT a FROM t -- FOR JSON PATH\n')).toBe(false);
        expect(has('SELECT a FROM t /* OPTION (RECOMPILE) */')).toBe(false);
    });
});
