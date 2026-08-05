/**
 * @fileoverview Metadata-driven authentication provider catalog.
 *
 * Loads `MJ: Authentication Providers` rows and registers each one with the runtime
 * `AuthProviderFactory`, resolving the concrete driver through `ClassFactory` by `DriverClass`.
 * This is the auth subsystem's equivalent of the File Storage `ServerDriverKey` pattern:
 * adding a provider is a subclass plus a row, never an edit to core code.
 *
 * @module @memberjunction/server/auth
 */

import {
  BaseEngine,
  BaseEnginePropertyConfig,
  LogError,
  LogStatus,
  LogStatusEx,
  RegisterForStartup,
  UserInfo,
  type AuthProviderConfig,
  type IMetadataProvider,
  type PublicAuthProviderInfo
} from '@memberjunction/core';
import { MJAuthenticationProviderEntity } from '@memberjunction/core-entities';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { CredentialEngine } from '@memberjunction/credentials';

/**
 * Subsystem label used when this engine asks CredentialEngine to decrypt secret material,
 * so credential-access auditing attributes the read to authentication.
 */
const CREDENTIAL_SUBSYSTEM = 'Authentication';

/**
 * Loads the authentication-provider catalog from metadata and registers it with the
 * {@link AuthProviderFactory}.
 *
 * **Not `deferred`**: no authenticated request may be served before the catalog is registered,
 * or tokens from a metadata-defined provider would be rejected during the startup window.
 *
 * **Severity is `warn`, not `fatal`**, and that is deliberate. This engine is one of two possible
 * sources of providers — `initializeAuthProviders` also registers whatever `mj.config.cjs`
 * declares. Making a catalog load failure fatal would turn a transient metadata problem into a
 * total authentication outage for deployments that never adopted the table. The failure is
 * logged loudly and the config-declared providers still stand.
 */
@RegisterForStartup({
  priority: 20,
  severity: 'warn',
  deferred: false,
  description: 'Loads the metadata authentication-provider catalog and registers it with AuthProviderFactory'
})
export class AuthProviderEngine extends BaseEngine<AuthProviderEngine> {
  private _providers: MJAuthenticationProviderEntity[] = [];

  public static get Instance(): AuthProviderEngine {
    return super.getInstance<AuthProviderEngine>();
  }

  /**
   * Loads Active providers only. Inactive rows are excluded at the query rather than filtered
   * later, so a disabled provider is never even instantiated.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        PropertyName: '_providers',
        EntityName: 'MJ: Authentication Providers',
        Filter: `Status='Active'`,
        OrderBy: 'Sequence ASC, Name ASC',
        CacheLocal: true
      }
    ];
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  /** Active providers from metadata, ordered for presentation. */
  public get Providers(): MJAuthenticationProviderEntity[] {
    return this.GetConfigData<MJAuthenticationProviderEntity>('_providers');
  }

