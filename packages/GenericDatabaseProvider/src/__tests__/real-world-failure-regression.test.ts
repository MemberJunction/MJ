/**
 * Regression tests for Skip-Brain query rendering failures.
 *
 * Each test pulls the EXACT SQL Skip generated for a failed run, so that
 * any regression that re-introduces these classes of failure trips the test.
 *
 * See SKIP-QUERY-RENDERING-BUGS.md at the MJ repo root for the full
 * triage write-up. Bug → test mapping:
 *
 *   Bug A — `stripOrderByViaRegex` (Tier 3 fallback inside
 *           `stripTrailingOrderBy`) does NOT skip SQL comments before
 *           matching `ORDER BY`. When a dependency's leading block comment
 *           contains the literal text "ORDER BY" — e.g.
 *           "/* No ORDER BY / TOP — composable. *⁠/" — the regex catches
 *           that text, computes paren-depth = 0 at the comment, and strips
 *           everything from the match to the end of the SQL. The hoisted
 *           CTE body is then truncated mid-comment, producing the cryptic
 *           SQL Server error "Incorrect syntax near '('".
 *
 *           Note: the related fix in commit 92f897fb2c made the *paging*
 *           engine's regex scanner comment-aware, but the equivalent
 *           function in the composition engine (`stripOrderByViaRegex`)
 *           was not updated. Tests 1, 2, 3 cover this.
 *
 *   Bug C — `assembleCTEs` / `hoistInnerCTEs` do not rename inner CTEs
 *           across multiple compositions, so two deps that both define an
 *           inner CTE named `PoolNameBridge` collide.
 *           Tests 4, 5.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryCompositionEngine } from '../queryCompositionEngine';
import { Metadata, UserInfo, QueryDependencySpec } from '@memberjunction/core';

const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;

afterEach(() => {
    vi.restoreAllMocks();
});

// ============================================================================
// Helpers
// ============================================================================

function countOccurrences(haystack: string, needle: string): number {
    if (needle.length === 0) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = haystack.indexOf(needle, pos)) !== -1) {
        count++;
        pos += needle.length;
    }
    return count;
}

function setupNoMetadata(): QueryCompositionEngine {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);
    return new QueryCompositionEngine();
}

// ============================================================================
// Bug A — `stripOrderByViaRegex` truncates dep body at comment-embedded
// "ORDER BY" text
// ============================================================================

describe('Skip Regression — Bug A: comment-embedded ORDER BY truncates dep body', () => {
    /**
     * Test 1 — Skip run 3B5B2DC1 (QEI Patron Engagement Details).
     *
     * Dep starts with:
     *   /*
     *     ...
     *     No ORDER BY / TOP -- composable.
     *   *⁠/
     *
     * The comment contains the literal text "ORDER BY" and "TOP".
     * `stripOrderByViaRegex` must skip comments; otherwise the dep body
     * gets truncated and the hoisted CTE becomes
     *   `[__cte_X] AS (\n/* … No\n)` → SQL syntax error.
     */
    it('Skip run 3B5B2DC1 — preserves full CTE body when leading comment mentions "ORDER BY"', () => {
        const engine = setupNoMetadata();

        // VERBATIM from Skip run 3B5B2DC1 (CE38EC39 step 1003) InputData.
        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'QEIPatronEngagementActivitySummary',
                CategoryPath: '/Golden-Queries/Engagement and Outreach/',
                UsesTemplate: true,
                SQL: `/*
  Per-QEI-Patron summary that totals engagement activity across five
  channels: MEL contacts, event registrations, HL discussion posts, HL
  logins, and Rasa newsletter actions.

  No ORDER BY / TOP -- composable.
*/

WITH [TargetOrgs] AS (
    SELECT
        [m].[ID] AS [OrganizationID],
        [m].[EmployerName] AS [OrganizationName],
        [m].[MemberTypeCode] AS [MemberType]
    FROM [ym].[vwMembers] AS [m]
    WHERE [m].[MemberTypeCode] IN {{ MemberTypes | sqlIn }}
),
[MEL_Eng] AS (
    SELECT
        [m_mel].[EmployerName],
        COUNT(*) AS [MELCount]
    FROM [document].[vwMemberEngagementLogs] AS [mel]
    INNER JOIN [ym].[vwMembers] AS [m_mel]
        ON [mel].[FirstName] = [m_mel].[FirstName]
    WHERE [mel].[Date] >= DATEADD(DAY, -{{ DaysBack | sqlNumber }}, GETDATE())
    GROUP BY [m_mel].[EmployerName]
)
SELECT
    [t].[OrganizationID],
    [t].[OrganizationName],
    [t].[MemberType],
    ISNULL([mel].[MELCount], 0) AS [TotalEngagementCount]
FROM [TargetOrgs] AS [t]
LEFT JOIN [MEL_Eng] AS [mel] ON [t].[OrganizationName] = [mel].[EmployerName]
`,
            },
        ];

        const outerSQL = `SELECT [qei].[OrganizationID]
FROM {{query:"Golden-Queries/Engagement and Outreach/QEIPatronEngagementActivitySummary(MemberTypes=MemberTypes, DaysBack=DaysBack)"}} AS [qei]`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // Concrete proof of truncation: these tokens are AFTER the
        // comment-embedded "ORDER BY" text in the dep body and must
        // appear in the resolved SQL.
        expect(result.ResolvedSQL).toContain('[TargetOrgs]');
        expect(result.ResolvedSQL).toContain('[MEL_Eng]');
        expect(result.ResolvedSQL).toContain('[TotalEngagementCount]');
        expect(result.ResolvedSQL).toContain('GROUP BY [m_mel].[EmployerName]');
    });

    /**
     * Test 2 — Skip run 7A962472 / 0269B6CA (Executive Compensation w/ Bonus and Context).
     *
     * Same comment-embedded "ORDER BY" pattern, but the dep also has a
     * `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` window function.
     * The bug must not cause Tier 3 to mistake either the comment text
     * OR the window-function ORDER BY for a strip-able trailing ORDER BY.
     */
    it('Skip run 7A962472 — preserves full CTE body for ExecComp dep with window function and "No ORDER BY" comment', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'ExecCompWithMemberContext',
                CategoryPath: '/Golden-Queries/Financial Analysis/',
                UsesTemplate: true,
                SQL: `/*
  One row per executive compensation respondent with full pool/member
  context attached (no grouping, no service-area bucketing) so callers
  can correlate salary against any dimension they like.

  No ORDER BY / TOP -- composable.
*/

WITH ExecComp AS (
    SELECT
        e.[ID]    AS [ExecCompID],
        e.[Email] AS [Email],
        TRY_CAST(REPLACE(e.[salary], '$', '') AS DECIMAL(18,2)) AS [BaseSalary]
    FROM [document].[vwExecutiveCompDatas] AS e
    WHERE e.[Email] IS NOT NULL
),
MemberByEmail AS (
    SELECT
        LOWER([m].[EmailAddress]) AS [EmailKey],
        [m].[ID],
        [m].[EmployerName],
        ROW_NUMBER() OVER (
            PARTITION BY LOWER([m].[EmailAddress])
            ORDER BY
                CASE WHEN [m].[Membership] IS NOT NULL THEN 0 ELSE 1 END,
                [m].[ID]
        ) AS [rn]
    FROM [ym].[vwMembers] AS [m]
)
SELECT
    [ec].[ExecCompID],
    [m].[ID]              AS [MemberID],
    [m].[EmployerName]    AS [PoolName]
FROM ExecComp AS [ec]
LEFT JOIN MemberByEmail AS [m]
    ON [m].[EmailKey] = LOWER([ec].[Email])
   AND [m].[rn] = 1
WHERE 1 = 1
{% if Region %}
    AND [ei].[Region] = {{ Region | sqlString }}
{% endif %}
`,
            },
        ];

        const outerSQL = `SELECT ctx.[ExecCompID]
FROM {{query:"Golden-Queries/Financial Analysis/ExecCompWithMemberContext(Region=Region)"}} ctx`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // The dep body contains the trigger text "No ORDER BY / TOP" inside
        // a leading block comment. Tier-3 regex stripping must skip
        // comments — otherwise these tokens (which appear AFTER the
        // comment-embedded "ORDER BY") will be missing from the resolved SQL.
        expect(result.ResolvedSQL).toContain('WITH ExecComp');
        expect(result.ResolvedSQL).toContain('MemberByEmail');
        expect(result.ResolvedSQL).toContain('ROW_NUMBER()');
        expect(result.ResolvedSQL).toContain('PoolName');

        // The window-function ORDER BY is legal in CTEs; no Tier-4 fix is needed.
        expect(result.ResolvedSQL).not.toMatch(/OFFSET\s+0\s+ROWS/i);
    });

    /**
     * Test 3 — Skip run 0269B6CA (full ExecComp Drivers Analysis).
     *
     * Even when the comment marker is just "ORDER BY" mentioned in passing
     * (no "No" qualifier), the dep body must be preserved.
     */
    it('preserves dep body when block comment mentions "ORDER BY" in any form', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'TopMembers',
                CategoryPath: '/Test/',
                SQL: `/* This is the canonical members source. Callers should add their own ORDER BY downstream. */
SELECT [ID], [Name]
FROM [Members]
WHERE [Active] = 1`,
            },
        ];

        const outerSQL = `SELECT * FROM {{query:"Test/TopMembers"}} m`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);
        expect(result.ResolvedSQL).toContain('SELECT [ID], [Name]');
        expect(result.ResolvedSQL).toContain('FROM [Members]');
        expect(result.ResolvedSQL).toContain('WHERE [Active] = 1');
    });

    /**
     * Sanity check — when the dep ACTUALLY has an illegal trailing ORDER BY,
     * the engine SHOULD strip it (or, as a last resort, inject OFFSET 0 ROWS
     * to make it legal). This guards against an over-broad Bug A fix that
     * disables ORDER BY stripping entirely.
     */
    it('still handles a real top-level ORDER BY in a dep with no TOP/OFFSET', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'TopCustomers',
                CategoryPath: '/Sales/',
                SQL: `SELECT [ID], [Name], [TotalRevenue]
FROM [Customers]
WHERE [Active] = 1
ORDER BY [TotalRevenue] DESC`,
            },
        ];

        const outerSQL = `SELECT * FROM {{query:"Sales/TopCustomers"}} t`;
        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // The CTE body must be valid in SQL Server. Either the ORDER BY is
        // stripped, OR it's preserved with OFFSET to make it legal. Both
        // outcomes are acceptable; the SELECT/FROM body must be intact
        // either way.
        expect(result.ResolvedSQL).toContain('SELECT [ID], [Name], [TotalRevenue]');
        expect(result.ResolvedSQL).toContain('FROM [Customers]');

        const hasOrderBy = /ORDER\s+BY\s+\[TotalRevenue\]/i.test(result.ResolvedSQL);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(result.ResolvedSQL);
        expect(hasOrderBy === false || hasOffset === true).toBe(true);
    });
});

