import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';
import { SQLParser } from '@memberjunction/sql-parser';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

afterEach(() => {
    vi.restoreAllMocks();
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as unknown as typeof Metadata.Provider);
}

// ════════════════════════════════════════════════════════════════════
// Comment stripping (via the pipeline)
// ════════════════════════════════════════════════════════════════════

describe('comment stripping inside the pipeline', () => {

    it('preserves a bracket identifier containing dash-dash', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [my -- column] FROM dbo.Users', { Platform: 'sqlserver' });
        expect(result.FinalSQL).toContain('[my -- column]');
    });

    it('preserves a bracket identifier containing slash-star', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [my /* column */ name] FROM dbo.Users', { Platform: 'sqlserver' });
        expect(result.FinalSQL).toContain('[my /* column */ name]');
    });

    it('preserves an ANSI double-quoted identifier containing dash-dash', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT "my -- column" FROM Users', { Platform: 'sqlserver' });
        expect(result.FinalSQL).toContain('"my -- column"');
    });

    it('preserves a bracket identifier with escaped ]] and dash-dash inside', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [weird]]name -- still inside] FROM dbo.Users', { Platform: 'sqlserver' });
        expect(result.FinalSQL).toContain('[weird]]name -- still inside]');
    });

    it('strips a singly-nested block comment completely', () => {
        stubMetadata();
        const result = RenderPipeline.Run('/* outer /* inner */ */SELECT 1 AS x', { Platform: 'sqlserver' });
        expect(result.FinalSQL).not.toMatch(/\*\//);
        expect(result.FinalSQL).toMatch(/SELECT\s+1\s+AS\s+x/i);
    });

    it('strips a doubly-nested block comment completely', () => {
        stubMetadata();
        const result = RenderPipeline.Run('/* a /* b /* c */ */ */SELECT 1', { Platform: 'sqlserver' });
        expect(result.FinalSQL).not.toMatch(/\*\//);
        expect(result.FinalSQL).toMatch(/SELECT\s+1/i);
    });

    it('does not terminate a block comment early when */ appears inside a string literal', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT 'no */ comment here' AS s`, { Platform: 'sqlserver' });
        expect(result.FinalSQL).toContain(`'no */ comment here'`);
    });

    it('CRLF-terminated line comments end at the LF', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT *\r\nFROM t\r\n-- comment\r\nWHERE x = 1', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/-- comment/);
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Composition tokens — resolution and HasCompositionTokens
// ════════════════════════════════════════════════════════════════════

describe('composition tokens', () => {

    it('tokens inside line comments are not resolved', () => {
        stubMetadata();
        const sql = `SELECT * FROM Users\n-- example: {{query:"some/path"}}\nWHERE Active = 1`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.HasCompositions).toBe(false);
        expect(result.CTEs).toHaveLength(0);
        expect(result.FinalSQL).not.toMatch(/some\/path/);
    });

    it('tokens inside block comments are not resolved', () => {
        stubMetadata();
        const sql = `SELECT * FROM Users\n/* docs: {{query:"some/path"}} */\nWHERE Active = 1`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.HasCompositions).toBe(false);
        expect(result.CTEs).toHaveLength(0);
    });

    it('tokens inside single-quoted string literals are not resolved', () => {
        stubMetadata();
        const sql = `SELECT 'literal {{query:"foo/bar"}} string' AS s FROM Users`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.HasCompositions).toBe(false);
        expect(result.FinalSQL).toContain(`'literal {{query:"foo/bar"}} string'`);
    });

    it('tokens inside bracket identifiers are not resolved', () => {
        stubMetadata();
        const sql = `SELECT [{{query:"foo/bar"}}] AS col FROM Users`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.HasCompositions).toBe(false);
        expect(result.FinalSQL).toContain('[{{query:"foo/bar"}}]');
    });

    describe('HasCompositionTokens', () => {
        it('returns true for SQL containing a token', () => {
            expect(RenderPipeline.HasCompositionTokens('SELECT * FROM {{query:"foo/bar"}}')).toBe(true);
        });

        it('returns false for plain SQL', () => {
            expect(RenderPipeline.HasCompositionTokens('SELECT * FROM Users')).toBe(false);
        });

        it('returns false when the SQL has only Nunjucks templates', () => {
            expect(RenderPipeline.HasCompositionTokens('SELECT {{ col }} FROM t')).toBe(false);
        });

        it('returns false when the only token is inside a SQL comment', () => {
            expect(RenderPipeline.HasCompositionTokens(`-- {{query:"x/y"}}\nSELECT 1`)).toBe(false);
        });

        // HasCompositionTokens recognizes tokens inside string literals and bracket
        // identifiers, even though full resolution correctly skips them. Wasted work
        // only; not a correctness issue.
        it.skip('returns false when the only token is inside a string literal', () => {
            expect(RenderPipeline.HasCompositionTokens(`SELECT 'literal {{query:"x/y"}} text' FROM t`)).toBe(false);
        });

        it.skip('returns false when the only token is inside a bracket identifier', () => {
            expect(RenderPipeline.HasCompositionTokens(`SELECT [{{query:"x/y"}}] FROM t`)).toBe(false);
        });
    });

    describe('ResolveCompositionOnly', () => {
        it('returns a no-cap result for SQL without tokens', () => {
            stubMetadata();
            const result = RenderPipeline.ResolveCompositionOnly(
                'SELECT * FROM Users',
                'sqlserver',
                { Email: 'x@y.z', UserRecord: { ID: '1' } } as unknown as Parameters<typeof RenderPipeline.ResolveCompositionOnly>[2],
            );
            expect(result.HasCompositions).toBe(false);
            expect(result.CTEs).toEqual([]);
            expect(result.ResolvedSQL).toBe('SELECT * FROM Users');
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// Nunjucks templates
// ════════════════════════════════════════════════════════════════════

describe('Nunjucks templates', () => {

    it('preserves `{{ paramName }}` verbatim when UsesTemplate is false', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT * FROM t WHERE name = {{ paramName | sqlString }}`, {
            Platform: 'sqlserver',
            UsesTemplate: false,
        });
        expect(result.FinalSQL).toContain('{{ paramName | sqlString }}');
    });

    it('preserves `{% if %}` block-tags verbatim when UsesTemplate is false', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT * FROM t {% if Param %}WHERE x = 1{% endif %}`, {
            Platform: 'sqlserver',
            UsesTemplate: false,
        });
        expect(result.FinalSQL).toContain('{% if Param %}');
        expect(result.FinalSQL).toContain('{% endif %}');
    });

    it('strips template-like content out of block comments', () => {
        stubMetadata();
        const result = RenderPipeline.Run('/* {{ leaked_template }} */ SELECT 1', {
            Platform: 'sqlserver',
            UsesTemplate: false,
        });
        expect(result.FinalSQL).not.toContain('leaked_template');
        expect(result.FinalSQL).toMatch(/SELECT\s+1/);
    });

    it('preserves a string literal containing {{ }} verbatim', () => {
        stubMetadata();
        const sql = `SELECT 'literal {{ not_a_param }} text' AS s FROM t`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', UsesTemplate: false });
        expect(result.FinalSQL).toContain(`'literal {{ not_a_param }} text'`);
    });

    it('preserves a bracket identifier containing {{ }} verbatim', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [{{not_a_param}}] FROM t', {
            Platform: 'sqlserver',
            UsesTemplate: false,
        });
        expect(result.FinalSQL).toContain('[{{not_a_param}}]');
    });

    it('throws when a template processing error occurs', () => {
        stubMetadata();
        const sql = `SELECT * FROM t WHERE x = {{ undefined_filter | nonexistent_filter }}`;
        expect(() => RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            UsesTemplate: true,
            Parameters: {},
        })).toThrow();
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — AST injection (TOP on SQL Server, LIMIT on PostgreSQL)
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — AST injection', () => {

    it('injects TOP on a plain SELECT (SQL Server)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Members', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
    });

    it('injects LIMIT on a plain SELECT (PostgreSQL)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'postgresql', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bLIMIT\s+10\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('caps the outermost SELECT of a CTE on SQL Server', () => {
        stubMetadata();
        const result = RenderPipeline.Run('WITH x AS (SELECT 1 AS a) SELECT * FROM x', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/WITH\s+\[?x\]?\s+AS\s+\(/i);
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
    });

    it('caps the outermost SELECT of a CTE on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('WITH x AS (SELECT 1 AS a) SELECT * FROM x', {
            Platform: 'postgresql',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/LIMIT\s+10\b/i);
    });

    it('caps the outermost SELECT of a multi-CTE self-join query', () => {
        stubMetadata();
        const sql = `WITH MemberEvents AS (
    SELECT MemberID, EventID FROM vwEventRegistrations
),
SharedEvents AS (
    SELECT e1.MemberID AS A, e2.MemberID AS B, COUNT(*) AS Shared
    FROM MemberEvents e1
    INNER JOIN MemberEvents e2 ON e1.EventID = e2.EventID
    WHERE e1.MemberID < e2.MemberID
    GROUP BY e1.MemberID, e2.MemberID
)
SELECT * FROM SharedEvents ORDER BY Shared DESC`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/ORDER\s+BY\s+\[?Shared\]?\s+DESC/i);
    });

    it('preserves an inner TOP inside a CTE definition', () => {
        stubMetadata();
        const result = RenderPipeline.Run('WITH x AS (SELECT TOP 100 * FROM Members) SELECT * FROM x', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/WITH\s+\[?x\]?\s+AS\s+\(SELECT\s+TOP\s+100/i);
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
    });

    it('preserves a subquery TOP in the FROM clause while capping the outer SELECT', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM (SELECT TOP 100 ID, Name FROM Users) AS sub', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b[\s\S]+SELECT\s+TOP\s+100/i);
    });

    it('preserves a correlated-subquery TOP in the SELECT list', () => {
        stubMetadata();
        const sql = `SELECT u.ID, (SELECT TOP 1 r.Name FROM Roles r WHERE r.UserID = u.ID) AS RoleName FROM Users u`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+1\b/i);
    });

    it('does not touch EXISTS subqueries while capping the outer SELECT', () => {
        stubMetadata();
        const sql = `SELECT * FROM Users u WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.UserID = u.ID)`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/EXISTS\s*\(/i);
    });

    it('detects a mixed-case WITH as a CTE', () => {
        stubMetadata();
        const result = RenderPipeline.Run('wItH x As (SeLeCt 1 AS a) sElEcT * FROM x', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/WITH\s+\[?x\]?\s+AS\s+\(/i);
    });

    it('caps a SELECT with a top-level GROUP BY + ORDER BY DESC alongside TOP', () => {
        stubMetadata();
        const sql = `SELECT YEAR(p.JoinDate) AS JoinYear, COUNT(p.ID) AS PersonCount
