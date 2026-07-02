import pg from 'pg';

/**
 * PostgreSQL wire-protocol OIDs for the two numeric types whose values
 * node-postgres returns as strings by default.
 */
export const PG_INT8_OID = 20;
export const PG_NUMERIC_OID = 1700;

/**
 * Parses a BIGINT (int8) text value to a JS number. Values outside the IEEE-754
 * safe-integer range are returned as the original string rather than silently
 * losing precision.
 */
export function parseInt8(value: string): number | string {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value;
}

/**
 * Parses a NUMERIC/DECIMAL text value to a JS number. Mirrors the SQL Server
 * provider, whose driver (tedious) parses decimal columns into JS numbers.
 */
export function parseNumeric(value: string): number {
    return parseFloat(value);
}

/**
 * Type-parser configuration for every pg Pool the provider creates (pass as
 * `types` in pg.PoolConfig). node-postgres leaves NUMERIC/DECIMAL and BIGINT
 * text values as strings to avoid precision loss, but MemberJunction entity
 * metadata types those columns as `number` and all consumers (RunView results,
 * GraphQL serialization, Explorer UI) assume JS numbers — the contract the SQL
 * Server provider already delivers. Without this, UI code that does
 * `cost.toFixed(4)` throws and token totals string-concatenate instead of sum.
 * All other OIDs, and all binary-format values, use the pg defaults.
 */
export const MJPostgresTypes: pg.CustomTypesConfig = {
    getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
        if (format !== 'binary') {
            if (oid === PG_INT8_OID) {
                return parseInt8;
            }
            if (oid === PG_NUMERIC_OID) {
                return parseNumeric;
            }
        }
        return pg.types.getTypeParser(oid as never, format as never);
    }) as pg.CustomTypesConfig['getTypeParser'],
};
