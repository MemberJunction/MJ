/**
 * @fileoverview WWW-Authenticate header generation per RFC 9728.
 *
 * Provides functions to build MCP-compliant WWW-Authenticate headers
 * for 401 Unauthorized and 403 Forbidden responses.
 *
 * Per the MCP Authorization specification and RFC 9728 Section 5.1,
 * the WWW-Authenticate header MUST include the resource_metadata parameter
 * pointing to the Protected Resource Metadata endpoint.
 *
 * @module @memberjunction/ai-mcp-server/auth/WWWAuthenticate
 */

import type { Response } from 'express';
import { getResourceIdentifier } from './OAuthConfig.js';

/**
 * Options for building a WWW-Authenticate header.
 */
export interface WWWAuthenticateOptions {
  /** OAuth error code (for 403 responses) */
  error?: 'insufficient_scope' | 'invalid_token' | 'invalid_request';
  /** Human-readable error description */
  errorDescription?: string;
  /** Required scopes (space-separated) */
  scope?: string;
  /** Override the resource metadata URL (defaults to auto-generated) */
  resourceMetadataUrl?: string;
}

/**
 * Builds a WWW-Authenticate header value per RFC 9728.
 *
 * Format for 401 responses:
 * ```
 * Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
 * ```
 *
 * Format for 403 responses with error:
 * ```
 * Bearer error="insufficient_scope",
 *        resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
 *        error_description="User not found in MemberJunction"
 * ```
 *
 * @param options - Optional parameters for the header
 * @returns The formatted WWW-Authenticate header value
 */
export function buildWWWAuthenticateHeader(options: WWWAuthenticateOptions = {}): string {
  const resourceIdentifier = options.resourceMetadataUrl ?? getResourceIdentifier();
  const metadataUrl = `${resourceIdentifier}/.well-known/oauth-protected-resource`;

  const parts: string[] = ['Bearer'];

  // Add error if present (typically for 403 responses)
  if (options.error) {
    parts.push(`error="${options.error}"`);
  }

  // Always include resource_metadata (required by MCP spec and RFC 9728)
  parts.push(`resource_metadata="${metadataUrl}"`);

  // Add scope if specified
  if (options.scope) {
    parts.push(`scope="${options.scope}"`);
  }

  // Add error description if present
  if (options.errorDescription) {
    // Escape quotes in the description
    const escapedDescription = options.errorDescription.replace(/"/g, '\\"');
    parts.push(`error_description="${escapedDescription}"`);
  }

  // Join with comma and space for readability
  // First part is "Bearer", rest are parameters
  return `${parts[0]} ${parts.slice(1).join(', ')}`;
}

/**
 * Sends a 401 Unauthorized response with WWW-Authenticate header.
 *
 * Use this for:
 * - Missing credentials
 * - Invalid token format
 * - Expired tokens
 * - Unknown issuer
 *
 * @param res - Express response object
 * @param message - Error message for the response body
 * @param options - Optional WWW-Authenticate header options
 */
export function send401Response(
  res: Response,
  message: string,
  options: Omit<WWWAuthenticateOptions, 'error'> = {}
): void {
  const wwwAuthenticate = buildWWWAuthenticateHeader(options);

  res.status(401)
    .set('WWW-Authenticate', wwwAuthenticate)
    .json({
      error: 'unauthorized',
      message,
    });
}

/**
 * Sends a 403 Forbidden response with WWW-Authenticate header.
 *
 * Use this for:
 * - Valid token but user not found in MemberJunction
 * - Valid token but user is inactive
 * - Valid token but insufficient permissions
 *
 * @param res - Express response object
 * @param message - Error message for the response body
 * @param errorDescription - Description for WWW-Authenticate header
 */
export function send403Response(
  res: Response,
  message: string,
  errorDescription: string
): void {
  const wwwAuthenticate = buildWWWAuthenticateHeader({
    error: 'insufficient_scope',
    errorDescription,
  });

  res.status(403)
    .set('WWW-Authenticate', wwwAuthenticate)
    .json({
      error: 'forbidden',
      message,
    });
}

/**
 * Sends a 503 Service Unavailable response for OAuth provider issues.
 *
 * Use this when:
 * - JWKS endpoint is unreachable
 * - Authorization server is unavailable
 * - Network timeout during token validation
 *
 * @param res - Express response object
 * @param message - Error message for the response body
 * @param retryAfterSeconds - Suggested retry delay in seconds (default: 30)
 */
export function send503Response(
  res: Response,
  message: string,
  retryAfterSeconds: number = 30
): void {
  res.status(503)
    .set('Retry-After', String(retryAfterSeconds))
    .json({
      error: 'service_unavailable',
      message,
    });
}
