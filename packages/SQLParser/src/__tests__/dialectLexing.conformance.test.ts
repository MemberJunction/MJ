/**
 * Lexing conformance: LexSQL reads each registered dialect's text by that dialect's lexical facet.
 * Each case lists the expected kinds of the non-whitespace tokens, per dialect key. `$` and `#`
 * are word characters (T-SQL temp tables, PostgreSQL names), so where a dialect has no rule for
 * them they lex as part of a word.
 */
import { describe, it, expect } from 'vitest';
import { GetQueryDialect, RegisteredDialectKeys } from '@memberjunction/sql-dialect';
import { LexSQL } from '../sqlLexer.js';

type Kinds = string;

interface LexCase {
    Name: string;
    SQL: string;
    /** Expected kinds (whitespace dropped), space-separated, per dialect key; `*` is the default. */
    Expect: Record<string, Kinds>;
}

const CASES: LexCase[] = [
    {
        Name: 'dash-dash immediately followed by a digit',
        SQL: 'SELECT 1--1',
        Expect: { '*': 'word number comment', mysql: 'word number operator operator number' },
    },
    {
        Name: 'dash-dash followed by a space',
        SQL: 'SELECT 1 -- x',
        Expect: { '*': 'word number comment' },
    },
    {
        Name: 'hash',
        SQL: 'SELECT a # c',
        Expect: { '*': 'word word word word', mysql: 'word word comment' },
    },
    {
        Name: 'double slash',
        SQL: 'SELECT a // c',
        Expect: { '*': 'word word operator operator word', snowflake: 'word word comment' },
    },
    {
        Name: 'nested block comment',
        SQL: 'SELECT /* a /* b */ c */ 1',
        Expect: {
            '*': 'word comment number',
            mysql: 'word comment word operator operator number',
            oracle: 'word comment word operator operator number',
            snowflake: 'word comment word operator operator number',
        },
    },
    {
        Name: 'backslash-escaped quote',
        SQL: "SELECT 'a\\'b' x",
        Expect: { '*': 'word string word string', mysql: 'word string word', snowflake: 'word string word', databricks: 'word string word' },
    },
    {
        Name: 'double-quoted text',
        SQL: 'SELECT "a;b"',
        Expect: { '*': 'word identifier', mysql: 'word string', databricks: 'word string' },
    },
    {
        Name: 'backticks',
        SQL: 'SELECT `a;b`',
        Expect: { '*': 'word operator word semicolon word operator', mysql: 'word identifier', databricks: 'word identifier' },
    },
    {
        Name: 'brackets',
        SQL: 'SELECT [a;b]',
        Expect: { '*': 'word operator word semicolon word operator', sqlserver: 'word identifier' },
    },
    {
        Name: 'dollar quoting with a tag',
        SQL: 'SELECT $t$a;b$t$',
        Expect: { '*': 'word operator word semicolon word', postgresql: 'word string' },
    },
    {
        Name: 'dollar quoting without a tag',
        SQL: 'SELECT $$a;b$$',
        Expect: { '*': 'word operator operator word semicolon word', postgresql: 'word string', snowflake: 'word string' },
    },
    {
        Name: 'Oracle alternative quoting',
        SQL: "SELECT q'[it's;]' x",
        Expect: { '*': 'word word string word semicolon operator string', oracle: 'word string word' },
    },
    {
        Name: 'Databricks raw string',
        SQL: "SELECT r'a\\' x",
        Expect: { '*': 'word word string word', mysql: 'word word string', snowflake: 'word word string', databricks: 'word string word' },
    },
    {
        Name: 'doubled quote inside a string',
        SQL: "SELECT 'a''b'",
        Expect: { '*': 'word string', databricks: 'word string string' },
    },
];

function kinds(sql: string, key: string): Kinds {
    return LexSQL(sql, GetQueryDialect(key))
        .filter(t => t.Kind !== 'whitespace')
        .map(t => t.Kind)
        .join(' ');
}

describe.each(RegisteredDialectKeys())('LexSQL under the %s lexical facet', key => {
    it.each(CASES)('$Name', c => {
        expect(kinds(c.SQL, key)).toBe(c.Expect[key] ?? c.Expect['*']);
    });

    it('reproduces the input when the tokens are joined', () => {
        for (const c of CASES) expect(LexSQL(c.SQL, GetQueryDialect(key)).map(t => t.Text).join('')).toBe(c.SQL);
    });
});
