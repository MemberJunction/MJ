import pg from 'pg';
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
interface PostgresConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  /** Enable TLS for the connection. */
  ssl?: boolean;
  /**
   * Whether TLS must present a trusted certificate. Defaults to TRUE (verify the server cert).
   * Set to false only for managed/self-signed dev endpoints that you knowingly accept — doing so
   * disables MITM protection.
   */
  sslRejectUnauthorized?: boolean;
  /**
   * Explicitly accept an UNENCRYPTED connection to a non-local host. Default false → the driver
   * refuses plaintext to a remote host (local hosts are always allowed). Set true only for a
   * known-safe plaintext endpoint (e.g. a private network you trust).
   */
  allowInsecureTransport?: boolean;
  /** Max pool connections (default 5). */
  maxPoolSize?: number;
}

/** Decrypted credential values expected from the Credential Engine. */
interface PostgresCredentialValues extends Record<string, string> {
  username: string;
  password: string;
}

/**
 * PostgreSQL driver for External Data Sources. Read-only, live-proxied access
 * to an external PostgreSQL database via node-postgres (`pg`). One pooled
 * connection per `ExternalDataSource.ID`, lazily created.
 *
 * Registered as `PostgresExternalDriver` — set `ExternalDataSourceType.DriverClass`
 * to that value to use this driver.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'PostgresExternalDriver')
export class PostgresExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<pg.Pool> {
  private pools = new Map<string, pg.Pool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<pg.Pool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<PostgresConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in.
    this.assertSecureTransport({ host: config.host, tlsEnabled: !!config.ssl, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
    const cred = await this.resolveCredential<PostgresCredentialValues>(dataSource, contextUser);
    const pool = new pg.Pool({
      host: config.host,
      port: config.port,
      database: dataSource.DefaultDatabase ?? config.database,
      user: cred?.values.username,
      password: cred?.values.password,
      // Secure by default: verify the server cert unless the config explicitly opts out.
      ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized !== false } : undefined,
      max: config.maxPoolSize ?? 5,
    });
    this.pools.set(dataSource.ID, pool);
    return pool;
  }

  protected async invalidateConnection(dataSourceId: string): Promise<void> {
    const pool = this.pools.get(dataSourceId);
    if (pool) {
      this.pools.delete(dataSourceId);
      try { await pool.end(); } catch { /* best-effort close on the failure path */ }
    }
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const pool = await this.getConnection(dataSource, contextUser);
      await pool.query('SELECT 1');
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
        const sql = this.buildSelectSql(target, params);
        const res = await pool.query(sql);
        const totalRowCount = await this.maybeCount(pool, target, params);
        return { success: true, rows: res.rows as TRow[], totalRowCount, executionTimeMs: Date.now() - start };
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
    const sql = `SELECT * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = $1 LIMIT 1`;
    const res = await pool.query(sql, [primaryKey.value]);
    return (res.rows[0] as TRow) ?? null;
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
        // pg uses positional placeholders ($1..$n); bind values in array order.
        const values = (params ?? []).map((p) => p.value);
        const res = await pool.query(queryText, values);
        return {
          success: true,
          rows: res.rows as TRow[],
          rowCount: res.rowCount ?? res.rows.length,
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
    const schema = schemaName ?? dataSource.DefaultSchema ?? 'public';

    const tables = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [schema],
    );
    const columns = await pool.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns WHERE table_schema = $1
        ORDER BY table_name, ordinal_position`,
      [schema],
    );
    const primaryKeys = await pool.query(
      `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1`,
      [schema],
    );
    // Foreign keys — pair each referencing column with its referenced column via the unique
    // constraint's position, so composite (multi-column) keys map correctly, not just single-column ones.
    const foreignKeys = await pool.query(
      `SELECT rc.constraint_name, kcu.table_name, kcu.column_name,
              kcu2.table_name   AS referenced_table,
              kcu2.table_schema AS referenced_schema,
              kcu2.column_name  AS referenced_column
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
         JOIN information_schema.key_column_usage kcu2
           ON kcu2.constraint_name = rc.unique_constraint_name AND kcu2.constraint_schema = rc.unique_constraint_schema
          AND kcu2.ordinal_position = kcu.position_in_unique_constraint
        WHERE kcu.table_schema = $1
        ORDER BY kcu.table_name, rc.constraint_name, kcu.ordinal_position`,
      [schema],
    );
    return {
      Database: dataSource.DefaultDatabase ?? undefined,
      Objects: this.assembleSchema(schema, tables.rows, columns.rows, primaryKeys.rows, foreignKeys.rows),
    };
  }

  // ---- helpers -------------------------------------------------------------

  /** PostgreSQL paging: ORDER BY + LIMIT/OFFSET. */
  protected orderAndPageClause(params: ExternalViewParams): string {
    let sql = '';
    if (params.orderBy) {
      sql += ` ORDER BY ${params.orderBy}`;
    }
    if (params.maxRows != null) {
      sql += ` LIMIT ${Number(params.maxRows)}`;
    }
    if (params.offset != null) {
      sql += ` OFFSET ${Number(params.offset)}`;
    }
    return sql;
  }

  private async maybeCount(pool: pg.Pool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined; // only pay for the count when paginating
    }
    const sql = `SELECT COUNT(*)::bigint AS cnt FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`;
    const res = await pool.query(sql);
    return Number(res.rows[0]?.cnt ?? 0);
  }

  private assembleSchema(
    schema: string,
    tableRows: Array<{ table_name: string; table_type: string }>,
    columnRows: Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>,
    pkRows: Array<{ table_name: string; column_name: string }>,
    fkRows: Array<{ constraint_name: string; table_name: string; column_name: string; referenced_table: string; referenced_schema: string; referenced_column: string }>,
  ): ExternalSchemaObject[] {
    const pkSet = new Set(pkRows.map((r) => `${r.table_name}.${r.column_name}`));
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.table_name) ?? [];
      list.push({
        Name: c.column_name,
        NativeType: c.data_type,
        Nullable: c.is_nullable === 'YES',
        IsPrimaryKey: pkSet.has(`${c.table_name}.${c.column_name}`),
      });
      columnsByTable.set(c.table_name, list);
    }
    const relationshipsByTable = this.groupForeignKeys(fkRows);
    return tableRows.map((t) => ({
      Name: t.table_name,
      ObjectType: this.mapObjectType(t.table_type),
      Schema: schema,
      Columns: columnsByTable.get(t.table_name) ?? [],
      Relationships: relationshipsByTable.get(t.table_name) ?? [],
    }));
  }

  /** Quote a SQL identifier, escaping embedded double-quotes. */
  protected quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}
