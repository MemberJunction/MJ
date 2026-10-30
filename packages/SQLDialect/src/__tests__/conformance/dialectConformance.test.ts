/**
 * Dialect conformance: every dialect GetQueryDialect resolves (built in or registered by a third
 * party) must satisfy the same contract. The suite is parameterized over RegisteredDialectKeys(),
 * so a new dialect is checked without editing this file (it only needs a row in EXPECTED_FACTS).
 */
import { describe, it, expect } from 'vitest';
import {
    GetDialect,
    GetQueryDialect,
    IsSupportedPlatform,
    RegisteredDialectKeys,
    ShippedQueryOnlyDialectKeys,
    SupportedPlatforms,
} from '../../dialectFactory.js';
import { QueryDialect } from '../../queryDialect.js';
import { SQLDialect } from '../../sqlDialect.js';
import type { DialectLexicalRules } from '../../facets/dialectLexicalRules.js';
import type { RowCapForm } from '../../facets/dialectGrammar.js';
import { ReadQuotedIdentifier, ReadStringLiteral } from './referenceTokenizer.js';

/** The lexical and grammar facts each shipped dialect must declare. */
interface ExpectedFacts {
    IdentifierOpeners: string[];
    LineCommentOpeners: string[];
    NestedBlockComments: boolean;
    Dollar: DialectLexicalRules['DollarQuotedStrings'];
    AlternativeQuoting: boolean;
    CaseFolding: DialectLexicalRules['UnquotedIdentifierCase'];
    DoubleQuoteIsString: boolean;
    ParserGrammar: string | null;
    RowCapForms: RowCapForm[];
    RecursiveKeyword: string | null;
    QueryHintKeyword: string | null;
    HasDDL: boolean;
}

const EXPECTED_FACTS: Record<string, ExpectedFacts> = {
    sqlserver: {
        IdentifierOpeners: ['"', '['], LineCommentOpeners: ['--'], NestedBlockComments: true, Dollar: 'none',
        AlternativeQuoting: false, CaseFolding: 'none', DoubleQuoteIsString: false, ParserGrammar: 'TransactSQL',
        RowCapForms: ['top', 'offset-fetch'], RecursiveKeyword: null, QueryHintKeyword: 'OPTION', HasDDL: true,
    },
    postgresql: {
        IdentifierOpeners: ['"'], LineCommentOpeners: ['--'], NestedBlockComments: true, Dollar: 'tagged',
        AlternativeQuoting: false, CaseFolding: 'lower', DoubleQuoteIsString: false, ParserGrammar: 'PostgresQL',
        RowCapForms: ['limit-offset', 'offset-fetch'], RecursiveKeyword: 'RECURSIVE', QueryHintKeyword: null, HasDDL: true,
    },
    mysql: {
        IdentifierOpeners: ['`'], LineCommentOpeners: ['#', '--'], NestedBlockComments: false, Dollar: 'none',
        AlternativeQuoting: false, CaseFolding: 'none', DoubleQuoteIsString: true, ParserGrammar: 'MySQL',
        RowCapForms: ['limit-offset'], RecursiveKeyword: 'RECURSIVE', QueryHintKeyword: null, HasDDL: false,
    },
    oracle: {
        IdentifierOpeners: ['"'], LineCommentOpeners: ['--'], NestedBlockComments: false, Dollar: 'none',
        AlternativeQuoting: true, CaseFolding: 'upper', DoubleQuoteIsString: false, ParserGrammar: null,
        RowCapForms: ['offset-fetch'], RecursiveKeyword: null, QueryHintKeyword: null, HasDDL: false,
    },
    snowflake: {
        IdentifierOpeners: ['"'], LineCommentOpeners: ['--', '//'], NestedBlockComments: false, Dollar: 'untagged',
        AlternativeQuoting: false, CaseFolding: 'upper', DoubleQuoteIsString: false, ParserGrammar: 'Snowflake',
        RowCapForms: ['top', 'limit-offset', 'offset-fetch'], RecursiveKeyword: 'RECURSIVE', QueryHintKeyword: null, HasDDL: false,
    },
    databricks: {
        IdentifierOpeners: ['`'], LineCommentOpeners: ['--'], NestedBlockComments: true, Dollar: 'none',
        AlternativeQuoting: false, CaseFolding: 'none', DoubleQuoteIsString: true, ParserGrammar: 'Hive',
        RowCapForms: ['limit-offset'], RecursiveKeyword: 'RECURSIVE', QueryHintKeyword: null, HasDDL: false,
    },
};