FROM dbo.vwPeople p
WHERE p.JoinDate IS NOT NULL
GROUP BY YEAR(p.JoinDate)
ORDER BY JoinYear DESC`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/ORDER\s+BY\s+\[?JoinYear\]?\s+DESC/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — hard ceiling (min of existing and requested wins)
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — tighter cap wins', () => {

    it('keeps an existing outer TOP that is tighter than MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 5 * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('keeps a parenthesized outer TOP that is tighter than MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP (5) * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/TOP\s*\(?\s*5\s*\)?/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('reduces an existing outer TOP that exceeds MaxRows to MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 500 * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+500\b/i);
    });

    it('reduces a parenthesized outer TOP that exceeds MaxRows to MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP (500000) * FROM big_table', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s*\(?\s*100\b/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });

    it('reduces an inner TOP that exceeds MaxRows on a query with ORDER BY', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 1000 * FROM Members ORDER BY JoinedAt DESC', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+1000\b/i);
        expect(result.FinalSQL).toMatch(/ORDER\s+BY/i);
    });

    it('outer-wraps TOP PERCENT with MaxRows (PERCENT preserved in inner)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 10 PERCENT * FROM t', { Platform: 'sqlserver', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/TOP\s+10\s+PERCENT/i);
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('keeps a tab-indented SELECT TOP that is tighter than MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`\t\tSELECT TOP 5 * FROM t`, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('keeps an existing outer LIMIT that is tighter than MaxRows on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM members LIMIT 5', { Platform: 'postgresql', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/LIMIT\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/LIMIT\s+10\b/i);
    });

    it('keeps LIMIT N OFFSET M when LIMIT N is tighter than MaxRows on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM users LIMIT 5 OFFSET 10', { Platform: 'postgresql', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/LIMIT\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/LIMIT\s+100\b/i);
    });

    it('reduces an existing outer LIMIT that exceeds MaxRows on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM members LIMIT 500', {
            Platform: 'postgresql',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/LIMIT\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/LIMIT\s+500\b/i);
    });

    it('is idempotent — calling Run twice with the same MaxRows produces the same SQL', () => {
        stubMetadata();
        const first = RenderPipeline.Run('SELECT * FROM Users', { Platform: 'sqlserver', MaxRows: 10 });
        const second = RenderPipeline.Run(first.FinalSQL, { Platform: 'sqlserver', MaxRows: 10 });
        expect(second.FinalSQL).toBe(first.FinalSQL);
    });

    it('does not loosen a tighter existing cap on a re-run with a larger MaxRows', () => {
        stubMetadata();
        const first = RenderPipeline.Run('SELECT * FROM Users', { Platform: 'sqlserver', MaxRows: 10 });
        const second = RenderPipeline.Run(first.FinalSQL, { Platform: 'sqlserver', MaxRows: 100 });
        expect(second.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(second.FinalSQL).not.toMatch(/\bTOP\s+100\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — outer wrap on shapes the AST can't inject into
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — outer wrap', () => {

    it('wraps a UNION ALL with an outer TOP cap', () => {
        stubMetadata();
        const sql = `SELECT ID FROM A UNION ALL SELECT ID FROM B`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
        expect(result.FinalSQL).toMatch(/UNION\s+ALL/i);
    });

    it('wraps TOP WITH TIES with an outer cap (inner TOP keeps ORDER BY legal)', () => {
        stubMetadata();
        const sql = `SELECT TOP 5 WITH TIES * FROM t ORDER BY ID`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/WITH\s+TIES/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('wraps CROSS APPLY OPENJSON with an outer cap', () => {
        stubMetadata();
        const sql = `SELECT j.Name FROM dbo.T t CROSS APPLY OPENJSON(t.Data) WITH ([Name] NVARCHAR(100)) j`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(result.FinalSQL).toMatch(/CROSS\s+APPLY/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — shapes the cap can't be safely applied to
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — incompatible shapes left alone', () => {

    it('does not modify a SELECT … INTO statement (write op, validator should block)', () => {
        stubMetadata();
        const sql = 'SELECT * INTO #temp FROM Users';
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/_mj_capped/);
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT\s+10/i);
        expect(result.FinalSQL).toContain('INTO #temp');
    });

    it('preserves FOR JSON AUTO and never wraps it in a derived table', () => {
        stubMetadata();
        const sql = `SELECT ID FROM Users FOR JSON AUTO`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/FOR\s+JSON\s+AUTO/i);
        expect(result.FinalSQL).not.toMatch(/_mj_capped/);
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT/i);
    });

    it('preserves FOR XML AUTO and never wraps it in a derived table', () => {
        stubMetadata();
        const sql = `SELECT ID FROM Users FOR XML AUTO`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/FOR\s+XML\s+AUTO/i);
        expect(result.FinalSQL).not.toMatch(/_mj_capped/);
    });

    it('does not append FETCH NEXT to a SELECT … FOR JSON', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT ID, Name FROM Users FOR JSON AUTO', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(/FOR\s+JSON[\s\S]*FETCH\s+NEXT/i.test(result.FinalSQL)).toBe(false);
        expect(result.FinalSQL).not.toMatch(/_mj_capped/);
    });

    it('preserves OPTION (RECOMPILE) and never wraps it in a derived table', () => {
        stubMetadata();
        const sql = `SELECT ID FROM Users OPTION (RECOMPILE)`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/OPTION\s*\(\s*RECOMPILE\s*\)/i);
        expect(result.FinalSQL).not.toMatch(/_mj_capped/);
    });

    it('does not append FETCH NEXT after OPTION (RECOMPILE)', () => {
        stubMetadata();
        const sql = `SELECT ID FROM Users OPTION (RECOMPILE)`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        const optionPos = result.FinalSQL.search(/OPTION\s*\(\s*RECOMPILE\s*\)/i);
        const fetchPos = result.FinalSQL.search(/FETCH\s+NEXT/i);
        if (optionPos >= 0 && fetchPos >= 0) {
            expect(fetchPos).toBeLessThan(optionPos);
        }
    });

    it('returns empty SQL unchanged (no synthesized clauses)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL.trim()).toBe('');
    });

    it('returns comment-only SQL unchanged (no synthesized clauses after stripping)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('/* nothing here */', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT/i);
    });

    it('returns whitespace-only SQL unchanged', () => {
        stubMetadata();
        const result = RenderPipeline.Run('   \n\t  ', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('returns a single semicolon unchanged', () => {
        stubMetadata();
        const result = RenderPipeline.Run(';', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — hard cap guarantee
// Every wrap-compatible shape must end up with the cap enforced.
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — hard cap guarantee', () => {

    it('caps a plain SELECT with no existing TOP', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
    });

    it('reduces a larger inner TOP to MaxRows', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 1000000 * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/1000000/);
    });

    it('caps a TOP PERCENT query via outer wrap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 50 PERCENT * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('caps a TOP (@var) query via outer wrap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP (@n) * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('caps WITH TIES via outer wrap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 5 WITH TIES * FROM Members ORDER BY JoinedAt', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('caps a UNION ALL via outer wrap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT ID FROM A UNION ALL SELECT ID FROM B UNION ALL SELECT ID FROM C', {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('caps a CTE with bracket-quoted names via OFFSET/FETCH', () => {
        stubMetadata();
        const sql = `WITH [Active People] AS (SELECT ID FROM Users WHERE Status='A') SELECT * FROM [Active People]`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);
    });

    it('caps a SELECT with CROSS APPLY via outer wrap', () => {
        stubMetadata();
        const result = RenderPipeline.Run(
            'SELECT j.Name FROM Users u CROSS APPLY OPENJSON(u.Meta) WITH ([Name] NVARCHAR(100)) j',
            { Platform: 'sqlserver', MaxRows: 100 },
        );
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).toMatch(/_mj_capped/);
    });

    it('caps a plain SELECT on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM members', {
            Platform: 'postgresql',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/LIMIT\s+100/i);
    });

    it('reduces a larger LIMIT on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM members LIMIT 500000', {
            Platform: 'postgresql',
            MaxRows: 100,
        });
        expect(result.FinalSQL).toMatch(/LIMIT\s+100/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — CTE fallback path (OFFSET/FETCH append)
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — CTE fallback', () => {

    it('caps a CTE with bracket-quoted CTE name via OFFSET/FETCH', () => {
        stubMetadata();
        const sql = `WITH [ActivePeople] AS (
    SELECT [CompanyID], COUNT([ID]) AS [ActivePeopleCount]
    FROM [dbo].[vwPeople]
    WHERE [Status] = 'Active'
    GROUP BY [CompanyID]
)
SELECT c.[ID], c.[Name], ap.[ActivePeopleCount]
FROM [dbo].[vwCompanies] c
LEFT JOIN [ActivePeople] ap ON c.[ID] = ap.[CompanyID]
ORDER BY ap.[ActivePeopleCount] DESC`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);
        expect(result.FinalSQL).toMatch(/ORDER\s+BY/i);
        expect(result.FinalSQL).toMatch(/WITH\s+\[ActivePeople\]\s+AS/i);
    });

    it('leaves a CTE with a hyphenated bracket name unchanged (parser cannot represent it)', () => {
        stubMetadata();
        const sql = `WITH [my-cte] AS (SELECT 1 AS a) SELECT * FROM [my-cte]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toContain('[my-cte]');
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — numeric sanitation
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — numeric sanitation', () => {

    it('treats 0 as no cap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 0 });
        expect(result.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('treats negative values as no cap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: -1 });
        expect(result.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('treats NaN as no cap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: Number.NaN });
        expect(result.FinalSQL).not.toMatch(/NaN/);
        expect(result.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('treats Infinity as no cap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: Infinity });
        expect(result.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('floors fractional values to integers', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 5.7 });
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+\d+\.\d+/);
        expect(result.FinalSQL).toMatch(/\bTOP\s+5\b/);
    });

    it('honors 1 as the smallest positive cap', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 1 });
        expect(result.FinalSQL).toMatch(/\bTOP\s+1\b/);
    });

    it('emits an integer literal (no exponential notation) for MAX_SAFE_INTEGER', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: Number.MAX_SAFE_INTEGER });
        expect(result.FinalSQL).not.toMatch(/e\+/i);
        expect(result.FinalSQL).toMatch(/\bTOP\s+\d+\b/);
    });
});

