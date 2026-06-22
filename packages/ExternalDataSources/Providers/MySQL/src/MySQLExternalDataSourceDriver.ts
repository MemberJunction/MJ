import mysql from 'mysql2/promise';
import { RegisterClass } from "@memberjunction/global";
import {
  UserInfo,
  ExternalObjectType,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
  ExternalSchemaRelationship,
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
interface MySQLConnectionConfig {
  host?: string;
  port?: number;
  /** MySQL has no schema-within-database; the "schema" IS the database. */
  database?: string;
  /** Enable TLS for the connection. */
  ssl?: boolean;
  /**
   * Whether TLS must present a trusted certificate. Defaults to TRUE (verify the server cert).
   * Set to false only for managed/self-signed dev endpoints that you knowingly accept.
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
interface MySQLCredentialValues extends Record<string, string> {
  username: string;
  password: string;
}

/** Row shapes returned by INFORMATION_SCHEMA introspection queries. */
type TableRow = { TABLE_NAME: string; TABLE_TYPE: string };
type ColumnRow = { TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string };
type PkRow = { TABLE_NAME: string; COLUMN_NAME: string };
type FkRow = { constraint_name: string; table_name: string; column_name: string; referenced_table: string; referenced_schema: string; referenced_column: string };

/**
 * MySQL / MariaDB driver for External Data Sources. Read-only, live-proxied access
 * to an external MySQL database via the `mysql2` client. One pooled connection per
 * `ExternalDataSource.ID`, lazily created. Mirrors the proven PostgreSQL driver with
 * MySQL dialect specifics (backtick-quoted identifiers, `LIMIT/OFFSET` paging, `?`
 * positional parameters, and `INFORMATION_SCHEMA` FK introspection where MySQL exposes
 * referenced-table/column directly on KEY_COLUMN_USAGE).
 *
 * Registered as `MySQLExternalDriver` — set `ExternalDataSourceType.DriverClass`
 * to that value to use this driver.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'MySQLExternalDriver')
export class MySQLExternalDataSourceDriver extends BaseExternalDataSourceDriver<mysql.Pool> {
  private pools = new Map<string, mysql.Pool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<mysql.Pool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<MySQLConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in.
    this.assertSecureTransport({ host: config.host, tlsEnabled: !!config.ssl, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
    const cred = await this.resolveCredential<MySQLCredentialValues>(dataSource, contextUser);
    const pool = mysql.createPool({
      host: config.host ?? 'localhost',
      port: config.port,
      user: cred?.values.username,
      password: cred?.values.password,
      database: dataSource.DefaultDatabase ?? config.database,
      // Secure by default: verify the server cert unless the config explicitly opts out.
      ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized !== false } : undefined,
      connectionLimit: config.maxPoolSize ?? 5,
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
        const sqlText = this.buildSelectSql(target, params);
        const [rows] = await pool.query(sqlText);
        const totalRowCount = await this.maybeCount(pool, target, params);
        return { success: true, rows: rows as TRow[], totalRowCount, executionTimeMs: Date.now() - start };
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
    const [rows] = await pool.query(`SELECT * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = ? LIMIT 1`, [primaryKey.value]);
    const list = rows as TRow[];
    return list[0] ?? null;
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
        // mysql2 uses positional placeholders (?); bind values in array order.
        const values = (params ?? []).map((p) => p.value);
        const [result] = await pool.query(queryText, values);
        const rows = Array.isArray(result) ? (result as TRow[]) : [];
        const rowCount = Array.isArray(result) ? result.length : ((result as mysql.ResultSetHeader)?.affectedRows ?? 0);
        return { success: true, rows, rowCount, executionTimeMs: Date.now() - start };
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
    // In MySQL the "schema" is the database; prefer the explicit arg, then DefaultSchema, then DefaultDatabase.
    const schema = schemaName ?? dataSource.DefaultSchema ?? dataSource.DefaultDatabase ?? undefined;

    const [tables] = await pool.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [schema]);
    const [columns] = await pool.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION`, [schema]);
    const [primaryKeys] = await pool.query(
      `SELECT tc.TABLE_NAME, kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = ?`, [schema]);
    // MySQL exposes the referenced table/column directly on KEY_COLUMN_USAGE; each row is a column
    // pairing (ordered by ORDINAL_POSITION), so composite keys map correctly.
    const [foreignKeys] = await pool.query(
      `SELECT CONSTRAINT_NAME AS constraint_name, TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
              REFERENCED_TABLE_NAME AS referenced_table, REFERENCED_TABLE_SCHEMA AS referenced_schema, REFERENCED_COLUMN_NAME AS referenced_column
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, [schema]);

    return {
      Database: dataSource.DefaultDatabase ?? schema ?? undefined,
      Objects: this.assembleSchema(tables as TableRow[], columns as ColumnRow[], primaryKeys as PkRow[], foreignKeys as FkRow[], schema),
    };
  }

  // ---- helpers (mirror the proven PostgreSQL driver, MySQL dialect) --------

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
      // MySQL requires LIMIT before OFFSET; supply a max-rows ceiling when only an offset is given.
      if (params.maxRows == null) {
        sql += ` LIMIT 18446744073709551615`;
      }
      sql += ` OFFSET ${Number(params.offset)}`;
    }
    return sql;
  }

  private async maybeCount(pool: mysql.Pool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined; // only pay for the count when paginating
    }
    const [rows] = await pool.query(`SELECT COUNT(*) AS cnt FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`);
    const list = rows as Array<{ cnt: number }>;
    return Number(list[0]?.cnt ?? 0);
  }

  private assembleSchema(
    tableRows: TableRow[],
    columnRows: ColumnRow[],
    pkRows: PkRow[],
    fkRows: FkRow[],
    schema: string | undefined,
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

  /** Group flat FK-column rows into one relationship per constraint (composite-key aware). */
  protected groupForeignKeys(fkRows: FkRow[]): Map<string, ExternalSchemaRelationship[]> {
    const byTable = new Map<string, Map<string, ExternalSchemaRelationship>>();
    for (const r of fkRows) {
      const constraints = byTable.get(r.table_name) ?? new Map<string, ExternalSchemaRelationship>();
      const rel = constraints.get(r.constraint_name) ?? {
        Name: r.constraint_name,
        ReferencedObject: r.referenced_table,
        ReferencedSchema: r.referenced_schema,
        Columns: [],
      };
      rel.Columns.push({ Column: r.column_name, ReferencedColumn: r.referenced_column });
      constraints.set(r.constraint_name, rel);
      byTable.set(r.table_name, constraints);
    }
    const out = new Map<string, ExternalSchemaRelationship[]>();
    for (const [table, constraints] of byTable) {
      out.set(table, Array.from(constraints.values()));
    }
    return out;
  }

  protected mapObjectType(tableType: string): ExternalObjectType {
    return tableType === 'VIEW' ? 'view' : 'table';
  }

  /** Quote a SQL identifier with backticks, escaping embedded backticks. */
  protected quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
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
