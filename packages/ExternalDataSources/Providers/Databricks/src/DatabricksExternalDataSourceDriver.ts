import { RegisterClass } from '@memberjunction/global';
import {
  UserInfo,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalSchemaObject,
  ExternalSchemaRelationship,
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
  ExternalFkRow,
} from '@memberjunction/external-data-sources';
// `@databricks/sql` is an OPTIONAL PEER dependency (CLAUDE.md rule #8, category 2): loaded via a dynamic
// import() only when this driver is actually used, and declared `optional` in peerDependenciesMeta so it
// never enters the base install. This is a `import type` (erased at build time — no runtime dependency);
// the SDK ships its own bundled types, so — unlike snowflake-sdk — there is no separate `@types/*` package.
import type { DBSQLClient } from '@databricks/sql';

// ─── @databricks/sql SDK surface (derived from the public DBSQLClient class) ─────────────────────────────
// Rather than hand-rolling the API shapes or importing fragile deep paths (`dist/contracts/...`), we derive
// every type we use from the SDK's one public class type. This tracks the installed SDK exactly and breaks
// loudly at build time if the SDK's signatures change.
type DatabricksClient = DBSQLClient;
type DatabricksConnectOptions = Parameters<DBSQLClient['connect']>[0];
type DatabricksSession = Awaited<ReturnType<DBSQLClient['openSession']>>;
/** Named-parameter bind map for `:name` markers. Our values are the read-time PK / native-query scalars. */
type DatabricksNamedParameters = Record<string, ExternalQueryParameter['value']>;

/**
 * Memoized loader for the optional `@databricks/sql` peer dependency (CLAUDE.md rule #8, category 2).
 * Cached behind a single module-level promise so the dynamic import resolves once per process rather than
 * on every connection open. `@databricks/sql` is CommonJS; the `.default` interop is handled at the call site.
 */
let databricksSdkPromise: Promise<typeof import('@databricks/sql')> | undefined;
function loadDatabricksSdk(): Promise<typeof import('@databricks/sql')> {
  if (!databricksSdkPromise) {
    databricksSdkPromise = import('@databricks/sql');
  }
  return databricksSdkPromise;
}

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface DatabricksConnectionConfig {
  /** SQL warehouse server hostname, e.g. 'dbc-abc123.cloud.databricks.com'. Required. */
  serverHostname?: string;
  /** SQL warehouse HTTP path, e.g. '/sql/1.0/warehouses/abc123'. Required. */
  httpPath?: string;
  /** Optional Unity Catalog catalog override; otherwise ExternalDataSource.DefaultDatabase is the catalog. */
  catalog?: string;
}

/** Decrypted credential values: PAT (token) OR OAuth M2M service principal (clientId + clientSecret). */
interface DatabricksCredentialValues extends Record<string, string> {
  token: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Databricks SQL Warehouse driver for External Data Sources. Read-only, live-proxied access to a
 * Databricks SQL warehouse over Unity Catalog via the official `@databricks/sql` SDK. Structurally
 * mirrors the Snowflake driver (the other "cloud warehouse behind an HTTPS SDK") — ANSI SQL,
 * `LIMIT/OFFSET` paging — but with **backtick** identifier quoting and Unity Catalog `information_schema`
 * introspection including informational PK/FK constraints.
 *
 * One connected `DBSQLClient` per `ExternalDataSource.ID` (race-safe in-flight-promise cache); each
 * statement opens a short-lived session so concurrent reads don't serialize. Auth is PAT
 * (`authType: 'access-token'`) or OAuth M2M service principal (`authType: 'databricks-oauth'`) depending
 * on the resolved credential. Numeric fidelity is handled SDK-side via `preserveBigNumericPrecision`
 * (DECIMAL → exact string, BIGINT → JS bigint), which the base normalizer then renders JSON-safe.
 * Registered as `DatabricksExternalDriver`.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'DatabricksExternalDriver')
