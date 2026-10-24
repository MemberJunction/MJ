import sql from 'mssql';

/** Where a stamp is read or written: the pool, or an open transaction (a load stamps inside its own transaction). */
export type StampConnection = sql.ConnectionPool | sql.Transaction;

/** Extended-property dataset stamps (`pstruth_dataset`) on `pstruth.*` tables. */
export class DatasetStamp {
  private static readonly propName = 'pstruth_dataset';

  private static bareTable(table: string): string {
    return table.startsWith('pstruth.') ? table.slice('pstruth.'.length) : table;
  }

  private static request(conn: StampConnection): sql.Request {
    return conn.request(); // a pool and a transaction both create their own requests
  }

  /** Read the current `pstruth_dataset` stamp on `pstruth.<table>`, or null if none is set. */
  public static async Read(conn: StampConnection, table: string): Promise<string | null> {
    const bare = DatasetStamp.bareTable(table);
    const res = await DatasetStamp.request(conn)
      .input('qualified', sql.NVarChar(200), `pstruth.${bare}`)
      .input('propName', sql.NVarChar(128), DatasetStamp.propName)
      .query<{ val: string | null }>(
        'SELECT CAST(value AS NVARCHAR(400)) AS val FROM sys.extended_properties WHERE major_id = OBJECT_ID(@qualified) AND minor_id = 0 AND name = @propName',
      );
    return res.recordset[0]?.val ?? null;
  }

  /** Write or update the `pstruth_dataset` extended property on `pstruth.<table>`. */
  public static async Write(conn: StampConnection, table: string, value: string): Promise<void> {
    const bare = DatasetStamp.bareTable(table);
    const existing = await DatasetStamp.Read(conn, bare);
    const proc = existing === null ? 'sys.sp_addextendedproperty' : 'sys.sp_updateextendedproperty';
    await DatasetStamp.request(conn)
      .input('name', sql.NVarChar(128), DatasetStamp.propName)
      .input('value', sql.NVarChar(400), value)
      .input('level0type', sql.VarChar(20), 'SCHEMA')
      .input('level0name', sql.NVarChar(128), 'pstruth')
      .input('level1type', sql.VarChar(20), 'TABLE')
      .input('level1name', sql.NVarChar(128), bare)
      .execute(proc);
  }
}
