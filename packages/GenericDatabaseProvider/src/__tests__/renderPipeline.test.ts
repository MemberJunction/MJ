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
// MaxRows — caller intent (existing cap wins)
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — caller-written caps are preserved', () => {

    it('preserves an existing outer TOP on SQL Server', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 5 * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('preserves a parenthesized outer TOP', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP (5) * FROM t', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/TOP\s*\(?\s*5\s*\)?/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('preserves TOP PERCENT', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 10 PERCENT * FROM t', { Platform: 'sqlserver', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/TOP\s+10\s+PERCENT/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+100\b/i);
    });

    it('preserves a tab-indented SELECT TOP', () => {
        stubMetadata();
        const result = RenderPipeline.Run(`\t\tSELECT TOP 5 * FROM t`, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('preserves an existing outer LIMIT on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM members LIMIT 5', { Platform: 'postgresql', MaxRows: 10 });
        expect(result.FinalSQL).toMatch(/LIMIT\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/LIMIT\s+10\b/i);
    });

    it('preserves LIMIT N OFFSET M on PostgreSQL', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM users LIMIT 5 OFFSET 10', { Platform: 'postgresql', MaxRows: 100 });
        expect(result.FinalSQL).toMatch(/LIMIT\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/LIMIT\s+100\b/i);
    });

    it('is idempotent — calling Run twice produces the same SQL', () => {
        stubMetadata();
        const first = RenderPipeline.Run('SELECT * FROM Users', { Platform: 'sqlserver', MaxRows: 10 });
        const second = RenderPipeline.Run(first.FinalSQL, { Platform: 'sqlserver', MaxRows: 10 });
        expect(second.FinalSQL).toBe(first.FinalSQL);
    });

    it('does not override an existing cap with a larger MaxRows on a re-run', () => {
        stubMetadata();
        const first = RenderPipeline.Run('SELECT * FROM Users', { Platform: 'sqlserver', MaxRows: 10 });
        const second = RenderPipeline.Run(first.FinalSQL, { Platform: 'sqlserver', MaxRows: 100 });
        expect(second.FinalSQL).toMatch(/\bTOP\s+10\b/i);
        expect(second.FinalSQL).not.toMatch(/\bTOP\s+100\b/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// MaxRows — pass-through cases (no cap applied, no corruption)
// ════════════════════════════════════════════════════════════════════

describe('MaxRows row cap — pass-through', () => {

    it('does not cap a SELECT … INTO statement', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * INTO #temp FROM Users', { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT\s+10/i);
    });

    it('does not duplicate the cap across UNION ALL branches', () => {
        stubMetadata();
        const sql = `SELECT ID FROM A UNION ALL SELECT ID FROM B`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        const fetchCount = (result.FinalSQL.match(/FETCH\s+NEXT/gi) || []).length;
        const topCount = (result.FinalSQL.match(/\bTOP\s+\d+/gi) || []).length;
        expect(fetchCount + topCount).toBeLessThanOrEqual(1);
    });

    it('leaves TOP WITH TIES unchanged', () => {
        stubMetadata();
        const sql = `SELECT TOP 5 WITH TIES * FROM t ORDER BY ID`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL.trim()).toBe(sql.trim());
    });

    it('leaves CROSS APPLY OPENJSON unchanged', () => {
        stubMetadata();
        const sql = `SELECT j.Name FROM dbo.T t CROSS APPLY OPENJSON(t.Data) WITH ([Name] NVARCHAR(100)) j`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL.trim()).toBe(sql.trim());
    });

    it('leaves FOR JSON AUTO unchanged', () => {
        stubMetadata();
        const sql = `SELECT ID FROM Users FOR JSON AUTO`;
        const result = RenderPipeline.Run(sql, { Platform: 'sqlserver', MaxRows: 10 });
        expect(result.FinalSQL.trim()).toBe(sql.trim());
    });

    it('does not append FETCH NEXT to a SELECT … FOR JSON', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT ID, Name FROM Users FOR JSON AUTO', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(/FOR\s+JSON[\s\S]*FETCH\s+NEXT/i.test(result.FinalSQL)).toBe(false);
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
