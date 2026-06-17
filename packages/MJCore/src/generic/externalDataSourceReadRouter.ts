import { EntityInfo } from "./entityInfo";
import { UserInfo } from "./securityInfo";
import { IMetadataProvider, RunViewResult, RunQueryResult } from "./interfaces";
import { RunViewParams } from "../views/runView";
import { RunQueryParams } from "./runQuery";

/**
 * Registration base for the External Data Sources read router — the dependency-
 * inversion seam between foundational data providers and the (server-only)
 * `@memberjunction/external-data-sources` engine.
 *
 * The concrete implementation lives in that engine package and registers itself
 * via `@RegisterClass(ExternalDataSourceReadRouter)`. Providers such as
 * `GenericDatabaseProvider` resolve it lazily through `MJGlobal.ClassFactory`
 * **only** when an entity/query carries an `ExternalDataSourceID`. This keeps
 * `@memberjunction/core` (and the providers that depend on it) free of any hard
 * dependency on the EDS engine, its drivers, or the credential subsystem.
 *
 * If an external entity/query is encountered but no concrete router is
 * registered (the EDS package was never loaded), the provider should surface a
 * clear error rather than fall through to MJ-DB SQL generation.
 */
export abstract class ExternalDataSourceReadRouter {
  /** Proxy a RunView for an entity whose `EntityInfo.ExternalDataSourceID` is set. */
  public abstract RunViewExternal<T = unknown>(
    entity: EntityInfo,
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RunViewResult<T>>;

  /**
   * Proxy a native-dialect MJ Query whose `ExternalDataSourceID` is set.
   * Takes primitives (not the query entity) so this contract stays in
   * `@memberjunction/core` without a circular dependency on core-entities.
   * `sql` is the fully-rendered query text (MJ parameter templating already applied).
   */
  public abstract RunQueryExternal(
    externalDataSourceID: string,
    queryID: string,
    queryName: string,
    sql: string,
    params: RunQueryParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RunQueryResult>;
}
