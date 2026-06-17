// snowflake-sdk is an OPTIONAL PEER dependency (CLAUDE.md rule #8, category 2):
// it transitively pulls @aws-sdk, which we don't want forced into the monorepo
// install. Types come from @types/snowflake-sdk at build time; the runtime module
// is loaded via dynamic import() only when this driver is actually used.
import type { Connection, ConnectionOptions, Binds } from 'snowflake-sdk';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import {
  BaseExternalDataSourceDriver,
  ExternalConnectionTestResult,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
  ExternalObjectType,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from '@memberjunction/external-data-sources';

type SnowflakeBind = string | number | boolean | Date | null;

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface SnowflakeConnectionConfig {
  /** Account identifier (e.g. 'xy12345.us-east-1'). Required. */
  account?: string;
  warehouse?: string;
  role?: string;
  region?: string;
  /** Override authenticator (e.g. 'SNOWFLAKE_JWT' for key-pair). Inferred when a privateKey credential is present. */
  authenticator?: string;
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
 * the callback-based SDK is promisified. One connection per `ExternalDataSource.ID`.
 *
 * Supports password or key-pair (SNOWFLAKE_JWT) auth depending on the resolved
 * credential. Registered as `SnowflakeExternalDriver`.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'SnowflakeExternalDriver')
export class SnowflakeExternalDataSourceDriver extends BaseExternalDataSourceDriver<Connection> {
  private connections = new Map<string, Connection>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<Connection> {
    const existing = this.connections.get(dataSource.ID);
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

    // snowflake-sdk is CommonJS; under ESM dynamic import its exports live on `.default`.
    const sdkModule = await import('snowflake-sdk');
    const sdk = sdkModule.default ?? sdkModule;
    const connection = sdk.createConnection(options);
    await new Promise<void>((resolve, reject) => {
      connection.connect((err) => (err ? reject(err) : resolve()));
    });
    this.connections.set(dataSource.ID, connection);
    return connection;
  }

  /** Promisified statement execution. */
  private execute<TRow extends ExternalRow = ExternalRow>(conn: Connection, sqlText: string, binds?: SnowflakeBind[]): Promise<TRow[]> {
    return new Promise<TRow[]>((resolve, reject) => {
      conn.execute({
        sqlText,
        // @types/snowflake-sdk types Bind as string|number, narrower than the SDK's
        // runtime (it accepts boolean/Date/null); cast at this boundary.
        binds: binds as unknown as Binds,
        complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as TRow[])),
      });
    });
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const conn = await this.getConnection(dataSource, contextUser);
      await this.execute(conn, 'SELECT 1 AS ok');
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
      const conn = await this.getConnection(dataSource, contextUser);
      const target = this.qualifyObject(dataSource, params.objectName);
      const rows = await this.execute<TRow>(conn, this.buildSelectSql(target, params));
      const totalRowCount = await this.maybeCount(conn, target, params);
      return { success: true, rows, totalRowCount, executionTimeMs: Date.now() - start };
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
    const conn = await this.getConnection(dataSource, contextUser);
    const target = this.qualifyObject(dataSource, objectName);
    const rows = await this.execute<TRow>(conn, `SELECT * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = ? LIMIT 1`, [primaryKey.value]);
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
      const conn = await this.getConnection(dataSource, contextUser);
      const binds = params?.length ? params.map((p) => p.value) : undefined;
      const rows = await this.execute<TRow>(conn, queryText, binds);
      return { success: true, rows, rowCount: rows.length, executionTimeMs: Date.now() - start };
    } catch (e) {
      return { success: false, rows: [], rowCount: 0, errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async IntrospectSchema(
    dataSource: MJExternalDataSourceEntity,
    schemaName: string | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalSchemaDescriptor> {
    const conn = await this.getConnection(dataSource, contextUser);
    const schema = schemaName ?? dataSource.DefaultSchema ?? 'PUBLIC';
    const tables = await this.execute<{ TABLE_NAME: string; TABLE_TYPE: string }>(
      conn,
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [schema],
    );
    const columns = await this.execute<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(
      conn,
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [schema],
    );
    return { database: dataSource.DefaultDatabase ?? undefined, objects: this.assembleSchema(schema, tables, columns) };
  }

  /** Close all cached connections (graceful shutdown). */
  public async Close(): Promise<void> {
    for (const conn of this.connections.values()) {
      await new Promise<void>((resolve) => conn.destroy(() => resolve()));
    }
    this.connections.clear();
  }

  // ---- helpers (mirror the proven PostgreSQL driver) -----------------------

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

  private async maybeCount(conn: Connection, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined;
    }
    const rows = await this.execute<{ CNT: number }>(conn, `SELECT COUNT(*) AS CNT FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`);
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
      list.push({ name: c.COLUMN_NAME, nativeType: c.DATA_TYPE, nullable: c.IS_NULLABLE === 'YES', isPrimaryKey: false });
      columnsByTable.set(c.TABLE_NAME, list);
    }
    return tableRows.map((t) => ({
      name: t.TABLE_NAME,
      objectType: this.mapObjectType(t.TABLE_TYPE),
      schema,
      columns: columnsByTable.get(t.TABLE_NAME) ?? [],
    }));
  }

  protected mapObjectType(tableType: string): ExternalObjectType {
    return tableType.toUpperCase() === 'VIEW' ? 'view' : 'table';
  }

  protected quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

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
