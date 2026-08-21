/**
 * Unit tests for the MJ: Queries server-side extraction pipeline heuristics.
 *
 * Drives the REAL production code exported from `custom/query-extraction`:
 *   - enrich.ts  — MergeParametersWithLLM, GenerateParameterDescription,
 *                  BuildPassthroughDescription, GenerateSampleValue, NormalizeDefaultForType
 *   - resolve.ts — ResolveCompositionReferences, BuildPassthroughParams,
 *                  MergePassthroughParams, MapQueryParamTypeToParserType,
 *                  EnrichFieldTypesFromCompositions, EnrichFieldTypesFromEntityMetadata
 *
 * The SQLParser provides the deterministic structure; these tests verify the merge
 * with LLM enrichment, passthrough inheritance from dependency queries, and the
 * heuristic fallbacks — all without a database connection.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '@memberjunction/sql-parser';
import type { MJParameterInfo, SQLSelectColumn } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type {
    MJQueryEntityExtended,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
} from '@memberjunction/core-entities';
import {
    MergeParametersWithLLM,
    GenerateParameterDescription,
    BuildPassthroughDescription,
    GenerateSampleValue,
    NormalizeDefaultForType,
} from '../custom/query-extraction/enrich';
import {
    ResolveCompositionReferences,
    ResolveQueryByNameAndCategory,
    BuildPassthroughParams,
    MergePassthroughParams,
    MapQueryParamTypeToParserType,
    EnrichFieldTypesFromCompositions,
    EnrichFieldTypesFromEntityMetadata,
} from '../custom/query-extraction/resolve';
import type {
    ExtractedField,
    ExtractedParameter,
    ParameterExtractionResult,
    PassthroughParamContext,
    ResolvedCompositionReference,
} from '../custom/query-extraction/types';

const tsqlDialect = new SQLServerDialect();
const extractSelectColumns = (sql: string, dialect = tsqlDialect) => SQLParser.ExtractSelectColumns(sql, dialect);
const extractTableRefs = (sql: string, dialect = tsqlDialect) => SQLParser.ExtractTableRefs(sql, dialect);

// ═══════════════════════════════════════════════════
// Test helpers — minimal structural stubs for the
// entity types the resolve stage reads from. Only the
// properties the production functions actually touch
// are populated; `Pick<>` keeps them honest against
// the real entity classes.
// ═══════════════════════════════════════════════════

type QueryParameterStubShape = Pick<
    MJQueryParameterEntity,
    'Name' | 'Type' | 'IsRequired' | 'DefaultValue' | 'Description' | 'SampleValue'
>;

interface StubParameterInput {
    name: string;
    type: MJQueryParameterEntity['Type'];
    isRequired?: boolean;
    defaultValue?: string | null;
    description?: string | null;
    sampleValue?: string | null;
}

function stubQueryParameter(input: StubParameterInput): MJQueryParameterEntity {
    const shape: QueryParameterStubShape = {
        Name: input.name,
        Type: input.type,
        IsRequired: input.isRequired ?? true,
        DefaultValue: input.defaultValue ?? null,
        Description: input.description ?? null,
        SampleValue: input.sampleValue ?? null,
    };
    return shape as MJQueryParameterEntity;
}

type QueryFieldStubShape = Pick<
    MJQueryFieldEntity,
    'Name' | 'Description' | 'SQLBaseType' | 'SQLFullType' | 'SourceEntityID' | 'SourceFieldName' | 'IsComputed' | 'IsSummary'
>;

interface StubFieldInput {
    name: string;
    sqlBaseType: string;
    sqlFullType: string;
    sourceEntityID?: string | null;
    sourceFieldName?: string | null;
    isComputed?: boolean;
    isSummary?: boolean;
    description?: string | null;
}

function stubQueryField(input: StubFieldInput): MJQueryFieldEntity {
    const shape: QueryFieldStubShape = {
        Name: input.name,
        Description: input.description ?? null,
        SQLBaseType: input.sqlBaseType,
        SQLFullType: input.sqlFullType,
        SourceEntityID: input.sourceEntityID ?? null,
        SourceFieldName: input.sourceFieldName ?? null,
        IsComputed: input.isComputed ?? false,
        IsSummary: input.isSummary ?? false,
    };
    return shape as MJQueryFieldEntity;
}

type QueryStubShape = Pick<
    MJQueryEntityExtended,
    'ID' | 'Name' | 'CategoryPath' | 'Reusable' | 'QueryParameters' | 'QueryFields'
>;

interface StubQueryInput {
    id?: string;
    name: string;
    /** Real MJQueryEntityExtended.CategoryPath format: slash-separated segments
     *  WITHOUT leading/trailing slashes (e.g. "Golden-Queries/Membership"). */
    categoryPath?: string;
    reusable?: boolean;
    parameters?: MJQueryParameterEntity[];
    fields?: MJQueryFieldEntity[];
}

function stubQuery(input: StubQueryInput): MJQueryEntityExtended {
    const shape: QueryStubShape = {
        ID: input.id ?? `query-id-${input.name}`,
        Name: input.name,
        CategoryPath: input.categoryPath ?? '',
        Reusable: input.reusable ?? true,
        QueryParameters: input.parameters ?? [],
        QueryFields: input.fields ?? [],
    };
    return shape as MJQueryEntityExtended;
}

function stubMetadataProvider(entities: EntityInfo[] = []): IMetadataProvider {
    const shape: Pick<IMetadataProvider, 'Entities'> = { Entities: entities };
    return shape as IMetadataProvider;
}

