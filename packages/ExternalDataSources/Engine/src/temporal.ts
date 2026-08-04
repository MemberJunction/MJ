/**
 * Shared ISO-8601 date-time helpers for the External Data Sources subsystem.
 *
 * One canonical regex + parse rule, so the incremental-watermark literal formatting (SQL drivers, esp.
 * Oracle's `TO_TIMESTAMP`/`TO_TIMESTAMP_TZ`) and the MongoDB value coercion (driver + filter translator)
 * agree on what "an ISO-8601 date-time" is and how a zoneless one is interpreted — rather than three
 * subtly-different inline regexes.
 */

/**
 * Full ISO-8601 date-time: `YYYY-MM-DD`, a `T` time component `HH:MM:SS`, optional fractional seconds,
 * and an optional zone designator (`Z` or `±HH:MM` / `±HHMM`). Capture groups: [1] date, [2] time,
 * [3] `.fraction` (or undefined), [4] zone (or undefined).
 */
export const ISO_8601_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Whether `value` is a full ISO-8601 date-time (has a `T` time component). */
export function isIso8601DateTime(value: string): boolean {
  return ISO_8601_DATETIME_RE.test(value);
}

/** The explicit zone designator (`Z` or `±HH:MM`) if present, else `null` (a zoneless / naive timestamp). */
export function iso8601Zone(value: string): string | null {
  const m = ISO_8601_DATETIME_RE.exec(value);
  return m ? (m[4] ?? null) : null;
}

/**
 * Parse an ISO-8601 date-time to a `Date`. A string carrying an explicit zone (`Z`/offset) parses exactly;
 * a ZONELESS string is interpreted as **UTC** (NOT the server's local timezone), so a sync watermark is
 * deterministic and timezone-stable regardless of where the API server runs. Returns `null` for a non-ISO
 * or unparseable value.
 */
export function parseIso8601AsUtc(value: string): Date | null {
  if (!isIso8601DateTime(value)) {
    return null;
  }
  const normalized = iso8601Zone(value) ? value : `${value}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}
