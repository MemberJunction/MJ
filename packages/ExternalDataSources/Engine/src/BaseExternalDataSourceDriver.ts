import { UserInfo, ExternalSchemaDescriptor } from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { CredentialEngine, ResolvedCredential } from "@memberjunction/credentials";
import {
  ExternalConnectionTestResult,
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

  /**
   * Secure-transport gate for SQL-style drivers. Refuses to connect to a NON-LOCAL host over an
   * unencrypted connection unless the caller explicitly opted in via `allowInsecureTransport`.
   * Local hosts (localhost / 127.0.0.1 / ::1 / empty) are exempt so dev/test against a local DB
   * just works. Fail-loud + secure-by-default, with a conscious opt-out for the rare legitimate
   * plaintext remote — drivers whose transport is always encrypted (e.g. Snowflake HTTPS) don't call this.
   */
  protected assertSecureTransport(opts: {
    host: string | undefined;
    tlsEnabled: boolean;
    allowInsecure: boolean | undefined;
    dataSourceName: string;
  }): void {
    if (opts.tlsEnabled || opts.allowInsecure) {
      return;
    }
    const host = (opts.host ?? '').trim().toLowerCase();
    const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
      throw new Error(
        `Refusing to connect to external data source '${opts.dataSourceName}' at '${host}' over an unencrypted connection. ` +
          `Enable TLS in ConnectionConfig, or set "allowInsecureTransport": true to explicitly accept a plaintext connection.`,
      );
    }
  }

  /**
   * Evict (and close) the cached connection/pool for a data source so the next operation
   * re-resolves its credential and reconnects. Called by {@link withConnectionRetry} on an auth
   * failure. Implementations must be safe to call when nothing is cached for the id.
   */
  protected abstract invalidateConnection(dataSourceId: string): Promise<void>;

  /**
   * Runs a read operation and, if it fails with what looks like an auth/credential error, evicts
   * the cached connection (so the retry re-resolves the credential and reconnects) and retries
   * exactly once. This self-heals the common "credential rotated / token expired while a pooled
   * connection was cached" case without a process restart. Safe because external reads are
   * idempotent; non-auth errors propagate immediately with no retry.
   */
  protected async withConnectionRetry<T>(
    dataSource: MJExternalDataSourceEntity,
    op: () => Promise<T>,
  ): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (!this.isAuthError(e)) {
        throw e;
      }
      await this.invalidateConnection(dataSource.ID);
      return await op();
    }
  }

  /**
   * Heuristic: does this error look like an authentication/authorization failure (vs. a query or
   * network error)? Drives {@link withConnectionRetry}'s decision to re-resolve + retry. Drivers
   * may override for vendor-specific error codes.
   */
  protected isAuthError(e: unknown): boolean {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      msg.includes('password') ||
      msg.includes('authentic') ||   // authentication / authenticate
      msg.includes('authoriz') ||    // authorization / unauthorized / "not authorized"
      msg.includes('credential') ||
      msg.includes('login failed') ||
      msg.includes('access denied') ||
      msg.includes('permission denied') ||
      msg.includes('28p01') ||       // PostgreSQL invalid_password
      msg.includes('28000')          // PostgreSQL/ANSI invalid_authorization_specification
    );
  }
}