interface BuildEntityFieldInput {
    Name: string;
    Type: string;
    /** For nvarchar/nchar the metadata Length is in BYTES (2x the character count). */
    Length?: number;
    Precision?: number;
    Scale?: number;
    Description?: string | null;
}

/** Builds a REAL EntityInfo instance (the same class production reads from metadata). */
function buildEntity(input: {
    id?: string;
    name: string;
    schema: string;
    baseView: string;
    fields: BuildEntityFieldInput[];
}): EntityInfo {
    return new EntityInfo({
        ID: input.id ?? `entity-id-${input.name}`,
        Name: input.name,
        SchemaName: input.schema,
        BaseView: input.baseView,
        BaseTable: input.baseView.replace(/^vw/, ''),
        EntityFields: input.fields.map((f, i) => ({
            ID: `entity-field-${input.name}-${i}`,
            Name: f.Name,
            Type: f.Type,
            Length: f.Length ?? 0,
            Precision: f.Precision ?? 0,
            Scale: f.Scale ?? 0,
            Description: f.Description ?? null,
        })),
    });
}

/** Wraps LLM parameters into the ParameterExtractionResult shape the real merge consumes. */
function llmResult(parameters: ExtractedParameter[]): ParameterExtractionResult {
    return { parameters };
}

/** Runs the real resolve path: composition token resolution → passthrough parameter build. */
function extractPassthroughParams(
    sql: string,
    allQueries: MJQueryEntityExtended[],
    queryName = 'Parent Query'
): MJParameterInfo[] {
    const refs = ResolveCompositionReferences(sql, queryName, allQueries);
    return BuildPassthroughParams(refs).params;
}

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

        // Regression test for Skip-Brain Bug B (run 0FEF1C47).
        // Verifies the integration: when a query SQL contains a `{% for X in Y %}`
        // loop, the deterministic extractor (consumed by parse.ts → enrich.ts →
        // sync.ts) registers the iterable Y as a parameter and skips the loop
        // local X. Without this, Save() would create a stale `kw` parameter
        // record and reject every actual save attempt with
        // "Required parameter 'kw' is missing; Unknown parameter: 'OrgKeywords'".
        it('should register the iterable as an array parameter and skip the loop local (Skip Bug B)', () => {
            const sql = `SELECT *
FROM [Sessions]
WHERE EXISTS (
    SELECT 1 FROM [Speakers] s
    WHERE (
        {% for kw in OrgKeywords %}
        s.[Org] LIKE {{ kw | sqlLikeContains }}
        {% if not loop.last %}OR {% endif %}
        {% endfor %}
    )
)
AND YEAR(s.[Date]) >= {{ StartYear | sqlNumber }}`;

            const params = SQLParser.ExtractParameterInfo(sql);

            // OrgKeywords (iterable) is registered as array, required.
            const orgKeywords = params.find(p => p.name === 'OrgKeywords');
            expect(orgKeywords).toBeDefined();
            expect(orgKeywords!.type).toBe('array');
            expect(orgKeywords!.isRequired).toBe(true);

            // Plain (non-loop) parameter still works.
            const startYear = params.find(p => p.name === 'StartYear');
            expect(startYear).toBeDefined();
            expect(startYear!.type).toBe('number');

            // Loop local must NOT leak as a parameter — the validator would
            // otherwise reject every save with "Required parameter 'kw' is missing".
            expect(params.find(p => p.name === 'kw')).toBeUndefined();

            // Nunjucks built-ins must NOT leak either (loop.last → loop, last).
            expect(params.find(p => p.name === 'loop')).toBeUndefined();
            expect(params.find(p => p.name === 'last')).toBeUndefined();
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

            const tables = extractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(1);
            const tableNames = tables.map(t => t.TableName);
            expect(tableNames).toContain('vwChapters');
        });

        it('should extract tables from multi-join query', () => {
            const sql = `SELECT m.ID
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwMemberships] ms ON ms.MemberID = m.ID
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID`;

            const tables = extractTableRefs(sql);
            expect(tables.length).toBeGreaterThanOrEqual(3);
        });

        it('should extract schema names correctly', () => {
            const tables = extractTableRefs('SELECT * FROM nams.vwAccounts a');
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
// (real functions from custom/query-extraction/enrich.ts)
// ═══════════════════════════════════════════════════

describe('Parameter Merge Logic', () => {
    describe('MergeParametersWithLLM', () => {
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

            const result = MergeParametersWithLLM(det, llmResult(llm));
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

            const result = MergeParametersWithLLM(det, null);
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

            const result = MergeParametersWithLLM(det, llmResult(llm));
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

            const result = MergeParametersWithLLM(det, null);
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

            const result = MergeParametersWithLLM(det, null);
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

            const result = MergeParametersWithLLM(det, llmResult(llm));
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

            const result = MergeParametersWithLLM(det, llmResult(llm));
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

            const result = MergeParametersWithLLM(det, llmResult(llm));
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

            const result = MergeParametersWithLLM(det, null, ptContext);
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

            const result = MergeParametersWithLLM(det, llmResult(llm), ptContext);
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

            const result = MergeParametersWithLLM(det, null, ptContext);
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

            const result = MergeParametersWithLLM(det, llmResult(llm), ptContext);
            expect(result[0].description).toBe('LLM description'); // LLM wins
            expect(result[0].sampleValue).toBe('West'); // Inherited wins over heuristic
        });

        it('should give caller-provided parameter hints highest priority for sampleValue', () => {
            const det: MJParameterInfo[] = [{
                name: 'Region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const llm: ExtractedParameter[] = [{
                name: 'Region', type: 'string', isRequired: true,
                description: 'Region filter', usage: [], defaultValue: null, sampleValue: 'LLMValue',
            }];

            const hints = new Map<string, string>([['Region', 'TestedValue']]);

            const result = MergeParametersWithLLM(det, llmResult(llm), new Map<string, PassthroughParamContext>(), hints);
            expect(result[0].sampleValue).toBe('TestedValue'); // hint beats LLM
            expect(result[0].description).toBe('Region filter'); // description untouched by hints
        });

        it('should match parameter hints by lowercased name as fallback', () => {
            const det: MJParameterInfo[] = [{
                name: 'MinCount', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const hints = new Map<string, string>([['mincount', '99']]);

            const result = MergeParametersWithLLM(det, null, new Map<string, PassthroughParamContext>(), hints);
            expect(result[0].sampleValue).toBe('99');
        });

        // The old mirrored suite returned the raw default ('Attended') here — the REAL
        // merge normalizes array-typed defaults into JSON array strings so downstream
        // consumers (queryParameterProcessor) can parse them safely.
        it('should normalize array-typed defaults to JSON array strings in the merged defaultValue', () => {
            const det: MJParameterInfo[] = [{
                name: 'Statuses', type: 'array', isRequired: false,
                defaultValue: 'Attended', filters: [], usageLocations: [],
            }];

            const result = MergeParametersWithLLM(det, null);
            expect(result[0].defaultValue).toBe('["Attended"]');
            // NOTE (real behavior): sampleValue still reflects the RAW default,
            // not the normalized JSON array — GenerateSampleValue stringifies
            // dp.defaultValue before normalization is applied.
            expect(result[0].sampleValue).toBe('Attended');
        });
    });

    describe('BuildPassthroughDescription', () => {
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
            expect(BuildPassthroughDescription(param, context)).toBe(
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
            expect(BuildPassthroughDescription(param, context)).toBe(
                'Optional numeric value for Min Count (passed through to "Activity Query" as "minActivityCount")'
            );
        });
    });

    describe('GenerateParameterDescription', () => {
        it('should generate description for required string param', () => {
            const desc = GenerateParameterDescription({
                name: 'Region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Required text value for Region');
        });

        it('should generate description for optional number param', () => {
            const desc = GenerateParameterDescription({
                name: 'MinCount', type: 'number', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Optional numeric value for Min Count');
        });

        it('should include default value in description', () => {
            const desc = GenerateParameterDescription({
                name: 'Limit', type: 'number', isRequired: true,
                defaultValue: 25, filters: [], usageLocations: [],
            });
            expect(desc).toBe('Required numeric value for Limit (default: 25)');
        });

        it('should split camelCase names into human-readable form', () => {
            const desc = GenerateParameterDescription({
                name: 'MinActivityCount', type: 'number', isRequired: false,
                defaultValue: null, filters: [], usageLocations: [],
            });
            expect(desc).toContain('Min Activity Count');
        });
    });

    describe('GenerateSampleValue', () => {
        it('should return default value when available', () => {
            expect(GenerateSampleValue({
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
                expect(GenerateSampleValue({
                    name: 'x', type, isRequired: true,
                    defaultValue: null, filters: [], usageLocations: [],
                })).toBe(expected);
            }
        });

        it('should return null for unknown type', () => {
            expect(GenerateSampleValue({
                name: 'x', type: 'unknown', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            })).toBeNull();
        });
    });
});

// ═══════════════════════════════════════════════════
// Test passthrough parameter extraction from composition
// references — the REAL resolve path:
// ResolveCompositionReferences → BuildPassthroughParams
// ═══════════════════════════════════════════════════

describe('Passthrough Parameter Extraction', () => {
    describe('MapQueryParamTypeToParserType', () => {
        it('should map all valid types 1:1', () => {
            expect(MapQueryParamTypeToParserType('string')).toBe('string');
            expect(MapQueryParamTypeToParserType('number')).toBe('number');
            expect(MapQueryParamTypeToParserType('date')).toBe('date');
            expect(MapQueryParamTypeToParserType('boolean')).toBe('boolean');
            expect(MapQueryParamTypeToParserType('array')).toBe('array');
        });
    });

    describe('MergePassthroughParams', () => {
        it('should append passthrough params not already in deterministic list', () => {
            const det: MJParameterInfo[] = [{
                name: 'Region', type: 'string', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];
            const pt: MJParameterInfo[] = [{
                name: 'Year', type: 'number', isRequired: true,
                defaultValue: null, filters: [], usageLocations: [],
            }];

            const merged = MergePassthroughParams(det, pt);
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

            const merged = MergePassthroughParams(det, pt);
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

            const merged = MergePassthroughParams(det, []);
            expect(merged).toBe(det); // Same reference — no copy made
        });

        it('should deduplicate passthrough params by name', () => {
            const det: MJParameterInfo[] = [];
            const pt: MJParameterInfo[] = [
                { name: 'Year', type: 'number', isRequired: true, defaultValue: null, filters: [], usageLocations: ['ref1'] },
                { name: 'year', type: 'string', isRequired: false, defaultValue: null, filters: [], usageLocations: ['ref2'] },
            ];

            const merged = MergePassthroughParams(det, pt);
            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('Year'); // First one wins
        });
    });

    describe('ResolveQueryByNameAndCategory', () => {
        it('should resolve a query by unique name when no category segments given', () => {
            const q = stubQuery({ name: 'Sales Summary', categoryPath: 'Reports' });
            expect(ResolveQueryByNameAndCategory('Sales Summary', [], [q])).toBe(q);
            expect(ResolveQueryByNameAndCategory('sales summary', [], [q])).toBe(q); // case-insensitive
        });

        it('should return undefined for an ambiguous name without category disambiguation', () => {
            const q1 = stubQuery({ id: 'q1', name: 'Report', categoryPath: 'Sales' });
            const q2 = stubQuery({ id: 'q2', name: 'Report', categoryPath: 'Finance' });
            expect(ResolveQueryByNameAndCategory('Report', [], [q1, q2])).toBeUndefined();
        });

        // NOTE (real behavior): the category-qualified branch compares against
        // "/Segments/" (leading + trailing slashes), but MJQueryEntityExtended.CategoryPath
        // is built WITHOUT surrounding slashes ("Segments"), so the qualified branch never
        // matches real metadata and resolution succeeds only via the name-only fallback.
        it('should fall back to name-only matching when the category-qualified branch does not match', () => {
            const q = stubQuery({ name: 'Sales Summary', categoryPath: 'Reports' });
            expect(ResolveQueryByNameAndCategory('Sales Summary', ['Reports'], [q])).toBe(q);
        });
    });

    describe('ResolveCompositionReferences + BuildPassthroughParams (real resolve path)', () => {
        it('should extract passthrough params from a composition ref with mixed static and passthrough args', () => {
            const sql = `SELECT base.AgentName, base.TotalRuns, base.TotalCost,
       SUM(ISNULL(r.TotalPromptTokensUsed, 0)) AS TotalInputTokens,
       SUM(ISNULL(r.TotalCompletionTokensUsed, 0)) AS TotalOutputTokens
FROM {{query:"Demos/AI Agent Run Cost Summary(param1='West', param2=arg2)"}} base
LEFT JOIN __mj.vwMJAIAgentRuns r ON r.ID = base.ID`;

            const dep = stubQuery({
                name: 'AI Agent Run Cost Summary',
                categoryPath: 'Demos',
                parameters: [stubQueryParameter({ name: 'param2', type: 'number', isRequired: true })],
            });

            const params = extractPassthroughParams(sql, [dep]);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('arg2');
            expect(params[0].type).toBe('number');  // Inherited from dependency query
            expect(params[0].isRequired).toBe(true); // Inherited from dependency query
            // Real behavior: usage location records the composition reference path
            expect(params[0].usageLocations).toEqual(['Demos/AI Agent Run Cost Summary']);
        });

        it('should extract multiple passthroughs from a single composition ref', () => {
            const sql = `SELECT * FROM {{query:"Reports/Sales Summary(year=fiscalYear, region=userRegion, limit='100')"}} s`;

            const dep = stubQuery({
                name: 'Sales Summary',
                categoryPath: 'Reports',
                parameters: [
                    stubQueryParameter({ name: 'year', type: 'number', isRequired: true }),
                    stubQueryParameter({ name: 'region', type: 'string', isRequired: false, defaultValue: 'All' }),
                ],
            });

            const params = extractPassthroughParams(sql, [dep]);
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

            const agentRuns = stubQuery({
                name: 'Agent Runs',
                categoryPath: 'Golden-Queries',
                parameters: [stubQueryParameter({ name: 'status', type: 'string', isRequired: true })],
            });
            const promptRuns = stubQuery({
                name: 'Prompt Runs',
                categoryPath: 'Golden-Queries',
                parameters: [stubQueryParameter({ name: 'modelId', type: 'string', isRequired: true })],
            });

            const params = extractPassthroughParams(sql, [agentRuns, promptRuns]);
            expect(params).toHaveLength(2);
            expect(params.map(p => p.name).sort()).toEqual(['runStatus', 'selectedModel']);
        });

        it('should deduplicate when same variable is passed to multiple composition refs', () => {
            const sql = `SELECT a.*, b.*
FROM {{query:"Q1(year=fiscalYear)"}} a
JOIN {{query:"Q2(yr=fiscalYear)"}} b ON a.ID = b.ID`;

            const q1 = stubQuery({
                name: 'Q1',
                parameters: [stubQueryParameter({ name: 'year', type: 'number', isRequired: true })],
            });
            const q2 = stubQuery({
                name: 'Q2',
                parameters: [stubQueryParameter({ name: 'yr', type: 'number', isRequired: true })],
            });

            const params = extractPassthroughParams(sql, [q1, q2]);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('fiscalYear');
        });

        it('should handle composition refs with no passthrough args (all static)', () => {
            const sql = `SELECT * FROM {{query:"Reports/Static Report(year='2024', region='West')"}} r`;
            const dep = stubQuery({ name: 'Static Report', categoryPath: 'Reports' });

            const params = extractPassthroughParams(sql, [dep]);
            expect(params).toHaveLength(0);
        });

        it('should handle composition refs with no args at all', () => {
            const sql = `SELECT * FROM {{query:"Reports/Simple Report"}} r`;
            const dep = stubQuery({ name: 'Simple Report', categoryPath: 'Reports' });

            const params = extractPassthroughParams(sql, [dep]);
            expect(params).toHaveLength(0);
        });

        it('should default to string/required when the dependency query has no matching parameter', () => {
            const sql = `SELECT * FROM {{query:"Unknown/Q(p=myVar)"}} q`;
            // Dependency query exists but has no parameter named "p"
            const dep = stubQuery({ name: 'Q', categoryPath: 'Unknown' });

            const params = extractPassthroughParams(sql, [dep]);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('myVar');
            expect(params[0].type).toBe('string');
            expect(params[0].isRequired).toBe(true);
            expect(params[0].defaultValue).toBeNull();
        });

        // Real behavior the old mirrored suite could not see: an unknown dependency
        // QUERY (as opposed to an unknown dependency PARAMETER) is a hard error.
        it('should throw when the referenced dependency query does not exist', () => {
            const sql = `SELECT * FROM {{query:"Missing/Nope(p=myVar)"}} q`;
            expect(() => ResolveCompositionReferences(sql, 'Parent Query', []))
                .toThrow(/no matching query was found/);
        });

        it('should throw when the referenced dependency query is not marked Reusable', () => {
            const sql = `SELECT * FROM {{query:"Reports/Private Report(p=myVar)"}} q`;
            const dep = stubQuery({ name: 'Private Report', categoryPath: 'Reports', reusable: false });
            expect(() => ResolveCompositionReferences(sql, 'Parent Query', [dep]))
                .toThrow(/not marked as Reusable/);
        });

        it('should inherit description and sampleValue into the passthrough context map', () => {
            const sql = `SELECT * FROM {{query:"Ops/Recent Entity Changes(lookbackDays=numDays)"}} rec`;

            const dep = stubQuery({
                name: 'Recent Entity Changes',
                categoryPath: 'Ops',
                parameters: [stubQueryParameter({
                    name: 'lookbackDays',
                    type: 'number',
                    isRequired: true,
                    description: 'Number of days to look back for changes',
                    sampleValue: '30',
                })],
            });

            const refs = ResolveCompositionReferences(sql, 'Parent Query', [dep]);
            const { contextMap } = BuildPassthroughParams(refs);

            const ctx = contextMap.get('numdays')!; // keyed by lowercased parent param name
            expect(ctx).toBeDefined();
            expect(ctx.description).toBe('Number of days to look back for changes');
            expect(ctx.sampleValue).toBe('30');
            expect(ctx.depQueryName).toBe('Recent Entity Changes');
            expect(ctx.depParamName).toBe('lookbackDays');

            // And the context feeds the real merge to produce the inherited description
            // (the suffix names the DEPENDENCY's parameter, not the parent's variable)
            const merged = MergeParametersWithLLM(BuildPassthroughParams(refs).params, null, contextMap);
            expect(merged[0].description).toBe(
                'Number of days to look back for changes (passed through to "Recent Entity Changes" as "lookbackDays")'
            );
        });

        it('should handle SQL with both template expressions and composition passthroughs', () => {
            const sql = `SELECT *
FROM {{query:"Golden-Queries/Base Data(year=fiscalYear)"}} base
WHERE base.Region = {{ Region | sqlString }}
{% if MinCount %}AND base.Count >= {{ MinCount | sqlNumber }}{% endif %}`;

            const dep = stubQuery({
                name: 'Base Data',
                categoryPath: 'Golden-Queries',
                parameters: [stubQueryParameter({ name: 'year', type: 'number', isRequired: true })],
            });

            // Template expressions (direct)
            const directParams = SQLParser.ExtractParameterInfo(sql);
            expect(directParams).toHaveLength(2);
            expect(directParams.map(p => p.name).sort()).toEqual(['MinCount', 'Region']);

            // Passthrough from composition — also verify the SQL alias resolves
            const refs = ResolveCompositionReferences(sql, 'Parent Query', [dep]);
            expect(refs).toHaveLength(1);
            expect(refs[0].alias).toBe('base');

            const passthroughParams = BuildPassthroughParams(refs).params;
            expect(passthroughParams).toHaveLength(1);
            expect(passthroughParams[0].name).toBe('fiscalYear');

            // Merged: all three parameters
            const merged = MergePassthroughParams(directParams, passthroughParams);
            expect(merged).toHaveLength(3);
            expect(merged.map(p => p.name).sort()).toEqual(['MinCount', 'Region', 'fiscalYear']);
        });

        it('should not duplicate when passthrough name matches a direct template expression', () => {
            // The variable "Year" is used both as a direct template expression AND passed through
            const sql = `SELECT *
FROM {{query:"Base(yr=Year)"}} base
WHERE base.Category = {{ Year | sqlNumber }}`;

            const dep = stubQuery({
                name: 'Base',
                parameters: [stubQueryParameter({ name: 'yr', type: 'number', isRequired: true })],
            });

            const directParams = SQLParser.ExtractParameterInfo(sql);
            expect(directParams).toHaveLength(1);
            expect(directParams[0].name).toBe('Year');

            const passthroughParams = extractPassthroughParams(sql, [dep]);
            expect(passthroughParams).toHaveLength(1);
            expect(passthroughParams[0].name).toBe('Year');

            // Merge should deduplicate — direct template expression takes priority
            const merged = MergePassthroughParams(directParams, passthroughParams);
            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('Year');
            expect(merged[0].type).toBe('number'); // From direct extraction (sqlNumber filter)
        });
    });
});

// ═══════════════════════════════════════════════════
// Field type enrichment from composition references
// (real EnrichFieldTypesFromCompositions from resolve.ts)
// ═══════════════════════════════════════════════════

/** Builds a ResolvedCompositionReference around a stub dependency query's fields. */
function stubRef(
    alias: string | null,
    queryName: string,
    queryFields: MJQueryFieldEntity[]
): ResolvedCompositionReference {
    return {
        depQuery: stubQuery({ name: queryName, fields: queryFields }),
        referencePath: `Category/${queryName}`,
        alias,
        parameterMapping: null,
        passthroughMappings: [],
    };
}

describe('Field Type Enrichment from Composition References', () => {
    it('should resolve direct column match via table qualifier', () => {
        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'Name', SourceColumn: 'Name', TableQualifier: 'u', IsExpression: false,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(100)');
    });

    it('should resolve AS alias match via table qualifier', () => {
        const fields: ExtractedField[] = [{
            name: 'EntityName', description: 'Entity name', type: 'string', optional: false,
        }];

        // SELECT e.Name AS EntityName
        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'EntityName', SourceColumn: 'Name', TableQualifier: 'e', IsExpression: false,
        }];

        const refs = [stubRef('e', 'Entity Query', [
            stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(255)', sourceFieldName: 'Name' }),
            stubQueryField({ name: 'ID', sqlBaseType: 'uniqueidentifier', sqlFullType: 'uniqueidentifier' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(255)');
        expect(result[0].sourceFieldName).toBe('Name'); // Resolved source field name
    });

    it('should fall back to flat lookup for expression fields (IsExpression=true)', () => {
        const fields: ExtractedField[] = [{
            name: 'UserCount', description: 'Count of users', type: 'number', optional: false,
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'UserCount', SourceColumn: 'COUNT(*)', TableQualifier: null, IsExpression: true,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({ name: 'UserCount', sqlBaseType: 'int', sqlFullType: 'int' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        // Expression columns are skipped during SELECT column resolution, but flat lookup still applies
        // since the dep has a field named "UserCount". The flat lookup is the final fallback.
        expect(result[0].sqlBaseType).toBe('int');
    });

    it('should skip fields that already have sqlBaseType and sqlFullType', () => {
        const fields: ExtractedField[] = [{
            name: 'Name', description: 'Already resolved', type: 'string', optional: false,
            sqlBaseType: 'varchar', sqlFullType: 'varchar(50)',
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'Name', SourceColumn: 'Name', TableQualifier: 'u', IsExpression: false,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('varchar');     // Unchanged
        expect(result[0].sqlFullType).toBe('varchar(50)'); // Unchanged
    });

    it('should use unqualified fallback when no table qualifier', () => {
        const fields: ExtractedField[] = [{
            name: 'Status', description: 'Status field', type: 'string', optional: false,
        }];

        // No table qualifier in select column
        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'Status', SourceColumn: 'Status', TableQualifier: null, IsExpression: false,
        }];

        const refs = [stubRef('a', 'Some Query', [
            stubQueryField({ name: 'Status', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(20)' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(20)');
    });

    it('should disambiguate same field name across multiple deps using qualifier', () => {
        const fields: ExtractedField[] = [
            { name: 'Name', description: 'From users', type: 'string', optional: false },
            { name: 'EntityName', description: 'From entities', type: 'string', optional: false },
        ];

        // SELECT u.Name, e.Name AS EntityName
        const selectColumns: SQLSelectColumn[] = [
            { OutputName: 'Name', SourceColumn: 'Name', TableQualifier: 'u', IsExpression: false },
            { OutputName: 'EntityName', SourceColumn: 'Name', TableQualifier: 'e', IsExpression: false },
        ];

        const refs = [
            stubRef('u', 'User Query', [
                stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)' }),
            ]),
            stubRef('e', 'Entity Query', [
                stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(255)' }),
            ]),
        ];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(2);

        const nameField = result.find(f => f.name === 'Name')!;
        expect(nameField.sqlBaseType).toBe('nvarchar');
        expect(nameField.sqlFullType).toBe('nvarchar(100)'); // From "u" dep

        const entityNameField = result.find(f => f.name === 'EntityName')!;
        expect(entityNameField.sqlBaseType).toBe('nvarchar');
        expect(entityNameField.sqlFullType).toBe('nvarchar(255)'); // From "e" dep
    });

    it('should leave field unchanged when no matching dep field exists', () => {
        const fields: ExtractedField[] = [{
            name: 'UnknownField', description: 'Not in any dep', type: 'string', optional: false,
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'UnknownField', SourceColumn: 'UnknownField', TableQualifier: 'x', IsExpression: false,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBeUndefined();
        expect(result[0].sqlFullType).toBeUndefined();
    });

    it('should not overwrite existing sourceEntity on the field', () => {
        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
            sourceEntity: 'Users', // Already set
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'Name', SourceColumn: 'Name', TableQualifier: 'u', IsExpression: false,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({ name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)' }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider());
        expect(result[0].sourceEntity).toBe('Users'); // Preserved, not overwritten
    });

    // Real behavior the old mirrored suite lacked: the dep field's SourceEntityID
    // is resolved to the entity NAME via the metadata provider.
    it('should resolve sourceEntity from the dep field SourceEntityID via metadata', () => {
        const usersEntity = buildEntity({
            id: 'users-entity-id',
            name: 'Users',
            schema: '__mj',
            baseView: 'vwUsers',
            fields: [{ Name: 'Name', Type: 'nvarchar', Length: 200 }],
        });

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
        }];

        const selectColumns: SQLSelectColumn[] = [{
            OutputName: 'Name', SourceColumn: 'Name', TableQualifier: 'u', IsExpression: false,
        }];

        const refs = [stubRef('u', 'User Query', [
            stubQueryField({
                name: 'Name', sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar(100)',
                sourceEntityID: 'users-entity-id',
            }),
        ])];

        const result = EnrichFieldTypesFromCompositions(fields, refs, selectColumns, stubMetadataProvider([usersEntity]));
        expect(result[0].sourceEntity).toBe('Users');
    });

    it('should return the same array reference when there are no composition refs', () => {
        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
        }];

        const result = EnrichFieldTypesFromCompositions(fields, [], [], stubMetadataProvider());
        expect(result).toBe(fields);
    });
});

// ═══════════════════════════════════════════════════
// Field type enrichment from entity metadata
// (real EnrichFieldTypesFromEntityMetadata from resolve.ts,
// driven with REAL EntityInfo instances and REAL parser output)
// ═══════════════════════════════════════════════════

describe('Field Type Enrichment from Entity Metadata', () => {
    // nvarchar Length in metadata is BYTES: Length 200 → nvarchar(100), Length 510 → nvarchar(255)
    const usersEntity = () => buildEntity({
        name: 'Users',
        schema: '__mj',
        baseView: 'vwUsers',
        fields: [
            { Name: 'ID', Type: 'uniqueidentifier' },
            { Name: 'Name', Type: 'nvarchar', Length: 200 },
            { Name: 'Email', Type: 'nvarchar', Length: 510 },
            { Name: '__mj_CreatedAt', Type: 'datetimeoffset' },
        ],
    });

    const entitiesEntity = () => buildEntity({
        name: 'Entities',
        schema: '__mj',
        baseView: 'vwEntities',
        fields: [
            { Name: 'ID', Type: 'uniqueidentifier' },
            { Name: 'Name', Type: 'nvarchar', Length: 510 },
        ],
    });

    it('should resolve direct column from entity metadata via SQLParser', () => {
        const sql = 'SELECT u.Name FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(100)');
        expect(result[0].sourceEntity).toBe('Users');
        expect(result[0].sourceFieldName).toBe('Name');
    });

    it('should resolve AS alias to source column from entity metadata', () => {
        const sql = 'SELECT u.__mj_CreatedAt AS CreatedAt FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'CreatedAt', description: 'Creation timestamp', type: 'date', optional: false,
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result).toHaveLength(1);
        expect(result[0].sqlBaseType).toBe('datetimeoffset');
        // REAL behavior: EntityFieldInfo.SQLFullType does not append precision for
        // datetimeoffset — the old mirrored suite asserted 'datetimeoffset(7)' against
        // hand-fed mock data, which real metadata never produces.
        expect(result[0].sqlFullType).toBe('datetimeoffset');
        expect(result[0].sourceEntity).toBe('Users');
        expect(result[0].sourceFieldName).toBe('__mj_CreatedAt');
    });

    it('should disambiguate multiple tables by alias', () => {
        const sql = 'SELECT u.Name, e.Name AS EntityName FROM __mj.vwUsers u JOIN __mj.vwEntities e ON u.ID = e.ID';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [
            { name: 'Name', description: 'User name', type: 'string', optional: false },
            { name: 'EntityName', description: 'Entity name', type: 'string', optional: false },
        ];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity(), entitiesEntity()])
        );
        expect(result).toHaveLength(2);

        const nameField = result.find(f => f.name === 'Name')!;
        expect(nameField.sqlFullType).toBe('nvarchar(100)'); // From Users (alias "u")
        expect(nameField.sourceEntity).toBe('Users');

        const entityNameField = result.find(f => f.name === 'EntityName')!;
        expect(entityNameField.sqlFullType).toBe('nvarchar(255)'); // From Entities (alias "e")
        expect(entityNameField.sourceEntity).toBe('Entities');
        expect(entityNameField.sourceFieldName).toBe('Name'); // Source column, not the alias
    });

    it('should skip fields that already have sqlBaseType and sqlFullType', () => {
        const sql = 'SELECT u.Name FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'Already resolved', type: 'string', optional: false,
            sqlBaseType: 'varchar', sqlFullType: 'varchar(50)',
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result[0].sqlBaseType).toBe('varchar');     // Unchanged
        expect(result[0].sqlFullType).toBe('varchar(50)'); // Unchanged
    });

    it('should fall back to flat lookup when no SELECT column matches', () => {
        // Field "Email" is not in the SELECT clause but exists in the entity
        const sql = 'SELECT u.Name FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Email', description: 'User email', type: 'string', optional: false,
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(255)');
        expect(result[0].sourceEntity).toBe('Users');
    });

    it('should not overwrite existing sourceEntity on the field', () => {
        const sql = 'SELECT u.Name FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'User name', type: 'string', optional: false,
            sourceEntity: 'Custom Users', // Already set by LLM
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result[0].sourceEntity).toBe('Custom Users'); // Preserved
    });

    it('should handle unqualified SELECT columns by searching all entities', () => {
        // SELECT Name (no table qualifier)
        const sql = 'SELECT Name FROM __mj.vwUsers u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'Some name', type: 'string', optional: false,
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result[0].sqlBaseType).toBe('nvarchar');
        expect(result[0].sqlFullType).toBe('nvarchar(100)');
        expect(result[0].sourceEntity).toBe('Users');
    });

    it('should return fields unchanged when no table refs resolve to entities', () => {
        const sql = 'SELECT u.Name FROM someschema.vwNotAnEntity u';
        const selectColumns = extractSelectColumns(sql, tsqlDialect);
        const tableRefs = extractTableRefs(sql, tsqlDialect);

        const fields: ExtractedField[] = [{
            name: 'Name', description: 'Some name', type: 'string', optional: false,
        }];

        const result = EnrichFieldTypesFromEntityMetadata(
            fields, selectColumns, tableRefs, stubMetadataProvider([usersEntity()])
        );
        expect(result).toBe(fields); // Early return — same reference
        expect(result[0].sqlBaseType).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════
// MSTA Lapsed-Members-District-Movers — parameter extraction
// Tests parameter extraction for the query that caused the
// nested-WITH paging bug (composition + apostrophes in comments).
// ═══════════════════════════════════════════════════

describe('MSTA Lapsed Members District Movers — Parameter Extraction', () => {
    it('should extract TargetYear and PriorYear parameters from the lapsed-members query', () => {
        const sql = `SELECT DISTINCT
    bridge.AccountId,
    bridge.FirstName,
    bridge.LastName,
    bridge.PersonEmail,
    bridge.Region__c,
    bridge.District_Name AS Prior_District,
    d_new.description AS New_District,
    {{ PriorYear }} AS Prior_Year,
    {{ TargetYear }} AS New_Year
FROM {{query:"Golden-Queries/Membership/MSTA NAMS-DESE Member Bridge(TargetYear=PriorYear)"}} bridge
INNER JOIN nams.vwNU__Membership__cs m1
    ON m1.NU__Account__c = bridge.AccountId
    AND m1.Year__c = {{ PriorYear }}
    AND m1.NU__MembershipProductName__c NOT IN ('Student', 'Retired Annual', 'Retired Lifetime', 'Associate')
INNER JOIN dese.vweducators e_new
    ON e_new.edssn = bridge.edssn
    AND CAST(e_new.year AS INT) = {{ TargetYear }}
INNER JOIN dese.vwco_dist_descs d_new
    ON d_new.co_dist_code = e_new.co_dist_code
WHERE NOT EXISTS (
    SELECT 1 FROM nams.vwNU__Membership__cs m2
    WHERE m2.NU__Account__c = bridge.AccountId AND m2.Year__c = {{ TargetYear }}
)
AND e_new.co_dist_code != bridge.co_dist_code
ORDER BY bridge.LastName, bridge.FirstName`;

        const params = SQLParser.ExtractParameterInfo(sql);

        expect(params).toHaveLength(2);

        const priorYear = params.find(p => p.name === 'PriorYear')!;
        expect(priorYear).toBeDefined();
        expect(priorYear.isRequired).toBe(true);
        // PriorYear is used in multiple locations
        expect(priorYear.usageLocations.length).toBeGreaterThanOrEqual(2);

        const targetYear = params.find(p => p.name === 'TargetYear')!;
        expect(targetYear).toBeDefined();
        expect(targetYear.isRequired).toBe(true);
        // TargetYear is used in SELECT, CAST comparison, and NOT EXISTS
        expect(targetYear.usageLocations.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract composition ref for MSTA NAMS-DESE Member Bridge', () => {
        const sql = `SELECT * FROM {{query:"Golden-Queries/Membership/MSTA NAMS-DESE Member Bridge(TargetYear=PriorYear)"}} bridge`;

        const refs = SQLParser.ExtractCompositionRefs(sql);
        expect(refs).toHaveLength(1);
        expect(refs[0].queryName).toBe('MSTA NAMS-DESE Member Bridge');
        expect(refs[0].categoryPath).toBe('Golden-Queries/Membership');
        expect(refs[0].parameters).toHaveLength(1);
        expect(refs[0].parameters[0].key).toBe('TargetYear');
        expect(refs[0].parameters[0].value).toBe('PriorYear');
        expect(refs[0].parameters[0].isPassThrough).toBe(true);
    });

    it('should extract parameters from the NAMS-DESE Member Bridge dependency query', () => {
        const sql = `-- Bridge query: maps NAMS member accounts to DESE educator records
-- Identity is verified by matching first+last name AND confirming the educator
-- is in the same district as the member's Institution__c via co_dist_desc.
SELECT DISTINCT
    a.Id AS AccountId,
    a.FirstName,
    a.LastName,
    a.PersonEmail,
    a.Institution__c AS District_Name,
    a.Region__c,
    e.edssn,
    e.co_dist_code,
    e.year AS DESE_Year
FROM nams.vwAccounts a
INNER JOIN dese.vwco_dist_descs d
    ON d.description = a.Institution__c
INNER JOIN dese.vweducators e
    ON UPPER(LTRIM(RTRIM(e.edfname))) = UPPER(LTRIM(RTRIM(a.FirstName)))
    AND UPPER(LTRIM(RTRIM(e.edlname))) = UPPER(LTRIM(RTRIM(a.LastName)))
    AND e.co_dist_code = d.co_dist_code
    AND e.year = {{ TargetYear | sqlString }}
WHERE a.IsPersonAccount = 1
  AND a.Institution__c IS NOT NULL`;

        const params = SQLParser.ExtractParameterInfo(sql);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('TargetYear');
        expect(params[0].type).toBe('string'); // sqlString filter
        expect(params[0].isRequired).toBe(true);
    });
});

// ═══════════════════════════════════════════════════
// NormalizeDefaultForType (enrich.ts)
// Ensures array-typed parameter defaults are valid JSON arrays.
// ═══════════════════════════════════════════════════

describe('NormalizeDefaultForType', () => {
    it('should pass through non-array types unchanged', () => {
        expect(NormalizeDefaultForType('hello', 'string')).toBe('hello');
        expect(NormalizeDefaultForType('42', 'number')).toBe('42');
        expect(NormalizeDefaultForType('true', 'boolean')).toBe('true');
    });

    it('should pass through valid JSON array strings for array type', () => {
        expect(NormalizeDefaultForType('["a","b"]', 'array')).toBe('["a","b"]');
        expect(NormalizeDefaultForType('[1,2,3]', 'array')).toBe('[1,2,3]');
    });

    it('should wrap plain string in JSON array for array type', () => {
        expect(NormalizeDefaultForType('Attended', 'array')).toBe('["Attended"]');
        expect(NormalizeDefaultForType('Active', 'array')).toBe('["Active"]');
    });

    it('should wrap non-array JSON value in array for array type', () => {
        expect(NormalizeDefaultForType('42', 'array')).toBe('[42]');
        expect(NormalizeDefaultForType('"hello"', 'array')).toBe('["hello"]');
    });

    it('should handle JSON object default by wrapping in array', () => {
        const obj = '{"key":"value"}';
        const result = NormalizeDefaultForType(obj, 'array');
        expect(JSON.parse(result)).toEqual([{ key: 'value' }]);
    });
});
