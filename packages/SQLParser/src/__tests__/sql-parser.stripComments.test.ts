import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

describe('SQLParser.StripComments', () => {

    // ────────────────────────────────────────────────────────────
    // Basic comment forms
    // ────────────────────────────────────────────────────────────

    describe('basic comments', () => {
        it('strips a single-line -- comment', () => {
            const out = SQLParser.StripComments(`SELECT 1 -- this is a comment\nFROM t`, tsql);
            expect(out).not.toMatch(/-- this is a comment/);
            expect(out).toContain('SELECT 1');
            expect(out).toContain('FROM t');
        });

        it('strips a single-line -- comment at end of input (no trailing newline)', () => {
            const out = SQLParser.StripComments(`SELECT 1 -- trailing`, tsql);
            expect(out).not.toMatch(/-- trailing/);
            expect(out).toContain('SELECT 1');
        });

        it('strips a /* block */ comment', () => {
            const out = SQLParser.StripComments(`SELECT /* hello */ 1`, tsql);
            expect(out).not.toMatch(/hello/);
            expect(out).toMatch(/SELECT\s+1/);
        });

        it('strips a multi-line block comment', () => {
            const out = SQLParser.StripComments(`SELECT /* line1\nline2\nline3 */ 1`, tsql);
            expect(out).not.toMatch(/line1|line2|line3/);
            expect(out).toMatch(/SELECT\s+1/);
        });
    });

    // ────────────────────────────────────────────────────────────
    // String literals must not be stripped
    // ────────────────────────────────────────────────────────────

    describe('single-quoted string literals', () => {
        it('preserves -- inside a single-quoted string', () => {
            const sql = `SELECT 'no -- comment here' AS s`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });

        it('preserves /*...*/ inside a single-quoted string', () => {
            const sql = `SELECT 'no /* comment */ here' AS s`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });

        it("handles escaped single quotes ('') inside a string literal", () => {
            const sql = `SELECT 'it''s -- not a comment' AS s`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });
    });

    // ────────────────────────────────────────────────────────────
    // SQL Server bracket identifiers
    // ────────────────────────────────────────────────────────────

    describe('SQL Server bracket identifiers', () => {
        it('preserves -- inside [bracket identifiers]', () => {
            const sql = `SELECT [my -- column] FROM dbo.Users`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('[my -- column]');
        });

        it('preserves /*...*/ inside [bracket identifiers]', () => {
            const sql = `SELECT [my /* column */ name] FROM dbo.Users`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('[my /* column */ name]');
        });

        it('handles escaped close-bracket (]]) inside a bracket identifier', () => {
            const sql = `SELECT [weird]]name -- still inside] FROM dbo.Users`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('[weird]]name -- still inside]');
        });

        it('does NOT treat [ as an identifier opener on PostgreSQL', () => {
            // On PG, [ has no special meaning — the `--` that follows IS a
            // real line comment.
            const sql = `SELECT 1 -- bracket [ has no meaning here\nFROM t`;
            const out = SQLParser.StripComments(sql, pg);
            expect(out).not.toMatch(/bracket \[ has no meaning/);
            expect(out).toContain('FROM t');
        });
    });

    // ────────────────────────────────────────────────────────────
    // ANSI double-quoted identifiers
    // ────────────────────────────────────────────────────────────

    describe('double-quoted identifiers', () => {
        it('preserves -- inside "identifier" on SQL Server', () => {
            const sql = `SELECT "my -- column" FROM Users`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('"my -- column"');
        });

        it('preserves -- inside "identifier" on PostgreSQL', () => {
            const sql = `SELECT "my -- column" FROM users`;
            const out = SQLParser.StripComments(sql, pg);
            expect(out).toContain('"my -- column"');
        });

        it('handles escaped double-quote ("") inside identifier', () => {
            const sql = `SELECT "weird""name -- inside" FROM t`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('"weird""name -- inside"');
        });
    });

    // ────────────────────────────────────────────────────────────
    // Nested block comments
    // ────────────────────────────────────────────────────────────

    describe('nested block comments', () => {
        it('fully strips a singly-nested block comment', () => {
            const sql = `/* outer /* inner */ */SELECT 1`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).not.toMatch(/\*\//);
            expect(out).toMatch(/SELECT\s+1/);
        });

        it('fully strips a doubly-nested block comment', () => {
            const sql = `/* a /* b /* c */ */ */SELECT 1`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).not.toMatch(/\*\//);
            expect(out).toMatch(/SELECT\s+1/);
        });

        it('does not terminate a nested block comment early', () => {
            // The outer comment is `/* … */`. The `*/` at the end of "inner" is
            // matched first, then "outer" closes on the second `*/`.
            const sql = `SELECT 1; /* outer /* inner */ still outer */ SELECT 2`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).not.toMatch(/outer|inner/);
            expect(out).toMatch(/SELECT\s+1/);
            expect(out).toMatch(/SELECT\s+2/);
        });
    });

    // ────────────────────────────────────────────────────────────
    // Real-world Skip-shaped inputs
    // ────────────────────────────────────────────────────────────

    describe('production-shaped inputs', () => {
        it('CTE-headed SQL with bracket identifiers survives comment stripping', () => {
            const sql = `WITH [ActivePeople] AS (
    SELECT [CompanyID], COUNT([ID]) AS [ActivePeopleCount]
    FROM [dbo].[vwPeople]
    WHERE [Status_Virtual] = 'Active'
    GROUP BY [CompanyID]
)
SELECT c.[ID], c.[Name], ap.[ActivePeopleCount]
FROM [dbo].[vwCompanies] c
LEFT JOIN [ActivePeople] ap ON c.[ID] = ap.[CompanyID]`;
            const out = SQLParser.StripComments(sql, tsql);
            // No comments to strip — output must be byte-identical.
            expect(out).toBe(sql);
        });

        it('SQL with a leading comment header is stripped to the SELECT', () => {
            const sql = `-- ============================================================
-- Agent Performance Report
-- ============================================================
SELECT TOP 100 a.Name FROM dbo.vwAIAgents a`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).not.toMatch(/Agent Performance Report/);
            expect(out).toMatch(/SELECT TOP 100/);
        });

        it('SQL with mixed line + block comments is fully stripped', () => {
            const sql = `/* block */ SELECT 1 -- line\n/* another */ SELECT 2`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).not.toMatch(/block|line|another/);
            expect(out).toMatch(/SELECT\s+1/);
            expect(out).toMatch(/SELECT\s+2/);
        });
    });

    // ────────────────────────────────────────────────────────────
    // Edge cases
    // ────────────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('handles an empty string', () => {
            expect(SQLParser.StripComments('', tsql)).toBe('');
        });

        it('handles SQL with no comments (identity transform)', () => {
            const sql = `SELECT * FROM Users`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });

        it('handles an unterminated block comment (defensive)', () => {
            // The scanner must not infinite-loop; it should just consume
            // the rest of the input as comment.
            const sql = `SELECT 1 /* unterminated`;
            const out = SQLParser.StripComments(sql, tsql);
            expect(out).toContain('SELECT 1');
            expect(out).not.toContain('unterminated');
        });

        it('handles an unterminated single-quoted string (defensive)', () => {
            // Mirrors the unterminated-comment behavior — consume the rest.
            const sql = `SELECT 'unterminated`;
            const out = SQLParser.StripComments(sql, tsql);
            // The string content is preserved (not stripped as comment).
            expect(out).toContain(`'unterminated`);
        });

        it('handles single dash followed by non-dash (not a comment)', () => {
            const sql = `SELECT 5 - 3 AS difference`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });

        it('handles single slash followed by non-asterisk (not a comment)', () => {
            const sql = `SELECT 10 / 2 AS quotient`;
            expect(SQLParser.StripComments(sql, tsql)).toBe(sql);
        });
    });
});
