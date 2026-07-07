import oracledb from 'oracledb';
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
  ExternalFkRow,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from "@memberjunction/external-data-sources";

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface OracleConnectionConfig {
  host?: string;
  port?: number;
  /** Oracle service name (e.g. 'FREEPDB1', 'ORCLPDB1'). */
  serviceName?: string;
  /** Full Easy Connect / TNS connect string; overrides host/port/serviceName when provided. */
  connectString?: string;
  /** Enable TLS (tcps). */
  ssl?: boolean;
  /**
   * Explicitly accept an UNENCRYPTED connection to a non-local host. Default false → the driver
   * refuses plaintext to a remote host (local hosts are always allowed).
   */
  allowInsecureTransport?: boolean;
  /** Max pool connections (default 5). */
  maxPoolSize?: number;
}

/** Decrypted credential values expected from the Credential Engine. */
interface OracleCredentialValues extends Record<string, string> {
  username: string;
  password: string;
}

/** Oracle catalog row shapes (OUT_FORMAT_OBJECT yields UPPERCASE keys for unquoted columns/aliases). */
type ObjectRow = { OBJECT_NAME: string; OBJECT_TYPE: string };
type ColumnRow = { TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; NULLABLE: string };
type PkRow = { TABLE_NAME: string; COLUMN_NAME: string };
type FkRow = { CONSTRAINT_NAME: string; TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE: string; REFERENCED_SCHEMA: string; REFERENCED_COLUMN: string };

