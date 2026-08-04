/**
 * Per-table data dumper.
 *
 * Streams every row of every table from a live MSSQL connection in a stable
 * order (PK, falling back to all columns) and emits the result as a
 * TableDataDump. The emitter renders these as batched INSERT ... VALUES
 * statements with `SET IDENTITY_INSERT` bookends.
 */

import type { QueryRunner } from './connection';
import { quoteIdent, stableSortBy } from './util';
import type { ColumnDef, TableDataDump, TableDef } from './types';

export interface DumpProgress {
  onTable?(table: TableDef, rowsSoFar: number, rowsTotal?: number): void;
}

export interface DumpOptions {
  excludedTables: Set<string>;       // 'schema.table' lowercased
  /** Hard cap per table (defensive — baselines should not have huge tables). */
  maxRowsPerTable?: number;
}

/** Dump every non-excluded table. Computed columns are skipped. */
export async function dumpTables(
  db: QueryRunner,
  tables: readonly TableDef[],
  options: DumpOptions,
  progress: DumpProgress = {},
): Promise<TableDataDump[]> {
  const dumps: TableDataDump[] = [];
  for (const table of tables) {
    const key = `${table.schema}.${table.name}`.toLowerCase();
    if (options.excludedTables.has(key)) continue;

    const includedColumns = table.columns.filter((c) => !c.isComputed);
    if (includedColumns.length === 0) continue;

    const rows: unknown[][] = [];
    let count = 0;
    const orderBy = buildOrderBy(table);
    const select = `SELECT ${includedColumns.map(selectExpressionForColumn).join(', ')} ` +
      `FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)} ${orderBy}`;
    let truncated = false;

    await db.stream(select, (row) => {
      if (options.maxRowsPerTable && count >= options.maxRowsPerTable) {
        truncated = true;
        return;
      }
      const ordered = includedColumns.map((c) => row[c.name]);
      rows.push(ordered);
      count++;
      if (count % 5000 === 0) progress.onTable?.(table, count);
    });
    progress.onTable?.(table, count);

    dumps.push({
      schema: table.schema,
      table: table.name,
      columns: includedColumns.map((c) => c.name),
      rows,
      rowCount: rows.length,
      truncated,
    });
  }
  return dumps;
}

/** Construct an ORDER BY clause for deterministic streaming. */
export function buildOrderBy(table: TableDef): string {
  const orderColumns = (() => {
    if (table.primaryKey && table.primaryKey.columns.length) return table.primaryKey.columns;
    if (table.uniqueConstraints[0]?.columns.length) return table.uniqueConstraints[0].columns;
    // Fall back to ALL non-LOB columns sorted by ordinal so we still get a
    // deterministic order. LOB types can't appear in ORDER BY in MSSQL.
    const sortable = stableSortBy(
      table.columns.filter((c) => !c.isComputed && !isLobType(c.dataType)),
      (c) => String(c.ordinal).padStart(6, '0'),
    );
    return sortable.map((c) => c.name);
  })();
  if (orderColumns.length === 0) return '';
  return 'ORDER BY ' + orderColumns.map((n) => quoteIdent(n)).join(', ');
}

function isLobType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return (
    lower.includes('text') ||
    lower.includes('image') ||
    lower.includes('xml') ||
    lower === 'sql_variant' ||
    lower.endsWith('(max)')
  );
}

/**
 * Build the SELECT expression for a column.
 *
 * Datetime2 / datetimeoffset / time columns carry up to 7 fractional-second
 * digits (100ns ticks). When the mssql driver hands them back as a JS `Date`
 * we lose everything past milliseconds — the resulting INSERTs round to
 * `.SSS000`, producing systematic row-level diffs against the source DB.
 * Wrapping these in `CONVERT(NVARCHAR(50), col, 121)` returns the raw
 * datetime string with full precision; SQL Server then implicitly converts
 * the string literal back to datetime2 at INSERT time.
 *
 * `datetime` (legacy) is 3.33ms precision so JS Date is sufficient; we leave
 * it alone. `smalldatetime` is minute-precision; also fine.
 */
function selectExpressionForColumn(c: ColumnDef): string {
  const lc = c.dataType.toLowerCase();
  if (lc.startsWith('datetime2') || lc.startsWith('datetimeoffset') || lc.startsWith('time')) {
    return `CONVERT(NVARCHAR(50), ${quoteIdent(c.name)}, 121) AS ${quoteIdent(c.name)}`;
  }
  return quoteIdent(c.name);
}
