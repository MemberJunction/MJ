import { IAuthProvider, AuthProviderConfig } from './IAuthProvider.js';
import { BaseAuthProvider } from './BaseAuthProvider.js';
import { MJGlobal } from '@memberjunction/global';

// Import providers to ensure they're registered
import './providers/Auth0Provider.js';
import './providers/MSALProvider.js';
import './providers/OktaProvider.js';
import './providers/CognitoProvider.js';
import './providers/GoogleProvider.js';

/**
 * Factory for creating authentication provider instances using MJGlobal ClassFactory
 */
export class AuthProviderFactory {
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
   * Gets all registered provider types from the ClassFactory
   */
  static getRegisteredProviders(): string[] {
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
  static isProviderRegistered(type: string): boolean {
    try {
      // Try to get the registration for this specific type
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAuthProvider, type.toLowerCase());
      return registration !== null && registration !== undefined;
    } catch {
      return false;
    }
  }
}