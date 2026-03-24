/**
 * Unit tests for MJQueryEntityServer deterministic extraction.
 *
 * Tests the parameter merge logic and description heuristics that don't
 * require a database connection. The SQLParser provides the deterministic
 * structure; these tests verify the merge with LLM enrichment and fallbacks.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '@memberjunction/sql-parser';
import type { MJParameterInfo } from '@memberjunction/sql-parser';

// ═══════════════════════════════════════════════════
// Test the deterministic extraction via SQLParser
// (these are the inputs to the merge logic)
// ═══════════════════════════════════════════════════

describe('SQLParser Extraction for Query Entity', () => {
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

            const params = SQLParser.ExtractParameterInfo(sql);

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

            const params = SQLParser.ExtractParameterInfo(sql);

            expect(params).toHaveLength(3);
            expect(params.find(p => p.name === 'Category')!.isRequired).toBe(false);
            expect(params.find(p => p.name === 'StartDate')!.type).toBe('date');
            expect(params.find(p => p.name === 'EndDate')!.type).toBe('date');
        });

        it('should extract required parameters from non-conditional usage', () => {
            const sql = `SELECT * FROM dese.vwSalary_schedules
WHERE Year = {{ Year }}
  AND Sal_Bach_Min < {{ SalaryThreshold }}`;

            const params = SQLParser.ExtractParameterInfo(sql);
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

            const params = SQLParser.ExtractParameterInfo(sql);
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

            const params = SQLParser.ExtractParameterInfo(sql);
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

            const params = SQLParser.ExtractParameterInfo(sql);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('CurrentYear');
            expect(params[0].usageLocations).toHaveLength(2);
        });

        it('should extract default values from filter chains', () => {
            const sql = `SELECT * FROM t
WHERE Limit = {{ Limit | default(25) | sqlNumber }}
  AND Region = {{ Region | default('US') | sqlString }}`;

            const params = SQLParser.ExtractParameterInfo(sql);
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

            const tables = SQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('vwChapters');
        });

        it('should extract tables from multi-join query', () => {
            const sql = `SELECT m.ID
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwMemberships] ms ON ms.MemberID = m.ID
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID`;

            const tables = SQLParser.ExtractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
        });

        it('should extract schema names correctly', () => {
            const tables = SQLParser.ExtractTableRefs('SELECT * FROM nams.vwAccounts a');
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

            const refs = SQLParser.ExtractCompositionRefs(sql);
            expect(refs).toHaveLength(1);
            expect(refs[0].queryName).toBe('Member Activity Counts');
            expect(refs[0].categoryPath).toBe('Engagement Analytics');
            expect(refs[0].parameters).toHaveLength(1);
        });

        it('should return empty for SQL without composition refs', () => {
            const refs = SQLParser.ExtractCompositionRefs('SELECT * FROM Users');
            expect(refs).toHaveLength(0);
        });
    });

    describe('Analyze (template detection)', () => {
        it('should detect templates in SQL with Nunjucks', () => {
            const result = SQLParser.Analyze('WHERE x = {{ val | sqlString }}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasTemplateExpressions).toBe(true);
        });

        it('should not flag plain SQL as having templates', () => {
            const result = SQLParser.Analyze('SELECT * FROM Users WHERE Active = 1');
            expect(result.hasMJExtensions).toBe(false);
        });

        it('should distinguish composition refs from template expressions', () => {
            const result = SQLParser.Analyze('FROM {{query:"Path/Q"}} q');
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

/**
 * Metadata inherited from a dependency query's parameter for passthrough parameters.
 */
interface PassthroughParamContext {
    description: string | null;
    sampleValue: string | null;
    depQueryName: string;
    depParamName: string;
}

function buildPassthroughDescription(param: MJParameterInfo, context: PassthroughParamContext): string {
    const suffix = ` (passed through to "${context.depQueryName}" as "${context.depParamName}")`;
    if (context.description) {
        return `${context.description}${suffix}`;
    }
    return `${generateParameterDescription(param)}${suffix}`;
}

