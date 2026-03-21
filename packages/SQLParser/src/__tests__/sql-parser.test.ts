import { describe, it, expect } from 'vitest';
import { MJSQLParser } from '../mj-sql-parser.js';

describe('MJSQLParser', () => {
    // ================================================================
    // ExtractTableRefs
    // ================================================================
    describe('ExtractTableRefs', () => {
        it('should extract table references from a simple SELECT', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT ID, Name FROM Users WHERE Active = 1');
            expect(tables.length).toBeGreaterThanOrEqual(1);
            expect(tables[0].TableName).toBe('Users');
        });

        it('should extract table references from a JOIN query', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT u.ID, r.Name FROM Users u INNER JOIN Roles r ON u.RoleID = r.ID');
            expect(tables.length).toBe(2);
            const tableNames = tables.map(t => t.TableName).sort();
            expect(tableNames).toEqual(['Roles', 'Users']);
        });

        it('should extract schema-qualified table references', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT ID FROM __mj.AIAgentRun');
            expect(tables.length).toBe(1);
            expect(tables[0].TableName).toBe('AIAgentRun');
            expect(tables[0].SchemaName).toBe('__mj');
        });

        it('should return empty for empty SQL', () => {
            expect(MJSQLParser.ExtractTableRefs('')).toEqual([]);
        });

        it('should extract tables from SQL with Nunjucks templates', () => {
            const tables = MJSQLParser.ExtractTableRefs(
                "SELECT ID FROM Users WHERE Region = {{ Region | sqlString }}"
            );
            expect(tables.length).toBe(1);
            expect(tables[0].TableName).toBe('Users');
        });

        it('should handle if/endif blocks', () => {
            const sql = `SELECT ID FROM Users
{% if Active %}
WHERE Active = 1
{% endif %}
ORDER BY Name`;
            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
        });

        it('should accept PostgreSQL dialect', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT id FROM users', 'PostgresQL');
            expect(tables.length).toBe(1);
        });

        it('should handle SQL Server TOP clause', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT TOP 10 ID FROM Users');
            expect(tables.length).toBe(1);
        });
    });

    // ================================================================
    // ExtractColumnRefs
    // ================================================================
    describe('ExtractColumnRefs', () => {
        it('should extract column references from simple SQL', () => {
            const columns = MJSQLParser.ExtractColumnRefs('SELECT ID, Name FROM Users WHERE Active = 1');
            expect(columns.length).toBeGreaterThanOrEqual(2);
            const colNames = columns.map(c => c.ColumnName);
            expect(colNames).toContain('ID');
            expect(colNames).toContain('Name');
        });

        it('should extract qualified column references', () => {
            const columns = MJSQLParser.ExtractColumnRefs('SELECT u.Name, r.Title FROM Users u JOIN Roles r ON u.RoleID = r.ID');
            const qualified = columns.filter(c => c.TableQualifier !== null);
            expect(qualified.length).toBeGreaterThan(0);
        });

        it('should return empty for empty SQL', () => {
            expect(MJSQLParser.ExtractColumnRefs('')).toEqual([]);
        });
    });

    // ================================================================
    // ExtractCTEs
    // ================================================================
    describe('ExtractCTEs', () => {
        it('should return null for SQL without a WITH clause', () => {
            expect(MJSQLParser.ExtractCTEs('SELECT * FROM Users')).toBeNull();
        });

        it('should extract a single CTE', () => {
            const sql = 'WITH Active AS (SELECT ID FROM Users WHERE Active = 1) SELECT * FROM Active';
            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.CTEDefinitions[0]).toMatch(/Active\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*/i);
        });

        it('should extract multiple CTEs', () => {
            const sql = 'WITH A AS (SELECT 1 AS x), B AS (SELECT 2 AS y) SELECT A.x, B.y FROM A, B';
            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(2);
            expect(result!.CTEDefinitions[0]).toMatch(/A\s+AS\s*\(/);
            expect(result!.CTEDefinitions[1]).toMatch(/B\s+AS\s*\(/);
        });

        it('should handle CTEs with nested parentheses', () => {
            const sql = "WITH Agg AS (SELECT MemberID, COUNT(DISTINCT ChapterID) AS Total FROM (SELECT * FROM Memberships WHERE Status = 'Active') sub GROUP BY MemberID) SELECT * FROM Agg";
            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM/i);
        });

        it('should handle CTEs with string literals containing parentheses', () => {
            const sql = "WITH Filtered AS (SELECT * FROM T WHERE Name = 'Test (Dept)') SELECT * FROM Filtered";
            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM\s+\[?Filtered\]?/i);
        });

        it('should handle SQL with Nunjucks templates (regex fallback)', () => {
            const sql = "WITH Filtered AS (SELECT * FROM T WHERE x = {{ someParam }}) SELECT * FROM Filtered";
            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.UsedASTParsing).toBe(false);
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.MainStatement).toMatch(/SELECT\s+\*\s+FROM\s+Filtered/i);
        });

        it('should accept a dialect parameter', () => {
            const sql = 'WITH A AS (SELECT 1) SELECT * FROM A';
            const result = MJSQLParser.ExtractCTEs(sql, 'PostgresQL');

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
        });
    });

    // ================================================================
    // ExtractCTEs - Real-World Queries
    // ================================================================
    describe('ExtractCTEs - Real-World Queries', () => {
        it('should extract 1 CTE from member-activity-counts (Nunjucks → regex fallback)', () => {
            const sql = `WITH MemberActivities AS (
    SELECT m.ID AS MemberID, m.FirstName, m.LastName, m.Email,
        COALESCE(evt.EventsAttended, 0) AS EventsAttended,
        COALESCE(crs.CoursesCompleted, 0) AS CoursesCompleted,
        (COALESCE(evt.EventsAttended, 0) + COALESCE(crs.CoursesCompleted, 0)) AS TotalActivityCount
    FROM [AssociationDemo].[vwMembers] m
    LEFT JOIN (
        SELECT er.MemberID, COUNT(DISTINCT er.ID) AS EventsRegistered,
            SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS EventsAttended
        FROM [AssociationDemo].[vwEventRegistrations] er
        GROUP BY er.MemberID
    ) evt ON m.ID = evt.MemberID
    LEFT JOIN (
        SELECT en.MemberID,
            SUM(CASE WHEN en.Status = 'Completed' THEN 1 ELSE 0 END) AS CoursesCompleted
        FROM [AssociationDemo].[vwEnrollments] en
        GROUP BY en.MemberID
    ) crs ON m.ID = crs.MemberID
)
SELECT *
FROM MemberActivities
{% if MinActivityCount %}
WHERE TotalActivityCount >= {{ MinActivityCount | sqlNumber }}
{% endif %}
ORDER BY TotalActivityCount DESC`;

            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(1);
            expect(result!.CTEDefinitions[0]).toMatch(/MemberActivities\s+AS\s*\(/i);
            expect(result!.MainStatement).toMatch(/^\s*SELECT/i);
            expect(result!.UsedASTParsing).toBe(false);
        });

        it('should extract 3 CTEs from chapter-engagement-summary (Nunjucks → regex fallback)', () => {
            const sql = `WITH ChapterMembers AS (
    SELECT c.ID AS ChapterID, c.Name AS ChapterName
    FROM [AssociationDemo].[vwChapters] c
    WHERE c.IsActive = 1
    {% if ChapterType %}AND c.ChapterType = '{{ ChapterType }}'{% endif %}
    GROUP BY c.ID, c.Name
),
ChapterEventActivity AS (
    SELECT cm.ChapterID, COUNT(DISTINCT er.EventID) AS UniqueEventsAttended
    FROM [AssociationDemo].[vwChapterMemberships] cm
    LEFT JOIN [AssociationDemo].[vwEventRegistrations] er ON cm.MemberID = er.MemberID
    GROUP BY cm.ChapterID
),
ChapterCourseActivity AS (
    SELECT cm.ChapterID, COUNT(DISTINCT en.CourseID) AS UniqueCoursesEnrolled
    FROM [AssociationDemo].[vwChapterMemberships] cm
    LEFT JOIN [AssociationDemo].[vwEnrollments] en ON cm.MemberID = en.MemberID
    GROUP BY cm.ChapterID
)
SELECT chmem.ChapterID, chmem.ChapterName
FROM ChapterMembers chmem
LEFT JOIN ChapterEventActivity chev ON chmem.ChapterID = chev.ChapterID
LEFT JOIN ChapterCourseActivity chcr ON chmem.ChapterID = chcr.ChapterID`;

            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(3);
            expect(result!.CTEDefinitions[0]).toMatch(/ChapterMembers\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[1]).toMatch(/ChapterEventActivity\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[2]).toMatch(/ChapterCourseActivity\s+AS\s*\(/i);
            expect(result!.UsedASTParsing).toBe(false);
        });

        it('should extract 2 CTEs from board-of-directors (no Nunjucks → AST path)', () => {
            const sql = `WITH board_committee AS (
    SELECT Id FROM nams.vwNU__Committee__cs
    WHERE Name = 'MSTA Board of Directors' AND NU__Type__c = 'Board'
),
current_members AS (
    SELECT cm.NU__Account__c, cm.CommitteePositionName__c
    FROM nams.vwNU__CommitteeMembership__cs cm
    INNER JOIN board_committee bc ON bc.Id = cm.NU__Committee__c
    WHERE cm.NU__State__c = 'Current' AND cm.IsDeleted = 0
)
SELECT a.FirstName, a.LastName
FROM current_members m
INNER JOIN nams.vwAccounts a ON a.Id = m.NU__Account__c
ORDER BY a.LastName, a.FirstName`;

            const result = MJSQLParser.ExtractCTEs(sql);

            expect(result).not.toBeNull();
            expect(result!.CTEDefinitions).toHaveLength(2);
            expect(result!.CTEDefinitions[0]).toMatch(/board_committee\s+AS\s*\(/i);
            expect(result!.CTEDefinitions[1]).toMatch(/current_members\s+AS\s*\(/i);
            expect(result!.UsedASTParsing).toBe(true);
        });
    });

    // ================================================================
    // ExtractCTEs - Non-CTE Queries
    // ================================================================
    describe('ExtractCTEs - Non-CTE Queries', () => {
        it('should return null for simple grouped query (no CTE)', () => {
            const sql = `SELECT mt.Name, COUNT(DISTINCT m.ID) AS ActiveMemberCount
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name`;

            expect(MJSQLParser.ExtractCTEs(sql)).toBeNull();
        });

        it('should return null for query with subquery in JOIN (no CTE)', () => {
            const sql = `SELECT e.ID, COALESCE(rev.TotalRevenue, 0) AS TotalRevenue
FROM [AssociationDemo].[vwEvents] e
LEFT JOIN (
    SELECT li.RelatedEntityID AS EventID, SUM(li.Amount) AS TotalRevenue
    FROM [AssociationDemo].[vwInvoiceLineItems] li
    GROUP BY li.RelatedEntityID
) rev ON e.ID = rev.EventID`;

            expect(MJSQLParser.ExtractCTEs(sql)).toBeNull();
        });

        it('should return null for Nunjucks query without CTE', () => {
            const sql = `SELECT YEAR(e.StartDate) AS EventYear
FROM [AssociationDemo].[vwEvents] e
{% if EventType %}
  AND e.EventType = '{{ EventType }}'
{% endif %}
GROUP BY YEAR(e.StartDate)`;

            expect(MJSQLParser.ExtractCTEs(sql)).toBeNull();
        });
    });

    // ================================================================
    // Astify / Sqlify
    // ================================================================
    describe('Astify', () => {
        it('should parse plain SQL into AST', () => {
            const result = MJSQLParser.Astify('SELECT Name FROM Users WHERE Active = 1');
            expect(result.astParsed).toBe(true);
            expect(result.mjParse.hasMJExtensions).toBe(false);
        });

        it('should parse MJ SQL with placeholder substitution', () => {
            const result = MJSQLParser.Astify('SELECT Name FROM Users WHERE Region = {{ Region | sqlString }}');
            expect(result.mjParse.hasMJExtensions).toBe(true);
            expect(result.mjParse.hasTemplateExpressions).toBe(true);
            expect(result.positionMap.size).toBe(1);
        });
    });

    describe('Sqlify', () => {
        it('should reconstruct plain SQL through AST', () => {
            const result = MJSQLParser.Astify('SELECT Name FROM Users WHERE Active = 1');
            const sql = MJSQLParser.Sqlify(result);
            expect(sql.toLowerCase()).toContain('select');
            expect(sql.toLowerCase()).toContain('from');
        });

        it('should reconstruct MJ SQL from tokens (verbatim)', () => {
            const original = "SELECT Name FROM Users WHERE Region = {{ Region | sqlString }}";
            const result = MJSQLParser.Astify(original);
            expect(MJSQLParser.Sqlify(result)).toBe(original);
        });
    });

    // ================================================================
    // Analyze
    // ================================================================
    describe('Analyze', () => {
        it('should detect no MJ extensions in plain SQL', () => {
            const result = MJSQLParser.Analyze('SELECT * FROM Users');
            expect(result.hasMJExtensions).toBe(false);
        });

        it('should detect template expressions', () => {
            const result = MJSQLParser.Analyze('WHERE x = {{ val | sqlString }}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasTemplateExpressions).toBe(true);
        });

        it('should detect composition refs', () => {
            const result = MJSQLParser.Analyze('FROM {{query:"Path/Query"}} q');
            expect(result.hasCompositionRefs).toBe(true);
        });

        it('should detect conditional blocks', () => {
            const result = MJSQLParser.Analyze('{% if A %}x{% endif %}');
            expect(result.hasConditionalBlocks).toBe(true);
        });
    });

    // ================================================================
    // Substitute
    // ================================================================
    describe('Substitute', () => {
        it('should return unchanged SQL for plain SQL', () => {
            const result = MJSQLParser.Substitute('SELECT * FROM Users');
            expect(result.cleanSQL).toBe('SELECT * FROM Users');
            expect(result.positionMap.size).toBe(0);
        });

        it('should replace sqlString with string placeholder', () => {
            const result = MJSQLParser.Substitute("WHERE x = {{ Region | sqlString }}");
            expect(result.cleanSQL).toContain("'__MJT_001__'");
            expect(result.positionMap.size).toBe(1);
        });

        it('should replace sqlNumber with numeric placeholder', () => {
            const result = MJSQLParser.Substitute("WHERE x >= {{ Min | sqlNumber }}");
            expect(result.cleanSQL).toContain('42001');
        });
    });
});