/** Values chosen to stress literal quoting: quotes of both kinds, backslashes, comment and statement markers. */
const LITERAL_VALUES = [
    'plain',
    "it's",
    "two '' quotes",
    'back\\slash',
    "both \\' mixed",
    'trailing backslash \\',
    '"double"',
    'semi; colon -- not a comment /* nor this */ # nor this',
    '$$ dollars $tag$',
    'ünïcödé',
    '',
];

const IDENTIFIER_NAMES = ['Name', 'Order Date', 'a.b', 'semi;colon', 'ünï'];

const KEYS = RegisteredDialectKeys();

describe('dialect registry', () => {
    it('registers the six shipped dialects', () => {
        for (const key of Object.keys(EXPECTED_FACTS)) expect(KEYS).toContain(key);
        expect(ShippedQueryOnlyDialectKeys()).toEqual(['mysql', 'oracle', 'snowflake', 'databricks']);
    });

    it('serves full SQL dialects only for the platforms MJ runs on', () => {
        for (const platform of SupportedPlatforms()) expect(GetDialect(platform)).toBeInstanceOf(SQLDialect);
        for (const key of ShippedQueryOnlyDialectKeys()) {
            expect(IsSupportedPlatform(key)).toBe(false);
            expect(() => GetDialect(key)).toThrow(/No SQLDialect registered/);
        }
    });

    it('refuses an unknown key and a key in the wrong case', () => {
        expect(() => GetQueryDialect('no-such-dialect')).toThrow(/No QueryDialect registered/);
        expect(() => GetQueryDialect('MySQL')).toThrow(/No QueryDialect registered/);
        expect(() => GetDialect('SQLServer')).toThrow(/No SQLDialect registered/);
    });
});

