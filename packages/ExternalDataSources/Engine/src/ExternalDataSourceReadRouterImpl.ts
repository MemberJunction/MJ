import { RegisterClass } from "@memberjunction/global";
import {
  EntityInfo,
  ExternalDataSourceReadRouter,
  ExternalSchemaDescriptor,
  IMetadataProvider,
  RunQueryParams,
  RunQueryResult,
  RunViewParams,
  RunViewResult,
  UserInfo,
} from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { ExternalDataSourceRouter } from "./ExternalDataSourceRouter";
import { ExternalRow, ExternalViewParams } from "./types";

/** Fallback cache TTL (seconds) when a data source has no DefaultCacheTTLSeconds configured. Matches the plan's default. */
const DEFAULT_EXTERNAL_CACHE_TTL_SECONDS = 300;

/**
 * Default row limit applied when a RunView supplies no MaxRows and the entity has no
 * UserViewMaxRows, so an unbounded RunView doesn't stream an entire remote table.
 */
const DEFAULT_EXTERNAL_MAX_ROWS = 1000;

/**
 * Hard ceiling on the effective row count of a *structured* external read (the RunView path), applied
 * EVEN to an explicit caller MaxRows so a `RunView({ MaxRows: 100_000_000 })` can't stream/meter an
 * entire remote table (egress cost, remote load). Unlike the MJ-DB path, the blast radius here is a
 * remote/metered source, so this fails closed. Overridable per source via ConnectionConfig
 * `{ "maxRowLimit": N }`; the effective cap is `min(requested, perSourceLimit ?? HARD_MAX_EXTERNAL_ROWS)`.
 *
 * Scope: governs the RunView path ({@link ExternalDataSourceReadRouterImpl.resolveMaxRows}) only. The
 * native-query path (`RunQueryExternal` → driver `RunNativeQuery`) executes an admin-authored stored
 * Query's fully-rendered SQL verbatim — like a stored procedure, its row count is bounded by the
 * Query definition and the source's (ideally least-privilege) credential, not by this runtime cap.
 */
const HARD_MAX_EXTERNAL_ROWS = 50_000;

/**
 * Concrete {@link ExternalDataSourceReadRouter} registered for the ClassFactory
 * so foundational providers can reach the External Data Sources engine without a
 * compile-time dependency on it. Translates MJ's RunView/RunQuery shapes to the
 * driver contract and back, delegating driver/credential resolution to
 * {@link ExternalDataSourceRouter} (the BaseSingleton that owns the per-source
 * driver + connection-pool cache).
 */
