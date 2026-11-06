/**
 * Existing indexes as evidence for the LLM passes.
 *
 * Databases "in the wild" often declare no primary or foreign keys but still have indexes on the
 * columns people join and filter on. A unique index on non-null columns usually marks a primary or
 * alternate key, and a non-unique index led by an ID-like column often marks a foreign key. These
 * helpers turn the indexes stored on a table (`TableDefinition.indexes`) into prompt context.
 */

import type { AutoDocIndex } from '../types/driver.js';
import type { SchemaDefinition, TableDefinition } from '../types/state.js';

/** One existing index, trimmed to what a prompt needs. */
export interface IndexHint {
  Columns: string[];
  IncludeColumns: string[];
  IsUnique: boolean;
  IsPrimaryKey: boolean;
  /** Partial-index predicate, when the index covers only some rows. */
  Filter?: string;
}

/** Most indexes a single table contributes to a prompt. */
export const MAX_INDEX_HINTS_PER_TABLE = 25;

/**
 * The table's indexes as prompt hints, primary key first, then unique, then the rest, capped at
 * `max`. Returns an empty array when the table has none or they were not loaded.
 */
export function BuildIndexHints(table: Pick<TableDefinition, 'indexes'> | undefined, max = MAX_INDEX_HINTS_PER_TABLE): IndexHint[] {
  const indexes = table?.indexes ?? [];
  return [...indexes]
    .sort((a, b) => hintRank(a) - hintRank(b))
    .slice(0, max)
    .map((ix) => ({
      Columns: ix.Columns,
      IncludeColumns: ix.IncludeColumns,
      IsUnique: ix.IsUnique || ix.IsPrimaryKey,
      IsPrimaryKey: ix.IsPrimaryKey,
      Filter: ix.FilterDefinition || undefined
    }));
}

/** One line per hint, e.g. `UNIQUE (Code) INCLUDE (Name) WHERE (Active = 1)`. */
export function FormatIndexHint(hint: IndexHint): string {
  const kind = hint.IsPrimaryKey ? 'PRIMARY KEY' : hint.IsUnique ? 'UNIQUE' : 'INDEX';
  const include = hint.IncludeColumns.length ? ` INCLUDE (${hint.IncludeColumns.join(', ')})` : '';
  const filter = hint.Filter ? ` WHERE ${hint.Filter}` : '';
  return `${kind} (${hint.Columns.join(', ')})${include}${filter}`;
}

/**
 * True when the column alone is the key of a primary-key or unique, unfiltered index on the table,
 * i.e. the database already guarantees its values are distinct. Undefined when indexes were not loaded.
 */
export function IsUniquelyIndexed(table: Pick<TableDefinition, 'indexes'> | undefined, column: string): boolean | undefined {
  if (!table?.indexes) {
    return undefined;
  }
  const target = column.toLowerCase();
  return table.indexes.some(
    (ix) => (ix.IsUnique || ix.IsPrimaryKey) && !ix.FilterDefinition && ix.Columns.length === 1 && ix.Columns[0].toLowerCase() === target
  );
}

/** Attaches catalog indexes to the matching tables (exact name first, then case-insensitive). */
export function AttachIndexesToTables(tables: TableDefinition[], indexes: AutoDocIndex[]): void {
  const exact = new Map<string, AutoDocIndex[]>();
  for (const ix of indexes) {
    const list = exact.get(ix.TableName) ?? [];
    list.push(ix);
    exact.set(ix.TableName, list);
  }
  const folded = new Map<string, AutoDocIndex[]>();
  for (const [name, list] of exact) {
    folded.set(name.toLowerCase(), [...(folded.get(name.toLowerCase()) ?? []), ...list]);
  }
  for (const table of tables) {
    table.indexes = exact.get(table.name) ?? folded.get(table.name.toLowerCase()) ?? [];
  }
}

/**
 * Decides which schemas still need their indexes read, honoring `analysis.useExistingIndexes`.
 * When it is off, indexes left in a resumed state by an earlier run are dropped, so neither the prompt
 * hints nor index-backed PK candidates use them, and nothing is returned to load. Otherwise returns the
 * schemas with at least one table whose indexes were never read.
 */
export function PrepareIndexesForRun(schemas: SchemaDefinition[], useExistingIndexes: boolean | undefined): SchemaDefinition[] {
  if (useExistingIndexes === false) {
    for (const table of schemas.flatMap((s) => s.tables)) {
      delete table.indexes;
    }
    return [];
  }
  return schemas.filter((s) => s.tables.some((t) => t.indexes === undefined));
}

function hintRank(ix: AutoDocIndex): number {
  return ix.IsPrimaryKey ? 0 : ix.IsUnique ? 1 : 2;
}
