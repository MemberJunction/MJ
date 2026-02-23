import { configInfo } from '../config.js';
import { AuthProviderConfig, LogError, LogStatus } from '@memberjunction/core';
import { AuthProviderFactory } from './AuthProviderFactory.js';

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
        factory.register(provider);
        LogStatus(`Registered auth provider: ${provider.name} (type: ${providerConfig.type})`);
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