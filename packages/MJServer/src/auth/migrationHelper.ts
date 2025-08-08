/**
 * Helper module to facilitate gradual migration from hardcoded auth to provider-based auth
 * This module exports functions that maintain backward compatibility while enabling
 * the new provider architecture.
 */

import { AuthProviderRegistry } from './AuthProviderRegistry.js';
import { initializeAuthProviders } from './initializeProviders.js';

// Initialize providers on first import
let initialized = false;

/**
 * Ensures providers are initialized (called lazily)
 */
export function ensureProvidersInitialized(): void {
  if (!initialized) {
    initializeAuthProviders();
    initialized = true;
  }
}

/**
 * Creates backward-compatible issuer object for legacy code
 */
export function getLegacyIssuers(): { azure?: string; auth0?: string } {
  ensureProvidersInitialized();
  
  const registry = AuthProviderRegistry.getInstance();
  const result: { azure?: string; auth0?: string } = {};
  
  const msalProvider = registry.getByName('msal');
  if (msalProvider) {
    result.azure = msalProvider.issuer;
  }
  
  const auth0Provider = registry.getByName('auth0');
  if (auth0Provider) {
    result.auth0 = auth0Provider.issuer;
  }
  
  return result;
}

/**
 * Creates backward-compatible validationOptions object for legacy code
 */
export function getLegacyValidationOptions(): Record<string, { audience: string; jwksUri: string }> {
  ensureProvidersInitialized();
  
  const registry = AuthProviderRegistry.getInstance();
  const options: Record<string, { audience: string; jwksUri: string }> = {};
  
  for (const provider of registry.getAllProviders()) {
    options[provider.issuer] = {
      audience: provider.audience,
      jwksUri: provider.jwksUri
    };
  }
  
  return options;
}