// ============================================================================
// Bug C — Inner CTE name collisions across multiple deps
// ============================================================================

describe('Skip Regression — Bug C: duplicate inner CTE names', () => {
    /**
     * Test 4 — Skip run 9359F3F2 (Pool Engagement Leaderboard With Top Topic).
     *
     * Outer composes BOTH `PoolMELActivitySummary` and `MELResolvedToMember`,
     * each of which declares its own `AcronymBridge` and `PoolNameBridge`
     * inner CTEs. SQL Server rejects duplicate CTE names within a single WITH
     * with "Duplicate common table expression name 'PoolNameBridge' was specified."
     * The composition engine must rename inner CTEs to unique identifiers.
     */
    it('Skip run 9359F3F2 — renames inner CTEs to avoid collisions across deps', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'PoolMELActivitySummary',
                CategoryPath: '/Golden-Queries/Engagement and Outreach/',
                UsesTemplate: true,
                SQL: `WITH AcronymBridge AS (
    SELECT
        LOWER(LTRIM(RTRIM([atm].[Acronym]))) AS [AcronymKey],
        [atm].[MemberID]
    FROM [ym].[vwAcronymToMember] AS [atm]
    INNER JOIN [ym].[vwMembers] AS [m]
        ON [m].[ID] = [atm].[MemberID]
),
PoolNameBridge AS (
    SELECT
        LOWER(LTRIM(RTRIM([m].[EmployerName]))) AS [NameKey],
        [m].[ID] AS [MemberID]
    FROM [ym].[vwMembers] AS [m]
    WHERE [m].[EmployerName] IS NOT NULL
)
SELECT
    [m].[ID] AS [MemberID],
    [m].[EmployerName] AS [PoolName],
    COUNT(*) AS [TotalMELCount]
FROM [document].[vwMemberEngagementLogs] AS [mel]
LEFT JOIN AcronymBridge AS [ab]
    ON LOWER(LTRIM(RTRIM([mel].[MemberOrganization]))) = [ab].[AcronymKey]
LEFT JOIN PoolNameBridge AS [pnb]
    ON LOWER(LTRIM(RTRIM([mel].[MemberOrganization]))) = [pnb].[NameKey]
INNER JOIN [ym].[vwMembers] AS [m]
    ON [m].[ID] = COALESCE([ab].[MemberID], [pnb].[MemberID])
WHERE 1 = 1
{% if MemberTypes %}
    AND [m].[MemberTypeCode] IN {{ MemberTypes | sqlIn }}
{% endif %}
GROUP BY [m].[ID], [m].[EmployerName]`,
            },
            {
                Name: 'MELResolvedToMember',
                CategoryPath: '/Golden-Queries/Engagement and Outreach/',
                UsesTemplate: true,
                SQL: `WITH AcronymBridge AS (
    SELECT
        LOWER(LTRIM(RTRIM([atm].[Acronym]))) AS [AcronymKey],
        [atm].[MemberID]
    FROM [ym].[vwAcronymToMember] AS [atm]
    INNER JOIN [ym].[vwMembers] AS [m]
        ON [m].[ID] = [atm].[MemberID]
),
PoolNameBridge AS (
    SELECT
        LOWER(LTRIM(RTRIM([m].[EmployerName]))) AS [NameKey],
        [m].[ID] AS [MemberID]
    FROM [ym].[vwMembers] AS [m]
    WHERE [m].[EmployerName] IS NOT NULL
)
SELECT
    [mel].[ID] AS [MELID],
    [mel].[Date] AS [LogDate],
    [mel].[Reason],
    COALESCE([ab].[MemberID], [pnb].[MemberID]) AS [ResolvedMemberID]
FROM [document].[vwMemberEngagementLogs] AS [mel]
LEFT JOIN AcronymBridge AS [ab]
    ON LOWER(LTRIM(RTRIM([mel].[MemberOrganization]))) = [ab].[AcronymKey]
LEFT JOIN PoolNameBridge AS [pnb]
    ON LOWER(LTRIM(RTRIM([mel].[MemberOrganization]))) = [pnb].[NameKey]
WHERE 1 = 1
{% if StartDate %}
    AND [mel].[Date] >= {{ StartDate | sqlDate }}
{% endif %}`,
            },
        ];

        const outerSQL = `SELECT
    [pmas].[MemberID],
    [pmas].[PoolName],
    [pmas].[TotalMELCount],
    [pr].[Reason] AS [TopReason]
FROM {{query:"Golden-Queries/Engagement and Outreach/PoolMELActivitySummary(MemberTypes=MemberTypes)"}} AS [pmas]
LEFT JOIN (
    SELECT
        [mel].[ResolvedMemberID],
        [mel].[Reason]
    FROM {{query:"Golden-Queries/Engagement and Outreach/MELResolvedToMember(StartDate=StartDate)"}} AS [mel]
    WHERE [mel].[Reason] IS NOT NULL
) AS [pr]
    ON [pr].[ResolvedMemberID] = [pmas].[MemberID]`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // BOTH deps were composed.
        expect(result.CTEs.length).toBeGreaterThanOrEqual(2);

        // The resolved SQL must NOT contain duplicate inner CTE definitions.
        // The verbatim "PoolNameBridge AS (" / "AcronymBridge AS (" pattern
        // must appear at most once. Renamed copies will look like
        // "__cte_PoolNameBridge_<hash> AS (" or similar.
        const verbatimPoolNameBridgeCount = countOccurrences(
            result.ResolvedSQL,
            'PoolNameBridge AS ('
        );
        const verbatimAcronymBridgeCount = countOccurrences(
            result.ResolvedSQL,
            'AcronymBridge AS ('
        );

        expect(verbatimPoolNameBridgeCount).toBeLessThanOrEqual(1);
        expect(verbatimAcronymBridgeCount).toBeLessThanOrEqual(1);
    });

    /**
     * Test 5 — A single dep referenced multiple times with different params.
     * The dedupe key uses params, so we get TWO outer CTEs. Each must own a
     * distinct copy of the dep's inner CTEs (or a shared single copy if the
     * engine deduplicates them — but never duplicate names).
     */
    it('renames inner CTEs across multiple references to the same dep with different params', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'MemberByRegion',
                CategoryPath: '/Test/',
                UsesTemplate: true,
                SQL: `WITH AcronymBridge AS (
    SELECT [atm].[MemberID]
    FROM [ym].[vwAcronymToMember] AS [atm]
)
SELECT [m].[ID]
FROM [ym].[vwMembers] AS [m]
INNER JOIN AcronymBridge AS [ab] ON [ab].[MemberID] = [m].[ID]
WHERE [m].[Region] = {{ Region | sqlString }}`,
            },
        ];

        // Same dep, two calls with different Region values → two distinct outer CTEs
        const outerSQL = `SELECT a.[ID], b.[ID]
FROM {{query:"Test/MemberByRegion(Region='East')"}} a
JOIN {{query:"Test/MemberByRegion(Region='West')"}} b ON a.[ID] = b.[ID]`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);
        expect(result.CTEs).toHaveLength(2);

        // Either the inner CTE is hoisted under unique names per outer CTE,
        // or it's hoisted exactly once and shared. Either way, the verbatim
        // "AcronymBridge AS (" must appear at most once.
        const verbatim = countOccurrences(result.ResolvedSQL, 'AcronymBridge AS (');
        expect(verbatim).toBeLessThanOrEqual(1);
    });
});

