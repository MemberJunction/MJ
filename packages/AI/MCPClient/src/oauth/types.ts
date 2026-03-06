/**
 * @fileoverview OAuth 2.1 type definitions for MCP server authentication
 *
 * Defines interfaces for OAuth authorization flow with PKCE and
 * Dynamic Client Registration (DCR) per RFC 8414 and RFC 7591.
 *
 * @module @memberjunction/ai-mcp-client/oauth/types
 */

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Cached from {issuer}/.well-known/oauth-authorization-server
 */
export interface AuthServerMetadata {
    /** Authorization server's issuer identifier URL */
    issuer: string;
    /** URL of the authorization endpoint */
    authorization_endpoint: string;
    /** URL of the token endpoint */
    token_endpoint: string;
    /** URL of the registration endpoint for DCR (optional) */
    registration_endpoint?: string;
    /** URL of the token revocation endpoint (optional) */
    revocation_endpoint?: string;
    /** URL of the token introspection endpoint (optional) */
    introspection_endpoint?: string;
    /** URL of the JSON Web Key Set document */
    jwks_uri?: string;
    /** Array of supported scopes */
    scopes_supported?: string[];
    /** Array of supported response types */
    response_types_supported: string[];
    /** Array of supported grant types */
    grant_types_supported?: string[];
    /** Array of supported token endpoint authentication methods */
    token_endpoint_auth_methods_supported?: string[];
    /** Array of PKCE code challenge methods supported */
    code_challenge_methods_supported?: string[];
}

/**
 * Cached authorization server metadata with expiration
 */
export interface CachedAuthServerMetadata {
    /** The full metadata object */
    metadata: AuthServerMetadata;
    /** When the metadata was cached */
    cachedAt: Date;
    /** When the cache entry expires */
    expiresAt: Date;
}

/**
 * Dynamic Client Registration request (RFC 7591)
 */
export interface DCRRequest {
    /** Client name for display */
    client_name: string;
    /** Array of allowed redirect URIs */
    redirect_uris: string[];
    /** Array of grant types the client will use */
    grant_types: string[];
    /** Array of response types the client will use */
    response_types: string[];
    /** Token endpoint authentication method */
    token_endpoint_auth_method: string;
    /** Requested scope (space-delimited) */
    scope?: string;
}

/**
 * Dynamic Client Registration response (RFC 7591)
 */
export interface DCRResponse {
    /** Assigned client ID */
    client_id: string;
    /** Assigned client secret (for confidential clients) */
    client_secret?: string;
    /** When the client ID was issued (Unix timestamp) */
    client_id_issued_at?: number;
    /** When the client secret expires (Unix timestamp, 0 = never) */
    client_secret_expires_at?: number;
    /** Registration access token for managing the registration */
    registration_access_token?: string;
    /** Registration client URI for managing the registration */
    registration_client_uri?: string;
    /** Granted redirect URIs */
    redirect_uris?: string[];
    /** Granted grant types */
    grant_types?: string[];
    /** Granted response types */
    response_types?: string[];
    /** Granted scope */
    scope?: string;
}

/**
 * PKCE (Proof Key for Code Exchange) challenge data
 */
export interface PKCEChallenge {
    /** Code verifier (random string 43-128 chars) */
    codeVerifier: string;
    /** Code challenge (SHA256 hash of verifier, base64url encoded) */
    codeChallenge: string;
    /** Challenge method (always 'S256' for OAuth 2.1) */
    codeChallengeMethod: 'S256';
}

/**
 * OAuth 2.0 token response
 */
export interface OAuthTokenResponse {
    /** Access token */
    access_token: string;
    /** Token type (usually 'Bearer') */
    token_type: string;
    /** Seconds until access token expires */
    expires_in?: number;
    /** Refresh token for obtaining new access tokens */
    refresh_token?: string;
    /** Granted scopes (space-delimited) */
    scope?: string;
}

/**
 * OAuth token set with expiration tracking
 */
export interface OAuthTokenSet {
    /** Access token */
    accessToken: string;
    /** Token type (usually 'Bearer') */
    tokenType: string;
    /** Unix timestamp when access token expires */
    expiresAt: number;
    /** Refresh token (optional) */
    refreshToken?: string;
    /** Granted scopes (space-delimited) */
    scope?: string;
    /** Authorization server issuer URL */
    issuer: string;
    /** Unix timestamp of last refresh */
    lastRefreshAt?: number;
    /** Number of times token has been refreshed */
    refreshCount: number;
}

