/**
 * sqlpipe-composition.ts — the composition dimension of the SQL pipeline scenario matrix: the
 * reusable dependency queries every scenario may compose, and the ways a scenario composes them.
 *
 * Each dependency has its MJ text (templates, nested compositions, its own CTEs / TOP / OPTION /
 * recursion) and a plain-SQL oracle: given argument values, the CTEs and the body that return
 * the same rows. A composition variant gives the MJ row source (`{{query:"…"}}` tokens), the
 * outer parameters its arguments introduce, the dependency rows extraction must write, and the
 * oracle row source (a CTE name or a derived table over CTEs).
 */
import type { DatabasePlatform } from '@memberjunction/core';
import type { SchemaKey, Sql } from './sqlpipe-schema';
import type { ExpectedParameter, ValueCase, ValueOutcome } from './sqlpipe-templating';

/** The reusable dependency queries, created once per schema. */
export type DepKey = 'Filter' | 'Opt' | 'Cte' | 'Capped' | 'Hinted' | 'Tree' | 'Mid' | 'Top';

/** Creation order: a dependency before the dependencies that compose it. */
export const DEP_ORDER: readonly DepKey[] = ['Filter', 'Opt', 'Cte', 'Capped', 'Hinted', 'Tree', 'Mid', 'Top'];

/** Where a dependency's name and path come from. */
export interface DepNaming {
    /** The full composition path of a dependency (category path / name). */
    Path(dep: DepKey): string;
}

/** A plain-SQL CTE. */
export interface OracleCte {
    readonly Name: string;
    readonly Sql: string;
    readonly Recursive: boolean;
}

/** An oracle row source: CTEs to add, and the FROM item. */
export interface OracleSource {
    readonly Ctes: OracleCte[];
    readonly Source: string;
}

/** Hands out unique CTE names inside one oracle statement. */
export class CteNames {
    private next = 0;
    Name(stem: string): string {
        this.next++;
        return `zq_${stem}_${this.next}`;
    }
}

/** A dependency definition. */
export interface DepDef {
    readonly Key: DepKey;
    readonly Platforms?: readonly DatabasePlatform[];
    readonly Schemas?: readonly SchemaKey[];
    /** The dependency's MJ text. */
    MJ(sql: Sql, naming: DepNaming): string;
    /** The oracle for given argument values: the CTEs it needs and a body (one SELECT). */
    Oracle(sql: Sql, args: Readonly<Record<string, number | undefined>>, names: CteNames): { Ctes: OracleCte[]; Body: string };
}

function selectBase(sql: Sql, alias: string): string {
    return `SELECT ${sql.AllColumns(alias)} FROM ${sql.Source.Table} ${alias} WHERE ${sql.Base(alias)}`;
}

/** Wraps a dependency's oracle body in a CTE of its own, and returns that CTE as the source. */
export function DepAsSource(sql: Sql, dep: DepDef, args: Readonly<Record<string, number | undefined>>, names: CteNames): OracleSource {
    const built = dep.Oracle(sql, args, names);
    const name = names.Name(dep.Key.toLowerCase());
    return { Ctes: [...built.Ctes, { Name: name, Sql: built.Body, Recursive: false }], Source: name };
}

