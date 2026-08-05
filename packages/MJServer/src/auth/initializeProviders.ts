import { configInfo } from '../config.js';
import { AuthProviderConfig, LogError, LogStatus, UserInfo, type IMetadataProvider } from '@memberjunction/core';
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
