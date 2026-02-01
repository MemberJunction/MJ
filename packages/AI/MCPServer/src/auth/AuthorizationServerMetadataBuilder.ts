/**
 * @fileoverview OAuth Authorization Server Metadata Builder (RFC 8414)
 *
 * Builds the OAuth 2.0 Authorization Server Metadata for the MCP Server
 * OAuth proxy. This metadata is served at /.well-known/oauth-authorization-server
 * and tells MCP clients how to authenticate.
 *
 * @module @memberjunction/ai-mcp-server/auth/AuthorizationServerMetadataBuilder
 */

import type { AuthorizationServerMetadata } from './OAuthProxyTypes.js';

/**
 * Options for building Authorization Server Metadata.
 */
export interface AuthorizationServerMetadataOptions {
  /** Base URL of the MCP Server (e.g., http://localhost:3100) */
  baseUrl: string;
  /** Scopes supported by this authorization server */
  scopes?: string[];
  /** URL to service documentation */
  serviceDocumentation?: string;
}

/**
 * Builds OAuth 2.0 Authorization Server Metadata per RFC 8414.
 *
 * This metadata is served at `/.well-known/oauth-authorization-server`
 * and helps MCP clients discover how to authenticate with the OAuth proxy.
 *
 * @param options - Configuration options
 * @returns The Authorization Server Metadata object
 *
 * @example
 * ```typescript
 * const metadata = buildAuthorizationServerMetadata({
 *   baseUrl: 'http://localhost:3100',
 *   scopes: ['openid', 'profile', 'email'],
 * });
 * // Returns:
 * // {
 * //   issuer: "http://localhost:3100",
 * //   authorization_endpoint: "http://localhost:3100/oauth/authorize",
 * //   token_endpoint: "http://localhost:3100/oauth/token",
 * //   registration_endpoint: "http://localhost:3100/oauth/register",
 * //   ...
 * // }
 * ```
 */
export function buildAuthorizationServerMetadata(
  options: AuthorizationServerMetadataOptions
): AuthorizationServerMetadata {
  const { baseUrl } = options;

  // Remove trailing slash if present
  const base = baseUrl.replace(/\/$/, '');

  const metadata: AuthorizationServerMetadata = {
    // Required: The authorization server's issuer identifier
    // Must be a URL using https scheme (relaxed to http for localhost in dev)
    issuer: base,

    // Required: URL of the authorization endpoint
    authorization_endpoint: `${base}/oauth/authorize`,

    // Required: URL of the token endpoint
    token_endpoint: `${base}/oauth/token`,

    // Optional but required for MCP: Dynamic client registration endpoint
    registration_endpoint: `${base}/oauth/register`,

    // Required: Supported response types
    // We support 'code' for authorization code flow (required by OAuth 2.1)
    response_types_supported: ['code'],

    // Optional: Supported grant types
    // authorization_code is the primary flow for interactive clients
    // refresh_token allows token refresh
    grant_types_supported: ['authorization_code', 'refresh_token'],

    // Optional: Supported scopes
    scopes_supported: options.scopes ?? ['openid', 'profile', 'email'],

    // Optional: Supported token endpoint authentication methods
    // client_secret_basic: Authorization header with Basic auth
    // client_secret_post: client_secret in request body
    // none: Public clients (no secret required)
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],

    // Required by OAuth 2.1 / MCP: PKCE code challenge methods
    // S256 is required; plain is not recommended
    code_challenge_methods_supported: ['S256'],
  };

  // Add service documentation if provided
  if (options.serviceDocumentation) {
    metadata.service_documentation = options.serviceDocumentation;
  }

  return metadata;
}

/**
 * Validates that required fields are present in Authorization Server Metadata.
 *
 * @param metadata - The metadata to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateAuthorizationServerMetadata(
  metadata: AuthorizationServerMetadata
): string[] {
  const errors: string[] = [];

  if (!metadata.issuer) {
    errors.push('issuer is required');
  }

  if (!metadata.authorization_endpoint) {
    errors.push('authorization_endpoint is required');
  }

  if (!metadata.token_endpoint) {
    errors.push('token_endpoint is required');
  }

  if (!metadata.response_types_supported || metadata.response_types_supported.length === 0) {
    errors.push('response_types_supported is required and must not be empty');
  }

  // OAuth 2.1 / MCP requires PKCE support
  if (!metadata.code_challenge_methods_supported?.includes('S256')) {
    errors.push('code_challenge_methods_supported must include S256 for OAuth 2.1');
  }

  return errors;
}
