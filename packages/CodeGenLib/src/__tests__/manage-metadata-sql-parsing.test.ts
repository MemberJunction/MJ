/**
 * Regression tests for SQL parsing in manage-metadata.ts.
 *
 * The buildSourceEntityContext method uses MJSQLParser.ExtractTableRefs()
 * to parse SQL Server view definitions and resolve table references to MJ entities.
 * These tests verify that the parser correctly handles the full range of view
 * definition patterns that CodeGen encounters in the wild.
 */
import { describe, it, expect } from 'vitest';
import { MJSQLParser } from '@memberjunction/sql-parser';

// ═══════════════════════════════════════════════════
// View definition patterns from real MJ databases
// ═══════════════════════════════════════════════════

describe('MJSQLParser.ExtractTableRefs — CodeGen View Definitions', () => {
    describe('Simple views', () => {
        it('should extract single table from simple view', () => {
            const sql = `CREATE VIEW [__mj].[vwUsers] AS
SELECT
    u.ID,
    u.Name,
    u.Email,
    u.Type,
    u.IsActive,
    u.__mj_CreatedAt,
    u.__mj_UpdatedAt
FROM
    [__mj].[User] u`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
            const userTable = tables.find(t => t.TableName === 'User');
            expect(userTable).toBeDefined();
            expect(userTable!.SchemaName).toBe('__mj');
        });

        it('should extract table with SELECT * view', () => {
            const sql = `CREATE VIEW [dbo].[vwCustomers] AS
SELECT * FROM [dbo].[Customer]`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
            expect(tables.find(t => t.TableName === 'Customer')).toBeDefined();
        });
    });

    describe('JOIN views', () => {
        it('should extract all tables from multi-join view', () => {
            const sql = `CREATE VIEW [__mj].[vwEntityPermissions] AS
SELECT
    ep.ID,
    ep.EntityID,
    e.Name AS Entity,
    ep.RoleID,
    r.Name AS RoleName,
    ep.CanCreate,
    ep.CanRead,
    ep.CanUpdate,
    ep.CanDelete
FROM
    [__mj].[EntityPermission] ep
INNER JOIN
    [__mj].[Entity] e ON ep.EntityID = e.ID
INNER JOIN
    [__mj].[Role] r ON ep.RoleID = r.ID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('EntityPermission');
            expect(tableNames).toContain('Entity');
            expect(tableNames).toContain('Role');
        });

        it('should extract tables from LEFT JOIN view', () => {
            const sql = `CREATE VIEW [__mj].[vwEntityFields] AS
SELECT
    ef.ID,
    ef.EntityID,
    e.Name AS Entity,
    ef.Name,
    ef.Type,
    ef.RelatedEntityID,
    re.Name AS RelatedEntity
FROM
    [__mj].[EntityField] ef
INNER JOIN
    [__mj].[Entity] e ON ef.EntityID = e.ID
LEFT JOIN
    [__mj].[Entity] re ON ef.RelatedEntityID = re.ID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            // Entity appears twice (different aliases) — deduplicated by schema.table
            const entityRefs = tables.filter(t => t.TableName === 'Entity');
            expect(entityRefs.length).toBe(1); // deduplication
        });
    });

    describe('Subquery views', () => {
        it('should extract tables from view with subqueries in SELECT', () => {
            const sql = `CREATE VIEW [__mj].[vwEntities] AS
SELECT
    e.ID,
    e.Name,
    e.SchemaName,
    e.BaseTable,
    e.BaseView,
    (SELECT COUNT(*) FROM [__mj].[EntityField] ef WHERE ef.EntityID = e.ID) AS FieldCount,
    (SELECT COUNT(*) FROM [__mj].[EntityPermission] ep WHERE ep.EntityID = e.ID) AS PermissionCount
FROM
    [__mj].[Entity] e`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('Entity');
            expect(tableNames).toContain('EntityField');
            expect(tableNames).toContain('EntityPermission');
        });

        it('should extract tables from view with derived table in FROM', () => {
            const sql = `CREATE VIEW [__mj].[vwAIModelCosts] AS
SELECT
    mc.ID,
    mc.ModelID,
    m.Name AS Model,
    mc.InputCostPer1K,
    mc.OutputCostPer1K
FROM
    [__mj].[AIModelCost] mc
INNER JOIN
    [__mj].[AIModel] m ON mc.ModelID = m.ID
INNER JOIN (
    SELECT ModelID, MAX(EffectiveDate) AS MaxDate
    FROM [__mj].[AIModelCost]
    GROUP BY ModelID
) latest ON mc.ModelID = latest.ModelID AND mc.EffectiveDate = latest.MaxDate`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('AIModelCost');
            expect(tableNames).toContain('AIModel');
        });
    });

    describe('Cross-schema views', () => {
        it('should extract tables with different schemas', () => {
            const sql = `CREATE VIEW [AssociationDemo].[vwChapterMemberships] AS
SELECT
    cm.ID,
    cm.ChapterID,
    c.Name AS Chapter,
    cm.MemberID,
    m.FirstName,
    m.LastName,
    cm.Status,
    cm.JoinDate
FROM
    [AssociationDemo].[ChapterMembership] cm
INNER JOIN
    [AssociationDemo].[Chapter] c ON cm.ChapterID = c.ID
INNER JOIN
    [AssociationDemo].[Member] m ON cm.MemberID = m.ID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
            expect(tables.every(t => t.SchemaName === 'AssociationDemo')).toBe(true);
        });

        it('should extract tables from view joining across schemas', () => {
            const sql = `CREATE VIEW [dbo].[vwCrossSchemaReport] AS
SELECT
    a.ID,
    a.Name,
    b.Value
FROM
    [SchemaA].[TableOne] a
INNER JOIN
    [SchemaB].[TableTwo] b ON a.ID = b.RefID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBe(2);
            expect(tables.find(t => t.SchemaName === 'SchemaA' && t.TableName === 'TableOne')).toBeDefined();
            expect(tables.find(t => t.SchemaName === 'SchemaB' && t.TableName === 'TableTwo')).toBeDefined();
        });
    });

    describe('CTE views', () => {
        it('should extract tables from view with CTE', () => {
            const sql = `CREATE VIEW [__mj].[vwRecordChangeHistory] AS
WITH LatestChanges AS (
    SELECT
        rc.ID,
        rc.EntityID,
        rc.RecordID,
        rc.ChangedAt,
        ROW_NUMBER() OVER (PARTITION BY rc.EntityID, rc.RecordID ORDER BY rc.ChangedAt DESC) AS rn
    FROM
        [__mj].[RecordChange] rc
)
SELECT
    lc.ID,
    lc.EntityID,
    e.Name AS Entity,
    lc.RecordID,
    lc.ChangedAt
FROM
    LatestChanges lc
INNER JOIN
    [__mj].[Entity] e ON lc.EntityID = e.ID
WHERE
    lc.rn = 1`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('RecordChange');
            expect(tableNames).toContain('Entity');
        });
    });

    describe('Complex real-world view patterns', () => {
        it('should handle view with CASE expressions and aggregates', () => {
            const sql = `CREATE VIEW [AssociationDemo].[vwMemberEngagement] AS
SELECT
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    COUNT(DISTINCT er.EventID) AS EventsAttended,
    SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS CoursesCompleted,
    CASE
        WHEN COUNT(DISTINCT er.EventID) > 10 THEN 'High'
        WHEN COUNT(DISTINCT er.EventID) > 3 THEN 'Medium'
        ELSE 'Low'
    END AS EngagementLevel
FROM
    [AssociationDemo].[Member] m
LEFT JOIN
    [AssociationDemo].[EventRegistration] er ON m.ID = er.MemberID AND er.Status = 'Attended'
LEFT JOIN
    [AssociationDemo].[Enrollment] e ON m.ID = e.MemberID
GROUP BY
    m.ID, m.FirstName, m.LastName`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('Member');
            expect(tableNames).toContain('EventRegistration');
            expect(tableNames).toContain('Enrollment');
        });

        it('should handle view with EXISTS subquery', () => {
            const sql = `CREATE VIEW [__mj].[vwActiveEntities] AS
SELECT
    e.ID,
    e.Name,
    e.SchemaName,
    e.BaseTable
FROM
    [__mj].[Entity] e
WHERE
    e.IsActive = 1
    AND EXISTS (
        SELECT 1 FROM [__mj].[EntityPermission] ep
        WHERE ep.EntityID = e.ID AND ep.CanRead = 1
    )`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('Entity');
            expect(tableNames).toContain('EntityPermission');
        });

        it('should handle view with UNION ALL', () => {
            const sql = `CREATE VIEW [__mj].[vwAllAuditLogs] AS
SELECT ID, EntityName, Action, 'RecordChange' AS Source FROM [__mj].[RecordChange]
UNION ALL
SELECT ID, EntityName, Action, 'AuditLog' AS Source FROM [__mj].[AuditLog]`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('RecordChange');
            expect(tableNames).toContain('AuditLog');
        });

        it('should handle view referencing other views (not just tables)', () => {
            // CodeGen encounters views that reference other views
            const sql = `CREATE VIEW [__mj].[vwUserNotifications] AS
SELECT
    n.ID,
    n.UserID,
    u.Name AS UserName,
    n.Message,
    n.IsRead,
    n.CreatedAt
FROM
    [__mj].[Notification] n
INNER JOIN
    [__mj].[vwUsers] u ON n.UserID = u.ID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('Notification');
            expect(tableNames).toContain('vwUsers');
        });
    });

    describe('Edge cases for view definitions', () => {
        it('should handle view without CREATE VIEW prefix (just the SELECT)', () => {
            // Sometimes only the SELECT body is passed (already stripped of CREATE VIEW)
            const sql = `SELECT u.ID, u.Name, u.Email
FROM [__mj].[User] u
WHERE u.IsActive = 1`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBe(1);
            expect(tables[0].TableName).toBe('User');
        });

        it('should handle empty or null SQL gracefully', () => {
            expect(MJSQLParser.ExtractTableRefs('')).toEqual([]);
            expect(MJSQLParser.ExtractTableRefs('   ')).toEqual([]);
        });

        it('should handle view with no FROM clause', () => {
            const sql = `CREATE VIEW [dbo].[vwConstants] AS
SELECT 1 AS One, 'Hello' AS Greeting, GETDATE() AS Now`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables).toHaveLength(0);
        });

        it('should handle view with APPLY operator', () => {
            const sql = `CREATE VIEW [__mj].[vwEntityWithLatestField] AS
SELECT
    e.ID,
    e.Name,
    lf.FieldName AS LatestFieldName
FROM
    [__mj].[Entity] e
CROSS APPLY (
    SELECT TOP 1 ef.Name AS FieldName
    FROM [__mj].[EntityField] ef
    WHERE ef.EntityID = e.ID
    ORDER BY ef.__mj_UpdatedAt DESC
) lf`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(2);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('Entity');
            expect(tableNames).toContain('EntityField');
        });

        it('should deduplicate when same table appears multiple times', () => {
            const sql = `SELECT
    p.ID,
    p.Name AS ParentName,
    c.Name AS ChildName
FROM [__mj].[Entity] p
INNER JOIN [__mj].[Entity] c ON p.ID = c.ParentID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            // Entity appears twice but should be deduplicated
            const entityRefs = tables.filter(t => t.TableName === 'Entity');
            expect(entityRefs).toHaveLength(1);
        });
    });
});
