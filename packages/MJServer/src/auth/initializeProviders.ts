import { configInfo } from '../config.js';
import { AuthProviderConfig, LogError, LogStatus, LogStatusEx, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { AuthProviderEngine } from './AuthProviderEngine.js';

/**
 * Initialize authentication providers from configuration.
 *
 * Registers everything declared in `mj.config.cjs`'s `authProviders` array. This remains the
 * baseline path and runs on every boot: it needs no database, so it is what lets the server
 * authenticate even when metadata is unreachable.
 *
 * Providers defined in the `MJ: Authentication Providers` catalog are layered on top by
 * {@link initializeAuthProvidersFromMetadata}, which runs later in startup once a database
 * connection and a system user exist.
 */
export function initializeAuthProviders(): void {
  const factory = AuthProviderFactory.Instance;

  // Clear any existing providers
  factory.clear();

  // Environment-derived providers are DEFAULTS: each provider class maps its own variables via
  // the ConfigFromEnvironment hook, and they apply only when the config file declares no
  // providers of its own. That mirrors the previous behaviour exactly — the env block used to sit
  // in DEFAULT_SERVER_CONFIG, and mergeConfigs replaces (rather than concatenates) arrays, so an
  // explicit `authProviders` in mj.config.cjs has always suppressed the env-derived set.
  //
  // Written back into configInfo.authProviders rather than kept local because that array is the
  // live registry other code reads and appends to (registerMagicLinkAuthProvider pushes into it so
  // a later re-initialize keeps magic-link).
  if (!configInfo.authProviders || configInfo.authProviders.length === 0) {
    const discovered = AuthProviderFactory.DiscoverFromEnvironment();
    if (discovered.length > 0) {
      configInfo.authProviders = discovered;
      LogStatusEx({
        message: `[Auth] Configured ${discovered.length} provider(s) from environment variables: ${discovered.map((p) => p.name).join(', ')}`,
        verboseOnly: true
      });
    }
  }

  // Initialize providers from authProviders config
  if (configInfo.authProviders && configInfo.authProviders.length > 0) {
    for (const providerConfig of configInfo.authProviders) {
      try {
        const provider = AuthProviderFactory.createProvider(providerConfig as AuthProviderConfig);
        // register() emits the verbose-only "Registered auth provider: … with issuer: …" line
        // (gated by the global verbose flag). Provider NAMES are surfaced compactly in the
        // startup summary `Auth` line at `standard`.
        factory.register(provider);
      } catch (error) {
        LogError(`Failed to initialize auth provider ${providerConfig.name}: ${error}`);
      }
    }
  }

  // NOTE: the "no providers configured" check deliberately does NOT live here any more — see
  // validateAuthProvidersRegistered(). A metadata-only deployment legitimately has an empty
  // authProviders array at this point, and erroring here would cry wolf on every boot.
}

/**
 * Layers the metadata provider catalog on top of the config-declared providers.
 *
 * Called after the data provider and system user are available. Metadata rows are registered in
 * addition to — not instead of — the config-declared ones: a deployment mid-migration may
 * legitimately have both, and a name collision resolves to the metadata row because it registers
 * last and `AuthProviderFactory.register` keys by provider name.
 *
 * Never throws. An unreachable or empty catalog leaves the config-declared providers exactly as
 * they were, which is what makes adopting this feature a no-op for existing deployments and keeps
 * a metadata problem from turning into a lockout.
 *
 * @returns the number of providers registered from metadata.
 */
export async function initializeAuthProvidersFromMetadata(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
  try {
    await AuthProviderEngine.Instance.Config(false, contextUser, provider);
    const count = await AuthProviderEngine.Instance.RegisterAll(contextUser);
    if (count > 0) {
      LogStatus(`[Auth] ${count} authentication provider(s) registered from metadata.`);
    }
    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    LogError(`[Auth] Could not load the authentication provider catalog from metadata (${message}). Continuing with providers from mj.config.cjs.`);
    return 0;
  }
}

/**
 * Rebuilds the provider registry from scratch: config-declared providers first, then the
 * metadata catalog layered on top — the same two-source order as startup.
 *
 * This is THE entry point for reacting to a catalog edit at runtime (an admin page's Save
 * button, a future invalidation hook). A full rebuild is required because the factory caches
 * issuer→provider resolutions, so an edited row would otherwise keep serving its old
 * configuration until the process restarted. It lives here rather than on `AuthProviderEngine`
 * because a bare `factory.clear()` + metadata re-registration would silently drop everything
 * the config path registered — magic-link included — and no caller should have to know to put
 * those back. `initializeAuthProviders()` clears the factory itself, so no separate clear step
 * exists for a caller to forget.
 *
 * **Failure policy: abort-before-mutate.** Everything that can throw — the catalog reload and
 * the permission probe on its result — runs BEFORE the factory is touched, so a failed refresh
 * leaves the registry serving the previous (stale but complete) provider set and surfaces the
 * error to the caller. This is deliberately the opposite of `initializeAuthProvidersFromMetadata`,
 * which swallows metadata failures: at boot there is no previous registry to preserve and a
 * metadata problem must not become a lockout, while at refresh time there is one and the caller
 * (an admin UI) wants the error. That difference in failure policy is why this function does not
 * simply delegate to its sibling.
 *
 * Known limitation, acceptable for an admin-triggered operation: metadata providers are absent
 * from the registry for the duration of `RegisterAll`'s per-row config builds (config-declared
 * providers are restored synchronously). A request bearing a metadata-declared IdP's token in
 * that window is rejected. If a caller ever needs an atomic swap, build the configs first and
 * register them in one synchronous pass.
 *
 * @returns the number of providers registered from metadata after the refresh.
 */
export async function refreshAuthProviders(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
  await AuthProviderEngine.Instance.Config(true, contextUser, provider);

  // Probe the reloaded catalog BEFORE clearing anything: reading Providers throws
  // PermissionConstrainedError when the load was skipped for permission reasons, and that
  // failure must abort the refresh while the registry is still intact.
  const pendingRows = AuthProviderEngine.Instance.Providers.length;

  initializeAuthProviders();
  const count = await AuthProviderEngine.Instance.RegisterAll(contextUser);
  LogStatus(
    `[Auth] Provider registry refreshed — ${count} of ${pendingRows} metadata provider(s) registered on top of the config-declared set.`
  );
  return count;
}

/**
 * Reports whether any provider is registered, from either source, and logs a diagnostic when none
 * is.
 *
 * Split out from {@link initializeAuthProviders} because "no providers" is only genuinely wrong
 * once BOTH sources have had their turn.
 */
export function validateAuthProvidersRegistered(): boolean {
  const hasProviders = AuthProviderFactory.Instance.hasProviders();
  if (!hasProviders) {
    LogError(
      'No authentication providers are configured. Define them in the "MJ: Authentication Providers" metadata entity, ' +
        'or in the authProviders array in mj.config.cjs.'
    );
  }
  return hasProviders;
}
