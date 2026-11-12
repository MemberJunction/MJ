import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { RewriteGrammarGaps } from '../../strict/grammarGapRewrites.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

describe('RewriteGrammarGaps — STRING_AGG … WITHIN GROUP', () => {
    it('bracket-quotes the name of a call that WITHIN GROUP follows, keeping its case', () => {
        expect(RewriteGrammarGaps("SELECT string_agg(Name, ', ') WITHIN GROUP (ORDER BY Name) FROM t", ss))
            .toBe("SELECT [string_agg](Name, ', ') WITHIN GROUP (ORDER BY Name) FROM t");
    });

    it('matches the closing parenthesis of the call, not one inside its arguments', () => {
        expect(RewriteGrammarGaps("SELECT STRING_AGG(CAST(ID AS VARCHAR(36)), ', ') WITHIN GROUP (ORDER BY ID) FROM t", ss))
            .toBe("SELECT [STRING_AGG](CAST(ID AS VARCHAR(36)), ', ') WITHIN GROUP (ORDER BY ID) FROM t");
    });

    it('allows a comment between the call and WITHIN GROUP', () => {
        expect(RewriteGrammarGaps('SELECT STRING_AGG(a, \',\') /* sorted */ WITHIN GROUP (ORDER BY a) FROM t', ss))
            .toBe('SELECT [STRING_AGG](a, \',\') /* sorted */ WITHIN GROUP (ORDER BY a) FROM t');
    });

    it.each([
        ['a call without WITHIN GROUP', "SELECT STRING_AGG(Name, ', ') FROM t"],
        ['a qualified name', "SELECT dbo.STRING_AGG(Name, ', ') WITHIN GROUP (ORDER BY Name) FROM t"],
        ['a name already quoted', "SELECT [STRING_AGG](Name, ', ') WITHIN GROUP (ORDER BY Name) FROM t"],
        ['the text inside a string literal', "SELECT 'STRING_AGG(x) WITHIN GROUP (ORDER BY x)' AS s FROM t"],
        ['the text inside a comment', 'SELECT 1 FROM t -- STRING_AGG(x) WITHIN GROUP (ORDER BY x)'],
        ['an aggregate the grammar reads with WITHIN GROUP', 'SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER () FROM t'],
    ])('leaves %s alone', (_case, sql) => {
        expect(RewriteGrammarGaps(sql, ss)).toBe(sql);
    });
});

describe('RewriteGrammarGaps — set operators', () => {
    it('reads INTERSECT and EXCEPT as UNION, at any depth', () => {
        expect(RewriteGrammarGaps('SELECT a FROM t INTERSECT SELECT a FROM u WHERE a IN (SELECT a FROM v except SELECT a FROM w)', ss))
            .toBe('SELECT a FROM t UNION SELECT a FROM u WHERE a IN (SELECT a FROM v UNION SELECT a FROM w)');
    });

    it('leaves the words alone inside literals, quoted identifiers and comments', () => {
        const sql = "SELECT 'a EXCEPT b' AS [INTERSECT] FROM t /* EXCEPT */";
        expect(RewriteGrammarGaps(sql, ss)).toBe(sql);
    });
});

describe('RewriteGrammarGaps — functions the grammar lacks', () => {
    it('reads a TRY_CAST call as CAST, with its arguments unchanged', () => {
        expect(RewriteGrammarGaps('SELECT try_cast((SELECT MAX(x) FROM u) AS INT) AS a FROM t', ss))
            .toBe('SELECT CAST((SELECT MAX(x) FROM u) AS INT) AS a FROM t');
    });

    it.each([
        ['a qualified name', 'SELECT dbo.TRY_CAST(a) FROM t'],
        ['a name that is not called', 'SELECT t.TRY_CAST FROM t'],
        ['a quoted name', 'SELECT [TRY_CAST](a) FROM t'],
    ])('leaves %s alone', (_case, sql) => {
        expect(RewriteGrammarGaps(sql, ss)).toBe(sql);
    });
});

describe('RewriteGrammarGaps — clause keywords the grammar lacks', () => {
    it.each([
        ['COUNT_BIG(*) as COUNT(*)', 'SELECT COUNT_BIG(*) AS n FROM t', 'SELECT COUNT(*) AS n FROM t'],
        ['a RANGE frame as ROWS', 'SELECT SUM(x) OVER (ORDER BY d RANGE UNBOUNDED PRECEDING) FROM t', 'SELECT SUM(x) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) FROM t'],
        ['a RANGE BETWEEN frame as ROWS', 'SELECT SUM(x) OVER (ORDER BY d RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) FROM t', 'SELECT SUM(x) OVER (ORDER BY d ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) FROM t'],
        ['LIKE … ESCAPE without its escape literal', "SELECT a FROM t WHERE a LIKE CONCAT('%', b) ESCAPE '!' AND c = 1", "SELECT a FROM t WHERE a LIKE CONCAT('%', b)  AND c = 1"],
        ['TOP n PERCENT WITH TIES without WITH TIES', 'SELECT TOP 10 PERCENT WITH TIES a FROM t ORDER BY a', 'SELECT TOP 10 PERCENT  a FROM t ORDER BY a'],
        ['TOP (expr) WITH TIES without WITH TIES', 'SELECT TOP (5) WITH TIES a FROM t ORDER BY a', 'SELECT TOP (5)  a FROM t ORDER BY a'],
        ['leading semicolons dropped', ';;WITH a AS (SELECT 1 AS x) SELECT x FROM a', 'WITH a AS (SELECT 1 AS x) SELECT x FROM a'],
    ])('reads %s', (_case, sql, expected) => {
        expect(RewriteGrammarGaps(sql, ss)).toBe(expected);
    });

    it.each([
        ['a CTE named TIES', 'WITH TIES AS (SELECT 1 AS x) SELECT x FROM TIES'],
        ['a column named Range', 'SELECT [Range], Range FROM t WHERE Range > 1'],
        ['ESCAPE with no literal after it', 'SELECT Escape FROM t'],
        ['a semicolon after the statement', 'SELECT 1 FROM t;'],
    ])('leaves %s alone', (_case, sql) => {
        expect(RewriteGrammarGaps(sql, ss)).toBe(sql);
    });
});

describe('RewriteGrammarGaps — dialects', () => {
    it('returns the text unchanged for a dialect whose grammar reads both forms', () => {
        const sql = "SELECT a FROM t EXCEPT SELECT a FROM u";
        expect(RewriteGrammarGaps(sql, pg)).toBe(sql);
    });
});
