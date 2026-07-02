import { describe, it, expect } from 'vitest';
import { QueryPagingEngine } from '../queryPagingEngine';
import { DatabasePlatform } from '@memberjunction/core';

// ─── ShouldPage ────────────────────────────────────────────────────────────────

describe('QueryPagingEngine.ShouldPage', () => {
    it('returns true when both StartRow and MaxRows are valid', () => {
        expect(QueryPagingEngine.ShouldPage(0, 50)).toBe(true);
        expect(QueryPagingEngine.ShouldPage(100, 25)).toBe(true);
    });

    it('returns false when MaxRows is undefined or 0', () => {
        expect(QueryPagingEngine.ShouldPage(0, undefined)).toBe(false);
        expect(QueryPagingEngine.ShouldPage(0, 0)).toBe(false);
    });

    it('returns false when StartRow is undefined', () => {
        expect(QueryPagingEngine.ShouldPage(undefined, 50)).toBe(false);
    });

    it('returns false when both are undefined', () => {
        expect(QueryPagingEngine.ShouldPage(undefined, undefined)).toBe(false);
    });
});

// ─── extractOrderBy ────────────────────────────────────────────────────────────

describe('QueryPagingEngine.extractOrderBy', () => {
    it('extracts a top-level ORDER BY clause', () => {
        const sql = 'SELECT * FROM Users ORDER BY Name ASC';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(sqlWithoutOrder).toBe('SELECT * FROM Users');
        expect(orderByClause).toBe('Name ASC');
    });

    it('returns null when no ORDER BY exists', () => {
        const sql = 'SELECT * FROM Users';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(sqlWithoutOrder).toBe(sql);
        expect(orderByClause).toBeNull();
    });

    it('ignores ORDER BY inside subqueries', () => {
        const sql = 'SELECT * FROM (SELECT * FROM Users ORDER BY ID) sub ORDER BY Name';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(orderByClause).toBe('Name');
        // The inner ORDER BY should remain in the sqlWithoutOrder
        expect(sqlWithoutOrder).toContain('ORDER BY ID');
    });
});

// ─── stripTopClause ────────────────────────────────────────────────────────────

describe('QueryPagingEngine.stripTopClause', () => {
    it('strips TOP N from a SELECT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT TOP 100 ID, Name FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT ID, Name FROM Users');
    });

    it('strips TOP (N) from a SELECT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT TOP (50) ID FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT ID FROM Users');
    });

    it('strips TOP from SELECT DISTINCT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT DISTINCT TOP 10 Name FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT DISTINCT Name FROM Users');
    });

    it('returns unchanged SQL when no TOP clause', () => {
        const original = 'SELECT ID, Name FROM Users';
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause(original);
        expect(topRemoved).toBe(false);
        expect(sql).toBe(original);
    });
});

// ═══════════════════════════════════════════════════
// WrapWithPaging — Data SQL (appends paging directly)
// ═══════════════════════════════════════════════════

