import { EscapeSQLString } from '@memberjunction/global';

/**
 * Escape a string value for safe inclusion in a SQL filter.
 * Delegates to EscapeSQLString in @memberjunction/global.
 */
export const escapeSqlString = (value: string | null | undefined): string => EscapeSQLString(value);

/**
 * Build a safe SQL equality filter: FieldName = 'escapedValue'
 */
export function sqlEquals(fieldName: string, value: string): string {
    return `${fieldName} = '${EscapeSQLString(value)}'`;
}

/**
 * Build a safe SQL LIKE filter: FieldName LIKE '%escapedValue%'
 */
export function sqlContains(fieldName: string, value: string): string {
    return `${fieldName} LIKE '%${EscapeSQLString(value)}%'`;
}

/**
 * Build a safe SQL IN filter: FieldName IN ('a','b','c')
 */
export function sqlIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} IN (${escaped})`;
}

/**
 * Build a safe SQL NOT IN filter: FieldName NOT IN ('a','b','c')
 */
export function sqlNotIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} NOT IN (${escaped})`;
}
