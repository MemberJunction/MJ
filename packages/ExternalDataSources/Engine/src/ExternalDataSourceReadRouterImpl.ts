import { RegisterClass } from "@memberjunction/global";
import {
  EntityInfo,
  ExternalDataSourceReadRouter,
  IMetadataProvider,
  RunQueryParams,
  RunQueryResult,
  RunViewParams,
  RunViewResult,
  UserInfo,
} from "@memberjunction/core";
import { ExternalDataSourceRouter } from "./ExternalDataSourceRouter";
import { ExternalRow, ExternalViewParams } from "./types";

/**
 * Concrete {@link ExternalDataSourceReadRouter} registered for the ClassFactory
 * so foundational providers can reach the External Data Sources engine without a
 * compile-time dependency on it. Translates MJ's RunView/RunQuery shapes to the
 * driver contract and back, delegating driver/credential resolution to
 * {@link ExternalDataSourceRouter} (the BaseSingleton that owns the per-source
 * driver + connection-pool cache).
 */
@RegisterClass(ExternalDataSourceReadRouter)
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
      const viewParams: ExternalViewParams = {
        objectName: entity.ExternalObjectName || entity.BaseTable || entity.Name,
        fields: params.Fields && params.Fields.length ? params.Fields : undefined,
        filter: (params.ExtraFilter as string) || undefined,
        orderBy: (params.OrderBy as string) || undefined,
        maxRows: params.MaxRows && params.MaxRows > 0 ? params.MaxRows : undefined,
        offset: params.StartRow && params.StartRow > 0 ? params.StartRow : undefined,
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
