/**
 * Unit tests for MJQueryEntityServer deterministic extraction.
 *
 * Tests the parameter merge logic and description heuristics that don't
 * require a database connection. The MJSQLParser provides the deterministic
 * structure; these tests verify the merge with LLM enrichment and fallbacks.
 */
import { describe, it, expect } from 'vitest';
import { MJSQLParser } from '@memberjunction/sql-parser';
import type { MJParameterInfo } from '@memberjunction/sql-parser';

// ═══════════════════════════════════════════════════
// Test the deterministic extraction via MJSQLParser
// (these are the inputs to the merge logic)
// ═══════════════════════════════════════════════════

describe('MJSQLParser Extraction for Query Entity', () => {
    describe('Parameter extraction from real-world queries', () => {
        it('should extract parameters from member-activity-counts', () => {
            const sql = `WITH MemberActivities AS (
    SELECT m.ID AS MemberID, m.FirstName
    FROM [AssociationDemo].[vwMembers] m
)
SELECT * FROM MemberActivities
{% if MinActivityCount or MembershipType %}
WHERE 1=1
  {% if MinActivityCount %}
  AND TotalActivityCount >= {{ MinActivityCount | sqlNumber }}
  {% endif %}
  {% if MembershipType %}
  AND mt.Name = '{{ MembershipType }}'
  {% endif %}
{% endif %}
ORDER BY TotalActivityCount DESC`;

            const params = MJSQLParser.ExtractParameterInfo(sql);

            expect(params).toHaveLength(2);

            const minActivity = params.find(p => p.name === 'MinActivityCount')!;
            expect(minActivity).toBeDefined();
            expect(minActivity.type).toBe('number');
            expect(minActivity.isRequired).toBe(false); // inside {% if %}

            const membershipType = params.find(p => p.name === 'MembershipType')!;
            expect(membershipType).toBeDefined();
            expect(membershipType.isRequired).toBe(false); // inside {% if %}
        });

        it('should extract parameters from course-enrollment query', () => {
            const sql = `SELECT c.ID, c.Title
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
{% endif %}`;

            const params = MJSQLParser.ExtractParameterInfo(sql);

            expect(params).toHaveLength(3);
            expect(params.find(p => p.name === 'Category')!.isRequired).toBe(false);
            expect(params.find(p => p.name === 'StartDate')!.type).toBe('date');
            expect(params.find(p => p.name === 'EndDate')!.type).toBe('date');
        });

        it('should extract required parameters from non-conditional usage', () => {
            const sql = `SELECT * FROM dese.vwSalary_schedules
WHERE Year = {{ Year }}
  AND Sal_Bach_Min < {{ SalaryThreshold }}`;

            const params = MJSQLParser.ExtractParameterInfo(sql);
            expect(params).toHaveLength(2);
            expect(params.every(p => p.isRequired)).toBe(true);
        });

        it('should extract parameters from MSTA district queries', () => {
            const sql = `DECLARE @co_dist_code NVARCHAR(20);
SELECT @co_dist_code = CAST(CAST(co_dist_code AS INT) AS NVARCHAR(20))
FROM common.vwOrganizations
WHERE Name = {{ DistrictName | sqlString }};
SELECT year, COUNT(*) AS Total_Educators
FROM dese.vweducators
WHERE co_dist_code = @co_dist_code
  AND CAST(year AS INT) > {{ CurrentYear }} - {{ LookbackYears }}
GROUP BY year`;

            const params = MJSQLParser.ExtractParameterInfo(sql);
            expect(params).toHaveLength(3);
            const names = params.map(p => p.name).sort();
            expect(names).toEqual(['CurrentYear', 'DistrictName', 'LookbackYears']);
            expect(params.find(p => p.name === 'DistrictName')!.type).toBe('string');
        });

        it('should return empty for plain SQL (no templates)', () => {
            const sql = `SELECT m.ID, m.Name
FROM Members m
WHERE m.Active = 1
ORDER BY m.Name`;

            const params = MJSQLParser.ExtractParameterInfo(sql);
            expect(params).toHaveLength(0);
        });

        it('should deduplicate repeated parameters', () => {
            const sql = `SELECT COUNT(*) AS Cnt
FROM nams.vwNU__Membership__cs m
WHERE m.Year__c = {{ CurrentYear }}
  AND NOT EXISTS (
      SELECT 1 FROM nams.vwNU__Membership__cs p
      WHERE p.Year__c = {{ CurrentYear }} - 1
  )`;

            const params = MJSQLParser.ExtractParameterInfo(sql);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('CurrentYear');
            expect(params[0].usageLocations).toHaveLength(2);
        });

        it('should extract default values from filter chains', () => {
            const sql = `SELECT * FROM t
WHERE Limit = {{ Limit | default(25) | sqlNumber }}
  AND Region = {{ Region | default('US') | sqlString }}`;

            const params = MJSQLParser.ExtractParameterInfo(sql);
            const limit = params.find(p => p.name === 'Limit')!;
            expect(limit.defaultValue).toBe(25);
            expect(limit.type).toBe('number');

            const region = params.find(p => p.name === 'Region')!;
            expect(region.defaultValue).toBe('US');
            expect(region.type).toBe('string');
        });
    });

    describe('Table extraction from real-world queries', () => {
        it('should extract tables from CTE-based query with Nunjucks', () => {
            const sql = `WITH ChapterMembers AS (
    SELECT c.ID AS ChapterID
    FROM [AssociationDemo].[vwChapters] c
    WHERE c.IsActive = 1
    {% if Region %}AND c.Region = '{{ Region }}'{% endif %}
    GROUP BY c.ID
)
SELECT * FROM ChapterMembers`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('vwChapters');
        });

        it('should extract tables from multi-join query', () => {
            const sql = `SELECT m.ID
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwMemberships] ms ON ms.MemberID = m.ID
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID`;

            const tables = MJSQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
        });

        it('should extract schema names correctly', () => {
            const tables = MJSQLParser.ExtractTableRefs('SELECT * FROM nams.vwAccounts a');
            expect(tables.length).toBe(1);
            expect(tables[0].SchemaName).toBe('nams');
            expect(tables[0].TableName).toBe('vwAccounts');
        });
    });

    describe('Composition ref extraction', () => {
        it('should extract composition refs from SQL', () => {
            const sql = `SELECT mac.MemberID
FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount)"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID`;

            const refs = MJSQLParser.ExtractCompositionRefs(sql);
            expect(refs).toHaveLength(1);
            expect(refs[0].queryName).toBe('Member Activity Counts');
            expect(refs[0].categoryPath).toBe('Engagement Analytics');
            expect(refs[0].parameters).toHaveLength(1);
        });

        it('should return empty for SQL without composition refs', () => {
            const refs = MJSQLParser.ExtractCompositionRefs('SELECT * FROM Users');
            expect(refs).toHaveLength(0);
        });
    });

    describe('Analyze (template detection)', () => {
        it('should detect templates in SQL with Nunjucks', () => {
            const result = MJSQLParser.Analyze('WHERE x = {{ val | sqlString }}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasTemplateExpressions).toBe(true);
        });

        it('should not flag plain SQL as having templates', () => {
            const result = MJSQLParser.Analyze('SELECT * FROM Users WHERE Active = 1');
            expect(result.hasMJExtensions).toBe(false);
        });

        it('should distinguish composition refs from template expressions', () => {
            const result = MJSQLParser.Analyze('FROM {{query:"Path/Q"}} q');
            expect(result.hasCompositionRefs).toBe(true);
            expect(result.hasTemplateExpressions).toBe(false);
        });
    });
});

// ═══════════════════════════════════════════════════
// Test the merge logic and heuristic fallbacks
// (these test the private methods extracted as pure functions)
// ═══════════════════════════════════════════════════

// Re-implement the merge and heuristic functions as pure functions for testing
// (mirrors the private methods in MJQueryEntityServer)

interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
    sampleValue: string | null;
}

