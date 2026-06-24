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
import { ExternalDataSourceRouter } from "./ExternalDataSourceRouter";
import { ExternalRow, ExternalViewParams } from "./types";

/** Fallback cache TTL (seconds) when a data source has no DefaultCacheTTLSeconds configured. Matches the plan's default. */
const DEFAULT_EXTERNAL_CACHE_TTL_SECONDS = 300;

/**
 * Default upper bound on rows fetched from a remote source when a RunView supplies no MaxRows
 * and the entity has no UserViewMaxRows. Prevents an unbounded pull from a large external table.
 */
const DEFAULT_EXTERNAL_MAX_ROWS = 1000;

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
      const { driver, dataSource } = await ExternalDataSourceRouter.Instance.resolve(
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
      if (!orderBy && offset != null && entity.PrimaryKeys.length > 0) {
        orderBy = entity.PrimaryKeys.map((pk) => pk.Name).join(', ');
      }
      const viewParams: ExternalViewParams = {
        objectName: entity.ExternalObjectName || entity.BaseTable || entity.Name,
        fields: params.Fields && params.Fields.length ? params.Fields : undefined,
        filter: (params.ExtraFilter as string) || undefined,
        orderBy,
        // Bound the fetch: explicit MaxRows wins; else the entity's UserViewMaxRows; else a sane
        // default cap so an unbounded RunView can't stream an entire remote table. This is the
        // external-path analogue of the MJ-DB branch's UserViewMaxRows cap (which the external
        // dispatch returns before reaching).
        maxRows:
          params.MaxRows && params.MaxRows > 0
            ? params.MaxRows
            : entity.UserViewMaxRows && entity.UserViewMaxRows > 0
              ? entity.UserViewMaxRows
              : DEFAULT_EXTERNAL_MAX_ROWS,
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
      const { driver, dataSource } = await ExternalDataSourceRouter.Instance.resolve(externalDataSourceID, contextUser, provider);
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
      const { dataSource } = await ExternalDataSourceRouter.Instance.resolve(externalDataSourceID, contextUser, provider);
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
    const { driver, dataSource } = await ExternalDataSourceRouter.Instance.resolve(externalDataSourceID, contextUser, provider);
    return driver.IntrospectSchema(dataSource, schemaName, contextUser);
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