export const DEPS: readonly DepDef[] = [
    {
        Key: 'Filter',
        MJ: sql => `${selectBase(sql, 't')} AND {t.Score} >= {{ Lo | sqlNumber }}{% if Hi %} AND {t.Score} < {{ Hi | sqlNumber }}{% endif %}`,
        Oracle: (sql, a) => ({ Ctes: [], Body: `${selectBase(sql, 't')} AND {t.Score} >= ${a.Lo}${a.Hi === undefined ? '' : ` AND {t.Score} < ${a.Hi}`}` }),
    },
    {
        Key: 'Opt',
        MJ: sql => `${selectBase(sql, 't')}{% if Lo %} AND {t.Score} >= {{ Lo | sqlNumber }}{% endif %}`,
        Oracle: (sql, a) => ({ Ctes: [], Body: `${selectBase(sql, 't')}${a.Lo === undefined ? '' : ` AND {t.Score} >= ${a.Lo}`}` }),
    },
    {
        Key: 'Cte',
        MJ: sql => `WITH [base] AS (${selectBase(sql, 't')}) SELECT b.* FROM [base] b WHERE {b.Score} >= {{ Lo | sqlNumber }}`,
        Oracle: (sql, a, names) => {
            const cte = names.Name('cbase');
            return { Ctes: [{ Name: cte, Sql: selectBase(sql, 't'), Recursive: false }], Body: `SELECT b.* FROM ${cte} b WHERE {b.Score} >= ${a.Lo}` };
        },
    },
    {
        Key: 'Capped',
        MJ: sql => `SELECT ${sql.TopPrefix(200)}${sql.AllColumns('t')} FROM ${sql.Source.Table} t WHERE ${sql.Base('t')} ORDER BY {t.ID}${sql.LimitSuffix(200)}`,
        Oracle: sql => ({ Ctes: [], Body: `SELECT ${sql.TopPrefix(200)}${sql.AllColumns('t')} FROM ${sql.Source.Table} t WHERE ${sql.Base('t')} ORDER BY {t.ID}${sql.LimitSuffix(200)}` }),
    },
    {
        Key: 'Hinted', Platforms: ['sqlserver'],
        MJ: sql => `${selectBase(sql, 't')} OPTION (RECOMPILE)`,
        Oracle: sql => ({ Ctes: [], Body: selectBase(sql, 't') }),
    },
    {
        Key: 'Tree', Schemas: ['mock'],
        MJ: sql => `${sql.WithRecursive()} [tree] AS (SELECT {t.ID}, 0 AS [Depth] FROM ${sql.Source.Table} t WHERE {t.ParentID} IS NULL ` +
            `UNION ALL SELECT {c.ID}, tr.[Depth] + 1 FROM ${sql.Source.Table} c JOIN [tree] tr ON {c.ParentID} = {tr.ID}) ` +
            `SELECT ${sql.AllColumns('a')} FROM ${sql.Source.Table} a JOIN [tree] tr ON {tr.ID} = {a.ID} WHERE tr.[Depth] <= {{ MaxDepth | sqlNumber }}`,
        Oracle: (sql, a, names) => {
            const tree = names.Name('tree');
            const cte = `SELECT {t.ID}, 0 AS [Depth] FROM ${sql.Source.Table} t WHERE {t.ParentID} IS NULL ` +
                `UNION ALL SELECT {c.ID}, tr.[Depth] + 1 FROM ${sql.Source.Table} c JOIN ${tree} tr ON {c.ParentID} = {tr.ID}`;
            return { Ctes: [{ Name: tree, Sql: cte, Recursive: true }],
                Body: `SELECT ${sql.AllColumns('a')} FROM ${sql.Source.Table} a JOIN ${tree} tr ON {tr.ID} = {a.ID} WHERE tr.[Depth] <= ${a.MaxDepth}` };
        },
    },
    {
        Key: 'Mid',
        MJ: (_sql, naming) => `SELECT u.* FROM {{query:"${naming.Path('Filter')}(Lo=Lo2)"}} u WHERE {u.Score} < {{ Hi2 | sqlNumber }}`,
        Oracle: (sql, a, names) => {
            const inner = DepAsSource(sql, DepByKey('Filter'), { Lo: a.Lo2 }, names);
            return { Ctes: inner.Ctes, Body: `SELECT u.* FROM ${inner.Source} u WHERE {u.Score} < ${a.Hi2}` };
        },
    },
    {
        Key: 'Top',
        MJ: (sql, naming) => `SELECT m.* FROM {{query:"${naming.Path('Mid')}(Lo2=Lo3, Hi2=${sql.N(95)})"}} m`,
        Oracle: (sql, a, names) => {
            const inner = DepAsSource(sql, DepByKey('Mid'), { Lo2: a.Lo3, Hi2: sql.N(95) }, names);
            return { Ctes: inner.Ctes, Body: `SELECT m.* FROM ${inner.Source} m` };
        },
    },
];

