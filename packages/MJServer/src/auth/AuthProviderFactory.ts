import { AuthProviderConfig } from '@memberjunction/core';
import { IAuthProvider } from './IAuthProvider.js';
import { BaseAuthProvider } from './BaseAuthProvider.js';
import { MJGlobal } from '@memberjunction/global';

// Import providers to ensure they're registered
import './providers/Auth0Provider.js';
import './providers/MSALProvider.js';
import './providers/OktaProvider.js';
import './providers/CognitoProvider.js';
import './providers/GoogleProvider.js';

/**
 * Factory and registry for managing authentication providers
 * Combines provider creation and lifecycle management in a single class
 */
export class AuthProviderFactory {
  private static instance: AuthProviderFactory;
  private providers: Map<string, IAuthProvider> = new Map();
  private issuerCache: Map<string, IAuthProvider> = new Map();
  private issuerMultiCache: Map<string, IAuthProvider[]> = new Map();

  private constructor() {}

  /**
   * Gets the singleton instance of the factory
   */
  static getInstance(): AuthProviderFactory {
    if (!AuthProviderFactory.instance) {
      AuthProviderFactory.instance = new AuthProviderFactory();
    }
    return AuthProviderFactory.instance;
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
    this.issuerCache.clear();
    this.issuerMultiCache.clear();
    
    console.log(`Registered auth provider: ${provider.name} with issuer: ${provider.issuer}`);
  }

  /**
   * Gets a provider by its issuer URL
   */
  getByIssuer(issuer: string): IAuthProvider | undefined {
    // Check cache first
    if (this.issuerCache.has(issuer)) {
      return this.issuerCache.get(issuer);
    }

    // Search through providers
    for (const provider of this.providers.values()) {
      if (provider.matchesIssuer(issuer)) {
        // Cache for future lookups
        this.issuerCache.set(issuer, provider);
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
    if (this.issuerMultiCache.has(issuer)) {
      return this.issuerMultiCache.get(issuer)!;
    }

    const matches: IAuthProvider[] = [];
    for (const provider of this.providers.values()) {
      if (provider.matchesIssuer(issuer)) {
        matches.push(provider);
      }
    }

    if (matches.length > 0) {
      this.issuerMultiCache.set(issuer, matches);
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
    this.issuerCache.clear();
    this.issuerMultiCache.clear();
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