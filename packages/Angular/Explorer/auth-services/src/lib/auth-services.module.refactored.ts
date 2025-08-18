import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { AuthProviderFactory, AuthProviderConfig } from './auth-provider-factory.service';
import { MJAuth0Provider } from './mjexplorer-auth0-provider.service';
import { MJMSALProvider } from './mjexplorer-msal-provider.service';
import { MJOktaProvider } from './mjexplorer-okta-provider.service';

/**
 * Refactored authentication module that supports N providers
 * 
 * This module dynamically configures the authentication provider based on
 * environment configuration, eliminating hardcoded provider selection.
 */
@NgModule({
  imports: [CommonModule],
  declarations: [],
  exports: []
})
export class AuthServicesModule {
  static forRoot(environment: any): ModuleWithProviders<AuthServicesModule> {
    // Get provider configuration from environment
    const providerConfig = AuthProviderFactory.createConfigFromEnvironment(environment);
    
    return {
      ngModule: AuthServicesModule,
      providers: [
        AuthProviderFactory,
        
        // Provide the configuration
        {
          provide: 'AUTH_PROVIDER_CONFIG',
          useValue: providerConfig
        },
        
        // Provider-specific configurations
        {
          provide: 'auth0Config',
          useFactory: () => {
            if (providerConfig.type === 'auth0') {
              return {
                domain: providerConfig.domain,
                clientId: providerConfig.clientId,
                authorizationParams: {
                  redirect_uri: providerConfig.redirectUri || window.location.origin,
                  audience: providerConfig.audience,
                  scope: providerConfig.scopes?.join(' ') || 'openid profile email'
                }
              };
            }
            return null;
          }
        },
        
        {
          provide: 'msalConfig',
          useFactory: () => {
            if (providerConfig.type === 'msal') {
              return {
                auth: {
                  clientId: providerConfig.clientId,
                  authority: providerConfig.issuer || 
                           `https://login.microsoftonline.com/${providerConfig.tenantId}`,
                  redirectUri: providerConfig.redirectUri || window.location.origin,
                  postLogoutRedirectUri: window.location.origin
                },
                cache: {
                  cacheLocation: 'localStorage',
                  storeAuthStateInCookie: false
                },
                scopes: providerConfig.scopes || ['User.Read', 'email', 'profile']
              };
            }
            return null;
          }
        },
        
        {
          provide: 'oktaConfig',
          useFactory: () => {
            if (providerConfig.type === 'okta') {
              return {
                issuer: providerConfig.issuer || 
                       `https://${providerConfig.domain}/oauth2/default`,
                clientId: providerConfig.clientId,
                redirectUri: providerConfig.redirectUri || window.location.origin,
                scopes: providerConfig.scopes || ['openid', 'profile', 'email'],
                pkce: true,
                domain: providerConfig.domain
              };
            }
            return null;
          }
        },
        
        // Dynamic provider selection
        {
          provide: MJAuthBase,
          useFactory: (factory: AuthProviderFactory) => {
            return factory.createProvider(providerConfig);
          },
          deps: [AuthProviderFactory]
        },
        
        // Provider-specific interceptors (if needed)
        ...(providerConfig.type === 'msal' ? [
          {
            provide: HTTP_INTERCEPTORS,
            useClass: getMSALInterceptor(), // Would need to import the actual interceptor
            multi: true
          }
        ] : []),
        
        ...(providerConfig.type === 'auth0' ? [
          {
            provide: HTTP_INTERCEPTORS,
            useClass: getAuth0Interceptor(), // Would need to import the actual interceptor
            multi: true
          }
        ] : [])
      ]
    };
  }
}

// Placeholder functions - would need actual interceptor imports
function getMSALInterceptor(): any {
  // Return MSAL interceptor class
  return class MSALInterceptor {};
}

function getAuth0Interceptor(): any {
  // Return Auth0 interceptor class
  return class Auth0Interceptor {};
}