import type { EntityInfo } from '@memberjunction/core';
import sql from 'mssql';
import { TruthCsv, type SqlCell } from './csv';

export interface TableColumnSpec {
  Name: string;
  SqlType: string;
  IsNullable?: boolean;
}

/** Rows as text cells under a header: a parsed CSV, or a test's row source. */
export interface TextRows {
  Header: string[];
  Rows: string[][];
}

/** Parameterised bulk-insert and direct-SQL opt-in verification for `pstruth.*` tables. */
export class BulkLoader {
  private static readonly batchSize = 50_000;

  private static bareTable(table: string): string {
    return table.startsWith('pstruth.') ? table.slice('pstruth.'.length) : table;
  }

  /** Verify the entity sanctions direct-SQL inserts and deletes; throws naming `truth:provision` otherwise. */
  public static AssertDirectSqlOptIn(entity: EntityInfo): void {
    if (!entity.AllowDirectSQLInsert || !entity.AllowDirectSQLDelete) {
      throw new Error(
        `Direct SQL is not sanctioned on pstruth.${entity.BaseTable} (AllowDirectSQLInsert/AllowDirectSQLDelete is false). Run 'pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:provision' first.`,
      );
    }
  }

  /** Read ordered non-system column definitions of `pstruth.<table>` from `sys.columns`. */
  public static async ReadTableColumns(pool: sql.ConnectionPool, table: string): Promise<TableColumnSpec[]> {
    const bare = BulkLoader.bareTable(table);
    const res = await pool
      .request()
      .input('qualified', sql.NVarChar(200), `pstruth.${bare}`)
      .query<{ Name: string; SqlType: string; IsNullable: boolean }>(`
        SELECT c.name AS Name,
               CASE
                 WHEN UPPER(t.name) = 'NVARCHAR' THEN
                   'NVARCHAR(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / 2 AS VARCHAR(10)) END + ')'
                 ELSE UPPER(t.name)
               END AS SqlType,
               c.is_nullable AS IsNullable
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(@qualified)
          AND c.name NOT LIKE '[_][_]mj[_]%'
        ORDER BY c.column_id
      `);
    if (res.recordset.length === 0) {
      throw new Error(`Table pstruth.${bare} not found in sys.columns`);
    }
    return res.recordset;
  }

  private static toMssqlType(sqlType: string): sql.ISqlType | (() => sql.ISqlType) {
    const upper = sqlType.toUpperCase();
    if (upper === 'UNIQUEIDENTIFIER') return sql.UniqueIdentifier;
    if (upper === 'INT') return sql.Int;
    if (upper === 'FLOAT') return sql.Float;
    if (upper === 'BIT') return sql.Bit;
    if (upper === 'DATE') return sql.Date;
    const nv = /^NVARCHAR\((\d+|MAX)\)$/.exec(upper);
    if (nv) {
      return nv[1] === 'MAX' ? sql.NVarChar(sql.MAX) : sql.NVarChar(Number(nv[1]));
    }
    throw new Error(`Unsupported SQL type in BulkLoader: '${sqlType}'`);
  }

  /**
   * Match text rows to the table's columns (the header must be an ordered subset of them) and coerce every cell to its
   * column's type. Returns the active columns in header order and the coerced rows.
   */
  public static CoerceRows(
    table: string,
    rows: TextRows,
    tableColumns: ReadonlyArray<TableColumnSpec>,
  ): { Columns: TableColumnSpec[]; Rows: SqlCell[][] } {
    TruthCsv.AssertHeaderOrder(rows.Header, tableColumns.map((c) => c.Name));
    const colByName = new Map(tableColumns.map((c) => [c.Name, c]));
    const columns = rows.Header.map((name) => {
      const col = colByName.get(name);
      if (!col) throw new Error(`Unknown column '${name}' on pstruth.${BulkLoader.bareTable(table)}`);
      return col;
    });
    return {
      Columns: columns,
      Rows: rows.Rows.map((row) => columns.map((col, idx) => TruthCsv.CoerceCell(row[idx] ?? '', col.SqlType))),
    };
  }

  /**
   * Bulk-insert `rows` into `pstruth.<table>` inside `tx`, in 50,000-row batches, after checking the column order.
   * Returns the number of rows the inserts reported.
   */
  public static async Insert(
    tx: sql.Transaction,
    table: string,
    columns: ReadonlyArray<TableColumnSpec>,
    rows: ReadonlyArray<ReadonlyArray<SqlCell>>,
    tableColumns: ReadonlyArray<TableColumnSpec>,
  ): Promise<number> {
    const bare = BulkLoader.bareTable(table);
    TruthCsv.AssertHeaderOrder(
      columns.map((c) => c.Name),
      tableColumns.map((c) => c.Name),
    );
    const tableColByName = new Map(tableColumns.map((c) => [c.Name, c]));
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += BulkLoader.batchSize) {
      const batch = rows.slice(offset, offset + BulkLoader.batchSize);
      const sqlTable = new sql.Table(`pstruth.${bare}`);
      sqlTable.create = false;
      for (const col of columns) {
        const tableCol = tableColByName.get(col.Name);
        sqlTable.columns.add(col.Name, BulkLoader.toMssqlType(col.SqlType), {
          nullable: tableCol?.IsNullable ?? col.IsNullable ?? true,
        });
      }
      for (const row of batch) {
        sqlTable.rows.add(...row);
      }
      const res = await new sql.Request(tx).bulk(sqlTable);
      inserted += res.rowsAffected;
    }
    return inserted;
  }
}
