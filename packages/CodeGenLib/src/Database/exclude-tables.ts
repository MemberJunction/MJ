/**
 * Normalize `excludeTables` config entries into `{ schema, table }` pairs.
 *
 * The historical shape is an object. Operators on large brownfield databases also
 * want a one-line string — `'Aptify.EntityRecordVersions'`, `'%.%History'`,
 * `'%Audit%'` — so a 49-million-row audit table can be skipped without hunting
 * through a JSON object. Both forms compile to the same LIKE/equals predicate
 * that `createExcludeTablesAndSchemasFilter` already emits.
 *
 * String grammar:
 * - `'schema.table'`     → exact (or wildcard) schema + table. The last `.` splits.
 * - `'%.%History'`       → any schema, table LIKE `%History`
 * - `'%Audit%'`          → any schema (`%`), table LIKE `%Audit%`
 * - `'EntityRecordVersions'` → any schema, that exact table name
 */

export type ExcludeTableEntry = {
  schema: string;
  table: string;
};

/**
 * Parse one `excludeTables` entry — object or `'schema.table'` / table-only string —
 * into the `{ schema, table }` pair the SQL filter already understands. Wildcards
 * (`%`) are preserved; they are not expanded here.
 */
export function parseExcludeTableEntry(entry: string | ExcludeTableEntry): ExcludeTableEntry {
  if (typeof entry !== 'string') {
    return { schema: entry.schema, table: entry.table };
  }
  const trimmed = entry.trim();
  if (trimmed.length === 0) {
    throw new Error('excludeTables entry cannot be empty');
  }
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot > 0 && lastDot < trimmed.length - 1) {
    return {
      schema: trimmed.slice(0, lastDot).trim(),
      table: trimmed.slice(lastDot + 1).trim(),
    };
  }
  return { schema: '%', table: trimmed };
}
