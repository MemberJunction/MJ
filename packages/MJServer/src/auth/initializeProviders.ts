import { configInfo } from '../config.js';
import { AuthProviderConfig, LogError } from '@memberjunction/core';
import { AuthProviderFactory } from '@memberjunction/auth-providers';

/**
 * Initialize authentication providers from configuration
 */
export function initializeAuthProviders(): void {
  const factory = AuthProviderFactory.Instance;
  
  // Clear any existing providers
  factory.clear();

  // Initialize providers from authProviders config
  if (configInfo.authProviders && configInfo.authProviders.length > 0) {
    for (const providerConfig of configInfo.authProviders) {
      try {
        const provider = AuthProviderFactory.createProvider(providerConfig as AuthProviderConfig);
        // register() emits the verbose-only "Registered auth provider: … with issuer: …" line
        // (gated by the global verbose flag). Provider NAMES are surfaced compactly in the
        // startup summary `Auth` line at `standard`.
        factory.register(provider);
      } catch (error) {
        LogError(`Failed to initialize auth provider ${providerConfig.name}: ${error}`);
      }
    }
  }

  // Validate we have at least one provider
  if (!factory.hasProviders()) {
    LogError('No authentication providers configured. Please configure authProviders array in mj.config.cjs');
  }
}