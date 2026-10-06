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
export function GetAuthMode(): AuthMode {
  return mcpServerAuth?.mode ?? 'apiKey';
}

/** @deprecated Use {@link GetAuthMode}. */
export function getAuthMode(): AuthMode {
  return GetAuthMode();
}

/**
 * Gets the resource identifier for MCP Protocol metadata.
 *
 * This is the server URL returned in Protected Resource Metadata,
 * used by MCP clients for RFC 8707 resource parameter.
 * If not explicitly configured, it will be auto-generated from the server URL.
 *
 * @returns The resource identifier URL (e.g., "http://localhost:3100")
 */
export function GetResourceIdentifier(): string {
  // Return configured or auto-generated value
  if (mcpServerAuth?.resourceIdentifier) {
    return mcpServerAuth.resourceIdentifier;
  }

  // Fallback to auto-generated (should already be set by resolveAuthSettings)
  const port = mcpServerSettings?.port ?? 3100;
  return `http://localhost:${port}`;
}

/** @deprecated Use {@link GetResourceIdentifier}. */
export function getResourceIdentifier(): string {
  return GetResourceIdentifier();
}

/**
 * @deprecated Token audience is now derived from the auth provider's `audience` field,
 * which is auto-populated from environment variables (e.g., WEB_CLIENT_ID for Azure AD).
 * This matches the same approach used by MJExplorer.
 *
 * This function is kept for backward compatibility but is no longer used for token validation.
 */
export function getTokenAudience(): string {
  // Use tokenAudience if configured, otherwise fall back to resourceIdentifier
  if (mcpServerAuth?.tokenAudience) {
    return mcpServerAuth.tokenAudience;
  }
  return GetResourceIdentifier();
}

/**
 * Gets the OAuth scopes to include in Protected Resource Metadata.
 *
 * For Azure AD: use ["api://{client-id}/.default"]
 * If not configured, returns standard OIDC scopes.
 *
 * @returns Array of OAuth scope strings
 */
export function GetScopes(): string[] {
  if (mcpServerAuth?.scopes && mcpServerAuth.scopes.length > 0) {
    return mcpServerAuth.scopes;
  }
  // Default to standard OIDC scopes
  return ['openid', 'profile', 'email'];
}

/** @deprecated Use {@link GetScopes}. */
export function getScopes(): string[] {
  return GetScopes();
}

/**
 * Checks if OAuth authentication is enabled for any mode.
 *
 * OAuth is enabled when mode is 'oauth' or 'both'.
 *
 * @returns true if OAuth authentication is enabled
 */
export function IsOAuthEnabled(): boolean {
  const mode = GetAuthMode();
  return mode === 'oauth' || mode === 'both';
}

/** @deprecated Use {@link IsOAuthEnabled}. */
export function isOAuthEnabled(): boolean {
  return IsOAuthEnabled();
}

/**
 * Checks if API key authentication is enabled for any mode.
 *
 * API key auth is enabled when mode is 'apiKey' or 'both'.
 *
 * @returns true if API key authentication is enabled
 */
export function IsApiKeyEnabled(): boolean {
  const mode = GetAuthMode();
  return mode === 'apiKey' || mode === 'both';
}

/** @deprecated Use {@link IsApiKeyEnabled}. */
export function isApiKeyEnabled(): boolean {
  return IsApiKeyEnabled();
}

/**
 * Checks if authentication is required.
 *
 * Authentication is required unless mode is 'none'.
 *
 * @returns true if authentication is required
 */
export function IsAuthRequired(): boolean {
  return GetAuthMode() !== 'none';
}

/** @deprecated Use {@link IsAuthRequired}. */
export function isAuthRequired(): boolean {
  return IsAuthRequired();
}

/**
 * Validation result for OAuth configuration.
 */
export interface OAuthConfigValidationResult {
  /** Whether the OAuth configuration is valid */
  valid: boolean;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Warning messages for non-critical issues */
  warnings: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Error messages for critical issues */
  errors: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Effective auth mode after validation (may differ from configured if fallback) */
  effectiveMode: AuthMode;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
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
export function ValidateOAuthConfig(hasProviders: boolean): OAuthConfigValidationResult {
  const result: OAuthConfigValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
    effectiveMode: GetAuthMode(),
  };

  const mode = GetAuthMode();

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
  if (IsOAuthEnabled() && !mcpServerAuth?.resourceIdentifier && !mcpServerAuth?.autoResourceIdentifier) {
    result.warnings.push(
      'No resourceIdentifier configured and autoResourceIdentifier is disabled. ' +
      'OAuth audience validation may fail.'
    );
  }

  return result;
}

/** @deprecated Use {@link ValidateOAuthConfig}. */
export function validateOAuthConfig(hasProviders: boolean): OAuthConfigValidationResult {
  return ValidateOAuthConfig(hasProviders);
}

/**
 * Logs the authentication configuration at startup.
 *
 * @param effectiveMode - The effective auth mode after validation
 * @param providerNames - Names of configured auth providers (if any)
 */
export function LogAuthConfig(effectiveMode: AuthMode, providerNames: string[]): void {
  console.log(`MCP Server: Auth mode: ${effectiveMode}`);

  if (effectiveMode === 'none') {
    console.warn('MCP Server: WARNING - Authentication is disabled (mode=none). For development only!');
  }

  if (effectiveMode === 'oauth' || effectiveMode === 'both') {
    console.log(`MCP Server: OAuth enabled with providers: ${providerNames.join(', ') || 'none'}`);
    console.log(`MCP Server: Resource identifier (MCP metadata): ${GetResourceIdentifier()}`);
    // Token audience is now derived from auth provider config (same as MJExplorer)
  }

  if (effectiveMode === 'apiKey' || effectiveMode === 'both') {
    console.log('MCP Server: API key authentication enabled');
  }
}

/** @deprecated Use {@link LogAuthConfig}. */
export function logAuthConfig(effectiveMode: AuthMode, providerNames: string[]): void {
  return LogAuthConfig(effectiveMode, providerNames);
}
