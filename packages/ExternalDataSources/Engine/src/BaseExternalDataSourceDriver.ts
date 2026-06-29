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
   * Only explicit loopback literals (localhost / *.localhost / 127.0.0.0/8 / ::1) are treated as
   * local. It **fails closed**: an empty or unparseable host is NOT assumed local — that would be a
   * plaintext-leak hole (an unset host can still resolve to a remote default), so it is refused
   * unless TLS or the explicit opt-out is set. Detection is name-based (no DNS resolution), which is
   * a deliberate trade-off: a name that resolves to loopback but isn't a recognized literal is
   * refused rather than silently allowed. Drivers whose transport is always encrypted (e.g. Snowflake
   * HTTPS) don't call this.
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
    // Normalize and strip IPv6 brackets (e.g. "[::1]" -> "::1").
    const host = (opts.host ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    const isLocal =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '::1' ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host); // 127.0.0.0/8 loopback range
    if (!isLocal) {
      throw new Error(
        `Refusing to connect to external data source '${opts.dataSourceName}' at '${host || '<unspecified host>'}' over an unencrypted connection. ` +
          `Enable TLS in ConnectionConfig, or set "allowInsecureTransport": true to explicitly accept a plaintext connection.`,
      );
    }
  }

  /** Render an arbitrary thrown value as a human-readable message string. Shared by all drivers. */
  protected errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
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
      // Evict the cached connection so the retry re-resolves the credential. A failure while
      // closing a half-dead pool must not supplant the original auth error or skip the retry.
      try {
        await this.invalidateConnection(dataSource.ID);
      } catch { /* best-effort eviction; proceed to the retry regardless */ }
      return await op();
    }
  }

  /**
   * Does this error look like an authentication/credential failure (vs. a query or network error)?
   * Drives {@link withConnectionRetry}'s decision to re-resolve the credential + retry once.
   *
   * Prefers structured vendor error codes (SQLSTATE / driver error numbers) over message-text
   * matching — codes are locale-independent and don't false-positive on, say, a table named
   * `password_resets` or an object-level "permission denied" that isn't a credential failure. The
   * message heuristic remains a fallback for drivers/paths that don't surface a code, but the two
   * most false-positive-prone substrings ('password', 'permission denied') were dropped in favor of
   * the codes + more specific phrases. Drivers may override for additional vendor-specific codes.
   */
  protected isAuthError(e: unknown): boolean {
    const code = this.extractErrorCode(e);
    if (code && BaseExternalDataSourceDriver.AuthErrorCodes.has(code)) {
      return true;
    }
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      msg.includes('authentic') ||   // authentication / authenticate
      msg.includes('authoriz') ||    // authorization / unauthorized / "not authorized"
      msg.includes('credential') ||
      msg.includes('login failed') ||
      msg.includes('access denied') ||
      msg.includes('28p01') ||       // PostgreSQL invalid_password (precise SQLSTATE, low false-positive risk)
      msg.includes('28000')          // PostgreSQL/ANSI invalid_authorization_specification
    );
  }

  /**
   * Known authentication/credential SQLSTATEs + driver error numbers across the supported engines:
   * PostgreSQL 28P01/28000; MySQL 1044/1045/1698; SQL Server 4060/18452/18456/18470;
   * Oracle 1017/1031/28000. Used by {@link isAuthError} as the primary (locale-independent) signal.
   */
  private static readonly AuthErrorCodes = new Set<string>([
    '28P01', '28000', '1044', '1045', '1698', '4060', '18452', '18456', '18470', '1017', '1031',
  ]);

  /** Pull a structured error code off the common driver error shapes (code / errno / errorNum / number). */
  private extractErrorCode(e: unknown): string | undefined {
    if (e && typeof e === 'object') {
      const err = e as { code?: unknown; errno?: unknown; errorNum?: unknown; number?: unknown };
      for (const c of [err.code, err.errno, err.errorNum, err.number]) {
        if (c != null && c !== '') {
          return String(c).toUpperCase();
        }
      }
    }
    return undefined;
  }
}
