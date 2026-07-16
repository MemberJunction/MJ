/**
 * Unit tests for the full query extraction pipeline: parseQuerySQL → BuildFieldsFromSelectColumns.
 *
 * These tests validate the end-to-end deterministic extraction path that Skip uses
 * when processing ground truth queries. Each test feeds real-world SQL through the
 * pipeline and verifies that fields, parameters, and table refs are correctly extracted.
 *
 * Both T-SQL and PostgreSQL variants are tested side-by-side to verify cross-dialect parity.
 */
import { describe, it, expect } from 'vitest';
import { parseQuerySQL } from '../custom/query-extraction/parse';
import { BuildFieldsFromSelectColumns } from '../custom/query-extraction/resolve';
import type { DatabasePlatform } from '@memberjunction/core';

// Helper: run the full deterministic extraction pipeline (parse + field build)
function extractFields(sql: string, platform: DatabasePlatform = 'sqlserver') {
    const parseResult = parseQuerySQL(sql, platform);
    return {
        fields: BuildFieldsFromSelectColumns(parseResult.selectColumns),
        params: parseResult.deterministicParams,
        tables: parseResult.tableRefs,
        selectColumns: parseResult.selectColumns,
        analysis: parseResult.analysis,
    };
}

// ═══════════════════════════════════════════════════
// Active Members By Membership Type
// ═══════════════════════════════════════════════════

const ACTIVE_MEMBERS_TSQL = `SELECT
    mt.Name AS MembershipType,
    mt.AnnualDues,
    COUNT(DISTINCT m.ID) AS ActiveMemberCount,
    ROUND(
        (COUNT(DISTINCT m.ID) * 100.0 / SUM(COUNT(DISTINCT m.ID)) OVER ()),
        1
    ) AS PercentageOfTotal,
    MIN(ms.StartDate) AS EarliestMembership,
    MAX(ms.StartDate) AS LatestMembership
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name, mt.AnnualDues
ORDER BY ActiveMemberCount DESC`;

const ACTIVE_MEMBERS_PG = `SELECT
    mt."Name" AS membershiptype,
    mt."AnnualDues" AS annualdues,
    COUNT(DISTINCT m."ID") AS activemembercount,
    ROUND(
        (COUNT(DISTINCT m."ID") * 100.0 / SUM(COUNT(DISTINCT m."ID")) OVER ())::numeric,
        1
    ) AS percentageoftotal,
    MIN(ms."StartDate") AS earliestmembership,
    MAX(ms."StartDate") AS latestmembership
FROM associationdemo."vwMemberships" ms
INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
INNER JOIN associationdemo."vwMembers" m ON ms."MemberID" = m."ID"
WHERE ms."Status" = 'Active'
GROUP BY mt."Name", mt."AnnualDues"
ORDER BY activemembercount DESC`;

describe('Pipeline: Active Members By Membership Type', () => {
    it('T-SQL: should extract 6 fields (2 direct, 4 computed)', () => {
        const { fields, tables } = extractFields(ACTIVE_MEMBERS_TSQL, 'sqlserver');

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(6);
        expect(fields!.filter(f => !f.isComputed)).toHaveLength(2);
        expect(fields!.filter(f => f.isComputed)).toHaveLength(4);

        expect(tables.length).toBeGreaterThanOrEqual(3);
    });

    it('PostgreSQL: should extract 6 fields (2 direct, 4 computed)', () => {
        const { fields, tables } = extractFields(ACTIVE_MEMBERS_PG, 'postgresql');

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(6);
        expect(fields!.filter(f => !f.isComputed)).toHaveLength(2);
        expect(fields!.filter(f => f.isComputed)).toHaveLength(4);

        expect(tables.length).toBeGreaterThanOrEqual(3);
    });

    it('should produce same field count and computed classification across dialects', () => {
        const tsql = extractFields(ACTIVE_MEMBERS_TSQL, 'sqlserver');
        const pg = extractFields(ACTIVE_MEMBERS_PG, 'postgresql');

        expect(tsql.fields!.length).toBe(pg.fields!.length);
        expect(tsql.fields!.filter(f => f.isComputed).length).toBe(
            pg.fields!.filter(f => f.isComputed).length
        );
    });

    it('should resolve source columns correctly on PG', () => {
        const { fields } = extractFields(ACTIVE_MEMBERS_PG, 'postgresql');

        const mt = fields!.find(f => f.name === 'membershiptype')!;
        expect(mt.sourceFieldName).toBe('Name');

        const dues = fields!.find(f => f.name === 'annualdues')!;
        expect(dues.sourceFieldName).toBe('AnnualDues');

        // Aggregates should not have source fields
        const count = fields!.find(f => f.name === 'activemembercount')!;
        expect(count.sourceFieldName).toBeNull();
    });
});

// ═══════════════════════════════════════════════════
// Member Lifetime Revenue (templated with CTEs)
// ═══════════════════════════════════════════════════

