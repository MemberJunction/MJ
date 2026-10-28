/**
 * Binding {@link TypedQueryParameter}s on SQL Server: each becomes a named input declared with the
 * driver type its SQL type names, so the statement compares a column with a value of the
 * column's own type (a varchar column with a varchar value, not an nvarchar one).
 */
import sql from 'mssql';
import type { TypedQueryParameter, TypedQueryParameterValue } from '@memberjunction/generic-database-provider';

/** A type name split into its base and its arguments: `decimal(18,2)` → `decimal`, `['18', '2']`. */
interface ParsedSQLType {
    Base: string;
    Args: string[];
}

function parseSQLType(sqlType: string): ParsedSQLType | null {
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\(\s*([^)]*)\))?\s*$/.exec(sqlType);
    if (!match) return null;
    const args = match[2] === undefined ? [] : match[2].split(',').map(a => a.trim().toLowerCase());
    return { Base: match[1].toLowerCase(), Args: args };
}

/** A length argument: `max` is the driver's MAX; otherwise a positive integer. */
function lengthArg(args: string[]): number | null {
    if (args.length === 0) return null;
    if (args[0] === 'max') return sql.MAX;
    const n = Number(args[0]);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function intArg(args: string[], index: number): number | undefined {
    const n = Number(args[index]);
    return args[index] !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Character and binary types, sized by their length argument (or the type's default length). */
function sizedType(parsed: ParsedSQLType): sql.ISqlType | null {
    const length = lengthArg(parsed.Args);
    switch (parsed.Base) {
        case 'varchar': return length === null ? sql.VarChar() : sql.VarChar(length);
        case 'nvarchar': return length === null ? sql.NVarChar() : sql.NVarChar(length);
        case 'char': return length === null ? sql.Char() : sql.Char(length);
        case 'nchar': return length === null ? sql.NChar() : sql.NChar(length);
        case 'varbinary': return length === null ? sql.VarBinary() : sql.VarBinary(length);
        default: return null;
    }
}

/** Date, time and numeric types with precision or scale arguments. */
function scaledType(parsed: ParsedSQLType): sql.ISqlType | null {
    const a = parsed.Args;
    switch (parsed.Base) {
        case 'datetime2': return sql.DateTime2(intArg(a, 0));
        case 'datetimeoffset': return sql.DateTimeOffset(intArg(a, 0));
        case 'time': return sql.Time(intArg(a, 0));
        case 'decimal': return sql.Decimal(intArg(a, 0), intArg(a, 1));
        case 'numeric': return sql.Numeric(intArg(a, 0), intArg(a, 1));
        default: return null;
    }
}

/** Types that take no arguments. */
const PLAIN_TYPES: Readonly<Record<string, () => sql.ISqlType>> = {
    int: () => sql.Int(), bigint: () => sql.BigInt(), smallint: () => sql.SmallInt(), tinyint: () => sql.TinyInt(),
    bit: () => sql.Bit(), uniqueidentifier: () => sql.UniqueIdentifier(), date: () => sql.Date(), datetime: () => sql.DateTime(),
    smalldatetime: () => sql.SmallDateTime(), float: () => sql.Float(), real: () => sql.Real(), money: () => sql.Money(),
    smallmoney: () => sql.SmallMoney(),
};

/**
 * The `mssql` driver type for a SQL Server type name such as `varchar(50)`, `nvarchar(max)`,
 * `datetime2(7)` or `decimal(18,2)`; null for a type this binding does not know.
 */
export function MssqlTypeFor(sqlType: string): sql.ISqlType | null {
    const parsed = parseSQLType(sqlType);
    if (!parsed) return null;
    const plain = PLAIN_TYPES[parsed.Base];
    return plain ? plain() : sizedType(parsed) ?? scaledType(parsed);
}

/** Adds each parameter to `request` as a named input declared with its type. */
export function BindTypedParameters(request: sql.Request, parameters: readonly TypedQueryParameter[]): void {
    for (const p of parameters) {
        const type = MssqlTypeFor(p.SQLType);
        if (!type) {
            throw new Error(`Parameter '${p.Name}' has the SQL type '${p.SQLType}', which the SQL Server binding does not know.`);
        }
        request.input(p.Name, type, driverValue(p.Value));
    }
}

/** The value as the driver takes it; booleans bind as BIT 1 / 0. */
function driverValue(value: TypedQueryParameterValue): TypedQueryParameterValue {
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}
