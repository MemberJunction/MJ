import { EscapeSQLString } from '@memberjunction/global';

/**
 * Escape a string value for safe inclusion in a SQL filter.
 *
 * @deprecated Import `EscapeSQLString` from `@memberjunction/global` instead — it is the one
 * canonical escaper. Kept so callers of the version-history alias do not break.
 */
export const escapeSqlString = (value: string | null | undefined): string => EscapeSQLString(value);

/** Build a safe SQL equality filter: FieldName = 'escapedValue' */
export function SqlEquals(fieldName: string, value: string): string {
    return `${fieldName} = '${EscapeSQLString(value)}'`;
}
/** @deprecated Use {@link SqlEquals}. */
export function sqlEquals(fieldName: string, value: string): string {
    return SqlEquals(fieldName, value);
}

/** Build a safe SQL LIKE filter: FieldName LIKE '%escapedValue%' */
export function SqlContains(fieldName: string, value: string): string {
    return `${fieldName} LIKE '%${EscapeSQLString(value)}%'`;
}
/** @deprecated Use {@link SqlContains}. */
export function sqlContains(fieldName: string, value: string): string {
    return SqlContains(fieldName, value);
}

/** Build a safe SQL IN filter: FieldName IN ('a','b','c') */
export function SqlIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} IN (${escaped})`;
}
/** @deprecated Use {@link SqlIn}. */
export function sqlIn(fieldName: string, values: string[]): string {
    return SqlIn(fieldName, values);
}

/** Build a safe SQL NOT IN filter: FieldName NOT IN ('a','b','c') */
export function SqlNotIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} NOT IN (${escaped})`;
}
/** @deprecated Use {@link SqlNotIn}. */
export function sqlNotIn(fieldName: string, values: string[]): string {
    return SqlNotIn(fieldName, values);
}