function generateParameterDescription(param: MJParameterInfo): string {
    const typeDescriptions: Record<string, string> = {
        'string': 'text value',
        'number': 'numeric value',
        'date': 'date value',
        'boolean': 'true/false flag',
        'array': 'list of values',
    };
    const typeDesc = typeDescriptions[param.type] || 'value';
    const requiredDesc = param.isRequired ? 'Required' : 'Optional';
    const humanName = param.name.replace(/([A-Z])/g, ' $1').trim();
    const defaultDesc = param.defaultValue !== null ? ` (default: ${param.defaultValue})` : '';
    return `${requiredDesc} ${typeDesc} for ${humanName}${defaultDesc}`;
}

function generateSampleValue(param: MJParameterInfo): string | null {
    if (param.defaultValue !== null) return String(param.defaultValue);
    switch (param.type) {
        case 'string': return 'Example';
        case 'number': return '10';
        case 'date': return '2024-01-01';
        case 'boolean': return 'true';
        case 'array': return 'Value1,Value2';
        default: return null;
    }
}

function mergeParametersWithLLM(
    deterministicParams: MJParameterInfo[],
    llmParams: ExtractedParameter[] | null
): ExtractedParameter[] {
    const llm = llmParams ?? [];
    return deterministicParams.map(dp => {
        const llmMatch = llm.find(lp => lp.name.toLowerCase() === dp.name.toLowerCase());
        return {
            name: dp.name,
            type: (dp.type === 'unknown' ? (llmMatch?.type ?? 'string') : dp.type) as ExtractedParameter['type'],
            isRequired: dp.isRequired,
            description: llmMatch?.description ?? generateParameterDescription(dp),
            usage: llmMatch?.usage ?? dp.usageLocations,
            defaultValue: dp.defaultValue !== null ? String(dp.defaultValue) : (llmMatch?.defaultValue ?? null),
            sampleValue: llmMatch?.sampleValue ?? generateSampleValue(dp),
        };
    });
}

