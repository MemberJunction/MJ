/**
 * sqlpipe-templating.ts — the templating and value dimensions of the SQL pipeline scenario matrix.
 *
 * A templating variant is a predicate written in MJ Query (`{{ }}`, `{% %}`, filters, Context
 * tokens, doc comments) plus the parameter rows extraction must write for it. Each value case it
 * supports gives the parameter values a run passes and the plain-SQL predicate (literal values,
 * no MJ features) the oracle uses for them, or says the run must fail.
 */
import type { Sql } from './sqlpipe-schema';

/** The value cases of the values dimension. */
export const VALUE_CASES = [
    'provided', 'alternate', 'missing', 'null', 'emptyArray', 'quotes', 'unicode', 'wildcards', 'injection', 'boundary', 'tzDate',
] as const;
export type ValueCase = typeof VALUE_CASES[number];

/** A parameter row extraction must write. */
export interface ExpectedParameter {
    readonly Name: string;
    readonly Type: string;
    readonly IsRequired: boolean;
    readonly DefaultValue?: string | null;
    readonly Description?: string | null;
}

/** What a run with one value case passes, and what the oracle filters by (or that the run fails). */
export type ValueOutcome =
    | { readonly Kind: 'rows'; readonly Parameters: Record<string, unknown>; readonly Oracle: string }
    | { readonly Kind: 'error'; readonly Parameters: Record<string, unknown>; readonly ErrorIncludes: string | null };

/** What the context user and clock give Context tokens. */
export interface RunContext {
    readonly UserEmail: string;
}

/** A templating variant. */
export interface TemplatingVariant {
    readonly Key: string;
    /** A doc comment the query starts with. */
    readonly Header?: string;
    /** The predicate in MJ Query (alias `s`). */
    Predicate(sql: Sql): string;
    readonly Parameters: readonly ExpectedParameter[];
    /** A field description the header gives, by output field name. */
    readonly FieldDescriptions?: Readonly<Record<string, string>>;
    readonly Cases: Partial<Record<ValueCase, (sql: Sql, context: RunContext) => ValueOutcome>>;
}

const rows = (Parameters: Record<string, unknown>, Oracle: string): ValueOutcome => ({ Kind: 'rows', Parameters, Oracle });
const fails = (Parameters: Record<string, unknown>, ErrorIncludes: string | null): ValueOutcome => ({ Kind: 'error', Parameters, ErrorIncludes });

/** The oracle for `column = value`, for the string cases of a sqlString predicate. */
function equalsCases(column: string, name: string): TemplatingVariant['Cases'] {
    const eq = (value: string) => (sql: Sql) => rows({ [name]: value }, `1 = 1 AND ${column} = ${sql.Literal(value)}`);
    return {
        provided: sql => rows({ [name]: sql.Source.RegionValue }, `1 = 1 AND ${column} = ${sql.Literal(sql.Source.RegionValue)}`),
        missing: () => rows({}, '1 = 1'),
        null: () => rows({ [name]: null }, '1 = 1'),
        quotes: eq("O'Brien's \"x\""),
        unicode: eq('Ñandú 東京 🚀'),
        wildcards: eq('100%_[a]'),
        injection: eq("x' OR '1'='1'; DROP TABLE mjit_sqlpipe.Account; --"),
        boundary: eq('back\\slash\\'),
    };
}

/** A LIKE literal as the sqlLike* filters read it: boundary `%` on the open sides dropped. */
function strip(value: string, side: 'leading' | 'trailing' | 'both'): string {
    const lead = side === 'trailing' ? value : value.replace(/^%+/, '');
    return side === 'leading' ? lead : lead.replace(/%+$/, '');
}

/** The plain-SQL oracle of begins / contains / ends for the three LIKE parameters. */
function likeOracle(sql: Sql, prefix: string, search: string, suffix: string): string {
    const p = strip(prefix, 'trailing');
    const c = strip(search, 'both');
    const e = strip(suffix, 'leading');
    const pg = sql.Platform === 'postgresql';
    const left = pg ? `left({s.Name}, ${p.length})` : `LEFT({s.Name}, ${p.length})`;
    const right = pg ? `right({s.Name}, ${e.length})` : `RIGHT({s.Name}, ${e.length})`;
    const contains = pg ? `strpos({s.Name}, ${sql.Literal(c)}) > 0` : `CHARINDEX(${sql.Literal(c)}, {s.Name}) > 0`;
    return `${left} = ${sql.Literal(p)} AND ${contains} AND ${right} = ${sql.Literal(e)}`;
}

