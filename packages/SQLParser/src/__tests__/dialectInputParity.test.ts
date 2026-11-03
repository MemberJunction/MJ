/**
 * TEST-INVENTORY P6: a dialect string and the equivalent dialect object give identical results.
 *
 * Where a string dialect enters. Every public SQLParser method is typed to take a
 * `SQLParserDialect` object; only private helpers take node-sql-parser's dialect string. A string
 * still arrives at run time from JavaScript or loosely typed callers (#5770 item 2:
 * `ExtractCTEs(sql, 'TransactSQL')`), and then the methods disagree with each other about what it
 * means:
 *   - `ExtractTableRefs`, `ExtractColumnRefs` and `Parse` read `dialect?.ParserDialect || 'TransactSQL'`,
 *     so any string silently becomes TransactSQL, even 'PostgresQL';
 *   - `ExtractCTEs` and `ExtractSelectColumns` read `dialect.ParserDialect` and pass `undefined` to
 *     node-sql-parser, which then parses and regenerates as MySQL (backticks).
 * The GDP fixtures' `dialect: 'TransactSQL' | 'PostgreSQL'` (composition-edge-cases.ts) is a test
 * label that its test maps to a platform; it never reaches SQLParser.
 *
 * The `it` blocks pin that every way of building a dialect object agrees, and that the instance
 * methods agree with the statics. The `it.fails` blocks pin the string input.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect, PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import type { SQLCTEExtraction, SQLColumnReference, SQLParseResult, SQLSelectColumn, SQLTableReference } from '../sql-parser.js';

type Platform = 'sqlserver' | 'postgresql';

/** The node-sql-parser dialect string a loosely typed caller passes for each platform. */
const PARSER_DIALECT_STRING: Record<Platform, string> = { sqlserver: 'TransactSQL', postgresql: 'PostgresQL' };

/** A plain object with only the SQLParserDialect members, copied from the class instance. */
function plainParserDialect(source: SQLParserDialect): SQLParserDialect {
    return {
        ParserDialect: source.ParserDialect,
        QuoteIdentifier: (name: string) => source.QuoteIdentifier(name),
        AllowsOrderByInCTE: source.AllowsOrderByInCTE,
        DefaultPagingOrderBy: source.DefaultPagingOrderBy,
        SupportsEscapeStringLiterals: source.SupportsEscapeStringLiterals,
        SupportsDollarQuotedStrings: source.SupportsDollarQuotedStrings,
        QueryHintKeyword: source.QueryHintKeyword,
        CallerSQLForbiddenFunctions: source.CallerSQLForbiddenFunctions,
    };
}

const dialectObjects: Record<Platform, ReadonlyArray<readonly [string, SQLParserDialect]>> = {
    sqlserver: [
        ['new SQLServerDialect()', new SQLServerDialect()],
        ["GetDialect('sqlserver')", GetDialect('sqlserver')],
        ['a plain SQLParserDialect object', plainParserDialect(new SQLServerDialect())],
    ],
    postgresql: [
        ['new PostgreSQLDialect()', new PostgreSQLDialect()],
        ["GetDialect('postgresql')", GetDialect('postgresql')],
        ['a plain SQLParserDialect object', plainParserDialect(new PostgreSQLDialect())],
    ],
};

/**
 * The public extractors seen from a loosely typed caller that may pass a string. Method parameters
 * are checked bivariantly, so these views need no cast; they exist only to make the string call
 * a JavaScript caller makes expressible here.
 */
