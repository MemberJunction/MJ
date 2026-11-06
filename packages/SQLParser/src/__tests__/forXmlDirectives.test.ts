/**
 * The FOR XML fallback finds a trailing top-level FOR XML clause from tokens, so it takes time in
 * proportion to the SQL, and a FOR XML inside a subquery is left as written.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser';

const tsql = new SQLServerDialect();

describe('FOR XML fallback', () => {
    it('returns promptly on a long run of whitespace after FOR XML RAW,', () => {
        const sql = 'SELECT 1 FOR XML RAW,' + '\t'.repeat(60000) + ';x';
        const started = Date.now();
        SQLParser.ParseSQL(sql, tsql);
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('still parses FOR XML RAW with a quoted name and extra directives', () => {
        const ast = SQLParser.ParseSQL("SELECT Name FROM T FOR XML RAW('Row'), ROOT('Data')", tsql);
        expect(ast).not.toBeNull();
    });
});