export class DatabricksExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<DatabricksClient> {
  // Cache the in-flight CONNECT promise (not the resolved client) so concurrent first-requests share one
  // client instead of each building one and leaking all but the last (the cold-start race).
  //
  // DESIGN NOTE — single cached client (vs. Snowflake's generic-pool): Databricks SQL is stateless
  // Thrift-over-HTTPS — each statement opens a short-lived session and makes independent HTTP requests, so
  // there is no long-lived TCP socket to go stale on idle. A warehouse that auto-suspends is transparently
  // resumed by the SDK's own retry (retriesTimeout defaults to 15 min), so the SAME cached client keeps
  // working across a suspend/resume without a pool. `withConnectionRetry` still evicts + reconnects on an
  // auth error (rotated/expired credential). The residual gap — a client wedged into a permanently-broken
  // NON-auth state — would require a process restart; given the stateless-HTTP model that's a rare,
  // accepted trade-off rather than the per-idle-timeout concern a pooled TCP driver faces.
  private clients = new Map<string, Promise<DatabricksClient>>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<DatabricksClient> {
    const existing = this.clients.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const connecting = this.createClient(dataSource, contextUser);
    this.clients.set(dataSource.ID, connecting);
    // Never cache a failed connect — evict so the next call retries (the rejection still propagates).
    connecting.catch(() => {
      if (this.clients.get(dataSource.ID) === connecting) {
        this.clients.delete(dataSource.ID);
      }
    });
    return connecting;
  }

  /** Build + connect a fresh client for the data source — invoked once per source by the race-safe cache. */
  private async createClient(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<DatabricksClient> {
    const config = this.parseConnectionConfig<DatabricksConnectionConfig>(dataSource);
    if (!config.serverHostname || !config.httpPath) {
      throw new Error(`ExternalDataSource '${dataSource.Name}' ConnectionConfig must include 'serverHostname' and 'httpPath'.`);
    }
    const cred = await this.resolveCredential<DatabricksCredentialValues>(dataSource, contextUser);
    // preserveBigNumericPrecision: DECIMAL columns come back as exact strings and BIGINT as JS bigint
    // (instead of the default lossy coercion to a JS number that rounds past 2^53). The base normalizer
    // renders the residual bigint as a decimal string, so precision is preserved end to end.
    const connectOptions = this.buildConnectOptions(dataSource, config, cred?.values);
    const sdkModule = await loadDatabricksSdk();
    // @databricks/sql is CommonJS; under ESM dynamic import its exports may live on `.default`. The synthetic
    // default isn't present on the `typeof import()` type query, so widen structurally to read it (interop).
    const sdk = (sdkModule as typeof sdkModule & { default?: typeof sdkModule }).default ?? sdkModule;
    const client = new sdk.DBSQLClient();
    await client.connect(connectOptions);
    return client;
  }

  /** Assemble the SDK connect options, branching PAT vs OAuth M2M on the resolved credential. */
  private buildConnectOptions(
    dataSource: MJExternalDataSourceEntity,
    config: DatabricksConnectionConfig,
    values: DatabricksCredentialValues | undefined,
  ): DatabricksConnectOptions {
    const base = { host: config.serverHostname!, path: config.httpPath!, preserveBigNumericPrecision: true };
    if (values?.clientId && values?.clientSecret) {
      // OAuth M2M (service principal) — the production-grade path.
      return { ...base, authType: 'databricks-oauth', oauthClientId: values.clientId, oauthClientSecret: values.clientSecret };
    }
    // PAT (works everywhere incl. Free Edition / trials) — the near-term default.
    const token = values?.token;
    if (!token) {
      throw new Error(`ExternalDataSource '${dataSource.Name}' requires a Databricks credential (a PAT 'token', or OAuth 'clientId'+'clientSecret').`);
    }
    return { ...base, authType: 'access-token', token };
  }

  protected peekConnection(dataSourceId: string): unknown {
    return this.clients.get(dataSourceId);
  }

  protected async invalidateConnection(dataSourceId: string, expectedIdentity?: unknown): Promise<void> {
    const existing = this.clients.get(dataSourceId);
    // Identity guard: skip if a concurrent request already replaced this client (see base withConnectionRetry).
    if (expectedIdentity !== undefined && existing !== expectedIdentity) {
      return;
    }
    if (existing) {
      this.clients.delete(dataSourceId);
      try { const client = await existing; await client.close(); } catch { /* best-effort close on the failure path */ }
    }
  }

  /**
   * Databricks auth failures carry phrases/status the base {@link isAuthError} (PG/MySQL/SQL Server/Oracle)
   * doesn't recognize. Without this override {@link withConnectionRetry} never self-heals a rotated PAT or an
   * expired OAuth token. Match ONLY genuine AUTHENTICATION signals — HTTP 401 and the stable Databricks
   * bad-credential phrases. Deliberately NOT 403 / PERMISSION_DENIED: those are AUTHORIZATION failures
   * (valid credential, insufficient privilege) that a reconnect can't fix — retrying them just wastes a
   * round-trip and needlessly evicts the shared client for other users. This mirrors the base's documented
   * choice to drop the false-positive-prone 'password'/'permission denied' substrings. ('unauthorized' is
   * likewise left to the base, which already matches the 'authoriz' substring.)
   */
  protected isAuthError(e: unknown): boolean {
    if (super.isAuthError(e)) {
      return true;
    }
    const err = e as { statusCode?: unknown; status?: unknown };
    const status = String(err?.statusCode ?? err?.status ?? '');
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      status === '401' ||
      msg.includes('invalid access token') ||
      msg.includes('token is expired') ||
      msg.includes('token expired') ||
      msg.includes('invalid_client') // OAuth M2M bad clientId/secret — re-resolving a rotated secret can fix it
    );
  }

