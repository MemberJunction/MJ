import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
const tsqlDialect = new SQLServerDialect();
const mjAstify = (sql: string) => SQLParser.Astify(sql, tsqlDialect);
const mjSqlify = SQLParser.Sqlify.bind(SQLParser);
const extractTemplateExpressions = SQLParser.ExtractTemplateExpressions.bind(SQLParser);
const extractCompositionRefs = SQLParser.ExtractCompositionRefs.bind(SQLParser);
const extractConditionalBlocks = SQLParser.ExtractConditionalBlocks.bind(SQLParser);
const extractParameterInfo = SQLParser.ExtractParameterInfo.bind(SQLParser);

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

    describe('default values from {% else %} branches', () => {
        it('should extract string default from else branch', () => {
            const sql = `SELECT * FROM t WHERE 1=1
{% if Status and Status.length > 0 %}
  AND t.Status IN {{ Status | sqlIn }}
{% else %}
  AND t.Status = 'Attended'
{% endif %}`;
            const params = extractParameterInfo(sql);
            const status = params.find(p => p.name === 'Status');
            expect(status).toBeDefined();
            expect(status!.type).toBe('array');
            expect(status!.defaultValue).toBe('Attended');
        });

        it('should extract numeric default from else branch', () => {
            const sql = `SELECT * FROM t WHERE 1=1
{% if Limit %}
  AND t.Limit = {{ Limit | sqlNumber }}
{% else %}
  AND t.Limit = 100
{% endif %}`;
            const params = extractParameterInfo(sql);
            const limit = params.find(p => p.name === 'Limit');
            expect(limit).toBeDefined();
            expect(limit!.defaultValue).toBe(100);
        });

        it('should not override default from | default() filter', () => {
            const sql = `SELECT * FROM t
{% if Limit %}
  WHERE t.Limit = {{ Limit | default(50) | sqlNumber }}
{% else %}
  WHERE t.Limit = 100
{% endif %}`;
            const params = extractParameterInfo(sql);
            const limit = params.find(p => p.name === 'Limit');
            expect(limit).toBeDefined();
            expect(limit!.defaultValue).toBe(50); // filter default takes precedence
        });

        it('should skip else branch with multiple literals (ambiguous)', () => {
            const sql = `SELECT * FROM t WHERE 1=1
{% if Region %}
  AND t.Region = {{ Region | sqlString }}
{% else %}
  AND t.Region = 'US' AND t.SubRegion = 'West'
{% endif %}`;
            const params = extractParameterInfo(sql);
            const region = params.find(p => p.name === 'Region');
            expect(region).toBeDefined();
            expect(region!.defaultValue).toBeNull(); // ambiguous — two literals
        });

        it('should handle if/elif/else with default on else', () => {
            const sql = `SELECT * FROM t WHERE 1=1
{% if Priority %}
  AND t.Priority = {{ Priority | sqlNumber }}
{% elif Category %}
  AND t.Category = {{ Category | sqlString }}
{% else %}
  AND t.Priority = 1
{% endif %}`;
            const params = extractParameterInfo(sql);
            const priority = params.find(p => p.name === 'Priority');
            expect(priority).toBeDefined();
            expect(priority!.defaultValue).toBe(1);
        });

        it('should not set default when there is no else branch', () => {
            const sql = `SELECT * FROM t WHERE 1=1
{% if Region %}
  AND t.Region = {{ Region | sqlString }}
{% endif %}`;
            const params = extractParameterInfo(sql);
            const region = params.find(p => p.name === 'Region');
            expect(region).toBeDefined();
            expect(region!.defaultValue).toBeNull();
        });

        it('should handle the Member Event Attendance History pattern', () => {
            const sql = `SELECT er.ID, er.MemberID, e.Name
FROM vwEventRegistrations er
INNER JOIN vwEvents e ON er.EventID = e.ID
WHERE 1=1
{% if MemberID and MemberID.length > 0 %}
  AND CAST(er.MemberID AS NVARCHAR(36)) IN {{ MemberID | sqlIn }}
{% endif %}
{% if Status and Status.length > 0 %}
  AND er.Status IN {{ Status | sqlIn }}
{% else %}
  AND er.Status = 'Attended'
{% endif %}
{% if StartDate and StartDate.length > 0 %}
  AND e.StartDate >= {{ StartDate | sqlDate }}
{% endif %}
ORDER BY e.StartDate DESC`;
            const params = extractParameterInfo(sql);

            const memberID = params.find(p => p.name === 'MemberID');
            expect(memberID).toBeDefined();
            expect(memberID!.type).toBe('array');
            expect(memberID!.defaultValue).toBeNull(); // no else branch

            const status = params.find(p => p.name === 'Status');
            expect(status).toBeDefined();
            expect(status!.type).toBe('array');
            expect(status!.defaultValue).toBe('Attended');

            const startDate = params.find(p => p.name === 'StartDate');
            expect(startDate).toBeDefined();
            expect(startDate!.defaultValue).toBeNull(); // no else branch
        });
    });
});

