/**
 * Edge Case Test Fixtures for the MJ Query Composition Engine
 *
 * Each fixture describes a composition scenario with:
 * - The "outer" query SQL (the query being executed)
 * - The "dependency" query SQL(s) (the queries being composed in)
 * - A description of the edge case
 * - What the expected composed output should handle
 *
 * These fixtures are consumed by vitest tests that exercise the composition pipeline.
 */

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type SQLDialect = 'TransactSQL' | 'PostgreSQL';

export interface CompositionDependency {
    /** The query name (last segment of the path) */
    name: string;
    /** Category path segments (e.g., "Engagement Analytics") */
    categoryPath: string;
    /** The SQL body of this dependency query */
    sql: string;
}

export interface CompositionEdgeCase {
    /** Human-readable description of the edge case */
    description: string;
    /** The outer query SQL that references dependencies via {{query:"..."}} */
    outerSQL: string;
    /** Dependency queries that the outer query references */
    dependencies: CompositionDependency[];
    /** Target SQL dialect */
    dialect: SQLDialect;
    /** What the composition engine should do with this case */
    expectedBehavior: string;
}

// ---------------------------------------------------------------
// ORDER BY Edge Cases
// ---------------------------------------------------------------

export const ORDER_BY_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Dependency with plain ORDER BY (must be stripped for SQL Server)',
        outerSQL: `SELECT mac.MemberID, mac.TotalCount
FROM {{query:"Analytics/Member Activity Counts"}} mac
WHERE mac.TotalCount > 5`,
        dependencies: [
            {
                name: 'Member Activity Counts',
                categoryPath: 'Analytics',
                sql: `SELECT m.ID AS MemberID, COUNT(*) AS TotalCount
FROM Members m
INNER JOIN Activities a ON a.MemberID = m.ID
GROUP BY m.ID
ORDER BY TotalCount DESC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The ORDER BY TotalCount DESC must be stripped from the dependency SQL before wrapping it in a CTE, because SQL Server disallows ORDER BY in CTE subqueries unless TOP/OFFSET is present.',
    },
    {
        description: 'Dependency with ORDER BY inside {% if %} conditional block',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Sorted Members(SortBy=SortBy)"}} mac`,
        dependencies: [
            {
                name: 'Sorted Members',
                categoryPath: 'Analytics',
                sql: `SELECT m.ID AS MemberID, m.FirstName
FROM Members m
WHERE m.Active = 1
{% if SortBy %}ORDER BY {{ SortBy | sqlIdentifier }}{% endif %}`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The ORDER BY is inside a Nunjucks conditional. Regex-based ORDER BY stripping might miss it or incorrectly strip it. The engine must handle Nunjucks-wrapped ORDER BY clauses, either by stripping the entire conditional block containing ORDER BY, or by rendering Nunjucks first then stripping.',
    },
    {
        description: 'Dependency with ORDER BY + TOP (must NOT be stripped)',
        outerSQL: `SELECT top10.Name
FROM {{query:"Analytics/Top Members"}} top10`,
        dependencies: [
            {
                name: 'Top Members',
                categoryPath: 'Analytics',
                sql: `SELECT TOP 10 m.Name, m.Score
FROM Members m
ORDER BY m.Score DESC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'ORDER BY must NOT be stripped because TOP is present — SQL Server allows ORDER BY in subqueries/CTEs when TOP is specified.',
    },
    {
        description: 'Dependency with ORDER BY + OFFSET/FETCH (must NOT be stripped)',
        outerSQL: `SELECT paged.Name
FROM {{query:"Analytics/Paged Members"}} paged`,
        dependencies: [
            {
                name: 'Paged Members',
                categoryPath: 'Analytics',
                sql: `SELECT m.Name, m.Score
FROM Members m
ORDER BY m.Score DESC
OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'ORDER BY must NOT be stripped because OFFSET/FETCH is present — this is a legal ORDER BY in SQL Server CTEs.',
    },
    {
        description: 'Dependency with ORDER BY + FOR XML (must NOT be stripped)',
        outerSQL: `SELECT x.XmlResult
FROM {{query:"Reports/Xml Export"}} x`,
        dependencies: [
            {
                name: 'Xml Export',
                categoryPath: 'Reports',
                sql: `SELECT m.Name, m.Email
FROM Members m
ORDER BY m.Name
FOR XML PATH('Member'), ROOT('Members')`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'ORDER BY must NOT be stripped because FOR XML is present — SQL Server allows ORDER BY when FOR XML is specified.',
    },
    {
        description: 'Dependency with multiple ORDER BY: one in subquery, one at the end',
        outerSQL: `SELECT r.MemberID, r.Rank
FROM {{query:"Analytics/Ranked Members"}} r`,
        dependencies: [
            {
                name: 'Ranked Members',
                categoryPath: 'Analytics',
                sql: `SELECT m.ID AS MemberID,
       ROW_NUMBER() OVER (ORDER BY m.JoinDate ASC) AS Rank
FROM Members m
WHERE m.ID IN (
    SELECT TOP 100 ID FROM Members
    ORDER BY CreatedAt DESC
)
ORDER BY Rank ASC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Only the final ORDER BY (ORDER BY Rank ASC) should be stripped. The ORDER BY inside the window function (OVER clause) and the ORDER BY inside the TOP subquery must be preserved.',
    },
    {
        description: 'Dependency ORDER BY in a UNION — only the final ORDER BY should be stripped',
        outerSQL: `SELECT combined.Name
FROM {{query:"Analytics/Combined Members"}} combined`,
        dependencies: [
            {
                name: 'Combined Members',
                categoryPath: 'Analytics',
                sql: `SELECT m.Name, 'Active' AS Status FROM Members m WHERE m.Active = 1
UNION ALL
SELECT m.Name, 'Inactive' AS Status FROM Members m WHERE m.Active = 0
ORDER BY Name ASC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The final ORDER BY Name ASC (which applies to the entire UNION result) must be stripped. Individual SELECT branches in the UNION do not have ORDER BY clauses here, so nothing else needs stripping.',
    },
    {
        description: 'Dependency ORDER BY references a CTE column alias',
        outerSQL: `SELECT s.Total
FROM {{query:"Reports/Summary Totals"}} s`,
        dependencies: [
            {
                name: 'Summary Totals',
                categoryPath: 'Reports',
                sql: `SELECT SUM(Amount) AS Total, Category
FROM Transactions
GROUP BY Category
ORDER BY Total DESC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'ORDER BY Total DESC must be stripped even though Total is a column alias. The composition engine should not be confused by ORDER BY referencing aliases from the SELECT list.',
    },
    {
        description: 'PostgreSQL: ORDER BY should NOT be stripped from CTEs',
        outerSQL: `SELECT mac.member_id
FROM {{query:"analytics/member_counts"}} mac`,
        dependencies: [
            {
                name: 'member_counts',
                categoryPath: 'analytics',
                sql: `SELECT m.id AS member_id, COUNT(*) AS total_count
FROM members m
INNER JOIN activities a ON a.member_id = m.id
GROUP BY m.id
ORDER BY total_count DESC`,
            },
        ],
        dialect: 'PostgreSQL',
        expectedBehavior:
            'ORDER BY should NOT be stripped for PostgreSQL — it is legal (though pointless) in CTE subqueries in PostgreSQL.',
    },
    {
        description: 'SQL Server: ORDER BY with both TOP and OFFSET (compound legality)',
        outerSQL: `SELECT t.Name
FROM {{query:"Analytics/Top Offset"}} t`,
        dependencies: [
            {
                name: 'Top Offset',
                categoryPath: 'Analytics',
                sql: `SELECT TOP 50 m.Name, m.Score
FROM Members m
ORDER BY m.Score DESC
OFFSET 10 ROWS`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'ORDER BY must NOT be stripped because both TOP and OFFSET are present, making it doubly legal.',
    },
];

// ---------------------------------------------------------------
// CTE Hoisting Edge Cases
// ---------------------------------------------------------------

export const CTE_HOISTING_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Dependency has 1 CTE that must be hoisted',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts"}} mac
WHERE mac.TotalCount > 10`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `WITH MemberActivities AS (
    SELECT MemberID, COUNT(*) AS TotalCount
    FROM Activities
    GROUP BY MemberID
)
SELECT MemberID, TotalCount
FROM MemberActivities`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The MemberActivities CTE must be hoisted out of the dependency SQL and placed as a sibling CTE in the final composed query. The dependency body becomes just SELECT MemberID, TotalCount FROM MemberActivities.',
    },
    {
        description: 'Dependency has 3+ CTEs that must all be hoisted',
        outerSQL: `SELECT s.MemberID, s.Score
FROM {{query:"Analytics/Engagement Score"}} s`,
        dependencies: [
            {
                name: 'Engagement Score',
                categoryPath: 'Analytics',
                sql: `WITH EventCounts AS (
    SELECT MemberID, COUNT(*) AS EventCount
    FROM EventAttendance
    GROUP BY MemberID
),
EmailOpens AS (
    SELECT MemberID, COUNT(*) AS OpenCount
    FROM EmailEvents
    WHERE EventType = 'Open'
    GROUP BY MemberID
),
DonationTotals AS (
    SELECT MemberID, SUM(Amount) AS TotalDonated
    FROM Donations
    GROUP BY MemberID
)
SELECT e.MemberID,
       ISNULL(e.EventCount, 0) + ISNULL(o.OpenCount, 0) + ISNULL(d.TotalDonated, 0) AS Score
FROM EventCounts e
LEFT JOIN EmailOpens o ON o.MemberID = e.MemberID
LEFT JOIN DonationTotals d ON d.MemberID = e.MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'All three CTEs (EventCounts, EmailOpens, DonationTotals) must be hoisted to the top level. They must maintain their declaration order since EmailOpens and DonationTotals do not reference EventCounts, but ordering must still be preserved for correctness.',
    },
    {
        description: 'Two dependencies both define a CTE with the same name (deduplication needed)',
        outerSQL: `SELECT a.MemberID, b.ChapterID
FROM {{query:"Analytics/Member Stats"}} a
INNER JOIN {{query:"Analytics/Chapter Stats"}} b ON a.MemberID = b.MemberID`,
        dependencies: [
            {
                name: 'Member Stats',
                categoryPath: 'Analytics',
                sql: `WITH ActiveMembers AS (
    SELECT ID AS MemberID FROM Members WHERE Active = 1
)
SELECT MemberID, COUNT(*) AS StatCount FROM ActiveMembers GROUP BY MemberID`,
            },
            {
                name: 'Chapter Stats',
                categoryPath: 'Analytics',
                sql: `WITH ActiveMembers AS (
    SELECT ID AS MemberID FROM Members WHERE Active = 1
)
SELECT MemberID, ChapterID FROM ChapterAssignments WHERE MemberID IN (SELECT MemberID FROM ActiveMembers)`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Both dependencies define ActiveMembers CTE with the same SQL. The engine must deduplicate: if the CTE bodies are identical, emit it once. If they differ, rename one (e.g., ActiveMembers_1) and update references in the affected dependency.',
    },
    {
        description: 'Dependency CTE references another CTE in the same dependency (CTE ordering matters)',
        outerSQL: `SELECT f.MemberID, f.FinalScore
FROM {{query:"Analytics/Final Scores"}} f`,
        dependencies: [
            {
                name: 'Final Scores',
                categoryPath: 'Analytics',
                sql: `WITH RawScores AS (
    SELECT MemberID, SUM(Points) AS RawScore
    FROM ActivityPoints
    GROUP BY MemberID
),
NormalizedScores AS (
    SELECT MemberID,
           CAST(RawScore AS FLOAT) / (SELECT MAX(RawScore) FROM RawScores) AS FinalScore
    FROM RawScores
)
SELECT MemberID, FinalScore FROM NormalizedScores`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'NormalizedScores references RawScores, so when hoisting, RawScores must appear BEFORE NormalizedScores in the CTE list. The engine must preserve or compute the correct topological order.',
    },
    {
        description: 'Outer query already has its own CTEs',
        outerSQL: `WITH PrimaryChapters AS (
    SELECT MemberID, ChapterID
    FROM ChapterMemberships
    WHERE IsPrimary = 1
)
SELECT mac.MemberID, pc.ChapterID
FROM {{query:"Analytics/Member Counts"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `WITH MemberActivities AS (
    SELECT MemberID, COUNT(*) AS TotalCount
    FROM Activities
    GROUP BY MemberID
)
SELECT MemberID, TotalCount FROM MemberActivities`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The outer query PrimaryChapters CTE and the hoisted MemberActivities CTE must coexist. The final query should have: WITH MemberActivities AS (...), PrimaryChapters AS (...) SELECT ... or similar ordering. Dependency CTEs should appear before the outer CTEs that might reference composition results.',
    },
    {
        description: 'Outer query + dependency both have CTEs with overlapping names',
        outerSQL: `WITH ActiveMembers AS (
    SELECT ID AS MemberID FROM Members WHERE Active = 1 AND JoinDate > '2020-01-01'
)
SELECT am.MemberID, mac.TotalCount
FROM ActiveMembers am
INNER JOIN {{query:"Analytics/Member Counts"}} mac ON am.MemberID = mac.MemberID`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `WITH ActiveMembers AS (
    SELECT ID AS MemberID FROM Members WHERE Active = 1
)
SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
WHERE MemberID IN (SELECT MemberID FROM ActiveMembers)
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Both the outer query and the dependency define ActiveMembers with DIFFERENT SQL. The engine must rename the dependency CTE (e.g., ActiveMembers__dep_1) and update all references to it within the dependency SQL body.',
    },
    {
        description: 'Dependency CTE that itself references a composition token (nested composition)',
        outerSQL: `SELECT f.MemberID, f.FinalScore
FROM {{query:"Analytics/Weighted Scores"}} f`,
        dependencies: [
            {
                name: 'Weighted Scores',
                categoryPath: 'Analytics',
                sql: `WITH BaseScores AS (
    SELECT MemberID, Score
    FROM {{query:"Analytics/Raw Scores"}} rs
)
SELECT MemberID, Score * 1.5 AS FinalScore FROM BaseScores`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'This is a nested composition: Weighted Scores depends on Raw Scores. The engine must recursively resolve Raw Scores, hoist its CTEs, then hoist Weighted Scores CTEs. Circular dependency detection should also be in place.',
    },
];

// ---------------------------------------------------------------
// Template Parameter Edge Cases
// ---------------------------------------------------------------

export const TEMPLATE_PARAMETER_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Pass-through parameter: parent variable forwarded to dependency',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts(min=MinActivityCount)"}} mac
WHERE mac.TotalCount > {{ MinActivityCount | sqlNumber }}`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
GROUP BY MemberID
HAVING COUNT(*) >= {{ min | sqlNumber }}`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The pass-through parameter min=MinActivityCount means the dependency receives the value of MinActivityCount as its min parameter. The Nunjucks rendering of the dependency SQL must substitute min with the value of MinActivityCount from the parent context.',
    },
    {
        description: 'Static (literal) parameter passed to dependency',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts(type='Professional')"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
WHERE MembershipType = {{ type | sqlString }}
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            "The static parameter type='Professional' means the dependency SQL should be rendered with type='Professional', producing WHERE MembershipType = 'Professional'.",
    },
    {
        description: 'Mixed parameters: one static, one pass-through',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts(min=MinActivityCount, type='Professional')"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
WHERE MembershipType = {{ type | sqlString }}
GROUP BY MemberID
HAVING COUNT(*) >= {{ min | sqlNumber }}`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            "Mixed parameters: min is a pass-through (gets value of MinActivityCount from parent context), type is a literal ('Professional'). Both must be correctly resolved during Nunjucks rendering of the dependency SQL.",
    },
    {
        description: 'Parameter that contains a Nunjucks expression (nested template)',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts(start={{StartDate}})"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
WHERE ActivityDate >= {{ start | sqlDate }}
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The parameter start={{StartDate}} contains a nested Nunjucks expression. The lexer/parser must correctly handle the nested {{ }} within the composition reference parameter value. StartDate should be resolved from the parent context and passed as the start parameter.',
    },
    {
        description: 'Dependency with parameter that affects SQL structure via {% if %} block',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts(IncludeInactive='true')"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities a
INNER JOIN Members m ON m.ID = a.MemberID
WHERE 1=1
{% if IncludeInactive != 'true' %}
  AND m.Active = 1
{% endif %}
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            "The parameter IncludeInactive='true' controls whether an AND clause is included. When IncludeInactive is 'true', the {% if %} block evaluates to false, so AND m.Active = 1 is omitted. The engine must render Nunjucks with the parameter context before composing.",
    },
];

// ---------------------------------------------------------------
// Multiple Dependencies Edge Cases
// ---------------------------------------------------------------

export const MULTIPLE_DEPENDENCY_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Two composition refs in FROM clause with JOIN between them',
        outerSQL: `SELECT a.MemberID, a.TotalCount, b.ChapterName
FROM {{query:"Analytics/Member Counts"}} a
INNER JOIN {{query:"Analytics/Chapter Assignments"}} b ON a.MemberID = b.MemberID`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
            {
                name: 'Chapter Assignments',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, ChapterName
FROM ChapterMemberships cm
INNER JOIN Chapters c ON c.ID = cm.ChapterID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Each dependency becomes its own CTE. The composed query should have WITH [Member Counts] AS (...), [Chapter Assignments] AS (...) SELECT a.MemberID, ... FROM [Member Counts] a INNER JOIN [Chapter Assignments] b ON ...',
    },
    {
        description: 'Composition ref in FROM + composition ref in WHERE subquery',
        outerSQL: `SELECT mac.MemberID, mac.TotalCount
FROM {{query:"Analytics/Member Counts"}} mac
WHERE mac.MemberID IN (
    SELECT MemberID FROM {{query:"Analytics/Premium Members"}} pm
)`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
            {
                name: 'Premium Members',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID
FROM Memberships
WHERE MembershipLevel = 'Premium' AND Status = 'Active'`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Both dependencies become CTEs. The FROM clause reference is replaced with the CTE alias. The WHERE subquery reference is also replaced. The engine must handle composition refs in both FROM position and subquery position.',
    },
    {
        description: 'Three or more composition refs in a single query',
        outerSQL: `SELECT a.MemberID, b.EventCount, c.DonationTotal
FROM {{query:"Analytics/Members"}} a
LEFT JOIN {{query:"Analytics/Event Participation"}} b ON a.MemberID = b.MemberID
LEFT JOIN {{query:"Analytics/Donation Totals"}} c ON a.MemberID = c.MemberID`,
        dependencies: [
            {
                name: 'Members',
                categoryPath: 'Analytics',
                sql: `SELECT ID AS MemberID, FirstName, LastName FROM Members WHERE Active = 1`,
            },
            {
                name: 'Event Participation',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS EventCount FROM EventAttendance GROUP BY MemberID`,
            },
            {
                name: 'Donation Totals',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, SUM(Amount) AS DonationTotal FROM Donations GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'All three dependencies become separate CTEs. The composed query should have three WITH clauses (comma-separated) and each FROM/JOIN reference replaced with the corresponding CTE alias.',
    },
    {
        description: 'Same query referenced twice with different parameters',
        outerSQL: `SELECT curr.TotalCount AS CurrentCount, prev.TotalCount AS PreviousCount
FROM {{query:"Analytics/Member Counts(year=CurrentYear)"}} curr
INNER JOIN {{query:"Analytics/Member Counts(year=PreviousYear)"}} prev
    ON curr.MemberID = prev.MemberID`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
WHERE YEAR(ActivityDate) = {{ year | sqlNumber }}
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The same dependency is referenced twice with different parameter values. The engine must create two distinct CTEs with unique names (e.g., MemberCounts_1 and MemberCounts_2), each rendered with its own parameter context (year=CurrentYear vs year=PreviousYear).',
    },
];

// ---------------------------------------------------------------
// SQL Structure Edge Cases
// ---------------------------------------------------------------

export const SQL_STRUCTURE_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Outer query is a UNION ALL where one branch has a composition ref',
        outerSQL: `SELECT MemberID, 'Direct' AS Source FROM DirectMembers
UNION ALL
SELECT mac.MemberID, 'Activity' AS Source FROM {{query:"Analytics/Member Counts"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The composition ref appears inside a UNION ALL branch. The dependency CTE must be hoisted above the entire UNION query. The ref in the second branch is replaced with the CTE alias.',
    },
    {
        description: 'Composition ref used in CROSS APPLY',
        outerSQL: `SELECT m.Name, ca.TopActivity
FROM Members m
CROSS APPLY (
    SELECT TOP 1 ActivityName AS TopActivity
    FROM {{query:"Analytics/Member Activities"}} ma
    WHERE ma.MemberID = m.ID
    ORDER BY ma.ActivityDate DESC
) ca`,
        dependencies: [
            {
                name: 'Member Activities',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, ActivityName, ActivityDate
FROM Activities`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The composition ref is inside a CROSS APPLY subquery. The dependency CTE must be hoisted to the top level, and the ref inside the CROSS APPLY is replaced with the CTE alias.',
    },
    {
        description: 'Dependency SQL starts with comments (-- or /* */) before the SELECT',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `-- This query counts member activities
/* Author: admin
   Created: 2024-01-15 */
SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'SQL comments before the SELECT must be handled gracefully. The engine should either strip them before wrapping in a CTE, or preserve them within the CTE body. Comments must not break the CTE wrapping logic.',
    },
    {
        description: 'Dependency SQL has trailing semicolon',
        outerSQL: `SELECT mac.MemberID
FROM {{query:"Analytics/Member Counts"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities
GROUP BY MemberID;`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The trailing semicolon must be stripped before wrapping the dependency in a CTE, since a semicolon inside a CTE body is a syntax error.',
    },
    {
        description: 'Dependency SQL is a simple SELECT with no CTE and no ORDER BY',
        outerSQL: `SELECT s.MemberID
FROM {{query:"Analytics/Simple List"}} s`,
        dependencies: [
            {
                name: 'Simple List',
                categoryPath: 'Analytics',
                sql: `SELECT ID AS MemberID, FirstName FROM Members WHERE Active = 1`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The simplest case: the dependency SQL is wrapped directly in a CTE with no modifications needed (no ORDER BY to strip, no CTEs to hoist).',
    },
    {
        description: 'Empty dependency SQL',
        outerSQL: `SELECT e.MemberID
FROM {{query:"Analytics/Empty Query"}} e`,
        dependencies: [
            {
                name: 'Empty Query',
                categoryPath: 'Analytics',
                sql: ``,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Empty SQL should produce a clear error or fallback. The engine should not silently produce invalid SQL like WITH [Empty Query] AS (). It should either throw a descriptive error or produce a no-op CTE like WITH [Empty Query] AS (SELECT NULL AS _empty WHERE 1=0).',
    },
    {
        description: 'Outer query has no FROM clause (e.g., SELECT 1) but references a composition',
        outerSQL: `SELECT (SELECT COUNT(*) FROM {{query:"Analytics/Member Counts"}} mac) AS Total`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The composition ref is inside a scalar subquery in the SELECT list, not in a FROM clause. The CTE must still be hoisted to the top. The subquery reference is replaced with the CTE alias.',
    },
    {
        description: 'Dependency SQL uses DECLARE and SET statements before the SELECT',
        outerSQL: `SELECT d.DistrictName
FROM {{query:"Reports/District Info"}} d`,
        dependencies: [
            {
                name: 'District Info',
                categoryPath: 'Reports',
                sql: `DECLARE @code NVARCHAR(20);
SET @code = '12345';
SELECT co_dist_code AS DistrictCode, description AS DistrictName
FROM co_dist_descs
WHERE co_dist_code = @code`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'DECLARE/SET statements cannot be placed inside a CTE. The engine must either: (a) reject this dependency with a descriptive error, (b) move DECLARE/SET before the WITH clause, or (c) inline the logic differently. This is a fundamental limitation of CTE-based composition.',
    },
];

// ---------------------------------------------------------------
// Platform-Specific Edge Cases
// ---------------------------------------------------------------

export const PLATFORM_SPECIFIC_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'PostgreSQL: ORDER BY preserved in CTE (legal in PostgreSQL)',
        outerSQL: `SELECT mac.member_id, mac.total_count
FROM {{query:"analytics/member_counts"}} mac
WHERE mac.total_count > 5`,
        dependencies: [
            {
                name: 'member_counts',
                categoryPath: 'analytics',
                sql: `SELECT m.id AS member_id, count(*) AS total_count
FROM members m
INNER JOIN activities a ON a.member_id = m.id
GROUP BY m.id
ORDER BY total_count DESC`,
            },
        ],
        dialect: 'PostgreSQL',
        expectedBehavior:
            'PostgreSQL allows ORDER BY in CTE subqueries. The ORDER BY should be preserved (not stripped). The composed query should look like: WITH member_counts AS (SELECT ... ORDER BY total_count DESC) SELECT ...',
    },
    {
        description: 'SQL Server: Same query must strip ORDER BY',
        outerSQL: `SELECT mac.MemberID, mac.TotalCount
FROM {{query:"Analytics/Member Counts"}} mac
WHERE mac.TotalCount > 5`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT m.ID AS MemberID, COUNT(*) AS TotalCount
FROM Members m
INNER JOIN Activities a ON a.MemberID = m.ID
GROUP BY m.ID
ORDER BY TotalCount DESC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'SQL Server forbids ORDER BY in CTE subqueries. The same dependency that keeps ORDER BY in PostgreSQL must have it stripped for TransactSQL.',
    },
    {
        description: 'PostgreSQL: CTE with RECURSIVE keyword',
        outerSQL: `SELECT h.name, h.depth
FROM {{query:"org/hierarchy"}} h`,
        dependencies: [
            {
                name: 'hierarchy',
                categoryPath: 'org',
                sql: `WITH RECURSIVE org_tree AS (
    SELECT id, name, parent_id, 0 AS depth
    FROM organizations
    WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, o.name, o.parent_id, t.depth + 1
    FROM organizations o
    INNER JOIN org_tree t ON t.id = o.parent_id
)
SELECT name, depth FROM org_tree`,
            },
        ],
        dialect: 'PostgreSQL',
        expectedBehavior:
            'The RECURSIVE keyword must be preserved when hoisting. The composed query should include WITH RECURSIVE org_tree AS (...) if the outer query does not already have a RECURSIVE keyword. If the outer query has non-recursive CTEs, the RECURSIVE keyword must be placed correctly per PostgreSQL syntax rules.',
    },
];

// ---------------------------------------------------------------
// Complex / Compound Edge Cases
// ---------------------------------------------------------------

export const COMPLEX_EDGE_CASES: CompositionEdgeCase[] = [
    {
        description: 'Dependency with CTEs + ORDER BY (both hoisting and stripping needed)',
        outerSQL: `SELECT s.MemberID, s.Score
FROM {{query:"Analytics/Engagement Scores"}} s`,
        dependencies: [
            {
                name: 'Engagement Scores',
                categoryPath: 'Analytics',
                sql: `WITH EventCounts AS (
    SELECT MemberID, COUNT(*) AS EventCount
    FROM EventAttendance
    GROUP BY MemberID
)
SELECT e.MemberID, e.EventCount AS Score
FROM EventCounts e
ORDER BY Score DESC`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The EventCounts CTE must be hoisted AND the final ORDER BY must be stripped. Both transformations must be applied correctly in sequence.',
    },
    {
        description: 'Diamond dependency: A references B and C, both B and C reference D',
        outerSQL: `SELECT b.Val, c.Val2
FROM {{query:"Layer/QueryB"}} b
INNER JOIN {{query:"Layer/QueryC"}} c ON b.ID = c.ID`,
        dependencies: [
            {
                name: 'QueryB',
                categoryPath: 'Layer',
                sql: `SELECT d.ID, d.Val
FROM {{query:"Layer/QueryD"}} d
WHERE d.Val > 0`,
            },
            {
                name: 'QueryC',
                categoryPath: 'Layer',
                sql: `SELECT d.ID, d.Val AS Val2
FROM {{query:"Layer/QueryD"}} d
WHERE d.Val < 100`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Diamond dependency pattern: QueryB and QueryC both depend on QueryD. QueryD should only be resolved once and emitted as a single CTE. The engine must detect that the same dependency appears in multiple paths and deduplicate.',
    },
    {
        description: 'Composition ref inside a Nunjucks conditional block',
        outerSQL: `SELECT m.ID, m.Name
FROM Members m
{% if IncludeActivity %}
INNER JOIN {{query:"Analytics/Member Counts"}} mac ON mac.MemberID = m.ID
{% endif %}
WHERE m.Active = 1`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The composition ref is inside a Nunjucks {% if %} block. If IncludeActivity is false, the entire JOIN is omitted and no CTE should be generated. The engine must resolve Nunjucks conditionals BEFORE resolving composition references to avoid generating unnecessary CTEs.',
    },
    {
        description: 'Dependency SQL with string literals containing ORDER BY (false positive)',
        outerSQL: `SELECT r.MemberID
FROM {{query:"Reports/Activity Log"}} r`,
        dependencies: [
            {
                name: 'Activity Log',
                categoryPath: 'Reports',
                sql: `SELECT MemberID, 'Sort items by ORDER BY clause' AS HelpText
FROM Activities
WHERE Description LIKE '%ORDER BY%'`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The string literal contains "ORDER BY" but this is NOT an actual ORDER BY clause. Naive regex-based stripping would incorrectly remove text from the string literal. The engine must only strip actual SQL ORDER BY clauses, not text within string literals.',
    },
    {
        description: 'Deeply nested composition: 3 levels deep (A -> B -> C -> D)',
        outerSQL: `SELECT a.Result
FROM {{query:"Level1/QueryA"}} a`,
        dependencies: [
            {
                name: 'QueryA',
                categoryPath: 'Level1',
                sql: `SELECT b.Result
FROM {{query:"Level2/QueryB"}} b`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'QueryA references QueryB, which would in turn reference QueryC (not shown in dependencies — the engine must resolve recursively). The engine must handle at least 3 levels of nested composition. Circular dependency detection must be in place to prevent infinite recursion.',
    },
    {
        description: 'Outer query with window functions referencing composition CTE alias',
        outerSQL: `SELECT mac.MemberID,
       mac.TotalCount,
       ROW_NUMBER() OVER (ORDER BY mac.TotalCount DESC) AS Rank
FROM {{query:"Analytics/Member Counts"}} mac`,
        dependencies: [
            {
                name: 'Member Counts',
                categoryPath: 'Analytics',
                sql: `SELECT MemberID, COUNT(*) AS TotalCount
FROM Activities GROUP BY MemberID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The outer query uses a window function (ROW_NUMBER) that references columns from the composition CTE. The ORDER BY inside the OVER clause must NOT be affected by any ORDER BY stripping logic — it is part of the window function, not a trailing ORDER BY.',
    },
    {
        description: 'Dependency SQL with multiple statements (batch query)',
        outerSQL: `SELECT r.Name
FROM {{query:"Reports/Multi Statement"}} r`,
        dependencies: [
            {
                name: 'Multi Statement',
                categoryPath: 'Reports',
                sql: `INSERT INTO #TempMembers SELECT ID FROM Members WHERE Active = 1;
SELECT ID AS MemberID, Name
FROM #TempMembers t
INNER JOIN Members m ON m.ID = t.ID`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'Multi-statement batches cannot be wrapped in a CTE. The engine must detect this and either: (a) reject with a clear error, (b) only use the final SELECT, or (c) move non-SELECT statements outside the CTE wrapper.',
    },
    {
        description: 'Composition ref with special characters in query name',
        outerSQL: `SELECT r.Value
FROM {{query:"Reports & Analytics/Year-End (2024) Summary"}} r`,
        dependencies: [
            {
                name: 'Year-End (2024) Summary',
                categoryPath: 'Reports & Analytics',
                sql: `SELECT SUM(Amount) AS Value FROM Transactions WHERE YEAR(Date) = 2024`,
            },
        ],
        dialect: 'TransactSQL',
        expectedBehavior:
            'The query name contains special characters: ampersand, parentheses, hyphen. The CTE alias must be properly quoted/escaped. In SQL Server, this means using square brackets: [Year-End (2024) Summary]. The engine must generate valid CTE alias syntax.',
    },
];

// ---------------------------------------------------------------
// Combined export for test consumption
// ---------------------------------------------------------------

export const ALL_COMPOSITION_EDGE_CASES: CompositionEdgeCase[] = [
    ...ORDER_BY_EDGE_CASES,
    ...CTE_HOISTING_EDGE_CASES,
    ...TEMPLATE_PARAMETER_EDGE_CASES,
    ...MULTIPLE_DEPENDENCY_EDGE_CASES,
    ...SQL_STRUCTURE_EDGE_CASES,
    ...COMPLEX_EDGE_CASES,
    ...PLATFORM_SPECIFIC_EDGE_CASES,
];