const MEMBER_REVENUE_TSQL = `WITH CurrentMembership AS (
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
SELECT m.ID AS MemberID, m.FirstName, m.LastName, m.Email,
       m.JoinDate, YEAR(m.JoinDate) AS JoinYear,
       cm.MembershipType AS CurrentMembershipType,
       COALESCE(rev.TotalRevenue, 0) AS TotalRevenue,
       COALESCE(rev.InvoiceCount, 0) AS InvoiceCount
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

const MEMBER_REVENUE_PG = `WITH CurrentMembership AS (
    SELECT ms."MemberID" AS memberid, mt."Name" AS membershiptype,
           ROW_NUMBER() OVER (PARTITION BY ms."MemberID" ORDER BY ms."StartDate" DESC) AS rn
    FROM associationdemo."vwMemberships" ms
    INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
    WHERE ms."Status" = 'Active'
),
MemberRevenue AS (
    SELECT i."MemberID" AS memberid, COUNT(DISTINCT i."ID") AS invoicecount, SUM(li."Amount") AS totalrevenue
    FROM associationdemo."vwInvoices" i
    INNER JOIN associationdemo."vwInvoiceLineItems" li ON i."ID" = li."InvoiceID"
    WHERE i."Status" NOT IN ('Cancelled', 'Refunded')
    GROUP BY i."MemberID"
)
SELECT m."ID" AS memberid, m."FirstName" AS firstname, m."LastName" AS lastname, m."Email" AS email,
       m."JoinDate" AS joindate, EXTRACT(YEAR FROM m."JoinDate")::INTEGER AS joinyear,
       cm.membershiptype AS currentmembershiptype,
       COALESCE(rev.totalrevenue, 0) AS totalrevenue,
       COALESCE(rev.invoicecount, 0) AS invoicecount
FROM associationdemo."vwMembers" m
LEFT JOIN CurrentMembership cm ON m."ID" = cm.memberid AND cm.rn = 1
LEFT JOIN MemberRevenue rev ON m."ID" = rev.memberid
WHERE 1=1
{% if JoinYear %}
  AND EXTRACT(YEAR FROM m."JoinDate")::INTEGER = {{ JoinYear | sqlNumber }}
{% endif %}
{% if MembershipType %}
  AND cm.membershiptype = '{{ MembershipType }}'
{% endif %}
ORDER BY COALESCE(rev.totalrevenue, 0) DESC`;

describe('Pipeline: Member Lifetime Revenue (CTE + Templates)', () => {
    // CTE queries with Nunjucks templates inside the CTE body cause the AST parser
    // to fail (template placeholders break the SQL syntax). The parser falls back
    // to regex-based CTE extraction, but ExtractSelectColumns returns empty because
    // the cleaned SQL isn't parseable. This is expected — field extraction for
    // templated CTE queries relies on the LLM enrichment stage (not tested here).
    //
    // These tests verify that parameters ARE extracted (template expressions are
    // dialect-agnostic and parsed before AST), and that the analysis flags are correct.

    it('T-SQL: should extract parameters even when field extraction fails', () => {
        const { params, analysis } = extractFields(MEMBER_REVENUE_TSQL, 'sqlserver');

        expect(params).toHaveLength(2);
        expect(params.find(p => p.name === 'JoinYear')!.type).toBe('number');
        expect(params.find(p => p.name === 'MembershipType')).toBeDefined();

        expect(analysis.hasTemplateExpressions).toBe(true);
        expect(analysis.hasConditionalBlocks).toBe(true);
    });

    it('PostgreSQL: should extract parameters even when field extraction fails', () => {
        const { params, analysis } = extractFields(MEMBER_REVENUE_PG, 'postgresql');

        expect(params).toHaveLength(2);
        expect(params.find(p => p.name === 'JoinYear')!.type).toBe('number');
        expect(params.find(p => p.name === 'MembershipType')).toBeDefined();

        expect(analysis.hasTemplateExpressions).toBe(true);
        expect(analysis.hasConditionalBlocks).toBe(true);
    });

    it('should produce same parameter count across dialects', () => {
        const tsql = extractFields(MEMBER_REVENUE_TSQL, 'sqlserver');
        const pg = extractFields(MEMBER_REVENUE_PG, 'postgresql');
        expect(tsql.params.length).toBe(pg.params.length);
    });

    it('field extraction returns null for templated CTE queries (LLM needed)', () => {
        // This documents the known limitation: field extraction for queries with
        // Nunjucks inside CTEs requires the LLM enrichment stage.
        const { fields } = extractFields(MEMBER_REVENUE_PG, 'postgresql');
        expect(fields).toBeNull();
    });
});

// ═══════════════════════════════════════════════════
// Chapter Engagement Summary (3 CTEs, templates)
// ═══════════════════════════════════════════════════

const CHAPTER_ENGAGEMENT_PG = `WITH ChapterMembers AS (
    SELECT c."ID" AS chapterid, c."Name" AS chaptername, c."ChapterType" AS chaptertype,
           c."Region" AS region, c."State" AS state,
           COUNT(DISTINCT cm."MemberID") AS activemembercount,
           AVG(EXTRACT(EPOCH FROM NOW() - m."JoinDate") / 86400)::numeric AS avgmembertenuredays
    FROM associationdemo."vwChapters" c
    INNER JOIN associationdemo."vwChapterMemberships" cm ON c."ID" = cm."ChapterID"
    INNER JOIN associationdemo."vwMembers" m ON cm."MemberID" = m."ID"
    WHERE c."IsActive" = true
    {% if ChapterType %}AND c."ChapterType" = '{{ ChapterType }}'{% endif %}
    {% if Region %}AND c."Region" = '{{ Region }}'{% endif %}
    GROUP BY c."ID", c."Name", c."ChapterType", c."Region", c."State"
),
ChapterEventActivity AS (
    SELECT cm."ChapterID" AS chapterid,
           COUNT(DISTINCT er."EventID") AS uniqueeventsattended,
           SUM(CASE WHEN er."Status" = 'Registered' THEN 1 ELSE 0 END) AS totalregistrations,
           SUM(CASE WHEN er."Status" = 'Attended' THEN 1 ELSE 0 END) AS totalattendances
    FROM associationdemo."vwChapterMemberships" cm
    LEFT JOIN associationdemo."vwEventRegistrations" er ON cm."MemberID" = er."MemberID"
    GROUP BY cm."ChapterID"
),
ChapterCourseActivity AS (
    SELECT cm."ChapterID" AS chapterid,
           COUNT(DISTINCT en."CourseID") AS uniquecoursesenrolled,
           SUM(CASE WHEN en."Status" = 'Completed' THEN 1 ELSE 0 END) AS coursecompletions
    FROM associationdemo."vwChapterMemberships" cm
    LEFT JOIN associationdemo."vwEnrollments" en ON cm."MemberID" = en."MemberID"
    GROUP BY cm."ChapterID"
)
SELECT chmem.chapterid, chmem.chaptername, chmem.chaptertype, chmem.region, chmem.state,
       chmem.activemembercount, chmem.avgmembertenuredays,
       COALESCE(chev.uniqueeventsattended, 0) AS uniqueeventsattended,
       COALESCE(chev.totalregistrations, 0) AS totalregistrations,
       COALESCE(chev.totalattendances, 0) AS totalattendances,
       COALESCE(chcr.uniquecoursesenrolled, 0) AS uniquecoursesenrolled,
       COALESCE(chcr.coursecompletions, 0) AS coursecompletions