export function DepByKey(key: DepKey): DepDef {
    const dep = DEPS.find(d => d.Key === key);
    if (!dep) throw new Error(`unknown dependency ${key}`);
    return dep;
}

/** Whether a dependency exists on this platform and schema. */
export function DepAvailable(dep: DepDef, platform: DatabasePlatform, schema: SchemaKey): boolean {
    return (!dep.Platforms || dep.Platforms.includes(platform)) && (!dep.Schemas || dep.Schemas.includes(schema));
}

// ─── Composition variants ──────────────────────────────────────────────────

/** A dependency row extraction must write. `Alias` undefined = not asserted. */
export interface ExpectedDependency {
    readonly Dep: DepKey;
    readonly Alias?: string | null;
    readonly Mapping: Readonly<Record<string, string>> | null;
}

/** What the outer query passes, and how the oracle source is built from those values. */
export interface CompositionInput {
    readonly Sql: Sql;
    readonly Naming: DepNaming;
}

export interface CompositionVariant {
    readonly Key: string;
    /** The dependencies it composes (directly), which must exist. */
    readonly Uses: readonly DepKey[];
    /** The MJ row source. */
    Source(input: CompositionInput): string;
    /** A predicate the variant adds to the outer query (for an outer parameter it needs). */
    ExtraPredicate?(input: CompositionInput): string;
    readonly OuterParameters: readonly ExpectedParameter[];
    Dependencies(sql: Sql): ExpectedDependency[];
    /** A save of the composing query is refused with this code. */
    readonly Refusal?: string;
    /** Whether an ad hoc run can carry it (no outer parameters, no template). */
    readonly Static: boolean;
    /** Values for the outer parameters, per value case (`provided` when a case is not listed). */
    readonly Cases: Partial<Record<ValueCase, (sql: Sql) => ValueOutcome>>;
    /** The oracle source for the outer parameter values the run passes. */
    Oracle(sql: Sql, values: Readonly<Record<string, unknown>>, names: CteNames): OracleSource;
}

const noValues = { provided: () => ({ Kind: 'rows' as const, Parameters: {}, Oracle: '1 = 1' }) };

function dep(sql: Sql, key: DepKey, args: Record<string, number | undefined>, names: CteNames): OracleSource {
    return DepAsSource(sql, DepByKey(key), args, names);
}

function num(value: unknown): number {
    return Number(value);
}

function staticVariant(key: string, depKey: DepKey, args: (sql: Sql) => Record<string, number>): CompositionVariant {
    return {
        Key: key, Uses: [depKey], Static: true, OuterParameters: [], Cases: noValues,
        Source: ({ Sql: sql, Naming: n }) => {
            const a = args(sql);
            const list = Object.entries(a).map(([k, v]) => `${k}=${v}`).join(', ');
            return `{{query:"${n.Path(depKey)}${list ? `(${list})` : ''}"}}`;
        },
        Dependencies: sql => [{ Dep: depKey, Alias: 's', Mapping: literalMapping(args(sql)) }],
        Oracle: (sql, _v, names) => dep(sql, depKey, args(sql), names),
    };
}

/** The mapping a dependency row records for literal arguments: each value as text; null with none. */
function literalMapping(args: Record<string, number>): Record<string, string> | null {
    const entries = Object.entries(args);
    return entries.length === 0 ? null : Object.fromEntries(entries.map(([k, v]) => [k, String(v)]));
}

