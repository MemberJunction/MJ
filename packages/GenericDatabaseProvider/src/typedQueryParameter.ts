/** A value a {@link TypedQueryParameter} carries. */
export type TypedQueryParameterValue = string | number | boolean | Date | null;

/**
 * One bind parameter with the database type of the column it is compared with, such as
 * `varchar(50)` or `datetime2(7)`. Statements reference it by the placeholder the dialect's
 * binding gives (`DialectBinding.TypedParameter`): SQL Server providers bind it by name with that
 * declared type, so a varchar column is compared with a varchar value and keeps its index seek;
 * PostgreSQL providers bind it by position, and the placeholder casts it.
 */
export class TypedQueryParameter {
    constructor(
        /** The name the driver binds it under (`mj_p0`), or its position's name (`$1`). */
        public readonly Name: string,
        /** The database type, as the server describes it. */
        public readonly SQLType: string,
        public readonly Value: TypedQueryParameterValue,
    ) {}
}

/** True when `parameters` is a non-empty list of {@link TypedQueryParameter}. */
export function IsTypedQueryParameterList(parameters: unknown): parameters is TypedQueryParameter[] {
    return Array.isArray(parameters) && parameters.length > 0 && parameters.every(p => p instanceof TypedQueryParameter);
}

/** Base types (lower case, without arguments) whose values bind as booleans. */
const BOOLEAN_TYPES: ReadonlySet<string> = new Set(['bit', 'boolean', 'bool']);

/** Base types whose values bind as numbers. */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
    'int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney',
    'double precision', 'int2', 'int4', 'int8', 'float4', 'float8',
]);

/** Base types whose values bind as dates (`timestamp…` forms included). */
const DATE_TYPES: ReadonlySet<string> = new Set(['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset']);

/**
 * `value` converted to what a parameter of database type `sqlType` binds: a boolean for a bit or
 * boolean column, a finite number for a numeric one, a `Date` for a date or timestamp one, and text
 * otherwise. Undefined when the value cannot be one (a non-numeric string for an int column, an
 * invalid date), so the caller can refuse rather than bind a value the database would reject or
 * read differently.
 *
 * @param value - The value, in native form (booleans as booleans, dates as `Date` or ISO text with its zone).
 * @param sqlType - The column's type as the server describes it, such as `varchar(50)` or `timestamp with time zone`.
 */
export function TypedBindValue(value: unknown, sqlType: string): TypedQueryParameterValue | undefined {
    const base = baseTypeName(sqlType);
    if (BOOLEAN_TYPES.has(base)) return booleanValue(value);
    if (NUMERIC_TYPES.has(base)) {
        const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value.trim()) : NaN;
        return Number.isFinite(n) ? n : undefined;
    }
    if (DATE_TYPES.has(base) || base.startsWith('timestamp')) {
        const d = value instanceof Date ? value : typeof value === 'string' ? dateFromText(value) : null;
        return d && !Number.isNaN(d.getTime()) ? d : undefined;
    }
    return textValue(value);
}

/** ISO text with no zone: `2026-01-02`, `2026-01-02 10:30`, `2026-01-02T10:30:00.123`. */
const ZONELESS_ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/;

/** ISO text ending in a zone: `Z`, `+02:00`, `-0500`. */
const ZONED_ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * The instant ISO text names. Text with no zone reads as that wall-clock time in UTC, which is what
 * the database reads from the same text as a literal (drivers send a `Date` as its UTC parts). Any
 * other text is refused (null): a locale format could read differently here and in the database.
 */
function dateFromText(text: string): Date | null {
    const trimmed = text.trim();
    const zoneless = ZONELESS_ISO.exec(trimmed);
    if (zoneless) return new Date(`${zoneless[1]}T${zoneless[2] ?? '00:00:00'}Z`);
    return ZONED_ISO.test(trimmed) ? new Date(trimmed.replace(' ', 'T')) : null;
}

/** The base type name: lower case, without arguments or a trailing `[]`. */
function baseTypeName(sqlType: string): string {
    const open = sqlType.indexOf('(');
    return (open < 0 ? sqlType : sqlType.slice(0, open)).replace(/\[\]$/, '').trim().toLowerCase();
}

function booleanValue(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === 0) return value === 1;
    if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (text === 'true' || text === '1') return true;
        if (text === 'false' || text === '0') return false;
    }
    return undefined;
}

function textValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (value instanceof Date) return value.toISOString();
    return undefined;
}