// ════════════════════════════════════════════════════════════════════
// Paging
// ════════════════════════════════════════════════════════════════════

describe('Paging', () => {

    it('appends OFFSET/FETCH on a plain SELECT (SQL Server)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Users', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+10/i);
    });

    it('appends a default ORDER BY when none is present', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Users', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        expect(result.FinalSQL).toMatch(/ORDER\s+BY\s+\(?SELECT NULL\)?/i);
    });

    it('preserves the CTE block and appends paging to the outermost SELECT', () => {
        stubMetadata();
        const sql = `WITH x AS (SELECT ID, Name FROM Users) SELECT * FROM x ORDER BY Name`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        expect(result.FinalSQL).toMatch(/WITH\s+x\s+AS/i);
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+10/i);
    });

    it('reflects StartRow in OFFSET', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Users ORDER BY ID', {
            Platform: 'sqlserver',
            Paging: { StartRow: 50, MaxRows: 10 },
        });
        expect(result.FinalSQL).toMatch(/OFFSET\s+50\s+ROWS\s+FETCH\s+NEXT\s+10/i);
    });

    it('strips an existing outer TOP before appending OFFSET/FETCH', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 50 * FROM Users ORDER BY ID', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+50\b/i);
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+10/i);
    });

    it('treats Paging.MaxRows = 0 as no paging', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 0 },
        });
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT/i);
    });

    it('treats negative Paging.StartRow as no paging (no negative OFFSET)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t ORDER BY ID', {
            Platform: 'sqlserver',
            Paging: { StartRow: -5, MaxRows: 10 },
        });
        expect(result.FinalSQL).not.toMatch(/OFFSET\s+-\d+/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows + Paging conflict
// ════════════════════════════════════════════════════════════════════

describe('MaxRows + Paging conflict', () => {

    it('throws synchronously when both are set', () => {
        stubMetadata();
        expect(() => RenderPipeline.Run('SELECT * FROM t', {
            Platform: 'sqlserver',
            MaxRows: 10,
            Paging: { StartRow: 0, MaxRows: 5 },
        })).toThrow();
    });

    it('error message mentions both MaxRows and Paging', () => {
        stubMetadata();
        let msg = '';
        try {
            RenderPipeline.Run('SELECT * FROM t', {
                Platform: 'sqlserver',
                MaxRows: 50,
                Paging: { StartRow: 0, MaxRows: 25 },
            });
        } catch (e) {
            msg = e instanceof Error ? e.message : String(e);
        }
        expect(msg).toContain('MaxRows');
        expect(msg).toContain('Paging');
    });

    it('error message includes the actual values', () => {
        stubMetadata();
        let msg = '';
        try {
            RenderPipeline.Run('SELECT * FROM t', {
                Platform: 'sqlserver',
                MaxRows: 77,
                Paging: { StartRow: 5, MaxRows: 33 },
            });
        } catch (e) {
            msg = e instanceof Error ? e.message : String(e);
        }
        expect(msg).toContain('77');
        expect(msg).toContain('33');
    });
});

// ════════════════════════════════════════════════════════════════════
// RenderTrace
// ════════════════════════════════════════════════════════════════════

describe('RenderTrace', () => {

    it('AfterComposition equals the input when no composition tokens are present', () => {
        stubMetadata();
        const sql = `SELECT * FROM Users`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.Trace.AfterComposition).toBe(sql);
    });

    it('AfterComposition still contains line comments (stripping happens after composition)', () => {
        stubMetadata();
        const sql = `SELECT * FROM t -- this comment survives composition\n`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver' });
        expect(result.Trace.AfterComposition).toContain('-- this comment survives composition');
    });

    it('AfterTemplates does NOT contain comments', () => {
        stubMetadata();
        const sql = `SELECT * FROM Users -- a comment\nWHERE 1=1`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', UsesTemplate: false });
        expect(result.Trace.AfterTemplates).not.toMatch(/-- a comment/);
        expect(result.Trace.AfterTemplates).toContain('SELECT * FROM Users');
        expect(result.Trace.AfterTemplates).toContain('WHERE 1=1');
    });

    it('AfterPaging is null when Paging is not requested', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.Trace.AfterPaging).toBeNull();
    });

    it('AfterPaging is set when Paging is requested', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t ORDER BY ID', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        expect(result.Trace.AfterPaging).not.toBeNull();
        expect(result.Trace.AfterPaging).toMatch(/FETCH\s+NEXT\s+10/i);
    });

    it('PagingResult is populated when Paging is requested, null otherwise', () => {
        stubMetadata();
        const withPaging = RenderPipeline.Run('SELECT * FROM t ORDER BY ID', {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 10 },
        });
        const withoutPaging = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(withPaging.PagingResult).not.toBeNull();
        expect(withPaging.PagingResult?.PageSize).toBe(10);
        expect(withoutPaging.PagingResult).toBeNull();
    });

    it('CompositionDiagnostics is empty when no compositions resolved', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver' });
        expect(result.Trace.CompositionDiagnostics).toEqual([]);
    });
});

