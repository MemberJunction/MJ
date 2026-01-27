/**
 * @fileoverview Protected Resource Metadata per RFC 9728.
 *
 * Implements the OAuth 2.0 Protected Resource Metadata endpoint
 * as required by the MCP Authorization specification.
 *
 * The metadata endpoint at /.well-known/oauth-protected-resource
 * allows MCP clients to discover:
 * - The resource identifier (for audience validation)
 * - Authorization servers that can issue tokens
 * - Supported scopes and token delivery methods
 *
 * @module @memberjunction/ai-mcp-server/auth/ProtectedResourceMetadata
 */

import type { ProtectedResourceMetadata } from './types.js';
import { getResourceIdentifier } from './OAuthConfig.js';

/**
 * Options for building Protected Resource Metadata.
 */
export interface ProtectedResourceMetadataOptions {
  /** Override the resource identifier (defaults to configured value) */
  resourceIdentifier?: string;
  /** Authorization server issuer URLs (from configured auth providers) */
  authorizationServers: string[];
  /** Human-readable name for the resource */
  resourceName?: string;
  /** URL to resource documentation */
  resourceDocumentation?: string;
}

/**
 * Builds the Protected Resource Metadata response per RFC 9728.
 *
 * This metadata is served at `/.well-known/oauth-protected-resource`
 * and helps MCP clients discover how to authenticate.
 *
 * @param options - Configuration options for the metadata
 * @returns The Protected Resource Metadata object
 *
 * @example
 * const metadata = buildProtectedResourceMetadata({
 *   authorizationServers: ['https://login.microsoftonline.com/tenant/v2.0'],
 *   resourceName: 'My MCP Server',
 * });
 * // Returns:
 * // {
 * //   resource: "http://localhost:3100",
 * //   authorization_servers: ["https://login.microsoftonline.com/tenant/v2.0"],
 * //   scopes_supported: ["openid", "profile", "email"],
 * //   bearer_methods_supported: ["header"],
 * //   resource_name: "My MCP Server"
 * // }
 */
export function buildProtectedResourceMetadata(
  options: ProtectedResourceMetadataOptions
): ProtectedResourceMetadata {
  const resourceIdentifier = options.resourceIdentifier ?? getResourceIdentifier();

  const metadata: ProtectedResourceMetadata = {
    // Required: The protected resource identifier
    resource: resourceIdentifier,

    // Required: Authorization servers that can issue tokens for this resource
    authorization_servers: options.authorizationServers,

    // Recommended: Scopes supported by this resource
    // MCP Server uses standard OIDC scopes
    scopes_supported: ['openid', 'profile', 'email'],

    // Recommended: Token delivery methods
    // MCP Server only accepts tokens in the Authorization header
    bearer_methods_supported: ['header'],

    // Optional: Human-readable name
    resource_name: options.resourceName ?? 'MemberJunction MCP Server',
  };

  // Add documentation URL if provided
  if (options.resourceDocumentation) {
    metadata.resource_documentation = options.resourceDocumentation;
  }

  return metadata;
}

/**
 * Extracts authorization server issuer URLs from auth providers.
 *
 * This helper function retrieves the issuer URLs from all configured
 * auth providers to include in the Protected Resource Metadata.
 *
 * @param providers - Array of auth provider configurations
 * @returns Array of unique issuer URLs
 */
export function extractAuthorizationServers(
  providers: Array<{ issuer?: string }>
): string[] {
  const issuers = providers
    .map(p => p.issuer)
    .filter((issuer): issuer is string => typeof issuer === 'string' && issuer.length > 0);

  // Return unique issuers
  return [...new Set(issuers)];
}
