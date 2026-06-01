/**
 * Cross-dialect SQL type-classification predicates.
 *
 * Single source of truth for "is this SQL type name a string / boolean / date
 * / etc." across the MJ stack. Built by unioning each registered SQLDialect's
 * type-name getters (see `SQLDialect.BooleanTypeNames`, `StringTypeNames`,
 * etc.), so adding a new dialect requires zero changes here — just register
 * its dialect class with the same getters and the predicates pick it up.
 *
 * Usage:
 * ```typescript
 * import { IsBooleanSQLType, IsStringSQLType } from '@memberjunction/sql-dialect';
 *
 * if (IsStringSQLType(field.Type)) {
 *   // safe to LOWER() and string-compare
 * }
 * ```
 *
 * Why this exists: prior call sites hand-coded long switch/case lists of SQL
 * type names in 5+ files (graphql_server_codegen.ts, MJCore util.ts,
 * MetadataSync sync-engine.ts, PushService.ts, …). Each list was subtly
 * different — some included `bpchar`, some forgot `character varying`, some
 * had `citext` only after a PG bug — and adding a new column type required
 * grepping every list. Now there is one place per category, owned by the
 * dialect that defines the type.
 */

import type { SQLDialect } from './sqlDialect.js';
import { SQLServerDialect } from './sqlServerDialect.js';
import { PostgreSQLDialect } from './postgresqlDialect.js';

const SS: SQLDialect = new SQLServerDialect();
const PG: SQLDialect = new PostgreSQLDialect();

/**
 * Registered dialects whose type-name getters are unioned into the
 * classification predicates below. Order is irrelevant — predicates are
 * `Set.has()` lookups.
 */
const DIALECTS: readonly SQLDialect[] = [SS, PG];

/**
 * Build a Set from one accessor across every registered dialect, normalizing
 * each name to lowercase + trimmed so call sites can pass raw `EntityField.Type`
 * strings without pre-normalizing.
 */
function unionLowercase(getter: (d: SQLDialect) => readonly string[]): ReadonlySet<string> {
    const out = new Set<string>();
    for (const dialect of DIALECTS) {
        for (const name of getter(dialect)) {
            out.add(name.trim().toLowerCase());
        }
    }
    return out;
}

const BOOLEAN_TYPE_SET   = unionLowercase(d => d.BooleanTypeNames);
const STRING_TYPE_SET    = unionLowercase(d => d.StringTypeNames);
const FIXED_WIDTH_STRING_TYPE_SET = unionLowercase(d => d.FixedWidthStringTypeNames);
const DATE_TYPE_SET      = unionLowercase(d => d.DateTypeNames);
const INTEGER_TYPE_SET   = unionLowercase(d => d.IntegerTypeNames);
const FLOAT_TYPE_SET     = unionLowercase(d => d.FloatTypeNames);
const UUID_TYPE_SET      = unionLowercase(d => d.UuidTypeNames);
const BINARY_TYPE_SET    = unionLowercase(d => d.BinaryTypeNames);
const JSON_TYPE_SET      = unionLowercase(d => d.JsonTypeNames);
const CURRENCY_TYPE_SET  = unionLowercase(d => d.CurrencyTypeNames);
const INTERVAL_TYPE_SET  = unionLowercase(d => d.IntervalTypeNames);
const NETWORK_TYPE_SET   = unionLowercase(d => d.NetworkTypeNames);

function normalize(typeName: string | null | undefined): string {
    return (typeName ?? '').trim().toLowerCase();
}

/** True if `typeName` is a boolean type in any registered dialect (`bit`, `boolean`, `bool`). */
export function IsBooleanSQLType(typeName: string | null | undefined): boolean {
    return BOOLEAN_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a variable / fixed-length character / text type. Excludes `uuid`. */
export function IsStringSQLType(typeName: string | null | undefined): boolean {
    return STRING_TYPE_SET.has(normalize(typeName));
}

/**
 * True if `typeName` is a **fixed-width** / space-padded character type
 * (SQL Server `char`/`nchar`, PostgreSQL `char`/`character`/`bpchar`).
 *
 * Use to decide whether to rtrim values returned by the DB: fixed-width
 * types right-pad with spaces up to the declared length and return that
 * padding in result sets, which causes spurious dirty-flagging if the
 * application-side value is the logical (un-padded) form.
 */
export function IsFixedWidthStringSQLType(typeName: string | null | undefined): boolean {
    return FIXED_WIDTH_STRING_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a date / time / timestamp type. */
export function IsDateSQLType(typeName: string | null | undefined): boolean {
    return DATE_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is an integer type (any width, including auto-increment / rowversion). */
export function IsIntegerSQLType(typeName: string | null | undefined): boolean {
    return INTEGER_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a floating-point or fixed-precision decimal type. */
export function IsFloatSQLType(typeName: string | null | undefined): boolean {
    return FLOAT_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a UUID type (`uniqueidentifier`, `uuid`). */
export function IsUuidSQLType(typeName: string | null | undefined): boolean {
    return UUID_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a binary blob type (`varbinary`, `image`, `bytea`). */
export function IsBinarySQLType(typeName: string | null | undefined): boolean {
    return BINARY_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a JSON / XML structured-document type. */
export function IsJsonSQLType(typeName: string | null | undefined): boolean {
    return JSON_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a fixed-precision currency type (`money`, `smallmoney`). */
export function IsCurrencySQLType(typeName: string | null | undefined): boolean {
    return CURRENCY_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is an interval / duration type (`interval` — PG only currently). */
export function IsIntervalSQLType(typeName: string | null | undefined): boolean {
    return INTERVAL_TYPE_SET.has(normalize(typeName));
}

/** True if `typeName` is a network address type (`inet`, `cidr`, …). */
export function IsNetworkSQLType(typeName: string | null | undefined): boolean {
    return NETWORK_TYPE_SET.has(normalize(typeName));
}

/**
 * Convenience aggregate: any "numeric" type — integer, float, or currency.
 * Use when the call site doesn't care about the precision/scale distinction.
 */
export function IsNumericSQLType(typeName: string | null | undefined): boolean {
    const n = normalize(typeName);
    return INTEGER_TYPE_SET.has(n) || FLOAT_TYPE_SET.has(n) || CURRENCY_TYPE_SET.has(n);
}
