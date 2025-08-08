import { configInfo } from '../config.js';
import { AuthProviderConfig } from './IAuthProvider.js';
import { AuthProviderRegistry } from './AuthProviderRegistry.js';
import { AuthProviderFactory } from './AuthProviderFactory.js';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Initialize authentication providers from configuration
 */
export function initializeAuthProviders(): void {
  const registry = AuthProviderRegistry.getInstance();
  
  // Clear any existing providers
  registry.clear();

  // If new authProviders config exists, use it
  if (configInfo.authProviders && configInfo.authProviders.length > 0) {
    for (const providerConfig of configInfo.authProviders) {
      try {
        const provider = AuthProviderFactory.createProvider(providerConfig as AuthProviderConfig);
        registry.register(provider);
        LogStatus(`Registered auth provider: ${provider.name}`);
      } catch (error) {
        LogError(`Failed to initialize auth provider ${providerConfig.name}: ${error}`);
      }
    }
  } else {
    // Backward compatibility: create providers from legacy config
    const legacyProviders: AuthProviderConfig[] = [];

    // Check for MSAL/Azure AD config
    if (configInfo.tenantID && configInfo.webClientID) {
      legacyProviders.push({
        name: 'msal',
        type: 'msal',
        issuer: `https://login.microsoftonline.com/${configInfo.tenantID}/v2.0`,
        audience: configInfo.webClientID,
        jwksUri: `https://login.microsoftonline.com/${configInfo.tenantID}/discovery/v2.0/keys`,
        clientId: configInfo.webClientID,
        tenantId: configInfo.tenantID
      });
    }

    // Check for Auth0 config
    if (configInfo.auth0Domain && configInfo.auth0WebClientID) {
      legacyProviders.push({
        name: 'auth0',
        type: 'auth0',
        issuer: `https://${configInfo.auth0Domain}/`,
        audience: configInfo.auth0WebClientID,
        jwksUri: `https://${configInfo.auth0Domain}/.well-known/jwks.json`,
        clientId: configInfo.auth0WebClientID,
        clientSecret: configInfo.auth0ClientSecret,
        domain: configInfo.auth0Domain
      });
    }

    // Register legacy providers
    for (const providerConfig of legacyProviders) {
      try {
        const provider = AuthProviderFactory.createProvider(providerConfig as AuthProviderConfig);
        registry.register(provider);
        LogStatus(`Registered legacy auth provider: ${provider.name}`);
      } catch (error) {
        LogError(`Failed to initialize legacy auth provider ${providerConfig.name}: ${error}`);
      }
    }
  }

  // Validate we have at least one provider
  if (!registry.hasProviders()) {
    LogError('No authentication providers configured. Please configure at least one auth provider in mj.config.cjs');
  }
}