describe('WrapWithPaging — Data SQL', () => {
    describe('SQL Server', () => {
        const platform: DatabasePlatform = 'sqlserver';

        it('appends OFFSET/FETCH directly to simple SQL with ORDER BY', () => {
            const sql = 'SELECT ID, Name FROM Users WHERE Active = 1 ORDER BY Name';
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

            expect(result.Offset).toBe(0);
            expect(result.PageSize).toBe(25);
            // Data SQL should contain the original SQL with paging appended
            expect(result.DataSQL).toContain('ORDER BY Name');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
            // Data SQL should NOT be wrapped in a CTE
            expect(result.DataSQL).not.toContain('__paged');
            expect(result.DataSQL).not.toContain('__count');
        });

        it('adds default ORDER BY when none exists', () => {
            const sql = 'SELECT ID FROM Users';
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, platform);

            // SQL Server uses (SELECT NULL) as neutral ORDER BY
            expect(result.DataSQL).toContain('ORDER BY (SELECT NULL)');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
        });

        it('strips TOP clause before appending OFFSET/FETCH', () => {
            const sql = 'SELECT TOP 100 ID, Name FROM Users ORDER BY Name';
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

            expect(result.DataSQL).not.toMatch(/TOP\s+100/i);
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        });

        it('preserves existing CTEs in data SQL (no wrapping)', () => {
            const sql = `WITH active_users AS (
SELECT ID, Name FROM Users WHERE Active = 1
)
SELECT * FROM active_users ORDER BY Name`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 10, 50, platform);

            // Original CTE should be preserved as-is
            expect(result.DataSQL).toContain('active_users');
            expect(result.DataSQL).toContain('OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY');
            // No __paged wrapping
            expect(result.DataSQL).not.toContain('__paged');
        });

        it('preserves ORDER BY on non-projected columns (Board of Directors bug)', () => {
            // This was the bug that motivated the redesign: ORDER BY references
            // columns that exist in the FROM scope but not in the SELECT list.
            // The old CTE-wrapping approach broke these because the CTE boundary
            // hid the non-projected columns.
            const sql = `SELECT (FirstName + ' ' + LastName) AS Name, Position
FROM BoardMembers
ORDER BY LastName, FirstName`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, platform);

            // ORDER BY LastName, FirstName must be preserved exactly — not remapped
            expect(result.DataSQL).toContain('ORDER BY LastName, FirstName');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });

        it('preserves table-qualified ORDER BY (no remapping needed)', () => {
            const sql = `SELECT m.ID, m.FirstName, m.LastName
FROM Members m
ORDER BY m.LastName, m.FirstName`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

            // Table qualifiers are preserved — no remapping
            expect(result.DataSQL).toContain('ORDER BY m.LastName, m.FirstName');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        });

        it('preserves COALESCE in ORDER BY (no remapping needed)', () => {
            const sql = `SELECT e.Name, COALESCE(rev.TotalRevenue, 0) AS TotalRevenue
FROM Events e
LEFT JOIN Revenue rev ON e.ID = rev.EventID
ORDER BY COALESCE(rev.TotalRevenue, 0) DESC`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 50, platform);

            expect(result.DataSQL).toContain('ORDER BY COALESCE(rev.TotalRevenue, 0) DESC');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY');
        });

        it('handles page 2 offset correctly', () => {
            const sql = 'SELECT * FROM Users ORDER BY ID';
            const result = QueryPagingEngine.WrapWithPaging(sql, 50, 25, platform);

            expect(result.Offset).toBe(50);
            expect(result.PageSize).toBe(25);
            expect(result.DataSQL).toContain('OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY');
        });
    });

    describe('PostgreSQL', () => {
        const platform: DatabasePlatform = 'postgresql';

        it('appends LIMIT/OFFSET to simple SQL', () => {
            const sql = 'SELECT ID, Name FROM Users WHERE Active = true ORDER BY Name';
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

            expect(result.DataSQL).toContain('LIMIT 25 OFFSET 0');
            expect(result.DataSQL).not.toContain('FETCH NEXT');
            expect(result.DataSQL).not.toContain('__paged');
        });

        it('adds default ORDER BY 1 when none exists', () => {
            const sql = 'SELECT ID FROM Users';
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, platform);

            expect(result.DataSQL).toContain('ORDER BY 1');
            expect(result.DataSQL).toContain('LIMIT 10 OFFSET 0');
        });

        it('handles page 2 offset correctly', () => {
            const sql = 'SELECT * FROM Users ORDER BY ID';
            const result = QueryPagingEngine.WrapWithPaging(sql, 50, 25, platform);

            expect(result.Offset).toBe(50);
            expect(result.PageSize).toBe(25);
            expect(result.DataSQL).toContain('LIMIT 25 OFFSET 50');
        });
    });
});

// ═══════════════════════════════════════════════════
// WrapWithPaging — Count SQL (CTE wrapping)
// ═══════════════════════════════════════════════════