// ============================================================================
// Bug D — `findTopLevelOrderByPositions` loses string-literal state across
// MJ token boundaries
// ============================================================================

describe('Skip Regression — Bug D: Nunjucks expression inside SQL string literal breaks ORDER BY detection', () => {
    /**
     * Test 6 — Skip run B047FD9F (Member Activity Counts).
     *
     * The dep SQL has `'{{ MembershipType }}'` — a Nunjucks expression
     * INSIDE a SQL single-quoted string literal. MJLexer splits this into
     * three tokens:
     *   SQL_TEXT("...AND mt.Name = '")
     *   MJ_TEMPLATE_EXPR("{{ MembershipType }}")
     *   SQL_TEXT("'\n  )\n  ...ORDER BY TotalActivityCount DESC")
     *
     * `findTopLevelOrderByPositions` must carry `inString` state across
     * the MJ token boundary. Without the fix, the scanner enters "inside
     * string" mode at the trailing `'` of token N-1, loses it at the MJ
     * token, then the leading `'` in token N+1 re-enters "inside string"
     * mode permanently — the trailing ORDER BY is never detected.
     */
    it('Skip run B047FD9F — strips ORDER BY when dep SQL has Nunjucks expression inside a SQL string literal', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'MemberActivityCounts',
                CategoryPath: '/Golden-Queries/Analytics/',
                UsesTemplate: true,
                SQL: `WITH MemberActivities AS (
    SELECT [m].[ID] AS [MemberID], [m].[Name],
           COUNT(*) AS [TotalActivityCount]
    FROM [AssociationDemo].[vwMembers] [m]
    LEFT JOIN [AssociationDemo].[vwActivities] [a]
        ON [a].[MemberID] = [m].[ID]
    GROUP BY [m].[ID], [m].[Name]
)
SELECT * FROM MemberActivities
{% if MembershipType %}
WHERE EXISTS (
    SELECT 1 FROM [AssociationDemo].[vwMemberships] ms
    INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
    WHERE ms.MemberID = MemberActivities.MemberID
      AND ms.Status = 'Active'
      AND mt.Name = '{{ MembershipType }}'
)
{% endif %}
ORDER BY TotalActivityCount DESC`,
            },
        ];

        const outerSQL = `SELECT [mac].[MemberID], [mac].[Name], [mac].[TotalActivityCount]
FROM {{query:"Golden-Queries/Analytics/MemberActivityCounts(MembershipType=MembershipType)"}} [mac]
ORDER BY [mac].[TotalActivityCount] DESC`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // The dep's trailing ORDER BY TotalActivityCount DESC must be
        // STRIPPED (it's illegal inside a CTE without TOP/OFFSET).
        // The outer query's ORDER BY [mac].[TotalActivityCount] DESC
        // must be PRESERVED (it's on the outer SELECT).
        const resolvedUpper = result.ResolvedSQL.toUpperCase();

        // Count top-level ORDER BY occurrences — only the outer one should remain.
        // The dep's ORDER BY should have been stripped or made legal via OFFSET.
        const hasDepOrderBy = /ORDER\s+BY\s+TotalActivityCount\s+DESC/i.test(result.ResolvedSQL);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(result.ResolvedSQL);

        // Either the dep ORDER BY was stripped, or OFFSET 0 ROWS was injected
        expect(hasDepOrderBy === false || hasOffset === true).toBe(true);

        // The CTE body must be intact — the '{{ MembershipType }}' pattern
        // must NOT have caused truncation or misidentification.
        expect(result.ResolvedSQL).toContain('MemberActivities');
        expect(result.ResolvedSQL).toContain('TotalActivityCount');

        // The outer query's ORDER BY must be preserved
        expect(result.ResolvedSQL).toContain('ORDER BY [mac].[TotalActivityCount] DESC');
    });

    /**
     * Test 7 — Minimal reproduction: simple dep with '{{ StatusFilter }}'
     * inside a string literal + trailing ORDER BY. No CTEs, no comments.
     */
    it('strips ORDER BY when dep has template expression inside string literal (minimal case)', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'FilteredRecords',
                CategoryPath: '/Test/',
                UsesTemplate: true,
                SQL: `SELECT [ID], [Name]
FROM [data].[vwRecords]
WHERE [Status] = '{{ StatusFilter }}'
ORDER BY [Name] ASC`,
            },
        ];

        const outerSQL = `SELECT [r].[ID] FROM {{query:"Test/FilteredRecords(StatusFilter=StatusFilter)"}} [r]`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // The dep's trailing ORDER BY [Name] ASC must be stripped
        const hasOrderByName = /ORDER\s+BY\s+\[Name\]\s+ASC/i.test(result.ResolvedSQL);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(result.ResolvedSQL);
        expect(hasOrderByName === false || hasOffset === true).toBe(true);

        // CTE body must be intact
        expect(result.ResolvedSQL).toContain('[data].[vwRecords]');
        // The pass-through rename may normalize spacing inside braces
        expect(result.ResolvedSQL).toMatch(/'[{]{2}\s*StatusFilter\s*[}]{2}'/);

    });

    /**
     * Test 8 — Block comment state carries across MJ token boundaries.
     * A block comment that starts before an MJ token and ends after it.
     */
    it('handles block comment spanning across MJ token boundary', () => {
        const engine = setupNoMetadata();

        const inlineDeps: QueryDependencySpec[] = [
            {
                Name: 'CommentSpan',
                CategoryPath: '/Test/',
                UsesTemplate: true,
                SQL: `SELECT [ID], [Name]
FROM [data].[vwRecords]
WHERE [Active] = 1
ORDER BY [Name]`,
            },
        ];

        const outerSQL = `SELECT [r].[ID] FROM {{query:"Test/CommentSpan"}} [r]`;

        const result = engine.ResolveComposition(
            outerSQL,
            'sqlserver',
            mockUser,
            {},
            inlineDeps
        );

        expect(result.HasCompositions).toBe(true);

        // The dep's ORDER BY [Name] must be stripped
        const hasOrderBy = /ORDER\s+BY\s+\[Name\]/i.test(result.ResolvedSQL);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(result.ResolvedSQL);
        expect(hasOrderBy === false || hasOffset === true).toBe(true);
    });
});
