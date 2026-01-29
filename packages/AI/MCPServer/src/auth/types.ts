/**
 * @fileoverview Type definitions for MCP Server OAuth authentication.
 *
 * Defines interfaces for authentication configuration, token validation results,
 * and session context. These types support the four authentication modes:
 * - apiKey: Traditional API key authentication (default)
 * - oauth: OAuth 2.1 Bearer token authentication
 * - both: Accept either API key or OAuth token
 * - none: No authentication (development only)
 *
 * @module @memberjunction/ai-mcp-server/auth/types
 */

import type { UserInfo } from '@memberjunction/core';
import type { JwtPayload } from 'jsonwebtoken';

/**
 * Authentication mode for the MCP Server.
 *
 * - `apiKey`: API key authentication only (default, backward compatible)
 * - `oauth`: OAuth Bearer token authentication only
 * - `both`: Accept either API key or OAuth token
 * - `none`: No authentication (local development only)
 */
export type AuthMode = 'apiKey' | 'oauth' | 'both' | 'none';

/**
 * OAuth authentication settings for MCP Server.
 * Configures the authentication mode and OAuth-specific options.
 */
export interface MCPServerAuthSettings {
  /**
   * Authentication mode controlling which credential types are accepted.
   * @default 'apiKey'
   */
  mode: AuthMode;

  /**
   * Resource identifier for OAuth audience validation.
   *
   * This value MUST match the 'aud' claim in OAuth tokens.
   * Should be the MCP Server's public URL or a registered API identifier.
   *
   * Examples:
   * - "https://mcp.example.com"
   * - "api://mcp-server-prod"
   *
   * If not specified and autoResourceIdentifier is true,
   * defaults to "http://localhost:{port}"
   */
  resourceIdentifier?: string;

  /**
   * Automatically generate resourceIdentifier from server configuration.
   *
   * When true and resourceIdentifier is not set:
   * - Uses "http://localhost:{port}" where port is mcpServerSettings.port
   *
   * Set to false if you want to require explicit resourceIdentifier.
   *
   * @default true
   */
  autoResourceIdentifier?: boolean;
}

/**
 * Error codes for OAuth token validation failures.
 */
export type OAuthErrorCode =
  | 'invalid_token'
  | 'expired_token'
  | 'invalid_audience'
  | 'unknown_issuer'
  | 'user_not_found'
  | 'user_inactive'
  | 'provider_unavailable';

/**
 * Result of OAuth token validation.
 */
export interface OAuthValidationResult {
  /** Whether the token is valid */
  valid: boolean;

  /** JWT payload if valid */
  payload?: JwtPayload;

  /** Extracted user information from token claims */
  userInfo?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  };

  /** Error details if invalid */
  error?: {
    code: OAuthErrorCode;
    message: string;
  };
}

/**
 * Result of unified authentication (API key or OAuth).
 * Returned by the AuthGate middleware after credential validation.
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean;

  /** Authentication method used */
  method: 'apiKey' | 'oauth' | 'none';

  /** MemberJunction user (if authenticated) */
  user?: UserInfo;

  /**
   * Granted scopes for this authentication.
   * Populated from either:
   * - OAuth JWT 'scopes' claim (when method='oauth')
   * - APIKeyScope entity (when method='apiKey')
   */
  scopes?: string[];

  /** API key context (if method='apiKey') */
  apiKeyContext?: {
    apiKey: string;
    apiKeyId: string;
    apiKeyHash: string;
  };

  /** OAuth context (if method='oauth') */
  oauthContext?: {
    issuer: string;
    subject: string;
    email: string;
    expiresAt: Date;
    /** Granted scopes from the JWT token */
    scopes?: string[];
  };

  /** Error details (if not authenticated) */
  error?: {
    status: 401 | 403 | 503;
    code: string;
    message: string;
  };
}

/**
 * Session context for MCP requests.
 * Extended to support OAuth authentication alongside existing API key auth.
 *
 * This interface is backward-compatible with the existing MCPSessionContext,
 * adding OAuth-specific fields while preserving API key fields.
 */
export interface MCPSessionContext {
  /**
   * The raw API key used for authentication.
   * Present only when authMethod='apiKey'.
   */
  apiKey?: string;

  /**
   * The database ID of the API key record.
   * Present only when authMethod='apiKey'.
   */
  apiKeyId?: string;

  /**
   * The SHA-256 hash of the API key (used for authorization calls).
   * Present only when authMethod='apiKey'.
   */
  apiKeyHash?: string;

  /**
   * The MemberJunction user associated with the authenticated session.
   * Always present after successful authentication.
   */
  user: UserInfo;

  /**
   * Authentication method used for this session.
   */
  authMethod: 'apiKey' | 'oauth' | 'none';

  /**
   * Granted scopes for this session.
   * Unified field - populated from either:
   * - OAuth JWT 'scopes' claim (when authMethod='oauth')
   * - APIKeyScope entity (when authMethod='apiKey')
   * - Empty array (when authMethod='none')
   *
   * Tools should use this field to check permissions regardless of auth method.
   */
  scopes?: string[];