describe('WrapWithPaging — Count SQL', () => {
    it('wraps simple SQL in __count CTE for SQL Server', () => {
        const sql = 'SELECT ID, Name FROM Users WHERE Active = 1 ORDER BY Name';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');

        expect(result.CountSQL).toContain('[__count]');
        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount FROM [__count]');
        // ORDER BY should be stripped from the count query
        expect(result.CountSQL).not.toMatch(/ORDER BY/i);
    });

    it('wraps simple SQL in __count CTE for PostgreSQL', () => {
        const sql = 'SELECT ID FROM Users ORDER BY ID';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, 'postgresql');

        expect(result.CountSQL).toContain('"__count"');
        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount FROM "__count"');
        expect(result.CountSQL).not.toMatch(/ORDER BY/i);
    });

    it('preserves existing CTEs in count SQL', () => {
        const sql = `WITH active_users AS (
SELECT ID, Name FROM Users WHERE Active = 1
)
SELECT * FROM active_users ORDER BY Name`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 50, 'sqlserver');

        // Count SQL should have the original CTE + __count
        expect(result.CountSQL).toMatch(/active_users/i);
        expect(result.CountSQL).toContain('[__count]');
        expect(result.CountSQL).toContain('TotalRowCount');
        // ORDER BY should be stripped
        expect(result.CountSQL).not.toMatch(/ORDER BY/i);
    });

    it('handles SQL without ORDER BY', () => {
        const sql = 'SELECT ID FROM Users WHERE Active = 1';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, 'sqlserver');

        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
    });

    it('hoists existing CTEs as siblings of __count (no nested WITH)', () => {
        // This is the bug that caused "Incorrect syntax near ')'" — the count SQL
        // was wrapping the entire SQL (including its WITH clause) inside another
        // WITH [__count] AS (...), producing invalid nested WITH statements.
        const sql = `WITH lapsed AS (
SELECT a.Id, a.FirstName FROM Users a WHERE a.Active = 1
),
verified AS (
SELECT l.Id, l.FirstName FROM lapsed l INNER JOIN Educators e ON e.Name = l.FirstName
)
SELECT v.Id, v.FirstName
FROM verified v
ORDER BY v.FirstName`;

        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        // Count SQL must NOT have nested WITH
        expect(result.CountSQL).not.toMatch(/WITH\s+\[__count\]\s+AS\s*\(\s*\n\s*WITH/i);
        // All CTEs should be siblings in a single WITH chain
        expect(result.CountSQL).toMatch(/lapsed/i);
        expect(result.CountSQL).toMatch(/verified/i);
        expect(result.CountSQL).toContain('[__count]');
        expect(result.CountSQL).toContain('TotalRowCount');
        // ORDER BY should be stripped from count SQL
        expect(result.CountSQL).not.toMatch(/ORDER BY/i);
    });

    it('strips an outer TOP from the count body so the count reflects the full set (SQL Server)', () => {
        const sql = 'SELECT TOP 500 ID, Name FROM Users WHERE Active = 1 ORDER BY Name';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');
        // The user's TOP must not survive into the count — COUNT(*) should see the
        // full result set, consistent with the paged data query (which also drops TOP).
        expect(result.CountSQL).not.toMatch(/\bTOP\b/i);
        expect(result.CountSQL).toContain('TotalRowCount');
    });

    it('strips an outer LIMIT from the count body so the count reflects the full set (PostgreSQL)', () => {
        // Regression for the dialect inconsistency M1 flagged: the old AST count
        // path stripped TOP (SQL Server) but left a PostgreSQL LIMIT in place,
        // producing a count of the limited subset. ClearOuterCap strips both forms.
        const sql = 'SELECT id, name FROM users WHERE active = true ORDER BY name LIMIT 500';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'postgresql');
        expect(result.CountSQL).not.toMatch(/LIMIT\s+500/i);
        expect(result.CountSQL).toContain('TotalRowCount');
    });
});

// ═══════════════════════════════════════════════════
// Trailing Semicolon Handling
// ═══════════════════════════════════════════════════