type Loose<R> = (sql: string, dialect: SQLParserDialect | string) => R;
type ExtractorResult = SQLTableReference[] | SQLColumnReference[] | SQLSelectColumn[] | SQLCTEExtraction | null | SQLParseResult;
const looseExtractTableRefs: Loose<SQLTableReference[]> = SQLParser.ExtractTableRefs;
const looseExtractColumnRefs: Loose<SQLColumnReference[]> = SQLParser.ExtractColumnRefs;
const looseExtractSelectColumns: Loose<SQLSelectColumn[]> = SQLParser.ExtractSelectColumns;
const looseExtractCTEs: Loose<SQLCTEExtraction | null> = SQLParser.ExtractCTEs;
const looseParse: Loose<SQLParseResult> = SQLParser.Parse;
const loose: Record<ExtractorName, Loose<ExtractorResult>> = {
    ExtractTableRefs: looseExtractTableRefs,
    ExtractColumnRefs: looseExtractColumnRefs,
    ExtractSelectColumns: looseExtractSelectColumns,
    ExtractCTEs: looseExtractCTEs,
    Parse: looseParse,
};
type ExtractorName = 'ExtractTableRefs' | 'ExtractColumnRefs' | 'ExtractSelectColumns' | 'ExtractCTEs' | 'Parse';
const EXTRACTORS: ExtractorName[] = ['ExtractTableRefs', 'ExtractColumnRefs', 'ExtractSelectColumns', 'ExtractCTEs', 'Parse'];

/** Calls the named extractor with a dialect object or string. Bound so `this` is SQLParser. */
function callExtractor(name: ExtractorName, sql: string, dialect: SQLParserDialect | string): ExtractorResult {
    return loose[name].call(SQLParser, sql, dialect);
}

/** Synthetic statements, both platforms: plain, CTE-headed, templated, and SQL the AST rejects. */
const CORPUS: ReadonlyArray<readonly [string, string, Platform]> = [
    ['plain join', 'SELECT u.ID, r.Name AS RoleName FROM __mj.vwUsers u JOIN Roles r ON r.ID = u.RoleID WHERE u.Active = 1', 'sqlserver'],
    ['VALUES derived table in a CTE', 'WITH Q AS (SELECT n FROM (VALUES (0),(1)) AS v(n)) SELECT * FROM Q', 'sqlserver'],
    ['DATEPART in a CTE', 'WITH Q AS (SELECT DATEPART(YEAR, GETDATE()) AS Y) SELECT * FROM Q', 'sqlserver'],
    ['templated WHERE', 'SELECT a.ID FROM Accounts a WHERE a.Region = {{ region | sqlString }}', 'sqlserver'],
    ['TRY_CAST (AST rejects)', 'SELECT TRY_CAST(a AS INT) AS v FROM Real', 'sqlserver'],
    ['quoted schema-qualified', 'SELECT u."ID" FROM "__mj"."vwUsers" u WHERE u."Active" = true', 'postgresql'],
    ['CTE-headed', 'WITH q AS (SELECT "ID" FROM "__mj"."vwUsers") SELECT "ID" FROM q', 'postgresql'],
    [':: cast', 'SELECT "ID"::text AS id FROM "__mj"."vwUsers"', 'postgresql'],
    ['templated WHERE', 'SELECT a."ID" FROM "Accounts" a WHERE a."Region" = {{ region | sqlString }}', 'postgresql'],
];

describe('P6: every dialect object for a platform gives identical results', () => {
    for (const [name, sql, platform] of CORPUS) {
        const [[referenceName, reference], ...others] = dialectObjects[platform];
        for (const extractor of EXTRACTORS) {
            for (const [otherName, other] of others) {
                it(`${extractor} on ${platform} "${name}": ${otherName} matches ${referenceName}`, () => {
                    expect(callExtractor(extractor, sql, other)).toEqual(callExtractor(extractor, sql, reference));
                });
            }
        }
    }

    it('Parse(options) matches Parse(sql, dialect) for each platform', () => {
        for (const [, sql, platform] of CORPUS) {
            const [[, dialect]] = dialectObjects[platform];
            expect(SQLParser.Parse({ sql, dialect })).toEqual(SQLParser.Parse(sql, dialect));
        }
    });

    it('the instance extractors match the statics', () => {
        for (const [, sql, platform] of CORPUS) {
            const [[, dialect]] = dialectObjects[platform];
            const parser = new SQLParser(sql, dialect);
            expect(parser.ExtractTableRefs()).toEqual(SQLParser.ExtractTableRefs(sql, dialect));
            expect(parser.ExtractColumnRefs()).toEqual(SQLParser.ExtractColumnRefs(sql, dialect));
            expect(parser.ExtractSelectColumns()).toEqual(SQLParser.ExtractSelectColumns(sql, dialect));
            expect(parser.ExtractCTEs()).toEqual(SQLParser.ExtractCTEs(sql, dialect));
        }
    });

    it('a string dialect gives the same result as the object on some inputs (setup: the string call reaches the extractor)', () => {
        const sql = 'SELECT u.ID FROM __mj.vwUsers u';
        expect(callExtractor('ExtractTableRefs', sql, 'TransactSQL')).toEqual(SQLParser.ExtractTableRefs(sql, new SQLServerDialect()));
        expect(callExtractor('ExtractTableRefs', sql, 'TransactSQL')).toEqual([{ TableName: 'vwUsers', SchemaName: '__mj', Alias: 'u' }]);
    });
});

