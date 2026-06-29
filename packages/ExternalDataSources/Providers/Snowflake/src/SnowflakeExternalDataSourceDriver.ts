// snowflake-sdk is an OPTIONAL PEER dependency (CLAUDE.md rule #8, category 2):
// it transitively pulls @aws-sdk, which we don't want forced into the monorepo
// install. Types come from @types/snowflake-sdk at build time; the runtime module
// is loaded via dynamic import() only when this driver is actually used.
import type { ConnectionOptions, Binds, createPool } from 'snowflake-sdk';
import { RegisterClass } from '@memberjunction/global';
import {
  UserInfo,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
} from '@memberjunction/core';
import { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import {
  BaseExternalDataSourceDriver,
  BaseSqlExternalDataSourceDriver,
  ExternalConnectionTestResult,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from '@memberjunction/external-data-sources';

type SnowflakeBind = string | number | boolean | Date | null;

/**
 * The snowflake-sdk connection pool type (generic-pool `Pool<Connection>`), derived from `createPool`'s
 * return type so we don't have to import `generic-pool` (a transitive dep) directly.
 */
type SnowflakePool = ReturnType<typeof createPool>;

/**
 * Memoized loader for the optional `snowflake-sdk` peer dependency (CLAUDE.md rule #8, category 2).
 * Cached behind a single module-level promise so the dynamic import resolves once per process rather
 * than on every connection open.
 */
let snowflakeSdkPromise: Promise<typeof import('snowflake-sdk')> | undefined;
function loadSnowflakeSdk(): Promise<typeof import('snowflake-sdk')> {
  if (!snowflakeSdkPromise) {
    snowflakeSdkPromise = import('snowflake-sdk');
  }
  return snowflakeSdkPromise;
}

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface SnowflakeConnectionConfig {
  /** Account identifier (e.g. 'xy12345.us-east-1'). Required. */
  account?: string;
  warehouse?: string;
  role?: string;
  region?: string;
  /** Override authenticator (e.g. 'SNOWFLAKE_JWT' for key-pair). Inferred when a privateKey credential is present. */
  authenticator?: string;
  /** Max pooled connections per data source (default 5). */
  maxPoolSize?: number;
}

/** Decrypted credential values; password, programmatic access token (PAT/OAuth), or key-pair auth. */
interface SnowflakeCredentialValues extends Record<string, string> {
  username: string;
  password: string;
  token: string;
  privateKey: string;
  privateKeyPass: string;
}

/**
 * Snowflake driver for External Data Sources. Read-only, live-proxied access to a
 * Snowflake account via the official `snowflake-sdk`. Structurally mirrors the
 * PostgreSQL driver (ANSI SQL, LIMIT/OFFSET paging, double-quoted identifiers);
 * the callback-based SDK is promisified. A connection pool (generic-pool, via
 * `snowflake-sdk.createPool`) per `ExternalDataSource.ID`, so concurrent reads don't
 * serialize behind a single shared connection.
 *
 * Supports password or key-pair (SNOWFLAKE_JWT) auth depending on the resolved
 * credential. Registered as `SnowflakeExternalDriver`.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'SnowflakeExternalDriver')
export class SnowflakeExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<SnowflakePool> {
  private pools = new Map<string, SnowflakePool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<SnowflakePool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<SnowflakeConnectionConfig>(dataSource);
    if (!config.account) {
      throw new Error(`ExternalDataSource '${dataSource.Name}' ConnectionConfig must include 'account'.`);
    }
    const cred = await this.resolveCredential<SnowflakeCredentialValues>(dataSource, contextUser);
    const options: ConnectionOptions = {
      account: config.account,
      username: cred?.values.username ?? '',
      database: dataSource.DefaultDatabase ?? undefined,
      schema: dataSource.DefaultSchema ?? undefined,
      warehouse: config.warehouse,
      role: config.role,
      region: config.region,
    };
    if (cred?.values.privateKey) {
      options.authenticator = config.authenticator ?? 'SNOWFLAKE_JWT';
      options.privateKey = cred.values.privateKey;
      if (cred.values.privateKeyPass) {
        options.privateKeyPass = cred.values.privateKeyPass;
      }
    } else if (config.authenticator === 'PROGRAMMATIC_ACCESS_TOKEN' || config.authenticator === 'OAUTH') {
      // Programmatic Access Token (PAT) / OAuth: the token is the credential secret,
      // stored as `token` (or, for convenience, in the `password` field).
      options.authenticator = config.authenticator;
      options.token = cred?.values.token || cred?.values.password;
    } else {
      options.password = cred?.values.password;
    }

    // snowflake-sdk is CommonJS; under ESM dynamic import its exports may live on `.default`. The
    // synthetic default isn't present on the `typeof import()` type query, so widen structurally to
    // read it when present (interop), else fall back to the namespace itself.
    const sdkModule = await loadSnowflakeSdk();
    const sdk = (sdkModule as typeof sdkModule & { default?: typeof sdkModule }).default ?? sdkModule;
    // generic-pool: connections are created lazily on first use and reused across concurrent queries,
    // so distinct concurrent reads no longer serialize behind a single cached connection.
    const pool = sdk.createPool(options, { max: config.maxPoolSize ?? 5, min: 0 });
    this.pools.set(dataSource.ID, pool);
    return pool;
  }

  protected async invalidateConnection(dataSourceId: string): Promise<void> {
    const pool = this.pools.get(dataSourceId);
    if (pool) {
      this.pools.delete(dataSourceId);
      try { await pool.drain(); await pool.clear(); } catch { /* best-effort close on the failure path */ }
    }
  }

  /** Promisified statement execution against a pooled connection (acquired for the call, then released). */
  private execute<TRow extends ExternalRow = ExternalRow>(pool: SnowflakePool, sqlText: string, binds?: SnowflakeBind[]): Promise<TRow[]> {
    return pool.use((conn) => new Promise<TRow[]>((resolve, reject) => {
      conn.execute({
        sqlText,
        // @types/snowflake-sdk types Bind as string|number, narrower than the SDK's
        // runtime (it accepts boolean/Date/null); cast at this boundary.
        binds: binds as unknown as Binds,
        complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as TRow[])),
      });
    }));
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const pool = await this.getConnection(dataSource, contextUser);
      await this.execute(pool, 'SELECT 1 AS ok');
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
        const rows = await this.execute<TRow>(pool, this.buildSelectSql(target, params));
        const totalRowCount = await this.maybeCount(pool, target, params);
        return { success: true, rows, totalRowCount, executionTimeMs: Date.now() - start };
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
    const rows = await this.execute<TRow>(pool, `SELECT * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = ? LIMIT 1`, [primaryKey.value]);
    return rows[0] ?? null;
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
        const binds = params?.length ? params.map((p) => p.value) : undefined;
        const rows = await this.execute<TRow>(pool, queryText, binds);
        return { success: true, rows, rowCount: rows.length, executionTimeMs: Date.now() - start };
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
    const schema = schemaName ?? dataSource.DefaultSchema ?? 'PUBLIC';
    const tables = await this.execute<{ TABLE_NAME: string; TABLE_TYPE: string }>(
      pool,
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [schema],
    );
    const columns = await this.execute<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(
      pool,
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [schema],
    );
    return { Database: dataSource.DefaultDatabase ?? undefined, Objects: this.assembleSchema(schema, tables, columns) };
  }

  /** Drain + clear all cached pools (graceful shutdown). */
  public async Close(): Promise<void> {
    for (const pool of this.pools.values()) {
      try { await pool.drain(); await pool.clear(); } catch { /* best-effort close */ }
    }
    this.pools.clear();
  }

  // ---- helpers (mirror the proven PostgreSQL driver) -----------------------

  /** Snowflake paging: ANSI ORDER BY + LIMIT/OFFSET. */
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

  private async maybeCount(pool: SnowflakePool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined;
    }
    const rows = await this.execute<{ CNT: number }>(pool, `SELECT COUNT(*) AS CNT FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`);
    return Number(rows[0]?.CNT ?? 0);
  }

  private assembleSchema(
    schema: string,
    tableRows: Array<{ TABLE_NAME: string; TABLE_TYPE: string }>,
    columnRows: Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>,
  ): ExternalSchemaObject[] {
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.TABLE_NAME) ?? [];
      // Snowflake INFORMATION_SCHEMA does not reliably expose primary keys; left false (introspection limitation).
      list.push({ Name: c.COLUMN_NAME, NativeType: c.DATA_TYPE, Nullable: c.IS_NULLABLE === 'YES', IsPrimaryKey: false });
      columnsByTable.set(c.TABLE_NAME, list);
    }
    return tableRows.map((t) => ({
      Name: t.TABLE_NAME,
      ObjectType: this.mapObjectType(t.TABLE_TYPE),
      Schema: schema,
      Columns: columnsByTable.get(t.TABLE_NAME) ?? [],
    }));
  }

  protected quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}
