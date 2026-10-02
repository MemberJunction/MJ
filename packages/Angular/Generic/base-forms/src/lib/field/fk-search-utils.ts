/**
 * Pure, framework-free helpers for the FK autocomplete in {@link MjFormFieldComponent}.
 *
 * These functions hold the parts of the FK search UX that have real logic worth
 * unit-testing in isolation — cell formatting, the in-memory cached-entity filter,
 * and the empty-input "focus-show" (first N, sorted by name). Keeping them out of
 * the Angular component means they can be tested without TestBed / DI.
 */

import { IsDateOnlySQLType, FormatDateOnly } from '@memberjunction/core';

/**
 * Format a raw entity cell value for display in the dropdown.
 * - `Date` → locale date string; a SQL `date` column (pass its `sqlType`) is a calendar day that
 *   arrives as UTC midnight and is rendered as its stored day rather than shifted into the
 *   reader's zone (MJ#4210); a timestamp names an instant and stays in local time
 * - `null` / `undefined` → empty string
 * - `boolean` → `Yes` / `No`
 * - everything else → `String(value)`
 */
export function FormatFKCell(val: unknown, sqlType?: string | null): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return IsDateOnlySQLType(sqlType) ? FormatDateOnly(val) : val.toLocaleDateString();
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/**
 * In-memory filter/sort over cached rows for the FK dropdown.
 *
 * - **Empty query** → returns the first `limit` rows sorted ascending by the
 *   formatted name field (the "focus-show" behavior).
 * - **Non-empty query** → returns every row whose formatted name field contains
 *   the query as a case-insensitive substring (no limit; the full match set).
 *
 * `getName` extracts the raw name-field value for a row; formatting + comparison
 * are handled here so callers don't duplicate the rules.
 *
 * @returns A NEW array (never mutates the input) suitable for rendering.
 */
export function FilterCachedFKRows<T>(
  rows: ReadonlyArray<T>,
  query: string,
  limit: number,
  getName: (row: T) => unknown
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return [...rows]
      .sort((a, b) => FormatFKCell(getName(a)).localeCompare(FormatFKCell(getName(b))))
      .slice(0, limit);
  }
  return rows.filter(r => FormatFKCell(getName(r)).toLowerCase().includes(q));
}

/**
 * Rank lookup rows so that names *starting with* what the user typed come before names that
 * merely contain it somewhere, alphabetically within each tier.
 *
 * Three typed letters otherwise match any name containing them anywhere, so an organization
 * whose name merely happens to include the sequence outranks the one the user was reaching for.
 * An empty query is a single tier, alphabetical.
 *
 * @returns A NEW array (never mutates the input).
 */
export function RankByPrefix<T extends { Values: Record<string, unknown> }>(
  rows: ReadonlyArray<T>,
  query: string,
  nameField: string
): T[] {
  const q = query.trim().toLowerCase();
  const nameOf = (row: T): string => FormatFKCell(row.Values[nameField]).toLowerCase();
  const tierOf = (row: T): number => (!q || nameOf(row).startsWith(q) ? 0 : 1);
  return [...rows].sort((a, b) => tierOf(a) - tierOf(b) || nameOf(a).localeCompare(nameOf(b)));
}

/**
 * Escape free text for interpolation into a SQL Server `LIKE` pattern: quotes doubled so the
 * string literal stays closed, and `%`, `_`, `[` bracketed so a user typing "50%" or "a_b" gets
 * literal matches instead of live wildcards.
 *
 * Bracketing rather than an `ESCAPE` clause, so a caller can drop the result into an existing
 * pattern without also having to declare an escape character.
 */
export function EscapeSqlLikeValue(text: string): string {
  return (text ?? '')
    .replace(/\0/g, '')
    .replace(/'/g, "''")
    .replace(/\[/g, '[[]')
    .replace(/%/g, '[%]')
    .replace(/_/g, '[_]');
}

/**
 * Build the `'a','b'` body of an `IN (...)` clause from a list of primary-key values. Blanks and
 * case-insensitive duplicates are dropped; quotes inside a value are doubled.
 *
 * Single-column keys only — a composite key's compact segment is not a SQL literal.
 */
export function QuoteSqlIdList(ids: ReadonlyArray<string>): string {
  const seen = new Set<string>();
  const quoted: string[] = [];
  for (const id of ids) {
    const value = (id ?? '').trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    quoted.push(`'${value.replace(/'/g, "''")}'`);
  }
  return quoted.join(',');
}