describe('Parameter Merge Logic', () => {
    describe('mergeParametersWithLLM', () => {
        it('should use deterministic values for name, type, isRequired', () => {
            const det: MJParameterInfo[] = [{
                name: 'Region',
                type: 'string',
                isRequired: false,
                defaultValue: null,
                filters: [{ name: 'sqlString', args: [] }],
                usageLocations: ['{{ Region | sqlString }}'],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'Region',
                type: 'number', // LLM got the type wrong
                isRequired: true, // LLM got isRequired wrong
                description: 'Geographic region filter',
                usage: ['WHERE clause'],
                defaultValue: null,
                sampleValue: 'West',
            }];

            const result = mergeParametersWithLLM(det, llm);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Region'); // deterministic
            expect(result[0].type).toBe('string'); // deterministic wins over LLM's "number"
            expect(result[0].isRequired).toBe(false); // deterministic wins over LLM's "true"
            expect(result[0].description).toBe('Geographic region filter'); // LLM enrichment
            expect(result[0].sampleValue).toBe('West'); // LLM enrichment
        });

        it('should use heuristic description when LLM is null', () => {
            const det: MJParameterInfo[] = [{
                name: 'MinActivityCount',
                type: 'number',
                isRequired: false,
                defaultValue: null,
                filters: [{ name: 'sqlNumber', args: [] }],
                usageLocations: ['{{ MinActivityCount | sqlNumber }}'],
            }];

            const result = mergeParametersWithLLM(det, null);
            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Optional numeric value for Min Activity Count');
            expect(result[0].sampleValue).toBe('10'); // heuristic for number
        });

        it('should use heuristic description when LLM parameter not found', () => {
            const det: MJParameterInfo[] = [{
                name: 'StartDate',
                type: 'date',
                isRequired: true,
                defaultValue: null,
                filters: [{ name: 'sqlDate', args: [] }],
                usageLocations: ['{{ StartDate | sqlDate }}'],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'UnrelatedParam',
                type: 'string',
                isRequired: true,
                description: 'Something else',
                usage: [],
                defaultValue: null,
                sampleValue: null,
            }];

            const result = mergeParametersWithLLM(det, llm);
            expect(result[0].description).toBe('Required date value for Start Date');
            expect(result[0].sampleValue).toBe('2024-01-01');
        });

        it('should use default value as sample when available', () => {
            const det: MJParameterInfo[] = [{
                name: 'Limit',
                type: 'number',
                isRequired: true,
                defaultValue: 25,
                filters: [{ name: 'default', args: [25] }, { name: 'sqlNumber', args: [] }],
                usageLocations: ['{{ Limit | default(25) | sqlNumber }}'],
            }];

            const result = mergeParametersWithLLM(det, null);
            expect(result[0].defaultValue).toBe('25');
            expect(result[0].sampleValue).toBe('25'); // uses default as sample
        });

        it('should fall back to string type when deterministic says unknown and LLM unavailable', () => {
            const det: MJParameterInfo[] = [{
                name: 'RawParam',
                type: 'unknown',
                isRequired: true,
                defaultValue: null,
                filters: [],
                usageLocations: ['{{ RawParam }}'],
            }];

            const result = mergeParametersWithLLM(det, null);
            expect(result[0].type).toBe('string');
        });

        it('should use LLM type when deterministic says unknown', () => {
            const det: MJParameterInfo[] = [{
                name: 'RawParam',
                type: 'unknown',
                isRequired: true,
                defaultValue: null,
                filters: [],
                usageLocations: ['{{ RawParam }}'],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'RawParam',
                type: 'number',
                isRequired: true,
                description: 'A numeric value',
                usage: [],
                defaultValue: null,
                sampleValue: '42',
            }];

            const result = mergeParametersWithLLM(det, llm);
            expect(result[0].type).toBe('number'); // LLM wins when deterministic is unknown
        });

        it('should handle case-insensitive LLM name matching', () => {
            const det: MJParameterInfo[] = [{
                name: 'MinActivityCount',
                type: 'number',
                isRequired: false,
                defaultValue: null,
                filters: [{ name: 'sqlNumber', args: [] }],
                usageLocations: [],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'minactivitycount', // lowercase
                type: 'number',
                isRequired: true,
                description: 'Minimum activity threshold',
                usage: [],
                defaultValue: null,
                sampleValue: '5',
            }];

            const result = mergeParametersWithLLM(det, llm);
            expect(result[0].description).toBe('Minimum activity threshold');
            expect(result[0].sampleValue).toBe('5');
        });

        it('should only return parameters found by deterministic extraction', () => {
            // LLM hallucinates a parameter that doesn't exist in the SQL
            const det: MJParameterInfo[] = [{
                name: 'Region',
                type: 'string',
                isRequired: false,
                defaultValue: null,
                filters: [{ name: 'sqlString', args: [] }],
                usageLocations: [],
            }];

            const llm: ExtractedParameter[] = [
                { name: 'Region', type: 'string', isRequired: false, description: 'Region filter', usage: [], defaultValue: null, sampleValue: 'West' },
                { name: 'HallucinatedParam', type: 'string', isRequired: true, description: 'Does not exist', usage: [], defaultValue: null, sampleValue: 'fake' },
            ];

            const result = mergeParametersWithLLM(det, llm);
            expect(result).toHaveLength(1); // Only Region, not HallucinatedParam
            expect(result[0].name).toBe('Region');
        });
    });

    describe('generateParameterDescription', () => {
        it('should generate description for required string param', () => {
            const desc = generateParameterDescription({
                name: 'Region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Required text value for Region');
        });

        it('should generate description for optional number param', () => {
            const desc = generateParameterDescription({
                name: 'MinCount', type: 'number', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Optional numeric value for Min Count');
        });

        it('should include default value in description', () => {
            const desc = generateParameterDescription({
                name: 'Limit', type: 'number', isRequired: true,
                defaultValue: 25, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Required numeric value for Limit (default: 25)');
        });

        it('should split camelCase names into human-readable form', () => {
            const desc = generateParameterDescription({
                name: 'MinActivityCount', type: 'number', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toContain('Min Activity Count');
        });
    });

    describe('generateSampleValue', () => {
        it('should return default value when available', () => {
            expect(generateSampleValue({
                name: 'x', type: 'number', isRequired: true,
                defaultValue: 42, filters: [], usageLocations: [],
            })).toBe('42');
        });

        it('should return type-appropriate samples', () => {
            const cases: Array<[MJParameterInfo['type'], string]> = [
                ['string', 'Example'],
                ['number', '10'],
                ['date', '2024-01-01'],
                ['boolean', 'true'],
                ['array', 'Value1,Value2'],
            ];

            for (const [type, expected] of cases) {
                expect(generateSampleValue({
                    name: 'x', type, isRequired: true,
                    defaultValue: null, filters: [], usageLocations: [],
                })).toBe(expected);
            }
        });

        it('should return null for unknown type', () => {
            expect(generateSampleValue({
                name: 'x', type: 'unknown', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            })).toBeNull();
        });
    });
});