FROM ChapterMembers chmem
LEFT JOIN ChapterEventActivity chev ON chmem.chapterid = chev.chapterid
LEFT JOIN ChapterCourseActivity chcr ON chmem.chapterid = chcr.chapterid`;

describe('Pipeline: Chapter Engagement Summary (3 CTEs)', () => {
    // This query has Nunjucks templates inside the CTE body, so AST field extraction
    // fails. Parameters are still extracted because template parsing is pre-AST.
    // Field extraction for this pattern requires the LLM enrichment stage.

    it('should extract 2 parameters (ChapterType, Region)', () => {
        const { params } = extractFields(CHAPTER_ENGAGEMENT_PG, 'postgresql');

        expect(params).toHaveLength(2);
        const names = params.map(p => p.name).sort();
        expect(names).toEqual(['ChapterType', 'Region']);
        expect(params.every(p => !p.isRequired)).toBe(true);
    });

    it('field extraction returns null for templated CTE queries (LLM needed)', () => {
        const { fields } = extractFields(CHAPTER_ENGAGEMENT_PG, 'postgresql');
        expect(fields).toBeNull();
    });
});

// ═══════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════

describe('Pipeline: Edge cases', () => {
    it('should return null fields for SELECT *', () => {
        const { fields } = extractFields('SELECT * FROM "Users"', 'postgresql');
        expect(fields).toBeNull();
    });

    it('should return empty params for non-templated SQL', () => {
        const { params } = extractFields(ACTIVE_MEMBERS_PG, 'postgresql');
        expect(params).toHaveLength(0);
    });

    it('should handle empty SQL gracefully', () => {
        const { fields, params, tables } = extractFields('', 'postgresql');
        expect(fields).toBeNull();
        expect(params).toHaveLength(0);
        expect(tables).toHaveLength(0);
    });

    it('should handle SQL with only Nunjucks (no valid SELECT)', () => {
        const { fields } = extractFields('{% if x %}SELECT 1{% endif %}', 'postgresql');
        // After template cleaning, this may or may not parse — either way should not throw
        expect(fields === null || Array.isArray(fields)).toBe(true);
    });
});
