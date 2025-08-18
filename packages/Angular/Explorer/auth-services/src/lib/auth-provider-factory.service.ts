import { Injectable, Injector, Type } from '@angular/core';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { MJAuth0Provider } from './mjexplorer-auth0-provider.service';
import { MJMSALProvider } from './mjexplorer-msal-provider.service';
import { MJOktaProvider } from './mjexplorer-okta-provider.service';

export interface AuthProviderConfig {
  type: string;
  clientId: string;
  domain?: string;
  tenantId?: string;
  issuer?: string;
  redirectUri?: string;
  scopes?: string[];
  [key: string]: any;
}

/**
 * Factory service for creating authentication provider instances
 */
@Injectable({
  providedIn: 'root'
})
export class AuthProviderFactory {
  private static providerTypes: Map<string, Type<MJAuthBase>> = new Map<string, Type<MJAuthBase>>([
    ['auth0', MJAuth0Provider as Type<MJAuthBase>],
    ['msal', MJMSALProvider as Type<MJAuthBase>],
    ['okta', MJOktaProvider as Type<MJAuthBase>]
  ]);

  constructor(private injector: Injector) {}

  /**
   * Creates an authentication provider instance based on configuration
   */
  createProvider(config: AuthProviderConfig): MJAuthBase {
    const providerType = config.type.toLowerCase();
    const ProviderClass = AuthProviderFactory.providerTypes.get(providerType);
    
    if (!ProviderClass) {
      throw new Error(`Unknown authentication provider type: ${config.type}`);
    }

    // Create provider instance with dependency injection
    return this.injector.get(ProviderClass);
  }

  /**
   * Registers a custom provider type
   */
  static registerProviderType(type: string, providerClass: Type<MJAuthBase>): void {
    this.providerTypes.set(type.toLowerCase(), providerClass);
  }

  /**
   * Gets all available provider types
   */
  static getAvailableTypes(): string[] {
    return Array.from(this.providerTypes.keys());
  }

  /**
   * Creates provider configuration from environment
   */
  static createConfigFromEnvironment(environment: any): AuthProviderConfig {
    // Handle legacy AUTH_TYPE configuration
    if (environment.AUTH_TYPE) {
      const authType = environment.AUTH_TYPE.toLowerCase();
      
      switch (authType) {
        case 'auth0':
          return {
            type: 'auth0',
            clientId: environment.AUTH0_CLIENTID,
            domain: environment.AUTH0_DOMAIN,
            redirectUri: environment.AUTH0_REDIRECT_URI || window.location.origin,
            scopes: environment.AUTH0_SCOPES || ['openid', 'profile', 'email']
          };
          
        case 'msal':
          return {
            type: 'msal',
            clientId: environment.CLIENT_ID,
            tenantId: environment.TENANT_ID || environment.CLIENT_AUTHORITY?.split('/').pop(),
            issuer: environment.CLIENT_AUTHORITY,
            redirectUri: environment.REDIRECT_URI || window.location.origin,
            scopes: environment.SCOPES || ['User.Read', 'email', 'profile']
          };
          
        case 'okta':
          return {
            type: 'okta',
            clientId: environment.OKTA_CLIENTID,
            domain: environment.OKTA_DOMAIN,
            issuer: environment.OKTA_ISSUER || `https://${environment.OKTA_DOMAIN}/oauth2/default`,
            redirectUri: environment.OKTA_REDIRECT_URI || window.location.origin,
            scopes: environment.OKTA_SCOPES || ['openid', 'profile', 'email']
          };
          
        default:
          throw new Error(`Unsupported AUTH_TYPE: ${environment.AUTH_TYPE}`);
      }
    }
    
    // Handle new authProvider configuration
    if (environment.authProvider) {
      return environment.authProvider;
    }
    
    throw new Error('No authentication provider configuration found in environment');
  }
}