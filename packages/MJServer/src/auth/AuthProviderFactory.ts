import { IAuthProvider, AuthProviderConfig } from './IAuthProvider.js';
import { Auth0Provider } from './providers/Auth0Provider.js';
import { MSALProvider } from './providers/MSALProvider.js';
import { OktaProvider } from './providers/OktaProvider.js';
import { CognitoProvider } from './providers/CognitoProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { MJGlobal } from '@memberjunction/global';

/**
 * Factory for creating authentication provider instances
 */
export class AuthProviderFactory {
  private static providerTypes: Map<string, new (config: AuthProviderConfig) => IAuthProvider> = new Map([
    ['auth0', Auth0Provider],
    ['msal', MSALProvider],
    ['okta', OktaProvider],
    ['cognito', CognitoProvider],
    ['google', GoogleProvider]
  ]);

  /**
   * Creates an authentication provider instance based on configuration
   */
  static createProvider(config: AuthProviderConfig): IAuthProvider {
    const ProviderClass = this.providerTypes.get(config.type.toLowerCase());
    
    if (!ProviderClass) {
      // Try to use MJGlobal ClassFactory for custom providers
      try {
        const customProvider = MJGlobal.Instance.ClassFactory.CreateInstance<IAuthProvider>(
          config.type,
          undefined,
          config
        );
        if (customProvider) {
          return customProvider;
        }
      } catch (error) {
        // Fall through to error below
      }
      
      throw new Error(`Unknown authentication provider type: ${config.type}`);
    }

    return new ProviderClass(config);
  }

  /**
   * Registers a custom provider type
   */
  static registerProviderType(
    type: string, 
    providerClass: new (config: AuthProviderConfig) => IAuthProvider
  ): void {
    this.providerTypes.set(type.toLowerCase(), providerClass);
  }

  /**
   * Gets all available provider types
   */
  static getAvailableTypes(): string[] {
    return Array.from(this.providerTypes.keys());
  }
}