function mergeParametersWithLLM(
    deterministicParams: MJParameterInfo[],
    llmParams: ExtractedParameter[] | null,
    passthroughContext: Map<string, PassthroughParamContext> = new Map()
): ExtractedParameter[] {
    const llm = llmParams ?? [];
    return deterministicParams.map(dp => {
        const llmMatch = llm.find(lp => lp.name.toLowerCase() === dp.name.toLowerCase());
        const ptContext = passthroughContext.get(dp.name.toLowerCase());
        const inheritedDescription = ptContext
            ? buildPassthroughDescription(dp, ptContext)
            : null;

        return {
            name: dp.name,
            type: (dp.type === 'unknown' ? (llmMatch?.type ?? 'string') : dp.type) as ExtractedParameter['type'],
            isRequired: dp.isRequired,
            description: llmMatch?.description ?? inheritedDescription ?? generateParameterDescription(dp),
            usage: llmMatch?.usage ?? dp.usageLocations,
            defaultValue: dp.defaultValue !== null ? String(dp.defaultValue) : (llmMatch?.defaultValue ?? null),
            sampleValue: llmMatch?.sampleValue ?? ptContext?.sampleValue ?? generateSampleValue(dp),
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

        it('should use inherited description from passthrough context when LLM unavailable', () => {
            const det: MJParameterInfo[] = [{
                name: 'numDays', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: ['{{query:"Q(lookbackDays=numDays)"}}'],
            }];

            const ptContext = new Map<string, PassthroughParamContext>([
                ['numdays', {
                    description: 'Number of days to look back for changes',
                    sampleValue: '30',
                    depQueryName: 'Recent Entity Changes',
                    depParamName: 'lookbackDays',
                }],
            ]);

            const result = mergeParametersWithLLM(det, null, ptContext);
            expect(result).toHaveLength(1);
            expect(result[0].description).toBe(
                'Number of days to look back for changes (passed through to "Recent Entity Changes" as "lookbackDays")'
            );
            expect(result[0].sampleValue).toBe('30');
        });

        it('should prefer LLM description over inherited passthrough description', () => {
            const det: MJParameterInfo[] = [{
                name: 'numDays', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'numDays', type: 'number', isRequired: true,
                description: 'LLM-generated description for numDays',
                usage: [], defaultValue: null, sampleValue: '14',
            }];

            const ptContext = new Map<string, PassthroughParamContext>([
                ['numdays', {
                    description: 'Inherited description',
                    sampleValue: '30',
                    depQueryName: 'Q',
                    depParamName: 'lookbackDays',
                }],
            ]);

            const result = mergeParametersWithLLM(det, llm, ptContext);
            expect(result[0].description).toBe('LLM-generated description for numDays'); // LLM wins
            expect(result[0].sampleValue).toBe('14'); // LLM wins
        });

        it('should use heuristic description with passthrough suffix when dependency has no description', () => {
            const det: MJParameterInfo[] = [{
                name: 'fiscalYear', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const ptContext = new Map<string, PassthroughParamContext>([
                ['fiscalyear', {
                    description: null, // Dependency param has no description
                    sampleValue: null,
                    depQueryName: 'Sales Summary',
                    depParamName: 'year',
                }],
            ]);

            const result = mergeParametersWithLLM(det, null, ptContext);
            expect(result[0].description).toBe(
                'Required numeric value for fiscal Year (passed through to "Sales Summary" as "year")'
            );
            // sampleValue falls through to heuristic since both LLM and ptContext are null
            expect(result[0].sampleValue).toBe('10');
        });

        it('should inherit sampleValue from passthrough even when description comes from LLM', () => {
            const det: MJParameterInfo[] = [{
                name: 'region', type: 'string', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'region', type: 'string', isRequired: false,
                description: 'LLM description',
                usage: [], defaultValue: null, sampleValue: null, // LLM didn't provide sample
            }];

            const ptContext = new Map<string, PassthroughParamContext>([
                ['region', {
                    description: 'Inherited desc',
                    sampleValue: 'West',
                    depQueryName: 'Q',
                    depParamName: 'r',
                }],
            ]);

            const result = mergeParametersWithLLM(det, llm, ptContext);
            expect(result[0].description).toBe('LLM description'); // LLM wins
            expect(result[0].sampleValue).toBe('West'); // Inherited wins over heuristic
        });
    });

    describe('buildPassthroughDescription', () => {
        it('should use dependency description with passthrough suffix', () => {
            const param: MJParameterInfo = {
                name: 'numDays', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            };
            const context: PassthroughParamContext = {
                description: 'How many days to look back',
                sampleValue: '30',
                depQueryName: 'Recent Changes',
                depParamName: 'lookbackDays',
            };
            expect(buildPassthroughDescription(param, context)).toBe(
                'How many days to look back (passed through to "Recent Changes" as "lookbackDays")'
            );
        });

        it('should fall back to heuristic with passthrough suffix when no dependency description', () => {
            const param: MJParameterInfo = {
                name: 'MinCount', type: 'number', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            };
            const context: PassthroughParamContext = {
                description: null,
                sampleValue: null,
                depQueryName: 'Activity Query',
                depParamName: 'minActivityCount',
            };
            expect(buildPassthroughDescription(param, context)).toBe(
                'Optional numeric value for Min Count (passed through to "Activity Query" as "minActivityCount")'
            );
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

// ═══════════════════════════════════════════════════
// Test passthrough parameter extraction from composition references
// (mirrors the private methods in MJQueryEntityServer)
// ═══════════════════════════════════════════════════

/**
 * Maps a QueryParameterInfo.Type value to the MJParameterInfo type union.
 */
function mapQueryParamTypeToParserType(
    type: 'string' | 'number' | 'date' | 'boolean' | 'array'
): MJParameterInfo['type'] {
    const validTypes: Set<MJParameterInfo['type']> = new Set(['string', 'number', 'date', 'boolean', 'array']);
    return validTypes.has(type as MJParameterInfo['type']) ? (type as MJParameterInfo['type']) : 'string';
}

/**
 * Merges passthrough parameters into the deterministic parameter list,
 * skipping any that are already detected as direct template expressions.
 */
function mergePassthroughParams(
    deterministicParams: MJParameterInfo[],
    passthroughParams: MJParameterInfo[]
): MJParameterInfo[] {
    if (passthroughParams.length === 0) return deterministicParams;

    const existingNames = new Set(deterministicParams.map(p => p.name.toLowerCase()));
    const merged = [...deterministicParams];

    for (const pt of passthroughParams) {
        if (!existingNames.has(pt.name.toLowerCase())) {
            merged.push(pt);
            existingNames.add(pt.name.toLowerCase());
        }
    }

    return merged;
}

/**
 * Simulates extractPassthroughParamsFromCompositions for pure-function testing.
 * Given SQL and a mock query parameter lookup, returns MJParameterInfo[] for passthroughs.
 */
function extractPassthroughParamsFromSQL(
    sql: string,
    depParamLookup: (queryName: string, categoryPath: string, depParamName: string) => {
        Type: 'string' | 'number' | 'date' | 'boolean' | 'array';
        IsRequired: boolean;
        DefaultValue: string | null;
    } | undefined
): MJParameterInfo[] {
    const compositionRefs = SQLParser.ExtractCompositionRefs(sql);
    const passthroughParams: MJParameterInfo[] = [];
    const seenParamNames = new Set<string>();

    for (const ref of compositionRefs) {
        const passthroughMappings = ref.parameters.filter(p => p.isPassThrough);
        if (passthroughMappings.length === 0) continue;

        for (const mapping of passthroughMappings) {
            const parentParamName = mapping.value;
            const parentParamNameLower = parentParamName.toLowerCase();

            if (seenParamNames.has(parentParamNameLower)) continue;
            seenParamNames.add(parentParamNameLower);

            const depParam = depParamLookup(ref.queryName, ref.categoryPath, mapping.key);

            passthroughParams.push({
                name: parentParamName,
                type: depParam ? mapQueryParamTypeToParserType(depParam.Type) : 'string',
                isRequired: depParam ? depParam.IsRequired : true,
                defaultValue: depParam?.DefaultValue ?? null,
                filters: [],
                usageLocations: [ref.raw],
            });
        }
    }

    return passthroughParams;
}

describe('Passthrough Parameter Extraction', () => {
    describe('mapQueryParamTypeToParserType', () => {
        it('should map all valid types 1:1', () => {
            expect(mapQueryParamTypeToParserType('string')).toBe('string');
            expect(mapQueryParamTypeToParserType('number')).toBe('number');
            expect(mapQueryParamTypeToParserType('date')).toBe('date');
            expect(mapQueryParamTypeToParserType('boolean')).toBe('boolean');
            expect(mapQueryParamTypeToParserType('array')).toBe('array');
        });
    });

    describe('mergePassthroughParams', () => {
        it('should append passthrough params not already in deterministic list', () => {
            const det: MJParameterInfo[] = [{
                name: 'Region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];
            const pt: MJParameterInfo[] = [{
                name: 'Year', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const merged = mergePassthroughParams(det, pt);
            expect(merged).toHaveLength(2);
            expect(merged.map(p => p.name)).toEqual(['Region', 'Year']);
        });

        it('should skip passthrough params that match existing deterministic params (case-insensitive)', () => {
            const det: MJParameterInfo[] = [{
                name: 'Region', type: 'string', isRequired: false,
                defaultValue: 'US', filters: [{ name: 'sqlString', args: [] }], usageLocations: ['{{ Region | sqlString }}'],
            }];
            const pt: MJParameterInfo[] = [{
                name: 'region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: ['{{query:"Q(r=region)"}}'],
            }];

            const merged = mergePassthroughParams(det, pt);
            expect(merged).toHaveLength(1);
            // Deterministic version wins (preserves original type info and filters)
            expect(merged[0].name).toBe('Region');
            expect(merged[0].isRequired).toBe(false);
            expect(merged[0].defaultValue).toBe('US');
        });

        it('should return deterministic params unchanged when no passthroughs', () => {
            const det: MJParameterInfo[] = [{
                name: 'X', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const merged = mergePassthroughParams(det, []);
            expect(merged).toBe(det); // Same reference — no copy made
        });

        it('should deduplicate passthrough params by name', () => {
            const det: MJParameterInfo[] = [];
            const pt: MJParameterInfo[] = [
                { name: 'Year', type: 'number', isRequired: true, defaultValue: null, filters: [], usageLocations: ['ref1'] },
                { name: 'year', type: 'string', isRequired: false, defaultValue: null, filters: [], usageLocations: ['ref2'] },
            ];

            const merged = mergePassthroughParams(det, pt);
            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('Year'); // First one wins
        });
    });

    describe('extractPassthroughParamsFromSQL (integration)', () => {
        it('should extract passthrough params from a composition ref with mixed static and passthrough args', () => {
            const sql = `SELECT base.AgentName, base.TotalRuns, base.TotalCost,
       SUM(ISNULL(r.TotalPromptTokensUsed, 0)) AS TotalInputTokens,
       SUM(ISNULL(r.TotalCompletionTokensUsed, 0)) AS TotalOutputTokens
FROM {{query:"Demos/AI Agent Run Cost Summary(param1='West', param2=arg2)"}} base
LEFT JOIN __mj.vwMJAIAgentRuns r ON r.ID = base.ID`;

            const depLookup = (queryName: string, _catPath: string, depParamName: string) => {
                if (queryName === 'AI Agent Run Cost Summary' && depParamName === 'param2') {
                    return { Type: 'number' as const, IsRequired: true, DefaultValue: null };
                }
                return undefined;
            };

            const params = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('arg2');
            expect(params[0].type).toBe('number');  // Inherited from dependency query
            expect(params[0].isRequired).toBe(true); // Inherited from dependency query
        });

        it('should extract multiple passthroughs from a single composition ref', () => {
            const sql = `SELECT * FROM {{query:"Reports/Sales Summary(year=fiscalYear, region=userRegion, limit='100')"}} s`;

            const depLookup = (_q: string, _c: string, depParamName: string) => {
                const params: Record<string, { Type: 'string' | 'number' | 'date'; IsRequired: boolean; DefaultValue: string | null }> = {
                    'year': { Type: 'number', IsRequired: true, DefaultValue: null },
                    'region': { Type: 'string', IsRequired: false, DefaultValue: 'All' },
                };
                return params[depParamName];
            };

            const params = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(params).toHaveLength(2); // fiscalYear, userRegion (limit is static)

            const fiscalYear = params.find(p => p.name === 'fiscalYear')!;
            expect(fiscalYear).toBeDefined();
            expect(fiscalYear.type).toBe('number');
            expect(fiscalYear.isRequired).toBe(true);

            const userRegion = params.find(p => p.name === 'userRegion')!;
            expect(userRegion).toBeDefined();
            expect(userRegion.type).toBe('string');
            expect(userRegion.isRequired).toBe(false);
            expect(userRegion.defaultValue).toBe('All');
        });

        it('should extract passthroughs from multiple composition refs', () => {
            const sql = `SELECT a.*, b.*
FROM {{query:"Golden-Queries/Agent Runs(status=runStatus)"}} a
LEFT JOIN {{query:"Golden-Queries/Prompt Runs(modelId=selectedModel)"}} b ON a.ID = b.AgentRunID`;

            const depLookup = (queryName: string, _c: string, depParamName: string) => {
                if (queryName === 'Agent Runs' && depParamName === 'status') {
                    return { Type: 'string' as const, IsRequired: true, DefaultValue: null };
                }
                if (queryName === 'Prompt Runs' && depParamName === 'modelId') {
                    return { Type: 'string' as const, IsRequired: true, DefaultValue: null };
                }
                return undefined;
            };

            const params = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(params).toHaveLength(2);
            expect(params.map(p => p.name).sort()).toEqual(['runStatus', 'selectedModel']);
        });

        it('should deduplicate when same variable is passed to multiple composition refs', () => {
            const sql = `SELECT a.*, b.*
FROM {{query:"Q1(year=fiscalYear)"}} a
JOIN {{query:"Q2(yr=fiscalYear)"}} b ON a.ID = b.ID`;

            const depLookup = () => ({ Type: 'number' as const, IsRequired: true, DefaultValue: null });

            const params = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('fiscalYear');
        });

        it('should handle composition refs with no passthrough args (all static)', () => {
            const sql = `SELECT * FROM {{query:"Reports/Static Report(year='2024', region='West')"}} r`;

            const params = extractPassthroughParamsFromSQL(sql, () => undefined);
            expect(params).toHaveLength(0);
        });

        it('should handle composition refs with no args at all', () => {
            const sql = `SELECT * FROM {{query:"Reports/Simple Report"}} r`;

            const params = extractPassthroughParamsFromSQL(sql, () => undefined);
            expect(params).toHaveLength(0);
        });

        it('should default to string/required when dependency param not found', () => {
            const sql = `SELECT * FROM {{query:"Unknown/Q(p=myVar)"}} q`;

            // Simulate: dependency query found, but the specific param doesn't exist
            const params = extractPassthroughParamsFromSQL(sql, () => undefined);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('myVar');
            expect(params[0].type).toBe('string');
            expect(params[0].isRequired).toBe(true);
            expect(params[0].defaultValue).toBeNull();
        });

        it('should handle SQL with both template expressions and composition passthroughs', () => {
            const sql = `SELECT *
FROM {{query:"Golden-Queries/Base Data(year=fiscalYear)"}} base
WHERE base.Region = {{ Region | sqlString }}
{% if MinCount %}AND base.Count >= {{ MinCount | sqlNumber }}{% endif %}`;

            const depLookup = (_q: string, _c: string, depParamName: string) => {
                if (depParamName === 'year') {
                    return { Type: 'number' as const, IsRequired: true, DefaultValue: null };
                }
                return undefined;
            };

            // Template expressions (direct)
            const directParams = SQLParser.ExtractParameterInfo(sql);
            expect(directParams).toHaveLength(2);
            expect(directParams.map(p => p.name).sort()).toEqual(['MinCount', 'Region']);

            // Passthrough from composition
            const passthroughParams = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(passthroughParams).toHaveLength(1);
            expect(passthroughParams[0].name).toBe('fiscalYear');

            // Merged: all three parameters
            const merged = mergePassthroughParams(directParams, passthroughParams);
            expect(merged).toHaveLength(3);
            expect(merged.map(p => p.name).sort()).toEqual(['MinCount', 'Region', 'fiscalYear']);
        });

        it('should not duplicate when passthrough name matches a direct template expression', () => {
            // The variable "Year" is used both as a direct template expression AND passed through
            const sql = `SELECT *
FROM {{query:"Base(yr=Year)"}} base
WHERE base.Category = {{ Year | sqlNumber }}`;

            const depLookup = () => ({ Type: 'number' as const, IsRequired: true, DefaultValue: null });

            const directParams = SQLParser.ExtractParameterInfo(sql);
            expect(directParams).toHaveLength(1);
            expect(directParams[0].name).toBe('Year');

            const passthroughParams = extractPassthroughParamsFromSQL(sql, depLookup);
            expect(passthroughParams).toHaveLength(1);
            expect(passthroughParams[0].name).toBe('Year');

            // Merge should deduplicate — direct template expression takes priority
            const merged = mergePassthroughParams(directParams, passthroughParams);
            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('Year');
            expect(merged[0].type).toBe('number'); // From direct extraction (sqlNumber filter)
        });
    });
});