@RegisterClass(ExternalDataSourceReadRouter, 'ExternalDataSourceReadRouter')
export class ExternalDataSourceReadRouterImpl extends ExternalDataSourceReadRouter {
  public async RunViewExternal<T = unknown>(
    entity: EntityInfo,
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RunViewResult<T>> {
    const start = Date.now();
    try {
      const { driver, dataSource } = await ExternalDataSourceRouter.Instance.Resolve(
        entity.ExternalDataSourceID,
        contextUser,
        provider,
      );
      const offset = params.StartRow && params.StartRow > 0 ? params.StartRow : undefined;
      // Deterministic paging: OFFSET-based paging needs a stable ORDER BY or pages can repeat/skip
      // rows (T-SQL even forces a synthesized no-op ORDER BY when none is given). When the caller
      // supplied no order and we're paginating, default to the entity's introspected primary key so
      // page boundaries are well-defined uniformly across every SQL dialect. PK names come from MJ
      // metadata (trusted), so they bypass the caller-clause keyword screen applied upstream.
      let orderBy = (params.OrderBy as string) || undefined;
      if (!orderBy && offset != null) {
        if (entity.PrimaryKeys.length > 0) {
          orderBy = entity.PrimaryKeys.map((pk) => pk.Name).join(', ');
        } else {
          // Offset paging with neither a caller OrderBy nor a primary key would yield
          // nondeterministic pages (rows can repeat/vanish). Fail clearly instead of silently.
          return this.failView<T>(
            `External entity '${entity.Name}' has no primary key; offset pagination requires an explicit OrderBy for stable pages.`,
            Date.now() - start,
          );
        }
      }
      const viewParams: ExternalViewParams = {
        objectName: entity.ExternalObjectName || entity.BaseTable || entity.Name,
        fields: params.Fields && params.Fields.length ? params.Fields : undefined,
        filter: (params.ExtraFilter as string) || undefined,
        orderBy,
        // Row limit: the requested count (explicit MaxRows, else the entity's UserViewMaxRows, else
        // the absent-case default) capped by the per-source / hard ceiling so even a huge explicit
        // MaxRows can't stream a whole remote table (§M3 — fail-closed against a metered source).
        maxRows: this.resolveMaxRows(params, entity, dataSource),
        offset,
      };
      const res = await driver.RunView<ExternalRow>(dataSource, viewParams, contextUser);
      if (!res.success) {
        return this.failView<T>(res.errorMessage ?? 'External RunView failed', Date.now() - start);
      }
      return {
        Success: true,
        // dynamic remote rows -> caller's generic row type (boundary marshalling)
        Results: res.rows as unknown as T[],
        RowCount: res.rows.length,
        TotalRowCount: res.totalRowCount ?? res.rows.length,
        ExecutionTime: res.executionTimeMs,
        ErrorMessage: '',
      };
    } catch (e) {
      return this.failView<T>(this.errorText(e), Date.now() - start);
    }
  }

  public async RunQueryExternal(
    externalDataSourceID: string,
    queryID: string,
    queryName: string,
    sql: string,
    _params: RunQueryParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RunQueryResult> {
    const start = Date.now();
    try {
      const { driver, dataSource } = await ExternalDataSourceRouter.Instance.Resolve(externalDataSourceID, contextUser, provider);
      // sql is already fully rendered by MJ's parameter templating, so no bind params are passed.
      const res = await driver.RunNativeQuery<ExternalRow>(dataSource, sql, undefined, contextUser);
      if (!res.success) {
        return this.failQuery(queryID, queryName, res.errorMessage ?? 'External query failed', Date.now() - start);
      }
      return {
        Success: true,
        QueryID: queryID,
        QueryName: queryName,
        Results: res.rows,
        RowCount: res.rows.length,
        TotalRowCount: res.rowCount,
        ExecutionTime: res.executionTimeMs,
        ErrorMessage: '',
      };
    } catch (e) {
      return this.failQuery(queryID, queryName, this.errorText(e), Date.now() - start);
    }
  }

  public async GetCacheTTLSeconds(
    externalDataSourceID: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number> {
    try {
      const { dataSource } = await ExternalDataSourceRouter.Instance.Resolve(externalDataSourceID, contextUser, provider);
      const ttl = dataSource.DefaultCacheTTLSeconds;
      // A configured 0 means "do not cache this source"; null/undefined falls back to the default.
      return typeof ttl === 'number' ? ttl : DEFAULT_EXTERNAL_CACHE_TTL_SECONDS;
    } catch {
      // Any resolution failure here will resurface on the actual read; default the TTL so a
      // transient hiccup doesn't silently change caching behavior.
      return DEFAULT_EXTERNAL_CACHE_TTL_SECONDS;
    }
  }

  public async IntrospectExternalSchema(
    externalDataSourceID: string,
    schemaName?: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ExternalSchemaDescriptor> {
    const { driver, dataSource } = await ExternalDataSourceRouter.Instance.Resolve(externalDataSourceID, contextUser, provider);
    return driver.IntrospectSchema(dataSource, schemaName, contextUser);
  }

  /**
   * The effective, ceiling-capped row limit for an external read (review M3). The requested count
   * is the explicit MaxRows, else the entity's UserViewMaxRows, else {@link DEFAULT_EXTERNAL_MAX_ROWS};
   * it is then capped by the per-source override or {@link HARD_MAX_EXTERNAL_ROWS} so an explicit
   * MaxRows can't stream a whole remote table. Fail-closed.
   */
  private resolveMaxRows(params: RunViewParams, entity: EntityInfo, dataSource: MJExternalDataSourceEntity): number {
    const requested =
      params.MaxRows && params.MaxRows > 0
        ? params.MaxRows
        : entity.UserViewMaxRows && entity.UserViewMaxRows > 0
          ? entity.UserViewMaxRows
          : DEFAULT_EXTERNAL_MAX_ROWS;
    const ceiling = this.perSourceMaxRowLimit(dataSource) ?? HARD_MAX_EXTERNAL_ROWS;
    return Math.min(requested, ceiling);
  }

  /** Optional per-source row ceiling from ConnectionConfig `{ "maxRowLimit": N }`; undefined if unset/invalid. */
  private perSourceMaxRowLimit(dataSource: MJExternalDataSourceEntity): number | undefined {
    if (!dataSource.ConnectionConfig) {
      return undefined;
    }
    try {
      const cfg = JSON.parse(dataSource.ConnectionConfig) as { maxRowLimit?: unknown };
      return typeof cfg.maxRowLimit === 'number' && cfg.maxRowLimit > 0 ? cfg.maxRowLimit : undefined;
    } catch {
      return undefined;
    }
  }

  private failView<T>(errorMessage: string, executionTime: number): RunViewResult<T> {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: executionTime, ErrorMessage: errorMessage };
  }

  private failQuery(queryID: string, queryName: string, errorMessage: string, executionTime: number): RunQueryResult {
    return {
      Success: false,
      QueryID: queryID,
      QueryName: queryName,
      Results: [],
      RowCount: 0,
      TotalRowCount: 0,
      ExecutionTime: executionTime,
      ErrorMessage: errorMessage,
    };
  }

  private errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
