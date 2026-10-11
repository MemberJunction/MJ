import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { LexSQL, SignificantTokens } from '../sqlLexer.js';
import { IsReadOnlyQuery, SplitLeadingCTEs } from '../sqlShape.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

describe('LexSQL', () => {
    it('covers every character, so the tokens join back into the input', () => {
        const sql = `WITH [a b] AS (SELECT N'x''y' AS v /* c (nested /* d */) */ FROM t) SELECT * FROM [a b] -- end`;
        expect(LexSQL(sql, ss).map(t => t.Text).join('')).toBe(sql);
    });

    it('reads PostgreSQL dollar-quoted and E-strings as one string token, comment markers and all', () => {
        const sql = `SELECT $$a -- b$$, $tag$x /* y */ ')'$tag$, E'it\\'s -- not a comment', $1 FROM t`;
        const strings = LexSQL(sql, pg).filter(t => t.Kind === 'string').map(t => t.Text);
        expect(strings).toEqual([`$$a -- b$$`, `$tag$x /* y */ ')'$tag$`, `E'it\\'s -- not a comment'`]);
        expect(LexSQL(sql, pg).some(t => t.Kind === 'comment')).toBe(false);
    });

    it('treats brackets as identifiers on SQL Server only', () => {
        expect(LexSQL('SELECT [x]', ss).some(t => t.Kind === 'identifier' && t.Text === '[x]')).toBe(true);
        expect(LexSQL('SELECT ARRAY[1]', pg).some(t => t.Kind === 'identifier')).toBe(false);
    });

    it('tracks parenthesis depth, with both parentheses at the depth outside them', () => {
        const tokens = SignificantTokens(LexSQL('SELECT (a + (b)) FROM t', ss));
        expect(tokens.map(t => `${t.Text}@${t.Depth}`)).toEqual(['SELECT@0', '(@0', 'a@1', '+@1', '(@1', 'b@2', ')@1', ')@0', 'FROM@0', 't@0']);
    });
});

describe('SplitLeadingCTEs', () => {
    it('returns each definition and the main statement exactly as written', () => {
        const sql = `-- header\nWITH [First CTE] AS (\n  SELECT TOP 5 a, b FROM t ORDER BY a\n), second (x) AS (SELECT 1)\nSELECT TOP 3 * FROM [First CTE]`;
        const split = SplitLeadingCTEs(sql, ss)!;
        expect(split.Recursive).toBe(false);
        expect(split.Definitions.map(d => d.Name)).toEqual(['[First CTE]', 'second']);
        expect(split.Definitions[0].Body).toBe('\n  SELECT TOP 5 a, b FROM t ORDER BY a\n');
        expect(split.Definitions[1].Text).toBe('second (x) AS (SELECT 1)');
        expect(split.Main).toBe('SELECT TOP 3 * FROM [First CTE]');
        expect(sql.substring(split.MainStart)).toBe(split.Main);
    });

    it('keeps the RECURSIVE flag and PostgreSQL MATERIALIZED hints', () => {
        const sql = `WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 5), m AS NOT MATERIALIZED (SELECT n FROM r) SELECT n FROM m`;
        const split = SplitLeadingCTEs(sql, pg)!;
        expect(split.Recursive).toBe(true);
        expect(split.Definitions.map(d => d.Name)).toEqual(['r', 'm']);
        expect(split.Main).toBe('SELECT n FROM m');
    });

    it('is not fooled by a parenthesis inside a string or comment in a body', () => {
        const split = SplitLeadingCTEs(`WITH a AS (SELECT ')' AS p /* ) */) SELECT p FROM a`, ss)!;
        expect(split.Definitions[0].Body).toBe(`SELECT ')' AS p /* ) */`);
        expect(split.Main).toBe('SELECT p FROM a');
    });

    it('returns null for a statement without a leading WITH, or with an unreadable one', () => {
        expect(SplitLeadingCTEs('SELECT 1', ss)).toBeNull();
        expect(SplitLeadingCTEs('WITH a (SELECT 1) SELECT 1', ss)).toBeNull();
        expect(SplitLeadingCTEs('WITH a AS (SELECT 1', ss)).toBeNull();
    });
});

describe('IsReadOnlyQuery', () => {
    const reads: Array<[string, SQLServerDialect | PostgreSQLDialect]> = [
        ['SELECT 1', ss],
        ['/* c */ -- d\n SELECT a FROM t;', ss],
        ['(SELECT 1) UNION (SELECT 2)', ss],
        ['SELECT TRY_CAST(x AS INT) FROM t', ss],
        ['WITH a AS (SELECT 1 AS x) SELECT x FROM a', ss],
        ['WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT n FROM r', pg],
        ['WITH v (n) AS (VALUES (1), (2)) SELECT n FROM v', pg],
        ["SELECT set_config('statement_timeout', '1s', false)", pg]
    ];
    for (const [sql, dialect] of reads) {
        it(`accepts ${sql.replace(/\s+/g, ' ')}`, () => {
            expect(IsReadOnlyQuery(sql, dialect)).toEqual({ IsReadOnly: true, Reason: null });
        });
    }

    const writes: Array<[string, SQLServerDialect | PostgreSQLDialect, RegExp]> = [
        ["SET statement_timeout = '3s'", pg, /starts with SET/],
        ['SET LOCK_TIMEOUT 0', ss, /starts with SET/],
        ['UPDATE t SET a = 1', ss, /starts with UPDATE/],
        ['DECLARE @x INT = 1 SELECT @x', ss, /starts with DECLARE/],
        ['SELECT 1; SELECT 2', ss, /more than one statement/],
        ["SELECT 1; EXEC xp_cmdshell 'dir'", ss, /more than one statement/],
        ['SELECT * INTO copy_of_t FROM t', ss, /SELECT … INTO/],
        ['WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d', pg, /CTE d is a DELETE/],
        ['WITH a AS (SELECT 1 AS x) UPDATE t SET y = 1', ss, /starts with UPDATE, not SELECT/],
        ['', ss, /empty/]
    ];
    for (const [sql, dialect, reason] of writes) {
        it(`refuses ${sql || '(empty)'}`, () => {
            const check = IsReadOnlyQuery(sql, dialect);
            expect(check.IsReadOnly).toBe(false);
            expect(check.Reason).toMatch(reason);
        });
    }
});