  /**
   * Execute a statement on a short-lived session opened from the cached client (opened + closed per call so
   * concurrent reads don't serialize on one session). Named markers (`:name`) bind via `namedParameters` —
   * never string-interpolated. The operation + session are always closed, even on a fetch error.
   */
  private async execute<TRow extends ExternalRow = ExternalRow>(
    client: DatabricksClient,
    statement: string,
    namedParameters?: DatabricksNamedParameters,
  ): Promise<TRow[]> {
    const session: DatabricksSession = await client.openSession();
    try {
      const operation = await session.executeStatement(statement, { runAsync: true, ...(namedParameters ? { namedParameters } : {}) });
      try {
        const rows = await operation.fetchAll();
        return (rows ?? []) as TRow[];
      } finally {
        await operation.close().catch(() => { /* best-effort */ });
      }
    } finally {
      await session.close().catch(() => { /* best-effort */ });
    }
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const client = await this.getConnection(dataSource, contextUser);
      await this.execute(client, 'SELECT 1 AS ok');
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
        const client = await this.getConnection(dataSource, contextUser);
        const target = this.qualifyObject(dataSource, params.objectName);
        const rows = await this.execute<TRow>(client, this.buildSelectSql(target, params));
        const totalRowCount = await this.maybeCount(client, target, params);
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
    return await this.withConnectionRetry(dataSource, async () => {
      const client = await this.getConnection(dataSource, contextUser);
      const target = this.qualifyObject(dataSource, objectName);
      // Named markers (:pk0, :pk1, …) bound via namedParameters — parity with the base's placeholder contract.
      const { clause, named } = this.buildPrimaryKeyNamed(primaryKeys);
      const rows = await this.execute<TRow>(client, `SELECT * FROM ${target} WHERE ${clause} LIMIT 1`, named);
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
        const client = await this.getConnection(dataSource, contextUser);
        // Native query params bind as named markers (:name) — the caller's SQL uses `:name` placeholders.
        const named: DatabricksNamedParameters | undefined = params?.length
          ? Object.fromEntries(params.map((p) => [p.name, p.value]))
          : undefined;
        const rows = await this.execute<TRow>(client, queryText, named);
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
    const client = await this.getConnection(dataSource, contextUser);
    const catalog = this.resolveCatalog(dataSource);
    const schema = schemaName ?? dataSource.DefaultSchema ?? 'default';
    const infoSchema = this.informationSchemaRef(catalog);

    const tables = await this.execute<{ table_name: string; table_type: string }>(
      client,
      `SELECT table_name, table_type FROM ${infoSchema}.tables WHERE table_schema = :schema ORDER BY table_name`,
      { schema },
    );
    const columns = await this.execute<{ table_name: string; column_name: string; full_data_type: string; is_nullable: string }>(
      client,
      `SELECT table_name, column_name, full_data_type, is_nullable FROM ${infoSchema}.columns
        WHERE table_schema = :schema ORDER BY table_name, ordinal_position`,
      { schema },
    );
    const primaryKeys = await this.loadPrimaryKeys(client, infoSchema, schema);
    const relationships = await this.loadForeignKeys(client, infoSchema, schema);
    return {
      Database: catalog ?? undefined,
      Objects: this.assembleSchema(schema, tables, columns, primaryKeys, relationships),
    };
  }

  /**
   * Unity Catalog informational PRIMARY KEY constraints (`table_constraints` ⋈ `key_column_usage`). UC
   * supports these on curated (often gold-layer) tables; when absent this returns an empty set and columns
   * fall back to no-PK (never guessed). Best-effort: a permission/availability failure yields an empty set.
   */
  private async loadPrimaryKeys(client: DatabricksClient, infoSchema: string, schema: string): Promise<Set<string>> {
    try {
      const rows = await this.execute<{ table_name: string; column_name: string }>(
        client,
        `SELECT kcu.table_name AS table_name, kcu.column_name AS column_name
           FROM ${infoSchema}.table_constraints tc
           JOIN ${infoSchema}.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = :schema`,
        { schema },
      );
      const set = new Set<string>();
      for (const r of rows) {
        if (r.table_name && r.column_name) {
          set.add(`${r.table_name}.${r.column_name}`);
        }
      }
      return set;
    } catch {
      return new Set<string>();
    }
  }

  /**
   * Unity Catalog informational FOREIGN KEY constraints. Joins `table_constraints` (FK) → `key_column_usage`
   * (referencing columns) → `referential_constraints` (→ the referenced unique/PK constraint) →
   * `constraint_column_usage` (referenced table/columns). Imported only when present (better relationship
   * fidelity than Snowflake, whose catalog FKs we skip); returns an empty map when absent — never guessed.
   */
  private async loadForeignKeys(client: DatabricksClient, infoSchema: string, schema: string): Promise<Map<string, ExternalSchemaRelationship[]>> {
    try {
      const rows = await this.execute<{
        constraint_name: string;
        table_name: string;
        column_name: string;
        referenced_schema: string;
        referenced_table: string;
        referenced_column: string;
      }>(
        client,
        `SELECT tc.constraint_name AS constraint_name,
                kcu.table_name       AS table_name,
                kcu.column_name      AS column_name,
                ccu.table_schema     AS referenced_schema,
                ccu.table_name       AS referenced_table,
                ccu.column_name      AS referenced_column
           FROM ${infoSchema}.table_constraints tc
           JOIN ${infoSchema}.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
           JOIN ${infoSchema}.referential_constraints rc ON tc.constraint_name = rc.constraint_name
           JOIN ${infoSchema}.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = :schema
          ORDER BY tc.constraint_name`,
        { schema },
      );
      const fkRows: ExternalFkRow[] = rows.map((r) => ({
        constraint_name: r.constraint_name,
        table_name: r.table_name,
        column_name: r.column_name,
        referenced_schema: r.referenced_schema,
        referenced_table: r.referenced_table,
        referenced_column: r.referenced_column,
      }));
      return this.groupForeignKeys(fkRows);
    } catch {
      return new Map<string, ExternalSchemaRelationship[]>();
    }
  }

  /** Drop + close all cached clients (graceful shutdown). */
  public async Close(): Promise<void> {
    const inFlight = Array.from(this.clients.values());
    this.clients.clear();
    await Promise.all(
      inFlight.map(async (c) => {
        try { const client = await c; await client.close(); } catch { /* best-effort close */ }
      }),
    );
  }

  // ---- dialect surface -----------------------------------------------------

  /** Databricks/Spark SQL identifier quoting: backticks (like MySQL), doubling embedded backticks. */
  protected quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  /** Databricks paging: ANSI ORDER BY + LIMIT/OFFSET (`LIMIT ALL` when only an offset is given). */
  protected orderAndPageClause(params: ExternalViewParams): string {
    let sql = '';
    if (params.orderBy) {
      sql += ` ORDER BY ${params.orderBy}`;
    }
    if (params.maxRows != null) {
      sql += ` LIMIT ${Number(params.maxRows)}`;
    }
    if (params.offset != null) {
      // Databricks requires a LIMIT before OFFSET; when only an offset is given, `LIMIT ALL` means no cap.
      if (params.maxRows == null) {
        sql += ` LIMIT ALL`;
      }
      sql += ` OFFSET ${Number(params.offset)}`;
    }
    return sql;
  }

  /**
   * Neutralize `:name` named-parameter markers to a literal `1` for STRUCTURE analysis ONLY (the original
   * SQL + named binds still execute). The ANSI/PostgreSQL screen grammar happens to accept `:name`, but we
   * still neutralize as belt-and-suspenders against any grammar edge case, matching the base's hook intent.
   *
   * The `(?<!:)` negative lookbehind is important: it skips the SECOND colon of a Databricks `::` type cast
   * (`col::int`), which the ANSI grammar parses fine — without it, `col::int` → `col:1` and the fail-closed
   * screen would wrongly reject a legitimate cast. `:name` is only ever a bind marker in our usage (Spark
   * SQL uses `.`/`[]` for member access), so this never turns a write into a read. (Casts to Databricks-only
   * type names, e.g. `col::string`, are still rejected by the ANSI grammar regardless — use `CAST(... AS ...)`
   * in native queries for those; that's an inherent limitation of the shared ANSI read-only screen.)
   */
  protected normalizeForReadOnlyParse(sql: string): string {
    return sql.replace(/(?<!:):[A-Za-z_][A-Za-z0-9_]*/g, '1');
  }

  // ---- helpers -------------------------------------------------------------

  /** Named-parameter WHERE for a (possibly composite) primary key: `col = :pk0 AND …` + the bind map. */
  private buildPrimaryKeyNamed(primaryKeys: readonly ExternalQueryParameter[]): { clause: string; named: DatabricksNamedParameters } {
    const { clause, values } = this.buildPrimaryKeyWhere(primaryKeys, (i) => `:pk${i}`);
    const named: DatabricksNamedParameters = {};
    values.forEach((v, i) => { named[`pk${i}`] = v; });
    return { clause, named };
  }

  private async maybeCount(client: DatabricksClient, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined;
    }
    const rows = await this.execute<Record<string, unknown>>(client, this.buildCountSql(target, params));
    const first = rows[0] ?? {};
    // The COUNT(*) alias is `cnt` (see base buildCountSql); Databricks returns it lowercase.
    const val = first.cnt ?? first.CNT ?? Object.values(first)[0];
    return Number(val ?? 0);
  }

  /** The Unity Catalog catalog for this source: explicit config override, else DefaultDatabase. */
  private resolveCatalog(dataSource: MJExternalDataSourceEntity): string | undefined {
    const config = this.parseConnectionConfig<DatabricksConnectionConfig>(dataSource);
    return config.catalog ?? dataSource.DefaultDatabase ?? undefined;
  }

  /** `<catalog>.information_schema` when a catalog is known, else the session-catalog `information_schema`. */
  private informationSchemaRef(catalog: string | undefined): string {
    return catalog ? `${this.quoteIdent(catalog)}.information_schema` : `information_schema`;
  }

  private assembleSchema(
    schema: string,
    tableRows: Array<{ table_name: string; table_type: string }>,
    columnRows: Array<{ table_name: string; column_name: string; full_data_type: string; is_nullable: string }>,
    primaryKeys: Set<string>,
    relationships: Map<string, ExternalSchemaRelationship[]>,
  ): ExternalSchemaObject[] {
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.table_name) ?? [];
      list.push({
        Name: c.column_name,
        NativeType: c.full_data_type,
        Nullable: (c.is_nullable ?? '').toUpperCase() === 'YES',
        IsPrimaryKey: primaryKeys.has(`${c.table_name}.${c.column_name}`),
      });
      columnsByTable.set(c.table_name, list);
    }
    return tableRows.map((t) => ({
      Name: t.table_name,
      ObjectType: this.mapObjectType(t.table_type),
      Schema: schema,
      Columns: columnsByTable.get(t.table_name) ?? [],
      Relationships: relationships.get(t.table_name),
    }));
  }
}
