import pg from 'pg';
import { RegisterClass } from "@memberjunction/global";
import {
  UserInfo,
  ExternalObjectType,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
} from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import {
  BaseExternalDataSourceDriver,
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
  /** Enable TLS (rejectUnauthorized:false — appropriate for managed/self-signed dev endpoints). */
  ssl?: boolean;
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
export class PostgresExternalDataSourceDriver extends BaseExternalDataSourceDriver<pg.Pool> {
  private pools = new Map<string, pg.Pool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<pg.Pool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<PostgresConnectionConfig>(dataSource);
    const cred = await this.resolveCredential<PostgresCredentialValues>(dataSource, contextUser);
    const pool = new pg.Pool({
      host: config.host,
      port: config.port,
      database: dataSource.DefaultDatabase ?? config.database,
      user: cred?.values.username,
      password: cred?.values.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
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
    return { database: dataSource.DefaultDatabase ?? undefined, objects: this.assembleSchema(schema, tables.rows, columns.rows, primaryKeys.rows) };
  }

  // ---- helpers -------------------------------------------------------------

  protected buildSelectSql(target: string, params: ExternalViewParams): string {
    const projection = params.fields?.length ? params.fields.map((f) => this.quoteIdent(f)).join(', ') : '*';
    let sql = `SELECT ${projection} FROM ${target}`;
    if (params.filter) {
      sql += ` WHERE ${params.filter}`; // trusted dialect filter, same contract as MJ RunView ExtraFilter
    }
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
  ): ExternalSchemaObject[] {
    const pkSet = new Set(pkRows.map((r) => `${r.table_name}.${r.column_name}`));
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.table_name) ?? [];
      list.push({
        name: c.column_name,
        nativeType: c.data_type,
        nullable: c.is_nullable === 'YES',
        isPrimaryKey: pkSet.has(`${c.table_name}.${c.column_name}`),
      });
      columnsByTable.set(c.table_name, list);
    }
    return tableRows.map((t) => ({
      name: t.table_name,
      objectType: this.mapObjectType(t.table_type),
      schema,
      columns: columnsByTable.get(t.table_name) ?? [],
    }));
  }

  protected mapObjectType(tableType: string): ExternalObjectType {
    return tableType === 'VIEW' ? 'view' : 'table';
  }

  /** Quote a SQL identifier, escaping embedded double-quotes. */
  protected quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /** Resolve an object name to a quoted, schema-qualified reference. */
  protected qualifyObject(dataSource: MJExternalDataSourceEntity, objectName: string): string {
    if (objectName.includes('.')) {
      return objectName.split('.').map((p) => this.quoteIdent(p)).join('.');
    }
    if (dataSource.DefaultSchema) {
      return `${this.quoteIdent(dataSource.DefaultSchema)}.${this.quoteIdent(objectName)}`;
    }
    return this.quoteIdent(objectName);
  }

  private errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
