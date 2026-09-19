import pg from 'pg';

/**
 * PostgreSQL wire-protocol OIDs for the two numeric types whose values
 * node-postgres returns as strings by default.
 */
export const PG_INT8_OID = 20;
export const PG_NUMERIC_OID = 1700;
/** PostgreSQL wire-protocol OID for the date-only DATE type. */
export const PG_DATE_OID = 1082;

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
 * Parses a DATE text value (`YYYY-MM-DD`) to a JS Date at UTC midnight.
 *
 * A SQL `date` column is a calendar day with no time and no zone. node-postgres'
 * default parser builds it at LOCAL midnight on the API server, so the instant it
 * hands the framework depends on where the server runs: a stored 2026-11-20
 * becomes 2026-11-19T22:00Z on a server in Berlin, and every display path that
 * reads the UTC parts of the value (the form field, the grid, the cards) then
 * shows the 19th. The SQL Server driver (tedious) returns UTC midnight, and the
 * framework's date-only rendering is built on that shape; this parser gives the
 * PostgreSQL provider the same contract. `infinity`, `-infinity`, BC dates and
 * anything else that is not a plain `YYYY-MM-DD` fall through to the pg default.
 *
 * The write side needs no counterpart, but it does depend on one thing staying
 * true: the provider serializes a Date as its ISO string and CodeGen casts a DATE
 * column straight from text — `(p_data->>'Field')::DATE` — and text-to-date
 * ignores the time and the zone, so 2026-11-20T00:00:00.000Z lands as the 20th
 * under any session TimeZone. Casting through TIMESTAMPTZ first would apply the
 * session zone and write the 19th on a server west of Greenwich.
 */
export function parseDateOnly(value: string): Date | number | null {
    const parts = value.split('-');
    if (parts.length === 3 && parts.every(p => p.length > 0 && /^\d+$/.test(p)) && parts[0].length >= 4) {
        const date = new Date(0);
        date.setUTCFullYear(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        date.setUTCHours(0, 0, 0, 0);
        return date;
    }
    const fallback = pg.types.getTypeParser(PG_DATE_OID as never, 'text' as never) as (v: string) => Date | number | null;
    return fallback(value);
}

/**
 * Type-parser configuration for every pg Pool the provider creates (pass as
 * `types` in pg.PoolConfig). node-postgres leaves NUMERIC/DECIMAL and BIGINT
 * text values as strings to avoid precision loss, but MemberJunction entity
 * metadata types those columns as `number` and all consumers (RunView results,
 * GraphQL serialization, Explorer UI) assume JS numbers — the contract the SQL
 * Server provider already delivers. Without this, UI code that does
 * `cost.toFixed(4)` throws and token totals string-concatenate instead of sum.
 * DATE values are parsed to UTC midnight for the same reason: the SQL Server
 * driver delivers that shape and the framework's calendar-day rendering reads
 * the UTC parts (see parseDateOnly). Timestamps are instants and keep the pg
 * defaults. All other OIDs, and all binary-format values, use the pg defaults.
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
            if (oid === PG_DATE_OID) {
                return parseDateOnly;
            }
        }
        return pg.types.getTypeParser(oid as never, format as never);
    }) as pg.CustomTypesConfig['getTypeParser'],
};