/**
 * OAuth authorization state for tracking in-progress flows
 */
export interface OAuthAuthorizationState {
    /** Database record ID */
    id?: string;
    /** MCP Server Connection ID */
    connectionId: string;
    /** User initiating the flow */
    userId: string;
    /** Cryptographic state parameter for CSRF protection */
    stateParameter: string;
    /** PKCE challenge data */
    pkce: PKCEChallenge;
    /** Redirect URI used for this flow */
    redirectUri: string;
    /** Requested scopes */
    requestedScopes?: string;
    /** Flow status */
    status: OAuthAuthorizationStatus;
    /** Full authorization URL for user redirect */
    authorizationUrl: string;
    /** Error code if failed */
    errorCode?: string;
    /** Error description if failed */
    errorDescription?: string;
    /** When flow was initiated */
    initiatedAt: Date;
    /** When flow expires */
    expiresAt: Date;
    /** When flow completed */
    completedAt?: Date;
    /** URL to redirect to after OAuth completion (for frontend integration) */
    frontendReturnUrl?: string;
}

/**
 * OAuth authorization flow status
 */
export type OAuthAuthorizationStatus = 'Pending' | 'Completed' | 'Failed' | 'Expired';

/**
 * OAuth client registration status
 */
export type OAuthClientRegistrationStatus = 'Active' | 'Expired' | 'Revoked';

/**
 * Stored OAuth client registration
 */
export interface OAuthClientRegistration {
    /** Database record ID */
    id?: string;
    /** MCP Server Connection ID */
    connectionId: string;
    /** MCP Server ID (denormalized) */
    serverId: string;
    /** Authorization server issuer URL */
    issuer: string;
    /** Registered client ID */
    clientId: string;
    /** Client secret (encrypted at rest) */
    clientSecret?: string;
    /** When client ID was issued */
    clientIdIssuedAt?: Date;
    /** When client secret expires */
    clientSecretExpiresAt?: Date;
    /** Registration access token for management */
    registrationAccessToken?: string;
    /** Registration client URI for management */
    registrationClientUri?: string;
    /** Registered redirect URIs */
    redirectUris: string[];
    /** Granted grant types */
    grantTypes: string[];
    /** Granted response types */
    responseTypes: string[];
    /** Granted scope */
    scope?: string;
    /** Registration status */
    status: OAuthClientRegistrationStatus;
    /** Full registration response JSON */
    registrationResponse: string;
}

/**
 * OAuth error response from authorization server
 */
export interface OAuthErrorResponse {
    /** Error code */
    error: string;
    /** Human-readable error description */
    error_description?: string;
    /** URI to error documentation */
    error_uri?: string;
}

/**
 * OAuth credential values stored in CredentialEngine
 */
export interface OAuth2AuthCodeCredentialValues {
    /** OAuth access token */
    access_token: string;
    /** Token type (usually 'Bearer') */
    token_type: string;
    /** Unix timestamp when access token expires */
    expires_at: number;
    /** OAuth refresh token (optional) */
    refresh_token?: string;
    /** Granted scopes (space-delimited) */
    scope?: string;
    /** Authorization server issuer URL */
    authorization_server_issuer: string;
    /** Unix timestamp of last token refresh */
    last_refresh_at?: number;
    /** Number of times token has been refreshed */
    refresh_count?: number;
}

/**
 * Result from initiating OAuth authorization flow
 */
export interface InitiateAuthorizationResult {
    /** Whether initialization succeeded */
    success: boolean;
    /** Error message if failed */
    errorMessage?: string;
    /** URL to redirect user for authorization */
    authorizationUrl?: string;
    /** State parameter for tracking this flow */
    stateParameter?: string;
    /** When this authorization flow expires */
    expiresAt?: Date;
    /** Whether DCR was used (true) or pre-configured credentials (false) */
    usedDynamicRegistration?: boolean;
}

/**
 * Result from completing OAuth authorization
 */
export interface CompleteAuthorizationResult {
    /** Whether completion succeeded */
    success: boolean;
    /** Error message if failed */
    errorMessage?: string;
    /** Error code from authorization server */
    errorCode?: string;
    /** Whether the error is retryable */
    isRetryable: boolean;
    /** Token set if successful */
    tokens?: OAuthTokenSet;
}

/**
 * Result from token refresh operation
 */