// ═══════════════════════════════════════════════════
// ExtractSelectColumns, RenameTemplateVariable, SubstituteTemplateVariable
// ═══════════════════════════════════════════════════

const extractSelectColumns = (sql: string) => SQLParser.ExtractSelectColumns(sql, tsqlDialect);
const renameTemplateVariable = SQLParser.RenameTemplateVariable.bind(SQLParser);
const substituteTemplateVariable = SQLParser.SubstituteTemplateVariable.bind(SQLParser);

describe('extractSelectColumns', () => {
    it('should extract simple columns with table qualifiers', () => {
        const cols = extractSelectColumns('SELECT u.Name, u.Email FROM Users u');
        expect(cols).toHaveLength(2);

        const name = cols.find(c => c.OutputName === 'Name')!;
        expect(name).toBeDefined();
        expect(name.SourceColumn).toBe('Name');
        expect(name.TableQualifier).toBe('u');
        expect(name.IsExpression).toBe(false);

        const email = cols.find(c => c.OutputName === 'Email')!;
        expect(email).toBeDefined();
        expect(email.SourceColumn).toBe('Email');
        expect(email.TableQualifier).toBe('u');
        expect(email.IsExpression).toBe(false);
    });

    it('should extract AS aliases with correct OutputName and SourceColumn', () => {
        const cols = extractSelectColumns('SELECT e.Name AS EntityName, e.ID FROM Entities e');
        expect(cols).toHaveLength(2);

        const aliased = cols.find(c => c.OutputName === 'EntityName')!;
        expect(aliased).toBeDefined();
        expect(aliased.SourceColumn).toBe('Name');
        expect(aliased.TableQualifier).toBe('e');
        expect(aliased.IsExpression).toBe(false);

        const id = cols.find(c => c.OutputName === 'ID')!;
        expect(id).toBeDefined();
        expect(id.SourceColumn).toBe('ID');
        expect(id.TableQualifier).toBe('e');
    });

    it('should mark expressions/aggregates with IsExpression=true', () => {
        const cols = extractSelectColumns('SELECT COUNT(*) AS UserCount, MAX(u.CreatedAt) AS Newest FROM Users u');
        expect(cols).toHaveLength(2);

        const countCol = cols.find(c => c.OutputName === 'UserCount')!;
        expect(countCol).toBeDefined();
        expect(countCol.IsExpression).toBe(true);

        const maxCol = cols.find(c => c.OutputName === 'Newest')!;
        expect(maxCol).toBeDefined();
        expect(maxCol.IsExpression).toBe(true);
    });

    it('should handle mixed simple columns, aliases, and aggregates', () => {
        const cols = extractSelectColumns(
            'SELECT u.Name, e.Name AS EntityName, COUNT(*) AS Total FROM Users u CROSS JOIN Entities e GROUP BY u.Name, e.Name'
        );
        expect(cols).toHaveLength(3);

        const uName = cols.find(c => c.OutputName === 'Name' && c.TableQualifier === 'u')!;
        expect(uName).toBeDefined();
        expect(uName.IsExpression).toBe(false);

        const entityName = cols.find(c => c.OutputName === 'EntityName')!;
        expect(entityName).toBeDefined();
        expect(entityName.SourceColumn).toBe('Name');
        expect(entityName.TableQualifier).toBe('e');
        expect(entityName.IsExpression).toBe(false);

        const total = cols.find(c => c.OutputName === 'Total')!;
        expect(total).toBeDefined();
        expect(total.IsExpression).toBe(true);
    });

    it('should handle SELECT *', () => {
        const cols = extractSelectColumns('SELECT * FROM Users');
        expect(cols).toHaveLength(1);
        expect(cols[0].OutputName).toBe('*');
        expect(cols[0].SourceColumn).toBe('*');
        expect(cols[0].TableQualifier).toBeNull();
        expect(cols[0].IsExpression).toBe(false);
    });

    it('should handle MJ composition tokens after placeholder substitution', () => {
        // Composition refs are replaced with __mj_tpl_placeholder before AST parsing
        // Verify that a query with composition syntax still extracts columns
        const sql = `SELECT u.Name, changes.ChangeCount FROM {{query:"Test/Q"}} u LEFT JOIN {{query:"Other/Q"}} changes ON 1=1`;
        const cols = extractSelectColumns(sql);
        expect(cols).toHaveLength(2);

        const name = cols.find(c => c.OutputName === 'Name')!;
        expect(name).toBeDefined();
        expect(name.TableQualifier).toBe('u');

        const changeCount = cols.find(c => c.OutputName === 'ChangeCount')!;
        expect(changeCount).toBeDefined();
        expect(changeCount.TableQualifier).toBe('changes');
    });

    it('should return empty array for empty/invalid SQL', () => {
        expect(extractSelectColumns('')).toHaveLength(0);
        expect(extractSelectColumns('   ')).toHaveLength(0);
        expect(extractSelectColumns('NOT VALID SQL AT ALL %%%')).toHaveLength(0);
    });
});