  /**
   * OAuth-specific context.
   * Present only when authMethod='oauth'.
   */
  oauth?: {
    /** The issuer (IdP) that issued the token */
    issuer: string;
    /** The subject claim (unique user ID at the IdP) */
    subject: string;
    /** The user's email from token claims */
    email: string;
    /** When the token expires */
    tokenExpiresAt: Date;
    /** Granted scopes from the JWT token (also available at session.scopes) */
    scopes?: string[];
  };
}

/**
 * OAuth 2.0 Protected Resource Metadata per RFC 9728.
 * Returned from the /.well-known/oauth-protected-resource endpoint.
 */
export interface ProtectedResourceMetadata {
  /** Protected resource identifier - MUST be the resource's URL */
  resource: string;

  /** Array of authorization server issuer URLs */
  authorization_servers: string[];

  /** OAuth 2.0 scopes supported by this resource */
  scopes_supported?: string[];

  /** Token delivery methods supported */
  bearer_methods_supported?: ('header' | 'body' | 'query')[];

  /** Human-readable name for the resource */
  resource_name?: string;

  /** URL to resource documentation */
  resource_documentation?: string;

  /** JWK Set document URL (if resource validates tokens directly) */
  jwks_uri?: string;
}

/**
 * Claims structure for proxy-signed JWTs.
 * These tokens are issued by the MCP Server OAuth proxy after successful
 * upstream authentication, providing a consistent format across all providers.
 */
export interface ProxyJWTClaims {
  /** Issuer - always "urn:mj:mcp-server" for proxy tokens */
  iss: string;

  /** Subject - user's email address */
  sub: string;

  /** Audience - must match resourceIdentifier */
  aud: string;

  /** Issued at timestamp (seconds since epoch) */
  iat: number;

  /** Expiration timestamp (seconds since epoch) */
  exp: number;

  /** User's email (same as sub) */
  email: string;

  /** MemberJunction User ID (GUID) */
  mjUserId: string;

  /** Granted scopes (selected during consent, or all available if no consent screen) */
  scopes: string[];

  /** Upstream provider name for audit trail (from config, not hardcoded enum) */
  upstreamProvider: string;

  /** Upstream subject claim for audit trail */
  upstreamSub: string;
}

/**
 * Options for signing a proxy JWT.
 */
export interface SignProxyJWTOptions {
  /** User's email address (becomes sub claim) */
  email: string;
  /** MemberJunction User ID */
  mjUserId: string;
  /** Granted scopes */
  scopes: string[];
  /** Name of upstream provider that authenticated the user */
  upstreamProvider: string;
  /** Subject claim from upstream token */
  upstreamSub: string;
}

/**
 * UI configuration for scope display.
 */
export interface ScopeUIConfig {
  /** Font Awesome icon class */
  icon?: string;
  /** Hex color for category header */
  color?: string;
}

/**
 * Scope information loaded from __mj.APIScope entity.
 * Used for consent screen display and scope validation.
 */
export interface APIScopeInfo {
  /** Unique identifier */
  ID: string;

  /** Scope name (e.g., "read" - the last segment) */
  Name: string;

  /** Full scope path including parent (e.g., "entity:read") */
  FullPath: string;

  /** Parent scope ID (null for root scopes) */
  ParentID: string | null;

  /** Category for grouping (e.g., "Entities", "Actions") */
  Category: string;

  /** Human-readable description for consent screen */
  Description: string;

  /** Whether this scope is active */
  IsActive: boolean;

  /** UI configuration for display */
  UIConfig?: ScopeUIConfig;
}

/**
 * Consent flow state (stored in-memory during OAuth flow).
 * Tracks the state of a consent request while the user selects scopes.
 */
export interface ConsentRequest {
  /** Unique request identifier */
  requestId: string;

  /** Timestamp when consent was requested */
  requestedAt: Date;

  /** User information from upstream token */
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    mjUserId: string;
  };

  /** Upstream provider name that authenticated the user (from config) */
  upstreamProvider: string;

  /** Upstream subject claim */
  upstreamSub: string;

  /** Available scopes user can select from */
  availableScopes: APIScopeInfo[];

  /** Client redirect URI to return to after consent */
  redirectUri: string;

  /** Original OAuth state parameter */
  state?: string;

  /** Code challenge for PKCE */
  codeChallenge?: string;

  /** Code challenge method */
  codeChallengeMethod?: string;

  /** Client ID that initiated the request */
  clientId: string;

  /** Requested scope string from client */
  requestedScope?: string;
}

/**
 * User's consent response.
 */
export interface ConsentResponse {
  /** Request ID this response is for */
  requestId: string;

  /** Scopes the user granted */
  grantedScopes: string[];

  /** Timestamp of consent */
  consentedAt: Date;
}
