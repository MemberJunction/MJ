import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

// ════════════════════════════════════════════════════════════════════
// Construction / IsValid
// ════════════════════════════════════════════════════════════════════

describe('SQLParser construction', () => {

    it('IsValid is true for a parseable SELECT', () => {
        expect(new SQLParser('SELECT * FROM Users', tsql).IsValid).toBe(true);
    });

    it('IsValid is false for unparseable SQL', () => {
        expect(new SQLParser('SELECT FROM WHERE (((', tsql).IsValid).toBe(false);
    });

    it('IsValid is false for an empty string', () => {
        expect(new SQLParser('', tsql).IsValid).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════
// StatementKind
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.StatementKind', () => {

    it('returns "select" for a plain SELECT', () => {
        expect(new SQLParser('SELECT * FROM Users', tsql).StatementKind).toBe('select');
    });

    it('returns "select" for a CTE-headed SELECT', () => {
        expect(new SQLParser('WITH x AS (SELECT 1 AS a) SELECT * FROM x', tsql).StatementKind).toBe('select');
    });

    it('returns "set-op" for a UNION', () => {
        expect(new SQLParser('SELECT 1 UNION SELECT 2', tsql).StatementKind).toBe('set-op');
    });

    it('returns "select-into" for SELECT … INTO #temp', () => {
        expect(new SQLParser('SELECT * INTO #temp FROM Users', tsql).StatementKind).toBe('select-into');
    });

    it('returns "mutation" for UPDATE', () => {
        expect(new SQLParser('UPDATE Users SET Active = 1', tsql).StatementKind).toBe('mutation');
    });

    it('returns "mutation" for DELETE', () => {
        expect(new SQLParser('DELETE FROM Users WHERE ID = 1', tsql).StatementKind).toBe('mutation');
    });

    it('returns "mutation" for INSERT', () => {
        expect(new SQLParser('INSERT INTO Users (Name) VALUES ($1)', pg).StatementKind).toBe('mutation');
    });

    it('returns "other" for unparseable SQL', () => {
        expect(new SQLParser('not valid sql (((', tsql).StatementKind).toBe('other');
    });
});

// ════════════════════════════════════════════════════════════════════
// HasWriteStatement (write/stacked-injection detection)
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.HasWriteStatement', () => {

    it('is false for a plain SELECT', () => {
        expect(new SQLParser('SELECT * FROM Users', tsql).HasWriteStatement).toBe(false);
    });

    it('is false for a CTE-headed SELECT', () => {
        expect(new SQLParser('WITH c AS (SELECT 1 AS a) SELECT * FROM c', tsql).HasWriteStatement).toBe(false);
    });

    it('is false for a SELECT using the REPLACE() string function', () => {
        // statement type is 'select' — the function name must not be mistaken for a REPLACE statement
        expect(new SQLParser("SELECT REPLACE(Name, 'a', 'b') AS N FROM Users", tsql).HasWriteStatement).toBe(false);
    });

    it('is true for a single DELETE / UPDATE / INSERT', () => {
        expect(new SQLParser('DELETE FROM Users WHERE ID = 1', tsql).HasWriteStatement).toBe(true);
        expect(new SQLParser('UPDATE Users SET Active = 1', tsql).HasWriteStatement).toBe(true);
        expect(new SQLParser("INSERT INTO Users (Name) VALUES ('x')", tsql).HasWriteStatement).toBe(true);
    });

    it('is true for a single DDL statement (DROP) — StatementKind is only "other"', () => {
        const parser = new SQLParser('DROP TABLE Users', tsql);
        expect(parser.StatementKind).toBe('other');
        expect(parser.HasWriteStatement).toBe(true);
    });

    it('is true for a stacked SELECT; DROP injection', () => {
        expect(new SQLParser('SELECT 1 AS x; DROP TABLE Users', tsql).HasWriteStatement).toBe(true);
    });

    it('is true for a stacked SELECT; DELETE injection', () => {
        expect(new SQLParser('SELECT 1 AS x; DELETE FROM Users', tsql).HasWriteStatement).toBe(true);
    });

    it('is false for a benign SET NOCOUNT ON prefix before a SELECT', () => {
        expect(new SQLParser('SET NOCOUNT ON; SELECT * FROM Users', tsql).HasWriteStatement).toBe(false);
    });

    it('is false for a benign DECLARE prefix before a SELECT', () => {
        expect(new SQLParser('DECLARE @x INT = 5; SELECT @x AS v', tsql).HasWriteStatement).toBe(false);
    });

    it('is false for unparseable SQL', () => {
        expect(new SQLParser('not valid sql (((', tsql).HasWriteStatement).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════
// OuterCap (dialect-neutral RowCapInfo)
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.OuterCap', () => {

    it('returns null when no cap is present', () => {
        expect(new SQLParser('SELECT * FROM Users', tsql).OuterCap).toBeNull();
    });

    it('extracts a numeric SQL Server TOP', () => {
        expect(new SQLParser('SELECT TOP 5 * FROM Users', tsql).OuterCap)
            .toEqual({ form: 'numeric', value: 5, offset: null });
    });

    it('flags TOP PERCENT as a percent cap', () => {
        expect(new SQLParser('SELECT TOP 25 PERCENT * FROM Users', tsql).OuterCap)
            .toEqual({ form: 'percent' });
    });
    // Note: node-sql-parser's transactsql grammar only accepts a numeric `TOP N`
    // (TOP (@var), TOP (1+1), TOP (SELECT 1) all fail to parse), so the opaque
    // TOP branch is unreachable via parsing — it is covered directly in
    // ASTDialectAdapter.test.ts against a synthetic AST root.

    it('extracts a numeric PostgreSQL LIMIT', () => {
        expect(new SQLParser('SELECT * FROM users LIMIT 5', pg).OuterCap)
            .toEqual({ form: 'numeric', value: 5, offset: null });
    });

    it('extracts LIMIT N OFFSET M and preserves the offset', () => {
        expect(new SQLParser('SELECT * FROM users LIMIT 5 OFFSET 10', pg).OuterCap)
            .toEqual({ form: 'numeric', value: 5, offset: 10 });
    });

    it('flags a non-numeric LIMIT $1 as opaque', () => {
        const parser = new SQLParser('SELECT * FROM users LIMIT $1', pg);
        expect(parser.IsValid).toBe(true);
        expect(parser.OuterCap).toEqual({ form: 'opaque' });
    });

    it('returns null for unparseable SQL', () => {
        expect(new SQLParser('not valid sql (((', tsql).OuterCap).toBeNull();
    });

    it('returns null for a non-SELECT statement', () => {
        expect(new SQLParser('UPDATE Users SET Active = 1', tsql).OuterCap).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// SetOuterCap + ToSQL
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.SetOuterCap + ToSQL', () => {

    it('injects TOP N on SQL Server', () => {
        const parser = new SQLParser('SELECT * FROM Users', tsql);
        parser.SetOuterCap(50);
        expect(parser.ToSQL()).toMatch(/\bTOP\s+50\b/i);
    });

    it('replaces an existing TOP value on SQL Server', () => {
        const parser = new SQLParser('SELECT TOP 500 * FROM Users', tsql);
        parser.SetOuterCap(100);
        const out = parser.ToSQL();
        expect(out).toMatch(/\bTOP\s+100\b/i);
        expect(out).not.toMatch(/\bTOP\s+500\b/i);
    });

    it('injects LIMIT N on PostgreSQL', () => {
        const parser = new SQLParser('SELECT * FROM users', pg);
        parser.SetOuterCap(50);
        expect(parser.ToSQL()).toMatch(/LIMIT\s+50/i);
    });

    it('replaces an existing LIMIT value on PostgreSQL', () => {
        const parser = new SQLParser('SELECT * FROM users LIMIT 500', pg);
        parser.SetOuterCap(100);
        const out = parser.ToSQL();
        expect(out).toMatch(/LIMIT\s+100/i);
        expect(out).not.toMatch(/LIMIT\s+500/i);
    });

    it('preserves OFFSET when replacing a LIMIT', () => {
        const parser = new SQLParser('SELECT * FROM users LIMIT 500 OFFSET 25', pg);
        parser.SetOuterCap(100);
        const out = parser.ToSQL();
        expect(out).toMatch(/LIMIT\s+100/i);
        expect(out).toMatch(/OFFSET\s+25/i);
    });

    it('is a no-op for a non-SELECT statement', () => {
        const parser = new SQLParser('UPDATE Users SET Active = 1', tsql);
        parser.SetOuterCap(100);
        expect(parser.ToSQL()).not.toMatch(/\bTOP\b/i);
    });

    it('produces re-parseable SQL with the applied cap (SQL Server)', () => {
        const parser = new SQLParser('SELECT TOP 500 * FROM Users WHERE Active = 1', tsql);
        parser.SetOuterCap(100);
        const reparsed = new SQLParser(parser.ToSQL(), tsql);
        expect(reparsed.IsValid).toBe(true);
        expect(reparsed.OuterCap).toEqual({ form: 'numeric', value: 100, offset: null });
    });

    it('produces re-parseable SQL with the applied cap (PostgreSQL, OFFSET kept)', () => {
        const parser = new SQLParser('SELECT * FROM users LIMIT 500 OFFSET 25', pg);
        parser.SetOuterCap(100);
        const reparsed = new SQLParser(parser.ToSQL(), pg);
        expect(reparsed.IsValid).toBe(true);
        expect(reparsed.OuterCap).toEqual({ form: 'numeric', value: 100, offset: 25 });
    });
});

// ════════════════════════════════════════════════════════════════════
// ClearOuterCap
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.ClearOuterCap', () => {

    it('removes an existing TOP', () => {
        const parser = new SQLParser('SELECT TOP 100 * FROM Users', tsql);
        parser.ClearOuterCap();
        expect(parser.ToSQL()).not.toMatch(/\bTOP\b/i);
    });

    it('removes an existing LIMIT', () => {
        const parser = new SQLParser('SELECT * FROM users LIMIT 100', pg);
        parser.ClearOuterCap();
        expect(parser.ToSQL()).not.toMatch(/LIMIT\b/i);
    });

    it('is a no-op when no cap is present', () => {
        const parser = new SQLParser('SELECT * FROM Users', tsql);
        parser.ClearOuterCap();
        expect(parser.ToSQL()).toMatch(/SELECT.*FROM/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// ClearOrderBy
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.ClearOrderBy', () => {

    it('removes a top-level ORDER BY (SQL Server)', () => {
        const parser = new SQLParser('SELECT * FROM Users ORDER BY Name', tsql);
        parser.ClearOrderBy();
        expect(parser.ToSQL()).not.toMatch(/ORDER\s+BY/i);
    });

    it('removes a top-level ORDER BY (PostgreSQL)', () => {
        // The exact shape AnalyzeTopLevelOrderBy fails to strip; ClearOrderBy must.
        const parser = new SQLParser('SELECT id FROM users ORDER BY id', pg);
        parser.ClearOrderBy();
        expect(parser.ToSQL()).not.toMatch(/ORDER\s+BY/i);
    });

    it('clears ORDER BY on a set-op branch (UNION)', () => {
        const parser = new SQLParser('SELECT 1 AS a UNION SELECT 2 AS a ORDER BY a', tsql);
        parser.ClearOrderBy();
        expect(parser.ToSQL()).not.toMatch(/ORDER\s+BY/i);
    });

    it('is a no-op when there is no ORDER BY', () => {
        const parser = new SQLParser('SELECT * FROM Users', tsql);
        parser.ClearOrderBy();
        expect(parser.ToSQL()).toMatch(/SELECT/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Preprocessing fallback (bracket-identifier aliasing + trailing OPTION)
// ════════════════════════════════════════════════════════════════════

describe('SQLParser preprocessing fallback', () => {

    it('parses a CTE whose name has a space, restoring it on ToSQL', () => {
        const sql = 'WITH [Active People] AS (SELECT 1 AS a) SELECT * FROM [Active People]';
        const parser = new SQLParser(sql, tsql);
        expect(parser.IsValid).toBe(true);
        parser.SetOuterCap(100);
        const out = parser.ToSQL();
        expect(out).toContain('[Active People]');
        expect(out).not.toMatch(/_mjid_/);
        expect(out).toMatch(/\bTOP\s+100\b/i);
    });

    it('parses a hyphenated bracket identifier and restores it', () => {
        const parser = new SQLParser('WITH [my-cte] AS (SELECT 1 AS a) SELECT * FROM [my-cte]', tsql);
        expect(parser.IsValid).toBe(true);
        expect(parser.ToSQL()).toContain('[my-cte]');
    });

    it('caps a query with a trailing OPTION clause and preserves the hint', () => {
        const parser = new SQLParser('SELECT * FROM Users OPTION (RECOMPILE)', tsql);
        expect(parser.IsValid).toBe(true);
        parser.SetOuterCap(50);
        const out = parser.ToSQL();
        expect(out).toMatch(/\bTOP\s+50\b/i);
        expect(out).toMatch(/OPTION\s*\(RECOMPILE\)/i);
    });

    it('does not alias a bracket identifier with no special characters (fast path)', () => {
        const parser = new SQLParser('SELECT [Active] FROM Users', tsql);
        expect(parser.IsValid).toBe(true);
        expect(parser.ToSQL()).not.toMatch(/_mjid_/);
    });
});

// ════════════════════════════════════════════════════════════════════
// HasUnwrappableTrailingClause
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.HasStackedStatements', () => {

    it('is false for a single statement', () => {
        expect(SQLParser.HasStackedStatements('SELECT * FROM Users', tsql)).toBe(false);
    });

    it('is false for a single statement with a trailing semicolon', () => {
        expect(SQLParser.HasStackedStatements('SELECT * FROM Users;', tsql)).toBe(false);
    });

    it('is false for multiple trailing semicolons / whitespace / trailing comment', () => {
        expect(SQLParser.HasStackedStatements('SELECT * FROM Users;;;  ', tsql)).toBe(false);
        expect(SQLParser.HasStackedStatements('SELECT * FROM Users; -- done', tsql)).toBe(false);
    });

    it('is true for a stacked write that parses (SELECT; DELETE)', () => {
        expect(SQLParser.HasStackedStatements('SELECT 1 AS x; DELETE FROM Users', tsql)).toBe(true);
    });

    it('is true for a stacked UNPARSEABLE payload (SELECT; EXEC xp_cmdshell)', () => {
        expect(SQLParser.HasStackedStatements("SELECT 1 AS x; EXEC xp_cmdshell 'dir'", tsql)).toBe(true);
    });

    it('is true for a stacked time-based payload (SELECT; WAITFOR DELAY)', () => {
        expect(SQLParser.HasStackedStatements("SELECT 1 AS x; WAITFOR DELAY '00:00:05'", tsql)).toBe(true);
    });

    it('is true when statements are separated only by a comment', () => {
        expect(SQLParser.HasStackedStatements("SELECT 1; -- c\nSELECT 2", tsql)).toBe(true);
    });

    it('is true for a benign SET/DECLARE prefix (single-statement rule)', () => {
        expect(SQLParser.HasStackedStatements('SET NOCOUNT ON; SELECT * FROM Users', tsql)).toBe(true);
        expect(SQLParser.HasStackedStatements('DECLARE @x INT = 5; SELECT @x AS v', tsql)).toBe(true);
    });

    it('does not flag a semicolon inside a string literal', () => {
        expect(SQLParser.HasStackedStatements("SELECT 'a; b' AS s FROM Users", tsql)).toBe(false);
    });

    it('does not flag a semicolon inside a bracket identifier or comment', () => {
        expect(SQLParser.HasStackedStatements('SELECT [a;b] FROM Users', tsql)).toBe(false);
        expect(SQLParser.HasStackedStatements('SELECT /* a; b */ 1 AS x', tsql)).toBe(false);
    });

    it('does not flag a semicolon inside a double-quoted identifier (PostgreSQL)', () => {
        expect(SQLParser.HasStackedStatements('SELECT "a; b" FROM users', pg)).toBe(false);
    });
});

describe('SQLParser.HasUnwrappableTrailingClause', () => {

    it('detects FOR JSON AUTO', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT * FROM Users FOR JSON AUTO', tsql,
        )).toBe(true);
    });

    it('detects FOR XML PATH', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            "SELECT * FROM Users FOR XML PATH('row')", tsql,
        )).toBe(true);
    });

    it('detects OPTION (RECOMPILE)', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT * FROM Users OPTION (RECOMPILE)', tsql,
        )).toBe(true);
    });

    it('does not flag a string literal containing "FOR JSON"', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            "SELECT * FROM Users WHERE Notes = 'see also: FOR JSON'", tsql,
        )).toBe(false);
    });

    it('does not flag a string literal containing "OPTION ("', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            "SELECT * FROM Users WHERE Notes = 'use OPTION (RECOMPILE)'", tsql,
        )).toBe(false);
    });

    it('does not flag a bracket identifier named [FOR JSON]', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT [FOR JSON] FROM Users', tsql,
        )).toBe(false);
    });

    it('does not flag a double-quoted identifier named "for json"', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT "for json" FROM users', pg,
        )).toBe(false);
    });

    it('does not match FORWARD or FORMAT (word-boundary required after FOR)', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT FORMAT(d, \'yyyy-MM\') FROM t', tsql,
        )).toBe(false);
    });

    it('does not match OPTIONS (no parenthesis follows OPTION)', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT [OPTIONS] FROM t', tsql,
        )).toBe(false);
    });

    it('matches with arbitrary whitespace between OPTION and (', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT * FROM t OPTION  \t (RECOMPILE)', tsql,
        )).toBe(true);
    });

    it('case-insensitive on the keyword', () => {
        expect(SQLParser.HasUnwrappableTrailingClause(
            'SELECT * FROM Users for json auto', tsql,
        )).toBe(true);
    });
});
