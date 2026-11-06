/**
 * Synthetic render-then-compose fixtures: inline dependency definitions and outer-query cases.
 *
 * Every dependency lives in category `/Syn/` and is passed to `RenderPipeline.Run` as an inline
 * dependency, so no metadata or database is involved. The SQL is synthetic (it reads `__mj.Entity`
 * or a `VALUES` list), and each case names the text the redesign is expected to produce.
 */
import { QueryParameterInfo } from '@memberjunction/core';
import type { QueryDependencySpec } from '@memberjunction/core';
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';

/** The parameter types a query parameter definition can carry. */
export type SyntheticParamType = 'string' | 'number' | 'date' | 'boolean' | 'array';

/** One outer query, the values it is run with, and its own parameter definitions. */
export interface SyntheticCase {
    /** Case id from the experiment (A0, A4, H1, ...). */
    Id: string;
    /** Outer query SQL (may contain composition tokens and Nunjucks). */
    SQL: string;
    /** The outer query's own parameter definitions. */
    Defs: QueryParameterInfo[];
    /** Values the caller supplies. */
    Values: Record<string, string>;
    /** Whether the outer query is flagged as a template. Defaults to true. */
    UsesTemplate?: boolean;
}

/** Builds a parameter definition with the experiment's defaults (optional, no default, no filters). */
export function ParamDef(name: string, type: SyntheticParamType = 'number'): QueryParameterInfo {
    return new QueryParameterInfo({
        Name: name,
        Type: type,
        IsRequired: false,
        DefaultValue: null,
        ValidationFilters: null,
        IsServerSet: false,
        SampleValue: null,
    });
}

/**
 * `RenderContext.ParameterDefinitions` / `QueryTemplateInput.Parameters` are typed as the entity
 * class, while inline specs carry `QueryParameterInfo`. The processor reads only the shared fields
 * (Name, Type, IsRequired, DefaultValue, ValidationFilters, IsServerSet), which is the same
 * conversion `GenericDatabaseProvider.resolveSpecParameters` makes.
 */
export function AsEntityDefs(defs: QueryParameterInfo[]): MJQueryParameterEntity[] {
    return defs as MJQueryParameterEntity[];
}

function dep(name: string, sql: string, defs: QueryParameterInfo[] = [], usesTemplate = true): QueryDependencySpec {
    return { Name: name, CategoryPath: '/Syn/', SQL: sql, UsesTemplate: usesTemplate, ParameterDefinitions: defs };
}

const VALUES_YEARS_NUM = `SELECT y FROM (VALUES (2024),(2025),(2026)) v(y)`;

/** Dependencies, as in `rtc-experiment/synthetic.mjs`. */
export const SyntheticDependencies: QueryDependencySpec[] = [
    dep('TwoVars', `SELECT {{ A | sqlNumber }} AS a, {{ B | sqlNumber }} AS b`, [ParamDef('A'), ParamDef('B')]),
    dep('SetsLimit', `{% set Limit = 1 %}${VALUES_YEARS_NUM} WHERE y > 2000`),
    dep('YearStr', `SELECT y FROM (VALUES ('2024'),('2025'),('2026')) v(y) WHERE y = {{ TargetYear | sqlString }}`, [ParamDef('TargetYear')]),
    dep('YearVals', `${VALUES_YEARS_NUM} WHERE y = {{ TargetYear | sqlNumber }}`, [ParamDef('TargetYear')]),
    dep('EntitiesByYear', `SELECT ID, Name, YEAR(__mj_CreatedAt) AS Yr FROM __mj.Entity WHERE YEAR(__mj_CreatedAt) = {{ TargetYear | sqlNumber }}`, [ParamDef('TargetYear')]),
    dep('OrderedEntities', `SELECT Name, SchemaName FROM __mj.Entity WHERE SchemaName = {{ Schema | sqlString }} ORDER BY Name`, [ParamDef('Schema', 'string')]),
    dep('InString', `SELECT Name FROM __mj.Entity WHERE Name LIKE '{{ Prefix }}%'`, [ParamDef('Prefix', 'string')]),
];

