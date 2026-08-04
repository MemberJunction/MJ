/**
 * Canonical formatting helpers used by the emitter and comparator.
 *
 * Determinism is the contract: identical input must produce byte-identical
 * output, regardless of host OS, locale, or run order.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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

/**
 * Tables that must never appear in the emitted baseline — they belong to the
 * migration tool itself and get created automatically before the baseline runs.
 * Match by table name only (schema-independent) because Skyway can be configured
 * to put `flyway_schema_history` in any schema (MJ uses `__mj`, default is `dbo`).
 */
export const EXCLUDED_TABLE_NAMES: ReadonlySet<string> = new Set(['flyway_schema_history']);

/** Returns true if a table (by bare name) is one we never emit in a baseline. */
export function isExcludedTable(name: string): boolean {
  return EXCLUDED_TABLE_NAMES.has(name.toLowerCase());
}

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
  return `B${fileStamp(opts.generatedAtUtc)}__v${opts.baselineVersion}.x__Baseline.sql`;
}

/** Inverse of {@link fileStamp}: parses a YYYYMMDDHHMM string into a UTC Date. */
export function parseFileStamp(stamp: string): Date {
  if (!/^\d{12}$/.test(stamp)) {
    throw new Error(`Invalid YYYYMMDDHHMM stamp: ${stamp}`);
  }
  const y = Number(stamp.slice(0, 4));
  const mo = Number(stamp.slice(4, 6)) - 1;
  const d = Number(stamp.slice(6, 8));
  const h = Number(stamp.slice(8, 10));
  const mi = Number(stamp.slice(10, 12));
  return new Date(Date.UTC(y, mo, d, h, mi));
}

/** Return a new Date offset by N minutes (negative for past). */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Parse a Skyway/Flyway migration filename into its parts. Returns null if the
 * filename doesn't match the expected `[VB]<timestamp>__v<Major>.<Minor>...` shape.
 *
 * Handles both styles found in the `migrations/v{N}/` directories:
 *   - `V202602131500__v5.0.x__Entity_Name_Normalization.sql`  (with `.x` patch)
 *   - `V202602170015__v5.1__Regenerate_Delete_Stored_Procs.sql` (no patch)
 *   - `B202602151200__v5.0__Baseline.sql`                       (baseline marker)
 */
export interface ParsedMigrationFilename {
  kind: 'V' | 'B';
  timestamp: string;     // 12-digit YYYYMMDDHHMM
  major: number;
  minor: number;
  majorMinor: string;    // e.g. "5.32"
  filename: string;
}
export function parseMigrationFilename(filename: string): ParsedMigrationFilename | null {
  const match = /^([VB])(\d{12})__v(\d+)\.(\d+)/.exec(filename);
  if (!match) return null;
  return {
    kind: match[1] as 'V' | 'B',
    timestamp: match[2],
    major: Number(match[3]),
    minor: Number(match[4]),
    majorMinor: `${match[3]}.${match[4]}`,
    filename,
  };
}

/**
 * Scan a migrations source directory and return the latest V-file by timestamp.
 * Files that don't match the expected shape are silently ignored.
 *
 * Used by within-major rebaseline to derive the new baseline's version + timestamp
 * from the head of the existing V-stack.
 */
export function findLatestVersionedMigration(sourceDir: string): ParsedMigrationFilename | null {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return null;
  }
  const entries = fs.readdirSync(sourceDir);
  let best: ParsedMigrationFilename | null = null;
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.sql')) continue;
    const parsed = parseMigrationFilename(name);
    if (!parsed || parsed.kind !== 'V') continue;
    if (!best || parsed.timestamp > best.timestamp) best = parsed;
  }
  return best;
}

/** Same as {@link findLatestVersionedMigration} but for `B`-prefixed baseline files. */
export function findLatestBaselineMigration(sourceDir: string): ParsedMigrationFilename | null {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return null;
  }
  const entries = fs.readdirSync(sourceDir);
  let best: ParsedMigrationFilename | null = null;
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.sql')) continue;
    const parsed = parseMigrationFilename(name);
    if (!parsed || parsed.kind !== 'B') continue;
    if (!best || parsed.timestamp > best.timestamp) best = parsed;
  }
  return best;
}

/**
 * Walk up from `cwd` looking for a `migrations/` directory, then return the path
 * to the highest-numbered `vN/` subdirectory inside it. Returns null if nothing
 * suitable is found.
 *
 * Stops walking at the filesystem root. Used so the CLI can auto-locate the
 * source dir for within-major rebaseline without forcing the caller to pass `--source-dir`.
 */