  /**
   * Startup hook: load the catalog, then register every row with the factory.
   */
  public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    await this.Config(false, contextUser, provider);
    await this.RegisterAll(contextUser);
  }

  /**
   * Instantiates and registers every catalog row with the {@link AuthProviderFactory}.
   *
   * One bad row must not cost the deployment its other providers, so each registration is
   * isolated: a failure is logged with the offending provider's name and the loop continues.
   *
   * @returns the number of providers successfully registered.
   */
  public async RegisterAll(contextUser?: UserInfo): Promise<number> {
    const factory = AuthProviderFactory.Instance;
    let registered = 0;

    for (const row of this.Providers) {
      try {
        const config = await this.BuildProviderConfig(row, contextUser);
        factory.register(AuthProviderFactory.createProvider(config));
        registered++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`[Auth] Could not register metadata provider '${row.Name}' (DriverClass '${row.DriverClass}'): ${message}`);
      }
    }

    if (registered > 0) {
      LogStatusEx({ message: `[Auth] Registered ${registered} provider(s) from metadata.`, verboseOnly: true });
    }
    return registered;
  }

  /**
   * Reloads the catalog and re-registers every provider.
   *
   * Required because the factory caches issuer→provider resolutions: editing a row would
   * otherwise keep serving the old configuration until the process restarted, which would make
   * the admin UI misleading. `factory.clear()` drops those caches, and providers declared in
   * `mj.config.cjs` are re-registered by the caller afterwards.
   *
   * @returns the number of providers registered from metadata after the refresh.
   */
  public async Refresh(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
    await this.Config(true, contextUser, provider);
    AuthProviderFactory.Instance.clear();
    const count = await this.RegisterAll(contextUser);
    LogStatus(`[Auth] Provider catalog refreshed — ${count} provider(s) registered from metadata.`);
    return count;
  }

  /**
   * Projects a catalog row onto the runtime {@link AuthProviderConfig} the driver expects.
   *
   * `AdditionalConfiguration` is spread FIRST so that the modelled columns win over anything a
   * driver-specific blob happens to repeat — the columns are the reviewable, described surface,
   * and a JSON blob must not be able to silently redefine the issuer a token is validated against.
   */
  private async BuildProviderConfig(row: MJAuthenticationProviderEntity, contextUser?: UserInfo): Promise<AuthProviderConfig> {
    const additional = this.ParseJsonColumn(row.AdditionalConfiguration, row.Name, 'AdditionalConfiguration');
    const secrets = await this.ResolveCredential(row, contextUser);

    const config: AuthProviderConfig = {
      ...additional,
      ...secrets,
      name: row.Name,
      type: row.DriverClass
    };

    if (row.ClientID) config.clientId = row.ClientID;
    if (row.Domain) config.domain = row.Domain;
    if (row.Issuer) config.issuer = row.Issuer;
    if (row.Audience) config.audience = row.Audience;
    if (row.JWKSUri) config.jwksUri = row.JWKSUri;
    if (row.Scopes) config.scopes = row.Scopes.split(/[\s,]+/).filter((s) => s.length > 0);

    return config;
  }

  /**
   * Decrypts the row's linked credential, when it has one.
   *
   * Almost every provider validates tokens against a public JWKS and needs no secret at all, so
   * this is the uncommon path — present for confidential-client flows, management APIs, and SCIM.
   */
  private async ResolveCredential(row: MJAuthenticationProviderEntity, contextUser?: UserInfo): Promise<Record<string, string>> {
    if (!row.CredentialID || !row.Credential) {
      return {};
    }

    await CredentialEngine.Instance.Config(false, contextUser);
    const resolved = await CredentialEngine.Instance.getCredential(row.Credential, {
      contextUser,
      subsystem: CREDENTIAL_SUBSYSTEM
    });
    return resolved.values;
  }

  /**
   * Parses a JSON configuration column, treating malformed content as absent.
   *
   * Throwing here would take down an otherwise-valid provider over a stray character in an
   * optional extras blob, so the row is registered without the extras and the problem is logged.
   */
  private ParseJsonColumn(raw: string | null, providerName: string, columnName: string): Record<string, unknown> {
    if (!raw?.trim()) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      LogError(`[Auth] ${columnName} on provider '${providerName}' is not a JSON object; ignoring it.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`[Auth] ${columnName} on provider '${providerName}' is not valid JSON (${message}); ignoring it.`);
    }
    return {};
  }

  /**
   * Projects the catalog to the PUBLIC shape served by the unauthenticated catalog endpoint.
   *
   * The projection is an explicit allow-list rather than a redaction of the full row: a column
   * added to this entity later is invisible to anonymous callers until someone deliberately adds
   * it here. `AdditionalConfiguration` and `CredentialID` are structurally absent, never merely
   * omitted at serialization time.
   */
  public GetPublicCatalog(): PublicAuthProviderInfo[] {
    return this.Providers.filter((row) => row.ClientVisible).map((row) => {
      const info: PublicAuthProviderInfo = {
        name: row.Name,
        driverClass: row.DriverClass,
        displayName: row.DisplayName ?? row.Name,
        sequence: row.Sequence,
        isDefault: row.IsDefault
      };

      if (row.Icon) info.icon = row.Icon;
      if (row.ClientID) info.clientId = row.ClientID;
      if (row.Issuer) info.issuer = row.Issuer;
      if (row.Domain) info.domain = row.Domain;
      if (row.Scopes) info.scopes = row.Scopes;

      const clientConfig = this.ParseJsonColumn(row.ClientConfiguration, row.Name, 'ClientConfiguration');
      if (Object.keys(clientConfig).length > 0) {
        info.clientConfiguration = this.ToPublicClientConfig(clientConfig, row.Name);
      }

      return info;
    });
  }

  /**
   * Flattens a parsed `ClientConfiguration` blob to the primitive key/value shape the browser
   * contract declares. Nested objects and arrays are dropped with a warning rather than passed
   * through, so a structured blob (the shape a credential would take) cannot ride along to an
   * anonymous caller.
   */
  private ToPublicClientConfig(parsed: Record<string, unknown>, providerName: string): Record<string, string | number | boolean | null> {
    const result: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        result[key] = value as string | number | boolean | null;
      } else {
        LogError(`[Auth] ClientConfiguration key '${key}' on provider '${providerName}' is not a primitive value; it was NOT published to the public catalog.`);
      }
    }
    return result;
  }
}