export interface TokenRefreshResult {
    /** Whether refresh succeeded */
    success: boolean;
    /** Error message if failed */
    errorMessage?: string;
    /** Whether re-authorization is required */
    requiresReauthorization: boolean;
    /** New token set if successful */
    tokens?: OAuthTokenSet;
}

/**
 * OAuth connection status for UI display
 */
export interface OAuthConnectionStatus {
    /** Connection ID */
    connectionId: string;
    /** Whether OAuth is configured for this connection */
    isOAuthEnabled: boolean;
    /** Whether valid OAuth tokens exist */
    hasValidTokens: boolean;
    /** Whether the access token is expired */
    isAccessTokenExpired?: boolean;
    /** When the access token expires */
    tokenExpiresAt?: Date;
    /** Whether a refresh token exists */
    hasRefreshToken?: boolean;
    /** Whether re-authorization is required */
    requiresReauthorization: boolean;
    /** Reason re-authorization is required */
    reauthorizationReason?: string;
    /** OAuth issuer URL */
    issuerUrl?: string;
    /** Granted scopes */
    grantedScopes?: string;
}

/**
 * OAuth event types for MCPClientManager
 */
export type OAuthEventType =
    | 'authorizationRequired'
    | 'authorizationCompleted'
    | 'tokenRefreshed'
    | 'tokenRefreshFailed'
    | 'credentialsRevoked';

/**
 * OAuth event data for MCPClientManager events
 */
export interface OAuthEventData {
    /** Event type */
    type: OAuthEventType;
    /** Connection ID */
    connectionId: string;
    /** Timestamp */
    timestamp: Date;
    /** Authorization URL (for authorizationRequired) */
    authorizationUrl?: string;
    /** State parameter (for authorizationRequired) */
    stateParameter?: string;
    /** Error message (for failure events) */
    errorMessage?: string;
    /** Whether re-authorization is required (for tokenRefreshFailed) */
    requiresReauthorization?: boolean;
}

/**
 * MCP Server OAuth configuration fields
 */
export interface MCPServerOAuthConfig {
    /** Authorization server issuer URL */
    OAuthIssuerURL?: string;
    /** Space-delimited OAuth scopes */
    OAuthScopes?: string;
    /** Cache TTL for auth server metadata in minutes */
    OAuthMetadataCacheTTLMinutes?: number;
    /** Pre-configured client ID (if DCR not supported) */
    OAuthClientID?: string;
    /** Pre-configured client secret (encrypted) */
    OAuthClientSecretEncrypted?: string;
    /** Whether to require PKCE (always true for OAuth 2.1) */
    OAuthRequirePKCE?: boolean;
}

/**
 * Exception thrown when OAuth authorization is required
 */
export class OAuthAuthorizationRequiredError extends Error {
    /** Error code for identification */
    public readonly code = 'OAUTH_AUTHORIZATION_REQUIRED';
    /** Authorization URL to open in browser */
    public readonly authorizationUrl: string;
    /** State parameter for tracking */
    public readonly stateParameter: string;
    /** When the authorization expires */
    public readonly expiresAt: Date;

    constructor(
        message: string,
        authorizationUrl: string,
        stateParameter: string,
        expiresAt: Date
    ) {
        super(message);
        this.name = 'OAuthAuthorizationRequiredError';
        this.authorizationUrl = authorizationUrl;
        this.stateParameter = stateParameter;
        this.expiresAt = expiresAt;
    }
}

/**
 * Exception thrown when token refresh fails and re-authorization is needed
 */
export class OAuthReauthorizationRequiredError extends Error {
    /** Error code for identification */
    public readonly code = 'OAUTH_REAUTHORIZATION_REQUIRED';
    /** Reason for requiring re-authorization */
    public readonly reason: string;
    /** Original error that caused the failure */
    public readonly originalError?: string;
    /** Authorization URL if a new flow was initiated */
    public readonly authorizationUrl?: string;
    /** State parameter for tracking the authorization flow */
    public readonly stateParameter?: string;

    constructor(
        message: string,
        reason: string,
        originalError?: string,
        authorizationUrl?: string,
        stateParameter?: string
    ) {
        super(message);
        this.name = 'OAuthReauthorizationRequiredError';
        this.reason = reason;
        this.originalError = originalError;
        this.authorizationUrl = authorizationUrl;
        this.stateParameter = stateParameter;
    }
}
