import { IsDateOnlySQLType } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';

/** `YYYY-MM-DD` at the start of a string, the calendar day of a date-only value. */
const ISO_DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * The text a temporal column value takes in an entity document: its template data and its vector
 * metadata. A `date` column becomes its calendar day, `YYYY-MM-DD`; a timestamp becomes ISO 8601.
 * Any other value is returned unchanged.
 *
 * Database drivers hand a `date` column over as a `Date` at UTC midnight. Rendered as-is, a
 * template or `String()` calls `Date.toString()` in the server's time zone, so a stored 1984-05-07
 * becomes "Sun May 06 1984 20:00:00 GMT-0400 (Eastern Daylight Time)" west of Greenwich: the wrong
 * day, surrounded by tokens every record shares. Reading the UTC parts keeps the stored day.
 *
 * @param sqlType the column's SQL type (`EntityFieldInfo.Type`)
 * @param value the column value as the driver returned it
 */
export function NormalizeTemporalValue(sqlType: string | null | undefined, value: unknown): unknown {
    if (IsDateOnlySQLType(sqlType)) {
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? value : value.toISOString().substring(0, 10);
        }
        if (typeof value === 'string') {
            const day = ISO_DAY_PREFIX.exec(value);
            return day ? day[1] : value;
        }
        return value;
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
        return value.toISOString();
    }
    return value;
}

/**
 * A shallow copy of `record` with every field of `entity` passed through
 * {@link NormalizeTemporalValue}. Keys that are not fields of the entity are copied as they are.
 * Returns `record` itself when no value changes, so the common case allocates nothing.
 */
export function NormalizeTemporalFields<T extends Record<string, unknown>>(entity: EntityInfo, record: T): T {
    if (!record) {
        return record;
    }
    let copy: Record<string, unknown> | null = null;
    for (const field of entity.Fields ?? []) {
        if (!(field.Name in record)) {
            continue;
        }
        const value = record[field.Name];
        const normalized = NormalizeTemporalValue(field.Type, value);
        if (normalized !== value) {
            copy = copy ?? { ...record };
            copy[field.Name] = normalized;
        }
    }
    return (copy ?? record) as T;
}