describe('QueryPagingEngine — Trailing Semicolon Handling', () => {
    it('should strip trailing semicolon before appending paging', () => {
        const sql = `SELECT ID, Name FROM Users ORDER BY Name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';\nOFFSET');
    });

    it('should strip trailing semicolon from SQL with CTE', () => {
        const sql = `WITH Active AS (SELECT ID FROM Users WHERE Active = 1)
SELECT * FROM Active ORDER BY ID;`;

        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 50, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';\n');
    });

    it('should strip trailing semicolon with whitespace after it', () => {
        const sql = `SELECT * FROM Users ORDER BY Name;   \n  `;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';');
    });

    it('should preserve semicolons inside string literals', () => {
        const sql = `SELECT ID, 'value; with semicolon' AS Label FROM Users ORDER BY ID`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        expect(result.DataSQL).toContain('value; with semicolon');
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
    });

    it('should handle PostgreSQL paging with trailing semicolon', () => {
        const sql = `SELECT * FROM users ORDER BY name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 10, 20, 'postgresql');

        expect(result.DataSQL).toContain('LIMIT 20 OFFSET 10');
    });

    it('should produce valid count SQL without semicolon', () => {
        const sql = `SELECT * FROM Users ORDER BY Name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
        expect(result.CountSQL).not.toContain(';');
    });
});

// ═══════════════════════════════════════════════════
// Real-world Regression Tests
// ═══════════════════════════════════════════════════

describe('WrapWithPaging — Real-World Regressions', () => {
    describe('Non-projected ORDER BY columns (Board of Directors bug)', () => {
        it('should preserve ORDER BY on columns not in SELECT list', () => {
            // The bug that motivated the CTE-wrapping removal: ORDER BY references
            // FirstName/LastName which are consumed in a concatenation but not projected.
            const sql = `WITH [__cte_Board] AS (
SELECT a.Id AS AccountId, a.FirstName, a.LastName,
    cm.CommitteePositionName__c AS Board_Position,
    a.Institution__c AS School_District, a.Region__c
FROM nams.vwNU__CommitteeMembership__cs cm
INNER JOIN nams.vwAccounts a ON a.Id = cm.NU__Account__c
WHERE cm.NU__State__c = 'Current'
)
SELECT
    a.Id AS AccountId,
    (bd.FirstName + ' ' + bd.LastName) AS Name,
    bd.Board_Position AS Position,
    bd.School_District AS SchoolDistrict
FROM [__cte_Board] bd
INNER JOIN nams.vwAccounts a
    ON a.FirstName = bd.FirstName
    AND a.LastName = bd.LastName
ORDER BY bd.LastName, bd.FirstName`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            // ORDER BY must be preserved exactly — bd.LastName/bd.FirstName are valid
            // in the original FROM scope even though they're not in the SELECT list
            expect(result.DataSQL).toContain('ORDER BY bd.LastName, bd.FirstName');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
            // Data SQL should NOT wrap in a CTE
            expect(result.DataSQL).not.toContain('__paged');
            expect(result.DataSQL).not.toContain('__count');
        });
    });

    describe('Composed CTEs with comments containing apostrophes (MSTA lapsed-members bug)', () => {
        it('should handle CTE body with apostrophes in SQL comments', () => {
            const sql = `WITH [__cte_MSTA_NAMSDESE_Member_Bridge_6yqh6l] AS (
-- Bridge query: maps NAMS member accounts to DESE educator records
-- is in the same district as the member's Institution__c via co_dist_desc.
-- This eliminates false positives from common names (e.g., "Jennifer Smith")
SELECT DISTINCT
    a.Id AS AccountId, a.FirstName, a.LastName, a.PersonEmail,
    a.Institution__c AS District_Name, a.Region__c,
    e.edssn, e.co_dist_code, e.year AS DESE_Year
FROM nams.vwAccounts a
INNER JOIN dese.vwco_dist_descs d ON d.description = a.Institution__c
INNER JOIN dese.vweducators e
    ON UPPER(LTRIM(RTRIM(e.edfname))) = UPPER(LTRIM(RTRIM(a.FirstName)))
    AND UPPER(LTRIM(RTRIM(e.edlname))) = UPPER(LTRIM(RTRIM(a.LastName)))
    AND e.co_dist_code = d.co_dist_code
    AND e.year = '2024'
WHERE a.IsPersonAccount = 1
  AND a.Institution__c IS NOT NULL
)
SELECT DISTINCT
    bridge.AccountId, bridge.FirstName, bridge.LastName,
    bridge.PersonEmail, bridge.Region__c,
    bridge.District_Name AS Prior_District,
    d_new.description AS New_District,
    2024 AS Prior_Year, 2025 AS New_Year
FROM [__cte_MSTA_NAMSDESE_Member_Bridge_6yqh6l] bridge
INNER JOIN nams.vwNU__Membership__cs m1
    ON m1.NU__Account__c = bridge.AccountId
    AND m1.Year__c = 2024
    AND m1.NU__MembershipProductName__c NOT IN ('Student', 'Retired Annual', 'Retired Lifetime', 'Associate')
INNER JOIN dese.vweducators e_new
    ON e_new.edssn = bridge.edssn
    AND CAST(e_new.year AS INT) = 2025
INNER JOIN dese.vwco_dist_descs d_new
    ON d_new.co_dist_code = e_new.co_dist_code
WHERE NOT EXISTS (
    SELECT 1 FROM nams.vwNU__Membership__cs m2
    WHERE m2.NU__Account__c = bridge.AccountId AND m2.Year__c = 2025
)
AND e_new.co_dist_code != bridge.co_dist_code
ORDER BY bridge.LastName, bridge.FirstName`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            // Data SQL: original SQL with paging appended directly
            expect(result.DataSQL).toContain('ORDER BY bridge.LastName, bridge.FirstName');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
            expect(result.DataSQL).not.toContain('__paged');

            // Count SQL: CTE preserved, ORDER BY stripped, wrapped in __count
            expect(result.CountSQL).toContain('[__count]');
            expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
            expect(result.CountSQL).toMatch(/\[__cte_MSTA_NAMSDESE_Member_Bridge_6yqh6l\]\s+AS/i);
        });

        it('should handle line comments with apostrophes', () => {
            const sql = `WITH cte AS (
-- This query checks the member's status
SELECT ID, Name FROM Users WHERE Name = 'test'
)
SELECT * FROM cte ORDER BY Name`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, 'sqlserver');

            expect(result.DataSQL).toContain('ORDER BY Name');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
            expect(result.CountSQL).toContain('TotalRowCount');
        });

        it('should handle block comments with apostrophes', () => {
            const sql = `WITH cte AS (
/* This is the member's query — don't remove */
SELECT ID FROM Users
)
SELECT * FROM cte`;
            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, 'sqlserver');

            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
            expect(result.CountSQL).toContain('TotalRowCount');
        });

        it('should not be fooled by "ORDER BY" text inside a SQL comment (FBI net position bug)', () => {
            // Real-world regression: a header comment mentioned "No ORDER BY / TOP"
            // and the only true ORDER BY was inside a ROW_NUMBER() OVER(...) window
            // function. The regex scanner false-positived on the comment text and
            // skipped appending the synthetic ORDER BY, producing invalid SQL like
            // `... WHERE fb.rn = 1 OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY` (no ORDER BY).
            const sql = `/*
  Latest FBI net position per pool, scoped to pool MemberTypeCodes.

  No ORDER BY / TOP -- composable.
*/
WITH FilteredMembers AS (
    SELECT [EmployerName], [MemberTypeCode]
    FROM [ym].[vwMembers]
    WHERE [MemberTypeCode] IN ('Regular', 'SponPoolSub', 'Affiliate-CAJPAOrg', 'AffiliateOrg')
),
MostRecentFBIPoolData AS (
    SELECT
        f.[Pool],
        f.[State],
        f.[YearEnded],
        f.[NetPositionCurrent],
        ROW_NUMBER() OVER (PARTITION BY f.[Pool] ORDER BY f.[YearEnded] DESC) AS rn
    FROM [document].[vwFinancialBenchmarkingInitiativeDatas] AS f
    INNER JOIN FilteredMembers AS m ON f.[Pool] = m.[EmployerName]
)
SELECT
    fb.[Pool] AS PoolName,
    fb.[State],
    fb.[YearEnded] AS LatestYearEnded,
    fb.[NetPositionCurrent]
FROM MostRecentFBIPoolData AS fb
WHERE fb.rn = 1`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            // The synthetic ORDER BY (SELECT NULL) MUST be present immediately
            // before OFFSET — otherwise SQL Server rejects FETCH NEXT.
            expect(result.DataSQL).toContain('ORDER BY (SELECT NULL)');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
            expect(result.DataSQL.indexOf('ORDER BY (SELECT NULL)'))
                .toBeLessThan(result.DataSQL.indexOf('OFFSET 0 ROWS FETCH NEXT'));
        });
    });

    describe('Leading block-comment before WITH clause (ExtractCTEs comment-skip bug)', () => {
        it('should hoist CTEs as siblings when SQL starts with a block comment — QEI Patron Engagement', () => {
            // Real-world regression: ExtractCTEs tested ^WITH\s on trimStart() and
            // returned null because the leading /* */ comment was still there. The
            // count builder then wrapped the ENTIRE SQL (comment + WITH + body) inside
            // WITH [__count] AS (...), producing illegal nested WITH.
            const sql = `/*
  Per-QEI-Patron summary that totals engagement activity across five
  channels: MEL contacts, event registrations, HL discussion posts, HL
  logins, and Rasa newsletter actions.

  No ORDER BY / TOP -- composable.
*/

WITH [TargetOrgs] AS (
    SELECT [m].[ID] AS [OrganizationID], [m].[EmployerName] AS [OrganizationName]
    FROM [ym].[vwMembers] AS [m]
),
[MEL_Eng] AS (
    SELECT [m_mel].[EmployerName], COUNT(*) AS [MELCount]
    FROM [document].[vwMemberEngagementLogs] AS [mel]
    INNER JOIN [ym].[vwMembers] AS [m_mel]
        ON [mel].[FirstName] = [m_mel].[FirstName]
        AND [mel].[LastName] = [m_mel].[LastName]
    GROUP BY [m_mel].[EmployerName]
)
SELECT [t].[OrganizationID], [t].[OrganizationName],
    ISNULL([mel].[MELCount], 0) AS [TotalEngagementCount]
FROM [TargetOrgs] AS [t]
LEFT JOIN [MEL_Eng] AS [mel] ON [t].[OrganizationName] = [mel].[EmployerName]`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            // CountSQL must NOT have nested WITH inside [__count]
            expect(result.CountSQL).not.toMatch(/\[__count\]\s*AS\s*\([\s\S]*?\bWITH\s/i);
            // CTEs must be hoisted as siblings of [__count]
            expect(result.CountSQL).toContain('[__count]');
            expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
            // DataSQL must have paging appended
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });

        it('should hoist CTEs as siblings when SQL starts with a block comment — ExecComp By Pool Service Area', () => {
            // This query uses TRY_CAST which node-sql-parser cannot parse, so the
            // AST path fails and the regex fallback must handle the leading comment.
            const sql = `/*
  Aggregates executive compensation by service area bucket.
  Salary gotcha: ExecutiveCompData stores salary as free text in a truncated
  column name [what_is_your_total_annual_base_salary_in_us_dolla].
*/

WITH ExecComp AS (
    SELECT e.Email AS Email,
        TRY_CAST(REPLACE(REPLACE(LTRIM(RTRIM(e.[what_is_your_total_annual_base_salary_in_us_dolla])), '$', ''), ',', '') AS decimal(18,2)) AS BaseSalary
    FROM [document].[vwExecutiveCompDatas] AS e
    WHERE e.[what_is_your_total_annual_base_salary_in_us_dolla] IS NOT NULL
),
MemberInfo AS (
    SELECT m.ID AS MemberID, m.MemberTypeCode, ei.TypeCovered, m.EmailAddress
    FROM [ym].[vwMembers] AS m
    LEFT JOIN [ym].[vwMemberExtendedInfo_Virtual] AS ei ON m.ID = ei.MemberID
    WHERE m.MemberTypeCode IN ('Regular','SponPoolSub','Affiliate-CAJPAOrg','AffiliateOrg')
)
SELECT
    CASE
        WHEN ISNULL(mi.TypeCovered, '') LIKE '%Count%' THEN 'County-Serving'
        WHEN ISNULL(mi.TypeCovered, '') LIKE '%School%' THEN 'School-District-Serving'
        ELSE 'Other'
    END AS ServiceArea,
    COUNT(ec.BaseSalary) AS ExecutiveCount,
    AVG(ec.BaseSalary) AS AvgBaseSalary
FROM MemberInfo AS mi
LEFT JOIN ExecComp AS ec ON ec.Email = mi.EmailAddress
WHERE ec.BaseSalary IS NOT NULL
GROUP BY CASE
        WHEN ISNULL(mi.TypeCovered, '') LIKE '%Count%' THEN 'County-Serving'
        WHEN ISNULL(mi.TypeCovered, '') LIKE '%School%' THEN 'School-District-Serving'
        ELSE 'Other'
    END
HAVING COUNT(ec.BaseSalary) > 0`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            expect(result.CountSQL).not.toMatch(/\[__count\]\s*AS\s*\([\s\S]*?\bWITH\s/i);
            expect(result.CountSQL).toContain('[__count]');
            expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });

        it('should hoist CTEs as siblings when SQL starts with a block comment — ExecComp With Member Context', () => {
            // This query has 3 CTEs, TRY_CAST, ROW_NUMBER with PARTITION BY, and
            // a leading block comment mentioning "No ORDER BY / TOP".
            const sql = `/*
  One row per executive compensation respondent with full pool/member
  context attached (no grouping, no service-area bucketing).

  No ORDER BY / TOP -- composable.
*/

WITH ExecComp AS (
    SELECT e.[ID] AS [ExecCompID], e.[Email],
        TRY_CAST(REPLACE(REPLACE(LTRIM(RTRIM(e.[what_is_your_total_annual_base_salary_in_us_dolla])), '$', ''), ',', '') AS DECIMAL(18,2)) AS [BaseSalary]
    FROM [document].[vwExecutiveCompDatas] AS e
    WHERE e.[Email] IS NOT NULL
),
MemberByEmail AS (
    SELECT LOWER([m].[EmailAddress]) AS [EmailKey], [m].[ID], [m].[EmployerName],
        ROW_NUMBER() OVER (
            PARTITION BY LOWER([m].[EmailAddress])
            ORDER BY CASE WHEN [m].[Membership] IS NOT NULL THEN 0 ELSE 1 END, [m].[ID]
        ) AS [rn]
    FROM [ym].[vwMembers] AS [m]
    WHERE [m].[EmailAddress] IS NOT NULL
),
LatestFBI AS (
    SELECT [fbi].[Pool], [fbi].[TotalAssets],
        ROW_NUMBER() OVER (PARTITION BY [fbi].[Pool] ORDER BY [fbi].[YearEnded] DESC) AS [rn]
    FROM [document].[vwFinancialBenchmarkingInitiativeDatas] AS [fbi]
)
SELECT [ec].[ExecCompID], [ec].[Email], [ec].[BaseSalary],
    [m].[EmployerName] AS [PoolName], [lf].[TotalAssets]
FROM ExecComp AS [ec]
LEFT JOIN MemberByEmail AS [m] ON [m].[EmailKey] = LOWER([ec].[Email]) AND [m].[rn] = 1
LEFT JOIN LatestFBI AS [lf] ON [lf].[Pool] = [m].[EmployerName] AND [lf].[rn] = 1
WHERE 1 = 1`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            expect(result.CountSQL).not.toMatch(/\[__count\]\s*AS\s*\([\s\S]*?\bWITH\s/i);
            expect(result.CountSQL).toContain('[__count]');
            expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
            // Must have synthetic ORDER BY since the query has none (window
            // functions' ORDER BYs don't count)
            expect(result.DataSQL).toContain('ORDER BY (SELECT NULL)');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });
    });

    describe('Multiple CTEs from composition engine', () => {
        it('should handle multiple composed CTEs', () => {
            const sql = `WITH __cq_0 AS (
SELECT CustomerID, SUM(Total) AS TotalRevenue
FROM Orders
GROUP BY CustomerID
),
__cq_1 AS (
SELECT ID, Name FROM Customers WHERE Status = 'Active'
)
SELECT c.Name, r.TotalRevenue
FROM __cq_1 c
JOIN __cq_0 r ON c.ID = r.CustomerID
ORDER BY r.TotalRevenue DESC`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 20, 'sqlserver');

            // Data SQL: original SQL preserved, paging appended
            expect(result.DataSQL).toContain('ORDER BY r.TotalRevenue DESC');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY');

            // Count SQL: CTEs preserved, ORDER BY stripped
            expect(result.CountSQL).toMatch(/__cq_0/);
            expect(result.CountSQL).toMatch(/__cq_1/);
            expect(result.CountSQL).toContain('TotalRowCount');
            expect(result.CountSQL).not.toMatch(/ORDER BY/i);
        });
    });

    describe('Complex real-world query patterns', () => {
        it('should handle member-lifetime-revenue (CTEs + COALESCE ORDER BY)', () => {
            const sql = `WITH CurrentMembership AS (
    SELECT ms.MemberID, mt.Name AS MembershipType,
        ROW_NUMBER() OVER (PARTITION BY ms.MemberID ORDER BY ms.StartDate DESC) AS rn
    FROM [AssociationDemo].[vwMemberships] ms
    INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
    WHERE ms.Status = 'Active'
),
MemberRevenue AS (
    SELECT i.MemberID, COUNT(DISTINCT i.ID) AS InvoiceCount, SUM(li.Amount) AS TotalRevenue
    FROM [AssociationDemo].[vwInvoices] i
    INNER JOIN [AssociationDemo].[vwInvoiceLineItems] li ON i.ID = li.InvoiceID
    WHERE i.Status NOT IN ('Cancelled', 'Refunded')
    GROUP BY i.MemberID
)
SELECT m.ID AS MemberID, m.FirstName, m.LastName,
    COALESCE(rev.TotalRevenue, 0) AS TotalRevenue,
    COALESCE(rev.InvoiceCount, 0) AS InvoiceCount
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN CurrentMembership cm ON m.ID = cm.MemberID AND cm.rn = 1
LEFT JOIN MemberRevenue rev ON m.ID = rev.MemberID
WHERE YEAR(m.JoinDate) = 2024
ORDER BY COALESCE(rev.TotalRevenue, 0) DESC`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            // ORDER BY preserved exactly — no remapping needed
            expect(result.DataSQL).toContain('ORDER BY COALESCE(rev.TotalRevenue, 0) DESC');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });

        it('should handle GROUP BY with aliased ORDER BY (active-members-by-type)', () => {
            const sql = `SELECT mt.Name AS MembershipType, mt.AnnualDues,
    COUNT(DISTINCT m.ID) AS ActiveMemberCount,
    ROUND(COUNT(DISTINCT m.ID) * 100.0 / SUM(COUNT(DISTINCT m.ID)) OVER (), 1) AS PercentageOfTotal
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name, mt.AnnualDues
ORDER BY ActiveMemberCount DESC`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            expect(result.DataSQL).toContain('ORDER BY ActiveMemberCount DESC');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });

        it('should handle quarterly-event-attendance-trends (DATEPART, CONCAT)', () => {
            const sql = `SELECT YEAR(e.StartDate) AS EventYear,
    DATEPART(QUARTER, e.StartDate) AS EventQuarter,
    CONCAT(YEAR(e.StartDate), ' Q', DATEPART(QUARTER, e.StartDate)) AS YearQuarter,
    COUNT(DISTINCT e.ID) AS UniqueEvents
FROM [AssociationDemo].[vwEvents] e
INNER JOIN [AssociationDemo].[vwEventRegistrations] er ON e.ID = er.EventID
WHERE e.Status NOT IN ('Draft', 'Cancelled')
GROUP BY YEAR(e.StartDate), DATEPART(QUARTER, e.StartDate)
ORDER BY EventYear, EventQuarter`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

            expect(result.DataSQL).toContain('ORDER BY EventYear, EventQuarter');
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        });
    });

    describe('PostgreSQL paging with real-world patterns', () => {
        it('should produce valid PostgreSQL paging for CTE queries', () => {
            const sql = `WITH MemberActivities AS (
    SELECT m.ID AS MemberID, m.FirstName,
        (COALESCE(evt.EventsAttended, 0) + COALESCE(crs.CoursesCompleted, 0)) AS TotalActivityCount
    FROM vwMembers m
    LEFT JOIN (SELECT er.MemberID, COUNT(*) AS EventsAttended FROM vwEventRegistrations er GROUP BY er.MemberID) evt ON m.ID = evt.MemberID
    LEFT JOIN (SELECT en.MemberID, COUNT(*) AS CoursesCompleted FROM vwEnrollments en GROUP BY en.MemberID) crs ON m.ID = crs.MemberID
)
SELECT * FROM MemberActivities
ORDER BY TotalActivityCount DESC`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 50, 'postgresql');

            expect(result.DataSQL).toContain('LIMIT 50 OFFSET 0');
            expect(result.DataSQL).not.toContain('FETCH NEXT');
            expect(result.DataSQL).toContain('ORDER BY TotalActivityCount DESC');
        });
    });

    describe('TOP clause handling with CTEs', () => {
        it('should strip TOP from main SELECT but not from CTE body', () => {
            const sql = `WITH TopSellers AS (
SELECT TOP 10 SellerID, SUM(Amount) AS Revenue
FROM Sales
GROUP BY SellerID
ORDER BY Revenue DESC
)
SELECT TOP 50 s.Name, ts.Revenue
FROM TopSellers ts
JOIN Sellers s ON ts.SellerID = s.ID
ORDER BY ts.Revenue DESC`;

            const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');

            // TOP 50 should be stripped from main SELECT
            expect(result.DataSQL).not.toMatch(/SELECT\s+TOP\s+50/i);
            // But TOP 10 inside CTE should be preserved
            expect(result.DataSQL).toMatch(/TOP\s+10/i);
            expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        });
    });
});
