/**
 * Canonical formatting helpers used by the emitter and comparator.
 *
 * Determinism is the contract: identical input must produce byte-identical
 * output, regardless of host OS, locale, or run order.
 */

/** Lower-case schema-qualified name used for sort keys and sets. */
export function qname(schema: string, name: string): string {
  return `${schema}.${name}`.toLowerCase();
}

/** Quote a T-SQL identifier with brackets, escaping any embedded `]`. */
export function quoteIdent(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

/** Quote a T-SQL string literal, escaping single quotes. */
export function quoteString(value: string): string {
  return `N'${value.replace(/'/g, "''")}'`;
}

/** Stable sort by a key extractor; preserves input order for ties. */
export function stableSortBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return a.index - b.index;
    })
    .map((wrapped) => wrapped.item);
}

/** Cross-platform line endings: emit LF only. Caller normalizes if needed. */
export const NL = '\n';

/** Canonical ISO-8601 UTC stamp without milliseconds: 2026-05-02T19:47:00Z. */
export function isoUtcSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Filename timestamp: YYYYMMDDHHMM in UTC. */
export function fileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes())
  );
}

/** Build the canonical filename for a baseline migration. */
export function baselineFilename(opts: { generatedAtUtc: Date; baselineVersion: string }): string {
  return `B${fileStamp(opts.generatedAtUtc)}__v${opts.baselineVersion}.X__Baseline.sql`;
}

/**
 * Format a JS value as a T-SQL literal. Used by the data dumper.
 * Returns `NULL` for null/undefined, otherwise a typed literal.
 */
export function formatTsqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    // datetime2 with full precision
    const iso = value.toISOString();             // 2026-05-02T19:47:23.123Z
    const stripped = iso.replace('T', ' ').replace('Z', '');
    return `N'${stripped}'`;
  }
  if (Buffer.isBuffer(value)) {
    return '0x' + value.toString('hex').toUpperCase();
  }
  if (value instanceof Uint8Array) {
    return '0x' + Buffer.from(value).toString('hex').toUpperCase();
  }
  if (typeof value === 'string') return quoteString(value);
  if (typeof value === 'object') {
    // Fallback: JSON-serialize objects (rare; mssql driver returns primitives)
    return quoteString(JSON.stringify(value));
  }
  throw new Error(`Unsupported value type for T-SQL literal: ${typeof value}`);
}

/** Strict equality used by the comparator for column values. */
export function deepValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) return a.equals(b);
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return Buffer.from(a).equals(Buffer.from(b));
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  // Fall back to JSON for plain objects (driver-native types should already
  // have been normalized to Date/Buffer above).
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** Truncate a string with an ellipsis for diff output. */
export function ellipsize(value: string, max = 80): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}