export function discoverMigrationsSourceDir(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 16; i++) {
    const candidate = path.join(dir, 'migrations');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      const versioned = fs
        .readdirSync(candidate)
        .filter((name) => /^v\d+$/i.test(name))
        .map((name) => ({ name, n: Number(name.slice(1)) }))
        .sort((a, b) => b.n - a.n);
      if (versioned.length > 0) {
        return path.join(candidate, versioned[0].name);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Compute the canonical generated-at timestamp for a within-major rebaseline.
 * The new baseline's filename timestamp is exactly 1 minute after the latest
 * V-file's timestamp — guaranteeing the new B-file sorts after the V-stack it
 * succeeds, while remaining deterministic across re-runs against the same input.
 */
export function computeAutoBaselineStamp(latestVTimestamp: string): {
  generatedAtUtc: Date;
  fileStamp: string;
} {
  const parsed = parseFileStamp(latestVTimestamp);
  const next = addMinutes(parsed, 1);
  return { generatedAtUtc: next, fileStamp: fileStamp(next) };
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
  // Byte-wise compare for Buffer / Uint8Array. We avoid Buffer.equals / Buffer.compare
  // because @types/node 20.x parameterizes them with `Uint8Array<ArrayBuffer>`, which
  // is narrower than the `Uint8Array<ArrayBufferLike>` actually held by Buffer instances.
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
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

/**
 * Topologically sort a list of SQL routines (views/functions/procs/triggers)
 * by inferred dependencies. A routine A depends on B if A's `definition` text
 * mentions B's name (case-insensitive, schema-qualified or bare with word
 * boundaries). Stable for equal items; sorts cycles by qname so the result is
 * still deterministic.
 *
 * Reference extraction is heuristic — comments and string literals are not
 * stripped — but false positives only add edges that don't hurt correctness.
 * MSSQL `CREATE VIEW`/`CREATE FUNCTION` reject forward references at create
 * time, so without this sort we hit `Invalid object name` errors on apply.
 */
export function topoSortRoutinesByDefinition<
  T extends { name: string; schema: string; definition: string },
>(items: readonly T[]): T[] {
  if (items.length <= 1) return items.slice();

  const byKey = new Map<string, T>();
  for (const r of items) byKey.set(qname(r.schema, r.name), r);

  // Precompute lowercased bodies, with bracket-quoted identifiers normalized
  // so that `[__mj].[vwEntities]` matches the qname `__mj.vwentities`. Without
  // this we miss bracket-style references — which is the form MSSQL routines
  // use almost universally.
  const bodyLower = new Map<string, string>();
  for (const [key, r] of byKey) {
    bodyLower.set(key, r.definition.toLowerCase().replace(/[[\]]/g, ''));
  }

  // Build deps: routine -> set of other routines it references.
  const deps = new Map<string, Set<string>>();
  const allKeys = [...byKey.keys()].sort();
  for (const key of allKeys) deps.set(key, new Set<string>());

  for (const key of allKeys) {
    const body = bodyLower.get(key)!;
    for (const otherKey of allKeys) {
      if (otherKey === key) continue;
      const bare = otherKey.includes('.') ? otherKey.slice(otherKey.lastIndexOf('.') + 1) : otherKey;
      if (body.includes(otherKey) || matchBareWord(body, bare)) {
        deps.get(key)!.add(otherKey);
      }
    }
  }

  // Kahn's algorithm with deterministic tie-breaking.
  const result: T[] = [];
  const remaining = new Map<string, Set<string>>();
  for (const [k, v] of deps) remaining.set(k, new Set(v));

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, refs]) => refs.size === 0)
      .map(([k]) => k)
      .sort();
    if (ready.length === 0) {
      // Cycle — emit remaining in qname order so output stays deterministic.
      for (const k of [...remaining.keys()].sort()) result.push(byKey.get(k)!);
      break;
    }
    for (const k of ready) {
      result.push(byKey.get(k)!);
      remaining.delete(k);
      for (const refs of remaining.values()) refs.delete(k);
    }
  }
  return result;
}

/** Word-boundary substring search (lowercased input only). */
function matchBareWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const re = new RegExp(`(?<![\\w.])${escapeRegExp(needle)}(?!\\w)`);
  return re.test(haystack);
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
