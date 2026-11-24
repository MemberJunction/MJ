/**
 * Adapter converting shared {@link CatalogIndex} records from `@memberjunction/sql-dialect`
 * into DBAutoDoc's {@link AutoDocIndex} shape.
 *
 * The SQL catalog queries and row mappers for SQL Server, PostgreSQL, and MySQL live in
 * `@memberjunction/sql-dialect` so CodeGenLib and DBAutoDoc share a single implementation.
 */

import type { CatalogIndex } from '@memberjunction/sql-dialect';
import { AUTODOC_EXPRESSION_KEY_PART, type AutoDocIndex } from '../types/driver.js';

/** Converts one {@link CatalogIndex} into an {@link AutoDocIndex}. */
export function CatalogIndexToAutoDocIndex(index: CatalogIndex): AutoDocIndex {
  const ordered = [...index.Fields].sort((a, b) => a.Sequence - b.Sequence);
  const columns: string[] = [];
  const includeColumns: string[] = [];

  for (const field of ordered) {
    if (field.Role === 'Include') {
      if (field.ColumnName !== null) {
        includeColumns.push(field.ColumnName);
      }
    } else {
      columns.push(field.ColumnName ?? AUTODOC_EXPRESSION_KEY_PART);
    }
  }

  return {
    SchemaName: index.SchemaName,
    TableName: index.TableName,
    IndexName: index.IndexName,
    Columns: columns,
    IncludeColumns: includeColumns,
    IsUnique: index.IsUnique,
    IsPrimaryKey: index.IsPrimaryKey,
    Method: index.NativeType,
    FilterDefinition: index.FilterDefinition ?? undefined,
    HasExpressions: index.HasExpressions,
  };
}

/** Converts a list of {@link CatalogIndex} records into {@link AutoDocIndex} records. */
export function CatalogIndexesToAutoDocIndexes(indexes: readonly CatalogIndex[]): AutoDocIndex[] {
  return indexes.map(CatalogIndexToAutoDocIndex);
}