function likeCase(prefix: string, search: string, suffix: string) {
    return (sql: Sql) => rows({ Prefix: prefix, Search: search, Suffix: suffix }, likeOracle(sql, prefix, search, suffix));
}

function isoOf(value: string): string {
    return new Date(value).toISOString();
}

function dateOracle(sql: Sql, value: string): string {
    const literal = `'${isoOf(value)}'`;
    return sql.Platform === 'postgresql' ? `{s.OpenedAt} >= CAST(${literal} AS TIMESTAMPTZ)` : `{s.OpenedAt} >= CAST(${literal} AS DATETIMEOFFSET)`;
}

const SCORE_REQUIRED: ExpectedParameter = { Name: 'MinScore', Type: 'number', IsRequired: true };

export const TEMPLATING: readonly TemplatingVariant[] = [
    { Key: 'none', Predicate: () => '1 = 1', Parameters: [], Cases: { provided: () => rows({}, '1 = 1') } },
    {
        Key: 'required', Predicate: () => '{s.Score} >= {{ MinScore | sqlNumber }}', Parameters: [SCORE_REQUIRED],
        Cases: {
            provided: sql => rows({ MinScore: sql.N(20) }, `{s.Score} >= ${sql.N(20)}`),
            missing: () => fails({}, "Required parameter 'MinScore' is missing"),
            null: () => fails({ MinScore: null }, "Required parameter 'MinScore' is missing"),
            boundary: () => rows({ MinScore: -2147483648 }, '{s.Score} >= -2147483648'),
            injection: () => fails({ MinScore: '1; DROP TABLE mjit_sqlpipe.Account' }, "must be a number"),
        },
    },
    {
        Key: 'optional', Predicate: () => '1 = 1{% if Region %} AND {s.Region} = {{ Region | sqlString }}{% endif %}',
        Parameters: [{ Name: 'Region', Type: 'string', IsRequired: false }], Cases: equalsCases('{s.Region}', 'Region'),
    },
    {
        Key: 'ifElif',
        Predicate: sql => `{% if Band == 'high' %}{s.Score} >= ${sql.N(50)}{% elif Band == 'low' %}{s.Score} < ${sql.N(50)}{% else %}1 = 1{% endif %}`,
        Parameters: [{ Name: 'Band', Type: 'string', IsRequired: false }],
        Cases: {
            provided: sql => rows({ Band: 'high' }, `{s.Score} >= ${sql.N(50)}`),
            alternate: sql => rows({ Band: 'low' }, `{s.Score} < ${sql.N(50)}`),
            missing: () => rows({}, '1 = 1'),
            injection: () => rows({ Band: "high' OR '1'='1" }, '1 = 1'),
        },
    },
    {
        Key: 'ifAndOutside',
        Predicate: sql => `{s.Score} >= {{ Lo | sqlNumber }}{% if Lo > ${sql.N(50)} %} AND {s.Score} < ${sql.N(95)}{% endif %}`,
        Parameters: [{ Name: 'Lo', Type: 'number', IsRequired: true }],
        Cases: {
            provided: sql => rows({ Lo: sql.N(20) }, `{s.Score} >= ${sql.N(20)}`),
            alternate: sql => rows({ Lo: sql.N(60) }, `{s.Score} >= ${sql.N(60)} AND {s.Score} < ${sql.N(95)}`),
            missing: () => fails({}, "Required parameter 'Lo' is missing"),
        },
    },
    {
        Key: 'conditionOnly', Predicate: sql => `{% if Strict %}{s.Score} > ${sql.N(5)}{% else %}1 = 1{% endif %}`,
        Parameters: [{ Name: 'Strict', Type: 'string', IsRequired: false }],
        Cases: {
            provided: sql => rows({ Strict: true }, `{s.Score} > ${sql.N(5)}`),
            missing: () => rows({}, '1 = 1'),
            null: () => rows({ Strict: null }, '1 = 1'),
        },
    },
    {
        Key: 'forArray',
        Predicate: () => '{s.Region} IN ({% for R in Regions %}{{ R | sqlString }}{% if not loop.last %}, {% endif %}{% endfor %})',
        Parameters: [{ Name: 'Regions', Type: 'array', IsRequired: true }],
        Cases: {
            provided: sql => rows({ Regions: [sql.Source.RegionValue, 'East'] }, `{s.Region} IN (${sql.Literal(sql.Source.RegionValue)}, ${sql.Literal('East')})`),
            quotes: sql => rows({ Regions: ["O'Brien", sql.Source.RegionValue] }, `{s.Region} IN (${sql.Literal("O'Brien")}, ${sql.Literal(sql.Source.RegionValue)})`),
            emptyArray: () => fails({ Regions: [] }, null),
            missing: () => fails({}, "Required parameter 'Regions' is missing"),
        },
    },
    {
        Key: 'sqlIn', Predicate: () => '{s.Region} IN {{ Regions | sqlIn }}',
        Parameters: [{ Name: 'Regions', Type: 'array', IsRequired: true }],
        Cases: {
            provided: sql => rows({ Regions: [sql.Source.RegionValue, 'South'] }, `{s.Region} IN (${sql.Literal(sql.Source.RegionValue)}, ${sql.Literal('South')})`),
            emptyArray: () => rows({ Regions: [] }, '1 = 0'),
            injection: sql => rows({ Regions: ["') OR ('1'='1", sql.Source.RegionValue] }, `{s.Region} IN (${sql.Literal("') OR ('1'='1")}, ${sql.Literal(sql.Source.RegionValue)})`),
            unicode: () => rows({ Regions: ['Ñandú', '東京'] }, '1 = 0'),
        },
    },
    {
        Key: 'set', Predicate: () => '{% set Minimum = 3 %}{% set Cut = MinScore - 1 %}{s.Score} > {{ Cut }} AND {s.Score} >= {{ Minimum }}',
        Parameters: [{ Name: 'MinScore', Type: 'string', IsRequired: true }],
        Cases: {
            provided: sql => rows({ MinScore: sql.N(20) }, `{s.Score} > ${sql.N(20) - 1} AND {s.Score} >= 3`),
            missing: () => fails({}, "Required parameter 'MinScore' is missing"),
        },
    },
    {
        Key: 'default', Predicate: sql => `{s.Score} >= {{ Lo | default(${sql.N(30)}) | sqlNumber }}`,
        Parameters: [{ Name: 'Lo', Type: 'number', IsRequired: false }],
        Cases: {
            provided: sql => rows({ Lo: sql.N(70) }, `{s.Score} >= ${sql.N(70)}`),
            missing: sql => rows({}, `{s.Score} >= ${sql.N(30)}`),
            null: sql => rows({ Lo: null }, `{s.Score} >= ${sql.N(30)}`),
            boundary: () => rows({ Lo: 0 }, '{s.Score} >= 0'),
        },
    },
    {
        Key: 'like',
        Predicate: () => '{s.Name} LIKE {{ Prefix | sqlLikeBegins }} AND {s.Name} LIKE {{ Search | sqlLikeContains }} AND {s.Name} LIKE {{ Suffix | sqlLikeEnds }}',
        Parameters: [{ Name: 'Prefix', Type: 'string', IsRequired: true }, { Name: 'Search', Type: 'string', IsRequired: true }, { Name: 'Suffix', Type: 'string', IsRequired: true }],
        Cases: {
            provided: sql => likeCase(sql.Source.NamePrefix, sql.Source.Key === 'core' ? 's' : 'ct 0', sql.Source.Key === 'core' ? 'd' : '1')(sql),
            // `_` inside a value is literal (escaped); boundary `%` on an open side is dropped.
            wildcards: sql => sql.Source.Key === 'core' ? likeCase('I_%', '%s', '%d')(sql) : likeCase('Acct 0_%', '%ct 0', '%1')(sql),
            quotes: likeCase("O'", "'", "'"),
            unicode: likeCase('Ñ', '東', '🚀'),
            injection: likeCase("' OR 1=1 --", "x' OR 'a'='a", ']'),
        },
    },
    {
        Key: 'context', Predicate: () => '{s.Name} <> {{ Context.UserEmail | sqlString }} AND {s.OpenedAt} <= {{ Context.Now | sqlDate }}',
        Parameters: [],
        Cases: {
            provided: (sql, context) => rows({}, `{s.Name} <> ${sql.Literal(context.UserEmail)} AND {s.OpenedAt} <= ${sql.Platform === 'postgresql' ? 'CURRENT_TIMESTAMP' : 'SYSDATETIMEOFFSET()'}`),
        },
    },
    {
        Key: 'docComment',
        Header: '{#\n * Rows at or above a score.\n * @param {number} MinScore - The lowest score kept.\n *        Rows below it are left out.\n * @field [ID] The row key.\n#}\n',
        Predicate: () => '{s.Score} >= {{ MinScore | sqlNumber }}',
        Parameters: [{ ...SCORE_REQUIRED, Description: 'The lowest score kept.\nRows below it are left out.' }],
        FieldDescriptions: { ID: 'The row key.' },
        Cases: { provided: sql => rows({ MinScore: sql.N(40) }, `{s.Score} >= ${sql.N(40)}`) },
    },
    {
        Key: 'dateTz', Predicate: () => '{s.OpenedAt} >= {{ Since | sqlDate }}',
        Parameters: [{ Name: 'Since', Type: 'date', IsRequired: true }],
        Cases: {
            provided: sql => rows({ Since: sql.Source.SinceValue }, dateOracle(sql, sql.Source.SinceValue)),
            tzDate: sql => {
                const value = sql.Source.Key === 'core' ? '2000-01-01T05:30:00+05:30' : '2024-06-01T05:30:00+05:30';
                return rows({ Since: value }, dateOracle(sql, value));
            },
            injection: () => fails({ Since: "2024-01-01'; DROP TABLE x; --" }, 'must be a valid date'),
        },
    },
    {
        // `.length` on a parameter is allowed; a use only inside the guarded block leaves it optional.
        Key: 'lengthGuard',
        Predicate: () => '1 = 1{% if Regions and Regions.length > 0 %} AND {s.Region} IN {{ Regions | sqlIn }}{% endif %}',
        Parameters: [{ Name: 'Regions', Type: 'array', IsRequired: false }],
        Cases: {
            provided: sql => rows({ Regions: [sql.Source.RegionValue, 'South'] }, `1 = 1 AND {s.Region} IN (${sql.Literal(sql.Source.RegionValue)}, ${sql.Literal('South')})`),
            emptyArray: () => rows({ Regions: [] }, '1 = 1'),
            null: () => rows({ Regions: null }, '1 = 1'),
            missing: () => rows({}, '1 = 1'),
        },
    },
    {
        // An inline if inside a hole: the value use is guarded by its own condition, so Lo is optional.
        Key: 'inlineIf', Predicate: sql => `{s.Score} >= {{ Lo | sqlNumber if Lo else ${sql.N(48)} }}`,
        Parameters: [{ Name: 'Lo', Type: 'number', IsRequired: false }],
        Cases: {
            provided: sql => rows({ Lo: sql.N(70) }, `{s.Score} >= ${sql.N(70)}`),
            missing: sql => rows({}, `{s.Score} >= ${sql.N(48)}`),
            null: sql => rows({ Lo: null }, `{s.Score} >= ${sql.N(48)}`),
            boundary: () => rows({ Lo: 1 }, '{s.Score} >= 1'),
        },
    },
    {
        Key: 'boolean', Predicate: () => '{s.Flag} = {{ Active | sqlBoolean }}',
        Parameters: [{ Name: 'Active', Type: 'boolean', IsRequired: true }],
        Cases: {
            provided: sql => rows({ Active: true }, `{s.Flag} = ${sql.Platform === 'postgresql' ? 'TRUE' : '1'}`),
            alternate: sql => rows({ Active: false }, `{s.Flag} = ${sql.Platform === 'postgresql' ? 'FALSE' : '0'}`),
        },
    },
];

export function TemplatingByKey(key: string): TemplatingVariant {
    const variant = TEMPLATING.find(t => t.Key === key);
    if (!variant) throw new Error(`unknown templating variant ${key}`);
    return variant;
}
