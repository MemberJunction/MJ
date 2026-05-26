import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

// ════════════════════════════════════════════════════════════════════
// GetStatementKind
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.GetStatementKind', () => {

    it('returns "select" for a plain SELECT', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM Users', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('select');
    });

    it('returns "select" for a CTE-headed SELECT', () => {
        const ast = SQLParser.ParseSQL('WITH x AS (SELECT 1 AS a) SELECT * FROM x', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('select');
    });

    it('returns "set-op" for a UNION', () => {
        const ast = SQLParser.ParseSQL('SELECT 1 UNION SELECT 2', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('set-op');
    });

    it('returns "select-into" for SELECT … INTO #temp', () => {
        const ast = SQLParser.ParseSQL('SELECT * INTO #temp FROM Users', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('select-into');
    });

    it('returns "mutation" for UPDATE', () => {
        const ast = SQLParser.ParseSQL('UPDATE Users SET Active = 1', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('mutation');
    });

    it('returns "mutation" for DELETE', () => {
        const ast = SQLParser.ParseSQL('DELETE FROM Users WHERE ID = 1', tsql);
        expect(SQLParser.GetStatementKind(ast)).toBe('mutation');
    });

    it('returns "mutation" for INSERT', () => {
        const ast = SQLParser.ParseSQL('INSERT INTO Users (Name) VALUES ($1)', pg);
        expect(SQLParser.GetStatementKind(ast)).toBe('mutation');
    });

    it('returns "other" for a null AST', () => {
        expect(SQLParser.GetStatementKind(null)).toBe('other');
    });

    it('returns "other" for an empty AST array', () => {
        expect(SQLParser.GetStatementKind([])).toBe('other');
    });
});

// ════════════════════════════════════════════════════════════════════
// GetOuterCap
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.GetOuterCap', () => {

    it('returns null when no cap is present', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM Users', tsql);
        expect(SQLParser.GetOuterCap(ast)).toBeNull();
    });

    it('extracts a numeric SQL Server TOP', () => {
        const ast = SQLParser.ParseSQL('SELECT TOP 5 * FROM Users', tsql);
        expect(SQLParser.GetOuterCap(ast)).toEqual({ kind: 'top', value: 5 });
    });

    it('flags TOP PERCENT as non-reducible', () => {
        const ast = SQLParser.ParseSQL('SELECT TOP 25 PERCENT * FROM Users', tsql);
        const cap = SQLParser.GetOuterCap(ast);
        expect(cap).toMatchObject({ kind: 'top', isPercent: true });
    });

    it('extracts a numeric PostgreSQL LIMIT', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users LIMIT 5', pg);
        expect(SQLParser.GetOuterCap(ast)).toEqual({ kind: 'limit', value: 5, offset: null });
    });

    it('extracts LIMIT N OFFSET M and preserves the offset', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users LIMIT 5 OFFSET 10', pg);
        expect(SQLParser.GetOuterCap(ast)).toEqual({ kind: 'limit', value: 5, offset: 10 });
    });

    it('returns null for an empty AST', () => {
        expect(SQLParser.GetOuterCap(null)).toBeNull();
    });

    it('returns null for a non-SELECT statement', () => {
        const ast = SQLParser.ParseSQL('UPDATE Users SET Active = 1', tsql);
        expect(SQLParser.GetOuterCap(ast)).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// SetOuterCap
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.SetOuterCap', () => {

    it('injects TOP N on SQL Server', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM Users', tsql);
        SQLParser.SetOuterCap(ast, 50, tsql);
        const out = SQLParser.SqlifyAST(ast!, tsql);
        expect(out).toMatch(/\bTOP\s+50\b/i);
    });

    it('replaces an existing TOP value on SQL Server', () => {
        const ast = SQLParser.ParseSQL('SELECT TOP 500 * FROM Users', tsql);
        SQLParser.SetOuterCap(ast, 100, tsql);
        const out = SQLParser.SqlifyAST(ast!, tsql);
        expect(out).toMatch(/\bTOP\s+100\b/i);
        expect(out).not.toMatch(/\bTOP\s+500\b/i);
    });

    it('injects LIMIT N on PostgreSQL', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users', pg);
        SQLParser.SetOuterCap(ast, 50, pg);
        const out = SQLParser.SqlifyAST(ast!, pg);
        expect(out).toMatch(/LIMIT\s+50/i);
    });

    it('replaces an existing LIMIT value on PostgreSQL', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users LIMIT 500', pg);
        SQLParser.SetOuterCap(ast, 100, pg);
        const out = SQLParser.SqlifyAST(ast!, pg);
        expect(out).toMatch(/LIMIT\s+100/i);
        expect(out).not.toMatch(/LIMIT\s+500/i);
    });

    it('preserves OFFSET when replacing a LIMIT', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users LIMIT 500 OFFSET 25', pg);
        SQLParser.SetOuterCap(ast, 100, pg);
        const out = SQLParser.SqlifyAST(ast!, pg);
        expect(out).toMatch(/LIMIT\s+100/i);
        expect(out).toMatch(/OFFSET\s+25/i);
    });

    it('is a no-op for a non-SELECT statement', () => {
        const ast = SQLParser.ParseSQL('UPDATE Users SET Active = 1', tsql);
        SQLParser.SetOuterCap(ast, 100, tsql);
        const out = SQLParser.SqlifyAST(ast!, tsql);
        expect(out).not.toMatch(/\bTOP\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// ClearOuterCap
// ════════════════════════════════════════════════════════════════════

describe('SQLParser.ClearOuterCap', () => {

    it('removes an existing TOP', () => {
        const ast = SQLParser.ParseSQL('SELECT TOP 100 * FROM Users', tsql);
        SQLParser.ClearOuterCap(ast);
        const out = SQLParser.SqlifyAST(ast!, tsql);
        expect(out).not.toMatch(/\bTOP\b/i);
    });

    it('removes an existing LIMIT', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM users LIMIT 100', pg);
        SQLParser.ClearOuterCap(ast);
        const out = SQLParser.SqlifyAST(ast!, pg);
        expect(out).not.toMatch(/LIMIT\b/i);
    });

    it('is a no-op when no cap is present', () => {
        const ast = SQLParser.ParseSQL('SELECT * FROM Users', tsql);
        SQLParser.ClearOuterCap(ast);
        const out = SQLParser.SqlifyAST(ast!, tsql);
        expect(out).toMatch(/SELECT.*FROM/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// HasUnwrappableTrailingClause
// ════════════════════════════════════════════════════════════════════

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