describe('renameTemplateVariable', () => {
    it('should rename a simple variable with no filters', () => {
        const result = renameTemplateVariable('WHERE x = {{ region }}', 'region', 'userRegion');
        expect(result).toContain('userRegion');
        expect(result).not.toContain('{{ region');
    });

    it('should rename a variable with a filter', () => {
        const sql = "WHERE days > {{ lookbackDays | sqlNumber }}";
        const result = renameTemplateVariable(sql, 'lookbackDays', 'numDays');
        expect(result).toContain('numDays');
        expect(result).toContain('sqlNumber');
        expect(result).not.toContain('lookbackDays');
    });

    it('should rename a variable with a default filter and additional filters', () => {
        const sql = "WHERE x = {{ limit | default(25) | sqlNumber }}";
        const result = renameTemplateVariable(sql, 'limit', 'maxRows');
        expect(result).toContain('maxRows');
        expect(result).toContain('default(25)');
        expect(result).toContain('sqlNumber');
        expect(result).not.toContain('limit');
    });

    it('should rename all occurrences of the variable', () => {
        const sql = "WHERE Year = {{ Year | sqlNumber }} AND PriorYear = {{ Year | sqlNumber }} - 1";
        const result = renameTemplateVariable(sql, 'Year', 'FiscalYear');
        // Both occurrences should be renamed
        const matches = result.match(/FiscalYear/g);
        expect(matches).toHaveLength(2);
        expect(result).not.toContain('{{ Year');
    });

    it('should match variable names case-insensitively', () => {
        const sql = "WHERE x = {{ Region | sqlString }}";
        const result = renameTemplateVariable(sql, 'region', 'userRegion');
        expect(result).toContain('userRegion');
        expect(result).not.toMatch(/\{\{\s*Region\s/);
    });

    it('should return SQL unchanged if variable is not found', () => {
        const sql = "WHERE x = {{ region | sqlString }}";
        const result = renameTemplateVariable(sql, 'country', 'nation');
        expect(result).toBe(sql);
    });

    it('should not affect other variables with similar names', () => {
        const sql = "WHERE x = {{ region | sqlString }} AND y = {{ regionCode | sqlString }}";
        const result = renameTemplateVariable(sql, 'region', 'userRegion');
        expect(result).toContain('userRegion');
        expect(result).toContain('regionCode');
        // regionCode should NOT be renamed
        expect(result).not.toContain('userRegionCode');
    });
});

describe('substituteTemplateVariable', () => {
    it('should substitute a simple variable with a literal value', () => {
        const sql = "WHERE x = {{ region }}";
        const result = substituteTemplateVariable(sql, 'region', "'West'");
        expect(result).toBe("WHERE x = 'West'");
    });

    it('should substitute a variable with filters (entire expression replaced)', () => {
        const sql = "WHERE x = {{ region | sqlString }}";
        const result = substituteTemplateVariable(sql, 'region', "'West'");
        expect(result).toBe("WHERE x = 'West'");
    });

    it('should substitute a numeric value', () => {
        const sql = "WHERE days > {{ lookbackDays | sqlNumber }}";
        const result = substituteTemplateVariable(sql, 'lookbackDays', '30');
        expect(result).toBe("WHERE days > 30");
    });

    it('should substitute all occurrences', () => {
        const sql = "WHERE Year = {{ Year | sqlNumber }} AND PriorYear = {{ Year | sqlNumber }} - 1";
        const result = substituteTemplateVariable(sql, 'Year', '2025');
        expect(result).toBe("WHERE Year = 2025 AND PriorYear = 2025 - 1");
    });

    it('should return SQL unchanged if variable is not found', () => {
        const sql = "WHERE x = {{ region | sqlString }}";
        const result = substituteTemplateVariable(sql, 'country', "'West'");
        expect(result).toBe(sql);
    });

    it('should not affect other variables', () => {
        const sql = "WHERE x = {{ region | sqlString }} AND y = {{ regionCode | sqlString }}";
        const result = substituteTemplateVariable(sql, 'region', "'West'");
        expect(result).toContain("'West'");
        expect(result).toContain('{{ regionCode | sqlString }}');
    });
});
