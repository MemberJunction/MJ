import oracledb from 'oracledb';
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
export class OracleExternalDataSourceDriver extends BaseExternalDataSourceDriver<oracledb.Pool> {
  private pools = new Map<string, oracledb.Pool>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<oracledb.Pool> {
    const existing = this.pools.get(dataSource.ID);
    if (existing) {
      return existing;
    }
    const config = this.parseConnectionConfig<OracleConnectionConfig>(dataSource);
    // Secure-by-default: refuse plaintext to a non-local host unless explicitly opted in.
    this.assertSecureTransport({ host: config.host, tlsEnabled: !!config.ssl, allowInsecure: config.allowInsecureTransport, dataSourceName: dataSource.Name });
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
    this.pools.set(dataSource.ID, pool);
    return pool;
  }

  protected async invalidateConnection(dataSourceId: string): Promise<void> {
    const pool = this.pools.get(dataSourceId);
    if (pool) {
      this.pools.delete(dataSourceId);
      try { await pool.close(0); } catch { /* best-effort close on the failure path */ }
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
    const { rows } = await this.query<TRow>(
      pool,
      `SELECT * FROM ${target} WHERE ${this.quoteIdent(primaryKey.name)} = :pk FETCH FIRST 1 ROWS ONLY`,
      { pk: primaryKey.value },
    );
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
        // Oracle binds by name (:name); callers reference parameters by their declared name.
        const binds: Record<string, unknown> = {};
        for (const p of params ?? []) {
          binds[p.name] = p.value;
        }
        const { rows, rowsAffected } = await this.query<TRow>(pool, queryText, binds);
        return { success: true, rows, rowCount: rows.length || rowsAffected, executionTimeMs: Date.now() - start };
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
      const res = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return { rows: (res.rows as T[]) ?? [], rowsAffected: res.rowsAffected ?? 0 };
    } finally {
      await conn.close();
    }
  }

  protected buildSelectSql(target: string, params: ExternalViewParams): string {
    const projection = params.fields?.length ? params.fields.map((f) => this.quoteIdent(f)).join(', ') : '*';
    let sql = `SELECT ${projection} FROM ${target}`;
    if (params.filter) {
      sql += ` WHERE ${params.filter}`; // trusted dialect filter, same contract as MJ RunView ExtraFilter
    }
    if (params.orderBy) {
      sql += ` ORDER BY ${params.orderBy}`;
    }
    // Oracle 12c+ row-limiting clause: OFFSET m ROWS FETCH NEXT n ROWS ONLY (FETCH alone == FETCH FIRST).
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
    const { rows } = await this.query<{ CNT: number }>(pool, `SELECT COUNT(*) AS cnt FROM ${target}${params.filter ? ` WHERE ${params.filter}` : ''}`);
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
    const relationshipsByTable = this.groupForeignKeys(fkRows);
    return objectRows.map((o) => ({
      Name: o.OBJECT_NAME,
      ObjectType: this.mapObjectType(o.OBJECT_TYPE),
      Schema: owner,
      Columns: columnsByTable.get(o.OBJECT_NAME) ?? [],
      Relationships: relationshipsByTable.get(o.OBJECT_NAME) ?? [],
    }));
  }

  /** Group flat FK-column rows into one relationship per constraint (composite-key aware). */
  protected groupForeignKeys(fkRows: FkRow[]): Map<string, ExternalSchemaRelationship[]> {
    const byTable = new Map<string, Map<string, ExternalSchemaRelationship>>();
    for (const r of fkRows) {
      const constraints = byTable.get(r.TABLE_NAME) ?? new Map<string, ExternalSchemaRelationship>();
      const rel = constraints.get(r.CONSTRAINT_NAME) ?? {
        Name: r.CONSTRAINT_NAME,
        ReferencedObject: r.REFERENCED_TABLE,
        ReferencedSchema: r.REFERENCED_SCHEMA,
        Columns: [],
      };
      rel.Columns.push({ Column: r.COLUMN_NAME, ReferencedColumn: r.REFERENCED_COLUMN });
      constraints.set(r.CONSTRAINT_NAME, rel);
      byTable.set(r.TABLE_NAME, constraints);
    }
    const out = new Map<string, ExternalSchemaRelationship[]>();
    for (const [table, constraints] of byTable) {
      out.set(table, Array.from(constraints.values()));
    }
    return out;
  }

  protected mapObjectType(objectType: string): ExternalObjectType {
    return objectType === 'VIEW' ? 'view' : 'table';
  }

  /** Quote a SQL identifier with double-quotes (Oracle: case-sensitive when quoted), escaping `"`. */
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