describe.each(KEYS)('dialect conformance: %s', key => {
    const dialect = GetQueryDialect(key);
    const facts = EXPECTED_FACTS[key];

    it('declares the expected facts', () => {
        expect(facts).toBeDefined();
        expect(dialect).toBeInstanceOf(QueryDialect);
        expect(dialect.Key).toBe(key);
        expect(dialect.Lexical.IdentifierQuotes.map(f => f.Open)).toEqual(facts.IdentifierOpeners);
        expect(dialect.Lexical.LineComments.map(f => f.Opener)).toEqual(facts.LineCommentOpeners);
        expect(dialect.Lexical.BlockComments.Nested).toBe(facts.NestedBlockComments);
        expect(dialect.Lexical.DollarQuotedStrings).toBe(facts.Dollar);
        expect(dialect.Lexical.AlternativeQuotingPrefixes.length > 0).toBe(facts.AlternativeQuoting);
        expect(dialect.Lexical.UnquotedIdentifierCase).toBe(facts.CaseFolding);
        expect(dialect.Lexical.StringLiterals.some(f => f.Quote === '"')).toBe(facts.DoubleQuoteIsString);
        expect(dialect.Grammar.ParserGrammar).toBe(facts.ParserGrammar);
        expect([...dialect.Grammar.RowCapForms]).toEqual(facts.RowCapForms);
        expect(dialect.Grammar.RecursiveKeyword).toBe(facts.RecursiveKeyword);
        expect(dialect.Grammar.QueryHintKeyword).toBe(facts.QueryHintKeyword);
        expect(dialect instanceof SQLDialect).toBe(facts.HasDDL);
    });

    it('keeps its data facets frozen', () => {
        expect(Object.isFrozen(dialect.Lexical)).toBe(true);
        expect(Object.isFrozen(dialect.Lexical.IdentifierQuotes)).toBe(true);
        expect(Object.isFrozen(dialect.Lexical.StringLiterals)).toBe(true);
        expect(Object.isFrozen(dialect.Lexical.LineComments)).toBe(true);
        expect(Object.isFrozen(dialect.Lexical.BlockComments)).toBe(true);
        expect(Object.isFrozen(dialect.Grammar)).toBe(true);
        expect(Object.isFrozen(dialect.Grammar.WriteStatementKeywords)).toBe(true);
        expect(Object.isFrozen(dialect.Writer)).toBe(true);
        if (dialect.Types) expect(Object.isFrozen(dialect.Types)).toBe(true);
    });

    it.each(LITERAL_VALUES)('quotes the string %j so the dialect reads it back exactly', value => {
        const literal = dialect.Writer.StringLiteralPrefix(value) + dialect.Writer.QuoteStringLiteral(value);
        const read = ReadStringLiteral(literal, dialect.Lexical);
        expect(read).not.toBeNull();
        expect(read?.Value).toBe(value);
        expect(read?.End).toBe(literal.length);
    });

    it.each(IDENTIFIER_NAMES)('quotes the identifier %j so the dialect reads it back exactly', name => {
        const quoted = dialect.Writer.QuoteIdentifier(name);
        const read = ReadQuotedIdentifier(quoted, dialect.Lexical);
        expect(read?.Value).toBe(name);
        expect(read?.End).toBe(quoted.length);
    });

    it('round-trips an identifier containing its own closing quote when the dialect escapes it', () => {
        const form = dialect.Lexical.IdentifierQuotes.find(f => dialect.Writer.QuoteIdentifier('x').startsWith(f.Open));
        expect(form).toBeDefined();
        if (!form?.DoubledCloseEscape) return; // e.g. Oracle: an identifier cannot contain `"`.
        const name = `a${form.Close}b`;
        const quoted = dialect.Writer.QuoteIdentifier(name);
        expect(ReadQuotedIdentifier(quoted, dialect.Lexical)).toEqual({ Value: name, End: quoted.length });
    });

    it('writes a qualified name from two quoted identifiers', () => {
        expect(dialect.Writer.QuoteSchema('s', 'o')).toBe(`${dialect.Writer.QuoteIdentifier('s')}.${dialect.Writer.QuoteIdentifier('o')}`);
    });

    it('writes a row cap in a form its grammar declares', () => {
        const cap = dialect.Writer.LimitClause(10);
        const page = dialect.Writer.LimitClause(10, 20);
        const formOf = (prefix: string, suffix: string): RowCapForm =>
            prefix.startsWith('TOP') ? 'top' : suffix.startsWith('LIMIT') ? 'limit-offset' : 'offset-fetch';
        expect(dialect.Grammar.RowCapForms).toContain(formOf(cap.prefix, cap.suffix));
        expect(dialect.Grammar.RowCapForms).toContain(formOf(page.prefix, page.suffix));
        expect(`${page.prefix} ${page.suffix}`).toMatch(/\b20\b/);
    });

    it('declares the common grammar keywords', () => {
        const grammar = dialect.Grammar;
        expect(grammar.SetOperatorKeywords).toContain('UNION');
        for (const keyword of ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER']) expect(grammar.WriteStatementKeywords).toContain(keyword);
        for (const keyword of [...grammar.WriteStatementKeywords, ...grammar.SetOperatorKeywords]) expect(keyword).toBe(keyword.toUpperCase());
        for (const name of grammar.CallerSQLForbiddenFunctions) expect(name).toBe(name.toLowerCase());
        expect(grammar.DefaultPagingOrderBy.length).toBeGreaterThan(0);
    });

    it('writes expressions in every writer method without throwing', () => {
        const writer = dialect.Writer;
        expect(writer.Coalesce('a', 'b')).toContain('a');
        expect(writer.IsNull('a', 'b')).toContain('b');
        expect(writer.Concat('a', 'b')).toMatch(/a.*b/);
        expect(writer.CastToText('x')).toMatch(/^CAST\(x AS /);
        expect(writer.JsonExtract('c', '$.p')).toContain('c');
        expect(writer.DateAddExpression('DAY', -3, 'd')).toContain('-3');
        expect(writer.CurrentTimestampUTC().length).toBeGreaterThan(0);
        expect(writer.BooleanLiteral(true)).not.toBe(writer.BooleanLiteral(false));
        expect(writer.NullLiteral).toBe('NULL');
    });
});
