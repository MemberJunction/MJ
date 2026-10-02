import { Injectable, Injector } from '@angular/core';
import { MJGlobal, GetGlobalObjectStore } from '@memberjunction/global';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { IAngularAuthProvider, AngularAuthProviderConfig } from './IAuthProvider';

/**
 * Factory for creating Angular authentication providers
 * Uses MJGlobal ClassFactory pattern for extensibility
 */
@Injectable({
  providedIn: 'root'
})
export class AngularAuthProviderFactory {
  private static readonly _globalStoreKey = '___SINGLETON__AngularAuthProviderFactory';
  private providers: Map<string, IAngularAuthProvider> = new Map();
  private providerConfigs: Map<string, any> = new Map();

  constructor(private injector: Injector) {
    const g = GetGlobalObjectStore()!;
    if (g[AngularAuthProviderFactory._globalStoreKey]) {
      return g[AngularAuthProviderFactory._globalStoreKey] as AngularAuthProviderFactory;
    }
    g[AngularAuthProviderFactory._globalStoreKey] = this;
  }

  /**
   * Get singleton instance
   */
  public static get Instance(): AngularAuthProviderFactory {
    const instance = GetGlobalObjectStore()![AngularAuthProviderFactory._globalStoreKey] as AngularAuthProviderFactory;
    if (!instance) {
      throw new Error('AngularAuthProviderFactory not initialized. Ensure it is provided in your module.');
    }
    return instance;
  }

  /**
   * Create a provider based on configuration
   */
  CreateProvider(config: AngularAuthProviderConfig): IAngularAuthProvider {
    
    const existingProvider = this.providers.get(config.type);
    if (existingProvider) {
      return existingProvider;
    }

    try {
      // Use MJGlobal ClassFactory to create the provider instance
      // Pass config as the first constructor argument
      const provider = MJGlobal.Instance.ClassFactory.CreateInstance<MJAuthBase>(
        MJAuthBase, 
        config.type,
        config  // Pass config as constructor argument, not injector
      );

      if (!provider) {
        throw new Error(`No provider registered for type: ${config.type}. Available types: ${this.GetRegisteredTypes().join(', ')}`);
      }

      // Validate the configuration
      if (!provider.validateConfig(config)) {
        throw new Error(`Invalid configuration for provider type: ${config.type}`);
      }

      // Store the provider instance
      this.providers.set(config.type, provider);
      this.providerConfigs.set(config.type, config);

      return provider;
    } catch (error) {
      console.error(`Failed to create auth provider for type ${config.type}:`, error);
      throw error;
    }
  }

  /** @deprecated Use {@link CreateProvider}. */
  createProvider(config: AngularAuthProviderConfig): IAngularAuthProvider {
    return this.CreateProvider(config);
  }

  /**
   * Get a provider by type
   */
  GetProvider(type: string): IAngularAuthProvider | undefined {
    return this.providers.get(type);
  }

  /** @deprecated Use {@link GetProvider}. */
  getProvider(type: string): IAngularAuthProvider | undefined {
    return this.GetProvider(type);
  }

  /**
   * Get all registered provider types
   */
  GetRegisteredTypes(): string[] {
    const registrations = MJGlobal.Instance.ClassFactory.GetRegistrationsByRootClass(MJAuthBase);
    const types = registrations.map(reg => reg.Key).filter((key): key is string => key !== null);
    // Return unique types only, as multiple classes can be registered with the same key
    return [...new Set(types)];
  }

  /** @deprecated Use {@link GetRegisteredTypes}. */
  getRegisteredTypes(): string[] {
    return this.GetRegisteredTypes();
  }

  /**
   * Check if a provider type is registered
   */
  IsTypeRegistered(type: string): boolean {
    return this.GetRegisteredTypes().includes(type);
  }

  /** @deprecated Use {@link IsTypeRegistered}. */
  isTypeRegistered(type: string): boolean {
    return this.IsTypeRegistered(type);
  }

  /**
   * Clear all providers (useful for testing)
   */
  ClearProviders(): void {
    this.providers.clear();
    this.providerConfigs.clear();
  }

  /** @deprecated Use {@link ClearProviders}. */
  clearProviders(): void {
    return this.ClearProviders();
  }

  /**
   * Get provider-specific Angular services that need to be injected
   * This uses the static angularProviderFactory property on each provider class for extensibility
   */
  static GetProviderAngularServices(type: string, environment: any): any[] {
    
    const normalizedType = type?.toLowerCase();
    
    // Get the provider class from the ClassFactory
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
      MJAuthBase, 
      normalizedType
    );
    const providerClass = registration?.SubClass as any;
    
    if (!providerClass) {
      console.warn(`No provider class registered for type: ${type}`);
      return [];
    }
    
    // Check if the provider class has the factory property (new pattern)
    if (providerClass.angularProviderFactory) {
      // Call the factory function to get the required providers
      const services = providerClass.angularProviderFactory(environment);
      return services;
    } 
    // Fallback to old method name for backward compatibility
    else if (typeof providerClass.getRequiredAngularProviders === 'function') {
      console.warn(`Provider ${type} uses deprecated getRequiredAngularProviders method. Please update to use angularProviderFactory property.`);
      return providerClass.getRequiredAngularProviders(environment);
    } 
    else {
      // Provider doesn't define required Angular services (might not need any)
      return [];
    }
  }

  /** @deprecated Use {@link GetProviderAngularServices}. */
  static getProviderAngularServices(type: string, environment: any): any[] {
    return this.GetProviderAngularServices(type, environment);
  }

}