describe('P6: a dialect string gives the same result as the dialect object', () => {
    /** One pin per (statement, extractor) whose string result differs today, with the observed difference. */
    const DIFFERING: ReadonlyArray<readonly [string, ExtractorName, string, Platform, string]> = [
        ['VALUES derived table in a CTE', 'ExtractCTEs', 'WITH Q AS (SELECT n FROM (VALUES (0),(1)) AS v(n)) SELECT * FROM Q', 'sqlserver',
            "string: paren scan, body 'SELECT n FROM (VALUES (0),(1)) AS v(n)', UsedASTParsing false; object: AST, body 'SELECT [n] FROM (VALUES (0), (1)) AS [v(n)]'"],
        ['VALUES derived table in a CTE', 'ExtractSelectColumns', 'WITH Q AS (SELECT n FROM (VALUES (0),(1)) AS v(n)) SELECT * FROM Q', 'sqlserver',
            "string: []; object: ['*']"],
        ['DATEPART in a CTE', 'ExtractCTEs', 'WITH Q AS (SELECT DATEPART(YEAR, GETDATE()) AS Y) SELECT * FROM Q', 'sqlserver',
            'string: MySQL regeneration with backticks (DATEPART(`YEAR`, …) AS `Y`); object: brackets'],
        ['CTE-headed', 'ExtractCTEs', 'WITH q AS (SELECT "ID" FROM "__mj"."vwUsers") SELECT "ID" FROM q', 'postgresql',
            'string: AST via MySQL, `__mj`.`vwUsers`, UsedASTParsing true; object: paren scan, UsedASTParsing false'],
        ['CTE-headed', 'ExtractSelectColumns', 'WITH q AS (SELECT "ID" FROM "__mj"."vwUsers") SELECT "ID" FROM q', 'postgresql',
            "string: ['EXPR'] (MySQL reads \"ID\" as a string literal); object: ['ID']"],
        ['CTE-headed', 'ExtractColumnRefs', 'WITH q AS (SELECT "ID" FROM "__mj"."vwUsers") SELECT "ID" FROM q', 'postgresql',
            "string: [] (parsed as TransactSQL); object: ['ID']"],
        [':: cast', 'ExtractTableRefs', 'SELECT "ID"::text AS id FROM "__mj"."vwUsers"', 'postgresql',
            "string: [] (parsed as TransactSQL, which rejects ::, then the regex skips quoted names); object: ['__mj.vwUsers']"],
    ];

    for (const [name, extractor, sql, platform] of DIFFERING) {
        // Decided: one dialect input with one behaviour; a string and a SQLDialect object must not select
        // different code paths (DISCUSSION §6, 2026-10-27: public API frozen, behaviour same or better; #5770 item 2).
        // P6. Before the redesign: the last column of DIFFERING, per row.
        it(`${extractor} on ${platform} "${name}" gives the same result for '${PARSER_DIALECT_STRING[platform]}' as for the dialect object`, () => {
            const [[, dialect]] = dialectObjects[platform];
            expect(callExtractor(extractor, sql, PARSER_DIALECT_STRING[platform])).toEqual(callExtractor(extractor, sql, dialect));
        });
    }
});
