import sql from 'mssql';
import { RegisterClass } from "@memberjunction/global";
import {
  UserInfo,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
} from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import {
  BaseExternalDataSourceDriver,
  BaseSqlExternalDataSourceDriver,
  ExternalConnectionTestResult,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from "@memberjunction/external-data-sources";

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface SQLServerConnectionConfig {
  /** Server host (accepts `server` or `host`). */
  server?: string;
  host?: string;
  port?: number;
  database?: string;
  /** Named instance (e.g. 'SQLEXPRESS'); mutually exclusive with an explicit port on most setups. */
  instanceName?: string;
  /** Enable TLS encryption for the connection. */
  ssl?: boolean;
  /**
   * Whether TLS must present a trusted certificate. Defaults to TRUE (verify the server cert).
   * Set to false only for managed/self-signed dev endpoints that you knowingly accept — doing so
   * disables MITM protection. Maps to mssql `trustServerCertificate`.
   */
  sslRejectUnauthorized?: boolean;
  /**
   * Explicitly accept an UNENCRYPTED connection to a non-local host. Default false → the driver
   * refuses plaintext to a remote host (local hosts are always allowed).
   */
  allowInsecureTransport?: boolean;
  /** Max pool connections (default 5). */
  maxPoolSize?: number;
}

/** Decrypted credential values expected from the Credential Engine. */
interface SQLServerCredentialValues extends Record<string, string> {
  username: string;
  password: string;
}

/**
 * SQL Server driver for External Data Sources. Read-only, live-proxied access
 * to an external Microsoft SQL Server database via node-mssql (`mssql`). One pooled
 * connection per `ExternalDataSource.ID`, lazily created. Mirrors the proven
 * PostgreSQL driver with T-SQL dialect specifics (bracket-quoted identifiers,
 * `TOP`/`OFFSET..FETCH` paging, `@named` parameters, `sys.*` FK introspection).
 *
 * Registered as `SQLServerExternalDriver` — set `ExternalDataSourceType.DriverClass`
 * to that value to use this driver.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'SQLServerExternalDriver')
export class SQLServerExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<sql.ConnectionPool> {
  private pools = new Map<string, sql.ConnectionPool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<sql.ConnectionPool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<SQLServerConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in.
    this.assertSecureTransport({ host: config.server ?? config.host, tlsEnabled: !!config.ssl, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
    const cred = await this.resolveCredential<SQLServerCredentialValues>(dataSource, contextUser);
    const pool = await new sql.ConnectionPool({
      server: config.server ?? config.host ?? 'localhost',
      port: config.port,
      database: dataSource.DefaultDatabase ?? config.database,
      user: cred?.values.username,
      password: cred?.values.password,
      options: {
        encrypt: !!config.ssl,
        // Secure by default: verify the server cert unless the config explicitly opts out.
        trustServerCertificate: config.sslRejectUnauthorized === false,
        ...(config.instanceName ? { instanceName: config.instanceName } : {}),
      },
      pool: { max: config.maxPoolSize ?? 5 },
    }).connect();
    this.pools.set(dataSource.ID, pool);
    return pool;
  }

  protected async invalidateConnection(dataSourceId: string): Promise<void> {
    const pool = this.pools.get(dataSourceId);
    if (pool) {
      this.pools.delete(dataSourceId);
      try { await pool.close(); } catch { /* best-effort close on the failure path */ }
    }
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const pool = await this.getConnection(dataSource, contextUser);
      await pool.request().query('SELECT 1');
      return { success: true, message: 'Connection successful.', testedAt: new Date(), latencyMs: Date.now() - start };
    } catch (e) {
      return { success: false, message: this.errorText(e), testedAt: new Date(), latencyMs: Date.now() - start };
    }
  }

  public async RunView<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    params: ExternalViewParams,
    contextUser?: UserInfo,
  ): Promise<ExternalViewResult<TRow>> {
    const start = Date.now();
    try {
      return await this.withConnectionRetry(dataSource, async () => {
        const pool = await this.getConnection(dataSource, contextUser);
        const target = this.qualifyObject(dataSource, params.objectName);
        const sqlText = this.buildSelectSql(target, params);
        const res = await pool.request().query(sqlText);
        const totalRowCount = await this.maybeCount(pool, target, params);
        return { success: true, rows: res.recordset as unknown as TRow[], totalRowCount, executionTimeMs: Date.now() - start };
      });
    } catch (e) {
      return { success: false, rows: [], errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async LoadSingle<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    objectName: string,
    primaryKey: ExternalQueryParameter,
    contextUser?: UserInfo,
  ): Promise<TRow | null> {
    const pool = await this.getConnection(dataSource, contextUser);
    const target = this.qualifyObject(dataSource, objectName);
    const res = await pool.request()
      .input('pk', primaryKey.value)
      .query(`SELECT TOP (1) * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = @pk`);
    return (res.recordset[0] as unknown as TRow) ?? null;
  }

  public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    queryText: string,
    params: ExternalQueryParameter[] | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalQueryResult<TRow>> {
    const start = Date.now();
    try {
      return await this.withConnectionRetry(dataSource, async () => {
        const pool = await this.getConnection(dataSource, contextUser);
        // mssql binds by name (@name); callers reference parameters by their declared name.
        const req = pool.request();
        for (const p of params ?? []) {
          req.input(p.name, p.value);
        }
        const res = await req.query(queryText);
        const rows = (res.recordset as unknown as TRow[]) ?? [];
        return {
          success: true,
          rows,
          rowCount: res.recordset?.length ?? (res.rowsAffected?.[0] ?? 0),
          executionTimeMs: Date.now() - start,
        };
      });
    } catch (e) {
      return { success: false, rows: [], rowCount: 0, errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async IntrospectSchema(
    dataSource: MJExternalDataSourceEntity,
    schemaName: string | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalSchemaDescriptor> {
    const pool = await this.getConnection(dataSource, contextUser);
    const schema = schemaName ?? dataSource.DefaultSchema ?? 'dbo';

    const tables = await pool.request().input('schema', schema).query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema ORDER BY TABLE_NAME`);
    const columns = await pool.request().input('schema', schema).query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema
        ORDER BY TABLE_NAME, ORDINAL_POSITION`);
    const primaryKeys = await pool.request().input('schema', schema).query(
      `SELECT tc.TABLE_NAME, kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = @schema`);
    // Foreign keys via sys.* — each sys.foreign_key_columns row already pairs a referencing column
    // with its referenced column (ordered by constraint_column_id), so composite keys map correctly.
    const foreignKeys = await pool.request().input('schema', schema).query(
      `SELECT fk.name AS constraint_name, tp.name AS table_name, cp.name AS column_name,
              tr.name AS referenced_table, sr.name AS referenced_schema, cr.name AS referenced_column
         FROM sys.foreign_keys fk
         JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
         JOIN sys.tables tp  ON tp.object_id = fkc.parent_object_id
         JOIN sys.schemas sp ON sp.schema_id = tp.schema_id
         JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
         JOIN sys.tables tr  ON tr.object_id = fkc.referenced_object_id
         JOIN sys.schemas sr ON sr.schema_id = tr.schema_id
         JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
        WHERE sp.name = @schema
        ORDER BY tp.name, fk.name, fkc.constraint_column_id`);

    return {
      Database: dataSource.DefaultDatabase ?? undefined,
      Objects: this.assembleSchema(schema, tables.recordset, columns.recordset, primaryKeys.recordset, foreignKeys.recordset),
    };
  }

  // ---- helpers (mirror the proven PostgreSQL driver, T-SQL dialect) --------

  /** T-SQL row cap: `TOP (n)` is valid only for a non-paginated bound; paging uses OFFSET..FETCH. */
  protected selectTopClause(params: ExternalViewParams): string {
    return params.maxRows != null && params.offset == null ? `TOP (${Number(params.maxRows)}) ` : '';
  }

  /** T-SQL paging: OFFSET..FETCH (requires ORDER BY) when offsetting, else a plain ORDER BY. */
  protected orderAndPageClause(params: ExternalViewParams): string {
    let sql = '';
    if (params.offset != null) {
      // T-SQL OFFSET/FETCH requires ORDER BY. The external read router defaults orderBy to the
      // entity's introspected primary key for paginated reads (so page order is deterministic);
      // (SELECT NULL) remains only as a last resort for a PK-less object, where no stable order
      // is possible anyway.
      sql += ` ORDER BY ${params.orderBy ? params.orderBy : '(SELECT NULL)'} OFFSET ${Number(params.offset)} ROWS`;
      if (params.maxRows != null) {
        sql += ` FETCH NEXT ${Number(params.maxRows)} ROWS ONLY`;
      }
    } else if (params.orderBy) {
      sql += ` ORDER BY ${params.orderBy}`;
    }
    return sql;
  }

  private async maybeCount(pool: sql.ConnectionPool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined; // only pay for the count when paginating
    }
    const res = await pool.request().query(`SELECT COUNT(*) AS cnt FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`);
    return Number(res.recordset[0]?.cnt ?? 0);
  }

  private assembleSchema(
    schema: string,
    tableRows: Array<{ TABLE_NAME: string; TABLE_TYPE: string }>,
    columnRows: Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>,
    pkRows: Array<{ TABLE_NAME: string; COLUMN_NAME: string }>,
    fkRows: Array<{ constraint_name: string; table_name: string; column_name: string; referenced_table: string; referenced_schema: string; referenced_column: string }>,
  ): ExternalSchemaObject[] {
    const pkSet = new Set(pkRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.TABLE_NAME) ?? [];
      list.push({
        Name: c.COLUMN_NAME,
        NativeType: c.DATA_TYPE,
        Nullable: c.IS_NULLABLE === 'YES',
        IsPrimaryKey: pkSet.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`),
      });
      columnsByTable.set(c.TABLE_NAME, list);
    }
    const relationshipsByTable = this.groupForeignKeys(fkRows);
    return tableRows.map((t) => ({
      Name: t.TABLE_NAME,
      ObjectType: this.mapObjectType(t.TABLE_TYPE),
      Schema: schema,
      Columns: columnsByTable.get(t.TABLE_NAME) ?? [],
      Relationships: relationshipsByTable.get(t.TABLE_NAME) ?? [],
    }));
  }

  /** Quote a SQL identifier with T-SQL brackets, escaping embedded `]`. */
  protected quoteIdent(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
  }
}
