/**
 * @fileoverview OAuth 2.1 module for MCP server authentication
 *
 * Provides OAuth 2.1 Authorization Code flow with PKCE and Dynamic Client
 * Registration (DCR) for authenticating with OAuth-protected MCP servers.
 *
 * Features:
 * - RFC 8414 Authorization Server Metadata discovery
 * - RFC 7591 Dynamic Client Registration
 * - PKCE (S256 method only) per OAuth 2.1 requirements
 * - Automatic token refresh with concurrent refresh protection
 * - Integration with MJ CredentialEngine for secure token storage
 *
 * @module @memberjunction/ai-mcp-client/oauth
 *
 * @example
 * ```typescript
 * import { OAuthManager } from '@memberjunction/ai-mcp-client/oauth';
 *
 * const oauth = new OAuthManager();
 *
 * // Check for valid token or initiate flow
 * const result = await oauth.getAccessToken(connectionId, serverConfig, contextUser);
 * if (result.requiresAuthorization) {
 *     // Redirect user to result.authorizationUrl
 * } else {
 *     // Use result.accessToken for API calls
 * }
 * ```
 */

// Core classes
export { PKCEGenerator } from './PKCEGenerator.js';
export { AuthServerDiscovery } from './AuthServerDiscovery.js';
export { ClientRegistration } from './ClientRegistration.js';
export { TokenManager } from './TokenManager.js';
export { OAuthManager } from './OAuthManager.js';
export { OAuthErrorMessages } from './ErrorMessages.js';
export { OAuthAuditLogger, getOAuthAuditLogger } from './OAuthAuditLogger.js';

// Type definitions
export type {
    // RFC 8414 metadata types
    AuthServerMetadata,
    CachedAuthServerMetadata,

    // RFC 7591 DCR types
    DCRRequest,
    DCRResponse,

    // PKCE types
    PKCEChallenge,

    // Token types
    OAuthTokenResponse,
    OAuthTokenSet,
    OAuth2AuthCodeCredentialValues,

    // Authorization state types
    OAuthAuthorizationState,
    OAuthAuthorizationStatus,

    // Client registration types
    OAuthClientRegistration,
    OAuthClientRegistrationStatus,

    // Error types
    OAuthErrorResponse,

    // Result types
    InitiateAuthorizationResult,
    CompleteAuthorizationResult,
    TokenRefreshResult,
    OAuthConnectionStatus,

    // Event types
    OAuthEventType,
    OAuthEventData,

    // Configuration types
    MCPServerOAuthConfig
} from './types.js';

// Audit logging types
export type {
    AuthorizationInitiatedDetails,
    AuthorizationCompletedDetails,
    AuthorizationFailedDetails,
    TokenRefreshDetails,
    TokenRefreshFailedDetails,
    CredentialsRevokedDetails
} from './OAuthAuditLogger.js';

// Error classes
export {
    OAuthAuthorizationRequiredError,
    OAuthReauthorizationRequiredError
} from './types.js';

