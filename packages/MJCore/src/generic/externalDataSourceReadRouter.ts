import { EntityInfo } from "./entityInfo";
import { UserInfo } from "./securityInfo";
import { IMetadataProvider, RunViewResult, RunQueryResult } from "./interfaces";
import { RunViewParams } from "../views/runView";
import { RunQueryParams } from "./runQuery";
import { ExternalSchemaDescriptor } from "./externalDataSourceTypes";

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

  /**
   * Returns the cache TTL (in seconds) configured on the external data source — the basis for
   * time-bounded caching of external reads. Unlike MJ-DB entities, external reads can't be
   * event-invalidated (their data changes on the remote system), so callers cache them with a
   * TTL instead. Implementations resolve the `ExternalDataSource` and return its
   * `DefaultCacheTTLSeconds` (falling back to a sane default when unset). A return value of `0`
   * signals "do not cache this source." Resolved through the engine's already-cached data
   * source, so this is cheap to call on the read hot path.
   */
  public abstract GetCacheTTLSeconds(
    externalDataSourceID: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number>;

  /**
   * Introspect the schema of an external data source (its tables/views/collections and their
   * columns), delegating to the resolved driver's `IntrospectSchema`. Used by CodeGen to
   * generate/sync `EntityField` metadata for external-backed entities — the remote analogue of
   * reading `INFORMATION_SCHEMA` for an MJ-DB entity. `schemaName` narrows to a single
   * schema/namespace when supplied. Reached via `MJGlobal.ClassFactory` so build-time consumers
   * stay free of a hard dependency on the engine + driver SDKs.
   */
  public abstract IntrospectExternalSchema(
    externalDataSourceID: string,
    schemaName?: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ExternalSchemaDescriptor>;
}
