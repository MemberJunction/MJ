import { EntityFieldInfo, EntityFieldTSType, FormatDateOnly, IsDateOnlySQLType } from '@memberjunction/core';
import { FormatBinaryChangeValue, IsBinaryChangeValue } from '@memberjunction/global';

/** An instant: the moment it happened, in the reader's zone. */
const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

/** A calendar day: no time, and no zone to shift it. */
const DATE_ONLY_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/**
 * Formats a field value from a change record, a snapshot, or a live record for display.
 *
 * Shared by the change history and the restore preview so the two cannot disagree about the same
 * value. A SQL `date` column is a calendar day that arrives as UTC midnight: it is formatted as that
 * day, with no time. Run through the timestamp format, a stored 2026-10-01 read "Sep 30, 2026,
 * 7:00 PM" for a reader in US Central — the wrong day, and a time the value never had.
 *
 * A live record's date field is a `Date` object, not a string, and is formatted the same way rather
 * than falling into the generic object branch, which rendered it as an empty string.
 *
 * @param value The raw value: a string or Date for date fields, any JSON value otherwise
 * @param field The field's metadata, when known; without it the value is treated as text
 */
export function FormatChangeValue(value: unknown, field: EntityFieldInfo | undefined): string {
  if (value == null) return '';

  // A binary field holds base64 (an embedding, a file). Show its size, never the text: a snapshot
  // value is formatted here; a diff value already arrives as the size text and is shown as-is.
  if (field?.IsBinaryFieldType && typeof value === 'string') {
    return IsBinaryChangeValue(value) ? value : FormatBinaryChangeValue(value);
  }

  if (field?.TSType === EntityFieldTSType.Date && (value instanceof Date || typeof value === 'string')) {
    const date = value instanceof Date ? value : new Date(value);
    if (!isNaN(date.getTime())) {
      return IsDateOnlySQLType(field.Type)
        ? FormatDateOnly(date, DATE_ONLY_FORMAT, 'en-US')
        : new Intl.DateTimeFormat('en-US', TIMESTAMP_FORMAT).format(date);
    }
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return '';
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Whether two values of the same field hold the same data, for deciding whether a restore would
 * change anything.
 *
 * Comparing the display strings is not enough for a date: the display drops seconds, so a timestamp
 * that moved by 30 seconds formats identically and would read as unchanged. A timestamp is compared
 * as the instant it names, and a SQL `date` column as the calendar day it stores, so a snapshot's
 * `'2026-10-01'` matches a live `Date` at UTC midnight of that day. Anything else, and a date that
 * does not parse, falls back to the display strings, as before.
 *
 * @param a One value: a string or Date for date fields, any JSON value otherwise
 * @param b The other value
 * @param field The field's metadata, when known
 */
export function ChangeValuesMatch(a: unknown, b: unknown, field: EntityFieldInfo | undefined): boolean {
  // Two binary values of the same size format identically, so compare the base64 itself.
  if (field?.IsBinaryFieldType) {
    return (a ?? '') === (b ?? '');
  }
  if (field?.TSType === EntityFieldTSType.Date) {
    const left = asValidDate(a);
    const right = asValidDate(b);
    if (left && right) {
      return IsDateOnlySQLType(field.Type)
        ? left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10)
        : left.getTime() === right.getTime();
    }
  }
  return FormatChangeValue(a, field) === FormatChangeValue(b, field);
}

/** A date or date string as a valid Date, or `null`. */
function asValidDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