export const COMPOSITIONS: readonly CompositionVariant[] = [
    { Key: 'none', Uses: [], Static: true, OuterParameters: [], Dependencies: () => [], Cases: noValues,
        Source: ({ Sql: sql }) => sql.Source.Table, Oracle: sql => ({ Ctes: [], Source: sql.Source.Table }) },
    staticVariant('static', 'Filter', sql => ({ Lo: sql.N(10) })),
    {
        Key: 'passThrough', Uses: ['Filter'], Static: false,
        Source: ({ Naming: n }) => `{{query:"${n.Path('Filter')}(Lo=Floor)"}}`,
        OuterParameters: [{ Name: 'Floor', Type: 'number', IsRequired: true }],
        Dependencies: () => [{ Dep: 'Filter', Alias: 's', Mapping: { Lo: '@Floor' } }],
        Cases: {
            provided: sql => ({ Kind: 'rows', Parameters: { Floor: sql.N(15) }, Oracle: '1 = 1' }),
            missing: () => ({ Kind: 'error', Parameters: {}, ErrorIncludes: "Required parameter 'Floor' is missing" }),
        },
        Oracle: (sql, v, names) => dep(sql, 'Filter', { Lo: num(v.Floor) }, names),
    },
    {
        Key: 'arithmetic', Uses: ['Filter'], Static: false,
        Source: ({ Sql: sql, Naming: n }) => `{{query:"${n.Path('Filter')}(Lo=Floor + ${sql.N(4)}, Hi=${sql.N(90)})"}}`,
        OuterParameters: [{ Name: 'Floor', Type: 'number', IsRequired: true }],
        Dependencies: sql => [{ Dep: 'Filter', Alias: 's', Mapping: { Lo: `@{Floor + ${sql.N(4)}}`, Hi: String(sql.N(90)) } }],
        Cases: { provided: sql => ({ Kind: 'rows', Parameters: { Floor: sql.N(15) }, Oracle: '1 = 1' }) },
        Oracle: (sql, v, names) => dep(sql, 'Filter', { Lo: num(v.Floor) + sql.N(4), Hi: sql.N(90) }, names),
    },
    staticVariant('nested2', 'Mid', sql => ({ Lo2: sql.N(10), Hi2: sql.N(80) })),
    staticVariant('nested3', 'Top', sql => ({ Lo3: sql.N(20) })),
    {
        Key: 'twice', Uses: ['Filter'], Static: true, OuterParameters: [], Cases: noValues,
        Source: ({ Sql: sql, Naming: n }) => `(SELECT a.* FROM {{query:"${n.Path('Filter')}(Lo=0)"}} a WHERE {a.Score} < ${sql.N(50)} ` +
            `UNION ALL SELECT b.* FROM {{query:"${n.Path('Filter')}(Lo=${sql.N(50)})"}} b)`,
        // One row per (target, path): the second reference of the same query records no row of its own.
        Dependencies: () => [{ Dep: 'Filter', Alias: 'a', Mapping: { Lo: '0' } }],
        Oracle: (sql, _v, names) => {
            const low = dep(sql, 'Filter', { Lo: 0 }, names);
            const high = dep(sql, 'Filter', { Lo: sql.N(50) }, names);
            return { Ctes: [...low.Ctes, ...high.Ctes], Source: `(SELECT a.* FROM ${low.Source} a WHERE {a.Score} < ${sql.N(50)} UNION ALL SELECT b.* FROM ${high.Source} b)` };
        },
    },
    {
        Key: 'inIf', Uses: ['Filter'], Static: false,
        Source: ({ Sql: sql, Naming: n }) => `{% if UseDep %}{{query:"${n.Path('Filter')}(Lo=${sql.N(40)})"}}{% else %}(SELECT ${sql.AllColumns('t')} FROM ${sql.Source.Table} t WHERE ${sql.Base('t')}){% endif %}`,
        OuterParameters: [{ Name: 'UseDep', Type: 'string', IsRequired: false }],
        Dependencies: sql => [{ Dep: 'Filter', Mapping: { Lo: String(sql.N(40)) } }],
        Cases: {
            provided: () => ({ Kind: 'rows', Parameters: { UseDep: true }, Oracle: '1 = 1' }),
            missing: () => ({ Kind: 'rows', Parameters: {}, Oracle: '1 = 1' }),
        },
        Oracle: (sql, v, names) => v.UseDep
            ? dep(sql, 'Filter', { Lo: sql.N(40) }, names)
            : { Ctes: [], Source: `(SELECT ${sql.AllColumns('t')} FROM ${sql.Source.Table} t WHERE ${sql.Base('t')})` },
    },
    {
        Key: 'inFor', Uses: ['Filter'], Static: false,
        Source: ({ Sql: sql, Naming: n }) => `({% for L in Floors %}{% if not loop.first %} UNION ALL {% endif %}SELECT x.* FROM {{query:"${n.Path('Filter')}(Lo=L, Hi=L + ${sql.N(25)})"}} x{% endfor %})`,
        OuterParameters: [{ Name: 'Floors', Type: 'array', IsRequired: true }],
        Dependencies: sql => [{ Dep: 'Filter', Alias: 'x', Mapping: { Lo: '@L', Hi: `@{L + ${sql.N(25)}}` } }],
        Cases: { provided: sql => ({ Kind: 'rows', Parameters: { Floors: [sql.N(10), sql.N(60)] }, Oracle: '1 = 1' }) },
        Oracle: (sql, v, names) => {
            const floors = Array.isArray(v.Floors) ? v.Floors.map(num) : [];
            const parts = floors.map(f => dep(sql, 'Filter', { Lo: f, Hi: f + sql.N(25) }, names));
            return { Ctes: parts.flatMap(p => p.Ctes), Source: `(${parts.map(p => `SELECT x.* FROM ${p.Source} x`).join(' UNION ALL ')})` };
        },
    },
    staticVariant('ownCte', 'Cte', sql => ({ Lo: sql.N(5) })),
    staticVariant('ownCap', 'Capped', () => ({})),
    staticVariant('ownOption', 'Hinted', () => ({})),
    staticVariant('recursiveDep', 'Tree', () => ({ MaxDepth: 1 })),
    {
        Key: 'implicitArgument', Uses: ['Opt'], Static: false, Refusal: 'MJQ_COMPOSITION_IMPLICIT_ARGUMENT',
        Source: ({ Naming: n }) => `{{query:"${n.Path('Opt')}"}}`,
        ExtraPredicate: () => '{s.Score} >= {{ Lo | sqlNumber }}',
        OuterParameters: [{ Name: 'Lo', Type: 'number', IsRequired: true }], Dependencies: () => [], Cases: noValues,
        Oracle: sql => ({ Ctes: [], Source: sql.Source.Table }),
    },
    {
        Key: 'missingArgument', Uses: ['Filter'], Static: true, Refusal: 'MJQ_COMPOSITION_MISSING_ARGUMENT',
        Source: ({ Naming: n }) => `{{query:"${n.Path('Filter')}"}}`, OuterParameters: [], Dependencies: () => [], Cases: noValues,
        Oracle: sql => ({ Ctes: [], Source: sql.Source.Table }),
    },
    {
        Key: 'unknownArgument', Uses: ['Filter'], Static: true, Refusal: 'MJQ_COMPOSITION_UNKNOWN_ARGUMENT',
        Source: ({ Naming: n }) => `{{query:"${n.Path('Filter')}(Lo=1, Nope=2)"}}`, OuterParameters: [], Dependencies: () => [], Cases: noValues,
        Oracle: sql => ({ Ctes: [], Source: sql.Source.Table }),
    },
];

export function CompositionByKey(key: string): CompositionVariant {
    const variant = COMPOSITIONS.find(c => c.Key === key);
    if (!variant) throw new Error(`unknown composition variant ${key}`);
    return variant;
}
