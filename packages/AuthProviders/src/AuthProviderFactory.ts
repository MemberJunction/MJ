import { AuthProviderConfig, LogStatusEx } from '@memberjunction/core';
import { IAuthProvider } from './IAuthProvider.js';
import { BaseAuthProvider } from './BaseAuthProvider.js';
import { isEnvironmentConfigurable } from './IEnvironmentConfigurableProvider.js';
import { MJGlobal, BaseSingleton, MJLruCache } from '@memberjunction/global';

// NOTE: this file deliberately contains NO list of concrete providers.
//
// It used to carry a literal `import './providers/Auth0Provider.js'` roster, which made the
// built-ins look like a closed set that had to be edited to add a provider. They never were:
// providers are @RegisterClass plugins resolved by key, and `index.ts` already exports all of
// them by name, so importing anything from '@memberjunction/auth-providers' loads and registers
// every built-in. HostIdentityProvider — added later — was never in that roster and has always
// registered fine through the package entry point and the server-bootstrap manifest, which is
// the proof the roster was redundant rather than load-bearing.
//
// Adding a provider is therefore: ship a @RegisterClass(BaseAuthProvider, 'x') subclass (in this
// package, or in any package covered by a class-registration manifest) and add an
// `MJ: Authentication Providers` row naming 'x' as its DriverClass. No edit here.

/**
 * Factory and registry for managing authentication providers
 * Combines provider creation and lifecycle management in a single class
 */
export class AuthProviderFactory extends BaseSingleton<AuthProviderFactory> {
  private providers: Map<string, IAuthProvider> = new Map();
  /**
   * Cache of resolved issuer → provider mappings. Bounded LRU(50) — prior
   * unbounded `Map` was a low-effort DoS vector: a misconfigured/malicious
   * client supplying arbitrary issuer URLs would walk the map up indefinitely.
   * In production there should never be more than a handful of legitimate
   * issuers. See audit R2-C4.
   */
  private issuerCache: MJLruCache<string, IAuthProvider> = new MJLruCache<string, IAuthProvider>({ maxSize: 50 });
  /**
   * Cache of issuer → all matching providers. Same LRU bound as `issuerCache`.
   */
  private issuerMultiCache: MJLruCache<string, IAuthProvider[]> = new MJLruCache<string, IAuthProvider[]>({ maxSize: 50 });

  public constructor() {
    super();
  }

  /**
   * Gets the singleton instance of the factory
   */
  public static get Instance(): AuthProviderFactory {
    return AuthProviderFactory.getInstance<AuthProviderFactory>();
  }

