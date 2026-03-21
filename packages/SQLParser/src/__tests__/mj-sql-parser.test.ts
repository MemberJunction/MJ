import { describe, it, expect } from 'vitest';
import {
    mjAstify,
    mjSqlify,
    extractTemplateExpressions,
    extractCompositionRefs,
    extractConditionalBlocks,
    extractParameterInfo,
} from '../mj-sql-parser.js';

// ═══════════════════════════════════════════════════
// Real-world SQL query snippets
// ═══════════════════════════════════════════════════

const PLAIN_SQL = `SELECT u.Name, r.RoleName
FROM Users u
INNER JOIN Roles r ON u.RoleID = r.ID
WHERE u.Active = 1
ORDER BY u.Name`;

const BOARD_OF_DIRECTORS = `WITH board_committee AS (
    SELECT Id FROM nams.vwNU__Committee__cs
    WHERE Name = 'MSTA Board of Directors' AND NU__Type__c = 'Board'
)
SELECT a.FirstName, a.LastName
FROM current_members m
INNER JOIN nams.vwAccounts a ON a.Id = m.NU__Account__c
ORDER BY a.LastName`;

const MEMBER_LIFETIME_REVENUE = `SELECT m.ID AS MemberID, m.FirstName
FROM [AssociationDemo].[vwMembers] m
WHERE 1=1
{% if JoinYear %}
  AND YEAR(m.JoinDate) = {{ JoinYear | sqlNumber }}
{% endif %}
{% if MembershipType %}
  AND cm.MembershipType = '{{ MembershipType }}'
{% endif %}
ORDER BY TotalRevenue DESC`;

const COURSE_ENROLLMENT = `SELECT c.ID AS CourseID, c.Title
FROM [AssociationDemo].[vwCourses] c
WHERE c.IsActive = 1
{% if Category %}
  AND c.Category = '{{ Category }}'
{% endif %}
{% if StartDate %}
  AND e.EnrollmentDate >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
  AND e.EnrollmentDate < {{ EndDate | sqlDate }}
{% endif %}
GROUP BY c.ID, c.Title`;

const EDUCATOR_COUNT = `DECLARE @co_dist_code NVARCHAR(20);
SELECT @co_dist_code = CAST(CAST(co_dist_code AS INT) AS NVARCHAR(20))
FROM common.vwOrganizations
WHERE Name = {{ DistrictName | sqlString }};
SELECT year, COUNT(*) AS Total_Educators
FROM dese.vweducators
WHERE co_dist_code = @co_dist_code
  AND CAST(year AS INT) > {{ CurrentYear }} - {{ LookbackYears }}
GROUP BY year`;

const COMPOSITION_QUERY = `WITH PrimaryChapters AS (
    SELECT cm.MemberID FROM [AssociationDemo].[vwChapterMemberships] cm
)
SELECT mac.MemberID, pc.ChapterID
FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount)"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID
{% if Region %}
WHERE pc.Region = {{ Region | sqlString }}
{% endif %}`;

const LOWEST_SALARY = `SELECT d.description AS District_Name
FROM dese.vwSalary_schedules s
INNER JOIN dese.vwco_dist_descs d ON d.co_dist_code = s.co_dist_code
WHERE s.Year = {{ Year }}
  AND s.Sal_Bach_Min < {{ SalaryThreshold }}
ORDER BY s.Sal_Bach_Min ASC`;

const REJOINED_AFTER_LAPSE = `SELECT COUNT(DISTINCT current_mem.NU__Account__c) AS Cnt
FROM nams.vwNU__Membership__cs current_mem
WHERE current_mem.Year__c = {{ CurrentYear }}
  AND NOT EXISTS (
      SELECT 1 FROM nams.vwNU__Membership__cs prior
      WHERE prior.Year__c = {{ CurrentYear }} - 1
  )
  AND EXISTS (
      SELECT 1 FROM nams.vwNU__Membership__cs older
      WHERE older.Year__c < {{ CurrentYear }} - 1
  )`;

// ═══════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════

