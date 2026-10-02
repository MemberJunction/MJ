/**
 * @fileoverview OAuth Proxy Authorization Server Types
 *
 * Type definitions for the OAuth proxy that enables dynamic client registration
 * and proxies OAuth flows to upstream providers (Azure AD, Auth0, etc.).
 *
 * This allows MCP clients like Claude Code to use OAuth without requiring
 * manual client registration in Azure AD.
 *
 * @module @memberjunction/ai-mcp-server/auth/OAuthProxyTypes
 */

/**
 * RFC 7591 Dynamic Client Registration Request
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-2
 */
export interface ClientRegistrationRequest {
  /** Array of redirect URIs for the client */
  redirect_uris: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Human-readable name of the client */
  client_name?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the client's home page */
  client_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the client's logo */
  logo_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of OAuth grant types the client will use */
  grant_types?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of OAuth response types the client will use */
  response_types?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Token endpoint authentication method */
  token_endpoint_auth_method?: 'none' | 'client_secret_post' | 'client_secret_basic';  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of scopes the client will request */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Software statement (JWT) */
  software_statement?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Software ID */
  software_id?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Software version */
  software_version?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * RFC 7591 Dynamic Client Registration Response
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.1
 */
export interface ClientRegistrationResponse {
  /** Unique client identifier */
  client_id: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client secret (for confidential clients) */
  client_secret?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when client_id was issued */
  client_id_issued_at?: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when client_secret expires (0 = never) */
  client_secret_expires_at?: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** All fields from the registration request are echoed back */
  redirect_uris: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  client_name?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  client_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  logo_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  grant_types: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  response_types: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  token_endpoint_auth_method: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * Registered client information stored in the registry
 */
export interface RegisteredClient {
  /** Unique client identifier */
  clientId: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client secret (for confidential clients, hashed) */
  clientSecretHash?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Plain client secret (only returned once at registration) */
  clientSecret?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when client was registered */
  registeredAt: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when client_secret expires (0 = never) */
  secretExpiresAt: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of allowed redirect URIs */
  redirectUris: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Human-readable name */
  clientName?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Home page URL */
  clientUri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Logo URL */
  logoUri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Allowed grant types */
  grantTypes: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Allowed response types */
  responseTypes: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Token endpoint auth method */
  tokenEndpointAuthMethod: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Requested scopes */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * OAuth Authorization Server Metadata per RFC 8414
 * @see https://datatracker.ietf.org/doc/html/rfc8414
 */
export interface AuthorizationServerMetadata {
  /** Authorization server's issuer identifier (URL) */
  issuer: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the authorization endpoint */
  authorization_endpoint: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the token endpoint */
  token_endpoint: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the dynamic client registration endpoint */
  registration_endpoint?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the JWKS endpoint */
  jwks_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of supported response types */
  response_types_supported: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of supported grant types */
  grant_types_supported?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of supported scopes */
  scopes_supported?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of supported token endpoint auth methods */
  token_endpoint_auth_methods_supported?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Array of supported PKCE code challenge methods */
  code_challenge_methods_supported?: string[];  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URL of the service documentation */
  service_documentation?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * State stored during authorization flow
 */
export interface AuthorizationState {
  /** State parameter from the original request */
  originalState?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client ID that initiated the flow */
  clientId: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Redirect URI to send the user back to */
  redirectUri: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code verifier (if provided) */
  codeVerifier?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code challenge (if provided) */
  codeChallenge?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code challenge method */
  codeChallengeMethod?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Requested scopes */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when this state was created */
  createdAt: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Nonce for OpenID Connect */
  nonce?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code verifier for upstream provider (generated by proxy) */
  upstreamCodeVerifier?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * Token request parameters
 */
export interface TokenRequest {
  /** Grant type (authorization_code, refresh_token) */
  grant_type: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Authorization code (for authorization_code grant) */
  code?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Redirect URI (must match the one used in authorization) */
  redirect_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client ID */
  client_id?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client secret (for confidential clients) */
  client_secret?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code verifier */
  code_verifier?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Refresh token (for refresh_token grant) */
  refresh_token?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Requested scopes (for refresh_token grant) */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * Token response
 */
export interface TokenResponse {
  /** Access token */
  access_token: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Token type (usually "Bearer") */
  token_type: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Seconds until access token expires */
  expires_in?: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Refresh token */
  refresh_token?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Granted scopes */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** ID token (for OpenID Connect) */
  id_token?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * Token error response per RFC 6749
 */
export interface TokenErrorResponse {
  /** Error code */
  error: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Human-readable error description */
  error_description?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** URI with more information about the error */
  error_uri?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
}

/**
 * Configuration for the OAuth proxy
 */
export interface OAuthProxyConfig {
  /** Base URL of the MCP Server (e.g., http://localhost:3100) */
  baseUrl: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Upstream OAuth provider configuration */
  upstream: {  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
    /** Authorization endpoint of the upstream provider */
    authorizationEndpoint: string;
    /** Token endpoint of the upstream provider */
    tokenEndpoint: string;
    /** Client ID registered with the upstream provider */
    clientId: string;
    /** Client secret (if confidential client) */
    clientSecret?: string;
    /** Scopes to request from upstream */
    scopes: string[];
    /** Provider name (for audit logging) */
    providerName?: string;
  };
  /** Whether to enable dynamic client registration */
  enableDynamicRegistration: boolean;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** TTL for authorization states in milliseconds (default: 10 minutes) */
  stateTtlMs?: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /**
   * JWT signing configuration for proxy-issued tokens.
   * If not provided, upstream tokens are passed through instead.
   */
  jwt?: {  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
    /** HS256 signing secret */
    signingSecret: string;
    /** Token expiration (e.g., '1h') */
    expiresIn: string;
    /** Issuer claim */
    issuer: string;
  };
  /**
   * Enable the consent screen for users to select scopes.
   * When enabled, users will see a UI to approve/deny scope requests.
   * When disabled, all available scopes are granted automatically.
   * @default false
   */
  enableConsentScreen?: boolean;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /**
   * Per-client-IP rate limit applied to every OAuth proxy route. The routes are public and
   * perform authorization, token exchange and dynamic registration, so they must be bounded
   * against guessing and resource exhaustion.
   * @default 60 requests per 60 seconds
   */
  rateLimit?: {  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
    /** Window length in milliseconds. @default 60000 */
    windowMs?: number;
    /** Maximum requests per client IP per window. @default 60 */
    limit?: number;
  };
}

/**
 * Authorization code stored temporarily
 */
export interface StoredAuthorizationCode {
  /** The authorization code */
  code: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Client ID that owns this code */
  clientId: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Redirect URI used */
  redirectUri: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Scopes granted */
  scope?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code challenge */
  codeChallenge?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** PKCE code challenge method */
  codeChallengeMethod?: string;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** The actual tokens from upstream */
  upstreamTokens: TokenResponse;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when code was created */
  createdAt: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /** Timestamp when code expires */
  expiresAt: number;  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
  /**
   * Validated user information (populated if JWT signing is enabled).
   * Used to issue proxy-signed JWTs at the token endpoint.
   */
  validatedUser?: {  // case-violation-ok-legacy-back-compat: the Model Context Protocol wire shape — these field names ARE the protocol, serialized to every MCP client
    /** MemberJunction User ID */
    mjUserId: string;
    /** User email */
    email: string;
    /** Upstream provider name */
    upstreamProvider: string;
    /** Subject claim from upstream token */
    upstreamSub: string;
  };
}
