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
  SqlDialectKey,
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

/** Column metadata for decimal-safe projection: the column name and whether it needs CAST-to-string. */
interface SqlColumnMeta {
  name: string;
  /** True for DECIMAL/NUMERIC/MONEY/SMALLMONEY — tedious returns these as a lossy JS number. */
  isLossyNumeric: boolean;
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
  // Cache the in-flight CREATION promise (not the resolved pool) so concurrent first-requests share
  // one pool instead of each building one and leaking all but the last (the cold-start race).
  private pools = new Map<string, Promise<sql.ConnectionPool>>();

  // Per-(dataSource,schema,object) column metadata, cached so we probe INFORMATION_SCHEMA at most once
  // per object. Drives decimal-safe projection: tedious returns DECIMAL/NUMERIC/MONEY as a lossy JS
  // number, so those columns are CAST to string in the SELECT projection (see buildSelectSqlCastAware).
  private columnMetaCache = new Map<string, Promise<SqlColumnMeta[]>>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<sql.ConnectionPool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const creating = this.createPool(dataSource, contextUser);
    this.pools.set(dataSource.ID, creating);
    // Never cache a failed creation — evict so the next call retries (the rejection still propagates).
    creating.catch(() => {
      if (this.pools.get(dataSource.ID) === creating) {
        this.pools.delete(dataSource.ID);
      }
    });
    return creating;
  }

  /** Build a fresh pool for the data source — invoked once per source by the race-safe cache. */
  private async createPool(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<sql.ConnectionPool> {
    const config = this.parseConnectionConfig<SQLServerConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in.
    this.assertSecureTransport({ host: config.server ?? config.host, tlsEnabled: !!config.ssl, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
    const cred = await this.resolveCredential<SQLServerCredentialValues>(dataSource, contextUser);
    const pool = new sql.ConnectionPool({
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
    });
    try {
      await pool.connect();
    } catch (e) {
      // Release the pool on a failed connect — the cache only evicts the rejected promise, it can't
      // close a pool it never received. Close is best-effort; rethrow the original error.
      await pool.close().catch(() => { /* best-effort */ });
      throw e;
    }
    return pool;
  }

  protected peekConnection(dataSourceId: string): unknown {
    return this.pools.get(dataSourceId);
  }

  protected async invalidateConnection(dataSourceId: string, expectedIdentity?: unknown): Promise<void> {
    const existing = this.pools.get(dataSourceId);
    // Identity guard: skip if a concurrent request already replaced this pool (see base withConnectionRetry).
    if (expectedIdentity !== undefined && existing !== expectedIdentity) {
      return;
    }
    // Drop cached column metadata for this source too — a dropped/re-added source could have a
    // reshaped schema, and the cache key is prefixed by dataSourceId so we can target it.
    for (const key of [...this.columnMetaCache.keys()]) {
      if (key.startsWith(`${dataSourceId}||`)) {
        this.columnMetaCache.delete(key);
      }
    }
    if (existing) {
      this.pools.delete(dataSourceId);
      try { await (await existing).close(); } catch { /* best-effort close on the failure path */ }
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
        const columns = await this.getObjectColumns(pool, dataSource, params.objectName);
        const sqlText = this.buildSelectSqlCastAware(target, params, columns);
        const res = await pool.request().query(sqlText);
        const totalRowCount = await this.maybeCount(pool, target, params);
        const rows = this.normalizeRows(res.recordset as unknown as Record<string, unknown>[]) as unknown as TRow[];
        return { success: true, rows, totalRowCount, executionTimeMs: Date.now() - start };
      });
    } catch (e) {
      return { success: false, rows: [], errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async LoadSingle<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    objectName: string,
    primaryKeys: readonly ExternalQueryParameter[],
    contextUser?: UserInfo,
  ): Promise<TRow | null> {
    // Wrapped in withConnectionRetry so a rotated credential self-heals here too (parity with RunView).
    return await this.withConnectionRetry(dataSource, async () => {
      const pool = await this.getConnection(dataSource, contextUser);
      const target = this.qualifyObject(dataSource, objectName);
      const columns = await this.getObjectColumns(pool, dataSource, objectName);
      const projection = this.buildCastAwareProjection(undefined, columns);
      const { clause, values } = this.buildPrimaryKeyWhere(primaryKeys, (i) => `@pk${i}`);
      const request = pool.request();
      values.forEach((v, i) => request.input(`pk${i}`, v));
      const res = await request.query(`SELECT TOP (1) ${projection} FROM ${target} WHERE ${clause}`);
      const row = res.recordset[0];
      return row ? (this.normalizeRows([row as Record<string, unknown>])[0] as unknown as TRow) : null;
    });
  }

  public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    queryText: string,
    params: ExternalQueryParameter[] | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalQueryResult<TRow>> {
    const start = Date.now();
    try {
      // Read-only enforcement (EDS is read-only): screen the rendered native SQL before it runs.
      this.screenReadOnlyNativeQuery(queryText);
      return await this.withConnectionRetry(dataSource, async () => {
        const pool = await this.getConnection(dataSource, contextUser);
        // mssql binds by name (@name); callers reference parameters by their declared name.
        const req = pool.request();
        for (const p of params ?? []) {
          req.input(p.name, p.value);
        }
        const res = await req.query(queryText);
        // Native queries carry an arbitrary projection we can't rewrite for decimal-safety (we'd have to
        // parse the SELECT), so DECIMAL precision is best-effort here; normalizeRows still handles bigint
        // and object-typed values. Callers needing lossless decimals should CAST in their query text.
        const rows = this.normalizeRows((res.recordset as unknown as Record<string, unknown>[]) ?? []) as unknown as TRow[];
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
    const res = await pool.request().query(this.buildCountSql(target, params));
    return Number(res.recordset[0]?.cnt ?? 0);
  }

  // ---- decimal-safe projection ---------------------------------------------
  // tedious returns DECIMAL/NUMERIC/MONEY/SMALLMONEY as a lossy JS `number` (BIGINT, by contrast, comes
  // back as a string, so it needs no help). To preserve full precision we CAST those columns to string in
  // the SELECT projection. That requires knowing the object's columns, so we probe INFORMATION_SCHEMA once
  // per object and cache the result. When no fields are requested (a `*` read), we expand `*` into an
  // explicit column list ONLY when a lossy-numeric column exists — otherwise `*` is left untouched.

  /** Split an objectName into (schema, object), honoring an explicit `schema.object` and the source default. */
  private splitSchemaObject(dataSource: MJExternalDataSourceEntity, objectName: string): { schema: string; object: string } {
    if (objectName.includes('.')) {
      const [schema, object] = objectName.split('.');
      return { schema, object };
    }
    return { schema: dataSource.DefaultSchema ?? 'dbo', object: objectName };
  }

  /** Probe (and cache) the column list + which columns are lossy-numeric for an object. */
  private getObjectColumns(pool: sql.ConnectionPool, dataSource: MJExternalDataSourceEntity, objectName: string): Promise<SqlColumnMeta[]> {
    const { schema, object } = this.splitSchemaObject(dataSource, objectName);
    const key = `${dataSource.ID}||${schema}||${object}`;
    const cached = this.columnMetaCache.get(key);
    if (cached) {
      return cached;
    }
    const loading = this.loadObjectColumns(pool, schema, object);
    this.columnMetaCache.set(key, loading);
    // Never cache a failed probe — evict so the next call retries; the empty fallback still applies below.
    loading.catch(() => {
      if (this.columnMetaCache.get(key) === loading) {
        this.columnMetaCache.delete(key);
      }
    });
    return loading;
  }

  private async loadObjectColumns(pool: sql.ConnectionPool, schema: string, object: string): Promise<SqlColumnMeta[]> {
    const res = await pool.request().input('schema', schema).input('object', object).query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @object ORDER BY ORDINAL_POSITION`);
    const lossy = new Set(['decimal', 'numeric', 'money', 'smallmoney']);
    return res.recordset.map((r: { COLUMN_NAME: string; DATA_TYPE: string }) => ({
      name: r.COLUMN_NAME,
      isLossyNumeric: lossy.has((r.DATA_TYPE ?? '').toLowerCase()),
    }));
  }

  /** VARCHAR wide enough for any DECIMAL(38,s): 38 digits + sign + point. money fits comfortably. */
  private castNumericToString(colName: string): string {
    return `CAST(${this.quoteIdent(colName)} AS VARCHAR(64)) AS ${this.quoteIdent(colName)}`;
  }

  /**
   * Build a projection that CASTs lossy-numeric columns to string. `fields` (when supplied) is the
   * requested column subset; otherwise all columns are projected. Returns `*` only when we have no
   * column metadata AND no explicit fields (introspection failed) — a safe, if lossy, fallback.
   */
  protected buildCastAwareProjection(fields: readonly string[] | undefined, columns: SqlColumnMeta[]): string {
    const lossyByName = new Map(columns.map((c) => [c.name.toLowerCase(), c.isLossyNumeric]));
    if (fields?.length) {
      return fields.map((f) => (lossyByName.get(f.toLowerCase()) ? this.castNumericToString(f) : this.quoteIdent(f))).join(', ');
    }
    if (!columns.length) {
      return '*'; // no metadata (e.g. probe failed) — fall back to a plain wildcard read
    }
    if (!columns.some((c) => c.isLossyNumeric)) {
      return '*'; // nothing needs casting — keep the cheaper wildcard
    }
    return columns.map((c) => (c.isLossyNumeric ? this.castNumericToString(c.name) : this.quoteIdent(c.name))).join(', ');
  }

  /**
   * Decimal-safe variant of {@link buildSelectSql}: identical clause construction, but the projection
   * routes through {@link buildCastAwareProjection} so DECIMAL/NUMERIC/MONEY come back as lossless strings.
   */
  protected buildSelectSqlCastAware(target: string, params: ExternalViewParams, columns: SqlColumnMeta[]): string {
    if (params.filter && params.filter.trim().length > 0) {
      this.screenReadOnlyClause(params.filter, 'where');
    }
    if (params.orderBy) {
      this.screenReadOnlyClause(params.orderBy, 'orderby');
    }
    const projection = this.buildCastAwareProjection(params.fields, columns);
    const effectiveParams = this.applyDefaultOrderBy(params);
    const where = this.effectiveWhere(params);
    let sqlText = `SELECT ${this.selectTopClause(effectiveParams)}${projection} FROM ${target}`;
    if (where) {
      sqlText += ` WHERE ${where}`;
    }
    sqlText += this.orderAndPageClause(effectiveParams);
    return sqlText;
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

  /** T-SQL native queries must be parsed with the SQL Server grammar for accurate read-only screening. */
  protected sqlDialectKey(): SqlDialectKey {
    return 'sqlserver';
  }

  /** Quote a SQL identifier with T-SQL brackets, escaping embedded `]`. */
  protected quoteIdent(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
  }
}
