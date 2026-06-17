import { UserInfo } from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { CredentialEngine, ResolvedCredential } from "@memberjunction/credentials";
import {
  ExternalConnectionTestResult,
  ExternalSchemaDescriptor,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from "./types";

/**
 * Abstract base for all external data source drivers.
 *
 * A driver proxies **read-only** access to one family of remote systems
 * (Snowflake, Oracle, MongoDB, external SQL Server / PostgreSQL / MySQL, ...).
 * Concrete drivers are registered with `@RegisterClass(BaseExternalDataSourceDriver, '<DriverClass>')`
 * where `<DriverClass>` matches `ExternalDataSourceType.DriverClass`, and are
 * resolved at runtime by {@link ExternalDataSourceRouter} via the MJ ClassFactory.
 *
 * Connection management is each driver's private concern; the abstract contract
 * is parameterized by the driver's connection type `TConnection` (e.g. a `pg`
 * pool client, a Snowflake connection) so no `any` leaks into the base.
 *
 * Secrets are never passed in directly — drivers call {@link resolveCredential}
 * to fetch decrypted values from the Credential Engine using the data source's
 * `CredentialID`. Non-secret config travels in `ExternalDataSource.ConnectionConfig`
 * (see {@link parseConnectionConfig}).
 *
 * @typeParam TConnection - the concrete connection/pool-client type the driver manages.
 */
export abstract class BaseExternalDataSourceDriver<TConnection = unknown> {
  /** Probe connectivity + auth for the given data source without running a user query. */
  public abstract TestConnection(
    dataSource: MJExternalDataSourceEntity,
    contextUser?: UserInfo,
  ): Promise<ExternalConnectionTestResult>;

  /**
   * Introspect the remote schema to assist Entity/EntityField generation.
   * `schemaName` narrows to a single schema/namespace when supplied.
   */
  public abstract IntrospectSchema(
    dataSource: MJExternalDataSourceEntity,
    schemaName: string | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalSchemaDescriptor>;

  /** RunView-equivalent paginated read against a single remote object. */
  public abstract RunView<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    params: ExternalViewParams,
    contextUser?: UserInfo,
  ): Promise<ExternalViewResult<TRow>>;

  /** Load a single remote record by its primary key. Returns null when not found. */
  public abstract LoadSingle<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    objectName: string,
    primaryKey: ExternalQueryParameter,
    contextUser?: UserInfo,
  ): Promise<TRow | null>;

  /**
   * Execute a native-dialect query (used by MJ Queries that set ExternalDataSourceID),
   * enabling full multi-table joins and vendor-specific analytics authored in the
   * remote dialect. `params` are bound, not string-interpolated.
   */
  public abstract RunNativeQuery<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    queryText: string,
    params: ExternalQueryParameter[] | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalQueryResult<TRow>>;

  /**
   * Open or reuse a connection/pool for the given data source. Drivers should
   * cache pools per `ExternalDataSource.ID` and lazily instantiate on first use.
   */
  protected abstract getConnection(
    dataSource: MJExternalDataSourceEntity,
    contextUser?: UserInfo,
  ): Promise<TConnection>;

  /**
   * Resolve and decrypt the credential bound to this data source via the
   * Credential Engine. Returns null when the data source has no CredentialID
   * (anonymous-capable drivers). Drivers that require auth should treat null as
   * an error.
   */
  protected async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(
    dataSource: MJExternalDataSourceEntity,
    contextUser?: UserInfo,
  ): Promise<ResolvedCredential<TCred> | null> {
    if (!dataSource.CredentialID) {
      return null;
    }
    await CredentialEngine.Instance.Config(false, contextUser);
    return CredentialEngine.Instance.getCredential<TCred>('', {
      credentialId: dataSource.CredentialID,
      contextUser,
      subsystem: 'ExternalDataSources',
    });
  }

  /**
   * Parse the non-secret `ConnectionConfig` JSON blob into a typed config object.
   * Returns an empty object when unset. Throws on malformed JSON so the failure
   * surfaces clearly rather than as a downstream undefined-property error.
   */
  protected parseConnectionConfig<TConfig = Record<string, unknown>>(
    dataSource: MJExternalDataSourceEntity,
  ): TConfig {
    if (!dataSource.ConnectionConfig) {
      return {} as TConfig;
    }
    try {
      return JSON.parse(dataSource.ConnectionConfig) as TConfig;
    } catch {
      throw new Error(`ExternalDataSource '${dataSource.Name}' has invalid ConnectionConfig JSON.`);
    }
  }
}
