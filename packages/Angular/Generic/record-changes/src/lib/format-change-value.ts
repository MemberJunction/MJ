import { EntityFieldInfo, EntityFieldTSType, FormatDateOnly, IsDateOnlySQLType } from '@memberjunction/core';

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
