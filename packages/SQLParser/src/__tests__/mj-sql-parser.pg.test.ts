/**
 * PostgreSQL equivalents of mj-sql-parser.test.ts.
 *
 * Covers the MJ parser extensions (Nunjucks templates, composition refs,
 * conditional blocks, parameter extraction) using PostgreSQL SQL syntax.
 *
 * Template expressions ({{ var | filter }}) and conditional blocks ({% if %})
 * are dialect-agnostic, but the surrounding SQL uses PG quoting conventions,
 * which exercises the parser's PG code path for identifier unwrapping.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';

const pgDialect = new PostgreSQLDialect();
const mjAstify = (sql: string) => SQLParser.Astify(sql, pgDialect);
const mjSqlify = SQLParser.Sqlify.bind(SQLParser);
const extractTemplateExpressions = SQLParser.ExtractTemplateExpressions.bind(SQLParser);
const extractCompositionRefs = SQLParser.ExtractCompositionRefs.bind(SQLParser);
const extractConditionalBlocks = SQLParser.ExtractConditionalBlocks.bind(SQLParser);
const extractParameterInfo = SQLParser.ExtractParameterInfo.bind(SQLParser);
const extractSelectColumns = (sql: string) => SQLParser.ExtractSelectColumns(sql, pgDialect);

// ═══════════════════════════════════════════════════
// Real-world PostgreSQL SQL query snippets
// ═══════════════════════════════════════════════════

const PLAIN_PG_SQL = `SELECT u."Name", r."RoleName"
FROM "Users" u
INNER JOIN "Roles" r ON u."RoleID" = r."ID"
WHERE u."Active" = true
ORDER BY u."Name"`;

const MEMBER_LIFETIME_REVENUE_PG = `SELECT m."ID" AS memberid, m."FirstName" AS firstname
FROM associationdemo."vwMembers" m
WHERE 1=1
{% if JoinYear %}
  AND EXTRACT(YEAR FROM m."JoinDate")::INTEGER = {{ JoinYear | sqlNumber }}
{% endif %}
{% if MembershipType %}
  AND cm.membershiptype = '{{ MembershipType }}'
{% endif %}
ORDER BY totalrevenue DESC`;

const COURSE_ENROLLMENT_PG = `SELECT c."ID" AS courseid, c."Title" AS title
FROM associationdemo."vwCourses" c
WHERE c."IsActive" = true
{% if Category %}
  AND c."Category" = '{{ Category }}'
{% endif %}
{% if StartDate %}
  AND e."EnrollmentDate" >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
  AND e."EnrollmentDate" < {{ EndDate | sqlDate }}
{% endif %}
GROUP BY c."ID", c."Title"`;

const COMPOSITION_QUERY_PG = `WITH PrimaryChapters AS (
    SELECT cm."MemberID" AS memberid FROM associationdemo."vwChapterMemberships" cm
)
SELECT mac.memberid, pc.chapterid
FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount)"}} mac
LEFT JOIN PrimaryChapters pc ON mac.memberid = pc.memberid
{% if Region %}
WHERE pc.region = {{ Region | sqlString }}
{% endif %}`;

const ACTIVE_MEMBERS_PG = `SELECT
    mt."Name" AS membershiptype,
    mt."AnnualDues" AS annualdues,
    COUNT(DISTINCT m."ID") AS activemembercount,
    MIN(ms."StartDate") AS earliestmembership,
    MAX(ms."StartDate") AS latestmembership
FROM associationdemo."vwMemberships" ms
INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
INNER JOIN associationdemo."vwMembers" m ON ms."MemberID" = m."ID"
WHERE ms."Status" = 'Active'
GROUP BY mt."Name", mt."AnnualDues"
ORDER BY activemembercount DESC`;

// ═══════════════════════════════════════════════════
// mjAstify — PostgreSQL
// ═══════════════════════════════════════════════════

describe('mjAstify (PostgreSQL)', () => {
    it('should parse plain PG SQL (no MJ extensions)', () => {
        const result = mjAstify(PLAIN_PG_SQL);
        expect(result.astParsed).toBe(true);
        expect(result.mjParse.hasMJExtensions).toBe(false);
        expect(result.positionMap.size).toBe(0);
    });

    it('should parse templated PG SQL with number and string filters', () => {
        const result = mjAstify(MEMBER_LIFETIME_REVENUE_PG);
        expect(result.mjParse.hasMJExtensions).toBe(true);
        expect(result.mjParse.hasTemplateExpressions).toBe(true);
        expect(result.mjParse.hasConditionalBlocks).toBe(true);
        expect(result.positionMap.size).toBe(2); // JoinYear, MembershipType
    });

    it('should parse templated PG SQL with date filters', () => {
        const result = mjAstify(COURSE_ENROLLMENT_PG);
        expect(result.mjParse.hasMJExtensions).toBe(true);
        expect(result.positionMap.size).toBe(3); // Category, StartDate, EndDate
    });

    it('should parse PG SQL with composition references', () => {
        const result = mjAstify(COMPOSITION_QUERY_PG);
        expect(result.mjParse.hasCompositionRefs).toBe(true);
        expect(result.mjParse.hasTemplateExpressions).toBe(true);
        expect(result.mjParse.hasConditionalBlocks).toBe(true);
    });

    it('should produce parseable clean SQL for plain PG queries', () => {
        const result = mjAstify(ACTIVE_MEMBERS_PG);
        expect(result.cleanSQL).not.toContain('{{');
        expect(result.cleanSQL).not.toContain('{%');
        expect(result.astParsed).toBe(true);
    });
});

describe('mjSqlify (PostgreSQL)', () => {
    it('should reconstruct MJ PG SQL from tokens (preserving original)', () => {
        const original = MEMBER_LIFETIME_REVENUE_PG;
        const result = mjAstify(original);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(original);
    });

    it('should reconstruct composition PG SQL from tokens', () => {
        const original = COMPOSITION_QUERY_PG;
        const result = mjAstify(original);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(original);
    });

    it('should round-trip all PG templated queries', () => {
        const queries = [
            MEMBER_LIFETIME_REVENUE_PG,
            COURSE_ENROLLMENT_PG,
            COMPOSITION_QUERY_PG,
        ];
        for (const sql of queries) {
            const result = mjAstify(sql);
            expect(mjSqlify(result)).toBe(sql);
        }
    });
});

// ═══════════════════════════════════════════════════
// extractTemplateExpressions — PostgreSQL SQL context
// ═══════════════════════════════════════════════════

describe('extractTemplateExpressions (PostgreSQL)', () => {
    it('should extract no expressions from plain PG SQL', () => {
        expect(extractTemplateExpressions(PLAIN_PG_SQL)).toHaveLength(0);
    });

    it('should extract template expressions from PG member-lifetime-revenue', () => {
        const exprs = extractTemplateExpressions(MEMBER_LIFETIME_REVENUE_PG);
        expect(exprs).toHaveLength(2);

        const joinYear = exprs.find(e => e.variable === 'JoinYear')!;
        expect(joinYear).toBeDefined();
        expect(joinYear.filters[0].name).toBe('sqlNumber');

        const membershipType = exprs.find(e => e.variable === 'MembershipType')!;
        expect(membershipType).toBeDefined();
    });

    it('should extract date-filtered expressions from PG course-enrollment', () => {
        const exprs = extractTemplateExpressions(COURSE_ENROLLMENT_PG);
        const dateExprs = exprs.filter(e => e.filters.some(f => f.name === 'sqlDate'));
        expect(dateExprs).toHaveLength(2);
    });
});

// ═══════════════════════════════════════════════════
// extractCompositionRefs — PostgreSQL SQL context
// ═══════════════════════════════════════════════════

describe('extractCompositionRefs (PostgreSQL)', () => {
    it('should extract no refs from plain PG SQL', () => {
        expect(extractCompositionRefs(PLAIN_PG_SQL)).toHaveLength(0);
    });

    it('should extract composition reference with parameters from PG SQL', () => {
        const refs = extractCompositionRefs(COMPOSITION_QUERY_PG);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Engagement Analytics');
        expect(refs[0].queryName).toBe('Member Activity Counts');
        expect(refs[0].parameters).toHaveLength(1);
        expect(refs[0].parameters[0].key).toBe('MinActivityCount');
        expect(refs[0].parameters[0].isPassThrough).toBe(true);
    });
});

// ═══════════════════════════════════════════════════
// extractConditionalBlocks — PostgreSQL SQL context
// ═══════════════════════════════════════════════════

describe('extractConditionalBlocks (PostgreSQL)', () => {
    it('should extract no blocks from plain PG SQL', () => {
        expect(extractConditionalBlocks(PLAIN_PG_SQL)).toHaveLength(0);
    });

    it('should extract if/endif blocks from PG member-lifetime-revenue', () => {
        const blocks = extractConditionalBlocks(MEMBER_LIFETIME_REVENUE_PG);
        expect(blocks.length).toBeGreaterThanOrEqual(2);

        for (const block of blocks) {
            expect(block.branches.length).toBeGreaterThanOrEqual(1);
            expect(block.branches[0].condition).not.toBeNull();
        }
    });
});

// ═══════════════════════════════════════════════════
// extractParameterInfo — PostgreSQL SQL context
// ═══════════════════════════════════════════════════

describe('extractParameterInfo (PostgreSQL)', () => {
    it('should return empty for plain PG SQL', () => {
        expect(extractParameterInfo(PLAIN_PG_SQL)).toHaveLength(0);
    });

    it('should extract parameter info from PG member-lifetime-revenue', () => {
        const params = extractParameterInfo(MEMBER_LIFETIME_REVENUE_PG);

        const joinYear = params.find(p => p.name === 'JoinYear')!;
        expect(joinYear).toBeDefined();
        expect(joinYear.type).toBe('number');
        expect(joinYear.isRequired).toBe(false);

        const membershipType = params.find(p => p.name === 'MembershipType')!;
        expect(membershipType).toBeDefined();
        expect(membershipType.isRequired).toBe(false);
    });

    it('should extract parameter info from PG course-enrollment', () => {
        const params = extractParameterInfo(COURSE_ENROLLMENT_PG);
        expect(params).toHaveLength(3);

        const startDate = params.find(p => p.name === 'StartDate')!;
        expect(startDate.type).toBe('date');
        expect(startDate.isRequired).toBe(false);

        const endDate = params.find(p => p.name === 'EndDate')!;
        expect(endDate.type).toBe('date');
    });

    it('should detect required parameters outside conditionals in PG SQL', () => {
        const sql = `SELECT * FROM "Members" WHERE EXTRACT(YEAR FROM "JoinDate") = {{ Year | sqlNumber }}`;
        const params = extractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Year');
        expect(params[0].type).toBe('number');
        expect(params[0].isRequired).toBe(true);
    });

    it('should detect default values from filter chain in PG SQL', () => {
        const sql = `WHERE "Limit" = {{ Limit | default(10) | sqlNumber }}`;
        const params = extractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].defaultValue).toBe(10);
    });

    it('should map all SQL filter types correctly (dialect-agnostic)', () => {
        const sql = `{{ a | sqlString }} {{ b | sqlNumber }} {{ c | sqlDate }}
{{ d | sqlBoolean }} {{ e | sqlIn }} {{ f | sqlIdentifier }} {{ g }}`;
        const params = extractParameterInfo(sql);
        const typeMap: Record<string, string> = {};
        for (const p of params) typeMap[p.name] = p.type;

        expect(typeMap['a']).toBe('string');
        expect(typeMap['b']).toBe('number');
        expect(typeMap['c']).toBe('date');
        expect(typeMap['d']).toBe('boolean');
        expect(typeMap['e']).toBe('array');
        expect(typeMap['f']).toBe('string');
        expect(typeMap['g']).toBe('unknown');
    });

    it('should extract string default from else branch in PG SQL', () => {
        const sql = `SELECT * FROM "Members" WHERE 1=1
{% if Status and Status.length > 0 %}
  AND "Status" IN {{ Status | sqlIn }}
{% else %}
  AND "Status" = 'Active'
{% endif %}`;
        const params = extractParameterInfo(sql);
        const status = params.find(p => p.name === 'Status');
        expect(status).toBeDefined();
        expect(status!.type).toBe('array');
        expect(status!.defaultValue).toBe('Active');
    });
});

// ═══════════════════════════════════════════════════
// extractSelectColumns — PostgreSQL
// ═══════════════════════════════════════════════════

describe('extractSelectColumns (PostgreSQL)', () => {
    it('should extract double-quoted columns with table qualifiers', () => {
        const cols = extractSelectColumns('SELECT u."Name", u."Email" FROM "Users" u');
        expect(cols).toHaveLength(2);

        const name = cols.find(c => c.OutputName === 'Name')!;
        expect(name).toBeDefined();
        expect(name.SourceColumn).toBe('Name');
        expect(name.TableQualifier).toBe('u');
        expect(name.IsExpression).toBe(false);
    });

    it('should extract AS aliases with correct OutputName and SourceColumn', () => {
        const cols = extractSelectColumns('SELECT e."Name" AS entityname, e."ID" AS entityid FROM "Entities" e');
        expect(cols).toHaveLength(2);

        expect(cols[0].OutputName).toBe('entityname');
        expect(cols[0].SourceColumn).toBe('Name');
        expect(cols[0].TableQualifier).toBe('e');
    });

    it('should mark aggregates as expressions', () => {
        const cols = extractSelectColumns('SELECT COUNT(*) AS usercount, MAX(u."CreatedAt") AS newest FROM "Users" u');
        expect(cols).toHaveLength(2);
        expect(cols[0].IsExpression).toBe(true);
        expect(cols[1].IsExpression).toBe(true);
    });

    it('should handle real-world PG query with EXTRACT and ::cast', () => {
        const cols = extractSelectColumns(ACTIVE_MEMBERS_PG);
        expect(cols).toHaveLength(5);

        const mt = cols.find(c => c.OutputName === 'membershiptype')!;
        expect(mt).toBeDefined();
        expect(mt.SourceColumn).toBe('Name');
        expect(mt.IsExpression).toBe(false);

        const dues = cols.find(c => c.OutputName === 'annualdues')!;
        expect(dues).toBeDefined();
        expect(dues.SourceColumn).toBe('AnnualDues');
        expect(dues.IsExpression).toBe(false);

        const count = cols.find(c => c.OutputName === 'activemembercount')!;
        expect(count).toBeDefined();
        expect(count.IsExpression).toBe(true);
    });

    it('should handle CTE output references (unquoted lowercase)', () => {
        const sql = `WITH cte AS (SELECT m."ID" AS memberid FROM "Members" m)
SELECT c.memberid, c2."Name" FROM cte c JOIN "Other" c2 ON 1=1`;
        const cols = extractSelectColumns(sql);
        expect(cols).toHaveLength(2);
        expect(cols[0].OutputName).toBe('memberid');
        expect(cols[0].SourceColumn).toBe('memberid');
        expect(cols[1].OutputName).toBe('Name');
        expect(cols[1].SourceColumn).toBe('Name');
    });
});
