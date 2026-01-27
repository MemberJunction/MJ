/**
 * @fileoverview OAuth configuration helper functions for MCP Server.
 *
 * Provides convenient access to resolved OAuth settings and validation
 * of OAuth configuration completeness.
 *
 * @module @memberjunction/ai-mcp-server/auth/OAuthConfig
 */

import { mcpServerAuth, mcpServerSettings } from '../config.js';
import type { AuthMode } from './types.js';

/**
 * Gets the current authentication mode from configuration.
 *
 * @returns The configured auth mode ('apiKey', 'oauth', 'both', or 'none')
 */
export function getAuthMode(): AuthMode {
  return mcpServerAuth?.mode ?? 'apiKey';
}

/**
 * Gets the resource identifier for OAuth audience validation.
 *
 * The resource identifier is used to validate the 'aud' claim in OAuth tokens.
 * If not explicitly configured, it will be auto-generated from the server URL
 * (e.g., "http://localhost:3100").
 *
 * @returns The resource identifier URL
 */
export function getResourceIdentifier(): string {
  // Return configured or auto-generated value
  if (mcpServerAuth?.resourceIdentifier) {
    return mcpServerAuth.resourceIdentifier;
  }

  // Fallback to auto-generated (should already be set by resolveAuthSettings)
  const port = mcpServerSettings?.port ?? 3100;
  return `http://localhost:${port}`;
}

/**
 * Checks if OAuth authentication is enabled for any mode.
 *
 * OAuth is enabled when mode is 'oauth' or 'both'.
 *
 * @returns true if OAuth authentication is enabled
 */
export function isOAuthEnabled(): boolean {
  const mode = getAuthMode();
  return mode === 'oauth' || mode === 'both';
}

/**
 * Checks if API key authentication is enabled for any mode.
 *
 * API key auth is enabled when mode is 'apiKey' or 'both'.
 *
 * @returns true if API key authentication is enabled
 */
export function isApiKeyEnabled(): boolean {
  const mode = getAuthMode();
  return mode === 'apiKey' || mode === 'both';
}

/**
 * Checks if authentication is required.
 *
 * Authentication is required unless mode is 'none'.
 *
 * @returns true if authentication is required
 */
export function isAuthRequired(): boolean {
  return getAuthMode() !== 'none';
}

/**
 * Validation result for OAuth configuration.
 */
export interface OAuthConfigValidationResult {
  /** Whether the OAuth configuration is valid */
  valid: boolean;
  /** Warning messages for non-critical issues */
  warnings: string[];
  /** Error messages for critical issues */
  errors: string[];
  /** Effective auth mode after validation (may differ from configured if fallback) */
  effectiveMode: AuthMode;
}

/**
 * Validates the OAuth configuration and returns the effective mode.
 *
 * This function checks:
 * - If OAuth is enabled, auth providers must be configured
 * - If providers are missing, falls back to 'apiKey' mode with warning
 *
 * @param hasProviders - Whether any auth providers are configured in MJServer
 * @returns Validation result with effective mode and any warnings/errors
 */
export function validateOAuthConfig(hasProviders: boolean): OAuthConfigValidationResult {
  const result: OAuthConfigValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
    effectiveMode: getAuthMode(),
  };

  const mode = getAuthMode();

  // No validation needed for apiKey-only or none modes
  if (mode === 'apiKey' || mode === 'none') {
    return result;
  }

  // OAuth is enabled - check for providers
  if (!hasProviders) {
    result.warnings.push(
      `OAuth authentication is enabled (mode='${mode}') but no auth providers are configured.`
    );
    result.warnings.push(
      'Ensure authProviders array is configured in mj.config.cjs with at least one provider.'
    );

    // Fall back to apiKey mode
    result.effectiveMode = 'apiKey';
    result.warnings.push('Falling back to apiKey-only authentication mode.');
  }

  // Check resource identifier for OAuth modes
  if (isOAuthEnabled() && !mcpServerAuth?.resourceIdentifier && !mcpServerAuth?.autoResourceIdentifier) {
    result.warnings.push(
      'No resourceIdentifier configured and autoResourceIdentifier is disabled. ' +
      'OAuth audience validation may fail.'
    );
  }

  return result;
}

/**
 * Logs the authentication configuration at startup.
 *
 * @param effectiveMode - The effective auth mode after validation
 * @param providerNames - Names of configured auth providers (if any)
 */
export function logAuthConfig(effectiveMode: AuthMode, providerNames: string[]): void {
  console.log(`MCP Server: Auth mode: ${effectiveMode}`);

  if (effectiveMode === 'none') {
    console.warn('MCP Server: WARNING - Authentication is disabled (mode=none). For development only!');
  }

  if (effectiveMode === 'oauth' || effectiveMode === 'both') {
    console.log(`MCP Server: OAuth enabled with providers: ${providerNames.join(', ') || 'none'}`);
    console.log(`MCP Server: Resource identifier: ${getResourceIdentifier()}`);
  }

  if (effectiveMode === 'apiKey' || effectiveMode === 'both') {
    console.log('MCP Server: API key authentication enabled');
  }
}