  /**
   * Creates an authentication provider instance based on configuration
   * Uses MJGlobal ClassFactory to instantiate the correct provider class
   */
  static createProvider(config: AuthProviderConfig): IAuthProvider {
    try {
      // Use MJGlobal ClassFactory to create the provider instance
      // The provider type in config should match the key used in @RegisterClass
      // The config is passed as a constructor parameter via the spread operator
      const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAuthProvider>(
        BaseAuthProvider,
        config.type.toLowerCase(),
        config
      );
      
      if (!provider) {
        throw new Error(`No provider registered for type: ${config.type}`);
      }
      
      return provider;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create authentication provider for type '${config.type}': ${message}`);
    }
  }

  /**
   * Registers a new authentication provider
   */
  register(provider: IAuthProvider): void {
    if (!provider.validateConfig()) {
      throw new Error(`Invalid configuration for provider: ${provider.name}`);
    }

    this.providers.set(provider.name, provider);

    // Clear issuer caches when registering new provider
    this.issuerCache.Clear();
    this.issuerMultiCache.Clear();
    
    // Verbose-only: provider NAMES are surfaced compactly in the server startup summary
    // `Auth` line at standard level. Routes through the global verbose gate (set from the
    // server's telemetry.level) so it's reusable by any consumer of this generic package.
    LogStatusEx({ message: `Registered auth provider: ${provider.name} with issuer: ${provider.issuer}`, verboseOnly: true });
  }

  /**
   * Gets a provider by its issuer URL
   */
  getByIssuer(issuer: string): IAuthProvider | undefined {
    // Check cache first
    const cached = this.issuerCache.Get(issuer);
    if (cached) {
      return cached;
    }

    // Search through providers
    for (const provider of this.providers.values()) {
      if (provider.matchesIssuer(issuer)) {
        // Cache for future lookups
        this.issuerCache.Set(issuer, provider);
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Gets all providers matching an issuer URL.
   * Unlike getByIssuer() which returns only the first match, this returns
   * all providers for a given issuer. This is needed when multiple apps
   * (e.g. MJExplorer + MJCentral) share the same Auth0 domain but have
   * different audiences (client IDs).
   */
  getAllByIssuer(issuer: string): IAuthProvider[] {
    // Check multi-provider cache first
    const cached = this.issuerMultiCache.Get(issuer);
    if (cached) {
      return cached;
    }

    const matches: IAuthProvider[] = [];
    for (const provider of this.providers.values()) {
      if (provider.matchesIssuer(issuer)) {
        matches.push(provider);
      }
    }

    if (matches.length > 0) {
      this.issuerMultiCache.Set(issuer, matches);
    }

    return matches;
  }

  /**
   * Gets a provider by its name
   */
  getByName(name: string): IAuthProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Gets all registered providers
   */
  getAllProviders(): IAuthProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Checks if any providers are registered
   */
  hasProviders(): boolean {
    return this.providers.size > 0;
  }

  /**
   * Clears all registered providers (useful for testing)
   */
  clear(): void {
    this.providers.clear();
    this.issuerCache.Clear();
    this.issuerMultiCache.Clear();
  }

  /**
   * Gets all registered provider types from the ClassFactory
   */
  static getRegisteredProviderTypes(): string[] {
    // Get all registrations for BaseAuthProvider from ClassFactory
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseAuthProvider);
    // Extract unique keys (provider types) from registrations
    const providerTypes = registrations
      .map(reg => reg.Key)
      .filter((key): key is string => key !== null && key !== undefined);
    // Return unique provider types
    return Array.from(new Set(providerTypes));
  }

  /**
   * Collects provider configurations from environment variables by asking every registered
   * provider class to configure itself.
   *
   * This replaces the hard-coded env block that used to live in MJServer's config and
   * enumerated Entra / Auth0 / Cognito inline. Discovery is now driven by the same
   * `@RegisterClass` registry that resolves drivers, so a third-party provider gets the
   * env-var experience without a core edit — see {@link IEnvironmentConfigurableProvider}.
   *
   * A provider whose variables are absent returns null and is skipped. A provider whose
   * mapping throws is skipped with an error rather than taking down startup, because one
   * malformed mapping must not cost a deployment its other providers.
   *
   * @param env Environment to read from; defaults to `process.env`.
   * @returns One config per provider that found its variables, deduplicated by name.
   */
  static DiscoverFromEnvironment(env: NodeJS.ProcessEnv = process.env): AuthProviderConfig[] {
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseAuthProvider);
    const configs = new Map<string, AuthProviderConfig>();

    for (const registration of registrations) {
      const providerClass: unknown = registration.SubClass;
      if (!isEnvironmentConfigurable(providerClass)) {
        continue;
      }
      try {
        const config = providerClass.ConfigFromEnvironment(env);
        if (config && !configs.has(config.name)) {
          configs.set(config.name, config);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogStatusEx({
          message: `Auth provider '${registration.Key}' failed to build a configuration from environment variables: ${message}`,
          verboseOnly: true
        });
      }
    }

    return Array.from(configs.values());
  }

  /**
   * Checks if a provider type is registered
   */
  static isProviderTypeRegistered(type: string): boolean {
    try {
      // Try to get the registration for this specific type
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAuthProvider, type.toLowerCase());
      return registration !== null && registration !== undefined;
    } catch {
      return false;
    }
  }
}