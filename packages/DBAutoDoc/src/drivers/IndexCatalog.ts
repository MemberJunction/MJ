/**
 * Catalog queries and row mapping for reading existing indexes, one per database platform.
 * Kept separate from the drivers so the mapping can be unit-tested without a database.
 */

import { EscapeSQLString } from '@memberjunction/global';
import { AUTODOC_EXPRESSION_KEY_PART, type AutoDocIndex } from '../types/driver.js';

// ─── PostgreSQL ─────────────────────────────────────────────────────────────────

/** One row of {@link POSTGRESQL_INDEX_QUERY}. */
export interface PostgreSQLIndexRow {
  SchemaName: string;
  TableName: string;
  IndexName: string;
  IsUnique: boolean;
  IsPrimary: boolean;
  Method: string;
  FilterDef: string | null;
  HasExpr: boolean;
  /** Key parts in order; NULL at the position of an expression key part. */
  KeyColumns: (string | null)[] | null;
  IncludeColumns: string[] | null;
}

/** All indexes on ordinary and partitioned tables of schema `$1`. */
export const POSTGRESQL_INDEX_QUERY = `
  SELECT
    n.nspname AS "SchemaName",
    t.relname AS "TableName",
    i.relname AS "IndexName",
    ix.indisunique AS "IsUnique",
    ix.indisprimary AS "IsPrimary",
    am.amname AS "Method",
    pg_get_expr(ix.indpred, ix.indrelid) AS "FilterDef",
    (ix.indexprs IS NOT NULL) AS "HasExpr",
    ARRAY(
      -- attnum 0 marks an expression key part: keep its position as NULL so the order survives
      SELECT CASE WHEN k.attnum = 0 THEN NULL ELSE a.attname::text END
      FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
      LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.ord <= ix.indnkeyatts
      ORDER BY k.ord
    ) AS "KeyColumns",
    ARRAY(
      SELECT a.attname::text
      FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.ord > ix.indnkeyatts
      ORDER BY k.ord
    ) AS "IncludeColumns"
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = i.relam
  WHERE n.nspname = $1 AND t.relkind IN ('r', 'p')
  ORDER BY t.relname, i.relname
`;

export function MapPostgreSQLIndexRows(rows: PostgreSQLIndexRow[]): AutoDocIndex[] {
  return rows.map((r) => ({
    SchemaName: r.SchemaName,
    TableName: r.TableName,
    IndexName: r.IndexName,
    Columns: (r.KeyColumns ?? []).map((c) => c ?? AUTODOC_EXPRESSION_KEY_PART),
    IncludeColumns: r.IncludeColumns ?? [],
    IsUnique: r.IsUnique,
    IsPrimaryKey: r.IsPrimary,
    Method: r.Method,
    FilterDefinition: r.FilterDef ?? undefined,
    HasExpressions: r.HasExpr
  }));
}

// ─── SQL Server ─────────────────────────────────────────────────────────────────

/** One row of {@link BuildSQLServerIndexQuery}. Column lists are '|'-delimited. */
export interface SQLServerIndexRow {
  SchemaName: string;
  TableName: string;
  IndexName: string;
  IsUnique: boolean;
  IsPrimaryKey: boolean;
  Method: string;
  FilterDefinition: string | null;
  KeyColumns: string | null;
  IncludeColumns: string | null;
}

/** All relational indexes on user tables of one schema (heaps and hypothetical indexes excluded). */
export function BuildSQLServerIndexQuery(schemaName: string): string {
  const columnList = (included: 0 | 1, orderBy: string) => `
      STUFF((
        SELECT '|' + c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = ${included}
        ORDER BY ${orderBy}
        FOR XML PATH(''), TYPE
      ).value('.', 'nvarchar(max)'), 1, 1, '')`;
  return `
    SELECT
      s.name AS SchemaName,
      t.name AS TableName,
      i.name AS IndexName,
      i.is_unique AS IsUnique,
      i.is_primary_key AS IsPrimaryKey,
      i.type_desc AS Method,
      i.filter_definition AS FilterDefinition,
      ${columnList(0, 'ic.key_ordinal')} AS KeyColumns,
      ${columnList(1, 'ic.index_column_id')} AS IncludeColumns
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = N'${EscapeSQLString(schemaName)}'
      AND i.type > 0
      AND i.is_hypothetical = 0
    ORDER BY t.name, i.name
  `;
}

export function MapSQLServerIndexRows(rows: SQLServerIndexRow[]): AutoDocIndex[] {
  const split = (value: string | null) => (value ? value.split('|').filter((c) => c.length > 0) : []);
  return rows.map((r) => ({
    SchemaName: r.SchemaName,
    TableName: r.TableName,
    IndexName: r.IndexName,
    Columns: split(r.KeyColumns),
    IncludeColumns: split(r.IncludeColumns),
    IsUnique: !!r.IsUnique,
    IsPrimaryKey: !!r.IsPrimaryKey,
    Method: r.Method,
    FilterDefinition: r.FilterDefinition ?? undefined,
    HasExpressions: false
  }));
}

// ─── MySQL / MariaDB ────────────────────────────────────────────────────────────

/** One row of {@link MYSQL_INDEX_QUERY}: one column of one index. */
export interface MySQLIndexRow {
  SchemaName: string;
  TableName: string;
  IndexName: string;
  NonUnique: number | string;
  Method: string;
  ColumnName: string | null;
  Seq: number;
}

/**
 * Index columns of schema `?`, one row each. `EXPRESSION` is deliberately not selected
 * (MariaDB lacks it); a functional key part shows up as a NULL column name.
 */
export const MYSQL_INDEX_QUERY = `
  SELECT
    TABLE_SCHEMA AS SchemaName,
    TABLE_NAME AS TableName,
    INDEX_NAME AS IndexName,
    NON_UNIQUE AS NonUnique,
    INDEX_TYPE AS Method,
    COLUMN_NAME AS ColumnName,
    SEQ_IN_INDEX AS Seq
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

export function MapMySQLIndexRows(rows: MySQLIndexRow[]): AutoDocIndex[] {
  const byIndex = new Map<string, AutoDocIndex>();
  for (const r of [...rows].sort((a, b) => Number(a.Seq) - Number(b.Seq))) {
    const key = `${r.TableName}\u0000${r.IndexName}`;
    let index = byIndex.get(key);
    if (!index) {
      index = {
        SchemaName: r.SchemaName,
        TableName: r.TableName,
        IndexName: r.IndexName,
        Columns: [],
        IncludeColumns: [],
        IsUnique: Number(r.NonUnique) === 0,
        IsPrimaryKey: r.IndexName === 'PRIMARY',
        Method: r.Method,
        HasExpressions: false
      };
      byIndex.set(key, index);
    }
    // A functional key part has no column name; keep its position so the leading column stays correct.
    if (r.ColumnName === null) {
      index.HasExpressions = true;
    }
    index.Columns.push(r.ColumnName ?? AUTODOC_EXPRESSION_KEY_PART);
  }
  return [...byIndex.values()];
}
