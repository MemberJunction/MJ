/**
 * Pure, framework-free helpers for the FK autocomplete in {@link MjFormFieldComponent}.
 *
 * These functions hold the parts of the FK search UX that have real logic worth
 * unit-testing in isolation — cell formatting, the in-memory cached-entity filter,
 * and the empty-input "focus-show" (first N, sorted by name). Keeping them out of
 * the Angular component means they can be tested without TestBed / DI.
 */

/**
 * Format a raw entity cell value for display in the dropdown.
 * - `Date` → locale date string
 * - `null` / `undefined` → empty string
 * - `boolean` → `Yes` / `No`
 * - everything else → `String(value)`
 */
export function FormatFKCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toLocaleDateString();
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
