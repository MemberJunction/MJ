import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';

describe('SQLParser', () => {
    describe('Parse', () => {
        it('should extract table references from a simple SELECT', () => {
            const result = SQLParser.Parse('SELECT ID, Name FROM Users WHERE Active = 1');
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
            expect(result.Tables[0].TableName).toBe('Users');
        });

        it('should extract table references from a JOIN query', () => {
            const result = SQLParser.Parse('SELECT u.ID, r.Name FROM Users u INNER JOIN Roles r ON u.RoleID = r.ID');
            expect(result.Tables.length).toBe(2);
            const tableNames = result.Tables.map(t => t.TableName).sort();
            expect(tableNames).toEqual(['Roles', 'Users']);
        });

        it('should extract schema-qualified table references', () => {
            const result = SQLParser.Parse('SELECT ID FROM __mj.AIAgentRun');
            expect(result.Tables.length).toBe(1);
            expect(result.Tables[0].TableName).toBe('AIAgentRun');
            expect(result.Tables[0].SchemaName).toBe('__mj');
        });

        it('should return empty result for empty SQL', () => {
            const result = SQLParser.Parse('');
            expect(result.Tables).toEqual([]);
            expect(result.Columns).toEqual([]);
            expect(result.UsedASTParsing).toBe(false);
        });

        it('should fall back to regex when AST parsing fails', () => {
            // SQL with Nunjucks templates that the AST parser can't handle
            const result = SQLParser.Parse("SELECT ID FROM Users {% if Active %}WHERE Active = 1{% endif %}");
            // Regex fallback should still find the table
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
            expect(result.UsedASTParsing).toBe(false);
        });

        it('should accept a dialect parameter', () => {
            const result = SQLParser.Parse('SELECT id FROM users', 'PostgresQL');
            expect(result.Tables.length).toBe(1);
        });

        it('should default to TransactSQL dialect', () => {
            const result = SQLParser.Parse('SELECT TOP 10 ID FROM Users');
            expect(result.UsedASTParsing).toBe(true);
        });
    });

    describe('ParseWithTemplatePreprocessing', () => {
        it('should parse SQL with Nunjucks templates via preprocessing', () => {
            const sql = "SELECT ID FROM Users WHERE Region = {{ Region | sqlString }}";
            const result = SQLParser.ParseWithTemplatePreprocessing(sql);
            expect(result.Tables.length).toBe(1);
            expect(result.Tables[0].TableName).toBe('Users');
        });

        it('should handle Nunjucks if/endif blocks', () => {
            const sql = `SELECT ID FROM Users
{% if Active %}
WHERE Active = 1
{% endif %}
ORDER BY Name`;
            const result = SQLParser.ParseWithTemplatePreprocessing(sql);
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
        });

        it('should accept a dialect parameter', () => {
            const result = SQLParser.ParseWithTemplatePreprocessing(
                "SELECT ID FROM Users WHERE Status = {{ Status | sqlString }}",
                'PostgresQL'
            );
            expect(result.Tables.length).toBe(1);
        });
    });

    describe('ExtractCTEs', () => {
        it('should return null for SQL without a WITH clause', () => {
            const result = SQLParser.ExtractCTEs('SELECT * FROM Users');
            expect(result).toBeNull();
        });

        it('should extract a single CTE', () => {
            const sql = 'WITH Active AS (SELECT ID FROM Users WHERE Active = 1) SELECT * FROM Active';
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.CTEDefinitions[0]).toMatch(/Active\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*/i);
        });

        it('should extract multiple CTEs', () => {
            const sql = 'WITH A AS (SELECT 1 AS x), B AS (SELECT 2 AS y) SELECT A.x, B.y FROM A, B';
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(2);
            expect(result!.CTEDefinitions[0]).toMatch(/A\s+AS\s*\(/);
            expect(result!.CTEDefinitions[1]).toMatch(/B\s+AS\s*\(/);
            expect(result!.MainStatement).toContain('A');
            expect(result!.MainStatement).toContain('B');
        });

        it('should handle CTEs with nested parentheses', () => {
            const sql = "WITH Agg AS (SELECT MemberID, COUNT(DISTINCT ChapterID) AS Total FROM (SELECT * FROM Memberships WHERE Status = 'Active') sub GROUP BY MemberID) SELECT * FROM Agg";
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM/i);
        });

        it('should handle CTEs with string literals containing parentheses', () => {
            const sql = "WITH Filtered AS (SELECT * FROM T WHERE Name = 'Test (Dept)') SELECT * FROM Filtered";
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            // AST path brackets identifiers: [Filtered]; regex path preserves as-is
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM\s+\[?Filtered\]?/i);
        });

        it('should fall back to regex when SQL contains Nunjucks templates', () => {
            const sql = "WITH Filtered AS (SELECT * FROM T WHERE x = {{ someParam }}) SELECT * FROM Filtered";
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.UsedASTParsing).toBe(false);
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM\s+Filtered/i);
        });

        it('should handle schema-qualified table names in CTEs', () => {
            const sql = `WITH Members AS (
                SELECT m.ID, m.FirstName
                FROM [AssociationDemo].[vwMembers] m
                LEFT JOIN (
                    SELECT er.MemberID, COUNT(DISTINCT er.ID) AS Total
                    FROM [AssociationDemo].[vwEventRegistrations] er
                    GROUP BY er.MemberID
                ) evt ON m.ID = evt.MemberID
            ) SELECT * FROM Members WHERE Members.Total >= 1`;
            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toContain('Members');
        });

        it('should accept a dialect parameter', () => {
            const sql = 'WITH A AS (SELECT 1) SELECT * FROM A';
            const result = SQLParser.ExtractCTEs(sql, 'PostgresQL');

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
        });
    });

    describe('ExtractCTEs - Real-World Queries', () => {
        it('should extract 1 CTE from member-activity-counts (Nunjucks → regex fallback)', () => {
            const sql = `WITH MemberActivities AS (
    SELECT
        m.ID AS MemberID,
        m.FirstName,
        m.LastName,
        m.Email,
        m.JoinDate,
        m.EngagementScore,
        COALESCE(evt.EventsAttended, 0) AS EventsAttended,
        COALESCE(evt.EventsRegistered, 0) AS EventsRegistered,
        COALESCE(crs.CoursesCompleted, 0) AS CoursesCompleted,
        COALESCE(crs.CoursesInProgress, 0) AS CoursesInProgress,
        COALESCE(ch.ChaptersJoined, 0) AS ChaptersJoined,
        COALESCE(com.CommitteesServed, 0) AS CommitteesServed,
        (
            COALESCE(evt.EventsAttended, 0)
            + COALESCE(crs.CoursesCompleted, 0)
            + COALESCE(ch.ChaptersJoined, 0)
            + COALESCE(com.CommitteesServed, 0)
        ) AS TotalActivityCount
    FROM [AssociationDemo].[vwMembers] m
    LEFT JOIN (
        SELECT
            er.MemberID,
            COUNT(DISTINCT er.ID) AS EventsRegistered,
            SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS EventsAttended
        FROM [AssociationDemo].[vwEventRegistrations] er
        GROUP BY er.MemberID
    ) evt ON m.ID = evt.MemberID
    LEFT JOIN (
        SELECT
            en.MemberID,
            SUM(CASE WHEN en.Status = 'Completed' THEN 1 ELSE 0 END) AS CoursesCompleted,
            SUM(CASE WHEN en.Status = 'In Progress' THEN 1 ELSE 0 END) AS CoursesInProgress
        FROM [AssociationDemo].[vwEnrollments] en
        GROUP BY en.MemberID
    ) crs ON m.ID = crs.MemberID
    LEFT JOIN (
        SELECT
            cm.MemberID,
            COUNT(DISTINCT cm.ChapterID) AS ChaptersJoined
        FROM [AssociationDemo].[vwChapterMemberships] cm
        WHERE cm.Status = 'Active'
        GROUP BY cm.MemberID
    ) ch ON m.ID = ch.MemberID
    LEFT JOIN (
        SELECT
            cm.MemberID,
            COUNT(DISTINCT cm.CommitteeID) AS CommitteesServed
        FROM [AssociationDemo].[vwCommitteeMemberships] cm
        WHERE cm.IsActive = 1
        GROUP BY cm.MemberID
    ) com ON m.ID = com.MemberID
)
SELECT *
FROM MemberActivities
{% if MinActivityCount or MembershipType %}
WHERE 1=1
  {% if MinActivityCount %}
  AND TotalActivityCount >= {{ MinActivityCount | sqlNumber }}
  {% endif %}
  {% if MembershipType %}
  AND EXISTS (
      SELECT 1 FROM [AssociationDemo].[vwMemberships] ms
      INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
      WHERE ms.MemberID = MemberActivities.MemberID
        AND ms.Status = 'Active'
        AND mt.Name = '{{ MembershipType }}'
  )
  {% endif %}
{% endif %}
ORDER BY TotalActivityCount DESC`;

            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.CTEDefinitions[0]).toMatch(/MemberActivities\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.MainStatement).not.toMatch(/^\s*WITH/i);
            expect(result!.UsedASTParsing).toBe(false);
        });

        it('should extract 3 CTEs from chapter-engagement-summary (Nunjucks → regex fallback)', () => {
            const sql = `WITH ChapterMembers AS (
    SELECT
        c.ID AS ChapterID,
        c.Name AS ChapterName,
        c.ChapterType,
        c.Region,
        c.State,
        c.IsActive,
        COUNT(DISTINCT cm.MemberID) AS ActiveMemberCount,
        AVG(DATEDIFF(DAY, cm.JoinDate, GETDATE())) AS AvgMemberTenureDays
    FROM [AssociationDemo].[vwChapters] c
    LEFT JOIN [AssociationDemo].[vwChapterMemberships] cm
        ON c.ID = cm.ChapterID AND cm.Status = 'Active'
    WHERE c.IsActive = 1
    {% if ChapterType %}
      AND c.ChapterType = '{{ ChapterType }}'
    {% endif %}
    {% if Region %}
      AND c.Region = '{{ Region }}'
    {% endif %}
    GROUP BY c.ID, c.Name, c.ChapterType, c.Region, c.State, c.IsActive
),
ChapterEventActivity AS (
    SELECT
        cm.ChapterID,
        COUNT(DISTINCT er.EventID) AS UniqueEventsAttended,
        COUNT(DISTINCT er.ID) AS TotalRegistrations,
        SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS TotalAttendances
    FROM [AssociationDemo].[vwChapterMemberships] cm
    LEFT JOIN [AssociationDemo].[vwEventRegistrations] er ON cm.MemberID = er.MemberID
    WHERE cm.Status = 'Active'
    GROUP BY cm.ChapterID
),
ChapterCourseActivity AS (
    SELECT
        cm.ChapterID,
        COUNT(DISTINCT en.CourseID) AS UniqueCoursesEnrolled,
        SUM(CASE WHEN en.Status = 'Completed' THEN 1 ELSE 0 END) AS CourseCompletions
    FROM [AssociationDemo].[vwChapterMemberships] cm
    LEFT JOIN [AssociationDemo].[vwEnrollments] en ON cm.MemberID = en.MemberID
    WHERE cm.Status = 'Active'
    GROUP BY cm.ChapterID
)
SELECT
    chmem.ChapterID,
    chmem.ChapterName,
    chmem.ChapterType,
    chmem.Region,
    chmem.State,
    chmem.ActiveMemberCount,
    chmem.AvgMemberTenureDays,
    COALESCE(chev.UniqueEventsAttended, 0) AS UniqueEventsAttended,
    COALESCE(chev.TotalRegistrations, 0) AS TotalRegistrations,
    COALESCE(chev.TotalAttendances, 0) AS TotalAttendances,
    COALESCE(chcr.UniqueCoursesEnrolled, 0) AS UniqueCoursesEnrolled,
    COALESCE(chcr.CourseCompletions, 0) AS CourseCompletions
FROM ChapterMembers chmem
LEFT JOIN ChapterEventActivity chev ON chmem.ChapterID = chev.ChapterID
LEFT JOIN ChapterCourseActivity chcr ON chmem.ChapterID = chcr.ChapterID
ORDER BY chmem.ActiveMemberCount DESC`;

            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(3);
            expect(result!.CTEDefinitions[0]).toMatch(/ChapterMembers\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[1]).toMatch(/ChapterEventActivity\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[2]).toMatch(/ChapterCourseActivity\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.MainStatement).not.toMatch(/^\s*WITH/i);
            expect(result!.UsedASTParsing).toBe(false);
        });

        it('should extract 2 CTEs from member-lifetime-revenue (Nunjucks → regex fallback)', () => {
            const sql = `WITH CurrentMembership AS (
    SELECT
        ms.MemberID,
        mt.Name AS MembershipType,
        ROW_NUMBER() OVER (
            PARTITION BY ms.MemberID
            ORDER BY ms.StartDate DESC
        ) AS rn
    FROM [AssociationDemo].[vwMemberships] ms
    INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
    WHERE ms.Status = 'Active'
),
MemberRevenue AS (
    SELECT
        i.MemberID,
        COUNT(DISTINCT i.ID) AS InvoiceCount,
        SUM(li.Amount) AS TotalRevenue,
        SUM(CASE WHEN li.ItemType = 'Membership Dues' THEN li.Amount ELSE 0 END) AS MembershipRevenue,
        SUM(CASE WHEN li.ItemType = 'Event Registration' THEN li.Amount ELSE 0 END) AS EventRevenue,
        SUM(CASE WHEN li.ItemType = 'Course Enrollment' THEN li.Amount ELSE 0 END) AS CourseRevenue
    FROM [AssociationDemo].[vwInvoices] i
    INNER JOIN [AssociationDemo].[vwInvoiceLineItems] li ON i.ID = li.InvoiceID
    WHERE i.Status NOT IN ('Cancelled', 'Refunded')
    GROUP BY i.MemberID
)
SELECT
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.JoinDate,
    YEAR(m.JoinDate) AS JoinYear,
    cm.MembershipType AS CurrentMembershipType,
    COALESCE(rev.TotalRevenue, 0) AS TotalRevenue,
    COALESCE(rev.MembershipRevenue, 0) AS MembershipRevenue,
    COALESCE(rev.EventRevenue, 0) AS EventRevenue,
    COALESCE(rev.CourseRevenue, 0) AS CourseRevenue,
    COALESCE(rev.InvoiceCount, 0) AS InvoiceCount,
    DATEDIFF(MONTH, m.JoinDate, GETDATE()) AS MonthsAsMember,
    CASE
        WHEN DATEDIFF(MONTH, m.JoinDate, GETDATE()) > 0
        THEN ROUND(COALESCE(rev.TotalRevenue, 0) / DATEDIFF(MONTH, m.JoinDate, GETDATE()), 2)
        ELSE COALESCE(rev.TotalRevenue, 0)
    END AS AvgMonthlyRevenue
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN CurrentMembership cm ON m.ID = cm.MemberID AND cm.rn = 1
LEFT JOIN MemberRevenue rev ON m.ID = rev.MemberID
WHERE 1=1
{% if JoinYear %}
  AND YEAR(m.JoinDate) = {{ JoinYear | sqlNumber }}
{% endif %}
{% if MembershipType %}
  AND cm.MembershipType = '{{ MembershipType }}'
{% endif %}
ORDER BY COALESCE(rev.TotalRevenue, 0) DESC`;

            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(2);
            expect(result!.CTEDefinitions[0]).toMatch(/CurrentMembership\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[1]).toMatch(/MemberRevenue\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.MainStatement).not.toMatch(/^\s*WITH/i);
            expect(result!.UsedASTParsing).toBe(false);
        });

        it('should extract 2 CTEs from board-of-directors (no Nunjucks → AST path)', () => {
            const sql = `WITH board_committee AS (
    SELECT Id
    FROM nams.vwNU__Committee__cs
    WHERE Name = 'MSTA Board of Directors'
      AND NU__Type__c = 'Board'
),
current_members AS (
    SELECT
        cm.NU__Account__c,
        cm.CommitteePositionName__c,
        cm.NU__StartDate__c,
        cm.NU__EndDate__c
    FROM nams.vwNU__CommitteeMembership__cs cm
    INNER JOIN board_committee bc
        ON bc.Id = cm.NU__Committee__c
    WHERE cm.NU__State__c = 'Current'
      AND cm.IsDeleted = 0
)
SELECT
    a.FirstName,
    a.LastName,
    m.CommitteePositionName__c AS Board_Position,
    a.Institution__c AS School_District,
    a.Region__c,
    m.NU__StartDate__c AS Term_Start,
    m.NU__EndDate__c AS Term_End
FROM current_members m
INNER JOIN nams.vwAccounts a
    ON a.Id = m.NU__Account__c
ORDER BY a.LastName, a.FirstName`;

            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(2);
            expect(result!.CTEDefinitions[0]).toMatch(/board_committee\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[1]).toMatch(/current_members\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.MainStatement).not.toMatch(/^\s*WITH/i);
            expect(result!.UsedASTParsing).toBe(true);
        });

        it('should extract 1 CTE from unique-committee-members (no Nunjucks → AST path)', () => {
            const sql = `WITH current_memberships AS (
    SELECT
        cm.NU__Account__c,
        cm.CommitteeName__c
    FROM nams.vwNU__CommitteeMembership__cs cm
    WHERE cm.NU__State__c = 'Current'
      AND cm.IsDeleted = 0
)
SELECT DISTINCT
    a.Id,
    a.FirstName,
    a.LastName,
    a.Institution__c AS School_District,
    m.CommitteeName__c AS Committee_Name
FROM current_memberships m
INNER JOIN nams.vwAccounts a
    ON a.Id = m.NU__Account__c
WHERE a.NU__Member__c = 'Yes'
  AND a.IsPersonAccount = 1
ORDER BY a.LastName, a.FirstName`;

            const result = SQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.CTEDefinitions[0]).toMatch(/current_memberships\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.MainStatement).not.toMatch(/^\s*WITH/i);
            expect(result!.UsedASTParsing).toBe(true);
        });
    });

    describe('ExtractCTEs - Non-CTE Queries', () => {
        it('should return null for active-members-by-membership-type (no CTE)', () => {
            const sql = `SELECT
    mt.Name AS MembershipType,
    mt.AnnualDues,
    COUNT(DISTINCT m.ID) AS ActiveMemberCount,
    ROUND(COUNT(DISTINCT m.ID) * 100.0 / SUM(COUNT(DISTINCT m.ID)) OVER (), 1) AS PercentageOfTotal,
    MIN(ms.StartDate) AS EarliestMembership,
    MAX(ms.StartDate) AS LatestMembership
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name, mt.AnnualDues
ORDER BY ActiveMemberCount DESC`;

            const result = SQLParser.ExtractCTEs(sql);
            expect(result).toBeNull();
        });

        it('should return null for event-revenue-summary (subquery in LEFT JOIN, no CTE)', () => {
            const sql = `SELECT
    e.ID AS EventID,
    e.Name AS EventName,
    e.EventType,
    e.StartDate,
    e.EndDate,
    COUNT(DISTINCT er.ID) AS TotalRegistrations,
    COALESCE(rev.TotalRevenue, 0) AS TotalRevenue
FROM [AssociationDemo].[vwEvents] e
LEFT JOIN [AssociationDemo].[vwEventRegistrations] er ON e.ID = er.EventID
LEFT JOIN (
    SELECT li.RelatedEntityID AS EventID, SUM(li.Amount) AS TotalRevenue
    FROM [AssociationDemo].[vwInvoiceLineItems] li
    INNER JOIN [AssociationDemo].[vwInvoices] i ON li.InvoiceID = i.ID
    WHERE li.RelatedEntityType = 'Event' AND i.Status NOT IN ('Cancelled', 'Refunded')
    GROUP BY li.RelatedEntityID
) rev ON e.ID = rev.EventID
WHERE e.Status NOT IN ('Draft', 'Cancelled')
GROUP BY e.ID, e.Name, e.EventType, e.StartDate, e.EndDate, rev.TotalRevenue
ORDER BY COALESCE(rev.TotalRevenue, 0) DESC`;

            const result = SQLParser.ExtractCTEs(sql);
            expect(result).toBeNull();
        });

        it('should return null for quarterly-event-attendance-trends (Nunjucks but no CTE)', () => {
            const sql = `SELECT
    YEAR(e.StartDate) AS EventYear,
    DATEPART(QUARTER, e.StartDate) AS EventQuarter,
    COUNT(DISTINCT e.ID) AS UniqueEvents,
    COUNT(DISTINCT er.ID) AS TotalRegistrations,
    SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS TotalAttended
FROM [AssociationDemo].[vwEvents] e
INNER JOIN [AssociationDemo].[vwEventRegistrations] er ON e.ID = er.EventID
WHERE e.Status NOT IN ('Draft', 'Cancelled')
{% if EventType %}
  AND e.EventType = '{{ EventType }}'
{% endif %}
GROUP BY YEAR(e.StartDate), DATEPART(QUARTER, e.StartDate)
ORDER BY EventYear, EventQuarter`;

            const result = SQLParser.ExtractCTEs(sql);
            expect(result).toBeNull();
        });
    });
});