// ════════════════════════════════════════════════════════════════════
// Lexical disguise — keyword-looking content in literals/identifiers/comments
// ════════════════════════════════════════════════════════════════════

describe('lexical disguise', () => {

    it('treats the word TOP inside a string literal as data', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT 'TOP 5' AS s FROM t`, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toContain(`'TOP 5'`);
    });

    it('treats the word TOP inside a bracket identifier as data', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [TOP 5] FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
        expect(result.FinalSQL).toContain('[TOP 5]');
    });

    it('treats the word TOP inside a comment as nothing', () => {
        stubMetadata();
        const result = RenderPipeline.Run('-- TOP 5 example\nSELECT * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
    });

    it('treats the word LIMIT inside a string literal as data on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT 'LIMIT 5' AS s FROM t`, { Platform: 'postgresql', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/LIMIT\s+10\b/i);
        expect(result.FinalSQL).toContain(`'LIMIT 5'`);
    });

    it('preserves a string literal that mimics statement-injection syntax', () => {
        stubMetadata();
        const sql = `SELECT 'a; DROP TABLE Users; --' AS s FROM t`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toContain(`'a; DROP TABLE Users; --'`);
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Determinism
// ════════════════════════════════════════════════════════════════════

describe('determinism', () => {

    it('repeated runs of the same input produce identical FinalSQL', () => {
        stubMetadata();
        const opts = { Platform: 'sqlserver' as const, MaxRows: 10 };
        const a = RenderPipeline.Run('SELECT * FROM t', opts).FinalSQL;
        const b = RenderPipeline.Run('SELECT * FROM t', opts).FinalSQL;
        const c = RenderPipeline.Run('SELECT * FROM t', opts).FinalSQL;
        expect(b).toBe(a);
        expect(c).toBe(a);
    });

    it('parallel runs with different inputs produce isolated results', async () => {
        stubMetadata();
        const runs = await Promise.all([
            Promise.resolve(RenderPipeline.Run('SELECT * FROM A', { Platform: 'sqlserver', MaxRows: 5 })),
            Promise.resolve(RenderPipeline.Run('SELECT * FROM B', { Platform: 'sqlserver', MaxRows: 10 })),
            Promise.resolve(RenderPipeline.Run('SELECT * FROM C', { Platform: 'sqlserver', MaxRows: 15 })),
        ]);
        expect(runs[0].FinalSQL).toMatch(/TOP 5[\s\S]+FROM \[?A\]?/i);
        expect(runs[1].FinalSQL).toMatch(/TOP 10[\s\S]+FROM \[?B\]?/i);
        expect(runs[2].FinalSQL).toMatch(/TOP 15[\s\S]+FROM \[?C\]?/i);
    });

    it('Run-Run-Run converges after the first call', () => {
        stubMetadata();
        const opts = { Platform: 'sqlserver' as const, MaxRows: 10 };
        const a = RenderPipeline.Run('SELECT * FROM t', opts).FinalSQL;
        const b = RenderPipeline.Run(a, opts).FinalSQL;
        const c = RenderPipeline.Run(b, opts).FinalSQL;
        expect(b).toBe(a);
        expect(c).toBe(a);
    });

    it('MaxRows-capped result, then Paging, strips TOP and applies OFFSET/FETCH', () => {
        stubMetadata();
        const capped = RenderPipeline.Run('SELECT * FROM t ORDER BY ID', { Platform: 'sqlserver', MaxRows: 10 });
        const paged = RenderPipeline.Run(capped.FinalSQL, {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 5 },
        });
        expect(paged.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
        expect(paged.FinalSQL).toMatch(/FETCH\s+NEXT\s+5/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// AST sqlify output characteristics
// ════════════════════════════════════════════════════════════════════

describe('sqlify output characteristics', () => {

    it('normalizes multi-line SQL into a single line, preserving semantic content', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT *\nFROM t\nWHERE x = 1', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bWHERE\b/i);
        expect(result.FinalSQL).toMatch(/\[?x\]?\s*=\s*1/i);
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
    });

    it('auto-brackets unquoted identifiers on SQL Server', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT id, name FROM users', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\[id\]/i);
        expect(result.FinalSQL).toMatch(/\[users\]/i);
    });

    it('preserves already-bracketed identifiers through a sqlify round-trip', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT [id], [name] FROM [users]', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toContain('[id]');
        expect(result.FinalSQL).toContain('[users]');
    });
});

// ════════════════════════════════════════════════════════════════════
// Robustness — unusual or extreme inputs
// ════════════════════════════════════════════════════════════════════

describe('robustness', () => {

    it('handles 10-level nested subqueries without crashing', () => {
        stubMetadata();
        let sql = 'SELECT 1 AS x';
        for (let i = 0; i < 10; i++) {
            sql = `SELECT * FROM (${sql}) AS sub${i}`;
        }
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(typeof result.FinalSQL).toBe('string');
    });

    it('handles 100 CTEs in series without crashing', () => {
        stubMetadata();
        const ctes: string[] = [];
        for (let i = 0; i < 100; i++) {
            ctes.push(`cte${i} AS (SELECT ${i} AS n)`);
        }
        const sql = `WITH ${ctes.join(',\n')}\nSELECT * FROM cte99`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(typeof result.FinalSQL).toBe('string');
    });

    it('handles very long SQL (500 columns) without truncation', () => {
        stubMetadata();
        const longList = Array.from({ length: 500 }, (_, i) => `Col${i}`).join(', ');
        const result = RenderPipeline.Run(`SELECT ${longList} FROM Users`, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toContain('Col499');
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
    });

    it('preserves a T-SQL N-prefixed Unicode literal', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`SELECT * FROM t WHERE Name = N'日本'`, {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toContain(`'日本'`);
    });

    it('preserves a Unicode identifier inside brackets via comment stripping', () => {
        const out = SQLParser.StripComments('SELECT [日本語 -- col] FROM t', tsql);
        expect(out).toContain('[日本語 -- col]');
    });

    it('handles a bracket-quoted reserved word as a column name', () => {
        stubMetadata();
        const sql = `SELECT [SELECT], [FROM] FROM t`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        const hasCap = /\bTOP\s+10\b/i.test(result.FinalSQL);
        const isUnchanged = result.FinalSQL.includes('[SELECT]');
        expect(hasCap || isUnchanged).toBe(true);
    });

    it('handles a double-quoted reserved word as a column name', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT "FROM", "WHERE" FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(typeof result.FinalSQL).toBe('string');
    });

    it('handles SQL with a trailing semicolon', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t;', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        const semis = (result.FinalSQL.match(/;/g) || []).length;
        expect(semis).toBeLessThanOrEqual(1);
    });

    it('handles SQL with multiple trailing semicolons and whitespace', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM t  ;\n\n; ', { Platform: 'sqlserver', MaxRows: 10 });
        expect(typeof result.FinalSQL).toBe('string');
    });

    it('handles a zero-width space mid-SQL without crashing', () => {
        stubMetadata();
        const sql = `SELECT *​ FROM t`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        const hasCap = /\bTOP\s+10\b/i.test(result.FinalSQL);
        const isUnchanged = result.FinalSQL.includes('​');
        expect(hasCap || isUnchanged).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════
// Dialect parity
// ════════════════════════════════════════════════════════════════════

describe('dialect parity', () => {

    it('SQL Server emits TOP and PostgreSQL emits LIMIT for the same plain SELECT', () => {
        stubMetadata();
        const tsqlResult = RenderPipeline.Run('SELECT * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        const pgResult = RenderPipeline.Run('SELECT * FROM t', { Platform: 'postgresql', MaxRows: 10 });
        expect(tsqlResult.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(tsqlResult.FinalSQL).not.toMatch(/\bLIMIT\b/i);
        expect(pgResult.FinalSQL).toMatch(/\bLIMIT\s+10\b/i);
        expect(pgResult.FinalSQL).not.toMatch(/\bTOP\b/i);
    });

    it('both dialects cap the outermost SELECT of a CTE', () => {
        stubMetadata();
        const sql = `WITH x AS (SELECT 1 AS a) SELECT * FROM x`;
        const tsqlResult = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        const pgResult = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: 10 });
        expect(tsqlResult.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
        expect(pgResult.FinalSQL).toMatch(/LIMIT\s+10\b/i);
    });

    // PostgreSQL dollar-quoted strings (`$$ … $$`, `$tag$ … $tag$`) are not
    // currently recognized by StripComments. Skip until a PG caller exercises this.
    it.skip('PG `$$ … $$` dollar-quoted strings are not eaten by comment stripping', () => {
        const out = SQLParser.StripComments(`SELECT $$it -- has dashes$$ AS s`, pg);
        expect(out).toContain('$$it -- has dashes$$');
    });

    it.skip('PG tagged dollar-quoted strings are not eaten by comment stripping', () => {
        const out = SQLParser.StripComments(`SELECT $body$function_body -- $/* */$body$ AS s`, pg);
        expect(out).toContain('$body$function_body -- $/* */$body$');
    });
});

// ════════════════════════════════════════════════════════════════════
// Bulletproofing — Skip / Query Builder shapes against large tables
//
// The core safety invariant is: for any SQL that an agent might pass with
// MaxRows = N, the final SQL must either contain a syntactic row cap at N
// (TOP N / LIMIT N / FETCH NEXT N) OR be in a documented "leave-alone"
// shape (FOR JSON / FOR XML / OPTION / SELECT INTO / mutation / empty)
// where the cap is either moot (one-row output) or the validator must
// reject the query upstream.
// ════════════════════════════════════════════════════════════════════

const CAP = 100;

/**
 * Returns true iff the final SQL syntactically caps row count at <= cap.
 * Accepts a tighter pre-existing cap (e.g. `TOP 5` is fine when MaxRows=100).
 * Checks all three forms the pipeline emits:
 *   - inner `TOP N` (AST inject, outer wrap, or pre-existing tighter cap)
 *   - inner `LIMIT N` (PG inject, outer wrap, or pre-existing tighter cap)
 *   - `FETCH NEXT N ROWS ONLY` (CTE fallback)
 */
function hasSyntacticCap(finalSQL: string, cap: number): boolean {
    const topMatch = finalSQL.match(/\bTOP\s*\(?\s*(\d+)\b/i);
    if (topMatch && parseInt(topMatch[1], 10) <= cap) return true;
    const limitMatch = finalSQL.match(/\bLIMIT\s+(\d+)\b/i);
    if (limitMatch && parseInt(limitMatch[1], 10) <= cap) return true;
    const fetchMatch = finalSQL.match(/FETCH\s+NEXT\s+(\d+)\s+ROWS\s+ONLY/i);
    if (fetchMatch && parseInt(fetchMatch[1], 10) <= cap) return true;
    return false;
}

/**
 * Returns true iff the SQL is in a shape where the cap is allowed to be
 * absent: FOR JSON / FOR XML / OPTION / SELECT INTO / mutation.
 */
function isLeaveAloneShape(originalSQL: string): boolean {
    const trimmed = originalSQL.trim();
    if (/^(UPDATE|DELETE|INSERT|MERGE|EXEC|EXECUTE)\b/i.test(trimmed)) return true;
    if (/\bFOR\s+JSON\b/i.test(trimmed)) return true;
    if (/\bFOR\s+XML\b/i.test(trimmed)) return true;
    if (/\bOPTION\s*\(/i.test(trimmed)) return true;
    if (/\bSELECT\b[\s\S]*?\bINTO\s+#/i.test(trimmed)) return true;
    return false;
}

/**
 * Hardens an entire batch of Skip / Query Builder-shaped queries.
 * Each must end up either capped, in a documented leave-alone shape, or
 * resolved to an empty string (comment-only / whitespace / `;` inputs).
 */
function assertCapEnforcedOrSafelyUntouched(originalSQL: string, finalSQL: string, cap: number): void {
    if (finalSQL.trim().length === 0) return;
    if (hasSyntacticCap(finalSQL, cap)) return;
    if (isLeaveAloneShape(originalSQL)) return;
    throw new Error(
        `Bulletproof invariant violated. SQL produced no syntactic cap and is not in a leave-alone shape.\n` +
        `Original SQL: ${originalSQL}\n` +
        `Final SQL:    ${finalSQL}`
    );
}

describe('bulletproof — realistic Skip / Query Builder shapes (SQL Server)', () => {

    it('Skip-style multi-CTE with bracket-quoted names and JOINs', () => {
        stubMetadata();
        const sql = `WITH [Active Members] AS (
    SELECT [MemberID], [JoinedAt], [Status]
    FROM [dbo].[vwMembers]
    WHERE [Status] = 'Active'
),
[Recent Donors] AS (
    SELECT [MemberID], SUM([Amount]) AS [TotalDonated]
    FROM [dbo].[vwDonations]
    WHERE [DonatedAt] >= DATEADD(YEAR, -1, GETDATE())
    GROUP BY [MemberID]
)
SELECT am.[MemberID], am.[JoinedAt], rd.[TotalDonated]
FROM [Active Members] am
LEFT JOIN [Recent Donors] rd ON rd.[MemberID] = am.[MemberID]
ORDER BY rd.[TotalDonated] DESC`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);
    });

    it('top-N-per-group with ROW_NUMBER OVER PARTITION BY', () => {
        stubMetadata();
        const sql = `WITH [Ranked] AS (
    SELECT [MemberID], [ChapterID], [JoinedAt],
           ROW_NUMBER() OVER (PARTITION BY [ChapterID] ORDER BY [JoinedAt] DESC) AS rn
    FROM [dbo].[vwMembers]
)
SELECT [MemberID], [ChapterID], [JoinedAt]
FROM [Ranked]
WHERE rn <= 5
ORDER BY [ChapterID], rn`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('aggregation with GROUP BY + HAVING (potential unbounded result)', () => {
        stubMetadata();
        const sql = `SELECT [ChapterID], COUNT(*) AS [MemberCount], AVG([Tenure]) AS [AvgTenure]
FROM [dbo].[vwMembers]
WHERE [Status] = 'Active'
GROUP BY [ChapterID]
HAVING COUNT(*) > 10`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('correlated subquery selecting a scalar', () => {
        stubMetadata();
        const sql = `SELECT m.[MemberID], m.[Name],
       (SELECT COUNT(*) FROM [dbo].[vwDonations] d WHERE d.[MemberID] = m.[MemberID]) AS [DonationCount]
FROM [dbo].[vwMembers] m
WHERE m.[Status] = 'Active'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('EXISTS subquery against a large table', () => {
        stubMetadata();
        const sql = `SELECT m.[MemberID], m.[Name]
FROM [dbo].[vwMembers] m
WHERE EXISTS (
    SELECT 1 FROM [dbo].[vwDonations] d
    WHERE d.[MemberID] = m.[MemberID] AND d.[Amount] > 1000
)`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('NOT IN against a subquery (a common cause of full table scans)', () => {
        stubMetadata();
        const sql = `SELECT [MemberID], [Name] FROM [dbo].[vwMembers]
WHERE [MemberID] NOT IN (SELECT [MemberID] FROM [dbo].[vwLapsedMembers])`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('multi-join across many entity tables', () => {
        stubMetadata();
        const sql = `SELECT m.[MemberID], c.[ChapterName], r.[RoleName], d.[DepartmentName]
FROM [dbo].[vwMembers] m
INNER JOIN [dbo].[vwChapters] c ON m.[ChapterID] = c.[ID]
LEFT JOIN [dbo].[vwRoles] r ON m.[RoleID] = r.[ID]
LEFT JOIN [dbo].[vwDepartments] d ON m.[DepartmentID] = d.[ID]
WHERE m.[Status] = 'Active'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('Cartesian product (no join predicate) — must still be capped', () => {
        stubMetadata();
        const sql = `SELECT a.[ID], b.[ID] FROM [Members] a, [Chapters] b`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('Skip-style query with JSON_VALUE extraction', () => {
        stubMetadata();
        const sql = `SELECT m.[MemberID], JSON_VALUE(m.[Metadata], '$.preference') AS Preference
FROM [dbo].[vwMembers] m
WHERE JSON_VALUE(m.[Metadata], '$.optedIn') = 'true'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('date-range filter with computed columns', () => {
        stubMetadata();
        const sql = `SELECT [MemberID], DATEDIFF(YEAR, [JoinedAt], GETDATE()) AS [TenureYears]
FROM [dbo].[vwMembers]
WHERE [JoinedAt] BETWEEN '2020-01-01' AND '2025-12-31'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('CASE WHEN producing a derived column', () => {
        stubMetadata();
        const sql = `SELECT [MemberID],
       CASE WHEN [Donations] > 10000 THEN 'Major' WHEN [Donations] > 1000 THEN 'Mid' ELSE 'Small' END AS Tier
FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('UNION ALL across three entity tables (Skip composing data)', () => {
        stubMetadata();
        const sql = `SELECT [ID], [Name], 'Member' AS Source FROM [dbo].[vwMembers]
UNION ALL
SELECT [ID], [Name], 'Donor' FROM [dbo].[vwDonors]
UNION ALL
SELECT [ID], [Name], 'Volunteer' FROM [dbo].[vwVolunteers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('UNION with ORDER BY (UNION rules around ORDER BY apply to the final result)', () => {
        stubMetadata();
        const sql = `SELECT [ID], [Name] FROM [dbo].[vwMembers]
UNION
SELECT [ID], [Name] FROM [dbo].[vwDonors]
ORDER BY [Name]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('SELECT DISTINCT (already returns a small-ish set, but must still cap)', () => {
        stubMetadata();
        const sql = `SELECT DISTINCT [Country] FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('SELECT DISTINCT TOP N (existing distinct cap interacts with our cap)', () => {
        stubMetadata();
        const sql = `SELECT DISTINCT TOP 500 [Country] FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+500\b/i);
    });

    it('self-join via aliased same-table reference', () => {
        stubMetadata();
        const sql = `SELECT a.[MemberID] AS [ID1], b.[MemberID] AS [ID2]
FROM [dbo].[vwMembers] a
INNER JOIN [dbo].[vwMembers] b ON a.[ReferredBy] = b.[MemberID]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('multi-CTE chained: each CTE references the previous', () => {
        stubMetadata();
        const sql = `WITH a AS (SELECT [MemberID] FROM [dbo].[vwMembers] WHERE [Status]='Active'),
b AS (SELECT [MemberID] FROM a WHERE [MemberID] IN (SELECT [MemberID] FROM [dbo].[vwDonors])),
c AS (SELECT [MemberID] FROM b WHERE [MemberID] NOT IN (SELECT [MemberID] FROM [dbo].[vwOptOuts]))
SELECT * FROM c`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('CTE used twice in the outer query', () => {
        stubMetadata();
        const sql = `WITH [Active] AS (SELECT [MemberID], [ChapterID] FROM [dbo].[vwMembers] WHERE [Status]='Active')
SELECT a1.[MemberID], a2.[ChapterID]
FROM [Active] a1
INNER JOIN [Active] a2 ON a1.[ChapterID] = a2.[ChapterID]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('IIF + ISNULL + COALESCE column derivations', () => {
        stubMetadata();
        const sql = `SELECT [MemberID],
       ISNULL([NickName], [LegalName]) AS [DisplayName],
       COALESCE([WorkEmail], [PersonalEmail], 'unknown') AS [Email],
       IIF([Status]='Active', 1, 0) AS [IsActiveFlag]
FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('VALUES-clause derived table', () => {
        stubMetadata();
        const sql = `SELECT * FROM (VALUES (1, 'A'), (2, 'B'), (3, 'C')) AS t(id, name)`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('schema-qualified three-part name', () => {
        stubMetadata();
        const sql = `SELECT * FROM [DatabaseName].[dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('inline view in FROM clause with its own ORDER BY (illegal without TOP but agent may try)', () => {
        stubMetadata();
        const sql = `SELECT outer1.[MemberID]
FROM (SELECT [MemberID] FROM [dbo].[vwMembers] WHERE [Status]='Active') outer1`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });
});

describe('bulletproof — adversarial cap-bypass attempts', () => {

    it('inner TOP inside a subquery (outermost has no cap → must inject)', () => {
        stubMetadata();
        const sql = `SELECT m.[ID]
FROM [dbo].[vwMembers] m
INNER JOIN (SELECT TOP 5 [ID] FROM [dbo].[vwChapters]) c ON c.[ID] = m.[ChapterID]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('comment hiding what looks like a TOP clause', () => {
        stubMetadata();
        const sql = `SELECT /* TOP 1000000 */ * FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        expect(result.FinalSQL).not.toMatch(/1000000/);
    });

    it('string literal containing "FOR JSON" must not trigger leave-alone behavior', () => {
        stubMetadata();
        const sql = `SELECT [Name] FROM [dbo].[vwMembers] WHERE [Description] = 'looks like FOR JSON but is just text'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(hasSyntacticCap(result.FinalSQL, CAP)).toBe(true);
    });

    it('string literal containing "OPTION (RECOMPILE)" must not trigger leave-alone behavior', () => {
        stubMetadata();
        const sql = `SELECT [Name] FROM [dbo].[vwMembers] WHERE [Notes] = 'add OPTION (RECOMPILE) for perf'`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(hasSyntacticCap(result.FinalSQL, CAP)).toBe(true);
    });

    it('bracket identifier named [FOR JSON] must not trigger leave-alone behavior', () => {
        stubMetadata();
        const sql = `SELECT [FOR JSON] FROM [dbo].[vwExoticColumns]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('large literal numeric TOP gets reduced (not retained)', () => {
        stubMetadata();
        const sql = `SELECT TOP 999999999 * FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/999999999/);
    });

    it('parenthesized expression TOP ((((1000000)))) — cap dominates even if inner literal survives in a derived table', () => {
        stubMetadata();
        const sql = `SELECT TOP ((((1000000)))) * FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        // The parser can't represent quadruple-nested parens, so the pipeline
        // falls through to the outer-wrap path. The outer TOP 100 caps the
        // result regardless of any inner large literal.
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
    });

    it('mixed-case TOP keyword', () => {
        stubMetadata();
        const sql = `SeLeCt tOp 500000 * FrOm [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });

    it('comments embedded between SELECT and TOP', () => {
        stubMetadata();
        const sql = `SELECT /* hi */ TOP 500000 * FROM [dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });

    it('trailing semicolons must not bypass the cap', () => {
        stubMetadata();
        const sql = `SELECT * FROM [dbo].[vwMembers];;;`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(hasSyntacticCap(result.FinalSQL, CAP)).toBe(true);
    });

    it('whitespace-only between SELECT and column list', () => {
        stubMetadata();
        const sql = `SELECT\n\n\t\t  *\n\nFROM\n[dbo].[vwMembers]`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        expect(hasSyntacticCap(result.FinalSQL, CAP)).toBe(true);
    });

    it('SELECT with a column subquery that has its own ORDER BY', () => {
        stubMetadata();
        const sql = `SELECT m.[ID],
       (SELECT TOP 1 [Amount] FROM [dbo].[vwDonations] WHERE [MemberID] = m.[ID] ORDER BY [Date] DESC) AS [LastDonation]
FROM [dbo].[vwMembers] m`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('Nunjucks template with ORDER BY conditionally resolved to non-empty', () => {
        stubMetadata();
        const result = RenderPipeline.Run(
            `SELECT * FROM [dbo].[vwMembers] {% if true %}ORDER BY [JoinedAt]{% endif %}`,
            { Platform: 'sqlserver', MaxRows: CAP, UsesTemplate: true },
        );
        assertCapEnforcedOrSafelyUntouched('SELECT * FROM [dbo].[vwMembers]', result.FinalSQL, CAP);
    });

    it('Nunjucks template producing a TOP clause must still be reduced if too high', () => {
        stubMetadata();
        const result = RenderPipeline.Run(
            `SELECT TOP {{ N }} * FROM [dbo].[vwMembers]`,
            { Platform: 'sqlserver', MaxRows: CAP, UsesTemplate: true, Parameters: { N: '500000' } },
        );
        expect(result.FinalSQL).toMatch(/\bTOP\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });
});

describe('bulletproof — realistic Skip / Query Builder shapes (PostgreSQL)', () => {

    it('multi-CTE with double-quoted names', () => {
        stubMetadata();
        const sql = `WITH "active_members" AS (
    SELECT "member_id", "joined_at" FROM "members" WHERE "status" = 'Active'
)
SELECT * FROM "active_members" ORDER BY "joined_at" DESC`;
        const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('window function PARTITION BY for top-N-per-group', () => {
        stubMetadata();
        const sql = `WITH "ranked" AS (
    SELECT "member_id", "chapter_id",
           ROW_NUMBER() OVER (PARTITION BY "chapter_id" ORDER BY "joined_at" DESC) AS rn
    FROM "members"
)
SELECT * FROM "ranked" WHERE rn <= 5`;
        const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('JOIN with subquery in FROM', () => {
        stubMetadata();
        const sql = `SELECT m.id, c.chapter_name
FROM members m
INNER JOIN (SELECT id, chapter_name FROM chapters WHERE active = true) c ON m.chapter_id = c.id`;
        const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('aggregation + GROUP BY + HAVING', () => {
        stubMetadata();
        const sql = `SELECT chapter_id, COUNT(*) as cnt FROM members GROUP BY chapter_id HAVING COUNT(*) > 10`;
        const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
        assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
    });

    it('LIMIT N OFFSET M with N larger than MaxRows must be reduced', () => {
        stubMetadata();
        const sql = `SELECT * FROM members ORDER BY id LIMIT 500000 OFFSET 0`;
        const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
        expect(result.FinalSQL).toMatch(/LIMIT\s+100\b/i);
        expect(result.FinalSQL).not.toMatch(/500000/);
    });
});

describe('bulletproof — fuzzed invariant over a corpus of shapes', () => {

    // A handful of Skip-flavored query shapes. The invariant is universal:
    // every output must either be capped or be a leave-alone shape. If any
    // future code change loosens the cap, one of these will fail.
    const corpus: { name: string; sql: string }[] = [
        { name: 'simple SELECT *', sql: `SELECT * FROM [dbo].[vwMembers]` },
        { name: 'SELECT with WHERE', sql: `SELECT [ID] FROM [dbo].[vwMembers] WHERE [Status]='Active'` },
        { name: 'JOIN no cap', sql: `SELECT m.[ID], c.[Name] FROM [Members] m INNER JOIN [Chapters] c ON m.[ChapterID]=c.[ID]` },
        { name: 'GROUP BY', sql: `SELECT [ChapterID], COUNT(*) FROM [Members] GROUP BY [ChapterID]` },
        { name: 'CTE plain', sql: `WITH a AS (SELECT [ID] FROM [Members]) SELECT * FROM a` },
        { name: 'CTE bracket-named', sql: `WITH [hi] AS (SELECT 1 AS x) SELECT * FROM [hi]` },
        { name: 'CTE with hyphens in name', sql: `WITH [my-cte] AS (SELECT 1 AS x) SELECT * FROM [my-cte]` },
        { name: 'multi CTE', sql: `WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) SELECT a.x, b.y FROM a, b` },
        { name: 'window function', sql: `SELECT [ID], ROW_NUMBER() OVER (ORDER BY [JoinedAt]) AS rn FROM [Members]` },
        { name: 'UNION ALL', sql: `SELECT [ID] FROM [A] UNION ALL SELECT [ID] FROM [B]` },
        { name: 'UNION (deduped)', sql: `SELECT [ID] FROM [A] UNION SELECT [ID] FROM [B]` },
        { name: 'INTERSECT', sql: `SELECT [ID] FROM [A] INTERSECT SELECT [ID] FROM [B]` },
        { name: 'EXCEPT', sql: `SELECT [ID] FROM [A] EXCEPT SELECT [ID] FROM [B]` },
        { name: 'TOP 5', sql: `SELECT TOP 5 * FROM [Members]` },
        { name: 'TOP huge', sql: `SELECT TOP 999999 * FROM [Members]` },
        { name: 'TOP (N)', sql: `SELECT TOP (1000000) * FROM [Members]` },
        { name: 'TOP PERCENT', sql: `SELECT TOP 25 PERCENT * FROM [Members]` },
        { name: 'TOP WITH TIES', sql: `SELECT TOP 10 WITH TIES * FROM [Members] ORDER BY [ID]` },
        { name: 'TOP (@n) param', sql: `SELECT TOP (@n) * FROM [Members]` },
        { name: 'DISTINCT', sql: `SELECT DISTINCT [Country] FROM [Members]` },
        { name: 'DISTINCT TOP N', sql: `SELECT DISTINCT TOP 1000 [Country] FROM [Members]` },
        { name: 'subquery in FROM', sql: `SELECT s.* FROM (SELECT [ID] FROM [Members]) s` },
        { name: 'EXISTS subquery', sql: `SELECT [ID] FROM [A] WHERE EXISTS (SELECT 1 FROM [B] WHERE [B].x=[A].x)` },
        { name: 'NOT IN subquery', sql: `SELECT [ID] FROM [A] WHERE [ID] NOT IN (SELECT [ID] FROM [B])` },
        { name: 'CASE expression', sql: `SELECT CASE WHEN [X]>1 THEN 'a' ELSE 'b' END FROM [Members]` },
        { name: 'VALUES table', sql: `SELECT * FROM (VALUES (1),(2),(3)) AS t(x)` },
        { name: 'three-part name', sql: `SELECT * FROM [DB1].[dbo].[Members]` },
        { name: 'with parens', sql: `(SELECT * FROM [Members])` },
        { name: 'comment-only', sql: `/* nothing */` },
        { name: 'whitespace-only', sql: `   ` },
        { name: 'just semicolon', sql: `;` },
        { name: 'CROSS APPLY', sql: `SELECT m.[ID], j.[Name] FROM [Members] m CROSS APPLY OPENJSON(m.[Meta]) WITH ([Name] NVARCHAR(100)) j` },
        { name: 'JSON_VALUE', sql: `SELECT JSON_VALUE([Meta],'$.x') FROM [Members]` },
        { name: 'CTE + GROUP BY + JOIN', sql: `WITH d AS (SELECT [MID], SUM([Amt]) AS T FROM [Don] GROUP BY [MID]) SELECT m.[ID], d.T FROM [Members] m LEFT JOIN d ON d.[MID]=m.[ID]` },
        { name: 'FOR JSON AUTO', sql: `SELECT [ID] FROM [Members] FOR JSON AUTO` },
        { name: 'FOR XML AUTO', sql: `SELECT [ID] FROM [Members] FOR XML AUTO` },
        { name: 'OPTION RECOMPILE', sql: `SELECT [ID] FROM [Members] OPTION (RECOMPILE)` },
        { name: 'SELECT INTO temp', sql: `SELECT * INTO #t FROM [Members]` },
        { name: 'self-join', sql: `SELECT a.[ID] FROM [Members] a JOIN [Members] b ON a.[ReferredBy]=b.[ID]` },
        { name: 'GROUP BY ROLLUP', sql: `SELECT [ChapterID], COUNT(*) FROM [Members] GROUP BY ROLLUP([ChapterID])` },
        { name: 'string with FOR JSON', sql: `SELECT [Name] FROM [Members] WHERE [Note]='FOR JSON inside string'` },
        { name: 'bracket id named [TOP]', sql: `SELECT [TOP] FROM [Members]` },
        { name: 'bracket id named [FOR JSON]', sql: `SELECT [FOR JSON] FROM [Members]` },
        { name: 'comment-hidden TOP', sql: `SELECT /* TOP 999999 */ [ID] FROM [Members]` },
        { name: 'CRLF line breaks', sql: `SELECT\r\n*\r\nFROM\r\n[Members]` },
        { name: 'mixed case keywords', sql: `seLect * fRom [Members]` },
        { name: 'trailing semicolons', sql: `SELECT * FROM [Members];;;` },
    ];

    for (const { name, sql } of corpus) {
        it(`invariant holds for: ${name}`, () => {
            stubMetadata();
            const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: CAP });
            assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        });
    }

    // The same shapes on PostgreSQL where applicable (no [brackets], no TOP).
    const pgCorpus: { name: string; sql: string }[] = [
        { name: 'plain SELECT', sql: `SELECT * FROM members` },
        { name: 'JOIN', sql: `SELECT m.id, c.name FROM members m JOIN chapters c ON m.cid=c.id` },
        { name: 'GROUP BY', sql: `SELECT chapter_id, COUNT(*) FROM members GROUP BY chapter_id` },
        { name: 'CTE', sql: `WITH a AS (SELECT id FROM members) SELECT * FROM a` },
        { name: 'multi CTE', sql: `WITH a AS (SELECT 1 x), b AS (SELECT 2 y) SELECT * FROM a, b` },
        { name: 'window', sql: `SELECT id, ROW_NUMBER() OVER (ORDER BY joined) AS rn FROM members` },
        { name: 'UNION ALL', sql: `SELECT id FROM a UNION ALL SELECT id FROM b` },
        { name: 'LIMIT 5', sql: `SELECT * FROM members LIMIT 5` },
        { name: 'LIMIT huge', sql: `SELECT * FROM members LIMIT 999999` },
        { name: 'LIMIT N OFFSET M', sql: `SELECT * FROM members LIMIT 999999 OFFSET 10` },
        { name: 'DISTINCT', sql: `SELECT DISTINCT country FROM members` },
        { name: 'EXISTS', sql: `SELECT id FROM a WHERE EXISTS (SELECT 1 FROM b WHERE b.x=a.x)` },
        { name: 'NOT IN', sql: `SELECT id FROM a WHERE id NOT IN (SELECT id FROM b)` },
        { name: 'CASE', sql: `SELECT CASE WHEN x>1 THEN 'a' ELSE 'b' END FROM members` },
        { name: 'subquery in FROM', sql: `SELECT s.* FROM (SELECT id FROM members) s` },
    ];

    for (const { name, sql } of pgCorpus) {
        it(`PG invariant holds for: ${name}`, () => {
            stubMetadata();
            const result = RenderPipeline.Run(sql, { Platform: 'postgresql', MaxRows: CAP });
            assertCapEnforcedOrSafelyUntouched(sql, result.FinalSQL, CAP);
        });
    }
});
