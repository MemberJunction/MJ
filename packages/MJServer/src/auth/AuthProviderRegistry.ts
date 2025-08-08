import { IAuthProvider } from './IAuthProvider.js';

/**
 * Registry for managing multiple authentication providers
 */
export class AuthProviderRegistry {
  private static instance: AuthProviderRegistry;
  private providers: Map<string, IAuthProvider> = new Map();
  private issuerCache: Map<string, IAuthProvider> = new Map();

  private constructor() {}

  /**
   * Gets the singleton instance of the registry
   */
  static getInstance(): AuthProviderRegistry {
    if (!AuthProviderRegistry.instance) {
      AuthProviderRegistry.instance = new AuthProviderRegistry();
    }
    return AuthProviderRegistry.instance;
  }

  /**
   * Registers a new authentication provider
   */
  register(provider: IAuthProvider): void {
    if (!provider.validateConfig()) {
      throw new Error(`Invalid configuration for provider: ${provider.name}`);
    }

    this.providers.set(provider.name, provider);
    
    // Clear issuer cache when registering new provider
    this.issuerCache.clear();
    
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
  }
}