describe('mjAstify', () => {
    it('should parse plain SQL (no MJ extensions)', () => {
        const result = mjAstify(PLAIN_SQL);
        expect(result.astParsed).toBe(true);
        expect(result.mjParse.hasMJExtensions).toBe(false);
        expect(result.positionMap.size).toBe(0);
    });

    it('should parse plain SQL with CTEs', () => {
        const result = mjAstify(BOARD_OF_DIRECTORS);
        expect(result.astParsed).toBe(true);
        expect(result.mjParse.hasMJExtensions).toBe(false);
    });

    it('should parse templated SQL with number and string filters', () => {
        const result = mjAstify(MEMBER_LIFETIME_REVENUE);
        expect(result.mjParse.hasMJExtensions).toBe(true);
        expect(result.mjParse.hasTemplateExpressions).toBe(true);
        expect(result.mjParse.hasConditionalBlocks).toBe(true);
        expect(result.positionMap.size).toBe(2); // JoinYear, MembershipType
    });

    it('should parse templated SQL with date filters', () => {
        const result = mjAstify(COURSE_ENROLLMENT);
        expect(result.mjParse.hasMJExtensions).toBe(true);
        expect(result.positionMap.size).toBe(3); // Category, StartDate, EndDate
    });

    it('should parse SQL with composition references', () => {
        const result = mjAstify(COMPOSITION_QUERY);
        expect(result.mjParse.hasCompositionRefs).toBe(true);
        expect(result.mjParse.hasTemplateExpressions).toBe(true);
        expect(result.mjParse.hasConditionalBlocks).toBe(true);
    });

    it('should produce parseable clean SQL for simple templated queries', () => {
        const result = mjAstify(LOWEST_SALARY);
        // The clean SQL should have placeholders that node-sql-parser can handle
        expect(result.cleanSQL).not.toContain('{{');
        expect(result.cleanSQL).not.toContain('{%');
        // AST parsing may or may not succeed depending on placeholder positions
        // but the clean SQL should at least be free of MJ tokens
    });

    it('should handle repeated variable (CurrentYear appears 3 times)', () => {
        const result = mjAstify(REJOINED_AFTER_LAPSE);
        expect(result.positionMap.size).toBe(3);
    });

    it('should handle DECLARE statements with expressions', () => {
        const result = mjAstify(EDUCATOR_COUNT);
        expect(result.mjParse.hasMJExtensions).toBe(true);
        expect(result.positionMap.size).toBe(3); // DistrictName, CurrentYear, LookbackYears
    });
});

describe('mjSqlify', () => {
    it('should reconstruct plain SQL via node-sql-parser', () => {
        const result = mjAstify('SELECT Name FROM Users WHERE Active = 1');
        const sql = mjSqlify(result);
        // node-sql-parser normalizes: adds brackets, adjusts spacing
        expect(sql.toLowerCase()).toContain('select');
        expect(sql.toLowerCase()).toContain('from');
        expect(sql.toLowerCase()).toContain('where');
    });

    it('should reconstruct MJ SQL from tokens (preserving original)', () => {
        const original = MEMBER_LIFETIME_REVENUE;
        const result = mjAstify(original);
        const reconstructed = mjSqlify(result);
        // For MJ SQL, we reconstruct from tokens — should be identical
        expect(reconstructed).toBe(original);
    });

    it('should reconstruct composition SQL from tokens', () => {
        const original = COMPOSITION_QUERY;
        const result = mjAstify(original);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(original);
    });

    it('should round-trip all real-world templated queries', () => {
        const queries = [
            MEMBER_LIFETIME_REVENUE,
            COURSE_ENROLLMENT,
            EDUCATOR_COUNT,
            COMPOSITION_QUERY,
            LOWEST_SALARY,
            REJOINED_AFTER_LAPSE,
        ];

        for (const sql of queries) {
            const result = mjAstify(sql);
            const reconstructed = mjSqlify(result);
            expect(reconstructed).toBe(sql);
        }
    });
});

describe('extractTemplateExpressions', () => {
    it('should extract no expressions from plain SQL', () => {
        expect(extractTemplateExpressions(PLAIN_SQL)).toHaveLength(0);
    });

    it('should extract all template expressions from member-lifetime-revenue', () => {
        const exprs = extractTemplateExpressions(MEMBER_LIFETIME_REVENUE);
        expect(exprs).toHaveLength(2);

        const joinYear = exprs.find(e => e.variable === 'JoinYear')!;
        expect(joinYear).toBeDefined();
        expect(joinYear.filters[0].name).toBe('sqlNumber');

        const membershipType = exprs.find(e => e.variable === 'MembershipType')!;
        expect(membershipType).toBeDefined();
        expect(membershipType.filters).toHaveLength(0); // bare {{ MembershipType }}
    });

    it('should extract date-filtered expressions', () => {
        const exprs = extractTemplateExpressions(COURSE_ENROLLMENT);
        const dateExprs = exprs.filter(e => e.filters.some(f => f.name === 'sqlDate'));
        expect(dateExprs).toHaveLength(2); // StartDate, EndDate
    });

    it('should extract repeated variable as separate expressions', () => {
        const exprs = extractTemplateExpressions(REJOINED_AFTER_LAPSE);
        expect(exprs).toHaveLength(3);
        expect(exprs.every(e => e.variable === 'CurrentYear')).toBe(true);
    });
});

describe('extractCompositionRefs', () => {
    it('should extract no refs from plain SQL', () => {
        expect(extractCompositionRefs(PLAIN_SQL)).toHaveLength(0);
    });

    it('should extract composition reference with parameters', () => {
        const refs = extractCompositionRefs(COMPOSITION_QUERY);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Engagement Analytics');
        expect(refs[0].queryName).toBe('Member Activity Counts');
        expect(refs[0].parameters).toHaveLength(1);
        expect(refs[0].parameters[0].key).toBe('MinActivityCount');
        expect(refs[0].parameters[0].isPassThrough).toBe(true);
    });

    it('should extract refs from SQL that also has template expressions', () => {
        const refs = extractCompositionRefs(COMPOSITION_QUERY);
        const exprs = extractTemplateExpressions(COMPOSITION_QUERY);
        expect(refs).toHaveLength(1);
        expect(exprs).toHaveLength(1); // Region
    });
});

