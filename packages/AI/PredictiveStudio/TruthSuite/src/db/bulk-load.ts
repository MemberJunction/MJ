import { readFileSync } from 'node:fs';
import sql from 'mssql';
import { TruthCsv, type SqlCell } from './csv';

export interface TableColumnSpec {
  Name: string;
  SqlType: string;
  IsNullable?: boolean;
}

/** Parameterised bulk-insert and direct-SQL opt-in verification for `pstruth.*` tables. */
export class BulkLoader {
  private static readonly batchSize = 50_000;

  private static bareTable(table: string): string {
    return table.startsWith('pstruth.') ? table.slice('pstruth.'.length) : table;
  }

  /** Verify the `pstruth.<table>` entity has `AllowDirectSQLInsert=1` and `AllowDirectSQLDelete=1`; throws naming `truth:provision` otherwise. */
  public static async AssertDirectSqlOptIn(pool: sql.ConnectionPool, table: string): Promise<void> {
    const bare = BulkLoader.bareTable(table);
    const res = await pool
      .request()
      .input('table', sql.NVarChar(128), bare)
      .query<{ AllowDirectSQLInsert: boolean; AllowDirectSQLDelete: boolean }>(
        "SELECT AllowDirectSQLInsert, AllowDirectSQLDelete FROM __mj.Entity WHERE SchemaName = 'pstruth' AND BaseTable = @table",
      );
    const row = res.recordset[0];
    if (!row || !row.AllowDirectSQLInsert || !row.AllowDirectSQLDelete) {
      throw new Error(
        `Direct SQL is not sanctioned on pstruth.${bare} (AllowDirectSQLInsert/AllowDirectSQLDelete missing or 0). Run 'pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:provision' first.`,
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
          AND c.name NOT LIKE '__mj_%'
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

  /** Bulk-insert `rows` into `pstruth.<table>` in 50,000-row batches after checking column order and direct-SQL opt-in. */
  public static async Insert(
    pool: sql.ConnectionPool,
    table: string,
    columns: ReadonlyArray<TableColumnSpec>,
    rows: ReadonlyArray<ReadonlyArray<SqlCell>>,
    preloadedTableColumns?: ReadonlyArray<TableColumnSpec>,
    tx?: sql.Transaction,
  ): Promise<void> {
    const bare = BulkLoader.bareTable(table);
    const tableColumns = preloadedTableColumns ?? (await (async (): Promise<TableColumnSpec[]> => {
      await BulkLoader.AssertDirectSqlOptIn(pool, bare);
      return BulkLoader.ReadTableColumns(pool, bare);
    })());
    TruthCsv.AssertHeaderOrder(
      columns.map((c) => c.Name),
      tableColumns.map((c) => c.Name),
    );
    if (rows.length === 0) return;

    const tableColByName = new Map(tableColumns.map((c) => [c.Name, c]));
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
      const req = tx ? new sql.Request(tx) : pool.request();
      await req.bulk(sqlTable);
    }
  }

  /** Parse a CSV file (refusing truth files), coerce cells against `sys.columns`, and bulk-insert into `pstruth.<table>`. */
  public static async LoadCsvFile(
    pool: sql.ConnectionPool,
    table: string,
    csvPath: string,
    tx?: sql.Transaction,
  ): Promise<number> {
    TruthCsv.AssertNotTruthFile(csvPath);
    const bare = BulkLoader.bareTable(table);
    await BulkLoader.AssertDirectSqlOptIn(pool, bare);
    const tableCols = await BulkLoader.ReadTableColumns(pool, bare);
    const parsed = TruthCsv.Parse(readFileSync(csvPath, 'utf8'));
    TruthCsv.AssertHeaderOrder(
      parsed.Header,
      tableCols.map((c) => c.Name),
    );
    const colByName = new Map(tableCols.map((c) => [c.Name, c]));
    const activeCols: TableColumnSpec[] = parsed.Header.map((name) => {
      const col = colByName.get(name);
      if (!col) throw new Error(`Unknown column '${name}' on pstruth.${bare}`);
      return col;
    });
    const coercedRows: SqlCell[][] = parsed.Rows.map((row) =>
      activeCols.map((col, idx) => TruthCsv.CoerceCell(row[idx] ?? '', col.SqlType)),
    );
    await BulkLoader.Insert(pool, bare, activeCols, coercedRows, tableCols, tx);
    return coercedRows.length;
  }
}
