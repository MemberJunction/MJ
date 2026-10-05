/**
 * The lexer and the paging-shape analysis follow what a dialect declares, not which platform it
 * is: identifier quoting, `E'…'` strings, dollar-quoted strings and the query-hint keyword. A
 * dialect object for a platform MJ does not ship (MySQL-like here) gets the right behaviour from
 * its declarations alone.
 */
import { describe, it, expect } from 'vitest';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { LexSQL, SignificantTokens } from '../sqlLexer';
import { AnalyzePagingShape } from '../pagingShape';
import { SQLParser } from '../sql-parser';

const mysqlLike: SQLParserDialect = {
    ParserDialect: 'MySQL',
    QuoteIdentifier: (name: string) => `\`${name}\``,
    AllowsOrderByInCTE: true,
    DefaultPagingOrderBy: '1',
    SupportsEscapeStringLiterals: false,
    SupportsDollarQuotedStrings: false,
    QueryHintKeyword: null,
    CallerSQLForbiddenFunctions: []
};

function kinds(sql: string, dialect: SQLParserDialect): string[] {
    return SignificantTokens(LexSQL(sql, dialect)).map(t => `${t.Kind}:${t.Text}`);
}

describe('the lexer follows the dialect', () => {
    it('reads backtick identifiers when the dialect quotes with backticks', () => {
        expect(kinds('SELECT `a b` FROM t', mysqlLike)).toContain('identifier:`a b`');
        expect(kinds('SELECT [a b] FROM t', mysqlLike)).not.toContain('identifier:[a b]');
    });

    it("reads E'…' and $$…$$ as strings only when the dialect declares them", () => {
        const sql = "SELECT E'a\\'b', $$x -- y$$";
        expect(kinds(sql, new PostgreSQLDialect())).toEqual(['word:SELECT', "string:E'a\\'b'", 'comma:,', 'string:$$x -- y$$']);
        expect(kinds(sql, mysqlLike)).not.toContain('string:$$x -- y$$');
    });
});

describe('query hints follow QueryHintKeyword', () => {
    const hinted = 'SELECT a FROM t ORDER BY a OPTION (MAXDOP 1)';

    it('a dialect with a hint keyword keeps the clause last', () => {
        const shape = AnalyzePagingShape(hinted, new SQLServerDialect());
        expect(hinted.substring(shape.TailStart)).toBe('OPTION (MAXDOP 1)');
        expect(SQLParser.HasUnwrappableTrailingClause(hinted, new SQLServerDialect())).toBe(true);
    });

    it('a dialect without one treats the same words as ordinary text', () => {
        for (const dialect of [new PostgreSQLDialect(), mysqlLike]) {
            expect(AnalyzePagingShape(hinted, dialect).TailStart).toBe(hinted.length);
            expect(SQLParser.HasUnwrappableTrailingClause(hinted, dialect)).toBe(false);
        }
    });

    it('only a top-level hint clause counts', () => {
        const nested = 'SELECT a FROM (SELECT a FROM t OPTION (MAXDOP 1)) x';
        expect(AnalyzePagingShape(nested, new SQLServerDialect()).TailStart).toBe(nested.length);
    });
});