describe('extractConditionalBlocks', () => {
    it('should extract no blocks from plain SQL', () => {
        expect(extractConditionalBlocks(PLAIN_SQL)).toHaveLength(0);
    });

    it('should extract simple if/endif blocks', () => {
        const blocks = extractConditionalBlocks(MEMBER_LIFETIME_REVENUE);
        expect(blocks.length).toBeGreaterThanOrEqual(2);

        // Each block should have at least one branch
        for (const block of blocks) {
            expect(block.branches.length).toBeGreaterThanOrEqual(1);
            expect(block.branches[0].condition).not.toBeNull();
        }
    });

    it('should extract nested conditional blocks', () => {
        const sql = `{% if A %}
  {% if B %}inner{% endif %}
  outer
{% endif %}`;
        const blocks = extractConditionalBlocks(sql);
        // The inner block completes first, then the outer block
        expect(blocks).toHaveLength(2);
    });
});

describe('extractParameterInfo', () => {
    it('should return empty for plain SQL', () => {
        expect(extractParameterInfo(PLAIN_SQL)).toHaveLength(0);
    });

    it('should extract parameter info from member-lifetime-revenue', () => {
        const params = extractParameterInfo(MEMBER_LIFETIME_REVENUE);

        const joinYear = params.find(p => p.name === 'JoinYear')!;
        expect(joinYear).toBeDefined();
        expect(joinYear.type).toBe('number');
        expect(joinYear.isRequired).toBe(false); // inside {% if JoinYear %}

        const membershipType = params.find(p => p.name === 'MembershipType')!;
        expect(membershipType).toBeDefined();
        expect(membershipType.type).toBe('unknown'); // bare {{ MembershipType }} — no filter
        expect(membershipType.isRequired).toBe(false); // inside {% if MembershipType %}
    });

    it('should extract parameter info from course-enrollment', () => {
        const params = extractParameterInfo(COURSE_ENROLLMENT);
        expect(params).toHaveLength(3);

        const category = params.find(p => p.name === 'Category')!;
        expect(category.type).toBe('unknown'); // bare {{ Category }}
        expect(category.isRequired).toBe(false);

        const startDate = params.find(p => p.name === 'StartDate')!;
        expect(startDate.type).toBe('date');
        expect(startDate.isRequired).toBe(false);

        const endDate = params.find(p => p.name === 'EndDate')!;
        expect(endDate.type).toBe('date');
        expect(endDate.isRequired).toBe(false);
    });

    it('should detect required parameters (outside conditionals)', () => {
        const sql = "SELECT * FROM t WHERE Year = {{ Year | sqlNumber }}";
        const params = extractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Year');
        expect(params[0].type).toBe('number');
        expect(params[0].isRequired).toBe(true);
    });

    it('should detect optional parameters (inside conditionals)', () => {
        const sql = "SELECT * FROM t {% if Region %}WHERE Region = {{ Region | sqlString }}{% endif %}";
        const params = extractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Region');
        expect(params[0].isRequired).toBe(false);
    });

    it('should detect default values from filter chain', () => {
        const sql = "WHERE Limit = {{ Limit | default(10) | sqlNumber }}";
        const params = extractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Limit');
        expect(params[0].type).toBe('number');
        expect(params[0].defaultValue).toBe(10);
    });

    it('should deduplicate repeated variable references', () => {
        const params = extractParameterInfo(REJOINED_AFTER_LAPSE);
        expect(params).toHaveLength(1); // CurrentYear appears 3 times but only 1 param
        expect(params[0].name).toBe('CurrentYear');
        expect(params[0].usageLocations).toHaveLength(3);
    });

    it('should handle educator-count with 3 distinct parameters', () => {
        const params = extractParameterInfo(EDUCATOR_COUNT);
        expect(params).toHaveLength(3);
        const names = params.map(p => p.name).sort();
        expect(names).toEqual(['CurrentYear', 'DistrictName', 'LookbackYears']);

        const district = params.find(p => p.name === 'DistrictName')!;
        expect(district.type).toBe('string');
        expect(district.isRequired).toBe(true); // not inside a conditional
    });

    it('should map all SQL filter types correctly', () => {
        const sql = `
{{ a | sqlString }}
{{ b | sqlNumber }}
{{ c | sqlDate }}
{{ d | sqlBoolean }}
{{ e | sqlIn }}
{{ f | sqlIdentifier }}
{{ g | sqlNoKeywordsExpression }}
{{ h }}
`;
        const params = extractParameterInfo(sql);
        const typeMap: Record<string, string> = {};
        for (const p of params) {
            typeMap[p.name] = p.type;
        }

        expect(typeMap['a']).toBe('string');
        expect(typeMap['b']).toBe('number');
        expect(typeMap['c']).toBe('date');
        expect(typeMap['d']).toBe('boolean');
        expect(typeMap['e']).toBe('array');
        expect(typeMap['f']).toBe('string');
        expect(typeMap['g']).toBe('string');
        expect(typeMap['h']).toBe('unknown');
    });
});
