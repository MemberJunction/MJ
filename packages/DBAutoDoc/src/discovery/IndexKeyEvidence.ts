/**
 * Primary-key evidence from a table's existing indexes (`TableDefinition.indexes`).
 *
 * A unique index is a guarantee from the database, not a statistic: its key values are distinct
 * whatever the data looks like, including on an empty table. PKDetector uses it as follows:
 * - a declared primary key becomes a candidate at fixed top confidence;
 * - a unique, unfiltered index on NOT NULL columns skips the statistical eligibility gate and is
 *   scored with a large index boost (naming, type, blacklist and position rules still apply, so a
 *   surrogate `id` still beats a natural-key unique index such as `email`);
 * - a unique index on a nullable column only adds a smaller boost to a column that already passes the
 *   statistical gate (non-empty, zero nulls), because NULLs can repeat in a unique index.
 */

import type { AutoDocIndex } from '../types/driver.js';
import type { ColumnDefinition, TableDefinition } from '../types/state.js';

/** How strongly the indexes back a key. */
export type IndexKeyKind = 'DeclaredPrimaryKey' | 'UniqueNotNull' | 'UniqueNullable';

/** Index boost added to the confidence score for each kind (declared PKs use a fixed confidence). */
export const INDEX_KEY_BOOST: Record<Exclude<IndexKeyKind, 'DeclaredPrimaryKey'>, number> = {
  UniqueNotNull: 35,
  UniqueNullable: 15
};

/** Fixed confidence for a declared primary key. */
export const DECLARED_PK_CONFIDENCE = 100;

/** Confidence for a composite key backed by a unique index: NOT NULL columns, or nullable columns with no nulls. */
export const UNIQUE_COMPOSITE_CONFIDENCE = { NotNull: 85, NoNullsObserved: 75 };

/** An index that can back a key: primary key or unique, with no filter predicate and no expression parts. */
export function IsKeyIndex(ix: AutoDocIndex): boolean {
  return (ix.IsPrimaryKey || ix.IsUnique) && !ix.FilterDefinition && !ix.HasExpressions && ix.Columns.length > 0;
}

/** The table's key indexes whose key is exactly these columns, in any order (case-insensitive). */
export function KeyIndexesOn(table: Pick<TableDefinition, 'indexes'>, columns: string[]): AutoDocIndex[] {
  const wanted = new Set(columns.map((c) => c.toLowerCase()));
  return (table.indexes ?? []).filter(
    (ix) => IsKeyIndex(ix) && ix.Columns.length === wanted.size && ix.Columns.every((c) => wanted.has(c.toLowerCase()))
  );
}

/** How the table's indexes back a single column as a key, or undefined when they don't. */
export function ClassifySingleColumnKey(
  table: Pick<TableDefinition, 'indexes'>,
  column: Pick<ColumnDefinition, 'name' | 'isNullable'>
): { Kind: IndexKeyKind; Index: AutoDocIndex } | undefined {
  const indexes = KeyIndexesOn(table, [column.name]);
  const declared = indexes.find((ix) => ix.IsPrimaryKey);
  if (declared) {
    return { Kind: 'DeclaredPrimaryKey', Index: declared };
  }
  const unique = indexes[0];
  if (!unique) {
    return undefined;
  }
  return { Kind: column.isNullable ? 'UniqueNullable' : 'UniqueNotNull', Index: unique };
}

/** Multi-column key indexes on the table (declared primary keys first). */
export function CompositeKeyIndexes(table: Pick<TableDefinition, 'indexes'>): AutoDocIndex[] {
  return (table.indexes ?? [])
    .filter((ix) => IsKeyIndex(ix) && ix.Columns.length > 1)
    .sort((a, b) => Number(b.IsPrimaryKey) - Number(a.IsPrimaryKey));
}
