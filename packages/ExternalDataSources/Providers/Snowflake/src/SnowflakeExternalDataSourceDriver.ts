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

/** Column metadata for precision-safe projection: the column name and whether it needs CAST-to-string. */
interface SnowflakeColumnMeta {
  name: string;
  /** True for NUMBER columns that overflow a JS number (scale > 0, or precision > 15) — CAST to string. */
  needsStringCast: boolean;
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
  // Cache the in-flight CREATION promise (not the resolved pool) so concurrent first-requests share
  // one pool instead of each building one and leaking all but the last (the cold-start race).
  private pools = new Map<string, Promise<SnowflakePool>>();

  // Per-(dataSource,schema,object) column metadata, cached so we probe INFORMATION_SCHEMA at most once
  // per object. Drives precision-safe projection for structured reads: high-precision NUMBER columns are
  // CAST to string in the SELECT (see buildSelectSqlCastAware), while FLOAT stays a native JS number.
  private columnMetaCache = new Map<string, Promise<SnowflakeColumnMeta[]>>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<SnowflakePool> {
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
  private async createPool(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<SnowflakePool> {
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
    // Drop cached column metadata for this source too — a re-added source could have a reshaped schema.
    for (const key of [...this.columnMetaCache.keys()]) {
      if (key.startsWith(`${dataSourceId}||`)) {
        this.columnMetaCache.delete(key);
      }
    }
    if (existing) {
      this.pools.delete(dataSourceId);
      // clear() must run even if drain() throws, or the generic-pool's resources leak.
      try { const pool = await existing; try { await pool.drain(); } finally { await pool.clear(); } } catch { /* best-effort close on the failure path */ }
    }
  }

  /**
   * Snowflake auth failures carry codes/phrases the base {@link isAuthError} doesn't recognize (its set
   * covers PG/MySQL/SQL Server/Oracle). Without this override, {@link withConnectionRetry} never
   * self-heals a rotated password or an expired PAT/JWT — every subsequent read fails until the process
   * restarts. Add Snowflake's auth error codes + the stable message phrases.
   */
  protected isAuthError(e: unknown): boolean {
    if (super.isAuthError(e)) {
      return true;
    }
    const err = e as { code?: unknown };
    const code = err?.code != null ? String(err.code) : '';
    const snowflakeAuthCodes = new Set(['390100', '390101', '390104', '390144', '390195']);
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      snowflakeAuthCodes.has(code) ||
      msg.includes('incorrect username or password') ||
      msg.includes('token is invalid') ||
      msg.includes('token has expired') ||
      msg.includes('jwt token') ||
      msg.includes('programmatic access token')
    );
  }

  /**
   * Promisified statement execution against a pooled connection (acquired for the call, then released).
   *
   * `fetchNumbersAsString` controls the SDK's blunt `fetchAsString: ['Number']` lever, which stringifies
   * EVERY numeric column — including FLOAT/REAL, where it rounds to ~10 significant digits (lossy). For
   * structured reads (RunView/LoadSingle) we leave it OFF and instead CAST only high-precision NUMBER
   * columns to string in the projection (see buildSelectSqlCastAware), so FLOAT stays a lossless native
   * number. Native queries carry an unparseable projection, so they opt IN to the blunt lever to keep
   * large NUMBER ids intact — callers needing exact FLOAT there can CAST in their own SQL.
   */
  private execute<TRow extends ExternalRow = ExternalRow>(
    pool: SnowflakePool,
    sqlText: string,
    binds?: SnowflakeBind[],
    fetchNumbersAsString = false,
  ): Promise<TRow[]> {
    return pool.use((conn) => new Promise<TRow[]>((resolve, reject) => {
      conn.execute({
        sqlText,
        // @types/snowflake-sdk types Bind as string|number, narrower than the SDK's
        // runtime (it accepts boolean/Date/null); cast at this boundary.
        binds: binds as unknown as Binds,
        ...(fetchNumbersAsString ? { fetchAsString: ['Number' as const] } : {}),
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
        const columns = await this.getObjectColumns(pool, dataSource, params.objectName);
        const rows = await this.execute<TRow>(pool, this.buildSelectSqlCastAware(target, params, columns));
        const totalRowCount = await this.maybeCount(pool, target, params);
        return { success: true, rows: this.normalizeRows(rows), totalRowCount, executionTimeMs: Date.now() - start };
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
      const { clause, values } = this.buildPrimaryKeyWhere(primaryKeys, () => `?`);
      const rows = await this.execute<TRow>(pool, `SELECT ${projection} FROM ${target} WHERE ${clause} LIMIT 1`, values);
      return this.normalizeRows(rows)[0] ?? null;
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
        const binds = params?.length ? params.map((p) => p.value) : undefined;
        // Native query: opt into fetchAsString so large NUMBER ids survive (we can't rewrite an arbitrary
        // projection). FLOAT columns are rounded by this lever; callers needing exact FLOAT should CAST.
        const rows = await this.execute<TRow>(pool, queryText, binds, true);
        return { success: true, rows: this.normalizeRows(rows), rowCount: rows.length, executionTimeMs: Date.now() - start };
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
    const primaryKeys = await this.loadPrimaryKeys(pool, dataSource.DefaultDatabase ?? undefined, schema);
    return { Database: dataSource.DefaultDatabase ?? undefined, Objects: this.assembleSchema(schema, tables, columns, primaryKeys) };
  }

  /**
   * Snowflake's INFORMATION_SCHEMA does NOT expose primary keys, so `SHOW PRIMARY KEYS` is the only
   * introspection source (otherwise every entity gets CodeGen's "first column is the PK" fallback, which
   * is wrong for composite/non-first-column keys). SHOW returns lowercase column names. Best-effort: if
   * the role can't run SHOW or none exist, we return an empty set and fall back to no-PK (prior behavior).
   */
  private async loadPrimaryKeys(pool: SnowflakePool, database: string | undefined, schema: string): Promise<Set<string>> {
    const scope = database ? `${this.quoteIdent(database)}.${this.quoteIdent(schema)}` : this.quoteIdent(schema);
    try {
      const rows = await this.execute<Record<string, unknown>>(pool, `SHOW PRIMARY KEYS IN SCHEMA ${scope}`);
      const set = new Set<string>();
      for (const r of rows) {
        // SHOW output keys are lowercase; guard for either casing defensively.
        const table = (r.table_name ?? r.TABLE_NAME) as string | undefined;
        const column = (r.column_name ?? r.COLUMN_NAME) as string | undefined;
        if (table && column) {
          set.add(`${table}.${column}`);
        }
      }
      return set;
    } catch {
      return new Set<string>(); // best-effort — introspection must not fail if SHOW is unavailable
    }
  }

  /** Drain + clear all cached pools (graceful shutdown). */
  public async Close(): Promise<void> {
    const inFlight = Array.from(this.pools.values());
    this.pools.clear();
    await Promise.all(
      inFlight.map(async (p) => {
        // clear() must run even if drain() throws, or the generic-pool's resources leak.
        try { const pool = await p; try { await pool.drain(); } finally { await pool.clear(); } } catch { /* best-effort close */ }
      }),
    );
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
      // Snowflake requires LIMIT to precede OFFSET; when only an offset is given, use LIMIT NULL (no cap).
      if (params.maxRows == null) {
        sql += ` LIMIT NULL`;
      }
      sql += ` OFFSET ${Number(params.offset)}`;
    }
    return sql;
  }

  private async maybeCount(pool: SnowflakePool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined;
    }
    const rows = await this.execute<{ CNT: number }>(pool, this.buildCountSql(target, params));
    return Number(rows[0]?.CNT ?? 0);
  }

  // ---- precision-safe projection -------------------------------------------
  // The SDK returns NUMBER as a JS number (Snowflake's default integer is NUMBER(38,0), which rounds past
  // 2^53). Rather than the blunt fetchAsString: ['Number'] lever (which also rounds FLOAT), we CAST only
  // the NUMBER columns that can't fit a JS number to string in the projection: scale > 0 (any decimal) or
  // precision > 15 (large int). Small integers stay native numbers. Requires a one-time column probe.

  /** Split an objectName into (schema, object), honoring an explicit `schema.object` and the source default. */
  private splitSchemaObject(dataSource: MJExternalDataSourceEntity, objectName: string): { schema: string; object: string } {
    if (objectName.includes('.')) {
      const [schema, object] = objectName.split('.');
      return { schema, object };
    }
    return { schema: dataSource.DefaultSchema ?? 'PUBLIC', object: objectName };
  }

  /** Probe (and cache) the column list + which NUMBER columns need string-casting for an object. */
  private getObjectColumns(pool: SnowflakePool, dataSource: MJExternalDataSourceEntity, objectName: string): Promise<SnowflakeColumnMeta[]> {
    const { schema, object } = this.splitSchemaObject(dataSource, objectName);
    const key = `${dataSource.ID}||${schema}||${object}`;
    const cached = this.columnMetaCache.get(key);
    if (cached) {
      return cached;
    }
    const loading = this.loadObjectColumns(pool, schema, object);
    this.columnMetaCache.set(key, loading);
    // Never cache a failed probe — evict so the next call retries; the empty fallback still applies.
    loading.catch(() => {
      if (this.columnMetaCache.get(key) === loading) {
        this.columnMetaCache.delete(key);
      }
    });
    return loading;
  }

  private async loadObjectColumns(pool: SnowflakePool, schema: string, object: string): Promise<SnowflakeColumnMeta[]> {
    const rows = await this.execute<{ COLUMN_NAME: string; DATA_TYPE: string; NUMERIC_PRECISION: number | null; NUMERIC_SCALE: number | null }>(
      pool,
      `SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [schema, object],
    );
    return rows.map((r) => {
      const type = (r.DATA_TYPE ?? '').toUpperCase();
      const scale = r.NUMERIC_SCALE ?? 0;
      const precision = r.NUMERIC_PRECISION ?? 0;
      // Only exact-numeric (NUMBER/DECIMAL/NUMERIC) can overflow a JS number; FLOAT/REAL are true doubles.
      const isExactNumeric = type === 'NUMBER' || type === 'DECIMAL' || type === 'NUMERIC';
      const needsStringCast = isExactNumeric && (scale > 0 || precision > 15);
      return { name: r.COLUMN_NAME, needsStringCast };
    });
  }

  private castNumericToString(colName: string): string {
    return `CAST(${this.quoteIdent(colName)} AS VARCHAR) AS ${this.quoteIdent(colName)}`;
  }

  /**
   * Build a projection that CASTs high-precision NUMBER columns to string. `fields` (when supplied) is the
   * requested column subset; otherwise all columns are projected. Returns `*` only when no column needs a
   * cast, or when metadata is unavailable (probe failed) — a safe, if lossy-for-big-numbers, fallback.
   */
  protected buildCastAwareProjection(fields: readonly string[] | undefined, columns: SnowflakeColumnMeta[]): string {
    const castByName = new Map(columns.map((c) => [c.name.toUpperCase(), c.needsStringCast]));
    if (fields?.length) {
      return fields.map((f) => (castByName.get(f.toUpperCase()) ? this.castNumericToString(f) : this.quoteIdent(f))).join(', ');
    }
    if (!columns.length || !columns.some((c) => c.needsStringCast)) {
      return '*';
    }
    return columns.map((c) => (c.needsStringCast ? this.castNumericToString(c.name) : this.quoteIdent(c.name))).join(', ');
  }

  /**
   * Precision-safe variant of {@link buildSelectSql}: identical clause construction, but the projection
   * routes through {@link buildCastAwareProjection} so high-precision NUMBER comes back as lossless strings
   * while FLOAT stays a native number.
   */
  protected buildSelectSqlCastAware(target: string, params: ExternalViewParams, columns: SnowflakeColumnMeta[]): string {
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
    primaryKeys: Set<string>,
  ): ExternalSchemaObject[] {
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.TABLE_NAME) ?? [];
      // Primary keys come from SHOW PRIMARY KEYS (see loadPrimaryKeys) — INFORMATION_SCHEMA omits them.
      list.push({ Name: c.COLUMN_NAME, NativeType: c.DATA_TYPE, Nullable: c.IS_NULLABLE === 'YES', IsPrimaryKey: primaryKeys.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`) });
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

  /**
   * Snowflake native queries are screened with the ANSI/PostgreSQL grammar, which can't parse
   * Snowflake's `?` positional bind placeholders — neutralize them for STRUCTURE analysis only (the
   * original SQL + binds still execute). In Snowflake `?` is always a bind placeholder (path access
   * uses `:` / functions, not a `?` operator), so this never turns a write into a read. Identifiers
   * are already double-quoted like PostgreSQL, so no identifier normalization is needed.
   */
  protected normalizeForReadOnlyParse(sql: string): string {
    return sql.replace(/\?/g, '1');
  }
}