/** Outer-query cases used by the render-then-compose pins and protects. */
export const SyntheticCases: Record<'A0' | 'A4' | 'H1' | 'H2' | 'F2' | 'K3' | 'K4' | 'K7' | 'K8', SyntheticCase> = {
    A0: {
        Id: 'A0',
        SQL: `SELECT y FROM {{query:"Syn/YearVals(TargetYear=TargetYear - 1)"}} x`,
        Defs: [ParamDef('TargetYear')],
        Values: { TargetYear: '2026' },
    },
    A4: {
        Id: 'A4',
        SQL: `SELECT y FROM {{query:"Syn/YearStr(TargetYear=TargetYear - 1)"}} x`,
        Defs: [ParamDef('TargetYear')],
        Values: { TargetYear: '2026' },
    },
    H1: {
        Id: 'H1',
        SQL: `SELECT COUNT(*) AS N FROM {{query:"Syn/InString(Prefix='Act')"}} x`,
        Defs: [],
        Values: {},
        UsesTemplate: false,
    },
    H2: {
        Id: 'H2',
        SQL: `SELECT COUNT(*) AS N FROM {{query:"Syn/OrderedEntities(Schema='o''x')"}} x`,
        Defs: [],
        Values: {},
        UsesTemplate: false,
    },
    F2: {
        Id: 'F2',
        SQL: `SELECT 0{% for y in Years %} + (SELECT COUNT(*) FROM {{query:"Syn/EntitiesByYear(TargetYear=y)"}} x{{ loop.index }}){% endfor %} AS N`,
        Defs: [ParamDef('Years', 'array')],
        Values: { Years: '[2025, 2026]' },
    },
    K3: {
        Id: 'K3',
        SQL: `{% set Prior = TargetYear - 1 %}SELECT y FROM {{query:"Syn/YearVals(TargetYear=Prior)"}} x`,
        Defs: [ParamDef('TargetYear')],
        Values: { TargetYear: '2026' },
    },
    K4: {
        Id: 'K4',
        SQL: `SELECT TOP {{ Limit | sqlNumber }} y FROM {{query:"Syn/SetsLimit"}} x ORDER BY y`,
        Defs: [ParamDef('Limit')],
        Values: { Limit: '3' },
    },
    K7: {
        Id: 'K7',
        SQL: `SELECT * FROM {{query:"Syn/TwoVars(A=B, B='5')"}} x`,
        Defs: [ParamDef('B')],
        Values: { B: '1' },
    },
    K8: {
        Id: 'K8',
        SQL: `SELECT * FROM {{query:"Syn/TwoVars(A=B, B=A)"}} x`,
        Defs: [ParamDef('A'), ParamDef('B')],
        Values: { A: '1', B: '2' },
    },
};

const PG_VALUES_YEARS_NUM = `SELECT y FROM (VALUES (2024),(2025),(2026)) AS v(y)`;

/**
 * PostgreSQL versions of the dependencies, under the same names. T-SQL-only syntax is replaced
 * (`YEAR(x)` → `EXTRACT(YEAR FROM x)`, bracket-free quoted identifiers for `__mj."Entity"`); the
 * template parts are unchanged, since those are what the cases exercise.
 */
export const SyntheticDependenciesPG: QueryDependencySpec[] = [
    dep('TwoVars', `SELECT {{ A | sqlNumber }} AS a, {{ B | sqlNumber }} AS b`, [ParamDef('A'), ParamDef('B')]),
    dep('SetsLimit', `{% set Limit = 1 %}${PG_VALUES_YEARS_NUM} WHERE y > 2000`),
    dep('YearStr', `SELECT y FROM (VALUES ('2024'),('2025'),('2026')) AS v(y) WHERE y = {{ TargetYear | sqlString }}`, [ParamDef('TargetYear')]),
    dep('YearVals', `${PG_VALUES_YEARS_NUM} WHERE y = {{ TargetYear | sqlNumber }}`, [ParamDef('TargetYear')]),
    dep(
        'EntitiesByYear',
        `SELECT "ID", "Name", EXTRACT(YEAR FROM "__mj_CreatedAt") AS "Yr" FROM __mj."Entity" WHERE EXTRACT(YEAR FROM "__mj_CreatedAt") = {{ TargetYear | sqlNumber }}`,
        [ParamDef('TargetYear')],
    ),
    dep('InString', `SELECT "Name" FROM __mj."Entity" WHERE "Name" LIKE '{{ Prefix }}%'`, [ParamDef('Prefix', 'string')]),
];

/**
 * PostgreSQL variants of the outer-query cases. Only K4 differs in text (`TOP n` → `LIMIT n`); the
 * others reuse the SQL Server outer SQL, which is portable.
 */
export const SyntheticCasesPG: Record<'A0' | 'A4' | 'H1' | 'F2' | 'K3' | 'K4' | 'K7' | 'K8', SyntheticCase> = {
    A0: { ...SyntheticCases.A0, Id: 'A0-pg' },
    A4: { ...SyntheticCases.A4, Id: 'A4-pg' },
    H1: { ...SyntheticCases.H1, Id: 'H1-pg' },
    F2: { ...SyntheticCases.F2, Id: 'F2-pg' },
    K3: { ...SyntheticCases.K3, Id: 'K3-pg' },
    K4: {
        Id: 'K4-pg',
        SQL: `SELECT y FROM {{query:"Syn/SetsLimit"}} x ORDER BY y LIMIT {{ Limit | sqlNumber }}`,
        Defs: [ParamDef('Limit')],
        Values: { Limit: '3' },
    },
    K7: { ...SyntheticCases.K7, Id: 'K7-pg' },
    K8: { ...SyntheticCases.K8, Id: 'K8-pg' },
};
