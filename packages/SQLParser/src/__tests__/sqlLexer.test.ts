import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { LexSQL } from '../sqlLexer.js';

/** The non-whitespace tokens of `sql`, as `kind:text`. */
const tokensOf = (sql: string, dialect: SQLParserDialect) =>
    LexSQL(sql, dialect).filter(t => t.Kind !== 'whitespace').map(t => `${t.Kind}:${t.Text}`);

describe('LexSQL line comments', () => {
    it.each([
        ['SQL Server', new SQLServerDialect()],
        ['PostgreSQL', new PostgreSQLDialect()],
    ])('ends a -- comment at a CR, an LF or a CRLF on %s', (_name, dialect) => {
        for (const lineEnd of ['\r', '\n', '\r\n']) {
            expect(tokensOf(`a -- note${lineEnd}b`, dialect)).toEqual(['word:a', 'comment:-- note', 'word:b']);
        }
    });

    it('does not end a -- comment at other line separators, which neither engine treats as line ends', () => {
        for (const separator of [' ', ' ', '\u0085', '\v', '\f']) {
            expect(tokensOf(`a -- note${separator}b`, new SQLServerDialect())).toEqual(['word:a', `comment:-- note${separator}b`]);
        }
    });
});