/**
 * Oracle driver for External Data Sources. Read-only, live-proxied access to an external Oracle
 * database via node-oracledb in **Thin mode** (pure JS — no Oracle Instant Client required). One
 * pooled connection per `ExternalDataSource.ID`, lazily created. Mirrors the proven PostgreSQL
 * driver with Oracle dialect specifics: double-quoted (case-sensitive, conventionally UPPERCASE)
 * identifiers, `OFFSET..FETCH` paging, `:named` bind parameters, and `ALL_*` catalog introspection
 * of tables/views/columns/primary keys and foreign keys (composite-key aware).
 *
 * Registered as `OracleExternalDriver` — set `ExternalDataSourceType.DriverClass` to that value.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'OracleExternalDriver')
export class OracleExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<oracledb.Pool> {
  // Cache the in-flight CREATION promise (not the resolved pool) so concurrent first-requests share
  // one pool instead of each building one and leaking all but the last (the cold-start race).
  private pools = new Map<string, Promise<oracledb.Pool>>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<oracledb.Pool> {
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
  private async createPool(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<oracledb.Pool> {
    const config = this.parseConnectionConfig<OracleConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in. When an
    // explicit connectString is supplied it — not config.host — is what we actually dial, so derive
    // the gate's host + TLS from it (see resolveTransportForGate) rather than the unused config.host.
    const transport = this.resolveTransportForGate(config);
    this.assertSecureTransport({ host: transport.host, tlsEnabled: transport.tlsEnabled, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
    const cred = await this.resolveCredential<OracleCredentialValues>(dataSource, contextUser);
    const connectString = config.connectString
      ?? `${config.ssl ? 'tcps://' : ''}${config.host ?? 'localhost'}:${config.port ?? 1521}/${config.serviceName ?? dataSource.DefaultDatabase ?? 'FREE'}`;
    const pool = await oracledb.createPool({
      user: cred?.values.username,
      password: cred?.values.password,
      connectString,
      poolMin: 0, // lazy: don't open connections until first use
      poolMax: config.maxPoolSize ?? 5,
    });
    return pool;
  }

  /**
   * Derive the effective (host, tlsEnabled) the secure-transport gate should inspect from the actual
   * connect target. When ConnectionConfig supplies an explicit `connectString` — the documented way to
   * point Oracle at a remote host — the gate must inspect THAT, not the unused `config.host`.
   *
   * Multi-address awareness (security): a single "TCPS appears somewhere" / "first HOST=" heuristic is
   * defeatable by ordinary RAC/failover descriptors (a plaintext `(PROTOCOL=TCP)` address listed before
   * a `(PROTOCOL=TCPS)` one) and by decoy tokens. This inspects EVERY network address and surfaces the
   * WEAKEST link: if any plaintext-TCP address targets a non-local host, we return that remote host with
   * tlsEnabled=false so the gate rejects it (unless allowInsecureTransport). Only when no plaintext-TCP
   * address can reach a remote host is the connection treated as secure. Fails closed on anything we
   * can't confidently decompose. Recognizes Easy-Connect (`tcps://host`) and TNS `(PROTOCOL=..)(HOST=..)`.
   */
  protected resolveTransportForGate(config: OracleConnectionConfig): { host: string; tlsEnabled: boolean } {
    if (!config.connectString) {
      return { host: config.host ?? '', tlsEnabled: !!config.ssl };
    }
    const cs = config.connectString.trim();
    const stripBrackets = (h: string) => h.replace(/^\[|\]$/g, '');

    // TNS descriptor: parse EACH `(ADDRESS=...)` block so a PROTOCOL pairs with the HOST in the SAME
    // address. A global "any PROTOCOL=TCP appears" flag over-blocks a legitimate RAC/failover descriptor
    // that mixes a LOCAL plaintext node with REMOTE TCPS nodes (the remote node is encrypted, but the
    // global flag would wrongly brand it plaintext). Splitting on ADDRESS pairs protocol↔host correctly
    // while still catching the real risks (a remote plaintext node, or a decoy TCPS token elsewhere).
    if (cs.includes('(')) {
      const addressSegments = cs.split(/\(\s*ADDRESS\s*=/i).slice(1);
      const addresses = addressSegments.map((seg) => {
        // First PROTOCOL/HOST within this address (a decoy `(X=PROTOCOL=TCPS)` after CONNECT_DATA is
        // ignored because the real address tokens come first). Missing protocol WITH a host → treat as
        // plaintext (fail-closed). IPC/BEQ carry no host and are local, so they pose no remote risk.
        const proto = seg.match(/PROTOCOL\s*=\s*(\w+)/i)?.[1]?.toLowerCase();
        const rawHost = seg.match(/HOST\s*=\s*([^)\s]+)/i)?.[1];
        const host = rawHost ? stripBrackets(rawHost) : undefined;
        const isNetwork = !!host || proto === 'tcp' || proto === 'tcps';
        return { host, plaintext: isNetwork && proto !== 'tcps' };
      });

      // Weakest link: a REMOTE address reachable over plaintext → gate rejects unless opted in.
      const remotePlaintext = addresses.find((a) => a.plaintext && a.host && !this.isLocalHost(a.host));
      if (remotePlaintext) {
        return { host: remotePlaintext.host!, tlsEnabled: false };
      }
      // A plaintext address declared without a resolvable host → fail closed (can't prove it's local).
      if (addresses.some((a) => a.plaintext && !a.host)) {
        return { host: '<unresolved-remote>', tlsEnabled: false };
      }
      // No remote plaintext remains. If there's a remote address it must be TCPS (encrypted) → safe.
      const remoteAddress = addresses.find((a) => a.host && !this.isLocalHost(a.host));
      if (remoteAddress) {
        return { host: remoteAddress.host!, tlsEnabled: true };
      }
      // Only local / hostless (IPC/BEQ) addresses remain — safe to pass regardless (the gate lets any
      // local host through). tlsEnabled mirrors whether a plaintext address was present, for accuracy.
      return { host: addresses.map((a) => a.host).find(Boolean) ?? '', tlsEnabled: !addresses.some((a) => a.plaintext) };
    }

    // Easy-Connect form: [tcp(s)://]host[:port][/service]. NO scheme (or tcp://) ⇒ plaintext TCP by
    // default — must NOT be treated as secure just because it lacks a descriptor.
    const scheme = cs.match(/^(tcps?):\/\//i);
    const withoutScheme = cs.replace(/^tcps?:\/\//i, '');
    const hostMatch = withoutScheme.match(/^(\[[^\]]+\]|[^:/\s]+)/);
    return {
      host: hostMatch ? stripBrackets(hostMatch[1]) : '',
      tlsEnabled: scheme ? scheme[1].toLowerCase() === 'tcps' : false,
    };
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
    if (existing) {
      this.pools.delete(dataSourceId);
      try { await (await existing).close(0); } catch { /* best-effort close on the failure path */ }
    }
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const pool = await this.getConnection(dataSource, contextUser);
      await this.query(pool, 'SELECT 1 AS ok FROM DUAL');
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
        const { rows } = await this.query<TRow>(pool, sqlText);
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
      const { clause, values } = this.buildPrimaryKeyWhere(primaryKeys, (i) => `:pk${i}`);
      const binds: Record<string, ExternalQueryParameter["value"]> = {};
      values.forEach((v, i) => { binds[`pk${i}`] = v; });
      const { rows } = await this.query<TRow>(
        pool,
        `SELECT * FROM ${target} WHERE ${clause} FETCH FIRST 1 ROWS ONLY`,
        binds,
      );
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
        // Oracle binds by name (:name); callers reference parameters by their declared name.
        const binds: Record<string, unknown> = {};
        for (const p of params ?? []) {
          binds[p.name] = p.value;
        }
        const { rows } = await this.query<TRow>(pool, queryText, binds);
        // Read-only native queries are always SELECTs (enforced by the screen), so the row count is
        // simply the number of rows returned — not a falsy-coalesce into rowsAffected (which is 0 for a SELECT).
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
    // Oracle stores unquoted identifiers (incl. schema/user names) UPPERCASE in the catalog.
    const owner = (schemaName ?? dataSource.DefaultSchema ?? '').toUpperCase();

    const { rows: objects } = await this.query<ObjectRow>(pool,
      `SELECT object_name, object_type FROM all_objects
        WHERE owner = :owner AND object_type IN ('TABLE','VIEW') ORDER BY object_name`, { owner });
    const { rows: columns } = await this.query<ColumnRow>(pool,
      `SELECT table_name, column_name, data_type, nullable FROM all_tab_columns
        WHERE owner = :owner ORDER BY table_name, column_id`, { owner });
    const { rows: primaryKeys } = await this.query<PkRow>(pool,
      `SELECT acc.table_name, acc.column_name
         FROM all_constraints ac
         JOIN all_cons_columns acc ON acc.constraint_name = ac.constraint_name AND acc.owner = ac.owner
        WHERE ac.constraint_type = 'P' AND ac.owner = :owner`, { owner });
    // Foreign keys — join the referencing constraint columns to the referenced unique-constraint
    // columns by position, so composite keys map correctly.
    const { rows: foreignKeys } = await this.query<FkRow>(pool,
      `SELECT ac.constraint_name AS CONSTRAINT_NAME,
              acc.table_name      AS TABLE_NAME,
              acc.column_name     AS COLUMN_NAME,
              rcc.table_name      AS REFERENCED_TABLE,
              ac.r_owner          AS REFERENCED_SCHEMA,
              rcc.column_name     AS REFERENCED_COLUMN
         FROM all_constraints ac
         JOIN all_cons_columns acc ON acc.constraint_name = ac.constraint_name AND acc.owner = ac.owner
         JOIN all_cons_columns rcc ON rcc.constraint_name = ac.r_constraint_name AND rcc.owner = ac.r_owner AND rcc.position = acc.position
        WHERE ac.constraint_type = 'R' AND ac.owner = :owner
        ORDER BY acc.table_name, ac.constraint_name, acc.position`, { owner });

    return {
      Database: dataSource.DefaultDatabase ?? owner ?? undefined,
      Objects: this.assembleSchema(objects, columns, primaryKeys, foreignKeys, owner),
    };
  }

  // ---- helpers (mirror the proven PostgreSQL driver, Oracle dialect) -------

  /** Acquire a pooled connection, run the statement (objects out), release. */
  private async query<T>(pool: oracledb.Pool, sql: string, binds: Record<string, unknown> = {}): Promise<{ rows: T[]; rowsAffected: number }> {
    const conn = await pool.getConnection();
    try {
      const res = await conn.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        // Lossless numerics: oracledb returns NUMBER as a JS number (rounds past 2^53 / 15 sig digits).
        // Fetch a NUMBER column as string ONLY when it can actually overflow a JS number — i.e. it has a
        // fractional scale (scale > 0, precision matters) or its precision exceeds 15 digits. Small
        // integers AND unconstrained NUMBER columns (which oracledb reports as precision 0 / scale -127,
        // e.g. a bare `id NUMBER` PK) stay native numbers — matching how the MySQL/Postgres/SQL Server
        // drivers keep small integers numeric, and avoiding turning every plain integer id into a string.
        // The residual risk (an UNCONSTRAINED NUMBER holding a > 2^53 value) is unavoidable at the column
        // level; declaring the column's precision (NUMBER(38) etc.) opts it back into lossless strings.
        fetchTypeHandler: (metaData) => {
          if (metaData.dbType === oracledb.DB_TYPE_NUMBER && this.shouldFetchNumberAsString(metaData.precision, metaData.scale)) {
            return { type: oracledb.STRING };
          }
          return undefined;
        },
      });
      return { rows: (res.rows as T[]) ?? [], rowsAffected: res.rowsAffected ?? 0 };
    } finally {
      await conn.close();
    }
  }

  /**
   * Decide whether an Oracle NUMBER column must be fetched as a string to survive the JS-number boundary.
   * True only when the column can actually exceed a JS number's exact range: a fractional scale (scale > 0)
   * or a precision beyond 15 digits (> 2^53). Small integers AND unconstrained NUMBER columns (oracledb
   * reports precision 0 / scale -127 for a bare `NUMBER`, e.g. a plain `id NUMBER` PK) stay native numbers,
   * consistent with the MySQL/Postgres/SQL Server drivers. Pure function so the boundary is unit-tested.
   */
  protected shouldFetchNumberAsString(precision: number | undefined, scale: number | undefined): boolean {
    const p = precision ?? 0;
    const s = scale ?? 0;
    return s > 0 || p > 15;
  }

  /** Oracle 12c+ paging: ORDER BY + OFFSET m ROWS FETCH NEXT n ROWS ONLY (FETCH alone == FETCH FIRST). */
  protected orderAndPageClause(params: ExternalViewParams): string {
    let sql = '';
    if (params.orderBy) {
      sql += ` ORDER BY ${params.orderBy}`;
    }
    if (params.offset != null) {
      sql += ` OFFSET ${Number(params.offset)} ROWS`;
    }
    if (params.maxRows != null) {
      sql += ` FETCH NEXT ${Number(params.maxRows)} ROWS ONLY`;
    }
    return sql;
  }

  private async maybeCount(pool: oracledb.Pool, target: string, params: ExternalViewParams): Promise<number | undefined> {
    if (params.maxRows == null) {
      return undefined; // only pay for the count when paginating
    }
    const where = this.effectiveWhere(params);
    const { rows } = await this.query<{ CNT: number }>(pool, `SELECT COUNT(*) AS cnt FROM ${target}${where ? ` WHERE ${where}` : ''}`);
    return Number(rows[0]?.CNT ?? 0);
  }

  private assembleSchema(
    objectRows: ObjectRow[],
    columnRows: ColumnRow[],
    pkRows: PkRow[],
    fkRows: FkRow[],
    owner: string,
  ): ExternalSchemaObject[] {
    const pkSet = new Set(pkRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
    const columnsByTable = new Map<string, ExternalSchemaColumn[]>();
    for (const c of columnRows) {
      const list = columnsByTable.get(c.TABLE_NAME) ?? [];
      list.push({
        Name: c.COLUMN_NAME,
        NativeType: c.DATA_TYPE,
        Nullable: c.NULLABLE === 'Y', // Oracle uses Y/N, not YES/NO
        IsPrimaryKey: pkSet.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`),
      });
      columnsByTable.set(c.TABLE_NAME, list);
    }
    const relationshipsByTable = this.groupForeignKeys(this.normalizeForeignKeyRows(fkRows));
    return objectRows.map((o) => ({
      Name: o.OBJECT_NAME,
      ObjectType: this.mapObjectType(o.OBJECT_TYPE),
      Schema: owner,
      Columns: columnsByTable.get(o.OBJECT_NAME) ?? [],
      Relationships: relationshipsByTable.get(o.OBJECT_NAME) ?? [],
    }));
  }

  /**
   * Normalize Oracle's UPPERCASE catalog FK rows (OUT_FORMAT_OBJECT yields uppercase keys) to the
   * shared lowercase {@link ExternalFkRow} shape consumed by the inherited `groupForeignKeys`.
   */
  protected normalizeForeignKeyRows(fkRows: FkRow[]): ExternalFkRow[] {
    return fkRows.map((r) => ({
      constraint_name: r.CONSTRAINT_NAME,
      table_name: r.TABLE_NAME,
      column_name: r.COLUMN_NAME,
      referenced_table: r.REFERENCED_TABLE,
      referenced_schema: r.REFERENCED_SCHEMA,
      referenced_column: r.REFERENCED_COLUMN,
    }));
  }

  /** Quote a SQL identifier with double-quotes (Oracle: case-sensitive when quoted), escaping `"`. */
  protected quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Oracle's default NLS date format rejects an ISO-8601 timestamp literal (the `T`/`Z` form → ORA-01843),
   * so an incremental watermark like `2026-03-01T00:00:00.000Z` is wrapped in `TO_TIMESTAMP` with a matching
   * format mask. Non-ISO watermarks (numeric cursors, date-only strings) pass through as a plain literal.
   *
   * Note: for a naive (no-time-zone) source column, incremental correctness is time-zone sensitive — the
   * session TZ governs how the value reads back; run against UTC-normalized data or a TIMESTAMP WITH TIME
   * ZONE column for exact boundaries.
   */
  protected override formatIncrementalLiteral(value: string): string {
    const isIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(value);
    if (!isIsoTimestamp) {
      return this.quoteLiteral(value);
    }
    const fractional = value.includes('.') ? '.FF3' : '';
    const zoneLiteral = value.endsWith('Z') ? '"Z"' : '';
    return `TO_TIMESTAMP(${this.quoteLiteral(value)}, 'YYYY-MM-DD"T"HH24:MI:SS${fractional}${zoneLiteral}')`;
  }
}
